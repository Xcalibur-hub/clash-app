-- Phase 1: clashes owns competition; arena_rooms owns its live execution surface.
-- A dedicated existing topic clock per duel lets the existing scheduler operate
-- without a new lifecycle engine. No Challenge or support state is introduced.
alter table public.clashes add column duel_key uuid;
alter table public.clashes add constraint clashes_duel_key_unique unique (duel_key);
alter table public.clashes add constraint clashes_duel_standard
  check (duel_key is null or mode = 'STANDARD');
create unique index clashes_active_duel_pair
  on public.clashes (take_id, challenger_id)
  where duel_key is not null and status = 'open';

alter table public.arena_rooms add column clash_id text
  references public.clashes(id) on delete cascade;
alter table public.arena_rooms add constraint arena_rooms_clash_unique unique (clash_id);
alter table public.arena_rooms drop constraint arena_rooms_capacity_check;
alter table public.arena_rooms add constraint arena_rooms_mode_capacity
  check ((clash_id is null and capacity between 20 and 50)
      or (clash_id is not null and capacity = 2 and participant_count = 2));
create unique index arena_rooms_duel_topic_unique on public.arena_rooms(topic_id)
  where clash_id is not null;

-- Freeze competitive identity, including the Take-author relationship reused as A.
create function public.guard_arena_duel_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'clashes' then
    if old.duel_key is not null and
       (new.duel_key is distinct from old.duel_key or new.take_id <> old.take_id
        or new.challenger_id <> old.challenger_id or new.mode <> old.mode) then
      raise exception 'duel fighter identity is immutable' using errcode = '23514';
    end if;
  elsif tg_table_name = 'arena_rooms' then
    if old.clash_id is distinct from new.clash_id or
       (old.clash_id is not null and new.topic_id <> old.topic_id) then
      raise exception 'canonical duel room link is immutable' using errcode = '23514';
    end if;
  elsif tg_table_name = 'takes' then
    if new.author_id <> old.author_id and exists (
      select 1 from public.clashes where take_id = old.id and duel_key is not null
    ) then
      raise exception 'duel Fighter A is immutable' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger arena_duel_clash_identity before update on public.clashes
  for each row execute function public.guard_arena_duel_identity();
create trigger arena_duel_room_identity before update on public.arena_rooms
  for each row execute function public.guard_arena_duel_identity();
create trigger arena_duel_take_identity before update of author_id on public.takes
  for each row execute function public.guard_arena_duel_identity();

