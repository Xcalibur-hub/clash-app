-- Phase 13.9 — Room Pulse + live-room scale helpers.
-- Adds replyCount on message payloads, gap-recovery cursor (p_after),
-- block-aware presence, and get_arena_room_pulse (deterministic leaders).

-- ── 1. Message payload: replyCount (visible children only) ───────────────────
create or replace function public.arena_message_payload(
  p_message      public.arena_room_messages,
  p_viewer       text,
  p_reveal_votes boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_message.id,
    'roomId', p_message.room_id,
    'kind', p_message.kind,
    'body', p_message.body,
    'parentMessageId', p_message.parent_message_id,
    'createdAt', p_message.created_at,
    'mediaUrl', p_message.media_url,
    'mediaKind', p_message.media_kind,
    'gifProvider', p_message.gif_provider,
    'gifExternalId', p_message.gif_external_id,
    'isOwn', p_viewer is not null and p_message.author_id = p_viewer,
    'author', public.arena_profile_json(p_message.author_id),
    'replyCount', (
      select count(*)::integer
        from public.arena_room_messages c
       where c.parent_message_id = p_message.id
         and c.hidden_at is null
         and (
           p_viewer is null
           or not public.arena_actor_hidden(p_viewer, c.author_id)
         )
    ),
    'reactions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'emoji', x.emoji,
               'count', x.n,
               'viewerReacted', x.mine
             ) order by x.n desc, x.emoji asc), '[]'::jsonb)
        from (
          select rc.emoji,
                 count(*)::integer as n,
                 coalesce(bool_or(p_viewer is not null and rc.profile_id = p_viewer), false) as mine
            from public.arena_room_message_reactions rc
           where rc.message_id = p_message.id
           group by rc.emoji
        ) x
    ),
    'argumentVotes', case
      when not coalesce(p_reveal_votes, false) then null
      else (
        select count(*)::integer from public.arena_room_argument_votes v
         where v.message_id = p_message.id
      )
    end
  );
$$;

-- ── 2. list_arena_room_messages: optional p_after for gap recovery ───────────
drop function if exists public.list_arena_room_messages(text, timestamptz, integer);

create or replace function public.list_arena_room_messages(
  p_room_id text,
  p_before  timestamptz default null,
  p_limit   integer default 50,
  p_after   timestamptz default null
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_room   public.arena_rooms%rowtype;
  v_limit  integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_reveal boolean;
  r public.arena_room_messages%rowtype;
begin
  if v_viewer is null then
    raise exception 'sign in to read the room' using errcode = '42501';
  end if;
  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if not public.arena_is_room_member(p_room_id) then
    raise exception 'join the room to read it' using errcode = '42501';
  end if;

  v_reveal := v_room.status = 'SETTLED';

  for r in
    select m.*
      from public.arena_room_messages m
     where m.room_id = p_room_id
       and m.hidden_at is null
       and (p_before is null or m.created_at < p_before)
       and (p_after is null or m.created_at > p_after)
       and not public.arena_actor_hidden(v_viewer, m.author_id)
     order by m.created_at desc, m.id desc
     limit v_limit
  loop
    return next public.arena_message_payload(r, v_viewer, v_reveal);
  end loop;
end;
$$;

revoke execute on function public.list_arena_room_messages(text, timestamptz, integer, timestamptz) from public, anon;
grant execute on function public.list_arena_room_messages(text, timestamptz, integer, timestamptz) to authenticated;

comment on function public.list_arena_room_messages(text, timestamptz, integer, timestamptz) is
  'Newest-first page. p_before pages older; p_after gap-fetches newer. Members only.';

-- ── 3. Presence: hide blocked/muted actors ───────────────────────────────────
create or replace function public.list_arena_room_presence(
  p_room_id text,
  p_limit   integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit  integer := greatest(1, least(coalesce(p_limit, 12), 24));
  v_room   public.arena_rooms%rowtype;
begin
  if p_room_id is null or btrim(p_room_id) = '' then
    raise exception 'room id is required' using errcode = 'P0003';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;

  if not public.arena_is_room_member(p_room_id) and not public.is_staff() then
    raise exception 'join the room to see who is here' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        public.arena_profile_json(part.profile_id)
          || jsonb_build_object(
            'isViewer', v_viewer is not null and part.profile_id = v_viewer
          )
        order by
          case when v_viewer is not null and part.profile_id = v_viewer then 0 else 1 end,
          part.joined_at asc
      )
      from (
        select part.profile_id, part.joined_at
          from public.arena_room_participants part
         where part.room_id = p_room_id
           and (
             v_viewer is null
             or part.profile_id = v_viewer
             or not public.arena_actor_hidden(v_viewer, part.profile_id)
           )
         order by part.joined_at asc
         limit v_limit
      ) part
    ),
    '[]'::jsonb
  );
