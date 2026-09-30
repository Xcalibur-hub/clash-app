-- ============================================================================
-- CLASH 2.0 · Phase 10 Step 1 — Sponsorship + referral attribution foundation
-- ----------------------------------------------------------------------------
-- Server-authoritative advertiser campaigns, opaque referral tokens, coupons,
-- conversion ingestion, attribution, commission ledger, and privacy-safe
-- coarse geography aggregates.
--
-- Privacy (non-negotiable):
--   · No buyer_profile_id / email / phone / name on sponsorship tables
--   · No latitude / longitude / exact_address / raw_ip columns
--   · Advertiser geo RPCs enforce MIN_GEO_AGGREGATE_COUNT = 5
--   · World raw GPS is a separate trust boundary — never reused here
--
-- Conversion ingestion is service_role only (Edge Function / trusted webhook).
-- Ordinary authenticated clients cannot write conversions or commissions.
-- ============================================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type public.advertiser_status as enum (
    'DRAFT', 'ACTIVE', 'PAUSED', 'SUSPENDED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.sponsor_campaign_status as enum (
    'DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.sponsor_campaign_type as enum (
    'REFERRAL', 'COUPON', 'SPONSORED_CHALLENGE', 'CREATOR_PROMO'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.campaign_creator_status as enum (
    'INVITED', 'ACTIVE', 'PAUSED', 'REMOVED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.commission_type as enum (
    'FIXED_PER_CONVERSION', 'PERCENTAGE', 'NONE'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.referral_link_status as enum (
    'ACTIVE', 'PAUSED', 'EXPIRED', 'REVOKED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.coupon_code_status as enum (
    'ACTIVE', 'PAUSED', 'EXPIRED', 'REVOKED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.sponsor_conversion_type as enum (
    'PURCHASE', 'COUPON_REDEMPTION', 'LEAD', 'SIGNUP'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.attribution_method as enum (
    'REFERRAL', 'COUPON', 'UNATTRIBUTED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.commission_ledger_status as enum (
    'PENDING', 'APPROVED', 'REJECTED', 'VOID'
  );
exception when duplicate_object then null;
end $$;

-- ── 2. Tables ───────────────────────────────────────────────────────────────
create table if not exists public.advertisers (
  id                     text primary key,
  name                   text not null check (char_length(name) between 1 and 80),
  slug                   text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 48),
  status                 public.advertiser_status not null default 'DRAFT',
  created_by_profile_id  text not null references public.profiles (id) on delete restrict,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (slug)
);

create table if not exists public.sponsor_campaigns (
  id             text primary key,
  advertiser_id  text not null references public.advertisers (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 80),
  description    text not null default '' check (char_length(description) <= 400),
  status         public.sponsor_campaign_status not null default 'DRAFT',
  campaign_type  public.sponsor_campaign_type not null default 'REFERRAL',
  starts_at      timestamptz,
  ends_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists sponsor_campaigns_advertiser_idx
  on public.sponsor_campaigns (advertiser_id, status);

create table if not exists public.campaign_creators (
  id                  text primary key,
  campaign_id         text not null references public.sponsor_campaigns (id) on delete cascade,
  creator_profile_id  text not null references public.profiles (id) on delete cascade,
  status              public.campaign_creator_status not null default 'ACTIVE',
  commission_type     public.commission_type not null default 'NONE',
  -- FIXED_PER_CONVERSION → minor currency units; PERCENTAGE → basis points (10000 = 100%).
  commission_value    integer not null default 0 check (commission_value >= 0),
  created_at          timestamptz not null default now(),
  unique (campaign_id, creator_profile_id),
  check (
    (commission_type = 'NONE' and commission_value = 0)
    or (commission_type = 'FIXED_PER_CONVERSION' and commission_value >= 0)
    or (commission_type = 'PERCENTAGE' and commission_value between 0 and 10000)
  )
);
create index if not exists campaign_creators_creator_idx
  on public.campaign_creators (creator_profile_id, status);

create table if not exists public.referral_links (
  id                  text primary key,
  campaign_id         text not null references public.sponsor_campaigns (id) on delete cascade,
  creator_profile_id  text not null references public.profiles (id) on delete cascade,
  token               text not null check (char_length(token) between 16 and 64),
  status              public.referral_link_status not null default 'ACTIVE',
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  unique (token)
);
create index if not exists referral_links_campaign_creator_idx
  on public.referral_links (campaign_id, creator_profile_id);

create table if not exists public.referral_clicks (
  id                text primary key,
  referral_link_id  text not null references public.referral_links (id) on delete cascade,
  occurred_at       timestamptz not null default now(),
  platform          text check (platform is null or char_length(platform) <= 32),
  app_version       text check (app_version is null or char_length(app_version) <= 32),
  source            text check (source is null or char_length(source) <= 64),
  coarse_region     text check (coarse_region is null or char_length(coarse_region) <= 64)
  -- Intentionally absent: ip, fingerprint, lat/lng, buyer ids.
);
create index if not exists referral_clicks_link_occurred_idx
  on public.referral_clicks (referral_link_id, occurred_at desc);

create table if not exists public.coupon_codes (
  id                  text primary key,
  campaign_id         text not null references public.sponsor_campaigns (id) on delete cascade,
  creator_profile_id  text not null references public.profiles (id) on delete cascade,
  code                text not null check (char_length(code) between 2 and 32),
  status              public.coupon_code_status not null default 'ACTIVE',
  starts_at           timestamptz,
  expires_at          timestamptz,
  max_redemptions     integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count    integer not null default 0 check (redemption_count >= 0),
  created_at          timestamptz not null default now(),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);
-- One active normalized code globally (prevents ambiguous attribution).
create unique index if not exists coupon_codes_active_code_uidx
  on public.coupon_codes (code)
  where status = 'ACTIVE';
create index if not exists coupon_codes_campaign_idx
  on public.coupon_codes (campaign_id, creator_profile_id);

create table if not exists public.conversion_events (
  id                     text primary key,
  advertiser_id          text not null references public.advertisers (id) on delete cascade,
  campaign_id            text not null references public.sponsor_campaigns (id) on delete cascade,
  external_conversion_id text not null check (char_length(external_conversion_id) between 1 and 128),
  conversion_type        public.sponsor_conversion_type not null,
  gross_amount_minor     integer not null check (gross_amount_minor >= 0),
  currency               text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  occurred_at            timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  unique (advertiser_id, external_conversion_id)
);
create index if not exists conversion_events_campaign_occurred_idx
  on public.conversion_events (campaign_id, occurred_at desc);

create table if not exists public.conversion_attributions (
  conversion_id       text primary key references public.conversion_events (id) on delete cascade,
  campaign_id         text not null references public.sponsor_campaigns (id) on delete cascade,
  creator_profile_id  text references public.profiles (id) on delete set null,
  attribution_method  public.attribution_method not null,
  referral_link_id    text references public.referral_links (id) on delete set null,
  coupon_code_id      text references public.coupon_codes (id) on delete set null,
  attributed_at       timestamptz not null default now(),
  check (
    (attribution_method = 'UNATTRIBUTED' and creator_profile_id is null
      and referral_link_id is null and coupon_code_id is null)
    or (attribution_method = 'REFERRAL' and creator_profile_id is not null
      and referral_link_id is not null and coupon_code_id is null)
    or (attribution_method = 'COUPON' and creator_profile_id is not null
      and coupon_code_id is not null and referral_link_id is null)
  )
);

-- Coarse geography only — never lat/lng.
create table if not exists public.conversion_geo_buckets (
  conversion_id   text primary key references public.conversion_events (id) on delete cascade,
  region_code     text not null check (char_length(region_code) between 1 and 32),
  region_label    text not null check (char_length(region_label) between 1 and 80),
  coarse_bucket   text not null check (char_length(coarse_bucket) between 1 and 64),
  distance_band   text check (distance_band is null or char_length(distance_band) <= 32),
  created_at      timestamptz not null default now()
);
create index if not exists conversion_geo_buckets_label_idx
  on public.conversion_geo_buckets (region_label);

create table if not exists public.creator_commission_ledger (
  id                  text primary key,
  creator_profile_id  text not null references public.profiles (id) on delete cascade,
  advertiser_id       text not null references public.advertisers (id) on delete cascade,
  campaign_id         text not null references public.sponsor_campaigns (id) on delete cascade,
  conversion_id       text not null references public.conversion_events (id) on delete cascade,
  amount_minor        integer not null check (amount_minor >= 0),
  currency            text not null check (currency ~ '^[A-Z]{3}$'),
  status              public.commission_ledger_status not null default 'PENDING',
  created_at          timestamptz not null default now(),
  unique (conversion_id)
);
create index if not exists creator_commission_ledger_creator_idx
  on public.creator_commission_ledger (creator_profile_id, status, created_at desc);

-- ── 3. Helpers ──────────────────────────────────────────────────────────────
/** Privacy threshold for advertiser-facing geo aggregates. */
create or replace function public.sponsor_min_geo_aggregate_count()
returns integer
language sql
immutable
as $$
  select 5;
$$;

/** True when the caller owns this advertiser (created_by_profile_id). */
create or replace function public.is_advertiser_owner(p_advertiser_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.advertisers a
     where a.id = p_advertiser_id
       and a.created_by_profile_id = public.my_profile_id()
  );
$$;

/** Normalize coupon codes: trim, upper-case, strip spaces. */
create or replace function public.sponsor_normalize_coupon_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g'));
$$;

/** Opaque unguessable referral token (hex). */
create or replace function public.sponsor_new_referral_token()
returns text
language sql
volatile
as $$
  select lower(substr(md5(random()::text || clock_timestamp()::text || random()::text), 1, 32)
    || substr(md5(random()::text || clock_timestamp()::text), 1, 8));
$$;

/**
 * Integer-safe commission calculation.
 * FIXED_PER_CONVERSION → commission_value (minor units).
 * PERCENTAGE → floor(gross_minor * basis_points / 10000); 10000 = 100%.
 * NONE → 0.
 */
create or replace function public.sponsor_calc_commission_minor(
  p_commission_type  public.commission_type,
  p_commission_value integer,
  p_gross_minor      integer
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_gross_minor is null or p_gross_minor < 0 then
    raise exception 'gross amount must be non-negative' using errcode = 'P0003';
  end if;
  if p_commission_type = 'NONE' then
    return 0;
  elsif p_commission_type = 'FIXED_PER_CONVERSION' then
    if p_commission_value < 0 then
      raise exception 'fixed commission must be non-negative' using errcode = 'P0003';
    end if;
    return p_commission_value;
  elsif p_commission_type = 'PERCENTAGE' then
    if p_commission_value < 0 or p_commission_value > 10000 then
      raise exception 'percentage commission must be 0-10000 basis points' using errcode = 'P0003';
    end if;
    return (p_gross_minor::bigint * p_commission_value::bigint / 10000)::integer;
  else
    raise exception 'unknown commission type' using errcode = 'P0003';
  end if;
end;
$$;

/** Campaign is currently eligible to receive conversions. */
create or replace function public.sponsor_campaign_is_live(p_campaign public.sponsor_campaigns)
returns boolean
language sql
stable
as $$
  select p_campaign.status = 'ACTIVE'
     and (p_campaign.starts_at is null or p_campaign.starts_at <= now())
     and (p_campaign.ends_at is null or p_campaign.ends_at > now());
$$;

-- ── 4. Trusted conversion ingestion (service_role) ──────────────────────────
/**
 * Record a conversion + resolve attribution + write commission ledger + optional geo.
 * Idempotent on (advertiser_id, external_conversion_id).
 *
 * Trust boundary: Edge Function / merchant webhook with service_role only.
 * Ordinary clients MUST NOT have EXECUTE.
 */
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

  select * into v_advertiser from public.advertisers where id = v_campaign.advertiser_id;
  if not found or v_advertiser.status not in ('ACTIVE', 'PAUSED') then
    -- SUSPENDED / DRAFT advertisers cannot ingest; PAUSED advertiser still stores
    -- for audit but campaign must be live below.
    if not found or v_advertiser.status in ('DRAFT', 'SUSPENDED') then
      raise exception 'advertiser not eligible' using errcode = 'P0003';
    end if;
  end if;

  if not public.sponsor_campaign_is_live(v_campaign) then
    raise exception 'campaign is not active' using errcode = 'P0003';
  end if;

  -- Idempotency: return the existing conversion unchanged.
  select * into v_existing
    from public.conversion_events
   where advertiser_id = v_campaign.advertiser_id
     and external_conversion_id = v_ext;
  if found then
    return v_existing;
  end if;

  -- Attribution priority: valid coupon → valid referral → unattributed.
  if v_coupon_norm <> '' then
    select * into v_coupon
      from public.coupon_codes c
     where c.code = v_coupon_norm
       and c.campaign_id = v_campaign.id
       and c.status = 'ACTIVE'
       and (c.starts_at is null or c.starts_at <= now())
       and (c.expires_at is null or c.expires_at > now())
       and (c.max_redemptions is null or c.redemption_count < c.max_redemptions);
    if found then
      select * into v_assignment
        from public.campaign_creators cc
       where cc.campaign_id = v_campaign.id
         and cc.creator_profile_id = v_coupon.creator_profile_id
         and cc.status = 'ACTIVE';
      if found then
        v_method := 'COUPON';
        v_creator := v_coupon.creator_profile_id;
        v_coupon_id := v_coupon.id;
      end if;
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

  insert into public.conversion_events (
    id, advertiser_id, campaign_id, external_conversion_id,
    conversion_type, gross_amount_minor, currency, occurred_at
  ) values (
    'sce_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
    v_campaign.advertiser_id, v_campaign.id, v_ext,
    p_conversion_type, p_gross_amount_minor, v_currency, coalesce(p_occurred_at, now())
  )
  returning * into v_conversion;

  insert into public.conversion_attributions (
    conversion_id, campaign_id, creator_profile_id, attribution_method,
    referral_link_id, coupon_code_id
  ) values (
    v_conversion.id, v_campaign.id, v_creator, v_method, v_link_id, v_coupon_id
  );

  if v_coupon_id is not null then
    update public.coupon_codes
       set redemption_count = redemption_count + 1
     where id = v_coupon_id;
  end if;

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
          'ccl_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
          v_creator, v_campaign.advertiser_id, v_campaign.id, v_conversion.id,
          v_commission, v_currency, 'PENDING'
        );
      end if;
    end if;
  end if;

  -- Optional coarse geo — only when all required coarse fields are present.
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
    );
  end if;

  return v_conversion;
end;
$$;

-- ── 5. Referral click (service_role — trusted edge/deep-link handler) ───────
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
  v_link  public.referral_links%rowtype;
  v_camp  public.sponsor_campaigns%rowtype;
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_row   public.referral_clicks%rowtype;
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

  insert into public.referral_clicks (
    id, referral_link_id, platform, app_version, source, coarse_region
  ) values (
    'rclk_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
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

-- ── 6. Advertiser reporting RPCs ────────────────────────────────────────────
create or replace function public.advertiser_campaign_summary(p_campaign_id text)
returns table (
  campaign_id              text,
  clicks                   bigint,
  conversions              bigint,
  attributed_conversions   bigint,
  gross_revenue_minor      bigint,
  creator_commission_minor bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_campaign public.sponsor_campaigns%rowtype;
begin
  select * into v_campaign from public.sponsor_campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if not public.is_advertiser_owner(v_campaign.advertiser_id) and not public.is_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    v_campaign.id,
    (select count(*)::bigint
       from public.referral_clicks rc
       join public.referral_links rl on rl.id = rc.referral_link_id
      where rl.campaign_id = v_campaign.id),
    (select count(*)::bigint from public.conversion_events ce where ce.campaign_id = v_campaign.id),
    (select count(*)::bigint
       from public.conversion_attributions ca
      where ca.campaign_id = v_campaign.id
        and ca.attribution_method <> 'UNATTRIBUTED'),
    (select coalesce(sum(ce.gross_amount_minor), 0)::bigint
       from public.conversion_events ce where ce.campaign_id = v_campaign.id),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.campaign_id = v_campaign.id
        and l.status in ('PENDING', 'APPROVED'));
end;
$$;

/**
 * Privacy-safe geo aggregate. Buckets with fewer than MIN_GEO_AGGREGATE_COUNT
 * conversions are excluded (not returned as individual rows). Remaining small
 * mass is not reassigned in v1 — callers see only threshold-safe buckets.
 */
create or replace function public.advertiser_campaign_geo_summary(p_campaign_id text)
returns table (
  region_label         text,
  coarse_bucket        text,
  conversion_count     bigint,
  gross_revenue_minor  bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_campaign public.sponsor_campaigns%rowtype;
  v_min      integer := public.sponsor_min_geo_aggregate_count();
begin
  select * into v_campaign from public.sponsor_campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if not public.is_advertiser_owner(v_campaign.advertiser_id) and not public.is_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    g.region_label,
    g.coarse_bucket,
    count(*)::bigint as conversion_count,
    coalesce(sum(ce.gross_amount_minor), 0)::bigint as gross_revenue_minor
  from public.conversion_geo_buckets g
  join public.conversion_events ce on ce.id = g.conversion_id
  where ce.campaign_id = v_campaign.id
  group by g.region_label, g.coarse_bucket
  having count(*) >= v_min
  order by conversion_count desc, g.region_label;
end;
$$;

-- ── 7. Creator reporting RPCs ───────────────────────────────────────────────
create or replace function public.creator_campaign_stats()
returns table (
  campaign_id              text,
  campaign_title           text,
  advertiser_name          text,
  clicks                   bigint,
  attributed_conversions   bigint,
  pending_commission_minor bigint,
  approved_commission_minor bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me text := public.my_profile_id();
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.title,
    a.name,
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
      where l.campaign_id = c.id and l.creator_profile_id = v_me and l.status = 'APPROVED')
  from public.campaign_creators cc
  join public.sponsor_campaigns c on c.id = cc.campaign_id
  join public.advertisers a on a.id = c.advertiser_id
  where cc.creator_profile_id = v_me
    and cc.status in ('ACTIVE', 'PAUSED', 'INVITED');
end;
$$;

-- ── 8. RLS ──────────────────────────────────────────────────────────────────
alter table public.advertisers enable row level security;
alter table public.sponsor_campaigns enable row level security;
alter table public.campaign_creators enable row level security;
alter table public.referral_links enable row level security;
alter table public.referral_clicks enable row level security;
alter table public.coupon_codes enable row level security;
alter table public.conversion_events enable row level security;
alter table public.conversion_attributions enable row level security;
alter table public.conversion_geo_buckets enable row level security;
alter table public.creator_commission_ledger enable row level security;

drop policy if exists "advertiser owner can read advertiser" on public.advertisers;
create policy "advertiser owner can read advertiser"
  on public.advertisers for select to authenticated
  using (public.owns_profile(created_by_profile_id) or public.is_staff());

drop policy if exists "advertiser owner or assigned creator can read campaign" on public.sponsor_campaigns;
create policy "advertiser owner or assigned creator can read campaign"
  on public.sponsor_campaigns for select to authenticated
  using (
    public.is_advertiser_owner(advertiser_id)
    or public.is_staff()
    or exists (
      select 1 from public.campaign_creators cc
       where cc.campaign_id = sponsor_campaigns.id
         and cc.creator_profile_id = public.my_profile_id()
    )
  );

drop policy if exists "campaign creator assignment visible to parties" on public.campaign_creators;
create policy "campaign creator assignment visible to parties"
  on public.campaign_creators for select to authenticated
  using (
    public.owns_profile(creator_profile_id)
    or public.is_staff()
    or exists (
      select 1 from public.sponsor_campaigns c
       where c.id = campaign_creators.campaign_id
         and public.is_advertiser_owner(c.advertiser_id)
    )
  );

drop policy if exists "referral links visible to parties" on public.referral_links;
create policy "referral links visible to parties"
  on public.referral_links for select to authenticated
  using (
    public.owns_profile(creator_profile_id)
    or public.is_staff()
    or exists (
      select 1 from public.sponsor_campaigns c
       where c.id = referral_links.campaign_id
         and public.is_advertiser_owner(c.advertiser_id)
    )
  );

-- Raw click rows are not client-readable; aggregates come from RPCs only.
-- (No SELECT policy for authenticated → deny by default under RLS.)

drop policy if exists "coupon codes visible to parties" on public.coupon_codes;
create policy "coupon codes visible to parties"
  on public.coupon_codes for select to authenticated
  using (
    public.owns_profile(creator_profile_id)
    or public.is_staff()
    or exists (
      select 1 from public.sponsor_campaigns c
       where c.id = coupon_codes.campaign_id
         and public.is_advertiser_owner(c.advertiser_id)
    )
  );

-- conversion_events / attributions / geo: no authenticated SELECT policies.
-- ledger: creator may read own rows only.
drop policy if exists "creator reads own commission ledger" on public.creator_commission_ledger;
create policy "creator reads own commission ledger"
  on public.creator_commission_ledger for select to authenticated
  using (public.owns_profile(creator_profile_id) or public.is_staff());

-- ── 9. Privileges ───────────────────────────────────────────────────────────
revoke all on public.advertisers, public.sponsor_campaigns, public.campaign_creators,
              public.referral_links, public.referral_clicks, public.coupon_codes,
              public.conversion_events, public.conversion_attributions,
              public.conversion_geo_buckets, public.creator_commission_ledger
  from anon, authenticated, public;

grant select on public.advertisers, public.sponsor_campaigns, public.campaign_creators,
                public.referral_links, public.coupon_codes, public.creator_commission_ledger
  to authenticated;

-- No grant on conversion_events, attributions, geo_buckets, referral_clicks to clients.

grant all on public.advertisers, public.sponsor_campaigns, public.campaign_creators,
             public.referral_links, public.referral_clicks, public.coupon_codes,
             public.conversion_events, public.conversion_attributions,
             public.conversion_geo_buckets, public.creator_commission_ledger
  to service_role;

-- Helper execute grants
grant execute on function public.sponsor_min_geo_aggregate_count() to authenticated, service_role;
grant execute on function public.is_advertiser_owner(text) to authenticated, service_role;
grant execute on function public.sponsor_normalize_coupon_code(text) to authenticated, service_role;
grant execute on function public.sponsor_new_referral_token() to service_role;
grant execute on function public.sponsor_calc_commission_minor(public.commission_type, integer, integer)
  to authenticated, service_role;

revoke all on function public.record_sponsor_conversion(
  text, text, public.sponsor_conversion_type, integer, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_sponsor_conversion(
  text, text, public.sponsor_conversion_type, integer, text, text, text, text, text, text, text, timestamptz
) to service_role;

revoke all on function public.record_referral_click(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_referral_click(text, text, text, text, text)
  to service_role;

grant execute on function public.advertiser_campaign_summary(text) to authenticated;
grant execute on function public.advertiser_campaign_geo_summary(text) to authenticated;
grant execute on function public.creator_campaign_stats() to authenticated;

revoke execute on function public.advertiser_campaign_summary(text) from public, anon;
revoke execute on function public.advertiser_campaign_geo_summary(text) from public, anon;
revoke execute on function public.creator_campaign_stats() from public, anon;