create function public.assert_arena_duel_integrity(p_clash_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.clashes%rowtype;
  r public.arena_rooms%rowtype;
  t public.arena_daily_topics%rowtype;
  a text;
begin
  select * into c from public.clashes where id = p_clash_id;
  if not found then return; end if; -- Cascading deletion has no surviving orphan.
  select * into r from public.arena_rooms where clash_id = c.id;
  if c.duel_key is null then
    if found then raise exception 'only duel Clashes may own a live room' using errcode = '23514'; end if;
    return;
  end if;
  if r.id is null then raise exception 'duel requires its canonical room' using errcode = '23514'; end if;
  select author_id into a from public.takes where id = c.take_id;
  select * into t from public.arena_daily_topics where id = r.topic_id;
  if a = c.challenger_id or r.opens_at <> c.opens_at or r.closes_at <> c.closes_at
     or t.opens_at <> c.opens_at or t.closes_at <> c.closes_at then
    raise exception 'duel identity or clock mismatch' using errcode = '23514';
  end if;
  if exists (select 1 from public.arena_rooms where topic_id = r.topic_id and id <> r.id) then
    raise exception 'duel topic cannot contain group rooms' using errcode = '23514';
  end if;
  if (select count(*) from public.arena_room_participants
       where room_id = r.id and role = 'debater' and profile_id in (a, c.challenger_id)) <> 2
     or exists (select 1 from public.arena_room_participants
                 where room_id = r.id and (topic_id <> r.topic_id
                    or (role = 'debater' and profile_id not in (a, c.challenger_id))
                    or (role <> 'debater' and profile_id in (a, c.challenger_id)))) then
    raise exception 'duel requires exactly its two canonical fighters' using errcode = '23514';
  end if;
  if (c.status = 'settled' and (r.status <> 'SETTLED' or not exists
        (select 1 from public.verdicts where clash_id = c.id)))
     or (c.status = 'cancelled' and r.status <> 'CANCELLED')
     or (c.status = 'open' and r.status in ('SETTLED', 'CANCELLED')) then
    raise exception 'duel outcome must follow the Clash verdict' using errcode = '23514';
  end if;
  if c.status <> 'settled' and exists (select 1 from public.verdicts where clash_id = c.id) then
    raise exception 'only settled duels may have a verdict' using errcode = '23514';
  end if;
end;
$$;

-- Deferred checks validate the completed transaction, allowing creation of all
-- three existing entities atomically and rejecting partial/privileged mutations.
create function public.check_arena_duel_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id text; v_row jsonb; x record;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name = 'clashes' then
    perform public.assert_arena_duel_integrity(v_row ->> 'id');
  elsif tg_table_name = 'verdicts' then
    perform public.assert_arena_duel_integrity(v_row ->> 'clash_id');
  elsif tg_table_name in ('arena_rooms', 'arena_room_participants') then
    if tg_table_name = 'arena_rooms' then
      perform public.assert_arena_duel_integrity(v_row ->> 'clash_id');
    end if;
    for x in select clash_id from public.arena_rooms
      where topic_id = v_row ->> 'topic_id' and clash_id is not null
    loop perform public.assert_arena_duel_integrity(x.clash_id); end loop;
    if tg_op = 'UPDATE' then
      for x in select clash_id from public.arena_rooms
        where topic_id = to_jsonb(old) ->> 'topic_id' and clash_id is not null
      loop perform public.assert_arena_duel_integrity(x.clash_id); end loop;
    end if;
  elsif tg_table_name = 'arena_daily_topics' then
    for x in select clash_id from public.arena_rooms
      where topic_id = v_row ->> 'id' and clash_id is not null
    loop perform public.assert_arena_duel_integrity(x.clash_id); end loop;
  end if;
  return null;
end;
$$;
create constraint trigger arena_duel_complete_clash after insert or update or delete on public.clashes
  deferrable initially deferred for each row execute function public.check_arena_duel_integrity();
create constraint trigger arena_duel_complete_room after insert or update or delete on public.arena_rooms
  deferrable initially deferred for each row execute function public.check_arena_duel_integrity();
create constraint trigger arena_duel_complete_participants after insert or update or delete on public.arena_room_participants
  deferrable initially deferred for each row execute function public.check_arena_duel_integrity();
create constraint trigger arena_duel_complete_clock after update on public.arena_daily_topics
  deferrable initially deferred for each row execute function public.check_arena_duel_integrity();
create constraint trigger arena_duel_complete_verdict after insert or update or delete on public.verdicts
  deferrable initially deferred for each row execute function public.check_arena_duel_integrity();

create function public.guard_arena_duel_participant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_a text; v_b text; v_topic text;
begin
  select t.author_id, c.challenger_id, r.topic_id into v_a, v_b, v_topic
    from public.arena_rooms r join public.clashes c on c.id = r.clash_id
    join public.takes t on t.id = c.take_id where r.id = new.room_id;
  if found then
    if new.topic_id <> v_topic or
       (new.profile_id in (v_a, v_b) and new.role <> 'debater') or
       (new.profile_id not in (v_a, v_b) and new.role <> 'spectator') then
      raise exception 'only canonical duel fighters may debate' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger arena_duel_participant_guard before insert or update on public.arena_room_participants
  for each row execute function public.guard_arena_duel_participant();

-- Every content insertion path, including media reshares, reaches these guards.
-- The Clash row lock also serializes publishing with settlement. Moderation
-- updates stay available; only identity-changing updates are re-authorized.
create function public.guard_arena_duel_content()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_clash text; v_a text; c public.clashes%rowtype; v_judge timestamptz;
begin
  if tg_op = 'UPDATE' and new.room_id = old.room_id and new.author_id = old.author_id then return new; end if;
  -- System notices have no competitive author; only trusted server code can
  -- insert them (client INSERT and public publishing of kind=system are denied).
  if to_jsonb(new) ->> 'kind' = 'system' then return new; end if;
  select clash_id into v_clash from public.arena_rooms where id = new.room_id;
  if v_clash is null then return new; end if;
  select * into c from public.clashes where id = v_clash for update;
  select author_id into v_a from public.takes where id = c.take_id;
  select t.judging_at into v_judge from public.arena_rooms r
    join public.arena_daily_topics t on t.id = r.topic_id where r.id = new.room_id;
  if new.author_id not in (v_a, c.challenger_id) then
    raise exception 'only canonical duel fighters may publish' using errcode = '42501';
  end if;
  if c.status <> 'open' or clock_timestamp() < c.opens_at or clock_timestamp() >= v_judge then
    raise exception 'duel is not accepting arguments' using errcode = 'P0003';
  end if;
  return new;
end;
$$;
create trigger arena_duel_message_guard before insert or update on public.arena_room_messages
  for each row execute function public.guard_arena_duel_content();
create trigger arena_duel_evidence_guard before insert or update on public.arena_room_evidence
  for each row execute function public.guard_arena_duel_content();

-- Duel judging uses judgements/verdicts exclusively. Reject every alternative
-- ballot/result insert even if a future definer RPC accidentally reaches it.
create function public.guard_arena_duel_group_outcome()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.arena_rooms where id = new.room_id and clash_id is not null) then
    raise exception 'duel outcomes belong to Clash judgements and verdicts' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger arena_duel_side_vote_guard before insert or update on public.arena_room_side_votes
  for each row execute function public.guard_arena_duel_group_outcome();
