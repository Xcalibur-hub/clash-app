-- ============================================================================
-- CLASH 2.0 · Phase 14.1 — Reputation facets + Arena standing
-- ----------------------------------------------------------------------------
-- REPUTATION IS NOT KARMA.
--
-- `profiles.reputation` (one number, Clash engine) is UNCHANGED and remains the
-- only global score. Arena reasons in five separate facets, so a hilarious meme
-- can never outrank a good argument:
--
--   DEBATE        arena_participation / arena_winning_side / arena_best_argument
--   EVIDENCE      arena_useful_evidence
--   TRUST         arena_backup_arrival  (you showed up when the room called)
--   ENTERTAINMENT arena_crowd_favorite  (fun — grants NO authority)
--   MIND_IMPACT   arena_mind_impact     (only when the data proves attribution)
--
-- DESIGN
--   · Facets are DERIVED from the append-only `reputation_events` ledger by a
--     trigger. Every existing award path (settle_arena_room, the Clash engine)
--     therefore feeds the facets without being rewritten — no duplicated write,
--     no risk to existing behaviour.
--   · One row per (profile, facet): 5 rows per person, so no global hot row and
--     no lock contention as concurrency grows.
--   · There is NO client write path. Awarding is server-side only, which is what
--     makes "a user cannot award itself reputation" structurally true.
--
-- MIND_IMPACT is deliberately narrow: `record_arena_final_stance` only ever
-- records that a person's OWN stance changed, which is not proof that somebody
-- else caused it. So the facet exists and is credited only through an explicit
-- server-side award (arena_mind_impact) that a future phase can gate on real
-- attribution. Event 14.1 never infers it from correlation.
-- ============================================================================

-- ── 1. Facet aggregates ─────────────────────────────────────────────────────
create table if not exists public.profile_reputation_facets (
  profile_id text not null references public.profiles (id) on delete cascade,
  facet      public.reputation_facet not null,
  score      integer not null default 0 check (score >= 0),
  updated_at timestamptz not null default now(),
  primary key (profile_id, facet)
);

-- Leaderboard-side lookup without touching profiles' hot row.
create index if not exists profile_reputation_facets_rank_idx
  on public.profile_reputation_facets (facet, score desc);

-- ── 2. Kind → facet mapping (pure + immutable, safe in a trigger) ───────────
create or replace function public.reputation_facet_for(p_kind public.reputation_kind)
returns public.reputation_facet
language sql
immutable
as $$
  select case p_kind
    when 'arena_participation'   then 'DEBATE'::public.reputation_facet
    when 'arena_winning_side'    then 'DEBATE'::public.reputation_facet
    when 'arena_best_argument'   then 'DEBATE'::public.reputation_facet
    when 'clash_participation'   then 'DEBATE'::public.reputation_facet
    when 'clash_win'             then 'DEBATE'::public.reputation_facet
    when 'clash_dissent'         then 'DEBATE'::public.reputation_facet
    when 'arena_useful_evidence' then 'EVIDENCE'::public.reputation_facet
    when 'arena_backup_arrival'  then 'TRUST'::public.reputation_facet
    when 'arena_crowd_favorite'  then 'ENTERTAINMENT'::public.reputation_facet
    when 'arena_mind_impact'     then 'MIND_IMPACT'::public.reputation_facet
    else 'DEBATE'::public.reputation_facet
  end;
$$;

comment on function public.reputation_facet_for(public.reputation_kind) is
  'Deterministic ledger-kind → facet mapping. Immutable so a trigger can use it.';

-- ── 3. Ledger trigger: one credit per ledger row, by construction ───────────
create or replace function public.sync_reputation_facet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta integer := greatest(coalesce(new.reputation_delta, 0), 0);
begin
  -- A zero-or-negative credit has no facet meaning: the ledger stays the truth,
  -- and a facet never goes backwards into nonsense.
  if v_delta = 0 then
    return new;
  end if;
  insert into public.profile_reputation_facets (profile_id, facet, score, updated_at)
  values (new.profile_id, public.reputation_facet_for(new.kind), v_delta, now())
  on conflict (profile_id, facet) do update
    set score = public.profile_reputation_facets.score + excluded.score,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists reputation_events_facet_sync on public.reputation_events;
create trigger reputation_events_facet_sync
  after insert on public.reputation_events
  for each row execute function public.sync_reputation_facet();

-- ── 4. Backfill every historical award exactly once ─────────────────────────
-- Idempotent: only fills facets that have no aggregate row yet, so replaying
-- this migration can never double-count.
insert into public.profile_reputation_facets (profile_id, facet, score, updated_at)
select e.profile_id,
       public.reputation_facet_for(e.kind),
       sum(greatest(e.reputation_delta, 0))::integer,
       now()
  from public.reputation_events e
 where e.reputation_delta > 0
 group by e.profile_id, public.reputation_facet_for(e.kind)
    on conflict (profile_id, facet) do nothing;

-- ── 5. Arena standing (participation ladder — power, not access) ────────────
/**
 * Arena standing from real, countable behaviour only.
 *
 * It NEVER reads ENTERTAINMENT: being funny is not authority. It also never
 * reads `profiles.reputation` alone, because that is the global ladder.
 *
 * Thresholds are intentionally low: the ladder unlocks the new Arena powers
 * (summoning, being summoned, stage priority). It gates NO existing ability —
 * rate limits, blocks, moderation, capacity and access rules always apply on
 * top of a standing, never instead of it.
 */
