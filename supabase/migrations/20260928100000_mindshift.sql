-- ============================================================================
-- CLASH 2.0 · 0020 — Mindshift (server-authoritative stance change)
-- ----------------------------------------------------------------------------
-- Measures whether discussion moved a viewer's position on a Take. The client
-- records an initial stance and (later) a final stance; the server derives
-- whether they changed. The client NEVER submits `mind_changed`.
--
-- Privacy: individual stance rows are owner-only. Other people see only the
-- aggregate `mindshift_stats` payload (counts + percent). No movement matrix,
-- no identities. Staff is not granted a special read — moderation already has
-- reports; stance history is not a moderation primitive in this step.
--
-- Rate limits: each (take, profile) allows one initial write and one final
-- write. Uniqueness + immutability already prevent replay; no extra throttle.
--
-- Intentionally deferred (this step):
--   · attributing "minds changed" to a profile (Take-level % is not causal)
--   · reputation / coins for Mindshift
--   · weighted stance movement
--   · Blind Clash / Hood Games / World
-- ============================================================================

-- ── 1. Domain type ──────────────────────────────────────────────────────────
do $$ begin
  create type public.take_stance as enum ('AGREE', 'UNSURE', 'DISAGREE');
exception when duplicate_object then null; end $$;

-- ── 2. Rows ─────────────────────────────────────────────────────────────────
create table if not exists public.take_stances (
  take_id              text not null references public.takes (id) on delete cascade,
  profile_id           text not null references public.profiles (id) on delete cascade,
  initial_stance       public.take_stance not null,
  final_stance         public.take_stance,
  initial_recorded_at  timestamptz not null default now(),
  final_recorded_at    timestamptz,
  primary key (take_id, profile_id),
  check (
    (final_stance is null and final_recorded_at is null)
    or (final_stance is not null and final_recorded_at is not null)
  ),
  check (final_recorded_at is null or final_recorded_at >= initial_recorded_at)
);

create index if not exists take_stances_profile_idx on public.take_stances (profile_id);

-- ── 3. Payload helper (owner-facing; never used as a public identity dump) ──
create or replace function public.take_stance_payload(p_row public.take_stances)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'takeId', p_row.take_id,
    'initialStance', p_row.initial_stance,
    'finalStance', p_row.final_stance,
    'initialRecordedAt', p_row.initial_recorded_at,
    'finalRecordedAt', p_row.final_recorded_at,
    'changed', case
      when p_row.final_stance is null then null
      else (p_row.initial_stance <> p_row.final_stance)
    end
  );
$$;

-- ── 4. record_initial_stance ────────────────────────────────────────────────
/**
 * Record the caller's first stance on a Take. One write, forever. The actor is
 * resolved from `auth.uid()` via `my_profile_id()` — never a caller id.
 */