create trigger arena_duel_argument_vote_guard before insert or update on public.arena_room_argument_votes
  for each row execute function public.guard_arena_duel_group_outcome();
create trigger arena_duel_result_guard before insert or update on public.arena_room_results
  for each row execute function public.guard_arena_duel_group_outcome();

create function public.guard_arena_duel_judgement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.clashes%rowtype; v_a text; v_judge timestamptz;
begin
  select * into c from public.clashes where id = new.clash_id for update;
  if c.duel_key is null then return new; end if;
  select author_id into v_a from public.takes where id = c.take_id;
  select t.judging_at into v_judge from public.arena_rooms r
    join public.arena_daily_topics t on t.id = r.topic_id where r.clash_id = c.id;
  if new.juror_id in (v_a, c.challenger_id) then
    raise exception 'fighters cannot judge their duel' using errcode = '42501';
  end if;
  if c.status <> 'open' or clock_timestamp() < v_judge or clock_timestamp() >= c.closes_at then
    raise exception 'duel is not in judging' using errcode = 'P0003';
  end if;
  if public.arena_actor_hidden(new.juror_id, v_a)
     or public.arena_actor_hidden(new.juror_id, c.challenger_id) then
    raise exception 'duel is not available' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger arena_duel_judgement_guard before insert or update on public.judgements
  for each row execute function public.guard_arena_duel_judgement();

