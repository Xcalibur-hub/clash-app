-- ============================================================================
-- CLASH 2.0 · 0016 — entitlement mechanism (development / admin only)
-- ----------------------------------------------------------------------------
-- There are no payments yet. This migration therefore creates the ONLY way an
-- entitlement can come into existence, and it is deliberately unreachable from
-- the app:
--
--   · `vault_subscriptions` has no client INSERT/UPDATE/DELETE grant (0014).
--   · EXECUTE on both functions below is revoked from PUBLIC, anon and
--     authenticated, and granted to `service_role` only. A signed-in phone
--     calling either one gets 42501 — it cannot award itself access.
--   · pgTAP tests run as the database owner, and the service key exists only
--     server-side (scripts, the Edge runtime, pg_cron), never in the Expo bundle.
--
-- When a real provider lands (Razorpay/Stripe, or StoreKit/Play Billing), its
-- verified webhook calls a service_role code path shaped exactly like this one.
-- Nothing in the client changes: the app keeps reading
-- `vault_subscriptions` through RLS and asking `can_access_vault_drop`.
-- ============================================================================

-- ── 1. Grant (or renew) an entitlement ──────────────────────────────────────
/**
 * Activate a subscriber's entitlement to a Vault. Idempotent by design: an
 * existing row for the pair is renewed in place, so repeating the call can never
 * create a second entitlement or reset a cancellation history.
 *
 * `p_subscriber_id` defaults to the caller's own profile, which is what makes
 * this usable from an admin script that has already signed in as the subscriber.
 * Passing an explicit id is the admin path — and it is guarded by the EXECUTE
 * grant, not by an in-function check the client could reach.
 */
create or replace function public.vault_grant_test_subscription(
  p_vault_id      text,
  p_subscriber_id text    default null,
  p_days          integer default 30
)
returns public.vault_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscriber text := coalesce(p_subscriber_id, public.my_profile_id());
  v_creator    text;
  v_row        public.vault_subscriptions%rowtype;
begin
  if v_subscriber is null then
    raise exception 'a subscriber is required' using errcode = 'P0003';
  end if;
  if not exists (select 1 from public.profiles where id = v_subscriber) then
    raise exception 'profile does not exist' using errcode = 'P0002';
  end if;

  select creator_id into v_creator from public.creator_vaults where id = p_vault_id;
  if v_creator is null then
    raise exception 'vault does not exist' using errcode = 'P0002';
  end if;
  -- A creator is not their own subscriber: it would make "subscriber content"
  -- meaningless and hand every creator a free entitlement.
  if v_subscriber = v_creator then
    raise exception 'a creator cannot subscribe to their own vault' using errcode = 'P0004';
  end if;

  insert into public.vault_subscriptions
    (id, subscriber_id, vault_id, status, current_period_end, source)
  values (
    'sub_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    v_subscriber,
    p_vault_id,
    'active',
    now() + make_interval(days => greatest(coalesce(p_days, 30), 1)),
    'test'
  )
  on conflict (subscriber_id, vault_id) do update
     set status             = 'active',
         current_period_end = excluded.current_period_end,
         cancelled_at       = null,
         source             = 'test',
         updated_at         = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 2. End an entitlement ───────────────────────────────────────────────────
/**
 * Cancel a subscription. Access ends immediately (the entitlement check requires
 * an active status AND an unexpired period), while the row survives so a renewal
 * — and future billing history — still has somewhere to live.
 */
create or replace function public.vault_revoke_subscription(p_subscription_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.vault_subscriptions where id = p_subscription_id) then
    raise exception 'subscription does not exist' using errcode = 'P0002';
  end if;

  update public.vault_subscriptions
     set status = 'cancelled', cancelled_at = now(), updated_at = now()
   where id = p_subscription_id;
end;
$$;

-- ── 3. Privileges: server-side only ─────────────────────────────────────────
-- No grant to PUBLIC (the PostgreSQL default), and none to the API roles.
revoke execute on function public.vault_grant_test_subscription(text, text, integer)
  from public, anon, authenticated;
revoke execute on function public.vault_revoke_subscription(text)
  from public, anon, authenticated;

grant execute on function public.vault_grant_test_subscription(text, text, integer) to service_role;
grant execute on function public.vault_revoke_subscription(text) to service_role;
