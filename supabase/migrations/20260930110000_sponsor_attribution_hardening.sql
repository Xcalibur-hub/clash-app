-- ============================================================================
-- CLASH 2.0 · Phase 10 Step 1.5 — Sponsor attribution hardening
-- ----------------------------------------------------------------------------
-- Cryptographic referral tokens, concurrency-safe conversion idempotency,
-- atomic coupon redemption, campaign single-currency contract, ACTIVE-only
-- advertiser ingestion, and write-time coupon canonicalization.
--
-- Does not weaken privacy: still no buyer identity / lat-lng / raw IP.
-- ============================================================================

-- ── 1. pgcrypto (cryptographically secure bytes) ────────────────────────────
create extension if not exists pgcrypto with schema extensions;

-- ── 2. Campaign single-currency contract ────────────────────────────────────
alter table public.sponsor_campaigns
  add column if not exists currency text;

update public.sponsor_campaigns
   set currency = 'INR'
 where currency is null;

alter table public.sponsor_campaigns
  alter column currency set default 'INR';

alter table public.sponsor_campaigns
  alter column currency set not null;

do $$ begin
  alter table public.sponsor_campaigns
    add constraint sponsor_campaigns_currency_chk
    check (currency ~ '^[A-Z]{3}$');
exception when duplicate_object then null;
end $$;

-- ── 3. Cryptographic referral tokens (128+ bits) ────────────────────────────
/**
 * Opaque URL-safe hex token from 24 random bytes = 192 bits of entropy.
 * service_role only — never callable by ordinary clients.
 */
create or replace function public.sponsor_new_referral_token()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select encode(extensions.gen_random_bytes(24), 'hex');
$$;

revoke all on function public.sponsor_new_referral_token() from public, anon, authenticated;
grant execute on function public.sponsor_new_referral_token() to service_role;

-- ── 4. Coupon canonicalization on WRITE ─────────────────────────────────────
create or replace function public.sponsor_coupon_canonicalize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := public.sponsor_normalize_coupon_code(new.code);
begin
  if v_code = '' or char_length(v_code) < 2 or char_length(v_code) > 32 then
    raise exception 'coupon code must normalize to 2-32 characters' using errcode = 'P0003';
  end if;
  new.code := v_code;
  return new;
end;
$$;

drop trigger if exists sponsor_coupon_canonicalize_trg on public.coupon_codes;
create trigger sponsor_coupon_canonicalize_trg
  before insert or update of code on public.coupon_codes
  for each row execute function public.sponsor_coupon_canonicalize();

revoke all on function public.sponsor_coupon_canonicalize() from public, anon, authenticated;

-- Normalize any pre-existing rows (idempotent).
update public.coupon_codes
   set code = public.sponsor_normalize_coupon_code(code)
 where code is distinct from public.sponsor_normalize_coupon_code(code);

-- ── 5. Hardened conversion ingestion ────────────────────────────────────────
create or replace function public.record_sponsor_conversion(
  p_campaign_id            text,
  p_external_conversion_id text,
  p_conversion_type        public.sponsor_conversion_type,
  p_gross_amount_minor     integer,
  p_currency               text default 'INR',
  p_referral_token         text default null,
  p_coupon_code            text default null,
  p_region_code            text default null,
  p_region_label           text default null,
  p_coarse_bucket          text default null,
  p_distance_band          text default null,
  p_occurred_at            timestamptz default now()
)
returns public.conversion_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign     public.sponsor_campaigns%rowtype;
  v_advertiser   public.advertisers%rowtype;
  v_ext          text := trim(coalesce(p_external_conversion_id, ''));
  v_currency     text := upper(trim(coalesce(p_currency, 'INR')));
  v_coupon_norm  text := public.sponsor_normalize_coupon_code(p_coupon_code);
  v_token        text := nullif(trim(coalesce(p_referral_token, '')), '');
  v_existing     public.conversion_events%rowtype;
  v_conversion   public.conversion_events%rowtype;
  v_coupon       public.coupon_codes%rowtype;
  v_link         public.referral_links%rowtype;
  v_assignment   public.campaign_creators%rowtype;
  v_method       public.attribution_method := 'UNATTRIBUTED';
  v_creator      text := null;
  v_link_id      text := null;
  v_coupon_id    text := null;
  v_commission   integer := 0;
  v_conv_id      text;