create or replace function public.record_initial_stance(
  p_take_id text,
  p_stance  public.take_stance
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   text := public.my_profile_id();
  v_author text;
  v_status public.take_status;
  v_row    public.take_stances%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to record a stance' using errcode = '42501';
  end if;

  select t.author_id, t.status
    into v_author, v_status
    from public.takes t
   where t.id = p_take_id;

  if v_author is null then
    raise exception 'take does not exist' using errcode = 'P0002';
  end if;
  if v_status = 'removed' then
    raise exception 'take is not available' using errcode = 'P0003';
  end if;
  if exists (
    select 1 from public.blocks b
     where (b.blocker_id = v_user and b.blocked_id = v_author)
        or (b.blocker_id = v_author and b.blocked_id = v_user)
  ) then
    raise exception 'blocked' using errcode = 'P0005';
  end if;

  if exists (
    select 1 from public.take_stances s
     where s.take_id = p_take_id and s.profile_id = v_user
  ) then
    raise exception 'initial stance already recorded' using errcode = 'P0006';
  end if;

  insert into public.take_stances (take_id, profile_id, initial_stance)
  values (p_take_id, v_user, p_stance)
  returning * into v_row;

  return public.take_stance_payload(v_row);
end;
$$;

-- ── 5. record_final_stance ──────────────────────────────────────────────────
/**
 * Record the caller's later stance. Requires an initial row. Immutable once
 * written — a second call cannot rewrite the aggregate.
 */
create or replace function public.record_final_stance(
  p_take_id text,
  p_stance  public.take_stance
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   text := public.my_profile_id();
  v_author text;
  v_status public.take_status;
  v_row    public.take_stances%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to record a stance' using errcode = '42501';
  end if;

  select t.author_id, t.status
    into v_author, v_status
    from public.takes t
   where t.id = p_take_id;

  if v_author is null then
    raise exception 'take does not exist' using errcode = 'P0002';
  end if;
  if v_status = 'removed' then
    raise exception 'take is not available' using errcode = 'P0003';
  end if;
  if exists (
    select 1 from public.blocks b
     where (b.blocker_id = v_user and b.blocked_id = v_author)
        or (b.blocker_id = v_author and b.blocked_id = v_user)
  ) then
    raise exception 'blocked' using errcode = 'P0005';
  end if;

  select * into v_row
    from public.take_stances s
   where s.take_id = p_take_id and s.profile_id = v_user
   for update;

  if not found then
    raise exception 'record an initial stance first' using errcode = 'P0007';
  end if;
  if v_row.final_stance is not null then
    raise exception 'final stance already recorded' using errcode = 'P0008';
  end if;

  update public.take_stances
     set final_stance = p_stance,
         final_recorded_at = now()
   where take_id = p_take_id and profile_id = v_user
  returning * into v_row;

  return public.take_stance_payload(v_row);
end;
$$;

-- ── 6. mindshift_stats (aggregate only) ─────────────────────────────────────
/**
 * Safe public aggregate. `changed` is derived here as initial <> final among
 * rows that have a final stance. completedParticipants = 0 → changedPercent
 * is JSON null (not 0), so "nobody finished" is not "0% moved".
 */
create or replace function public.mindshift_stats(p_take_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_exists    boolean;
  v_initial   integer;
  v_completed integer;
  v_changed   integer;
begin
  select exists (select 1 from public.takes t where t.id = p_take_id) into v_exists;
  if not v_exists then
    raise exception 'take does not exist' using errcode = 'P0002';
  end if;

  select
    count(*)::integer,
    count(*) filter (where s.final_stance is not null)::integer,
    count(*) filter (where s.final_stance is not null and s.initial_stance <> s.final_stance)::integer
    into v_initial, v_completed, v_changed
    from public.take_stances s
   where s.take_id = p_take_id;

  return jsonb_build_object(
    'takeId', p_take_id,
    'totalInitialParticipants', v_initial,
    'completedParticipants', v_completed,
    'changedCount', v_changed,
    'changedPercent', case
      when v_completed = 0 then null
      else round((100.0 * v_changed) / v_completed)
    end
  );
end;
$$;

-- ── 7. RLS ──────────────────────────────────────────────────────────────────
alter table public.take_stances enable row level security;

drop policy if exists "a stance is visible to its owner" on public.take_stances;
create policy "a stance is visible to its owner"
  on public.take_stances for select to authenticated
  using (public.owns_profile(profile_id));

-- ── 8. Privileges ───────────────────────────────────────────────────────────
revoke all on public.take_stances from public, anon, authenticated;
grant select on public.take_stances to authenticated;

revoke execute on function public.take_stance_payload(public.take_stances) from public, anon, authenticated;

grant execute on function public.record_initial_stance(text, public.take_stance) to authenticated;
revoke execute on function public.record_initial_stance(text, public.take_stance) from public, anon;

grant execute on function public.record_final_stance(text, public.take_stance) to authenticated;
revoke execute on function public.record_final_stance(text, public.take_stance) from public, anon;

grant execute on function public.mindshift_stats(text) to anon, authenticated;
revoke execute on function public.mindshift_stats(text) from public;
