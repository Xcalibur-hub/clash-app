-- ============================================================================
-- CLASH 2.0 · Phase 10 Step 3 — Creator earnings reporting
-- ----------------------------------------------------------------------------
-- Extends creator_campaign_stats with commission/period fields.
-- Adds creator_earnings_summary + creator-scoped asset list RPCs.
-- Identity always from my_profile_id(); never accept arbitrary creator ids.
-- ============================================================================

-- OUT signature changed — must drop before recreate.
drop function if exists public.creator_campaign_stats();

-- ── 1. Richer per-campaign creator stats ────────────────────────────────────
create or replace function public.creator_campaign_stats()
returns table (
  campaign_id               text,
  campaign_title            text,
  advertiser_name           text,
  campaign_status           public.sponsor_campaign_status,
  currency                  text,
  starts_at                 timestamptz,
  ends_at                   timestamptz,
  commission_type           public.commission_type,
  commission_value          integer,
  assignment_status         public.campaign_creator_status,
  clicks                    bigint,
  attributed_conversions    bigint,
  pending_commission_minor  bigint,
  approved_commission_minor bigint,
  rejected_commission_minor bigint,
  void_commission_minor     bigint
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_me text := public.my_profile_id();
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;

  return query
  select
    c.id::text,
    c.title::text,
    a.name::text,
    c.status,
    c.currency::text,
    c.starts_at,
    c.ends_at,
    cc.commission_type,
    cc.commission_value,
    cc.status,
    (select count(*)::bigint
       from public.referral_clicks rc
       join public.referral_links rl on rl.id = rc.referral_link_id
      where rl.campaign_id = c.id and rl.creator_profile_id = v_me),
    (select count(*)::bigint
       from public.conversion_attributions ca
      where ca.campaign_id = c.id
        and ca.creator_profile_id = v_me
        and ca.attribution_method <> 'UNATTRIBUTED'),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.campaign_id = c.id and l.creator_profile_id = v_me and l.status = 'PENDING'),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.campaign_id = c.id and l.creator_profile_id = v_me and l.status = 'APPROVED'),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.campaign_id = c.id and l.creator_profile_id = v_me and l.status = 'REJECTED'),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.campaign_id = c.id and l.creator_profile_id = v_me and l.status = 'VOID')
  from public.campaign_creators cc
  join public.sponsor_campaigns c on c.id = cc.campaign_id
  join public.advertisers a on a.id = c.advertiser_id
  where cc.creator_profile_id = v_me
    and cc.status in ('ACTIVE', 'PAUSED', 'INVITED')
  order by c.created_at desc;
end;
$$;

revoke all on function public.creator_campaign_stats() from public, anon;
grant execute on function public.creator_campaign_stats() to authenticated;

-- ── 2. Creator earnings home totals (own ledger + own traffic only) ─────────
create or replace function public.creator_earnings_summary()
returns table (
  currency                  text,
  campaign_count            bigint,
  clicks                    bigint,
  attributed_conversions    bigint,
  pending_commission_minor  bigint,
  approved_commission_minor bigint,
  rejected_commission_minor bigint,
  void_commission_minor     bigint,
  total_earned_minor        bigint
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_me text := public.my_profile_id();
  v_currency text;
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;

  -- Prefer INR when present among assigned campaigns; else first assigned currency.
  select coalesce(
    (select c.currency from public.campaign_creators cc
       join public.sponsor_campaigns c on c.id = cc.campaign_id
      where cc.creator_profile_id = v_me
        and cc.status in ('ACTIVE', 'PAUSED', 'INVITED')
        and c.currency = 'INR'
      limit 1),
    (select c.currency from public.campaign_creators cc
       join public.sponsor_campaigns c on c.id = cc.campaign_id
      where cc.creator_profile_id = v_me
        and cc.status in ('ACTIVE', 'PAUSED', 'INVITED')
      order by c.created_at desc
      limit 1),
    'INR'
  ) into v_currency;

  return query
  select
    v_currency,
    (select count(*)::bigint from public.campaign_creators cc
      where cc.creator_profile_id = v_me
        and cc.status in ('ACTIVE', 'PAUSED', 'INVITED')),
    (select count(*)::bigint
       from public.referral_clicks rc
       join public.referral_links rl on rl.id = rc.referral_link_id
      where rl.creator_profile_id = v_me),
    (select count(*)::bigint
       from public.conversion_attributions ca
      where ca.creator_profile_id = v_me
        and ca.attribution_method <> 'UNATTRIBUTED'),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.creator_profile_id = v_me
        and l.status = 'PENDING'
        and l.currency = v_currency),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.creator_profile_id = v_me
        and l.status = 'APPROVED'
        and l.currency = v_currency),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.creator_profile_id = v_me
        and l.status = 'REJECTED'
        and l.currency = v_currency),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.creator_profile_id = v_me
        and l.status = 'VOID'
        and l.currency = v_currency),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.creator_profile_id = v_me
        and l.status in ('PENDING', 'APPROVED')
        and l.currency = v_currency);
end;
$$;

revoke all on function public.creator_earnings_summary() from public, anon;
grant execute on function public.creator_earnings_summary() to authenticated;

-- ── 3. Creator-owned referral links (optional campaign filter) ──────────────
create or replace function public.creator_my_referral_links(p_campaign_id text default null)
returns table (
  id          text,
  campaign_id text,
  token       text,
  status      public.referral_link_status,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_me text := public.my_profile_id();
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;

  return query
  select
    rl.id::text,
    rl.campaign_id::text,
    rl.token::text,
    rl.status,
    rl.created_at
  from public.referral_links rl
  where rl.creator_profile_id = v_me
    and (p_campaign_id is null or rl.campaign_id = p_campaign_id)
  order by rl.created_at desc;
end;
$$;

revoke all on function public.creator_my_referral_links(text) from public, anon;
grant execute on function public.creator_my_referral_links(text) to authenticated;

-- ── 4. Creator-owned coupons ────────────────────────────────────────────────
create or replace function public.creator_my_coupons(p_campaign_id text default null)
returns table (
  id               text,
  campaign_id      text,
  code             text,
  status           public.coupon_code_status,
  max_redemptions  integer,
  redemption_count integer,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_me text := public.my_profile_id();
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;

  return query
  select
    cc.id::text,
    cc.campaign_id::text,
    cc.code::text,
    cc.status,
    cc.max_redemptions,
    cc.redemption_count,
    cc.created_at
  from public.coupon_codes cc
  where cc.creator_profile_id = v_me
    and (p_campaign_id is null or cc.campaign_id = p_campaign_id)
  order by cc.created_at desc;
end;
$$;

revoke all on function public.creator_my_coupons(text) from public, anon;
grant execute on function public.creator_my_coupons(text) to authenticated;
