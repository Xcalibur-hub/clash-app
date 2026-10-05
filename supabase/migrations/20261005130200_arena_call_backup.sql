-- ============================================================================
-- CLASH 2.0 · Phase 14.2 — CALL BACKUP + battle events
-- ----------------------------------------------------------------------------
-- CALL BACKUP is a SOCIAL INVITATION, never an administrator privilege:
--   · Only a debater in the room may call, and only someone whose standing says
--     they are respected enough to be called.
--   · Capacity is never bypassed. A full room returns `room_full` plus the truth
--     that spectating is still available — it does not invent a queue and it
--     does not silently let anyone in.
--   · Abuse is bounded in the database, not by UI politeness: cooldowns, caps,
--     a single pending invite per person, expiry, opt-out, blocks/mutes.
--
-- BATTLE EVENTS store only what would otherwise be unknowable later:
--   · Backup moments (called / arrived / declined / expired)
--   · An evidence BURST (computed from real rows, not from taps)
--   · Phase transitions, written by a trigger on arena_rooms so neither the
--     scheduler nor settle_arena_room() had to be rewritten.
-- Reactions are never events — `arena_room_message_reactions` already holds
-- them, and a row per tap would be a hot-row write per tap.
--
-- SCALE
--   · One row per invite, per event; every read is room- or person-scoped and
--     indexed. No global counter is touched by a reaction, a message, a
--     judgement or an invite. Candidate ranking is a bounded, indexed scan.
-- ============================================================================

-- ── 1. Opt-out preferences (own-only, server-authoritative) ─────────────────
-- The simplest thing that works with what already exists: no global preferences
-- framework, one narrow table, one RPC, one default. Default EVERYONE keeps a
-- brand-new feature usable; the caps + cooldowns are what make it safe.
create table if not exists public.arena_backup_preferences (
  profile_id text primary key references public.profiles (id) on delete cascade,
  policy     public.arena_backup_policy not null default 'EVERYONE',
  updated_at timestamptz not null default now()
);

alter table public.arena_backup_preferences enable row level security;

drop policy if exists "your backup preference is yours" on public.arena_backup_preferences;
create policy "your backup preference is yours"
  on public.arena_backup_preferences for select to authenticated
  using (public.owns_profile(profile_id));

revoke all on public.arena_backup_preferences from public, anon, authenticated;
grant select on public.arena_backup_preferences to authenticated;
grant all on public.arena_backup_preferences to service_role;

/** Effective policy for a person, defaulting to EVERYONE. */
create or replace function public.arena_backup_policy_for(p_profile_id text)
returns public.arena_backup_policy
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.policy from public.arena_backup_preferences p where p.profile_id = p_profile_id),
    'EVERYONE'::public.arena_backup_policy
  );
$$;

revoke execute on function public.arena_backup_policy_for(text) from public;
grant execute on function public.arena_backup_policy_for(text) to anon, authenticated, service_role;

-- ── 2. Invites ──────────────────────────────────────────────────────────────
-- `expires_at` is the invitation lifetime (10 minutes): a battle is fast, and a
-- stale invitation is worse than none. Status IS the lifecycle — there is no
-- second "arrived" table and no duplicate bookkeeping.
create table if not exists public.arena_backup_invites (
  id           text primary key,
  room_id      text not null references public.arena_rooms (id) on delete cascade,
  topic_id     text not null references public.arena_daily_topics (id) on delete cascade,
  caller_id    text not null references public.profiles (id) on delete cascade,
  recipient_id text not null references public.profiles (id) on delete cascade,
  status       public.arena_backup_status not null default 'PENDING',
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 minutes',
  responded_at timestamptz,
  arrived_at   timestamptz,
  constraint arena_backup_invites_no_self check (caller_id <> recipient_id),
  constraint arena_backup_invites_window check (expires_at > created_at),
  constraint arena_backup_invites_responded check (
    (status = 'PENDING' and responded_at is null)
    or (status <> 'PENDING' and responded_at is not null)
  ),
  constraint arena_backup_invites_arrived check (
    (status = 'ACCEPTED' and arrived_at is not null)
    or (status <> 'ACCEPTED' and arrived_at is null)
  )
);

-- One live invitation per person, ever: the strongest anti-spam rule there is,
-- enforced by the database instead of trusting every caller's manners.
create unique index if not exists arena_backup_invites_one_pending_per_recipient_idx
  on public.arena_backup_invites (recipient_id)
  where status = 'PENDING';

create index if not exists arena_backup_invites_recipient_idx
  on public.arena_backup_invites (recipient_id, created_at desc);
create index if not exists arena_backup_invites_room_idx
  on public.arena_backup_invites (room_id, created_at desc);
create index if not exists arena_backup_invites_caller_idx
  on public.arena_backup_invites (caller_id, created_at desc);
create index if not exists arena_backup_invites_pending_expiry_idx
  on public.arena_backup_invites (expires_at)
  where status = 'PENDING';

