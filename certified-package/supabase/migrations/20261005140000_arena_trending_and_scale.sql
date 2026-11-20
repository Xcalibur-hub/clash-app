-- ============================================================================
-- CLASH 2.0 · Phase 4 — Arena Trending Battles + production scale helpers
-- ----------------------------------------------------------------------------
-- 1) arena_trend_snapshots  — historical attention points (10-minute buckets)
-- 2) refresh_arena_trend_snapshots — server-only writer (run_maintenance)
-- 3) list_arena_trending_battles — Top 10 + series for the client graph
-- 4) get_arena_room_message — single-message hydrate (realtime path)
-- 5) arena_room_pulse_cache — shared Pulse snapshot (slight staleness OK)
-- 6) bounded indexes for visible message scans
--
-- Attention is NOT truth, stance, or argument quality. It is recent unique
-- actor activity with hard caps so one spammer cannot manufacture a trend.
-- ============================================================================

-- ── 1. Indexes (bounded recent activity) ────────────────────────────────────
create index if not exists arena_room_messages_room_visible_idx
  on public.arena_room_messages (room_id, created_at desc, id desc)
  where hidden_at is null;

create index if not exists arena_room_messages_parent_visible_idx
  on public.arena_room_messages (parent_message_id, created_at desc)
  where parent_message_id is not null and hidden_at is null;

create index if not exists arena_room_message_reactions_created_idx
  on public.arena_room_message_reactions (created_at desc);

create index if not exists arena_room_participants_joined_idx
  on public.arena_room_participants (room_id, joined_at desc);

-- ── 2. Trend snapshots ──────────────────────────────────────────────────────
create table if not exists public.arena_trend_snapshots (
  topic_id          text not null references public.arena_daily_topics (id) on delete cascade,
  bucket_at         timestamptz not null,
  attention_score   integer not null check (attention_score >= 0),
  unique_actors     integer not null default 0 check (unique_actors >= 0),
  message_authors   integer not null default 0,
  reaction_actors   integer not null default 0,
  evidence_authors  integer not null default 0,
  join_actors       integer not null default 0,
  participant_count integer not null default 0,
  active_room_count integer not null default 0,
  created_at        timestamptz not null default now(),
  primary key (topic_id, bucket_at)
);

create index if not exists arena_trend_snapshots_bucket_idx
  on public.arena_trend_snapshots (bucket_at desc, attention_score desc);

alter table public.arena_trend_snapshots enable row level security;

drop policy if exists "arena trend snapshots are readable" on public.arena_trend_snapshots;
create policy "arena trend snapshots are readable"
  on public.arena_trend_snapshots for select to anon, authenticated
  using (true);

revoke insert, update, delete on public.arena_trend_snapshots from public, anon, authenticated;

comment on table public.arena_trend_snapshots is
  '10-minute Arena attention buckets. Server-written only. Retention ~36h.';

