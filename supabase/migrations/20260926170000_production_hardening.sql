-- ============================================================================
-- CLASH 2.0 · 0006 — production hardening
-- ----------------------------------------------------------------------------
-- Server-side abuse controls, scheduler seams, cleanup, and the final audit
-- fixes. No client changes are required for the write-path throttles: they are
-- BEFORE INSERT triggers, so every route into the table (direct PostgREST
-- insert, a definer RPC, a future edge function) is throttled identically.
--
-- CENTRAL LIMITS (single source of truth; tune here, not in the app):
--   take_create      5 / 1 hour
--   comment_create  10 / 1 hour
--   media_upload    10 / 1 hour
--   clash_start      3 / 1 hour
--   judgement       20 / 1 hour
--   follow          20 / 10 minutes
--   block           20 / 10 minutes
--   mute            20 / 10 minutes
--   report          10 / 1 hour
-- Duplicate guards: an identical take or rebuttal by the same author within
-- 10 minutes is rejected (deterministic server rule, not ML).
-- ============================================================================

-- ── 1. Rate limit ledger ─────────────────────────────────────────────────────
-- One row per counted action. Keyed by the actor's profile id (resolved from
-- the session) and the action name; the server clock owns `occurred_at`.
create table if not exists public.rate_limit_events (
  id          bigint generated always as identity primary key,
  actor_id    text not null,
  action      text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists rate_limit_events_lookup_idx
  on public.rate_limit_events (actor_id, action, occurred_at desc);

-- ── 2. Reusable throttle ─────────────────────────────────────────────────────
/**
 * Enforce a fixed-window limit for `(actor, action)`. Raises P0001 with a clear
 * message when the window is saturated. `security definer` so only server code
 * (triggers/RPCs) can count events — the client never writes the ledger.
 */
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
  -- Prune this actor+action's stale rows opportunistically (bounded).
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

/** Drop rate-limit history older than `p_retention` (scheduler maintenance). */
create or replace function public.cleanup_rate_limits(p_retention interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.rate_limit_events where occurred_at < now() - p_retention;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── 3. Write-path throttles (triggers) ───────────────────────────────────────
/**
 * Generic BEFORE INSERT throttle. Action/limit/window come from TG_ARGV so the
 * same trigger body guards takes, media, clashes, judgements, follows, blocks,
 * mutes and reports. Skips when there is no auth session (seed / service_role).
 */
create or replace function public.enforce_action_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := tg_argv[0];
  v_limit  integer := tg_argv[1]::integer;
  v_window interval := tg_argv[2]::interval;
begin
  if auth.uid() is null then
    return new;  -- seeding and server-side writes are not user actions
  end if;
  perform public.assert_rate_limit(public.my_profile_id(), v_action, v_limit, v_window);
  return new;
end;
$$;

-- takes: rate limit + identical-text duplicate guard
create or replace function public.enforce_take_create_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
begin
  if auth.uid() is null then
    return new;
  end if;
  v_actor := public.my_profile_id();
  if v_actor is null then
    raise exception 'sign in to drop a take' using errcode = '42501';
  end if;

  perform public.assert_rate_limit(v_actor, 'take_create', 5, interval '1 hour');

  if exists (
    select 1 from public.takes t
     where t.author_id = v_actor
       and t.text = new.text
       and t.created_at > now() - interval '10 minutes'
  ) then
    raise exception 'you already dropped this take' using errcode = 'P0006';
  end if;

  return new;
end;
$$;

-- comments: rate limit + identical-text duplicate guard (per take)
create or replace function public.enforce_comment_create_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
begin
  if auth.uid() is null then
    return new;
  end if;
  v_actor := public.my_profile_id();
  if v_actor is null then
    raise exception 'sign in to post a rebuttal' using errcode = '42501';
  end if;

  perform public.assert_rate_limit(v_actor, 'comment_create', 10, interval '1 hour');

  if exists (
    select 1 from public.comments c
     where c.take_id = new.take_id
       and c.author_id = v_actor
       and c.text = new.text
       and c.created_at > now() - interval '10 minutes'
  ) then
    raise exception 'you already posted this rebuttal' using errcode = 'P0006';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_take_create_limits on public.takes;
create trigger trg_take_create_limits
  before insert on public.takes
  for each row execute function public.enforce_take_create_limits();

drop trigger if exists trg_comment_create_limits on public.comments;
create trigger trg_comment_create_limits
  before insert on public.comments
  for each row execute function public.enforce_comment_create_limits();

drop trigger if exists trg_media_upload_rate_limit on public.media_objects;
create trigger trg_media_upload_rate_limit
  before insert on public.media_objects
  for each row execute function public.enforce_action_rate_limit('media_upload', '10', '1 hour');

drop trigger if exists trg_clash_start_rate_limit on public.clashes;
create trigger trg_clash_start_rate_limit
  before insert on public.clashes
  for each row execute function public.enforce_action_rate_limit('clash_start', '3', '1 hour');

drop trigger if exists trg_judgement_rate_limit on public.judgements;
create trigger trg_judgement_rate_limit
  before insert on public.judgements
  for each row execute function public.enforce_action_rate_limit('judgement', '20', '1 hour');

drop trigger if exists trg_follow_rate_limit on public.follows;
create trigger trg_follow_rate_limit
  before insert on public.follows
  for each row execute function public.enforce_action_rate_limit('follow', '20', '10 minutes');

drop trigger if exists trg_block_rate_limit on public.blocks;
create trigger trg_block_rate_limit
  before insert on public.blocks
  for each row execute function public.enforce_action_rate_limit('block', '20', '10 minutes');

drop trigger if exists trg_mute_rate_limit on public.mutes;
create trigger trg_mute_rate_limit
  before insert on public.mutes
  for each row execute function public.enforce_action_rate_limit('mute', '20', '10 minutes');

drop trigger if exists trg_report_rate_limit on public.reports;
create trigger trg_report_rate_limit
  before insert on public.reports
  for each row execute function public.enforce_action_rate_limit('report', '10', '1 hour');

-- ── 4. Scheduler seams ───────────────────────────────────────────────────────
/**
 * Settle every due open clash (idempotent, bounded, tolerates individual
 * failures). The mobile app may call this as a fallback, but it is NOT the
 * production mechanism — see the cron note at the bottom of this migration.
 */
create or replace function public.settle_due_clashes(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_settled integer := 0;
begin
  for v_row in
    select id from public.clashes
     where status = 'open' and closes_at <= now()
     order by closes_at
     limit p_limit
  loop
    begin
      perform public.settle_clash(v_row.id);
      v_settled := v_settled + 1;
    exception when others then
      null;  -- a single broken clash never blocks the rest of the batch
    end;
  end loop;
  return v_settled;
end;
$$;

/** Transition expired active takes to 'expired' (non-destructive, bounded). */
create or replace function public.expire_stale_takes(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.takes
     set status = 'expired'
   where id in (
     select id from public.takes
      where status = 'active' and expires_at <= now()
      order by expires_at
      limit p_limit
   );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/**
 * Media orphan cleanup. Marks stale `uploading` rows failed (a half-upload can
 * never complete this late) and tombstones stale `failed` rows, returning the
 * Storage objects to physically remove. Storage bytes are removed by an edge
 * function seam — pure SQL cannot reliably delete Storage objects — so this
 * function returns `{bucket, path}` pairs for that seam to act on.
 */
create or replace function public.cleanup_stale_media(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uploading integer;
  v_deleted   integer := 0;
  v_remove    jsonb := '[]'::jsonb;
  v_row       record;
begin
  update public.media_objects
     set status = 'failed'
   where id in (
     select id from public.media_objects
      where status = 'uploading' and created_at < now() - interval '24 hours'
      order by created_at
      limit p_limit
   );
  get diagnostics v_uploading = row_count;

  for v_row in
    select id, bucket, storage_path from public.media_objects
     where status = 'failed' and created_at < now() - interval '7 days'
     order by created_at
     limit p_limit
  loop
    update public.media_objects
       set status = 'deleted', deleted_at = now()
     where id = v_row.id;
    v_remove := v_remove || jsonb_build_object('bucket', v_row.bucket, 'path', v_row.storage_path);
    v_deleted := v_deleted + 1;
  end loop;

  return jsonb_build_object(
    'uploading_failed', v_uploading,
    'deleted', v_deleted,
    'remove', v_remove
  );
end;
$$;

/** Single maintenance entry point for a scheduler (cron / edge function). */
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
begin
  select public.settle_due_clashes(p_limit) into v_clashes;
  select public.expire_stale_takes(p_limit) into v_takes;
  select public.cleanup_stale_media(least(p_limit, 100)) into v_media;
  select public.cleanup_rate_limits(interval '7 days') into v_rates;

  return jsonb_build_object(
    'clashes_settled', v_clashes,
    'takes_expired', v_takes,
    'media', v_media,
    'rate_limits_pruned', v_rates
  );
end;
$$;

-- ── 5. Deployment scheduler (documented seam) ────────────────────────────────
-- Production scheduling is NOT exercised locally. Deploy ONE of:
--
--   (a) pg_cron on a hosted project:
--         select cron.schedule('clash-maintenance', '* * * * *',
--                $$ select public.run_maintenance(500) $$);
--
--   (b) an Edge Function / external cron that invokes
--         POST /rest/v1/rpc/run_maintenance  (service_role key, server-side only)
--
-- The app's `settle_due_clashes` fallback stays idempotent and safe, but the
-- scheduler above is the only production-guaranteed settlement mechanism.

-- ── 6. Rate-limit ledger RLS + function privileges ──────────────────────────
-- The ledger is server-only: no client reads or writes, ever.
alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from anon, authenticated;

-- Internal helpers: callable only by definer triggers / maintenance functions.
revoke execute on function public.assert_rate_limit(text, text, integer, interval) from public, anon, authenticated;
revoke execute on function public.cleanup_rate_limits(interval) from public, anon, authenticated;
revoke execute on function public.enforce_action_rate_limit() from public, anon, authenticated;
revoke execute on function public.enforce_take_create_limits() from public, anon, authenticated;
revoke execute on function public.enforce_comment_create_limits() from public, anon, authenticated;

-- Scheduler seams: service_role only (edge/cron), except the settlement fallback
-- which the app may invoke (idempotent + time-gated) so the phone is never the
-- sole settlement mechanism but can still nudge a due clash forward.
revoke execute on function public.settle_due_clashes(integer) from public, anon;
revoke execute on function public.expire_stale_takes(integer) from public, anon, authenticated;
revoke execute on function public.cleanup_stale_media(integer) from public, anon, authenticated;
revoke execute on function public.run_maintenance(integer) from public, anon, authenticated;

grant execute on function public.settle_due_clashes(integer) to authenticated, service_role;
grant execute on function public.expire_stale_takes(integer) to service_role;
grant execute on function public.cleanup_stale_media(integer) to service_role;
grant execute on function public.run_maintenance(integer) to service_role;
