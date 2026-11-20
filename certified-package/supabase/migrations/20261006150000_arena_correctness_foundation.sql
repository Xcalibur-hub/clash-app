-- Arena Phase 0 correctness foundation.
-- Shared cache entries are canonical, write races serialize on their parent row,
-- and the client gets a bounded visibility probe for already-rendered messages.

-- Serialize the count-and-insert decision for each (actor, action). Advisory-lock
-- hash collisions can only reduce concurrency; they cannot let an extra event in.
create or replace function public.assert_rate_limit(
  p_actor  text,
  p_action text,
  p_limit  integer,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_actor is null or p_action is null or p_limit is null or p_window is null
     or p_limit < 1 or p_window <= interval '0 seconds' then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor || chr(31) || p_action, 0)
  );

  delete from public.rate_limit_events
   where actor_id = p_actor
     and action = p_action
     and occurred_at < now() - p_window;

  select count(*) into v_count
    from public.rate_limit_events
   where actor_id = p_actor
     and action = p_action
     and occurred_at >= now() - p_window;

  if v_count >= p_limit then
    raise exception 'rate limit exceeded: %', p_action
      using errcode = 'P0001', hint = 'slow down and try again later';
  end if;

  insert into public.rate_limit_events (actor_id, action, occurred_at)
  values (p_actor, p_action, now());
end;
$$;

revoke execute on function public.assert_rate_limit(text, text, integer, interval)
  from public, anon, authenticated;
grant execute on function public.assert_rate_limit(text, text, integer, interval)
  to service_role;