-- ── 3. Attention formula (SQL mirror of utils/arenaTrendScore.ts) ───────────
--
-- Per 10-minute bucket for a topic (all rooms under it), unique actors only:
--
--   score =
--     min(message_authors, 40)  * 10
--   + min(reaction_actors, 80)  *  3
--   + min(evidence_authors, 20) *  6
--   + min(join_actors, 40)      *  5
--
-- Hidden messages are excluded. Self-amplification is limited by UNIQUE actors
-- (one person = one count per signal class), not raw reaction volume.
--
create or replace function public.arena_attention_score(
  p_message_authors  integer,
  p_reaction_actors  integer,
  p_evidence_authors integer,
  p_join_actors      integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(0,
       least(greatest(coalesce(p_message_authors, 0), 0), 40) * 10
     + least(greatest(coalesce(p_reaction_actors, 0), 0), 80) * 3
     + least(greatest(coalesce(p_evidence_authors, 0), 0), 20) * 6
     + least(greatest(coalesce(p_join_actors, 0), 0), 40) * 5
  )::integer;
$$;

revoke execute on function public.arena_attention_score(integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.arena_attention_score(integer, integer, integer, integer)
  to service_role, authenticated;

-- ── 4. Snapshot writer ──────────────────────────────────────────────────────
create or replace function public.refresh_arena_trend_snapshots(
  p_bucket_minutes integer default 10,
  p_retention_hours integer default 36
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket_minutes integer := greatest(5, least(coalesce(p_bucket_minutes, 10), 30));
  v_bucket_at timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / (v_bucket_minutes * 60)) * (v_bucket_minutes * 60));
  v_window_start timestamptz := v_bucket_at - make_interval(mins => v_bucket_minutes);
  v_written integer := 0;
  v_pruned integer := 0;
  r record;
begin
  -- Only compute for topics that are live today or recently closed (still in graph).
  for r in
    select t.id as topic_id
      from public.arena_daily_topics t
     where t.status in ('live', 'closed')
       and t.opens_at >= now() - interval '36 hours'
  loop
    with rooms as (
      select id, participant_count, status
        from public.arena_rooms
       where topic_id = r.topic_id
    ),
    msg as (
      select count(distinct m.author_id)::integer as authors
        from public.arena_room_messages m
        join rooms rm on rm.id = m.room_id
       where m.hidden_at is null
         and m.kind <> 'system'
         and m.created_at >= v_window_start
         and m.created_at < v_bucket_at
    ),
    rx as (
      select count(distinct rc.profile_id)::integer as actors
        from public.arena_room_message_reactions rc
        join public.arena_room_messages m on m.id = rc.message_id
        join rooms rm on rm.id = m.room_id
       where m.hidden_at is null
         and rc.created_at >= v_window_start
         and rc.created_at < v_bucket_at
    ),
    ev as (
      select count(distinct e.author_id)::integer as authors
        from public.arena_room_evidence e
        join rooms rm on rm.id = e.room_id
       where e.hidden_at is null
         and e.created_at >= v_window_start
         and e.created_at < v_bucket_at
    ),
    joins as (
      select count(distinct p.profile_id)::integer as actors
        from public.arena_room_participants p
        join rooms rm on rm.id = p.room_id
       where p.joined_at >= v_window_start
         and p.joined_at < v_bucket_at
    ),
    roll as (
      select
        coalesce((select authors from msg), 0) as message_authors,
        coalesce((select actors from rx), 0) as reaction_actors,
        coalesce((select authors from ev), 0) as evidence_authors,
        coalesce((select actors from joins), 0) as join_actors,
        coalesce((select sum(participant_count)::integer from rooms), 0) as participant_count,
        coalesce((
          select count(*)::integer from rooms
           where status in ('OPEN', 'FINAL_ARGUMENTS', 'JUDGING')
        ), 0) as active_room_count
    )
    insert into public.arena_trend_snapshots as s (
      topic_id, bucket_at, attention_score,
      unique_actors, message_authors, reaction_actors, evidence_authors, join_actors,
      participant_count, active_room_count
    )
    select
      r.topic_id,
      v_bucket_at,
      public.arena_attention_score(
        roll.message_authors, roll.reaction_actors, roll.evidence_authors, roll.join_actors
      ),
      least(
        roll.message_authors + roll.reaction_actors + roll.evidence_authors + roll.join_actors,
        200
      ),
      roll.message_authors,
      roll.reaction_actors,
      roll.evidence_authors,
      roll.join_actors,
      roll.participant_count,
      roll.active_room_count
    from roll
    on conflict (topic_id, bucket_at) do update set
      attention_score = excluded.attention_score,
      unique_actors = excluded.unique_actors,
      message_authors = excluded.message_authors,
      reaction_actors = excluded.reaction_actors,
      evidence_authors = excluded.evidence_authors,
      join_actors = excluded.join_actors,
      participant_count = excluded.participant_count,
      active_room_count = excluded.active_room_count,
      created_at = now();

    v_written := v_written + 1;
  end loop;

  delete from public.arena_trend_snapshots
   where bucket_at < now() - make_interval(hours => greatest(coalesce(p_retention_hours, 36), 12));
  get diagnostics v_pruned = row_count;

  return jsonb_build_object(
    'bucketAt', v_bucket_at,
    'topicsWritten', v_written,
    'pruned', v_pruned
  );
end;
$$;

revoke execute on function public.refresh_arena_trend_snapshots(integer, integer)
  from public, anon, authenticated;
grant execute on function public.refresh_arena_trend_snapshots(integer, integer) to service_role;

-- ── 5. Momentum helper ──────────────────────────────────────────────────────
-- Compare last 3 buckets vs previous 3. Minimum unique_actors sample = 3.
create or replace function public.arena_trend_momentum(
  p_recent integer,
  p_prior integer,
  p_sample integer
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_sample, 0) < 3 then 'STEADY'
    when coalesce(p_prior, 0) <= 0 and coalesce(p_recent, 0) >= 8 then 'RISING'
    when coalesce(p_prior, 0) <= 0 then 'STEADY'
    when (p_recent::numeric - p_prior::numeric) / greatest(p_prior, 1)::numeric >= 0.25
      then 'RISING'
    when (p_prior::numeric - p_recent::numeric) / greatest(p_prior, 1)::numeric >= 0.25
      then 'COOLING'
    else 'STEADY'
  end;
$$;

revoke execute on function public.arena_trend_momentum(integer, integer, integer)
  from public, anon;
grant execute on function public.arena_trend_momentum(integer, integer, integer)
  to authenticated, service_role;

-- ── 6. List Top 10 trending battles ─────────────────────────────────────────
create or replace function public.list_arena_trending_battles(
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 10));
  v_now timestamptz := now();