end;
$$;

-- ── 4. Room Pulse RPC ────────────────────────────────────────────────────────
-- Non-self reaction score helper (inline in queries).
-- Categories omitted when no qualifying candidate.

create or replace function public.get_arena_room_pulse(
  p_room_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
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
  if v_viewer is null then
    raise exception 'sign in to read pulse' using errcode = '42501';
  end if;
  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if not public.arena_is_room_member(p_room_id) and not public.is_staff() then
    raise exception 'join the room to read pulse' using errcode = '42501';
  end if;

  if v_room.status = 'SETTLED' then
    select * into v_result from public.arena_room_results where room_id = p_room_id;
    v_has_result := found;
  end if;

  -- TOP ARGUMENT: settled best first, else strongest root by non-self reactions (>=3).
  if v_has_result and v_result.best_argument_message_id is not null then
    select jsonb_build_object(
      'category', 'TOP_ARGUMENT',
      'label', 'Top Argument',
      'messageId', m.id,
      'evidenceId', null,
      'author', public.arena_profile_json(m.author_id),
      'score', coalesce((
        select count(*)::integer from public.arena_room_message_reactions rc
         where rc.message_id = m.id and rc.profile_id is distinct from m.author_id
      ), 0),
      'preview', left(coalesce(m.body, ''), 120)
    ) into v_top
      from public.arena_room_messages m
     where m.id = v_result.best_argument_message_id
       and m.hidden_at is null
       and not public.arena_actor_hidden(v_viewer, m.author_id);
  end if;

  if v_top is null then
    select jsonb_build_object(
      'category', 'TOP_ARGUMENT',
      'label', 'Top Argument',
      'messageId', x.id,
      'evidenceId', null,
      'author', public.arena_profile_json(x.author_id),
      'score', x.score,
      'preview', left(coalesce(x.body, ''), 120)
    ) into v_top
      from (
        select m.id, m.author_id, m.body, m.created_at,
               (
                 select count(*)::integer from public.arena_room_message_reactions rc
                  where rc.message_id = m.id and rc.profile_id is distinct from m.author_id
               ) as score
          from public.arena_room_messages m
         where m.room_id = p_room_id
           and m.hidden_at is null
           and m.parent_message_id is null
           and m.kind <> 'system'
           and not public.arena_actor_hidden(v_viewer, m.author_id)
      ) x
     where x.score >= 3
     order by x.score desc, x.created_at desc, x.id desc
     limit 1;
  end if;
  if v_top is not null then
    v_leaders := v_leaders || jsonb_build_array(v_top);
  end if;

  -- BEST EVIDENCE: highest useful_count (>=1). Self-marks already impossible.
  select jsonb_build_object(
    'category', 'BEST_EVIDENCE',
    'label', 'Best Evidence',
    'messageId', e.message_id,
    'evidenceId', e.id,
    'author', public.arena_profile_json(e.author_id),
    'score', e.useful_count,
    'preview', left(coalesce(e.title, ''), 120)
  ) into v_evidence
    from public.arena_room_evidence e
   where e.room_id = p_room_id
     and e.hidden_at is null
     and e.useful_count >= 1
     and not public.arena_actor_hidden(v_viewer, e.author_id)
   order by e.useful_count desc, e.created_at desc, e.id desc
   limit 1;
  if v_evidence is not null then
    v_leaders := v_leaders || jsonb_build_array(v_evidence);
  end if;

  -- BEST REBUTTAL: strongest reply by non-self reactions (>=2).
  select jsonb_build_object(
    'category', 'BEST_REBUTTAL',
    'label', 'Best Rebuttal',
    'messageId', x.id,
    'evidenceId', null,
    'author', public.arena_profile_json(x.author_id),
    'score', x.score,
    'preview', left(coalesce(x.body, ''), 120)
  ) into v_rebuttal
    from (
      select m.id, m.author_id, m.body, m.created_at,
             (
               select count(*)::integer from public.arena_room_message_reactions rc
                where rc.message_id = m.id and rc.profile_id is distinct from m.author_id
             ) as score
        from public.arena_room_messages m
       where m.room_id = p_room_id
         and m.hidden_at is null
         and m.parent_message_id is not null
         and m.kind <> 'system'
         and not public.arena_actor_hidden(v_viewer, m.author_id)
    ) x
   where x.score >= 2
   order by x.score desc, x.created_at desc, x.id desc
   limit 1;
  if v_rebuttal is not null then
    v_leaders := v_leaders || jsonb_build_array(v_rebuttal);
  end if;

  -- FAST RISING: age 30s–30m; score = floor(reactions*60/ageSeconds); need score>=2.
  select jsonb_build_object(
    'category', 'FAST_RISING',
    'label', 'Fast Rising',
    'messageId', x.id,
    'evidenceId', null,
    'author', public.arena_profile_json(x.author_id),
    'score', x.rise,
    'preview', left(coalesce(x.body, ''), 120)
  ) into v_rising
    from (
      select m.id, m.author_id, m.body, m.created_at,
             (
               select count(*)::integer from public.arena_room_message_reactions rc
                where rc.message_id = m.id and rc.profile_id is distinct from m.author_id
             ) as rx,
             greatest(30, extract(epoch from (now() - m.created_at))::integer) as age_s
        from public.arena_room_messages m
       where m.room_id = p_room_id
         and m.hidden_at is null
         and m.kind <> 'system'
         and m.created_at <= now() - interval '30 seconds'
         and m.created_at >= now() - interval '30 minutes'
         and not public.arena_actor_hidden(v_viewer, m.author_id)
    ) s,
    lateral (
      select s.id, s.author_id, s.body, s.created_at,
             floor((s.rx * 60)::numeric / s.age_s)::integer as rise,
             s.rx
    ) x
   where x.rx >= 2 and x.rise >= 2
   order by x.rise desc, x.created_at desc, x.id desc
   limit 1;
  if v_rising is not null then
    v_leaders := v_leaders || jsonb_build_array(v_rising);
  end if;

  -- CROWD FAVORITE (settled only): best argument author when result exists.
  if v_has_result
     and v_result.best_argument_author_id is not null
     and not public.arena_actor_hidden(v_viewer, v_result.best_argument_author_id)
  then
    select jsonb_build_object(
      'category', 'CROWD_FAVORITE',
      'label', 'Crowd Favorite',
      'messageId', v_result.best_argument_message_id,
      'evidenceId', null,
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

revoke execute on function public.get_arena_room_pulse(text) from public, anon;
grant execute on function public.get_arena_room_pulse(text) to authenticated;

comment on function public.get_arena_room_pulse(text) is
  'Deterministic Room Pulse leaders. Omits empty categories. No stance fields.';

-- Helpful index for pulse / reply counts (parent lookups already indexed).
create index if not exists arena_room_message_reactions_message_profile_idx
  on public.arena_room_message_reactions (message_id, profile_id);