-- Compute one viewer-independent payload. Per-viewer block/mute filtering happens
-- only after this canonical value has been read from the shared cache.
create or replace function public.compute_arena_room_pulse(p_room_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room   public.arena_rooms%rowtype;
  v_result public.arena_room_results%rowtype;
  v_has_result boolean := false;
  v_leaders jsonb := '[]'::jsonb;
  v_top jsonb;
  v_evidence jsonb;
  v_rebuttal jsonb;
  v_rising jsonb;
  v_crowd jsonb;
begin
  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;

  if v_room.status = 'SETTLED' then
    select * into v_result from public.arena_room_results where room_id = p_room_id;
    v_has_result := found;
  end if;

  if v_has_result and v_result.best_argument_message_id is not null then
    select jsonb_build_object(
      'category', 'TOP_ARGUMENT', 'label', 'Top Argument',
      'messageId', m.id, 'evidenceId', null,
      'author', public.arena_profile_json(m.author_id),
      'score', coalesce((
        select count(*)::integer from public.arena_room_message_reactions rc
         where rc.message_id = m.id and rc.profile_id is distinct from m.author_id
      ), 0),
      'preview', left(coalesce(m.body, ''), 120)
    ) into v_top
      from public.arena_room_messages m
     where m.id = v_result.best_argument_message_id
       and m.hidden_at is null;
  end if;

  if v_top is null then
    select jsonb_build_object(
      'category', 'TOP_ARGUMENT', 'label', 'Top Argument',
      'messageId', x.id, 'evidenceId', null,
      'author', public.arena_profile_json(x.author_id),
      'score', x.score, 'preview', left(coalesce(x.body, ''), 120)
    ) into v_top
      from (
        select m.id, m.author_id, m.body, m.created_at,
               (select count(*)::integer
                  from public.arena_room_message_reactions rc
                 where rc.message_id = m.id
                   and rc.profile_id is distinct from m.author_id) as score
          from public.arena_room_messages m
         where m.room_id = p_room_id
           and m.hidden_at is null
           and m.parent_message_id is null
           and m.kind <> 'system'
      ) x
     where x.score >= 3
     order by x.score desc, x.created_at desc, x.id desc
     limit 1;
  end if;
  if v_top is not null then
    v_leaders := v_leaders || jsonb_build_array(v_top);
  end if;

  select jsonb_build_object(
    'category', 'BEST_EVIDENCE', 'label', 'Best Evidence',
    'messageId', e.message_id, 'evidenceId', e.id,
    'author', public.arena_profile_json(e.author_id),
    'score', e.useful_count, 'preview', left(coalesce(e.title, ''), 120)
  ) into v_evidence
    from public.arena_room_evidence e
   where e.room_id = p_room_id
     and e.hidden_at is null
     and e.useful_count >= 1
   order by e.useful_count desc, e.created_at desc, e.id desc
   limit 1;
  if v_evidence is not null then
    v_leaders := v_leaders || jsonb_build_array(v_evidence);
  end if;

  select jsonb_build_object(
    'category', 'BEST_REBUTTAL', 'label', 'Best Rebuttal',
    'messageId', x.id, 'evidenceId', null,
    'author', public.arena_profile_json(x.author_id),
    'score', x.score, 'preview', left(coalesce(x.body, ''), 120)
  ) into v_rebuttal
    from (
      select m.id, m.author_id, m.body, m.created_at,
             (select count(*)::integer
                from public.arena_room_message_reactions rc
               where rc.message_id = m.id
                 and rc.profile_id is distinct from m.author_id) as score
        from public.arena_room_messages m
       where m.room_id = p_room_id
         and m.hidden_at is null
         and m.parent_message_id is not null
         and m.kind <> 'system'
    ) x
   where x.score >= 2
   order by x.score desc, x.created_at desc, x.id desc
   limit 1;
  if v_rebuttal is not null then
    v_leaders := v_leaders || jsonb_build_array(v_rebuttal);
  end if;

  select jsonb_build_object(
    'category', 'FAST_RISING', 'label', 'Fast Rising',
    'messageId', x.id, 'evidenceId', null,
    'author', public.arena_profile_json(x.author_id),
    'score', x.rise, 'preview', left(coalesce(x.body, ''), 120)
  ) into v_rising
    from (
      select s.id, s.author_id, s.body, s.created_at,
             floor((s.rx * 60)::numeric / s.age_s)::integer as rise,
             s.rx
        from (
          select m.id, m.author_id, m.body, m.created_at,
                 (select count(*)::integer
                    from public.arena_room_message_reactions rc
                   where rc.message_id = m.id
                     and rc.profile_id is distinct from m.author_id) as rx,
                 greatest(30, extract(epoch from (now() - m.created_at))::integer) as age_s
            from public.arena_room_messages m
           where m.room_id = p_room_id
             and m.hidden_at is null
             and m.kind <> 'system'
             and m.created_at <= now() - interval '30 seconds'
             and m.created_at >= now() - interval '30 minutes'
        ) s
    ) x
   where x.rx >= 2 and x.rise >= 2
   order by x.rise desc, x.created_at desc, x.id desc
   limit 1;
  if v_rising is not null then
    v_leaders := v_leaders || jsonb_build_array(v_rising);
  end if;

  if v_has_result and v_result.best_argument_author_id is not null then
    select jsonb_build_object(
      'category', 'CROWD_FAVORITE', 'label', 'Crowd Favorite',
      'messageId', v_result.best_argument_message_id, 'evidenceId', null,
      'author', public.arena_profile_json(v_result.best_argument_author_id),
      'score', coalesce((v_top ->> 'score')::integer, 0),
      'preview', left(coalesce((
        select m.body from public.arena_room_messages m
         where m.id = v_result.best_argument_message_id and m.hidden_at is null
      ), ''), 120)
    ) into v_crowd;
    if v_crowd is not null then
      v_leaders := v_leaders || jsonb_build_array(v_crowd);
    end if;
  end if;

  return jsonb_build_object(
    'roomId', p_room_id,
    'status', v_room.status,
    'leaders', v_leaders,
    'generatedAt', now()
  );
end;
$$;

revoke execute on function public.compute_arena_room_pulse(text)
  from public, anon, authenticated;
grant execute on function public.compute_arena_room_pulse(text) to service_role;

create or replace function public.filter_arena_room_pulse(
  p_payload jsonb,
  p_viewer text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_set(
    coalesce(p_payload, '{}'::jsonb),
    '{leaders}',
    coalesce((
      select jsonb_agg(entry.item order by entry.ordinality)
        from jsonb_array_elements(coalesce(p_payload -> 'leaders', '[]'::jsonb))
             with ordinality as entry(item, ordinality)
       where nullif(entry.item #>> '{author,id}', '') is null
          or not public.arena_actor_hidden(p_viewer, entry.item #>> '{author,id}')
    ), '[]'::jsonb),
    true
  );
$$;

revoke execute on function public.filter_arena_room_pulse(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.filter_arena_room_pulse(jsonb, text) to service_role;

create or replace function public.get_arena_room_pulse(p_room_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_cached public.arena_room_pulse_cache%rowtype;
  v_payload jsonb;
  v_lock_key bigint;
begin
  if v_viewer is null then
    raise exception 'sign in to read pulse' using errcode = '42501';
  end if;
  if p_room_id is null or btrim(p_room_id) = '' then
    raise exception 'room id is required' using errcode = 'P0003';
  end if;
  if not public.arena_is_room_member(p_room_id) and not public.is_staff() then
    raise exception 'join the room to read pulse' using errcode = '42501';
  end if;

  select * into v_cached
    from public.arena_room_pulse_cache
   where room_id = p_room_id;
  if found and v_cached.generated_at > now() - interval '12 seconds' then
    return case when public.is_staff() then v_cached.payload
                else public.filter_arena_room_pulse(v_cached.payload, v_viewer) end;
  end if;

  v_lock_key := ('x' || substr(md5(p_room_id), 1, 15))::bit(64)::bigint;
  if not pg_catalog.pg_try_advisory_xact_lock(v_lock_key) and found then
    return case when public.is_staff() then v_cached.payload
                else public.filter_arena_room_pulse(v_cached.payload, v_viewer) end;
  end if;

  select * into v_cached
    from public.arena_room_pulse_cache
   where room_id = p_room_id;
  if found and v_cached.generated_at > now() - interval '12 seconds' then
    return case when public.is_staff() then v_cached.payload
                else public.filter_arena_room_pulse(v_cached.payload, v_viewer) end;
  end if;

  v_payload := public.compute_arena_room_pulse(p_room_id);
  insert into public.arena_room_pulse_cache (room_id, payload, generated_at)
  values (p_room_id, v_payload, now())
  on conflict (room_id) do update
    set payload = excluded.payload, generated_at = excluded.generated_at;

  return case when public.is_staff() then v_payload
              else public.filter_arena_room_pulse(v_payload, v_viewer) end;
end;
$$;

revoke execute on function public.get_arena_room_pulse(text) from public, anon;
grant execute on function public.get_arena_room_pulse(text) to authenticated;

-- Clients must use the filtering RPC and cannot read the canonical cache table.
drop policy if exists "arena pulse cache readable by members" on public.arena_room_pulse_cache;
revoke all on table public.arena_room_pulse_cache from public, anon, authenticated;
grant all on table public.arena_room_pulse_cache to service_role;
delete from public.arena_room_pulse_cache;

create or replace function public.get_arena_room_message_visibility(
  p_room_id text,
  p_message_ids text[]
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
begin
  if v_viewer is null then
    raise exception 'sign in to read the room' using errcode = '42501';
  end if;
  if not public.arena_is_room_member(p_room_id) then
    raise exception 'join the room to read it' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_message_ids), 0) > 100 then
    raise exception 'at most 100 messages may be checked' using errcode = '22023';
  end if;

  return coalesce(array(
    select m.id
      from public.arena_room_messages m
     where m.room_id = p_room_id
       and m.id = any(coalesce(p_message_ids, array[]::text[]))
       and m.hidden_at is null
       and not public.arena_actor_hidden(v_viewer, m.author_id)
     order by m.id
  ), array[]::text[]);
end;
$$;

revoke execute on function public.get_arena_room_message_visibility(text, text[])
  from public, anon;
grant execute on function public.get_arena_room_message_visibility(text, text[])
  to authenticated;

-- Votes and settlement all lock the same room row. Whichever transaction gets
-- the lock first establishes the boundary: an accepted vote commits before the
-- tally, while a settled/expired room is re-read and rejects the vote.
create or replace function public.submit_arena_side_vote(
  p_room_id text,
  p_side    public.arena_winning_side
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_room public.arena_rooms%rowtype;
  v_part public.arena_room_participants%rowtype;
begin
  if v_user is null then raise exception 'sign in to vote' using errcode = '42501'; end if;
  if p_side is null or p_side = 'DRAW' then
    raise exception 'vote AGREE or DISAGREE' using errcode = 'P0003';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id for update;
  if not found then raise exception 'room does not exist' using errcode = 'P0002'; end if;
  if v_room.status <> 'JUDGING' or v_room.closes_at <= now() then
    raise exception 'the room is not in judging' using errcode = 'P0003';
  end if;

  select * into v_part from public.arena_room_participants
   where room_id = p_room_id and profile_id = v_user;
  if not found then raise exception 'join the room to vote' using errcode = '42501'; end if;
  if v_part.role <> 'debater' then
    raise exception 'only debaters may vote' using errcode = '42501';
  end if;
  if exists (select 1 from public.arena_room_side_votes
              where room_id = p_room_id and profile_id = v_user) then
    raise exception 'side vote already recorded' using errcode = 'P0006';
  end if;

  insert into public.arena_room_side_votes (room_id, profile_id, side)
  values (p_room_id, v_user, p_side);
  return jsonb_build_object('roomId', p_room_id, 'side', p_side, 'recorded', true);
end;
$$;

create or replace function public.submit_arena_argument_vote(
  p_room_id text,
  p_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_room public.arena_rooms%rowtype;
  v_part public.arena_room_participants%rowtype;
  v_msg public.arena_room_messages%rowtype;
begin
  if v_user is null then raise exception 'sign in to vote' using errcode = '42501'; end if;

  select * into v_room from public.arena_rooms where id = p_room_id for update;
  if not found then raise exception 'room does not exist' using errcode = 'P0002'; end if;
  if v_room.status <> 'JUDGING' or v_room.closes_at <= now() then
    raise exception 'the room is not in judging' using errcode = 'P0003';
  end if;

  select * into v_part from public.arena_room_participants
   where room_id = p_room_id and profile_id = v_user;
  if not found then raise exception 'join the room to vote' using errcode = '42501'; end if;
  if v_part.role <> 'debater' then
    raise exception 'only debaters may vote' using errcode = '42501';
  end if;

  select * into v_msg from public.arena_room_messages where id = p_message_id;
  if not found or v_msg.room_id <> p_room_id then
    raise exception 'argument is not in this room' using errcode = 'P0002';
  end if;
  if v_msg.hidden_at is not null then
    raise exception 'argument is not available' using errcode = 'P0003';
  end if;
  if v_msg.kind = 'system' then
    raise exception 'a system notice is not an argument' using errcode = 'P0003';
  end if;
  if v_msg.author_id = v_user then
    raise exception 'you cannot vote for your own argument' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.arena_room_argument_votes
              where room_id = p_room_id and profile_id = v_user) then
    raise exception 'best argument vote already recorded' using errcode = 'P0006';
  end if;

  insert into public.arena_room_argument_votes (room_id, profile_id, message_id)
  values (p_room_id, v_user, p_message_id);
  return jsonb_build_object('roomId', p_room_id, 'messageId', p_message_id, 'recorded', true);
end;
$$;

revoke execute on function public.submit_arena_side_vote(text, public.arena_winning_side)
  from public, anon;
grant execute on function public.submit_arena_side_vote(text, public.arena_winning_side)
  to authenticated;
revoke execute on function public.submit_arena_argument_vote(text, text)
  from public, anon;
grant execute on function public.submit_arena_argument_vote(text, text)
  to authenticated;

-- Legacy Clash ballots share the same parent-row serialization rule.
create or replace function public.submit_judgement(p_clash_id text, p_side public.clash_side)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_juror text := public.my_profile_id();
  v_clash record;
begin
  if v_juror is null then
    raise exception 'sign in to judge' using errcode = '42501';
  end if;

  select c.take_id, c.challenger_id, c.status, c.closes_at, t.author_id
    into v_clash
    from public.clashes c join public.takes t on t.id = c.take_id
   where c.id = p_clash_id
   for update of c;

  if v_clash.take_id is null then raise exception 'clash does not exist' using errcode = 'P0002'; end if;
  if v_clash.status <> 'open' then raise exception 'clash is not open' using errcode = 'P0003'; end if;
  if v_clash.closes_at <= now() then raise exception 'clash has closed' using errcode = 'P0004'; end if;
  if v_juror = v_clash.challenger_id or v_juror = v_clash.author_id then
    raise exception 'cannot judge your own clash' using errcode = 'P0005';
  end if;

  insert into public.judgements (clash_id, juror_id, side)
  values (p_clash_id, v_juror, p_side)
  on conflict (clash_id, juror_id) do nothing;
end;
$$;

revoke execute on function public.submit_judgement(text, public.clash_side)
  from public, anon;
grant execute on function public.submit_judgement(text, public.clash_side)
  to authenticated;