-- Keep the proven existing implementations private and delegate legacy behavior.
alter function public.settle_clash(text) rename to settle_clash_legacy;
revoke execute on function public.settle_clash_legacy(text) from public, anon, authenticated, service_role;
create function public.settle_clash(p_clash_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.clashes%rowtype; v_result jsonb;
begin
  -- All duel paths acquire Clash before Room; never invert this lock order.
  select * into c from public.clashes where id = p_clash_id for update;
  if c.duel_key is not null then
    perform 1 from public.arena_rooms where clash_id = c.id for update;
    if c.status = 'cancelled' then
      return jsonb_build_object('clash_id', c.id, 'status', 'cancelled', 'jury_size', 0);
    end if;
  end if;
  v_result := public.settle_clash_legacy(p_clash_id);
  if c.duel_key is not null then
    update public.arena_rooms set status = case
      when (select status from public.clashes where id = c.id) = 'settled'
        then 'SETTLED'::public.arena_room_status else 'CANCELLED'::public.arena_room_status end
    where clash_id = c.id;
    delete from public.arena_room_pulse_cache where room_id in
      (select id from public.arena_rooms where clash_id = c.id);
  end if;
  return v_result;
end;
$$;
revoke execute on function public.settle_clash(text) from public, anon;
grant execute on function public.settle_clash(text) to authenticated, service_role;

alter function public.settle_arena_room(text) rename to settle_arena_group_room;
revoke execute on function public.settle_arena_group_room(text) from public, anon, authenticated, service_role;
create function public.settle_arena_room(p_room_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_clash text;
begin
  select clash_id into v_clash from public.arena_rooms where id = p_room_id;
  if v_clash is not null then return public.settle_clash(v_clash); end if;
  return public.settle_arena_group_room(p_room_id);
end;
$$;
revoke execute on function public.settle_arena_room(text) from public, anon, authenticated;
grant execute on function public.settle_arena_room(text) to service_role;

-- Preserve the scheduler seam while serializing duel status changes before
-- touching Room rows. Terminal Clash state is re-read after the lock wait.
create or replace function public.transition_due_arena_rooms(p_limit integer default 500)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; r record; v_status public.clash_status;
begin
  update public.arena_daily_topics set status = 'live'
   where status = 'scheduled' and opens_at <= now() and closes_at > now();
  update public.arena_daily_topics set status = 'closed'
   where status in ('scheduled', 'live') and closes_at <= now();
  for r in select rm.id, rm.clash_id, rm.status, t.opens_at,
      t.final_arguments_at, t.judging_at, t.closes_at, t.status as topic_status
    from public.arena_rooms rm join public.arena_daily_topics t on t.id = rm.topic_id
    where rm.status not in ('SETTLED', 'CANCELLED')
    order by t.closes_at, rm.id
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  loop
    begin
      if r.clash_id is not null then
        select status into v_status from public.clashes where id = r.clash_id for update;
        if v_status <> 'open' then continue; end if;
      end if;
      if now() >= r.closes_at then
        perform public.settle_arena_room(r.id); v_n := v_n + 1;
      elsif now() >= r.judging_at and r.status <> 'JUDGING' then
        update public.arena_rooms set status = 'JUDGING' where id = r.id; v_n := v_n + 1;
      elsif now() < r.judging_at and now() >= r.final_arguments_at and r.status <> 'FINAL_ARGUMENTS' then
        update public.arena_rooms set status = 'FINAL_ARGUMENTS' where id = r.id; v_n := v_n + 1;
      elsif now() < r.final_arguments_at and now() >= r.opens_at and r.topic_status = 'live' and r.status <> 'OPEN' then
        update public.arena_rooms set status = 'OPEN' where id = r.id; v_n := v_n + 1;
      end if;
    exception when others then null; -- Retain existing per-room isolation.
    end;
  end loop;
  return v_n;
end;
$$;

-- Idempotency is server-owned: the future accepted event will supply request_key.
-- No unaccepted/public challenge action is exposed in Phase 1.
create function public.create_arena_duel(
  p_take_id text, p_fighter_b_id text, p_request_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_take public.takes%rowtype;
  c public.clashes%rowtype;
  v_clash text;
  v_room text;
  v_topic text;
  -- Existing room entry uses transaction time; open immediately in that same
  -- transaction too (clock_timestamp would make the room appear scheduled).
  v_now timestamptz := now();
  v_close timestamptz := v_now + interval '30 minutes';
begin
  if p_request_key is null or p_take_id is null or p_fighter_b_id is null then
    raise exception 'take, Fighter B and request key are required' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('arena-duel:' || p_request_key::text, 0));
  select * into c from public.clashes where duel_key = p_request_key;
  if found then
    if c.take_id <> p_take_id or c.challenger_id <> p_fighter_b_id then
      raise exception 'request key already belongs to another duel' using errcode = 'P0006';
    end if;
    select id into v_room from public.arena_rooms where clash_id = c.id;
    return jsonb_build_object('clashId', c.id, 'roomId', v_room, 'created', false);
  end if;

  -- Serialize all creations for this Take, including different retry keys.
  select * into v_take from public.takes where id = p_take_id for update;
  if not found then raise exception 'take does not exist' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.profiles where id = p_fighter_b_id) then
    raise exception 'Fighter B does not exist' using errcode = 'P0002';
  end if;
  if v_take.author_id = p_fighter_b_id then
    raise exception 'cannot duel your own take' using errcode = 'P0001';
  end if;
  if v_take.status <> 'active' or v_take.expires_at < v_close then
    raise exception 'take must remain live for the duel window' using errcode = 'P0003';
  end if;
  if public.arena_actor_hidden(v_take.author_id, p_fighter_b_id)
     or public.arena_actor_hidden(p_fighter_b_id, v_take.author_id) then
    raise exception 'fighters cannot duel across a block or mute' using errcode = '42501';
  end if;
  if exists (select 1 from public.clashes where take_id = p_take_id
              and challenger_id = p_fighter_b_id and duel_key is not null and status = 'open') then
    raise exception 'an active duel already exists for these fighters and take' using errcode = 'P0006';
  end if;
  -- Fixed ordering prevents reverse-pair throttle lock deadlocks.
  perform public.assert_rate_limit(least(v_take.author_id, p_fighter_b_id), 'arena_duel_create', 5, interval '1 hour');
  perform public.assert_rate_limit(greatest(v_take.author_id, p_fighter_b_id), 'arena_duel_create', 5, interval '1 hour');

  v_clash := public.new_arena_id('cl_');
  v_room := public.new_arena_id('ar_');
  v_topic := public.new_arena_id('at_');
  insert into public.clashes(id, take_id, challenger_id, status, opens_at, closes_at, mode, duel_key)
    values(v_clash, p_take_id, p_fighter_b_id, 'open', v_now, v_close, 'STANDARD', p_request_key);
  insert into public.arena_daily_topics(id, title, description, hood, status,
    opens_at, final_arguments_at, judging_at, closes_at)
    values(v_topic, left(v_take.text, 140), null, v_take.hood, 'live',
      v_now, v_now + interval '20 minutes', v_now + interval '25 minutes', v_close);
  insert into public.arena_rooms(id, topic_id, clash_id, status, capacity, participant_count, opens_at, closes_at)
    values(v_room, v_topic, v_clash, 'OPEN', 2, 2, v_now, v_close);
  insert into public.arena_room_participants(room_id, topic_id, profile_id, initial_stance, role)
    values(v_room, v_topic, v_take.author_id, 'AGREE', 'debater'),
          (v_room, v_topic, p_fighter_b_id, 'DISAGREE', 'debater');
  perform public.assert_arena_duel_integrity(v_clash);
  return jsonb_build_object('clashId', v_clash, 'roomId', v_room, 'created', true);
end;
$$;
revoke execute on function public.create_arena_duel(text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_arena_duel(text, text, uuid) to service_role;

-- Existing topic entry may watch a duel, but never allocate another fighter slot.
alter function public.join_arena_topic(text, public.take_stance, public.arena_participant_role)
  rename to join_arena_group_topic;
revoke execute on function public.join_arena_group_topic(text, public.take_stance, public.arena_participant_role)
  from public, anon, authenticated, service_role;
create function public.join_arena_topic(
  p_topic_id text, p_stance public.take_stance default null,
  p_role public.arena_participant_role default 'debater'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room text; v_me text := public.my_profile_id();
begin
  select id into v_room from public.arena_rooms where topic_id = p_topic_id and clash_id is not null;
  if v_room is null then return public.join_arena_group_topic(p_topic_id, p_stance, p_role); end if;
  if coalesce(p_role, 'debater') <> 'spectator' and not exists (
    select 1 from public.arena_room_participants where room_id = v_room
      and profile_id = v_me and role = 'debater'
  ) then raise exception 'duel fighters are assigned by the Clash' using errcode = '42501'; end if;
  return public.watch_arena_room(v_room);
end;
$$;
revoke execute on function public.join_arena_topic(text, public.take_stance, public.arena_participant_role) from public, anon;
grant execute on function public.join_arena_topic(text, public.take_stance, public.arena_participant_role) to authenticated;

alter function public.clash_view(text) rename to clash_view_legacy;
revoke execute on function public.clash_view_legacy(text) from public, anon, authenticated, service_role;
create function public.clash_view(p_clash_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_payload jsonb; r public.arena_rooms%rowtype; t public.arena_daily_topics%rowtype;
begin
  v_payload := public.clash_view_legacy(p_clash_id);
  select * into r from public.arena_rooms where clash_id = p_clash_id;
  if not found then return v_payload; end if;
  select * into t from public.arena_daily_topics where id = r.topic_id;
  return v_payload || jsonb_build_object('roomId', r.id, 'battleMode', 'DUEL',
    'fighterA', v_payload -> 'sideA', 'fighterB', v_payload -> 'sideB',
    'judgingAt', t.judging_at,
    'mayJudge', coalesce((v_payload ->> 'mayJudge')::boolean, false)
      and now() >= t.judging_at
      and not public.arena_actor_hidden(public.my_profile_id(), v_payload #>> '{sideA,id}')
      and not public.arena_actor_hidden(public.my_profile_id(), v_payload #>> '{sideB,id}'));
end;
$$;
revoke execute on function public.clash_view(text) from public;
grant execute on function public.clash_view(text) to anon, authenticated, service_role;

alter function public.arena_room_payload(public.arena_rooms, text) rename to arena_group_room_payload;
revoke execute on function public.arena_group_room_payload(public.arena_rooms, text) from public, anon, authenticated, service_role;
create function public.arena_room_payload(p_room public.arena_rooms, p_viewer text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_payload jsonb; v_clash jsonb; v_relationship text; v_status text;
begin
  v_payload := public.arena_group_room_payload(p_room, p_viewer);
  if p_room.clash_id is null then
    return v_payload || jsonb_build_object('roomMode', 'GROUP', 'clashId', null, 'duel', null);
  end if;
  v_clash := public.clash_view(p_room.clash_id);
  v_relationship := case
    when p_viewer = v_clash #>> '{fighterA,id}' then 'fighter_a'
    when p_viewer = v_clash #>> '{fighterB,id}' then 'fighter_b'
    when public.is_staff() then 'staff'
    else 'spectator' end;
  v_status := case
    when v_clash ->> 'status' = 'settled' then 'SETTLED'
    when v_clash ->> 'status' = 'cancelled' then 'CANCELLED'
    when v_payload ->> 'phase' in ('judging', 'closed') then 'JUDGING'
    when v_payload ->> 'phase' = 'final_arguments' then 'FINAL_ARGUMENTS'
    else p_room.status::text end;
  return v_payload || jsonb_build_object('roomMode', 'DUEL', 'clashId', p_room.clash_id,
    'status', v_status, 'result', null,
    'duel', v_clash || jsonb_build_object('viewerRelationship', v_relationship));
end;
$$;
revoke execute on function public.arena_room_payload(public.arena_rooms, text) from public, anon, authenticated;
grant execute on function public.arena_room_payload(public.arena_rooms, text) to service_role;

-- Helpers are internal; RLS reads and the existing moderator RPCs are retained.
revoke execute on function public.guard_arena_duel_identity(), public.assert_arena_duel_integrity(text),
  public.check_arena_duel_integrity(), public.guard_arena_duel_participant(),
  public.guard_arena_duel_content(), public.guard_arena_duel_group_outcome(),
  public.guard_arena_duel_judgement() from public, anon, authenticated;
revoke insert, update, delete on public.clashes, public.arena_rooms, public.arena_room_participants,
  public.judgements, public.verdicts from public, anon, authenticated;
-- Hide the infrastructure retry key from API roles (legacy safe-column grants remain).
revoke select (duel_key) on public.clashes from anon, authenticated;
