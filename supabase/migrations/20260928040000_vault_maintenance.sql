-- ============================================================================
-- CLASH 2.0 · 0018 — Vault expiry, folded into the existing scheduler
-- ----------------------------------------------------------------------------
-- The frozen Arena scheduler keeps every job it already had. Vault work is added
-- as two more steps on the same `run_maintenance()` call, and each step obeys the
-- same three constraints as the rest of maintenance: BOUNDED (a limit), IDEMPOTENT
-- (only ever touching rows in one state) and NON-DESTRUCTIVE (status transitions,
-- never deletes — see the permanence model in migration 0014).
--
-- `run_maintenance()` keeps every key it returned before, so the existing
-- `clash-maintenance` cron job and the pgTAP assertions on it keep working; the
-- two new keys are additive.
-- ============================================================================

-- ── 1. Close Drops whose 7-day window has passed ────────────────────────────
/**
 * Flip published Drops to `expired` once their server-stamped window closes.
 *
 * Nothing is deleted and no media is touched: the row, its `media_object_id` and
 * every `vault_collection_items` reference survive, which is precisely what lets
 * a curated Collection outlive the feed. Re-running is a no-op, because only
 * `published` rows are ever considered.
 */
create or replace function public.expire_vault_drops(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select id
      from public.vault_drops
     where status = 'published'
       and expires_at is not null
       and expires_at <= now()
     order by expires_at
     limit greatest(coalesce(p_limit, 0), 0)
  )
  update public.vault_drops d
     set status = 'expired'
    from due
   where d.id = due.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── 2. Lapse subscriptions whose period has ended ───────────────────────────
/**
 * Access already ends the moment `current_period_end` passes (the entitlement
 * check reads the clock), so this is bookkeeping: it moves the row to `expired`
 * so the status field and the entitlement never disagree. Idempotent and bounded
 * in the same way.
 */
create or replace function public.expire_vault_subscriptions(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select id
      from public.vault_subscriptions
     where status in ('active', 'trial')
       and current_period_end <= now()
     order by current_period_end
     limit greatest(coalesce(p_limit, 0), 0)
  )
  update public.vault_subscriptions s
     set status = 'expired', updated_at = now()
    from due
   where s.id = due.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── 3. One maintenance entry point, Vault steps appended ────────────────────
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
begin
  select public.settle_due_clashes(p_limit) into v_clashes;
  select public.expire_stale_takes(p_limit) into v_takes;
  select public.cleanup_stale_media(least(p_limit, 100)) into v_media;
  select public.cleanup_rate_limits(interval '7 days') into v_rates;
  -- Vault expiry rides the same minute-level job; both steps are bounded and
  -- idempotent, so the Arena scheduler's guarantees are unchanged.
  select public.expire_vault_drops(p_limit) into v_drops;
  select public.expire_vault_subscriptions(p_limit) into v_subs;

  return jsonb_build_object(
    'clashes_settled', v_clashes,
    'takes_expired', v_takes,
    'media', v_media,
    'rate_limits_pruned', v_rates,
    'vault_drops_expired', v_drops,
    'vault_subscriptions_expired', v_subs
  );
end;
$$;

-- ── 4. Privileges restated: the whole maintenance surface is server-only ────
-- CREATE OR REPLACE preserves ACLs, so the scheduler's existing revokes still
-- hold — but least privilege is stated explicitly rather than assumed.
revoke execute on function public.expire_vault_drops(integer) from public, anon, authenticated;
revoke execute on function public.expire_vault_subscriptions(integer) from public, anon, authenticated;
revoke execute on function public.run_maintenance(integer) from public, anon, authenticated;

grant execute on function public.expire_vault_drops(integer) to service_role;
grant execute on function public.expire_vault_subscriptions(integer) to service_role;
grant execute on function public.run_maintenance(integer) to service_role;