begin
  if v_ext = '' or char_length(v_ext) > 128 then
    raise exception 'external_conversion_id required' using errcode = 'P0003';
  end if;
  if p_gross_amount_minor is null or p_gross_amount_minor < 0 then
    raise exception 'gross_amount_minor must be >= 0' using errcode = 'P0003';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'currency must be a 3-letter ISO code' using errcode = 'P0003';
  end if;

  select * into v_campaign from public.sponsor_campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  -- Single-currency campaigns: conversion currency must match campaign currency.
  if v_currency is distinct from v_campaign.currency then
    raise exception 'conversion currency must match campaign currency (%)', v_campaign.currency
      using errcode = 'P0003';
  end if;

  select * into v_advertiser from public.advertisers where id = v_campaign.advertiser_id;
  if not found or v_advertiser.status <> 'ACTIVE' then
    raise exception 'advertiser not eligible' using errcode = 'P0003';
  end if;

  if not public.sponsor_campaign_is_live(v_campaign) then
    raise exception 'campaign is not active' using errcode = 'P0003';
  end if;

  -- Fast path: already exists.
  select * into v_existing
    from public.conversion_events
   where advertiser_id = v_campaign.advertiser_id
     and external_conversion_id = v_ext;
  if found then
    return v_existing;
  end if;

  v_conv_id := 'sce_' || encode(extensions.gen_random_bytes(10), 'hex');

  -- Concurrency-safe insert: losers of the unique race re-read and return.
  insert into public.conversion_events (
    id, advertiser_id, campaign_id, external_conversion_id,
    conversion_type, gross_amount_minor, currency, occurred_at
  ) values (
    v_conv_id,
    v_campaign.advertiser_id, v_campaign.id, v_ext,
    p_conversion_type, p_gross_amount_minor, v_currency, coalesce(p_occurred_at, now())
  )
  on conflict (advertiser_id, external_conversion_id) do nothing
  returning * into v_conversion;

  if not found then
    select * into v_conversion
      from public.conversion_events
     where advertiser_id = v_campaign.advertiser_id
       and external_conversion_id = v_ext;
    return v_conversion;
  end if;

  -- Only the insert winner resolves attribution / coupon / commission / geo.

  -- Coupon: atomically reserve capacity. Attribution is COUPON only if reserved.
  if v_coupon_norm <> '' then
    update public.coupon_codes c
       set redemption_count = c.redemption_count + 1
     where c.code = v_coupon_norm
       and c.campaign_id = v_campaign.id
       and c.status = 'ACTIVE'
       and (c.starts_at is null or c.starts_at <= now())
       and (c.expires_at is null or c.expires_at > now())
       and (c.max_redemptions is null or c.redemption_count < c.max_redemptions)
       and exists (
         select 1 from public.campaign_creators cc
          where cc.campaign_id = c.campaign_id
            and cc.creator_profile_id = c.creator_profile_id
            and cc.status = 'ACTIVE'
       )
    returning c.* into v_coupon;

    if found then
      v_method := 'COUPON';
      v_creator := v_coupon.creator_profile_id;
      v_coupon_id := v_coupon.id;
    end if;
  end if;

  if v_method = 'UNATTRIBUTED' and v_token is not null then
    select * into v_link
      from public.referral_links rl
     where rl.token = v_token
       and rl.campaign_id = v_campaign.id
       and rl.status = 'ACTIVE'
       and (rl.expires_at is null or rl.expires_at > now());
    if found then
      select * into v_assignment
        from public.campaign_creators cc
       where cc.campaign_id = v_campaign.id
         and cc.creator_profile_id = v_link.creator_profile_id
         and cc.status = 'ACTIVE';
      if found then
        v_method := 'REFERRAL';
        v_creator := v_link.creator_profile_id;
        v_link_id := v_link.id;
      end if;
    end if;
  end if;

  insert into public.conversion_attributions (
    conversion_id, campaign_id, creator_profile_id, attribution_method,
    referral_link_id, coupon_code_id
  ) values (
    v_conversion.id, v_campaign.id, v_creator, v_method, v_link_id, v_coupon_id
  );

  if v_method <> 'UNATTRIBUTED' and v_creator is not null then
    select * into v_assignment
      from public.campaign_creators
     where campaign_id = v_campaign.id
       and creator_profile_id = v_creator
       and status = 'ACTIVE';
    if found and v_assignment.commission_type <> 'NONE' then
      v_commission := public.sponsor_calc_commission_minor(
        v_assignment.commission_type,
        v_assignment.commission_value,
        p_gross_amount_minor
      );
      if v_commission > 0 then
        insert into public.creator_commission_ledger (
          id, creator_profile_id, advertiser_id, campaign_id, conversion_id,
          amount_minor, currency, status
        ) values (
          'ccl_' || encode(extensions.gen_random_bytes(10), 'hex'),
          v_creator, v_campaign.advertiser_id, v_campaign.id, v_conversion.id,
          v_commission, v_currency, 'PENDING'
        )
        on conflict (conversion_id) do nothing;
      end if;
    end if;
  end if;

  if p_region_code is not null and p_region_label is not null and p_coarse_bucket is not null then
    if char_length(trim(p_region_code)) = 0
       or char_length(trim(p_region_label)) = 0
       or char_length(trim(p_coarse_bucket)) = 0 then
      raise exception 'geo fields must be non-empty when provided' using errcode = 'P0003';
    end if;
    insert into public.conversion_geo_buckets (
      conversion_id, region_code, region_label, coarse_bucket, distance_band
    ) values (
      v_conversion.id,
      trim(p_region_code),
      trim(p_region_label),
      trim(p_coarse_bucket),
      nullif(trim(coalesce(p_distance_band, '')), '')
    )
    on conflict (conversion_id) do nothing;
  end if;

  return v_conversion;
