-- ============================================================================
-- CLASH 2.0 · Phase 13 — Live Daily Arena (schema + server authority)
-- Depends on 20261002150000_live_arena_enums.sql (committed enum labels).
-- ----------------------------------------------------------------------------
-- One Topic per day (optionally per Hood). People join with a stance, get
-- auto-placed into a capacity-bounded Room, argue in a realtime thread, attach
-- evidence, then judge: one side vote + one best-argument vote each. The server
-- owns every phase transition, every tally and every reward.
--
-- AUTHORITY MODEL
--   · No client writes. Every table is `revoke all` + `grant select`, and every
--     mutation goes through a SECURITY DEFINER RPC with `set search_path = ''`.
--   · The actor is always `my_profile_id()`. No RPC accepts a profile id.
--   · Phase gates are read from the TOPIC clock (opens/final/judging/closes),
--     never from a client-supplied timestamp.
--
-- PRIVACY (non-negotiable, mirrors Mindshift + Hood Prediction)
--   · A participant row is owner-only: a stance is private, forever. The room
--     never learns who agreed with what, and no RPC returns a stance breakdown.
--   · Side votes and best-argument votes are owner-only rows. Tallies become
--     public only through arena_room_results, i.e. only after settlement.
--   · Mindshift for a room is an aggregate (counts + percent), never a matrix.
--   · Messages and evidence are visible to ROOM MEMBERS only, and are filtered
--     by the same block semantics the Arena feed uses.
--
-- CENTRAL RATE LIMITS (tune here, not in the app)
--   arena_room_message    30 / 10 minutes
--   arena_room_react      60 / 10 minutes
--   arena_evidence         8 / 1 hour
--   arena_evidence_mark   60 / 10 minutes
--   arena_room_join       20 / 1 hour
--
-- REWARDS (settle_arena_room only, idempotent, reputation-only — no coins)
--   arena_participation   +10  every debater
--   arena_winning_side    +25  voted with the winning side (skipped on DRAW)
--   arena_best_argument   +40  author of the most-voted argument
--   arena_useful_evidence +15  author of evidence with >= 3 useful marks (once)
--
-- Intentionally deferred: spectator-only reads, cross-room leaderboards, coins,
-- notifications, per-message moderation queues (reports already cover both new
-- report_target labels).
-- ============================================================================

-- ── 1. Topics ───────────────────────────────────────────────────────────────
-- The clock lives here, so a room can never disagree with its topic about which
-- phase it is in. Strictly ordered: opens < final_arguments < judging < closes.
create table if not exists public.arena_daily_topics (
  id                 text primary key,
  title              text not null check (char_length(btrim(title)) between 1 and 140),
  description        text check (description is null or char_length(description) <= 400),
  hood               public.hood_id,
  status             public.arena_topic_status not null default 'scheduled',
  opens_at           timestamptz not null default now(),
  final_arguments_at timestamptz not null,
  judging_at         timestamptz not null,
  closes_at          timestamptz not null,
  created_at         timestamptz not null default now(),
  constraint arena_daily_topics_phase_order check (
    opens_at < final_arguments_at
    and final_arguments_at < judging_at
    and judging_at < closes_at
  )
);

create index if not exists arena_daily_topics_status_idx
  on public.arena_daily_topics (status, closes_at desc);
create index if not exists arena_daily_topics_live_idx
  on public.arena_daily_topics (closes_at)
  where status = 'live';
create index if not exists arena_daily_topics_hood_idx
  on public.arena_daily_topics (hood, closes_at desc);

-- ── 2. Rooms ────────────────────────────────────────────────────────────────
-- A room is a capacity-bounded shard of a topic. `participant_count` is a
-- denormalised counter owned by join_arena_topic (never by a client), and it is
-- the value the placement algorithm locks against.
create table if not exists public.arena_rooms (
  id                text primary key,
  topic_id          text not null references public.arena_daily_topics (id) on delete cascade,
  status            public.arena_room_status not null default 'OPEN',
  capacity          integer not null default 40 check (capacity between 20 and 50),
  participant_count integer not null default 0 check (participant_count >= 0),
  opens_at          timestamptz not null default now(),
  closes_at         timestamptz not null,
  created_at        timestamptz not null default now(),
  constraint arena_rooms_window check (closes_at > opens_at),
  constraint arena_rooms_capacity_respected check (participant_count <= capacity)
);

create index if not exists arena_rooms_topic_idx
  on public.arena_rooms (topic_id, created_at asc);
create index if not exists arena_rooms_open_idx
  on public.arena_rooms (topic_id, participant_count)
  where status = 'OPEN';
create index if not exists arena_rooms_due_idx
  on public.arena_rooms (status, closes_at)
  where status not in ('SETTLED', 'CANCELLED');

-- ── 3. Participants ─────────────────────────────────────────────────────────
-- UNIQUE (topic_id, profile_id): one room per topic per person. That is the
-- product rule, enforced by the database rather than by remembering to check.
-- `initial_stance` is captured at join and is immutable; `final_stance` is the
-- Mindshift half, writable exactly once after settlement.
create table if not exists public.arena_room_participants (
  room_id           text not null references public.arena_rooms (id) on delete cascade,
  topic_id          text not null references public.arena_daily_topics (id) on delete cascade,
  profile_id        text not null references public.profiles (id) on delete cascade,
  initial_stance    public.take_stance not null,
  final_stance      public.take_stance,
  final_recorded_at timestamptz,
  role              public.arena_participant_role not null default 'debater',
  joined_at         timestamptz not null default now(),
  primary key (room_id, profile_id),
  unique (topic_id, profile_id),
  constraint arena_room_participants_final_complete check (
    (final_stance is null and final_recorded_at is null)
    or (final_stance is not null and final_recorded_at is not null)
  ),
  constraint arena_room_participants_final_after_join check (
    final_recorded_at is null or final_recorded_at >= joined_at
  )
);

create index if not exists arena_room_participants_profile_idx
  on public.arena_room_participants (profile_id, joined_at desc);
create index if not exists arena_room_participants_room_idx
  on public.arena_room_participants (room_id, role);

-- ── 4. Messages ─────────────────────────────────────────────────────────────
-- Same content model as a rebuttal (text | owned upload | Tenor GIF), plus a
-- `system` kind reserved for server-authored phase notices. `hidden_at` is the
-- moderation tombstone; rows are never hard-deleted so a report stays auditable.
create table if not exists public.arena_room_messages (
  id                text primary key,
  room_id           text not null references public.arena_rooms (id) on delete cascade,
  author_id         text not null references public.profiles (id) on delete cascade,
  kind              public.arena_message_kind not null default 'text',
  body              text not null default '',
  parent_message_id text references public.arena_room_messages (id) on delete set null,
  media_object_id   text references public.media_objects (id),
  media_url         text,
  media_kind        public.media_kind,
  gif_provider      text,
  gif_external_id   text,
  hidden_at         timestamptz,
  created_at        timestamptz not null default now(),
  constraint arena_room_messages_gif_provider_check
    check (gif_provider is null or gif_provider = 'tenor'),
  constraint arena_room_messages_has_content check (
    char_length(body) <= 500
    and (
      char_length(btrim(body)) >= 1
      or media_object_id is not null
      or (kind = 'gif' and gif_provider is not null and gif_external_id is not null and media_url is not null)
    )
  ),
  constraint arena_room_messages_media_complete check (
    -- text / system: no attachment at all
    (kind in ('text', 'system') and media_object_id is null and media_kind is null
      and media_url is null and gif_provider is null and gif_external_id is null)
    -- owned upload
    or (kind = 'media' and media_object_id is not null and media_kind in ('image', 'video')
      and media_url is not null and gif_provider is null and gif_external_id is null)
    -- external GIF (no media_object)
    or (kind = 'gif' and media_object_id is null and media_kind = 'gif'
      and media_url is not null and gif_provider is not null and gif_external_id is not null)
  ),
  constraint arena_room_messages_no_self_parent check (parent_message_id is distinct from id)
);

create index if not exists arena_room_messages_room_idx
  on public.arena_room_messages (room_id, created_at desc);
create index if not exists arena_room_messages_author_idx
  on public.arena_room_messages (author_id, created_at desc);
create index if not exists arena_room_messages_parent_idx
  on public.arena_room_messages (parent_message_id)
  where parent_message_id is not null;

-- ── 5. Evidence ─────────────────────────────────────────────────────────────
-- Evidence is a first-class row, not a message: the UI loads the thread and the
-- evidence rail separately, and `useful_count` feeds the reward in settlement.
-- `message_id` is an optional back-link for a message that introduced it.
create table if not exists public.arena_room_evidence (
  id              text primary key,
  room_id         text not null references public.arena_rooms (id) on delete cascade,
  topic_id        text not null references public.arena_daily_topics (id) on delete cascade,
  author_id       text not null references public.profiles (id) on delete cascade,
  message_id      text references public.arena_room_messages (id) on delete set null,
  kind            public.arena_evidence_kind not null,
  title           text not null check (char_length(btrim(title)) between 1 and 140),
  source_url      text,
  media_object_id text references public.media_objects (id),
  media_url       text,
  useful_count    integer not null default 0 check (useful_count >= 0),
  hidden_at       timestamptz,
  created_at      timestamptz not null default now(),
  constraint arena_room_evidence_shape check (
    (kind = 'link' and source_url is not null
      and media_object_id is null and media_url is null)
    or (kind in ('image', 'video') and source_url is null
      and media_object_id is not null and media_url is not null)
  )
);