begin
  return coalesce(
    (
      with latest as (
        select distinct on (s.topic_id)
          s.*
          from public.arena_trend_snapshots s
         where s.bucket_at >= v_now - interval '24 hours'
         order by s.topic_id, s.bucket_at desc
      ),
      ranked as (
        select
          l.*,
          t.title,
          t.hood,
          t.status::text as topic_status,
          row_number() over (
            order by l.attention_score desc, l.unique_actors desc, l.topic_id asc
          ) as rank
          from latest l
          join public.arena_daily_topics t on t.id = l.topic_id
         where t.status in ('live', 'closed')
           and l.attention_score > 0
      ),
      top as (
        select * from ranked where rank <= v_limit
      ),
      windows as (
        select
          tp.topic_id,
          coalesce(sum(s.attention_score) filter (
            where s.bucket_at > v_now - interval '30 minutes'
          ), 0)::integer as recent_score,
          coalesce(sum(s.attention_score) filter (
            where s.bucket_at > v_now - interval '60 minutes'
              and s.bucket_at <= v_now - interval '30 minutes'
          ), 0)::integer as prior_score,
          coalesce(sum(s.unique_actors) filter (
            where s.bucket_at > v_now - interval '30 minutes'
          ), 0)::integer as recent_sample
          from top tp
          left join public.arena_trend_snapshots s
            on s.topic_id = tp.topic_id
           and s.bucket_at >= v_now - interval '24 hours'
         group by tp.topic_id
      ),
      series as (
        select
          tp.topic_id,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                't', (extract(epoch from s.bucket_at) * 1000)::bigint,
                'v', s.attention_score
              )
              order by s.bucket_at asc
            ),
            '[]'::jsonb
          ) as points
          from top tp
          left join public.arena_trend_snapshots s
            on s.topic_id = tp.topic_id
           and s.bucket_at >= v_now - interval '24 hours'
         group by tp.topic_id
      ),
      rooms as (
        select
          tp.topic_id,
          (
            select r.id
              from public.arena_rooms r
             where r.topic_id = tp.topic_id
               and r.status in ('OPEN', 'FINAL_ARGUMENTS', 'JUDGING')
             order by r.participant_count desc, r.created_at asc
             limit 1
          ) as hot_room_id
          from top tp
      )
      select jsonb_agg(
        jsonb_build_object(
          'rank', tp.rank,
          'topicId', tp.topic_id,
          'title', tp.title,
          'hood', tp.hood,
          'attentionScore', tp.attention_score,
          'momentum', public.arena_trend_momentum(w.recent_score, w.prior_score, w.recent_sample),
          'changePercent', case
            when w.recent_sample < 5 or w.prior_score < 8 then null
            else round(((w.recent_score - w.prior_score)::numeric
              / greatest(w.prior_score, 1)::numeric) * 100)::integer
          end,
          'topicStatus', tp.topic_status,
          'participantCount', tp.participant_count,
          'activeRoomCount', tp.active_room_count,
          'hotRoomId', rm.hot_room_id,
          'series', coalesce(se.points, '[]'::jsonb)
        )
        order by tp.rank asc
      )
      from top tp
      join windows w on w.topic_id = tp.topic_id
      join series se on se.topic_id = tp.topic_id
      join rooms rm on rm.topic_id = tp.topic_id
    ),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.list_arena_trending_battles(integer) from public;
grant execute on function public.list_arena_trending_battles(integer) to anon, authenticated;

comment on function public.list_arena_trending_battles(integer) is
  'Top Arena battles by recent unique-actor attention. Max 10. No stance data.';