end;
$$;

revoke all on function public.record_sponsor_conversion(
  text, text, public.sponsor_conversion_type, integer, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_sponsor_conversion(
  text, text, public.sponsor_conversion_type, integer, text, text, text, text, text, text, text, timestamptz
) to service_role;

-- ── 6. Referral clicks: advertiser must be ACTIVE ───────────────────────────
create or replace function public.record_referral_click(
  p_token         text,
  p_platform      text default null,
  p_app_version   text default null,
  p_source        text default null,
  p_coarse_region text default null
)
returns public.referral_clicks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link       public.referral_links%rowtype;
  v_camp       public.sponsor_campaigns%rowtype;
  v_advertiser public.advertisers%rowtype;
  v_token      text := nullif(trim(coalesce(p_token, '')), '');
  v_row        public.referral_clicks%rowtype;
begin
  if v_token is null then
    raise exception 'referral token required' using errcode = 'P0003';
  end if;

  select * into v_link from public.referral_links where token = v_token;
  if not found then
    raise exception 'referral link not found' using errcode = 'P0002';
  end if;
  if v_link.status <> 'ACTIVE' or (v_link.expires_at is not null and v_link.expires_at <= now()) then
    raise exception 'referral link not active' using errcode = 'P0003';
  end if;

  select * into v_camp from public.sponsor_campaigns where id = v_link.campaign_id;
  if not found or not public.sponsor_campaign_is_live(v_camp) then
    raise exception 'campaign is not active' using errcode = 'P0003';
  end if;

  select * into v_advertiser from public.advertisers where id = v_camp.advertiser_id;
  if not found or v_advertiser.status <> 'ACTIVE' then
    raise exception 'advertiser not eligible' using errcode = 'P0003';
  end if;

  insert into public.referral_clicks (
    id, referral_link_id, platform, app_version, source, coarse_region
  ) values (
    'rclk_' || encode(extensions.gen_random_bytes(10), 'hex'),
    v_link.id,
    nullif(trim(coalesce(p_platform, '')), ''),
    nullif(trim(coalesce(p_app_version, '')), ''),
    nullif(trim(coalesce(p_source, '')), ''),
    nullif(trim(coalesce(p_coarse_region, '')), '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.record_referral_click(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_referral_click(text, text, text, text, text)
  to service_role;