create index if not exists arena_room_evidence_room_idx
  on public.arena_room_evidence (room_id, created_at desc);
create index if not exists arena_room_evidence_useful_idx
  on public.arena_room_evidence (room_id, useful_count desc);
create index if not exists arena_room_evidence_author_idx
  on public.arena_room_evidence (author_id, created_at desc);

-- ── 6. Reactions / useful marks ─────────────────────────────────────────────
create table if not exists public.arena_room_message_reactions (
  message_id text not null references public.arena_room_messages (id) on delete cascade,
  profile_id text not null references public.profiles (id) on delete cascade,
  emoji      text not null default '🔥' check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, emoji)
);

create index if not exists arena_room_message_reactions_profile_idx
  on public.arena_room_message_reactions (profile_id);

create table if not exists public.arena_room_evidence_marks (
  evidence_id text not null references public.arena_room_evidence (id) on delete cascade,
  profile_id  text not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (evidence_id, profile_id)
);

create index if not exists arena_room_evidence_marks_profile_idx
  on public.arena_room_evidence_marks (profile_id);

-- ── 7. Ballots (private until settlement) ───────────────────────────────────
-- A side vote is AGREE or DISAGREE. DRAW is a RESULT, never a ballot — hence
-- the `side <> 'DRAW'` check instead of a second two-value enum.
create table if not exists public.arena_room_side_votes (
  room_id    text not null references public.arena_rooms (id) on delete cascade,
  profile_id text not null references public.profiles (id) on delete cascade,
  side       public.arena_winning_side not null,
  created_at timestamptz not null default now(),
  primary key (room_id, profile_id),
  constraint arena_room_side_votes_no_draw_ballot check (side <> 'DRAW')
);

create index if not exists arena_room_side_votes_tally_idx
  on public.arena_room_side_votes (room_id, side);

-- One best-argument vote per participant per room (the PK is the rule).
create table if not exists public.arena_room_argument_votes (
  room_id    text not null references public.arena_rooms (id) on delete cascade,
  profile_id text not null references public.profiles (id) on delete cascade,
  message_id text not null references public.arena_room_messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, profile_id)
);

create index if not exists arena_room_argument_votes_tally_idx
  on public.arena_room_argument_votes (room_id, message_id);

-- ── 8. Results (the only public tally surface) ──────────────────────────────
create table if not exists public.arena_room_results (
  room_id                   text primary key references public.arena_rooms (id) on delete cascade,
  winning_side              public.arena_winning_side not null,
  agree_votes               integer not null default 0 check (agree_votes >= 0),
  disagree_votes            integer not null default 0 check (disagree_votes >= 0),
  best_argument_message_id  text references public.arena_room_messages (id) on delete set null,
  best_argument_author_id   text references public.profiles (id) on delete set null,
  participant_count         integer not null default 0 check (participant_count >= 0),
  mindshift_changed_count   integer not null default 0 check (mindshift_changed_count >= 0),
  mindshift_completed_count integer not null default 0 check (mindshift_completed_count >= 0),
  settled_at                timestamptz not null default now()
);

-- ── 9. Reward ledger link ───────────────────────────────────────────────────
-- An arena award has no clash_id; it has a room. Nullable both ways so the
-- ledger stays append-only and the Clash engine is untouched.
alter table public.reputation_events
  add column if not exists arena_room_id text references public.arena_rooms (id) on delete set null;

create index if not exists reputation_events_arena_room_idx
  on public.reputation_events (arena_room_id)
  where arena_room_id is not null;

-- ── 10. Helpers ─────────────────────────────────────────────────────────────
/** Opaque, collision-resistant row id: new_arena_id('ar_') -> 'ar_1a2b…'. */
create or replace function public.new_arena_id(p_prefix text)
returns text
language sql
volatile
set search_path = ''
as $$
  select p_prefix || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16));
$$;

/**
 * True for a link a room may cite. HTTPS only, so `javascript:`, `data:`,
 * `file:` and plain `http:` are all rejected by the anchor alone. The host must
 * look like a real domain (at least one dot + an alphabetic TLD), and loopback /
 * RFC1918 / link-local hosts are refused so a citation can never be used to
 * probe infrastructure from a link unfurler.
 */
create or replace function public.is_allowed_http_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_url is not null
    and char_length(p_url) between 12 and 2048
    and p_url !~ '[[:space:]]'
    and p_url ~ '^https://[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,24}(:[0-9]{1,5})?(/[^[:space:]]*)?$'
    and p_url !~* '^https://(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)'
    and p_url !~* '^https://172\.(1[6-9]|2[0-9]|3[01])\.'
$$;

/** True when the caller is a participant of `p_room_id`. Definer so a policy
 *  can ask the question without recursing into participants' own RLS. */
create or replace function public.arena_is_room_member(p_room_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.arena_room_participants p
      join public.profiles pr on pr.id = p.profile_id
     where p.room_id = p_room_id
       and pr.auth_user_id is not null
       and pr.auth_user_id = auth.uid()
  );
$$;

/** Room that owns a message — used by reaction policies so they never have to
 *  read through arena_room_messages' own (stricter) RLS. */