alter table public.arena_backup_invites enable row level security;

drop policy if exists "an invite is between caller and recipient" on public.arena_backup_invites;
create policy "an invite is between caller and recipient"
  on public.arena_backup_invites for select to authenticated
  using (public.owns_profile(caller_id) or public.owns_profile(recipient_id));

revoke all on public.arena_backup_invites from public, anon, authenticated;
grant select on public.arena_backup_invites to authenticated;
grant all on public.arena_backup_invites to service_role;

-- ── 3. Battle events ────────────────────────────────────────────────────────
create table if not exists public.arena_room_events (
  id         text primary key,
  room_id    text not null references public.arena_rooms (id) on delete cascade,
  topic_id   text not null references public.arena_daily_topics (id) on delete cascade,
  kind       public.arena_room_event_kind not null,
  actor_id   text references public.profiles (id) on delete set null,
  subject_id text references public.profiles (id) on delete set null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- Idempotency: a trigger-written event carries a deterministic key, so a
  -- retried transition can never double-post into the room feed.
  dedupe_key text
);

create index if not exists arena_room_events_room_idx
  on public.arena_room_events (room_id, created_at desc, id desc);

create unique index if not exists arena_room_events_dedupe_idx
  on public.arena_room_events (dedupe_key)
  where dedupe_key is not null;

alter table public.arena_room_events enable row level security;

drop policy if exists "room members can read battle events" on public.arena_room_events;
create policy "room members can read battle events"
  on public.arena_room_events for select to authenticated
  using (public.arena_is_room_member(room_id) or public.is_staff());

revoke all on public.arena_room_events from public, anon, authenticated;
grant select on public.arena_room_events to authenticated;
grant all on public.arena_room_events to service_role;