create or replace function public.arena_standing_for(p_profile_id text)
returns public.arena_standing
language sql
stable
security definer
set search_path = ''
as $$
  with signals as (
    select
      -- Rooms where this person actually debated, not merely watched.
      (select count(*) from public.arena_room_participants p
        where p.profile_id = p_profile_id and p.role = 'debater') as debated,
      (select coalesce(sum(f.score), 0) from public.profile_reputation_facets f
        where f.profile_id = p_profile_id and f.facet = 'EVIDENCE') as evidence_score,
      (select coalesce(sum(f.score), 0) from public.profile_reputation_facets f
        where f.profile_id = p_profile_id and f.facet = 'TRUST') as trust_score,
      -- Substance, not entertainment: a changed mind counts; being funny does not.
      (select coalesce(sum(f.score), 0) from public.profile_reputation_facets f
        where f.profile_id = p_profile_id and f.facet = 'MIND_IMPACT') as mind_score,
      (select coalesce(sum(f.score), 0) from public.profile_reputation_facets f
        where f.profile_id = p_profile_id and f.facet = 'DEBATE') as debate_score
  )
  select case
    when s.debated >= 12 or s.debate_score >= 400 then 'VETERAN'::public.arena_standing
    when s.debated >= 5 and (s.evidence_score > 0 or s.debate_score >= 120 or s.mind_score > 0)
      then 'DEBATER'::public.arena_standing
    when s.debated >= 5 or s.debate_score > 0 or s.evidence_score > 0
         or s.trust_score > 0 or s.mind_score > 0
      then 'CONTRIBUTOR'::public.arena_standing
    else 'NEWCOMER'::public.arena_standing
  end
  from signals s;
$$;

comment on function public.arena_standing_for(text) is
  'Arena participation standing from real behaviour. Never reads entertainment. Never bypasses limits.';

/** May this person summon another fighter into a room? */
create or replace function public.arena_may_call_backup(p_profile_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.arena_standing_for(p_profile_id)
         in ('CONTRIBUTOR'::public.arena_standing, 'DEBATER'::public.arena_standing,
             'VETERAN'::public.arena_standing);
$$;

/** May this person be summoned? A respected participant, not a newcomer. */
create or replace function public.arena_may_be_called(p_profile_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.arena_standing_for(p_profile_id)
         in ('DEBATER'::public.arena_standing, 'VETERAN'::public.arena_standing);
$$;

revoke execute on function public.arena_standing_for(text) from public;
revoke execute on function public.arena_may_call_backup(text) from public;
revoke execute on function public.arena_may_be_called(text) from public;
grant execute on function public.arena_standing_for(text) to anon, authenticated, service_role;
grant execute on function public.arena_may_call_backup(text) to anon, authenticated, service_role;
grant execute on function public.arena_may_be_called(text) to anon, authenticated, service_role;


-- ── 6. Facet payload + the viewer's own standing ────────────────────────────
/** Facets as jsonb, always all five keys, zero-filled. Never negative. */
create or replace function public.reputation_facet_json(p_profile_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'DEBATE', coalesce((select f.score from public.profile_reputation_facets f
                         where f.profile_id = p_profile_id and f.facet = 'DEBATE'), 0),
    'MIND_IMPACT', coalesce((select f.score from public.profile_reputation_facets f
                              where f.profile_id = p_profile_id and f.facet = 'MIND_IMPACT'), 0),
    'EVIDENCE', coalesce((select f.score from public.profile_reputation_facets f
                           where f.profile_id = p_profile_id and f.facet = 'EVIDENCE'), 0),
    'TRUST', coalesce((select f.score from public.profile_reputation_facets f
                        where f.profile_id = p_profile_id and f.facet = 'TRUST'), 0),
    'ENTERTAINMENT', coalesce((select f.score from public.profile_reputation_facets f
                                where f.profile_id = p_profile_id and f.facet = 'ENTERTAINMENT'), 0)
  );
$$;

revoke execute on function public.reputation_facet_json(text) from public;
grant execute on function public.reputation_facet_json(text) to anon, authenticated, service_role;

/**
 * The caller's own Arena standing + facets. Own-only by construction: there is
 * no profile parameter, so this can never be used to probe someone else.
 */
create or replace function public.get_my_arena_reputation()
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
    raise exception 'sign in to see your Arena standing' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'profileId', v_user,
    'standing', public.arena_standing_for(v_user),
    'facets', public.reputation_facet_json(v_user),
    'reputation', coalesce((select p.reputation from public.profiles p where p.id = v_user), 0),
    'rank', (select p.rank from public.profiles p where p.id = v_user),
    'mayCallBackup', public.arena_may_call_backup(v_user),
    'mayBeCalled', public.arena_may_be_called(v_user)
  );
end;
$$;

revoke execute on function public.get_my_arena_reputation() from public, anon;
grant execute on function public.get_my_arena_reputation() to authenticated;

comment on function public.get_my_arena_reputation() is
  'Own Arena standing + five facets. Entertainment is reported but never grants authority.';

-- ── 7. RLS ──────────────────────────────────────────────────────────────────
alter table public.profile_reputation_facets enable row level security;

-- Own-only, exactly like `reputation_events`. Facets surface publicly only
-- through the profile cards the Arena already renders.
drop policy if exists "your own reputation facets are yours" on public.profile_reputation_facets;
create policy "your own reputation facets are yours"
  on public.profile_reputation_facets for select to authenticated
  using (public.owns_profile(profile_id));

revoke all on public.profile_reputation_facets from public, anon, authenticated;
grant select on public.profile_reputation_facets to authenticated;
grant all on public.profile_reputation_facets to service_role;