create or replace function public.arena_message_room(p_message_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.room_id from public.arena_room_messages m where m.id = p_message_id;
$$;

/** Room that owns an evidence row (same reason as arena_message_room). */
create or replace function public.arena_evidence_room(p_evidence_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select e.room_id from public.arena_room_evidence e where e.id = p_evidence_id;
$$;

/** Block-aware visibility between two profiles (either direction, plus mutes),
 *  matching the Arena feed's semantics. */
create or replace function public.arena_actor_hidden(p_viewer text, p_author text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_viewer is null or p_author is null or p_viewer = p_author then false
    else exists (
           select 1 from public.blocks b
            where (b.blocker_id = p_viewer and b.blocked_id = p_author)
               or (b.blocker_id = p_author and b.blocked_id = p_viewer)
         )
      or exists (
           select 1 from public.mutes m
            where m.muter_id = p_viewer and m.muted_id = p_author
         )
  end;
$$;

/** Derived phase name for a topic clock. Never trusts a stored value alone. */
create or replace function public.arena_topic_phase(
  p_status             public.arena_topic_status,
  p_opens_at           timestamptz,
  p_final_arguments_at timestamptz,
  p_judging_at         timestamptz,
  p_closes_at          timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'closed' or now() >= p_closes_at then 'closed'
    when now() >= p_judging_at then 'judging'
    when now() >= p_final_arguments_at then 'final_arguments'
    when now() >= p_opens_at and p_status = 'live' then 'open'
    else 'scheduled'
  end;
$$;

/** Compact author card. Identical shape everywhere a profile appears. */
create or replace function public.arena_profile_json(p_profile_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.id is null then null else jsonb_build_object(
    'id', p.id,
    'handle', p.handle,
    'name', p.name,
    'avatarTint', p.avatar_tint,
    'rank', p.rank
  ) end
  from public.profiles p where p.id = p_profile_id;
$$;

-- ── 11. Payload builders (internal) ─────────────────────────────────────────
/**
 * Topic card. Exposes the clock, the real participant total and the viewer's
 * OWN membership — and deliberately nothing about how the room is split. There
 * is no aggregate stance percentage here: that is the anti-bandwagon rule.
 */
create or replace function public.arena_topic_payload(
  p_topic  public.arena_daily_topics,
  p_viewer text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participants integer := 0;
  v_rooms        integer := 0;
  v_member       public.arena_room_participants%rowtype;
  v_room_status  public.arena_room_status;
begin
  select coalesce(sum(r.participant_count), 0)::integer,
         count(*) filter (where r.status not in ('SETTLED', 'CANCELLED'))::integer
    into v_participants, v_rooms
    from public.arena_rooms r
   where r.topic_id = p_topic.id;

  if p_viewer is not null then
    select * into v_member
      from public.arena_room_participants p
     where p.topic_id = p_topic.id and p.profile_id = p_viewer;
    if found then
      select r.status into v_room_status
        from public.arena_rooms r where r.id = v_member.room_id;
    end if;
  end if;

  return jsonb_build_object(
    'id', p_topic.id,
    'title', p_topic.title,
    'description', p_topic.description,
    'hood', p_topic.hood,
    'status', p_topic.status,
    'phase', public.arena_topic_phase(
      p_topic.status, p_topic.opens_at, p_topic.final_arguments_at,
      p_topic.judging_at, p_topic.closes_at
    ),
    'opensAt', p_topic.opens_at,
    'finalArgumentsAt', p_topic.final_arguments_at,
    'judgingAt', p_topic.judging_at,
    'closesAt', p_topic.closes_at,
    'createdAt', p_topic.created_at,
    'participantCount', v_participants,
    'activeRoomCount', v_rooms,
    'secondsRemaining', greatest(0, floor(extract(epoch from (p_topic.closes_at - now()))))::bigint,
    'viewerJoined', v_member.room_id is not null,
    'viewerRoomId', v_member.room_id,
    'viewerRoomStatus', v_room_status,
    'viewerStance', v_member.initial_stance,
    'viewerFinalStance', v_member.final_stance,
    'viewerRole', v_member.role
  );
end;
$$;

/** Settled tally for a room, or JSON null while the room is still live. */
create or replace function public.arena_result_payload(p_room_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'roomId', r.room_id,
    'winningSide', r.winning_side,
    'agreeVotes', r.agree_votes,
    'disagreeVotes', r.disagree_votes,
    'participantCount', r.participant_count,
    'mindshiftChangedCount', r.mindshift_changed_count,
    'mindshiftCompletedCount', r.mindshift_completed_count,
    'mindshiftChangedPercent', case
      when r.mindshift_completed_count = 0 then null
      else round((100.0 * r.mindshift_changed_count) / r.mindshift_completed_count)
    end,
    'settledAt', r.settled_at,
    'bestArgumentMessageId', r.best_argument_message_id,
    'bestArgumentAuthor', public.arena_profile_json(r.best_argument_author_id),
    'bestArgumentBody', (
      select m.body from public.arena_room_messages m
       where m.id = r.best_argument_message_id and m.hidden_at is null
    )
  )
  from public.arena_room_results r
  where r.room_id = p_room_id;
$$;

/** One message, with its reaction rollup. Best-argument tallies are withheld
 *  until the room is SETTLED — live counts would be a bandwagon signal. */
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

/** One evidence row, with the viewer's own useful mark. */
create or replace function public.arena_evidence_payload(
  p_evidence public.arena_room_evidence,
  p_viewer   text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_evidence.id,
    'roomId', p_evidence.room_id,
    'topicId', p_evidence.topic_id,
    'messageId', p_evidence.message_id,
    'kind', p_evidence.kind,
    'title', p_evidence.title,
    'sourceUrl', p_evidence.source_url,
    'mediaUrl', p_evidence.media_url,
    'usefulCount', p_evidence.useful_count,
    'createdAt', p_evidence.created_at,
    'isOwn', p_viewer is not null and p_evidence.author_id = p_viewer,
    'author', public.arena_profile_json(p_evidence.author_id),
    'viewerMarkedUseful', exists (
      select 1 from public.arena_room_evidence_marks mk
       where mk.evidence_id = p_evidence.id
         and p_viewer is not null
         and mk.profile_id = p_viewer
    )
  );
$$;

/** Room card: clock, capacity, the viewer's own membership, and (once the room
 *  is SETTLED) the public tally. Never any other participant's stance. */
create or replace function public.arena_room_payload(
  p_room   public.arena_rooms,
  p_viewer text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_topic   public.arena_daily_topics%rowtype;
  v_member  public.arena_room_participants%rowtype;
  v_is_member boolean := false;
begin
  select * into v_topic
    from public.arena_daily_topics where id = p_room.topic_id;

  if p_viewer is not null then
    select * into v_member
      from public.arena_room_participants p
     where p.room_id = p_room.id and p.profile_id = p_viewer;
    v_is_member := found;
  end if;

  return jsonb_build_object(
    'roomId', p_room.id,
    'topicId', p_room.topic_id,
    'status', p_room.status,
    'capacity', p_room.capacity,
    'participantCount', p_room.participant_count,
    'opensAt', p_room.opens_at,
    'closesAt', p_room.closes_at,
    'createdAt', p_room.created_at,
    'phase', public.arena_topic_phase(
      v_topic.status, v_topic.opens_at, v_topic.final_arguments_at,
      v_topic.judging_at, v_topic.closes_at
    ),
    'secondsRemaining', greatest(0, floor(extract(epoch from (p_room.closes_at - now()))))::bigint,
    'secondsToFinalArguments', greatest(0, floor(extract(epoch from (v_topic.final_arguments_at - now()))))::bigint,
    'secondsToJudging', greatest(0, floor(extract(epoch from (v_topic.judging_at - now()))))::bigint,
    'topic', jsonb_build_object(
      'id', v_topic.id,
      'title', v_topic.title,
      'description', v_topic.description,
      'hood', v_topic.hood,
      'status', v_topic.status,
      'opensAt', v_topic.opens_at,
      'finalArgumentsAt', v_topic.final_arguments_at,
      'judgingAt', v_topic.judging_at,
      'closesAt', v_topic.closes_at
    ),
    'viewer', case when not v_is_member then null else jsonb_build_object(
      'isMember', true,
      'role', v_member.role,
      'stance', v_member.initial_stance,
      'finalStance', v_member.final_stance,
      'finalRecordedAt', v_member.final_recorded_at,
      'joinedAt', v_member.joined_at,
      'hasSideVote', exists (
        select 1 from public.arena_room_side_votes sv
         where sv.room_id = p_room.id and sv.profile_id = p_viewer
      ),
      'hasArgumentVote', exists (
        select 1 from public.arena_room_argument_votes av
         where av.room_id = p_room.id and av.profile_id = p_viewer
      )
    ) end,
    'result', case
      when p_room.status <> 'SETTLED' then null
      else public.arena_result_payload(p_room.id)
    end
  );
end;
$$;

-- ── 12. Topic reads ─────────────────────────────────────────────────────────
/** Every topic that is live right now, newest window first. Guest-safe: the
 *  viewer fields are JSON null when there is no session. */
create or replace function public.list_live_arena_topics()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  r public.arena_daily_topics%rowtype;
begin
  for r in
    select t.*
      from public.arena_daily_topics t
     where t.status = 'live'
       and t.opens_at <= now()
       and t.closes_at > now()
     order by t.closes_at asc, t.id asc
  loop
    return next public.arena_topic_payload(r, v_viewer);
  end loop;
end;
$$;

/** One topic card. Scheduled topics are staff-only (same rule as the policy). */
create or replace function public.get_arena_topic(p_topic_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_topic  public.arena_daily_topics%rowtype;
begin
  select * into v_topic from public.arena_daily_topics where id = p_topic_id;
  if not found then
    raise exception 'topic does not exist' using errcode = 'P0002';
  end if;
  if v_topic.status = 'scheduled' and not public.is_staff() then
    raise exception 'topic is not available' using errcode = 'P0003';
  end if;
  return public.arena_topic_payload(v_topic, v_viewer);
end;
$$;

-- ── 13. Staff topic creation ────────────────────────────────────────────────
/** Staff / service_role seam so a scheduler can publish tomorrow's Topic. The
 *  clock is validated here once, and the table check enforces it forever. */
create or replace function public.create_arena_daily_topic(
  p_title              text,
  p_description        text default null,
  p_hood               public.hood_id default null,
  p_opens_at           timestamptz default null,
  p_final_arguments_at timestamptz default null,
  p_judging_at         timestamptz default null,
  p_closes_at          timestamptz default null,
  p_status             public.arena_topic_status default 'live'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title  text := btrim(p_title);
  v_desc   text := nullif(btrim(coalesce(p_description, '')), '');
  v_opens  timestamptz := coalesce(p_opens_at, now());
  v_final  timestamptz;
  v_judge  timestamptz;
  v_closes timestamptz;
  v_topic  public.arena_daily_topics%rowtype;
begin
  -- Staff session OR service_role (auth.uid() is null under service_role).
  if auth.role() is distinct from 'service_role' and not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 140 then
    raise exception 'title must be 1–140 characters' using errcode = 'P0003';
  end if;
  if v_desc is not null and char_length(v_desc) > 400 then
    raise exception 'description must be at most 400 characters' using errcode = 'P0003';
  end if;

  -- Default day shape: 20h debate, 2h final arguments, 2h judging.
  v_final  := coalesce(p_final_arguments_at, v_opens + interval '20 hours');
  v_judge  := coalesce(p_judging_at, v_final + interval '2 hours');
  v_closes := coalesce(p_closes_at, v_judge + interval '2 hours');

  if not (v_opens < v_final and v_final < v_judge and v_judge < v_closes) then
    raise exception 'topic phases must be strictly ordered' using errcode = 'P0003';
  end if;

  insert into public.arena_daily_topics (
    id, title, description, hood, status,
    opens_at, final_arguments_at, judging_at, closes_at
  ) values (
    public.new_arena_id('at_'), v_title, v_desc, p_hood, coalesce(p_status, 'live'),
    v_opens, v_final, v_judge, v_closes
  )
  returning * into v_topic;

  return public.arena_topic_payload(v_topic, public.my_profile_id());
end;
$$;

-- ── 14. join_arena_topic ────────────────────────────────────────────────────
/**
 * Join today's Topic with a stance and get auto-placed into a Room.
 *
 * Placement is serialised on the TOPIC row (`for update`), so two simultaneous
 * joins can never both read `participant_count = capacity - 1` and overfill a
 * room. Oldest non-full OPEN room wins, so rooms fill before new ones open.
 *
 * Idempotent by design: the UNIQUE (topic_id, profile_id) membership is
 * authoritative, and a second call returns the existing room and the stance
 * that was recorded the first time. A new stance is IGNORED, not an error — a
 * stance is immutable, exactly like Mindshift's initial stance.
 */
create or replace function public.join_arena_topic(
  p_topic_id text,
  p_stance   public.take_stance,
  p_role     public.arena_participant_role default 'debater'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     text := public.my_profile_id();
  v_topic    public.arena_daily_topics%rowtype;
  v_existing public.arena_room_participants%rowtype;
  v_room     public.arena_rooms%rowtype;
  v_room_id  text;
begin
  if v_user is null then
    raise exception 'sign in to join the Arena' using errcode = '42501';
  end if;
  if p_stance is null then
    raise exception 'pick a stance to join' using errcode = 'P0003';
  end if;

  -- Serialise placement for this topic.
  select * into v_topic
    from public.arena_daily_topics
   where id = p_topic_id
     for update;
  if not found then
    raise exception 'topic does not exist' using errcode = 'P0002';
  end if;

  if v_topic.status <> 'live' then
    raise exception 'topic is not live' using errcode = 'P0003';
  end if;
  if now() < v_topic.opens_at then
    raise exception 'topic has not opened yet' using errcode = 'P0003';
  end if;
  if now() >= v_topic.closes_at then
    raise exception 'topic is closed' using errcode = 'P0003';
  end if;

  -- Already in: hand back the existing membership, ignore the new stance.
  select * into v_existing
    from public.arena_room_participants
   where topic_id = p_topic_id and profile_id = v_user;
  if found then
    select * into v_room from public.arena_rooms where id = v_existing.room_id;
    return jsonb_build_object(
      'joined', false,
      'roomId', v_existing.room_id,
      'topicId', p_topic_id,
      'stance', v_existing.initial_stance,
      'role', v_existing.role,
      'status', v_room.status,
      'capacity', v_room.capacity,
      'participantCount', v_room.participant_count,
      'joinedAt', v_existing.joined_at
    );
  end if;

  perform public.assert_rate_limit(v_user, 'arena_room_join', 20, interval '1 hour');

  -- Oldest non-full OPEN room first; the topic lock makes this safe.
  select * into v_room
    from public.arena_rooms r
   where r.topic_id = p_topic_id
     and r.status = 'OPEN'
     and r.participant_count < r.capacity
   order by r.created_at asc, r.id asc
   limit 1
     for update;

  if not found then
    v_room_id := public.new_arena_id('ar_');
    insert into public.arena_rooms (
      id, topic_id, status, capacity, participant_count, opens_at, closes_at
    ) values (
      v_room_id, p_topic_id, 'OPEN', 40, 0,
      greatest(v_topic.opens_at, now()), v_topic.closes_at
    )
    returning * into v_room;
  end if;

  insert into public.arena_room_participants (
    room_id, topic_id, profile_id, initial_stance, role
  ) values (
    v_room.id, p_topic_id, v_user, p_stance, coalesce(p_role, 'debater')
  )
  returning * into v_existing;

  update public.arena_rooms
     set participant_count = participant_count + 1
   where id = v_room.id
  returning * into v_room;

  return jsonb_build_object(
    'joined', true,
    'roomId', v_room.id,
    'topicId', p_topic_id,
    'stance', v_existing.initial_stance,
    'role', v_existing.role,
    'status', v_room.status,
    'capacity', v_room.capacity,
    'participantCount', v_room.participant_count,
    'joinedAt', v_existing.joined_at
  );
end;
$$;


-- ── 15. get_arena_room ──────────────────────────────────────────────────────
create or replace function public.get_arena_room(p_room_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_room   public.arena_rooms%rowtype;
  v_status public.arena_topic_status;
begin
  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;

  select t.status into v_status
    from public.arena_daily_topics t where t.id = v_room.topic_id;

  -- A scheduled topic is not public yet; members and staff may always look.
  if v_status = 'scheduled'
     and not public.arena_is_room_member(p_room_id)
     and not public.is_staff() then
    raise exception 'room is not available' using errcode = 'P0003';
  end if;

  return public.arena_room_payload(v_room, v_viewer);
end;
$$;

-- ── 16. post_arena_room_message ─────────────────────────────────────────────
/**
 * Post into a room's thread. Membership + phase + content are all checked here;
 * the table constraints are the second line of defence. Media follows the same
 * authority rule as create_comment (owned + ready + public), GIFs follow the
 * Tenor host allowlist, and a reply across a block is refused.
 */
create or replace function public.post_arena_room_message(
  p_room_id           text,
  p_body              text,
  p_parent_message_id text default null,
  p_media_object_id   text default null,
  p_media_url         text default null,
  p_gif_provider      text default null,
  p_gif_external_id   text default null
)
returns setof public.arena_room_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author text := public.my_profile_id();
  v_body   text := coalesce(btrim(p_body), '');
  v_room   public.arena_rooms%rowtype;
  v_media  public.media_objects%rowtype;
  v_parent public.arena_room_messages%rowtype;
  v_is_gif boolean := p_gif_provider is not null or p_gif_external_id is not null;
  v_kind   public.arena_message_kind;
  v_row    public.arena_room_messages%rowtype;
begin
  if v_author is null then
    raise exception 'sign in to argue' using errcode = '42501';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if not public.arena_is_room_member(p_room_id) then
    raise exception 'join the room to argue' using errcode = '42501';
  end if;
  if v_room.status not in ('OPEN', 'FINAL_ARGUMENTS') then
    raise exception 'the room is not accepting arguments' using errcode = 'P0003';
  end if;

  if char_length(v_body) > 500 then
    raise exception 'an argument must be at most 500 characters' using errcode = 'P0003';
  end if;
  if v_is_gif and p_media_object_id is not null then
    raise exception 'choose either an upload or a gif, not both' using errcode = 'P0003';
  end if;
  if v_body = '' and p_media_object_id is null and not v_is_gif then
    raise exception 'an argument needs text or media' using errcode = 'P0003';
  end if;

  if v_is_gif then
    if p_gif_provider is distinct from 'tenor' then
      raise exception 'unsupported gif provider' using errcode = 'P0003';
    end if;
    if p_gif_external_id is null or btrim(p_gif_external_id) = ''
       or char_length(p_gif_external_id) > 64 then
      raise exception 'gif id is required' using errcode = 'P0003';
    end if;
    if p_gif_external_id !~ '^[A-Za-z0-9_-]+$' then
      raise exception 'gif id is invalid' using errcode = 'P0003';
    end if;
    if not public.is_allowed_tenor_media_url(p_media_url) then
      raise exception 'gif url is not an allowed tenor host' using errcode = 'P0005';
    end if;
    v_kind := 'gif';
  elsif p_media_object_id is not null then
    select * into v_media from public.media_objects where id = p_media_object_id;
    if not found then
      raise exception 'media not found' using errcode = 'P0002';
    end if;
    if v_media.owner_id <> v_author then
      raise exception 'not your media' using errcode = 'P0001';
    end if;
    if v_media.status <> 'ready' then
      raise exception 'media is not ready' using errcode = 'P0004';
    end if;
    if v_media.visibility <> 'public' then
      raise exception 'arena arguments must use public media' using errcode = 'P0005';
    end if;
    if v_media.media_kind not in ('image', 'video') then
      raise exception 'unsupported media kind' using errcode = 'P0003';
    end if;
    if p_media_url is null or btrim(p_media_url) = '' then
      raise exception 'media url is required' using errcode = 'P0003';
    end if;
    v_kind := 'media';
  else
    v_kind := 'text';
  end if;

  if p_parent_message_id is not null then
    select * into v_parent
      from public.arena_room_messages where id = p_parent_message_id;
    if not found or v_parent.room_id <> p_room_id then
      raise exception 'parent argument is not in this room' using errcode = 'P0002';
    end if;
    if v_parent.hidden_at is not null then
      raise exception 'parent argument is not available' using errcode = 'P0003';
    end if;
    if public.arena_actor_hidden(v_author, v_parent.author_id) then
      raise exception 'blocked' using errcode = 'P0005';
    end if;
  end if;

  perform public.assert_rate_limit(v_author, 'arena_room_message', 30, interval '10 minutes');

  insert into public.arena_room_messages (
    id, room_id, author_id, kind, body, parent_message_id,
    media_object_id, media_url, media_kind, gif_provider, gif_external_id
  ) values (
    public.new_arena_id('am_'),
    p_room_id,
    v_author,
    v_kind,
    v_body,
    p_parent_message_id,
    case when v_kind = 'media' then p_media_object_id else null end,
    case when v_kind = 'text' then null else p_media_url end,
    case
      when v_kind = 'gif' then 'gif'::public.media_kind
      when v_kind = 'media' then v_media.media_kind
      else null
    end,
    case when v_kind = 'gif' then 'tenor' else null end,
    case when v_kind = 'gif' then p_gif_external_id else null end
  )
  returning * into v_row;

  return next v_row;
end;
$$;

-- ── 17. list_arena_room_messages ────────────────────────────────────────────
/** Newest-first page of a room's thread. Members only. Hidden messages and
 *  blocked/muted authors are excluded server-side, not in the app. */
create or replace function public.list_arena_room_messages(
  p_room_id text,
  p_before  timestamptz default null,
  p_limit   integer default 50
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
       and not public.arena_actor_hidden(v_viewer, m.author_id)
     order by m.created_at desc, m.id desc
     limit v_limit
  loop
    return next public.arena_message_payload(r, v_viewer, v_reveal);
  end loop;
end;
$$;

-- ── 18. react_arena_room_message ────────────────────────────────────────────
/** Toggle one emoji reaction. Idempotent per (message, profile, emoji). */
create or replace function public.react_arena_room_message(
  p_message_id text,
  p_emoji      text default '🔥'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    text := public.my_profile_id();
  v_emoji   text := coalesce(btrim(p_emoji), '');
  v_msg     public.arena_room_messages%rowtype;
  v_room    public.arena_rooms%rowtype;
  v_reacted boolean;
  v_count   integer;
begin
  if v_user is null then
    raise exception 'sign in to react' using errcode = '42501';
  end if;
  if v_emoji = '' or char_length(v_emoji) > 8 then
    raise exception 'pick a single reaction' using errcode = 'P0003';
  end if;

  select * into v_msg from public.arena_room_messages where id = p_message_id;
  if not found then
    raise exception 'argument does not exist' using errcode = 'P0002';
  end if;
  if v_msg.hidden_at is not null then
    raise exception 'argument is not available' using errcode = 'P0003';
  end if;
  if not public.arena_is_room_member(v_msg.room_id) then
    raise exception 'join the room to react' using errcode = '42501';
  end if;

  select * into v_room from public.arena_rooms where id = v_msg.room_id;
  if v_room.status in ('SETTLED', 'CANCELLED') then
    raise exception 'the room is closed' using errcode = 'P0003';
  end if;
  if public.arena_actor_hidden(v_user, v_msg.author_id) then
    raise exception 'blocked' using errcode = 'P0005';
  end if;

  perform public.assert_rate_limit(v_user, 'arena_room_react', 60, interval '10 minutes');

  delete from public.arena_room_message_reactions
   where message_id = p_message_id and profile_id = v_user and emoji = v_emoji;

  if found then
    v_reacted := false;
  else
    insert into public.arena_room_message_reactions (message_id, profile_id, emoji)
    values (p_message_id, v_user, v_emoji);
    v_reacted := true;
  end if;

  select count(*)::integer into v_count
    from public.arena_room_message_reactions
   where message_id = p_message_id and emoji = v_emoji;

  return jsonb_build_object(
    'messageId', p_message_id,
    'emoji', v_emoji,
    'reacted', v_reacted,
    'count', v_count
  );
end;
$$;

-- ── 19. submit_arena_evidence ───────────────────────────────────────────────
/**
 * Attach a citation to the room. Links must pass is_allowed_http_url (HTTPS,
 * real-looking host, no loopback/private ranges). Image/video evidence must be
 * an owned, ready, public media_object — the same rule as every other upload
 * path. Evidence is a separate row from the thread: the UI loads both.
 */
create or replace function public.submit_arena_evidence(
  p_room_id         text,
  p_kind            public.arena_evidence_kind,
  p_title           text,
  p_source_url      text default null,
  p_media_object_id text default null,
  p_media_url       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author text := public.my_profile_id();
  v_title  text := btrim(coalesce(p_title, ''));
  v_room   public.arena_rooms%rowtype;
  v_media  public.media_objects%rowtype;
  v_row    public.arena_room_evidence%rowtype;
begin
  if v_author is null then
    raise exception 'sign in to add evidence' using errcode = '42501';
  end if;
  if p_kind is null then
    raise exception 'evidence kind is required' using errcode = 'P0003';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 140 then
    raise exception 'evidence needs a title of 1–140 characters' using errcode = 'P0003';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if not public.arena_is_room_member(p_room_id) then
    raise exception 'join the room to add evidence' using errcode = '42501';
  end if;
  if v_room.status not in ('OPEN', 'FINAL_ARGUMENTS') then
    raise exception 'the room is not accepting evidence' using errcode = 'P0003';
  end if;

  if p_kind = 'link' then
    if p_media_object_id is not null or p_media_url is not null then
      raise exception 'a link citation cannot carry an upload' using errcode = 'P0003';
    end if;
    if not public.is_allowed_http_url(p_source_url) then
      raise exception 'evidence link must be a public https url' using errcode = 'P0005';
    end if;
  else
    if p_source_url is not null then
      raise exception 'an upload citation cannot carry a source url' using errcode = 'P0003';
    end if;
    if p_media_object_id is null then
      raise exception 'evidence media is required' using errcode = 'P0003';
    end if;
    select * into v_media from public.media_objects where id = p_media_object_id;
    if not found then
      raise exception 'media not found' using errcode = 'P0002';
    end if;
    if v_media.owner_id <> v_author then
      raise exception 'not your media' using errcode = 'P0001';
    end if;
    if v_media.status <> 'ready' then
      raise exception 'media is not ready' using errcode = 'P0004';
    end if;
    if v_media.visibility <> 'public' then
      raise exception 'arena evidence must use public media' using errcode = 'P0005';
    end if;
    if v_media.media_kind::text <> p_kind::text then
      raise exception 'evidence kind does not match the upload' using errcode = 'P0003';
    end if;
    if p_media_url is null or btrim(p_media_url) = '' then
      raise exception 'media url is required' using errcode = 'P0003';
    end if;
  end if;

  perform public.assert_rate_limit(v_author, 'arena_evidence', 8, interval '1 hour');

  insert into public.arena_room_evidence (
    id, room_id, topic_id, author_id, kind, title,
    source_url, media_object_id, media_url
  ) values (
    public.new_arena_id('ae_'),
    p_room_id,
    v_room.topic_id,
    v_author,
    p_kind,
    v_title,
    case when p_kind = 'link' then p_source_url else null end,
    case when p_kind = 'link' then null else p_media_object_id end,
    case when p_kind = 'link' then null else p_media_url end
  )
  returning * into v_row;

  return public.arena_evidence_payload(v_row, v_author);
end;
$$;

/** Newest-first evidence rail for a room. Members only. */
create or replace function public.list_arena_room_evidence(
  p_room_id text,
  p_limit   integer default 50
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit  integer := greatest(1, least(coalesce(p_limit, 50), 100));
  r public.arena_room_evidence%rowtype;
begin
  if v_viewer is null then
    raise exception 'sign in to read the room' using errcode = '42501';
  end if;
  if not public.arena_is_room_member(p_room_id) then
    raise exception 'join the room to read it' using errcode = '42501';
  end if;

  for r in
    select e.*
      from public.arena_room_evidence e
     where e.room_id = p_room_id
       and e.hidden_at is null
       and not public.arena_actor_hidden(v_viewer, e.author_id)
     order by e.useful_count desc, e.created_at desc, e.id desc
     limit v_limit
  loop
    return next public.arena_evidence_payload(r, v_viewer);
  end loop;
end;
$$;

-- ── 20. mark_arena_evidence_useful ──────────────────────────────────────────
/**
 * Toggle a "useful" mark. Self-marking is refused: `useful_count >= 3` pays
 * reputation at settlement, so an author must never be able to move their own
 * threshold. `useful_count` is recomputed from the mark table, never
 * incremented blindly, so a toggle can never drift.
 */
create or replace function public.mark_arena_evidence_useful(p_evidence_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   text := public.my_profile_id();
  v_ev     public.arena_room_evidence%rowtype;
  v_room   public.arena_rooms%rowtype;
  v_marked boolean;
  v_count  integer;
begin
  if v_user is null then
    raise exception 'sign in to mark evidence' using errcode = '42501';
  end if;

  select * into v_ev from public.arena_room_evidence where id = p_evidence_id for update;
  if not found then
    raise exception 'evidence does not exist' using errcode = 'P0002';
  end if;
  if v_ev.hidden_at is not null then
    raise exception 'evidence is not available' using errcode = 'P0003';
  end if;
  if v_ev.author_id = v_user then
    raise exception 'you cannot mark your own evidence useful' using errcode = 'P0001';
  end if;
  if not public.arena_is_room_member(v_ev.room_id) then
    raise exception 'join the room to mark evidence' using errcode = '42501';
  end if;

  select * into v_room from public.arena_rooms where id = v_ev.room_id;
  if v_room.status in ('SETTLED', 'CANCELLED') then
    raise exception 'the room is closed' using errcode = 'P0003';
  end if;

  perform public.assert_rate_limit(v_user, 'arena_evidence_mark', 60, interval '10 minutes');

  delete from public.arena_room_evidence_marks
   where evidence_id = p_evidence_id and profile_id = v_user;

  if found then
    v_marked := false;
  else
    insert into public.arena_room_evidence_marks (evidence_id, profile_id)
    values (p_evidence_id, v_user);
    v_marked := true;
  end if;

  select count(*)::integer into v_count
    from public.arena_room_evidence_marks where evidence_id = p_evidence_id;

  update public.arena_room_evidence
     set useful_count = v_count
   where id = p_evidence_id;

  return jsonb_build_object(
    'evidenceId', p_evidence_id,
    'marked', v_marked,
    'usefulCount', v_count
  );
end;
$$;

-- ── 21. Ballots ─────────────────────────────────────────────────────────────
/** One side vote per debater, JUDGING phase only, AGREE or DISAGREE. Written
 *  once and never rewritten — the tally has to be replay-proof. */
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
  if v_user is null then
    raise exception 'sign in to vote' using errcode = '42501';
  end if;
  if p_side is null or p_side = 'DRAW' then
    raise exception 'vote AGREE or DISAGREE' using errcode = 'P0003';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if v_room.status <> 'JUDGING' then
    raise exception 'the room is not in judging' using errcode = 'P0003';
  end if;

  select * into v_part
    from public.arena_room_participants
   where room_id = p_room_id and profile_id = v_user;
  if not found then
    raise exception 'join the room to vote' using errcode = '42501';
  end if;
  if v_part.role <> 'debater' then
    raise exception 'only debaters may vote' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.arena_room_side_votes
     where room_id = p_room_id and profile_id = v_user
  ) then
    raise exception 'side vote already recorded' using errcode = 'P0006';
  end if;

  insert into public.arena_room_side_votes (room_id, profile_id, side)
  values (p_room_id, v_user, p_side);

  return jsonb_build_object('roomId', p_room_id, 'side', p_side, 'recorded', true);
end;
$$;

/** One best-argument vote per debater, JUDGING phase only. You cannot vote for
 *  your own argument, and `system` notices are not arguments. */
create or replace function public.submit_arena_argument_vote(
  p_room_id    text,
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
  v_msg  public.arena_room_messages%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to vote' using errcode = '42501';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if v_room.status <> 'JUDGING' then
    raise exception 'the room is not in judging' using errcode = 'P0003';
  end if;

  select * into v_part
    from public.arena_room_participants
   where room_id = p_room_id and profile_id = v_user;
  if not found then
    raise exception 'join the room to vote' using errcode = '42501';
  end if;
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
  if exists (
    select 1 from public.arena_room_argument_votes
     where room_id = p_room_id and profile_id = v_user
  ) then
    raise exception 'best argument vote already recorded' using errcode = 'P0006';
  end if;

  insert into public.arena_room_argument_votes (room_id, profile_id, message_id)
  values (p_room_id, v_user, p_message_id);

  return jsonb_build_object('roomId', p_room_id, 'messageId', p_message_id, 'recorded', true);
end;
$$;

-- ── 22. record_arena_final_stance ───────────────────────────────────────────
/**
 * The Mindshift half: after the verdict, did the room move you? Requires a
 * participant row (the initial stance was captured at join) and is immutable
 * once written. The result row's aggregate counters are advanced in the same
 * statement so the public tally never disagrees with the participant rows.
 */
create or replace function public.record_arena_final_stance(
  p_room_id text,
  p_stance  public.take_stance
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
  v_changed boolean;
begin
  if v_user is null then
    raise exception 'sign in to record a stance' using errcode = '42501';
  end if;
  if p_stance is null then
    raise exception 'pick a stance' using errcode = 'P0003';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if v_room.status <> 'SETTLED' then
    raise exception 'the room has not settled yet' using errcode = 'P0003';
  end if;

  select * into v_part
    from public.arena_room_participants
   where room_id = p_room_id and profile_id = v_user
     for update;
  if not found then
    raise exception 'you were not in this room' using errcode = 'P0007';
  end if;
  if v_part.final_stance is not null then
    raise exception 'final stance already recorded' using errcode = 'P0008';
  end if;

  v_changed := v_part.initial_stance <> p_stance;

  update public.arena_room_participants
     set final_stance = p_stance,
         final_recorded_at = now()
   where room_id = p_room_id and profile_id = v_user
  returning * into v_part;

  update public.arena_room_results
     set mindshift_completed_count = mindshift_completed_count + 1,
         mindshift_changed_count = mindshift_changed_count + case when v_changed then 1 else 0 end
   where room_id = p_room_id;

  return jsonb_build_object(
    'roomId', p_room_id,
    'initialStance', v_part.initial_stance,
    'finalStance', v_part.final_stance,
    'finalRecordedAt', v_part.final_recorded_at,
    'changed', v_changed
  );
end;
$$;

-- ── 23. arena_room_mindshift_stats ──────────────────────────────────────────
/**
 * Room-level Mindshift aggregate. Same shape and same null rule as
 * mindshift_stats: zero completed means `changedPercent` is JSON null, not 0 —
 * "nobody finished" is not "0% moved". Readable once the room has SETTLED; a
 * participant who has already recorded their own final stance may look earlier.
 * Individual stances are never exposed here.
 */
create or replace function public.arena_room_mindshift_stats(p_room_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer  text := public.my_profile_id();
  v_room    public.arena_rooms%rowtype;
  v_initial integer;
  v_done    integer;
  v_changed integer;
  v_mine    boolean := false;
begin
  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;

  if v_viewer is not null then
    select exists (
      select 1 from public.arena_room_participants p
       where p.room_id = p_room_id
         and p.profile_id = v_viewer
         and p.final_stance is not null
    ) into v_mine;
  end if;

  if v_room.status <> 'SETTLED' and not v_mine and not public.is_staff() then
    raise exception 'mindshift opens after the verdict' using errcode = 'P0003';
  end if;

  select
    count(*)::integer,
    count(*) filter (where p.final_stance is not null)::integer,
    count(*) filter (where p.final_stance is not null and p.initial_stance <> p.final_stance)::integer
    into v_initial, v_done, v_changed
    from public.arena_room_participants p
   where p.room_id = p_room_id;

  return jsonb_build_object(
    'roomId', p_room_id,
    'totalInitialParticipants', v_initial,
    'completedParticipants', v_done,
    'changedCount', v_changed,
    'changedPercent', case
      when v_done = 0 then null
      else round((100.0 * v_changed) / v_done)
    end
  );
end;
$$;

-- ── 24. settle_arena_room ───────────────────────────────────────────────────
/**
 * Close a room: tally, write the result, pay reputation. Idempotent — the row
 * is locked FOR UPDATE and an already-SETTLED room returns its stored result
 * without touching the ledger, so a retrying scheduler can never double-pay.
 *
 * Verdict: majority of side votes. A tie, or zero side votes, is a DRAW.
 * A room nobody joined is CANCELLED (there is nothing to judge).
 *
 * Best argument: most argument votes, ties broken by the earlier message so the
 * outcome is deterministic. No votes means no best argument (and no award).
 *
 * Rewards are reputation-only (no coins): participation for every debater, a
 * winning-side bonus for the people who VOTED with the winning side (votes are
 * the ballot of record — an initial stance is private and is not a vote), the
 * best-argument bonus, and a useful-evidence bonus per author with >= 3 marks.
 */
create or replace function public.settle_arena_room(p_room_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room      public.arena_rooms%rowtype;
  v_topic     public.arena_daily_topics%rowtype;
  v_agree     integer := 0;
  v_disagree  integer := 0;
  v_winner    public.arena_winning_side;
  v_best_msg  text;
  v_best_auth text;
  v_parts     integer := 0;
  v_done      integer := 0;
  v_changed   integer := 0;
  r           record;
begin
  select * into v_room from public.arena_rooms where id = p_room_id for update;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;

  if v_room.status = 'SETTLED' then
    return public.arena_result_payload(p_room_id);
  end if;
  if v_room.status = 'CANCELLED' then
    return jsonb_build_object('roomId', p_room_id, 'status', 'CANCELLED');
  end if;

  select * into v_topic
    from public.arena_daily_topics where id = v_room.topic_id;
  if not found then
    raise exception 'topic does not exist' using errcode = 'P0002';
  end if;
  if now() < v_topic.closes_at then
    raise exception 'the room is not ready to settle' using errcode = 'P0003';
  end if;

  select
    count(*)::integer,
    count(*) filter (where p.final_stance is not null)::integer,
    count(*) filter (where p.final_stance is not null and p.initial_stance <> p.final_stance)::integer
    into v_parts, v_done, v_changed
    from public.arena_room_participants p
   where p.room_id = p_room_id;

  -- Nobody showed up: there is no verdict to render.
  if v_parts = 0 then
    update public.arena_rooms set status = 'CANCELLED' where id = p_room_id;
    return jsonb_build_object('roomId', p_room_id, 'status', 'CANCELLED');
  end if;

  select
    count(*) filter (where sv.side = 'AGREE')::integer,
    count(*) filter (where sv.side = 'DISAGREE')::integer
    into v_agree, v_disagree
    from public.arena_room_side_votes sv
   where sv.room_id = p_room_id;

  v_winner := case
    when v_agree > v_disagree then 'AGREE'::public.arena_winning_side
    when v_disagree > v_agree then 'DISAGREE'::public.arena_winning_side
    else 'DRAW'::public.arena_winning_side
  end;

  select av.message_id into v_best_msg
    from public.arena_room_argument_votes av
    join public.arena_room_messages m on m.id = av.message_id
   where av.room_id = p_room_id
     and m.hidden_at is null
   group by av.message_id, m.created_at
   order by count(*) desc, m.created_at asc, av.message_id asc
   limit 1;

  if v_best_msg is not null then
    select m.author_id into v_best_auth
      from public.arena_room_messages m where m.id = v_best_msg;
  end if;

  insert into public.arena_room_results (
    room_id, winning_side, agree_votes, disagree_votes,
    best_argument_message_id, best_argument_author_id,
    participant_count, mindshift_changed_count, mindshift_completed_count, settled_at
  ) values (
    p_room_id, v_winner, v_agree, v_disagree,
    v_best_msg, v_best_auth,
    v_parts, v_changed, v_done, now()
  )
  on conflict (room_id) do nothing;

  update public.arena_rooms set status = 'SETTLED' where id = p_room_id;

  -- ── Rewards (reputation only; this block runs exactly once per room) ──────
  -- Participation: every debater who joined.
  for r in
    select p.profile_id
      from public.arena_room_participants p
     where p.room_id = p_room_id and p.role = 'debater'
     order by p.joined_at asc
  loop
    insert into public.reputation_events (
      id, profile_id, clash_id, arena_room_id, kind, reputation_delta, coins_delta
    ) values (
      public.new_arena_id('re_'), r.profile_id, null, p_room_id,
      'arena_participation', 10, 0
    );
    update public.profiles
       set reputation = reputation + 10,
           rank = public.rank_for_rep(reputation + 10)
     where id = r.profile_id;
  end loop;

  -- Winning side: the ballot is the record of which side you backed.
  if v_winner <> 'DRAW' then
    for r in
      select sv.profile_id
        from public.arena_room_side_votes sv
        join public.arena_room_participants p
          on p.room_id = sv.room_id and p.profile_id = sv.profile_id
       where sv.room_id = p_room_id
         and sv.side = v_winner
         and p.role = 'debater'
    loop
      insert into public.reputation_events (
        id, profile_id, clash_id, arena_room_id, kind, reputation_delta, coins_delta
      ) values (
        public.new_arena_id('re_'), r.profile_id, null, p_room_id,
        'arena_winning_side', 25, 0
      );
      update public.profiles
         set reputation = reputation + 25,
             rank = public.rank_for_rep(reputation + 25)
       where id = r.profile_id;
    end loop;
  end if;

  -- Best argument.
  if v_best_auth is not null then
    insert into public.reputation_events (
      id, profile_id, clash_id, arena_room_id, kind, reputation_delta, coins_delta
    ) values (
      public.new_arena_id('re_'), v_best_auth, null, p_room_id,
      'arena_best_argument', 40, 0
    );
    update public.profiles
       set reputation = reputation + 40,
           rank = public.rank_for_rep(reputation + 40)
     where id = v_best_auth;
  end if;

  -- Useful evidence: once per author, however many rows they cleared.
  for r in
    select distinct e.author_id
      from public.arena_room_evidence e
     where e.room_id = p_room_id
       and e.hidden_at is null
       and e.useful_count >= 3
  loop
    insert into public.reputation_events (
      id, profile_id, clash_id, arena_room_id, kind, reputation_delta, coins_delta
    ) values (
      public.new_arena_id('re_'), r.author_id, null, p_room_id,
      'arena_useful_evidence', 15, 0
    );
    update public.profiles
       set reputation = reputation + 15,
           rank = public.rank_for_rep(reputation + 15)
     where id = r.author_id;
  end loop;

  return public.arena_result_payload(p_room_id);
end;
$$;

-- ── 25. transition_due_arena_rooms ──────────────────────────────────────────
/**
 * Scheduler seam. Advances the topic clock first (scheduled -> live -> closed),
 * then walks every unfinished room and moves it to the phase its topic says it
 * should be in. Bounded, idempotent, and tolerant of a single broken room.
 * Returns the number of rooms that actually changed state.
 */
create or replace function public.transition_due_arena_rooms(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 2000));
  v_n     integer := 0;
  r       record;
begin
  -- Topic clock. A topic becomes live on its own schedule and closed on time.
  update public.arena_daily_topics
     set status = 'live'
   where status = 'scheduled'
     and opens_at <= now()
     and closes_at > now();

  update public.arena_daily_topics
     set status = 'closed'
   where status in ('scheduled', 'live')
     and closes_at <= now();

  for r in
    select rm.id,
           rm.status,
           t.opens_at,
           t.final_arguments_at,
           t.judging_at,
           t.closes_at,
           t.status as topic_status
      from public.arena_rooms rm
      join public.arena_daily_topics t on t.id = rm.topic_id
     where rm.status not in ('SETTLED', 'CANCELLED')
     order by t.closes_at asc, rm.id asc
     limit v_limit
  loop
    begin
      if now() >= r.closes_at then
        perform public.settle_arena_room(r.id);
        v_n := v_n + 1;
      elsif now() >= r.judging_at then
        if r.status <> 'JUDGING' then
          update public.arena_rooms set status = 'JUDGING' where id = r.id;
          v_n := v_n + 1;
        end if;
      elsif now() >= r.final_arguments_at then
        if r.status <> 'FINAL_ARGUMENTS' then
          update public.arena_rooms set status = 'FINAL_ARGUMENTS' where id = r.id;
          v_n := v_n + 1;
        end if;
      elsif now() >= r.opens_at and r.topic_status = 'live' then
        if r.status <> 'OPEN' then
          update public.arena_rooms set status = 'OPEN' where id = r.id;
          v_n := v_n + 1;
        end if;
      end if;
    exception when others then
      null;  -- one broken room never blocks the rest of the batch
    end;
  end loop;

  return v_n;
end;
$$;

-- ── 26. run_maintenance (extended, every existing key preserved) ────────────
create or replace function public.run_maintenance(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clashes integer;
  v_takes   integer;
  v_media   jsonb;
  v_rates   integer;
  v_drops   integer;
  v_subs    integer;
  v_preds   integer;
  v_world   integer;
  v_arena   integer;
begin
  select public.settle_due_clashes(p_limit) into v_clashes;
  select public.expire_stale_takes(p_limit) into v_takes;
  select public.cleanup_stale_media(least(p_limit, 100)) into v_media;
  select public.cleanup_rate_limits(interval '7 days') into v_rates;
  select public.expire_vault_drops(p_limit) into v_drops;
  select public.expire_vault_subscriptions(p_limit) into v_subs;
  select public.close_prediction_games(p_limit) into v_preds;
  select public.expire_world_drops(p_limit) into v_world;
  select public.transition_due_arena_rooms(p_limit) into v_arena;

  return jsonb_build_object(
    'clashes_settled', v_clashes,
    'takes_expired', v_takes,
    'media', v_media,
    'rate_limits_pruned', v_rates,
    'vault_drops_expired', v_drops,
    'vault_subscriptions_expired', v_subs,
    'prediction_games_closed', v_preds,
    'world_drops_expired', v_world,
    'arena_rooms_transitioned', v_arena
  );
end;
$$;

-- ── 27. RLS ─────────────────────────────────────────────────────────────────
alter table public.arena_daily_topics            enable row level security;
alter table public.arena_rooms                   enable row level security;
alter table public.arena_room_participants       enable row level security;
alter table public.arena_room_messages           enable row level security;
alter table public.arena_room_evidence           enable row level security;
alter table public.arena_room_message_reactions  enable row level security;
alter table public.arena_room_evidence_marks     enable row level security;
alter table public.arena_room_side_votes         enable row level security;
alter table public.arena_room_argument_votes     enable row level security;
alter table public.arena_room_results            enable row level security;

-- Topics: public once live, readable forever after. Scheduled is staff-only.
-- Guests and signed-in viewers get separate policies on purpose: is_staff() is
-- granted to `authenticated` only, so a single combined policy would raise
-- 42501 the moment a guest query reached a scheduled row. Same shape as
-- 20260927000000_feed_visibility.sql.
drop policy if exists "live arena topics are readable" on public.arena_daily_topics;
drop policy if exists "arena topics are publicly readable" on public.arena_daily_topics;
create policy "arena topics are publicly readable"
  on public.arena_daily_topics for select to anon
  using (status in ('live', 'closed'));

drop policy if exists "arena topics are readable when live or by staff" on public.arena_daily_topics;
create policy "arena topics are readable when live or by staff"
  on public.arena_daily_topics for select to authenticated
  using (status in ('live', 'closed') or public.is_staff());

-- Rooms: visible with their topic. Capacity/counts are public; content is not.
drop policy if exists "arena rooms follow their topic" on public.arena_rooms;
create policy "arena rooms follow their topic"
  on public.arena_rooms for select to anon
  using (
    exists (
      select 1 from public.arena_daily_topics t
       where t.id = arena_rooms.topic_id
         and t.status in ('live', 'closed')
    )
  );

drop policy if exists "arena rooms follow their topic or staff" on public.arena_rooms;
create policy "arena rooms follow their topic or staff"
  on public.arena_rooms for select to authenticated
  using (
    exists (
      select 1 from public.arena_daily_topics t
       where t.id = arena_rooms.topic_id
         and t.status in ('live', 'closed')
    )
    or public.is_staff()
  );

-- Participants: OWNER ONLY. A stance is private — this is the privacy rule that
-- makes the whole feature safe. Counts come from RPCs, never from this table.
drop policy if exists "an arena membership is visible to its owner" on public.arena_room_participants;
create policy "an arena membership is visible to its owner"
  on public.arena_room_participants for select to authenticated
  using (public.owns_profile(profile_id) or public.is_staff());

-- Messages: members only, hidden rows only for their author or staff, and
-- blocked/muted authors filtered out the same way the Arena feed filters them.
drop policy if exists "arena messages are visible to room members" on public.arena_room_messages;
create policy "arena messages are visible to room members"
  on public.arena_room_messages for select to authenticated
  using (
    (public.arena_is_room_member(room_id) or public.is_staff())
    and (hidden_at is null or public.owns_profile(author_id) or public.is_staff())
    and (
      public.is_staff()
      or public.owns_profile(author_id)
      or not public.arena_actor_hidden(public.my_profile_id(), author_id)
    )
  );

drop policy if exists "arena evidence is visible to room members" on public.arena_room_evidence;
create policy "arena evidence is visible to room members"
  on public.arena_room_evidence for select to authenticated
  using (
    (public.arena_is_room_member(room_id) or public.is_staff())
    and (hidden_at is null or public.owns_profile(author_id) or public.is_staff())
    and (
      public.is_staff()
      or public.owns_profile(author_id)
      or not public.arena_actor_hidden(public.my_profile_id(), author_id)
    )
  );

-- Reactions / useful marks: readable by room members (rollups are not secret).
drop policy if exists "arena reactions are visible to room members" on public.arena_room_message_reactions;
create policy "arena reactions are visible to room members"
  on public.arena_room_message_reactions for select to authenticated
  using (
    public.arena_is_room_member(public.arena_message_room(message_id))
    or public.is_staff()
  );

drop policy if exists "arena evidence marks are visible to room members" on public.arena_room_evidence_marks;
create policy "arena evidence marks are visible to room members"
  on public.arena_room_evidence_marks for select to authenticated
  using (
    public.arena_is_room_member(public.arena_evidence_room(evidence_id))
    or public.is_staff()
  );

-- Ballots: OWNER ONLY. Tallies become public through arena_room_results, which
-- only exists after settlement — that is the anti-bandwagon guarantee.
drop policy if exists "an arena side vote is visible to its owner" on public.arena_room_side_votes;
create policy "an arena side vote is visible to its owner"
  on public.arena_room_side_votes for select to authenticated
  using (public.owns_profile(profile_id) or public.is_staff());

drop policy if exists "an arena argument vote is visible to its owner" on public.arena_room_argument_votes;
create policy "an arena argument vote is visible to its owner"
  on public.arena_room_argument_votes for select to authenticated
  using (public.owns_profile(profile_id) or public.is_staff());

-- Results: public once the room has settled (a result row only exists then).
drop policy if exists "settled arena results are readable" on public.arena_room_results;
create policy "settled arena results are readable"
  on public.arena_room_results for select to anon
  using (
    exists (
      select 1 from public.arena_rooms r
       where r.id = arena_room_results.room_id and r.status = 'SETTLED'
    )
  );

drop policy if exists "arena results are readable to members and staff" on public.arena_room_results;
create policy "arena results are readable to members and staff"
  on public.arena_room_results for select to authenticated
  using (
    exists (
      select 1 from public.arena_rooms r
       where r.id = arena_room_results.room_id and r.status = 'SETTLED'
    )
    or public.arena_is_room_member(room_id)
    or public.is_staff()
  );

-- ── 28. Table privileges (no client writes, anywhere) ───────────────────────
revoke all on table public.arena_daily_topics           from public, anon, authenticated;
revoke all on table public.arena_rooms                  from public, anon, authenticated;
revoke all on table public.arena_room_participants      from public, anon, authenticated;
revoke all on table public.arena_room_messages          from public, anon, authenticated;
revoke all on table public.arena_room_evidence          from public, anon, authenticated;
revoke all on table public.arena_room_message_reactions from public, anon, authenticated;
revoke all on table public.arena_room_evidence_marks    from public, anon, authenticated;
revoke all on table public.arena_room_side_votes        from public, anon, authenticated;
revoke all on table public.arena_room_argument_votes    from public, anon, authenticated;
revoke all on table public.arena_room_results           from public, anon, authenticated;

-- Guest-visible surfaces (policies still decide which rows).
grant select on table public.arena_daily_topics  to anon, authenticated;
grant select on table public.arena_rooms         to anon, authenticated;
grant select on table public.arena_room_results  to anon, authenticated;

-- Signed-in surfaces.
grant select on table public.arena_room_participants      to authenticated;
grant select on table public.arena_room_messages          to authenticated;
grant select on table public.arena_room_evidence          to authenticated;
grant select on table public.arena_room_message_reactions to authenticated;
grant select on table public.arena_room_evidence_marks    to authenticated;
grant select on table public.arena_room_side_votes        to authenticated;
grant select on table public.arena_room_argument_votes    to authenticated;

-- ── 29. Function privileges ─────────────────────────────────────────────────
-- Internal helpers: definer code only.
revoke execute on function public.new_arena_id(text) from public, anon, authenticated;
revoke execute on function public.arena_topic_payload(public.arena_daily_topics, text) from public, anon, authenticated;
revoke execute on function public.arena_room_payload(public.arena_rooms, text) from public, anon, authenticated;
revoke execute on function public.arena_message_payload(public.arena_room_messages, text, boolean) from public, anon, authenticated;
revoke execute on function public.arena_evidence_payload(public.arena_room_evidence, text) from public, anon, authenticated;
revoke execute on function public.arena_result_payload(text) from public, anon, authenticated;
revoke execute on function public.arena_profile_json(text) from public, anon, authenticated;

-- Policy helpers must be executable by the roles whose policies call them.
revoke execute on function public.arena_is_room_member(text) from public;
grant execute on function public.arena_is_room_member(text) to anon, authenticated;
revoke execute on function public.arena_message_room(text) from public;
grant execute on function public.arena_message_room(text) to anon, authenticated;
revoke execute on function public.arena_evidence_room(text) from public;
grant execute on function public.arena_evidence_room(text) to anon, authenticated;
revoke execute on function public.arena_actor_hidden(text, text) from public;
grant execute on function public.arena_actor_hidden(text, text) to anon, authenticated;
revoke execute on function public.arena_topic_phase(public.arena_topic_status, timestamptz, timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.arena_topic_phase(public.arena_topic_status, timestamptz, timestamptz, timestamptz, timestamptz) to anon, authenticated;
revoke execute on function public.is_allowed_http_url(text) from public, anon;
grant execute on function public.is_allowed_http_url(text) to authenticated;

-- Reads.
revoke execute on function public.list_live_arena_topics() from public;
grant execute on function public.list_live_arena_topics() to anon, authenticated;
revoke execute on function public.get_arena_topic(text) from public;
grant execute on function public.get_arena_topic(text) to anon, authenticated;
revoke execute on function public.get_arena_room(text) from public;
grant execute on function public.get_arena_room(text) to anon, authenticated;
revoke execute on function public.arena_room_mindshift_stats(text) from public;
grant execute on function public.arena_room_mindshift_stats(text) to anon, authenticated;

revoke execute on function public.list_arena_room_messages(text, timestamptz, integer) from public, anon;
grant execute on function public.list_arena_room_messages(text, timestamptz, integer) to authenticated;
revoke execute on function public.list_arena_room_evidence(text, integer) from public, anon;
grant execute on function public.list_arena_room_evidence(text, integer) to authenticated;

-- Writes: signed-in users only.
revoke execute on function public.join_arena_topic(text, public.take_stance, public.arena_participant_role) from public, anon;
grant execute on function public.join_arena_topic(text, public.take_stance, public.arena_participant_role) to authenticated;

revoke execute on function public.post_arena_room_message(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.post_arena_room_message(text, text, text, text, text, text, text) to authenticated;

revoke execute on function public.react_arena_room_message(text, text) from public, anon;
grant execute on function public.react_arena_room_message(text, text) to authenticated;

revoke execute on function public.submit_arena_evidence(text, public.arena_evidence_kind, text, text, text, text) from public, anon;
grant execute on function public.submit_arena_evidence(text, public.arena_evidence_kind, text, text, text, text) to authenticated;

revoke execute on function public.mark_arena_evidence_useful(text) from public, anon;
grant execute on function public.mark_arena_evidence_useful(text) to authenticated;

revoke execute on function public.submit_arena_side_vote(text, public.arena_winning_side) from public, anon;
grant execute on function public.submit_arena_side_vote(text, public.arena_winning_side) to authenticated;

revoke execute on function public.submit_arena_argument_vote(text, text) from public, anon;
grant execute on function public.submit_arena_argument_vote(text, text) to authenticated;

revoke execute on function public.record_arena_final_stance(text, public.take_stance) from public, anon;
grant execute on function public.record_arena_final_stance(text, public.take_stance) to authenticated;

-- Staff / scheduler seams: never the phone.
revoke execute on function public.create_arena_daily_topic(
  text, text, public.hood_id, timestamptz, timestamptz, timestamptz, timestamptz, public.arena_topic_status
) from public, anon;
grant execute on function public.create_arena_daily_topic(
  text, text, public.hood_id, timestamptz, timestamptz, timestamptz, timestamptz, public.arena_topic_status
) to authenticated, service_role;

revoke execute on function public.settle_arena_room(text) from public, anon, authenticated;
grant execute on function public.settle_arena_room(text) to service_role;

revoke execute on function public.transition_due_arena_rooms(integer) from public, anon, authenticated;
grant execute on function public.transition_due_arena_rooms(integer) to service_role;

revoke execute on function public.run_maintenance(integer) from public, anon, authenticated;
grant execute on function public.run_maintenance(integer) to service_role;

-- ── 30. Realtime ────────────────────────────────────────────────────────────
-- The live thread is the whole point: subscribe to arena_room_messages and let
-- RLS decide what each member actually receives. Wrapped because the
-- publication does not exist on a bare Postgres (non-Supabase) target.
do $$ begin
  alter publication supabase_realtime add table public.arena_room_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
  when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.arena_room_evidence;
exception
  when duplicate_object then null;
  when undefined_object then null;
  when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.arena_room_results;
exception
  when duplicate_object then null;
  when undefined_object then null;
  when others then null;
end $$;

-- ── 31. Scheduler note ──────────────────────────────────────────────────────
-- transition_due_arena_rooms is reached through run_maintenance, which is the
-- single cron entry point documented in 20260926170000_production_hardening.sql:
--
--   select cron.schedule('clash-maintenance', '* * * * *',
--          $$ select public.run_maintenance(500) $$);
--
-- Nothing in the app may settle a room: settle_arena_room is service_role only
-- and time-gated on the topic clock, so a phone cannot bring a verdict forward.