/** Server-only event writer. Never callable by a client. */
create or replace function public.arena_event(
  p_room_id    text,
  p_topic_id   text,
  p_kind       public.arena_room_event_kind,
  p_actor      text default null,
  p_subject    text default null,
  p_payload    jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := public.new_arena_id('ae_');
begin
  insert into public.arena_room_events
    (id, room_id, topic_id, kind, actor_id, subject_id, payload, dedupe_key)
  values
    (v_id, p_room_id, p_topic_id, p_kind, p_actor, p_subject,
     coalesce(p_payload, '{}'::jsonb), p_dedupe_key)
  -- The unique index on dedupe_key is partial (nulls are allowed and frequent),
  -- so the conflict target has to restate that predicate.
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return v_id;
end;
$$;


-- ── 4. Room load (ACTIVE DEBATER vs SPECTATOR) ──────────────────────────────
/**
 * Server-authoritative room load.
 *
 * Capacity bounds ACTIVE DEBATERS only (`arena_rooms.capacity`, 20–50). Watching
 * is unbounded by design, so a saturated room still admits spectators — there is
 * deliberately no single 1000-person writable room.
 */
create or replace function public.arena_room_load(p_room_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_room   public.arena_rooms%rowtype;
  v_debat  integer := 0;
  v_spec   integer := 0;
begin
  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;

  select count(*) filter (where p.role = 'debater')::integer,
         count(*) filter (where p.role = 'spectator')::integer
    into v_debat, v_spec
    from public.arena_room_participants p
   where p.room_id = p_room_id;

  return jsonb_build_object(
    'roomId', v_room.id,
    'status', v_room.status,
    'capacity', v_room.capacity,
    'participantCount', v_room.participant_count,
    'debaterCount', v_debat,
    'spectatorCount', v_spec,
    -- Debaters are admitted while the room is in play and a slot exists.
    'acceptingDebaters',
      v_room.status in ('OPEN', 'FINAL_ARGUMENTS')
      and v_room.participant_count < v_room.capacity,
    'saturated', v_room.participant_count >= v_room.capacity,
    'spectateAvailable', v_room.status in ('OPEN', 'FINAL_ARGUMENTS', 'JUDGING'),
    'viewerIsMember',
      v_viewer is not null
      and exists (select 1 from public.arena_room_participants p
                   where p.room_id = p_room_id and p.profile_id = v_viewer)
  );
end;
$$;

revoke execute on function public.arena_room_load(text) from public, anon;
grant execute on function public.arena_room_load(text) to authenticated;

comment on function public.arena_room_load(text) is
  'Debater/spectator load. Capacity bounds debaters only; spectating stays open when full.';

revoke execute on function
  public.arena_event(text, text, public.arena_room_event_kind, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function
  public.arena_event(text, text, public.arena_room_event_kind, text, text, jsonb, text)
  to service_role;


-- ── 5. Candidate ranking (deterministic, real signals only) ─────────────────
/**
 * WHY this person is suggested — short, honest, and only from real signals.
 * Returns [] rather than inventing a reason. Entertainment never appears here:
 * being funny is not expertise.
 */
create or replace function public.arena_backup_reasons(
  p_viewer    text,
  p_candidate text,
  p_topic_id  text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(reason order by ord), '[]'::jsonb)
    from (
      select r.reason, r.ord
        from (values
          (1, case
                when exists (
                  select 1 from public.profiles c
                    join public.arena_daily_topics t on t.id = p_topic_id
                   where c.id = p_candidate and t.hood is not null and c.home_hood = t.hood
                ) then 'From this Hood' else null end),
          (2, case when coalesce((public.reputation_facet_json(p_candidate) ->> 'EVIDENCE')::integer, 0) > 0
                   then 'Useful evidence' else null end),
          (3, case when coalesce((public.reputation_facet_json(p_candidate) ->> 'DEBATE')::integer, 0) >= 100
                   then 'Strong debater' else null end),
          (4, case when coalesce((public.reputation_facet_json(p_candidate) ->> 'TRUST')::integer, 0) > 0
                   then 'Answers the call' else null end),
          (5, case when public.arena_standing_for(p_candidate) = 'VETERAN'
                   then 'Veteran' else null end),
          (6, case when exists (
                     select 1 from public.follows f
                      where f.follower_id = p_viewer and f.following_id = p_candidate
                   ) then 'You follow them' else null end)
        ) as r(reason, ord)
       where r.reason is not null
    ) reasons;
$$;

revoke execute on function public.arena_backup_reasons(text, text, text) from public, anon;
grant execute on function public.arena_backup_reasons(text, text, text) to authenticated;


/**
 * Who could credibly be called into this battle?
 *
 * Every input is a real, countable fact — topic/Hood relevance, debate and
 * evidence facets, prior healthy participation (TRUST), a real follow edge and
 * Arena standing. Nothing is inferred about expertise we do not have.
 *
 * Deterministic: a score plus stable tie-breakers, so the same room always
 * produces the same shortlist. Bounded: at most 300 candidates are scored using
 * indexed lookups, and `limit` caps the payload.
 */
create or replace function public.list_arena_backup_candidates(
  p_room_id text,
  p_limit   integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller text := public.my_profile_id();
  v_limit  integer := greatest(1, least(coalesce(p_limit, 5), 10));
  v_room   public.arena_rooms%rowtype;
  v_topic  public.arena_daily_topics%rowtype;
begin
  if v_caller is null then
    raise exception 'sign in to call backup' using errcode = '42501';
  end if;
  if not public.arena_may_call_backup(v_caller) then
    raise exception 'you are not eligible to call backup yet' using errcode = 'P0003';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.arena_room_participants p
     where p.room_id = p_room_id and p.profile_id = v_caller and p.role = 'debater'
  ) then
    raise exception 'join the debate to call backup' using errcode = '42501';
  end if;
  if v_room.status not in ('OPEN', 'FINAL_ARGUMENTS') then
    raise exception 'this room is past the argument phase' using errcode = 'P0003';
  end if;

  select * into v_topic from public.arena_daily_topics where id = v_room.topic_id;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'profileId', c.id,
             'author', public.arena_profile_json(c.id),
             'score', c.score,
             'standing', c.standing,
             'reasons', public.arena_backup_reasons(v_caller, c.id, v_room.topic_id)
           ) order by c.score desc, c.id asc)
      from (
        select s.id, s.standing, s.score
          from (
            select
              p.id,
              public.arena_standing_for(p.id) as standing,
              (
                case when v_topic.hood is not null and p.home_hood = v_topic.hood then 30 else 0 end
                + least(coalesce((
                    select count(*) from public.arena_room_participants ap
                     join public.arena_daily_topics t on t.id = ap.topic_id
                    where ap.profile_id = p.id and ap.role = 'debater'
                      and v_topic.hood is not null and t.hood = v_topic.hood
                  ), 0) * 5, 20)
                + least(coalesce((
                    select count(*) from public.arena_room_evidence ev
                     join public.arena_daily_topics t on t.id = ev.topic_id
                    where ev.author_id = p.id and ev.hidden_at is null
                      and v_topic.hood is not null and t.hood = v_topic.hood
                  ), 0) * 3, 15)
                + least(coalesce((public.reputation_facet_json(p.id) ->> 'DEBATE')::integer, 0) / 10, 40)
                + least(coalesce((public.reputation_facet_json(p.id) ->> 'EVIDENCE')::integer, 0) / 5, 30)
                + least(coalesce((public.reputation_facet_json(p.id) ->> 'TRUST')::integer, 0), 20)
                + case when exists (
                    select 1 from public.follows f
                     where f.follower_id = v_caller and f.following_id = p.id
                  ) then 8 else 0 end
                + case when exists (
                    select 1 from public.follows f
                     where f.follower_id = p.id and f.following_id = v_caller
                  ) then 4 else 0 end
                + case public.arena_standing_for(p.id)
                    when 'VETERAN' then 12
                    when 'DEBATER' then 6
                    else 0 end
              ) as score
              from public.profiles p
             where p.id <> v_caller
               and public.arena_may_be_called(p.id)
               and not exists (
                 select 1 from public.arena_room_participants ap
                  where ap.room_id = p_room_id and ap.profile_id = p.id
               )
               and not public.arena_actor_hidden(v_caller, p.id)
               and not public.arena_actor_hidden(p.id, v_caller)
               and public.arena_backup_policy_for(p.id) <> 'NOBODY'
               and (
                 public.arena_backup_policy_for(p.id) = 'EVERYONE'
                 or exists (
                   select 1 from public.follows f
                    where f.follower_id = p.id and f.following_id = v_caller
                 )
               )
               -- Never pester: one live invite per person, no repeats inside 30 minutes.
               and not exists (
                 select 1 from public.arena_backup_invites i
                  where i.recipient_id = p.id
                    and (i.status = 'PENDING' or i.created_at > now() - interval '30 minutes')
               )
             order by p.id asc
             limit 300
          ) s
         order by s.score desc, s.id asc
         limit v_limit
      ) c
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_arena_backup_candidates(text, integer) from public, anon;
grant execute on function public.list_arena_backup_candidates(text, integer) to authenticated;

comment on function public.list_arena_backup_candidates(text, integer) is
  'Deterministic Call Backup shortlist from real signals. Entertainment never contributes.';


-- ── 6. Preference RPCs (own-only; a client can never change someone else's) ──
create or replace function public.get_arena_backup_preference()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
begin
  if v_user is null then
    raise exception 'sign in to set your backup preference' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'policy', public.arena_backup_policy_for(v_user),
    'mayCallBackup', public.arena_may_call_backup(v_user),
    'mayBeCalled', public.arena_may_be_called(v_user)
  );
end;
$$;

create or replace function public.set_arena_backup_preference(
  p_policy public.arena_backup_policy
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
begin
  if v_user is null then
    raise exception 'sign in to set your backup preference' using errcode = '42501';
  end if;
  if p_policy is null then
    raise exception 'choose who may call you' using errcode = 'P0003';
  end if;

  insert into public.arena_backup_preferences (profile_id, policy, updated_at)
  values (v_user, p_policy, now())
  on conflict (profile_id) do update
    set policy = excluded.policy, updated_at = now();

  -- Opting out retires any live call immediately: a preference must take effect
  -- the moment it is chosen, not when an invitation happens to expire.
  if p_policy = 'NOBODY' then
    update public.arena_backup_invites
       set status = 'CANCELLED', responded_at = now()
     where recipient_id = v_user and status = 'PENDING';
  end if;

  return public.get_arena_backup_preference();
end;
$$;

revoke execute on function public.get_arena_backup_preference() from public, anon;
revoke execute on function public.set_arena_backup_preference(public.arena_backup_policy) from public, anon;
grant execute on function public.get_arena_backup_preference() to authenticated;
grant execute on function public.set_arena_backup_preference(public.arena_backup_policy) to authenticated;

-- ── 7. Server-only notification helper (same shape as clash_notify) ─────────
create or replace function public.arena_notify(
  p_recipient text,
  p_actor     text,
  p_kind      public.notification_kind,
  p_entity_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (id, recipient_id, actor_id, kind, entity_type, entity_id)
  values (
    'n_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    p_recipient, p_actor, p_kind, 'arena_backup_invite', p_entity_id
  );
end;
$$;

revoke execute on function public.arena_notify(text, text, public.notification_kind, text)
  from public, anon, authenticated;
grant execute on function public.arena_notify(text, text, public.notification_kind, text)
  to service_role;

-- ── 8. call_arena_backup ────────────────────────────────────────────────────
/**
 * Summon one respected, relevant person into a live battle.
 *
 * Abuse protection is server-side and layered: eligibility (standing), a per-
 * caller cooldown, a per-room cooldown, a cap on live calls per room and per
 * caller, one live call per recipient (a database constraint, not a check an
 * attacker could race), expiry, opt-out, blocks and mutes.
 *
 * Errors:
 *   42501 not signed in / not a debater here
 *   P0002 room or recipient missing
 *   P0003 not eligible to call yet / wrong phase / self-call / recipient not
 *         callable / already in this room / too many live calls
 *   P0001 cooldown (rate limited)
 *   P0004 recipient opted out of this caller
 *   P0005 blocked or muted
 *   P0007 that person already has a live call
 */
create or replace function public.call_arena_backup(
  p_room_id      text,
  p_recipient_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller    text := public.my_profile_id();
  v_room      public.arena_rooms%rowtype;
  v_topic     public.arena_daily_topics%rowtype;
  v_invite_id text;
  v_expires   timestamptz := now() + interval '10 minutes';
  v_policy    public.arena_backup_policy;
begin
  if v_caller is null then
    raise exception 'sign in to call backup' using errcode = '42501';
  end if;
  if not public.arena_may_call_backup(v_caller) then
    raise exception 'you are not eligible to call backup yet' using errcode = 'P0003';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.arena_room_participants p
     where p.room_id = p_room_id and p.profile_id = v_caller and p.role = 'debater'
  ) then
    raise exception 'join the debate to call backup' using errcode = '42501';
  end if;
  if v_room.status not in ('OPEN', 'FINAL_ARGUMENTS') then
    raise exception 'this room is past the argument phase' using errcode = 'P0003';
  end if;

  select * into v_topic from public.arena_daily_topics where id = v_room.topic_id;
  if not found or v_topic.status <> 'live' or now() >= v_topic.closes_at then
    raise exception 'the topic is closed' using errcode = 'P0003';
  end if;

  if p_recipient_id is null or p_recipient_id = v_caller then
    raise exception 'you cannot call yourself' using errcode = 'P0003';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_recipient_id) then
    raise exception 'that person does not exist' using errcode = 'P0002';
  end if;
  if not public.arena_may_be_called(p_recipient_id) then
    raise exception 'that member is not accepting call-ups' using errcode = 'P0003';
  end if;

  if public.arena_actor_hidden(v_caller, p_recipient_id)
     or public.arena_actor_hidden(p_recipient_id, v_caller) then
    raise exception 'blocked' using errcode = 'P0005';
  end if;

  v_policy := public.arena_backup_policy_for(p_recipient_id);
  if v_policy = 'NOBODY' then
    raise exception 'that member is not accepting call-ups' using errcode = 'P0004';
  end if;
  if v_policy = 'FOLLOWING' and not exists (
    select 1 from public.follows f
     where f.follower_id = p_recipient_id and f.following_id = v_caller
  ) then
    raise exception 'that member only accepts calls from people they follow'
      using errcode = 'P0004';
  end if;

  if exists (
    select 1 from public.arena_room_participants p
     where p.room_id = p_room_id and p.profile_id = p_recipient_id
  ) then
    raise exception 'they are already in this room' using errcode = 'P0003';
  end if;

  -- A high-reputation person must never drown in notifications.
  if exists (
    select 1 from public.arena_backup_invites i
     where i.recipient_id = p_recipient_id and i.status = 'PENDING'
  ) then
    raise exception 'that member already has a live call' using errcode = 'P0007';
  end if;

  perform public.assert_rate_limit(v_caller, 'arena_backup_call', 3, interval '30 minutes');

  if (select count(*) from public.arena_backup_invites i
       where i.room_id = p_room_id and i.created_at > now() - interval '30 minutes') >= 6 then
    raise exception 'this room has called enough backup for now'
      using errcode = 'P0001', hint = 'slow down and try again later';
  end if;
  if (select count(*) from public.arena_backup_invites i
       where i.caller_id = v_caller and i.status = 'PENDING') >= 2 then
    raise exception 'you already have live calls out' using errcode = 'P0003';
  end if;
  if (select count(*) from public.arena_backup_invites i
       where i.room_id = p_room_id and i.status = 'PENDING') >= 2 then
    raise exception 'this room is already waiting on two fighters' using errcode = 'P0003';
  end if;

  v_invite_id := public.new_arena_id('abi_');
  begin
    insert into public.arena_backup_invites
      (id, room_id, topic_id, caller_id, recipient_id, status, expires_at)
    values
      (v_invite_id, p_room_id, v_room.topic_id, v_caller, p_recipient_id, 'PENDING', v_expires);
  exception when unique_violation then
    -- Lost a race for the same recipient: the constraint is the referee.
    raise exception 'that member already has a live call' using errcode = 'P0007';
  end;

  perform public.arena_event(
    p_room_id, v_room.topic_id, 'BACKUP_CALLED', v_caller, p_recipient_id,
    jsonb_build_object('inviteId', v_invite_id), null
  );
  perform public.arena_notify(p_recipient_id, v_caller, 'arena_backup_request', v_invite_id);

  return jsonb_build_object(
    'inviteId', v_invite_id,
    'roomId', p_room_id,
    'topicId', v_room.topic_id,
    'recipientId', p_recipient_id,
    'status', 'PENDING',
    'expiresAt', v_expires
  );
end;
$$;


revoke execute on function public.call_arena_backup(text, text) from public, anon;
grant execute on function public.call_arena_backup(text, text) to authenticated;

comment on function public.call_arena_backup(text, text) is
  'Social invitation into a live battle. Cooldown + caps + one live call per person.';

-- ── 9. respond_arena_backup ─────────────────────────────────────────────────
/**
 * Answer a call. Only the recipient can, and capacity is never bypassed.
 *
 * A full room returns a truthful `room_full` state with `spectateAvailable: true`
 * and the invitation stays PENDING (a slot may still open before it expires).
 * The called fighter enters with their own stance — a debater always has a side,
 * and nothing here decides anything on their behalf.
 *
 * Errors: 42501 not the recipient; P0002 unknown invite; P0003 expired / closed
 * room / no stance / already debating this topic elsewhere; P0006 already answered.
 */
create or replace function public.respond_arena_backup(
  p_invite_id text,
  p_accept    boolean,
  p_stance    public.take_stance default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  text := public.my_profile_id();
  v_inv   public.arena_backup_invites%rowtype;
  v_room  public.arena_rooms%rowtype;
  v_topic public.arena_daily_topics%rowtype;
  v_part  public.arena_room_participants%rowtype;
  v_role  public.arena_participant_role;
begin
  if v_user is null then
    raise exception 'sign in to answer a call' using errcode = '42501';
  end if;

  select * into v_inv from public.arena_backup_invites where id = p_invite_id for update;
  if not found then
    raise exception 'that call does not exist' using errcode = 'P0002';
  end if;
  if v_inv.recipient_id <> v_user then
    raise exception 'that call was not for you' using errcode = '42501';
  end if;
  if v_inv.status <> 'PENDING' then
    raise exception 'that call was already answered' using errcode = 'P0006';
  end if;

  if v_inv.expires_at <= now() then
    update public.arena_backup_invites
       set status = 'EXPIRED', responded_at = now()
     where id = p_invite_id;
    perform public.arena_event(
      v_inv.room_id, v_inv.topic_id, 'BACKUP_EXPIRED', v_inv.caller_id, v_inv.recipient_id,
      jsonb_build_object('inviteId', v_inv.id), 'BACKUP_EXPIRED:' || v_inv.id
    );
    -- Truthful state instead of an exception: raising here would roll this
    -- update back with it, and a stale call must actually retire.
    return jsonb_build_object(
      'status', 'EXPIRED',
      'inviteId', v_inv.id,
      'reason', 'expired',
      'spectateAvailable', true
    );
  end if;

  if not p_accept then
    update public.arena_backup_invites
       set status = 'DECLINED', responded_at = now()
     where id = p_invite_id;
    perform public.arena_event(
      v_inv.room_id, v_inv.topic_id, 'BACKUP_DECLINED', v_inv.caller_id, v_inv.recipient_id,
      jsonb_build_object('inviteId', v_inv.id), 'BACKUP_DECLINED:' || v_inv.id
    );
    -- Declines stay private: the caller is never told that someone passed.
    return jsonb_build_object('status', 'DECLINED', 'inviteId', v_inv.id);
  end if;

  select * into v_room from public.arena_rooms where id = v_inv.room_id for update;
  if not found then
    raise exception 'that room no longer exists' using errcode = 'P0002';
  end if;

  select * into v_topic from public.arena_daily_topics where id = v_room.topic_id;
  if not found or v_topic.status <> 'live' or now() >= v_topic.closes_at
     or v_room.status not in ('OPEN', 'FINAL_ARGUMENTS') then
    update public.arena_backup_invites
       set status = 'EXPIRED', responded_at = now()
     where id = p_invite_id;
    perform public.arena_event(
      v_inv.room_id, v_inv.topic_id, 'BACKUP_EXPIRED', v_inv.caller_id, v_inv.recipient_id,
      jsonb_build_object('inviteId', v_inv.id, 'reason', 'room_closed'),
      'BACKUP_EXPIRED:' || v_inv.id
    );
    return jsonb_build_object(
      'status', 'EXPIRED',
      'inviteId', v_inv.id,
      'reason', 'room_closed'
    );
  end if;

  if p_stance is null then
    raise exception 'pick a side to join the battle' using errcode = 'P0003';
  end if;

  -- CAPACITY IS NOT BYPASSED. A full room says so, truthfully.
  if v_room.participant_count >= v_room.capacity then
    return jsonb_build_object(
      'status', 'room_full',
      'inviteId', v_inv.id,
      'roomId', v_room.id,
      'capacity', v_room.capacity,
      'participantCount', v_room.participant_count,
      'spectateAvailable', true,
      'stillPending', true
    );
  end if;


  select * into v_part
    from public.arena_room_participants
   where topic_id = v_room.topic_id and profile_id = v_user
     for update;

  if not found then
    insert into public.arena_room_participants
      (room_id, topic_id, profile_id, initial_stance, role)
    values
      (v_room.id, v_room.topic_id, v_user, p_stance, 'debater')
    returning * into v_part;
    v_role := 'debater';
  elsif v_part.role = 'spectator' then
    -- Watching earlier in this topic? The call moves them into the fight. A
    -- spectator consumes no capacity, so nothing has to be given back.
    update public.arena_room_participants
       set room_id = v_room.id, role = 'debater', initial_stance = p_stance
     where topic_id = v_part.topic_id and profile_id = v_user
    returning * into v_part;
    v_role := 'debater';
  elsif v_part.room_id = v_room.id then
    -- Already fighting here: an idempotent "you are in".
    return jsonb_build_object(
      'status', 'already_in',
      'inviteId', v_inv.id,
      'roomId', v_room.id,
      'role', v_part.role,
      'stance', v_part.initial_stance,
      'capacity', v_room.capacity,
      'participantCount', v_room.participant_count
    );
  else
    -- Never silently move an active debater out of their own battle.
    raise exception 'you are already debating this topic in another room'
      using errcode = 'P0003';
  end if;

  update public.arena_rooms
     set participant_count = participant_count + case when v_role = 'debater' then 1 else 0 end
   where id = v_room.id
  returning * into v_room;

  update public.arena_backup_invites
     set status = 'ACCEPTED', responded_at = now(), arrived_at = now()
   where id = p_invite_id;

  perform public.arena_event(
    v_room.id, v_room.topic_id, 'BACKUP_ARRIVED', v_inv.caller_id, v_user,
    jsonb_build_object('inviteId', v_inv.id), 'BACKUP_ARRIVED:' || v_inv.id
  );

  -- TRUST: they answered when a room called. The facet comes from the ledger
  -- trigger; the global number moves exactly like every other award.
  insert into public.reputation_events
    (id, profile_id, clash_id, arena_room_id, kind, reputation_delta, coins_delta)
  values (
    public.new_arena_id('re_'), v_user, null, v_room.id, 'arena_backup_arrival', 8, 0
  );
  update public.profiles
     set reputation = reputation + 8,
         rank = public.rank_for_rep(reputation + 8)
   where id = v_user;

  perform public.arena_notify(v_inv.caller_id, v_user, 'arena_backup_arrival', v_inv.id);

  return jsonb_build_object(
    'status', 'ACCEPTED',
    'inviteId', v_inv.id,
    'roomId', v_room.id,
    'topicId', v_room.topic_id,
    'role', 'debater',
    'stance', p_stance,
    'capacity', v_room.capacity,
    'participantCount', v_room.participant_count,
    'arrivedAt', now()
  );
end;
$$;

revoke execute on function public.respond_arena_backup(text, boolean, public.take_stance)
  from public, anon;
grant execute on function public.respond_arena_backup(text, boolean, public.take_stance)
  to authenticated;

comment on function public.respond_arena_backup(text, boolean, public.take_stance) is
  'Recipient-only answer. Returns room_full instead of bypassing capacity.';


-- ── 10. cancel + my incoming calls ──────────────────────────────────────────
create or replace function public.cancel_arena_backup(p_invite_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_inv  public.arena_backup_invites%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to cancel a call' using errcode = '42501';
  end if;
  select * into v_inv from public.arena_backup_invites where id = p_invite_id for update;
  if not found then
    raise exception 'that call does not exist' using errcode = 'P0002';
  end if;
  if v_inv.caller_id <> v_user then
    raise exception 'you did not make that call' using errcode = '42501';
  end if;
  if v_inv.status <> 'PENDING' then
    return jsonb_build_object('status', v_inv.status, 'inviteId', v_inv.id);
  end if;

  update public.arena_backup_invites
     set status = 'CANCELLED', responded_at = now()
   where id = p_invite_id;
  -- A withdrawn call is not a moment in the battle: no event, no notification.
  return jsonb_build_object('status', 'CANCELLED', 'inviteId', v_inv.id);
end;
$$;

revoke execute on function public.cancel_arena_backup(text) from public, anon;
grant execute on function public.cancel_arena_backup(text) to authenticated;

/** Live calls addressed to the caller — what the "ROOM 7 NEEDS YOU" card shows. */
create or replace function public.list_my_arena_backup_invites()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
begin
  if v_user is null then
    raise exception 'sign in to see your calls' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'inviteId', i.id,
             'roomId', i.room_id,
             'topicId', i.topic_id,
             'topicTitle', t.title,
             'topicHood', t.hood,
             'caller', public.arena_profile_json(i.caller_id),
             'status', i.status,
             'createdAt', i.created_at,
             'expiresAt', i.expires_at,
             'roomStatus', r.status,
             'capacity', r.capacity,
             'participantCount', r.participant_count,
             'acceptingDebaters',
               r.status in ('OPEN', 'FINAL_ARGUMENTS') and r.participant_count < r.capacity
           ) order by i.created_at desc)
      from public.arena_backup_invites i
      join public.arena_rooms r on r.id = i.room_id
      join public.arena_daily_topics t on t.id = i.topic_id
     where i.recipient_id = v_user
       and i.status = 'PENDING'
       and i.expires_at > now()
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_my_arena_backup_invites() from public, anon;
grant execute on function public.list_my_arena_backup_invites() to authenticated;

comment on function public.list_my_arena_backup_invites() is
  'Live incoming Call Backup invitations for the caller. Own-only.';

-- ── 11. Battle event feed ───────────────────────────────────────────────────
/** A room's battle moments, oldest-first for smooth gap recovery. */
create or replace function public.list_arena_room_events(
  p_room_id text,
  p_after   timestamptz default null,
  p_limit   integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit  integer := greatest(1, least(coalesce(p_limit, 30), 60));
begin
  if v_viewer is null then
    raise exception 'sign in to read the room' using errcode = '42501';
  end if;
  if not exists (select 1 from public.arena_rooms r where r.id = p_room_id) then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if not public.arena_is_room_member(p_room_id) and not public.is_staff() then
    raise exception 'join the room to read it' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id,
             'roomId', e.room_id,
             'topicId', e.topic_id,
             'kind', e.kind,
             'actor', case when e.actor_id is null then null
                           else public.arena_profile_json(e.actor_id) end,
             'subjectId', e.subject_id,
             'payload', e.payload,
             'createdAt', e.created_at
           ) order by e.created_at asc, e.id asc)
      from (
        select * from public.arena_room_events ev
         where ev.room_id = p_room_id
           and (p_after is null or ev.created_at > p_after)
           -- A blocked participant's moments stay out of the viewer's feed.
           and (ev.subject_id is null or not public.arena_actor_hidden(v_viewer, ev.subject_id))
           and (ev.actor_id is null or not public.arena_actor_hidden(v_viewer, ev.actor_id))
         order by ev.created_at asc, ev.id asc
         limit v_limit
      ) e
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_arena_room_events(text, timestamptz, integer)
  from public, anon;
grant execute on function public.list_arena_room_events(text, timestamptz, integer)
  to authenticated;

comment on function public.list_arena_room_events(text, timestamptz, integer) is
  'Room battle events, block-aware, oldest-first, bounded.';
/**
 * Phase transitions are written by a trigger, not by callers.
 *
 * That is why neither `transition_due_arena_rooms()` (the scheduler) nor
 * `settle_arena_room()` had to be rewritten for this phase: whatever moves a
 * room forward produces its event, exactly once, with a deterministic
 * dedupe key. `PHASE_CHANGED` covers OPEN/CANCELLED; the other two get their
 * own vocabulary because the client animates them differently.
 */
create or replace function public.arena_room_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.arena_room_event_kind;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_kind := case new.status
    when 'JUDGING' then 'JUDGING_STARTED'::public.arena_room_event_kind
    when 'SETTLED' then 'RESULT_SETTLED'::public.arena_room_event_kind
    else 'PHASE_CHANGED'::public.arena_room_event_kind
  end;

  perform public.arena_event(
    new.id, new.topic_id, v_kind, null, null,
    jsonb_build_object('status', new.status::text),
    v_kind::text || ':' || new.id || ':' || new.status::text
  );
  return new;
end;
$$;

drop trigger if exists arena_rooms_status_event on public.arena_rooms;
create trigger arena_rooms_status_event
  after update on public.arena_rooms
  for each row execute function public.arena_room_status_event();

/**
 * An evidence BURST is a real, computed fact (three citations inside three
 * minutes), not a tap. Bucketed to the minute so a heated room cannot write a
 * row per upload.
 */
create or replace function public.arena_evidence_surge_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent integer;
  v_bucket text;
begin
  if new.hidden_at is not null then
    return new;
  end if;

  select count(*)::integer into v_recent
    from public.arena_room_evidence e
   where e.room_id = new.room_id
     and e.hidden_at is null
     and e.created_at > now() - interval '3 minutes';

  if v_recent < 3 then
    return new;
  end if;

  v_bucket := to_char(now(), 'YYYYMMDDHH24MI');
  perform public.arena_event(
    new.room_id, new.topic_id, 'EVIDENCE_SURGED', new.author_id, null,
    jsonb_build_object('recentCount', v_recent),
    'EVIDENCE_SURGED:' || new.room_id || ':' || v_bucket
  );
  return new;
end;
$$;

drop trigger if exists arena_room_evidence_surge on public.arena_room_evidence;
create trigger arena_room_evidence_surge
  after insert on public.arena_room_evidence
  for each row execute function public.arena_evidence_surge_event();

-- ── 13. Expiry sweep ────────────────────────────────────────────────────────
/**
 * Retire calls nobody answered. Bounded, oldest-deadline-first, and it records
 * the truth in the room feed so a stalled call is visible rather than silent.
 */
create or replace function public.expire_arena_backup_invites(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  v_n     integer := 0;
  r       record;
begin
  for r in
    select i.id, i.room_id, i.topic_id, i.caller_id, i.recipient_id
      from public.arena_backup_invites i
     where i.status = 'PENDING'
       and i.expires_at <= now()
     order by i.expires_at asc, i.id asc
     limit v_limit
  loop
    update public.arena_backup_invites
       set status = 'EXPIRED', responded_at = now()
     where id = r.id and status = 'PENDING';
    if found then
      v_n := v_n + 1;
      perform public.arena_event(
        r.room_id, r.topic_id, 'BACKUP_EXPIRED', r.caller_id, r.recipient_id,
        jsonb_build_object('inviteId', r.id), 'BACKUP_EXPIRED:' || r.id
      );
    end if;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.expire_arena_backup_invites(integer)
  from public, anon, authenticated;
grant execute on function public.expire_arena_backup_invites(integer) to service_role;

comment on function public.expire_arena_backup_invites(integer) is
  'Bounded sweep: un-answered calls retire and say so in the room feed.';