-- ── 7. Single-message hydrate ───────────────────────────────────────────────
create or replace function public.get_arena_room_message(p_message_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_msg public.arena_room_messages%rowtype;
  v_room public.arena_rooms%rowtype;
begin
  if v_viewer is null then
    raise exception 'sign in to read the room' using errcode = '42501';
  end if;
  if p_message_id is null or btrim(p_message_id) = '' then
    raise exception 'message id is required' using errcode = 'P0003';
  end if;

  select * into v_msg from public.arena_room_messages where id = p_message_id;
  if not found or v_msg.hidden_at is not null then
    return null;
  end if;

  select * into v_room from public.arena_rooms where id = v_msg.room_id;
  if not found then
    return null;
  end if;

  if not public.arena_is_room_member(v_msg.room_id) then
    raise exception 'join the room to read it' using errcode = '42501';
  end if;

  if public.arena_actor_hidden(v_viewer, v_msg.author_id) then
    return null;
  end if;

  return public.arena_message_payload(v_msg, v_viewer, v_room.status = 'SETTLED');
end;
$$;

revoke execute on function public.get_arena_room_message(text) from public, anon;
grant execute on function public.get_arena_room_message(text) to authenticated;

-- ── 8. Pulse cache ──────────────────────────────────────────────────────────
create table if not exists public.arena_room_pulse_cache (
  room_id      text primary key references public.arena_rooms (id) on delete cascade,
  payload      jsonb not null,
  generated_at timestamptz not null default now()
);

alter table public.arena_room_pulse_cache enable row level security;

drop policy if exists "arena pulse cache readable by members" on public.arena_room_pulse_cache;
create policy "arena pulse cache readable by members"
  on public.arena_room_pulse_cache for select to authenticated
  using (public.arena_is_room_member(room_id) or public.is_staff());

revoke insert, update, delete on public.arena_room_pulse_cache from public, anon, authenticated;

-- Keep the original compute body under a new name, then wrap get_arena_room_pulse.
create or replace function public.compute_arena_room_pulse(p_room_id text)
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

revoke execute on function public.compute_arena_room_pulse(text) from public, anon, authenticated;
grant execute on function public.compute_arena_room_pulse(text) to service_role;

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
  if not public.arena_is_room_member(p_room_id) then
    raise exception 'join the room to read pulse' using errcode = '42501';
  end if;

  select * into v_cached
    from public.arena_room_pulse_cache
   where room_id = p_room_id;

  if found and v_cached.generated_at > now() - interval '12 seconds' then
    return v_cached.payload;
  end if;

  -- One recompute at a time per room (advisory lock). Others may wait briefly
  -- or, if the lock is busy, return a slightly stale cache when available.
  v_lock_key := ('x' || substr(md5(p_room_id), 1, 15))::bit(64)::bigint;
  if not pg_try_advisory_xact_lock(v_lock_key) then
    if found then
      return v_cached.payload;
    end if;
    -- Fall through: first reader without cache still computes.
  end if;

  -- Re-check after lock
  select * into v_cached
    from public.arena_room_pulse_cache
   where room_id = p_room_id;
  if found and v_cached.generated_at > now() - interval '12 seconds' then
    return v_cached.payload;
  end if;

  v_payload := public.compute_arena_room_pulse(p_room_id);

  insert into public.arena_room_pulse_cache (room_id, payload, generated_at)
  values (p_room_id, v_payload, now())
  on conflict (room_id) do update
    set payload = excluded.payload,
        generated_at = excluded.generated_at;

  return v_payload;
end;
$$;

revoke execute on function public.get_arena_room_pulse(text) from public, anon;
grant execute on function public.get_arena_room_pulse(text) to authenticated;

-- ── 9. Maintenance: refresh trends (gate ~10 min via snapshot existence) ────
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
  v_signals integer;
  v_backups integer;
  v_moments integer;
  v_trends  jsonb := '{}'::jsonb;
  v_latest  timestamptz;
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
  select public.cleanup_meet_signals(p_limit) into v_signals;
  select public.expire_arena_backup_invites(least(p_limit, 200)) into v_backups;
  select public.award_arena_fun_moments(least(p_limit, 100)) into v_moments;

  select max(bucket_at) into v_latest from public.arena_trend_snapshots;
  if v_latest is null or v_latest <= now() - interval '9 minutes' then
    v_trends := public.refresh_arena_trend_snapshots(10, 36);
  else
    v_trends := jsonb_build_object('skipped', true, 'latestBucket', v_latest);
  end if;

  return jsonb_build_object(
    'clashes_settled', v_clashes,
    'takes_expired', v_takes,
    'media', v_media,
    'rate_limits_pruned', v_rates,
    'vault_drops_expired', v_drops,
    'vault_subscriptions_expired', v_subs,
    'prediction_games_closed', v_preds,
    'world_drops_expired', v_world,
    'arena_rooms_transitioned', v_arena,
    'meet_signals_pruned', v_signals,
    'arena_backup_invites_expired', v_backups,
    'arena_fun_moments_awarded', v_moments,
    'arena_trends', v_trends
  );
end;
$$;

revoke execute on function public.run_maintenance(integer) from public, anon, authenticated;
grant execute on function public.run_maintenance(integer) to service_role;
