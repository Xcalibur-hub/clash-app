-- ============================================================================
-- CLASH 2.0 · Phase 10 Step 2 — Advertiser management RPCs
-- ----------------------------------------------------------------------------
-- Owner-authenticated write/read helpers for Sponsor Studio:
--   create advertiser, campaigns, assignments, referral links, coupons,
--   status transitions, overview + creator performance aggregates.
--
-- All writes derive caller from my_profile_id() and verify ownership.
-- No client INSERT/UPDATE grants. Privacy model unchanged.
-- ============================================================================

-- ── 1. Ownership helper ─────────────────────────────────────────────────────
create or replace function public.assert_advertiser_owner(p_advertiser_id text)
returns text
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
  if public.is_staff() then
    return v_me;
  end if;
  if not exists (
    select 1 from public.advertisers a
     where a.id = p_advertiser_id
       and a.created_by_profile_id = v_me
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

revoke all on function public.assert_advertiser_owner(text) from public, anon;
grant execute on function public.assert_advertiser_owner(text) to authenticated, service_role;

create or replace function public.assert_campaign_owner(p_campaign_id text)
returns public.sponsor_campaigns
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_camp public.sponsor_campaigns%rowtype;
begin
  select * into v_camp from public.sponsor_campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  perform public.assert_advertiser_owner(v_camp.advertiser_id);
  return v_camp;
end;
$$;

revoke all on function public.assert_campaign_owner(text) from public, anon;
grant execute on function public.assert_campaign_owner(text) to authenticated, service_role;

-- ── 2. Create advertiser ────────────────────────────────────────────────────
create or replace function public.create_advertiser(
  p_name text,
  p_slug text
)
returns public.advertisers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   text := public.my_profile_id();
  v_name text := trim(coalesce(p_name, ''));
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_row  public.advertisers%rowtype;
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'advertiser name must be 1-80 characters' using errcode = 'P0003';
  end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) < 2 or char_length(v_slug) > 48 then
    raise exception 'slug must be 2-48 lowercase letters, numbers, or hyphens' using errcode = 'P0003';
  end if;

  insert into public.advertisers (id, name, slug, status, created_by_profile_id)
  values (
    'adv_' || encode(extensions.gen_random_bytes(8), 'hex'),
    v_name, v_slug, 'DRAFT', v_me
  )
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'that slug is already taken' using errcode = 'P0003';
end;
$$;

revoke all on function public.create_advertiser(text, text) from public, anon;
grant execute on function public.create_advertiser(text, text) to authenticated;

-- Activate advertiser workspace (owner only).
create or replace function public.activate_advertiser(p_advertiser_id text)
returns public.advertisers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.advertisers%rowtype;
begin
  perform public.assert_advertiser_owner(p_advertiser_id);
  update public.advertisers
     set status = 'ACTIVE', updated_at = now()
   where id = p_advertiser_id
     and status in ('DRAFT', 'PAUSED')
  returning * into v_row;
  if not found then
    raise exception 'advertiser cannot be activated from current status' using errcode = 'P0003';
  end if;
  return v_row;
end;
$$;

revoke all on function public.activate_advertiser(text) from public, anon;
grant execute on function public.activate_advertiser(text) to authenticated;

-- ── 3. Campaign CRUD / status ───────────────────────────────────────────────
create or replace function public.create_sponsor_campaign(
  p_advertiser_id text,
  p_title         text,
  p_description   text default '',
  p_campaign_type public.sponsor_campaign_type default 'REFERRAL',
  p_currency      text default 'INR',
  p_starts_at     timestamptz default null,
  p_ends_at       timestamptz default null
)
returns public.sponsor_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_desc  text := coalesce(trim(p_description), '');
  v_cur   text := upper(trim(coalesce(p_currency, 'INR')));
  v_row   public.sponsor_campaigns%rowtype;
begin
  perform public.assert_advertiser_owner(p_advertiser_id);
  if v_title = '' or char_length(v_title) > 80 then
    raise exception 'campaign title must be 1-80 characters' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 400 then
    raise exception 'description must be 400 characters or fewer' using errcode = 'P0003';
  end if;
  if v_cur !~ '^[A-Z]{3}$' then
    raise exception 'currency must be a 3-letter ISO code' using errcode = 'P0003';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'ends_at must be after starts_at' using errcode = 'P0003';
  end if;

  insert into public.sponsor_campaigns (
    id, advertiser_id, title, description, status, campaign_type, currency, starts_at, ends_at
  ) values (
    'camp_' || encode(extensions.gen_random_bytes(8), 'hex'),
    p_advertiser_id, v_title, v_desc, 'DRAFT', p_campaign_type, v_cur, p_starts_at, p_ends_at
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_sponsor_campaign(
  text, text, text, public.sponsor_campaign_type, text, timestamptz, timestamptz
) from public, anon;
grant execute on function public.create_sponsor_campaign(
  text, text, text, public.sponsor_campaign_type, text, timestamptz, timestamptz
) to authenticated;

create or replace function public.update_sponsor_campaign(
  p_campaign_id   text,
  p_title         text default null,
  p_description   text default null,
  p_starts_at     timestamptz default null,
  p_ends_at       timestamptz default null,
  p_clear_starts  boolean default false,
  p_clear_ends    boolean default false
)
returns public.sponsor_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camp public.sponsor_campaigns%rowtype;
  v_row  public.sponsor_campaigns%rowtype;
  v_title text;
  v_desc  text;
  v_start timestamptz;
  v_end   timestamptz;
begin
  v_camp := public.assert_campaign_owner(p_campaign_id);
  if v_camp.status in ('ENDED', 'CANCELLED') then
    raise exception 'ended or cancelled campaigns cannot be edited' using errcode = 'P0003';
  end if;

  v_title := coalesce(nullif(trim(coalesce(p_title, '')), ''), v_camp.title);
  v_desc  := case when p_description is null then v_camp.description else trim(p_description) end;
  v_start := case when p_clear_starts then null when p_starts_at is null then v_camp.starts_at else p_starts_at end;
  v_end   := case when p_clear_ends then null when p_ends_at is null then v_camp.ends_at else p_ends_at end;

  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'campaign title must be 1-80 characters' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 400 then
    raise exception 'description must be 400 characters or fewer' using errcode = 'P0003';
  end if;
  if v_end is not null and v_start is not null and v_end <= v_start then
    raise exception 'ends_at must be after starts_at' using errcode = 'P0003';
  end if;

  update public.sponsor_campaigns
     set title = v_title,
         description = v_desc,
         starts_at = v_start,
         ends_at = v_end,
         updated_at = now()
   where id = p_campaign_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_sponsor_campaign(
  text, text, text, timestamptz, timestamptz, boolean, boolean
) from public, anon;
grant execute on function public.update_sponsor_campaign(
  text, text, text, timestamptz, timestamptz, boolean, boolean
) to authenticated;

create or replace function public.set_sponsor_campaign_status(
  p_campaign_id text,
  p_status      public.sponsor_campaign_status
)
returns public.sponsor_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camp public.sponsor_campaigns%rowtype;
  v_row  public.sponsor_campaigns%rowtype;
  v_ok   boolean := false;
begin
  v_camp := public.assert_campaign_owner(p_campaign_id);

  if v_camp.status = p_status then
    return v_camp;
  end if;

  if v_camp.status = 'DRAFT' and p_status = 'ACTIVE' then
    v_ok := true;
  elsif v_camp.status = 'ACTIVE' and p_status in ('PAUSED', 'ENDED', 'CANCELLED') then
    v_ok := true;
  elsif v_camp.status = 'PAUSED' and p_status in ('ACTIVE', 'ENDED', 'CANCELLED') then
    v_ok := true;
  elsif v_camp.status = 'DRAFT' and p_status = 'CANCELLED' then
    v_ok := true;
  end if;

  if not v_ok then
    raise exception 'invalid campaign status transition from % to %', v_camp.status, p_status
      using errcode = 'P0003';
  end if;

  -- Activating requires advertiser to be ACTIVE (or activate draft advertiser implicitly? Prefer explicit).
  if p_status = 'ACTIVE' then
    if not exists (
      select 1 from public.advertisers a
       where a.id = v_camp.advertiser_id and a.status = 'ACTIVE'
    ) then
      raise exception 'activate the advertiser workspace before launching a campaign' using errcode = 'P0003';
    end if;
  end if;

  update public.sponsor_campaigns
     set status = p_status, updated_at = now()
   where id = p_campaign_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_sponsor_campaign_status(text, public.sponsor_campaign_status)
  from public, anon;
grant execute on function public.set_sponsor_campaign_status(text, public.sponsor_campaign_status)
  to authenticated;

-- Convenience wrappers
create or replace function public.pause_sponsor_campaign(p_campaign_id text)
returns public.sponsor_campaigns
language sql
security definer
set search_path = ''
as $$
  select public.set_sponsor_campaign_status(p_campaign_id, 'PAUSED');
$$;

create or replace function public.resume_sponsor_campaign(p_campaign_id text)
returns public.sponsor_campaigns
language sql
security definer
set search_path = ''
as $$
  select public.set_sponsor_campaign_status(p_campaign_id, 'ACTIVE');
$$;

revoke all on function public.pause_sponsor_campaign(text) from public, anon;
revoke all on function public.resume_sponsor_campaign(text) from public, anon;
grant execute on function public.pause_sponsor_campaign(text) to authenticated;
grant execute on function public.resume_sponsor_campaign(text) to authenticated;

-- ── 4. Creator assignment ───────────────────────────────────────────────────
create or replace function public.assign_creator_to_campaign(
  p_campaign_id        text,
  p_creator_profile_id text,
  p_commission_type    public.commission_type default 'NONE',
  p_commission_value   integer default 0
)
returns public.campaign_creators
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camp public.sponsor_campaigns%rowtype;
  v_row  public.campaign_creators%rowtype;
  v_val  integer := coalesce(p_commission_value, 0);
begin
  v_camp := public.assert_campaign_owner(p_campaign_id);
  if v_camp.status in ('ENDED', 'CANCELLED') then
    raise exception 'cannot assign creators on ended or cancelled campaigns' using errcode = 'P0003';
  end if;
  if not exists (select 1 from public.profiles where id = p_creator_profile_id) then
    raise exception 'creator profile not found' using errcode = 'P0002';
  end if;
  if p_commission_type = 'NONE' and v_val <> 0 then
    raise exception 'NONE commission must have value 0' using errcode = 'P0003';
  end if;
  if p_commission_type = 'PERCENTAGE' and (v_val < 0 or v_val > 10000) then
    raise exception 'percentage commission must be 0-10000 basis points' using errcode = 'P0003';
  end if;
  if p_commission_type = 'FIXED_PER_CONVERSION' and v_val < 0 then
    raise exception 'fixed commission must be non-negative' using errcode = 'P0003';
  end if;

  insert into public.campaign_creators (
    id, campaign_id, creator_profile_id, status, commission_type, commission_value
  ) values (
    'cc_' || encode(extensions.gen_random_bytes(8), 'hex'),
    p_campaign_id, p_creator_profile_id, 'ACTIVE', p_commission_type, v_val
  )
  on conflict (campaign_id, creator_profile_id) do update
    set status = 'ACTIVE',
        commission_type = excluded.commission_type,
        commission_value = excluded.commission_value
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.assign_creator_to_campaign(text, text, public.commission_type, integer)
  from public, anon;
grant execute on function public.assign_creator_to_campaign(text, text, public.commission_type, integer)
  to authenticated;

create or replace function public.update_creator_commission(
  p_campaign_id        text,
  p_creator_profile_id text,
  p_commission_type    public.commission_type,
  p_commission_value   integer
)
returns public.campaign_creators
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.campaign_creators%rowtype;
  v_val integer := coalesce(p_commission_value, 0);
begin
  perform public.assert_campaign_owner(p_campaign_id);
  if p_commission_type = 'NONE' and v_val <> 0 then
    raise exception 'NONE commission must have value 0' using errcode = 'P0003';
  end if;
  if p_commission_type = 'PERCENTAGE' and (v_val < 0 or v_val > 10000) then
    raise exception 'percentage commission must be 0-10000 basis points' using errcode = 'P0003';
  end if;
  if p_commission_type = 'FIXED_PER_CONVERSION' and v_val < 0 then
    raise exception 'fixed commission must be non-negative' using errcode = 'P0003';
  end if;

  update public.campaign_creators
     set commission_type = p_commission_type,
         commission_value = v_val
   where campaign_id = p_campaign_id
     and creator_profile_id = p_creator_profile_id
  returning * into v_row;

  if not found then
    raise exception 'creator assignment not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

revoke all on function public.update_creator_commission(text, text, public.commission_type, integer)
  from public, anon;
grant execute on function public.update_creator_commission(text, text, public.commission_type, integer)
  to authenticated;

create or replace function public.remove_creator_from_campaign(
  p_campaign_id        text,
  p_creator_profile_id text
)
returns public.campaign_creators
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.campaign_creators%rowtype;
begin
  perform public.assert_campaign_owner(p_campaign_id);
  update public.campaign_creators
     set status = 'REMOVED'
   where campaign_id = p_campaign_id
     and creator_profile_id = p_creator_profile_id
  returning * into v_row;
  if not found then
    raise exception 'creator assignment not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

revoke all on function public.remove_creator_from_campaign(text, text) from public, anon;
grant execute on function public.remove_creator_from_campaign(text, text) to authenticated;

-- ── 5. Referral links + coupons ─────────────────────────────────────────────
create or replace function public.create_campaign_referral_link(
  p_campaign_id        text,
  p_creator_profile_id text,
  p_expires_at         timestamptz default null
)
returns public.referral_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camp  public.sponsor_campaigns%rowtype;
  v_row   public.referral_links%rowtype;
  v_token text;
begin
  v_camp := public.assert_campaign_owner(p_campaign_id);
  if not exists (
    select 1 from public.campaign_creators
     where campaign_id = p_campaign_id
       and creator_profile_id = p_creator_profile_id
       and status = 'ACTIVE'
  ) then
    raise exception 'creator is not actively assigned to this campaign' using errcode = 'P0003';
  end if;

  v_token := public.sponsor_new_referral_token();

  insert into public.referral_links (
    id, campaign_id, creator_profile_id, token, status, expires_at
  ) values (
    'rl_' || encode(extensions.gen_random_bytes(8), 'hex'),
    p_campaign_id, p_creator_profile_id, v_token, 'ACTIVE', p_expires_at
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_campaign_referral_link(text, text, timestamptz)
  from public, anon;
grant execute on function public.create_campaign_referral_link(text, text, timestamptz)
  to authenticated;

create or replace function public.create_campaign_coupon(
  p_campaign_id        text,
  p_creator_profile_id text,
  p_code               text,
  p_starts_at          timestamptz default null,
  p_expires_at         timestamptz default null,
  p_max_redemptions    integer default null
)
returns public.coupon_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.coupon_codes%rowtype;
begin
  perform public.assert_campaign_owner(p_campaign_id);
  if not exists (
    select 1 from public.campaign_creators
     where campaign_id = p_campaign_id
       and creator_profile_id = p_creator_profile_id
       and status = 'ACTIVE'
  ) then
    raise exception 'creator is not actively assigned to this campaign' using errcode = 'P0003';
  end if;
  if p_max_redemptions is not null and p_max_redemptions <= 0 then
    raise exception 'max_redemptions must be positive when set' using errcode = 'P0003';
  end if;
  if p_expires_at is not null and p_starts_at is not null and p_expires_at <= p_starts_at then
    raise exception 'expires_at must be after starts_at' using errcode = 'P0003';
  end if;

  insert into public.coupon_codes (
    id, campaign_id, creator_profile_id, code, status, starts_at, expires_at, max_redemptions
  ) values (
    'cp_' || encode(extensions.gen_random_bytes(8), 'hex'),
    p_campaign_id, p_creator_profile_id, p_code, 'ACTIVE',
    p_starts_at, p_expires_at, p_max_redemptions
  )
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'an active coupon with that code already exists' using errcode = 'P0003';
end;
$$;

revoke all on function public.create_campaign_coupon(text, text, text, timestamptz, timestamptz, integer)
  from public, anon;
grant execute on function public.create_campaign_coupon(text, text, text, timestamptz, timestamptz, integer)
  to authenticated;

-- ── 6. Advertiser overview + campaign list + creator stats ──────────────────
create or replace function public.advertiser_studio_overview(p_advertiser_id text)
returns table (
  advertiser_id            text,
  active_campaigns         bigint,
  total_campaigns          bigint,
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
begin
  perform public.assert_advertiser_owner(p_advertiser_id);

  return query
  select
    p_advertiser_id,
    (select count(*)::bigint from public.sponsor_campaigns c
      where c.advertiser_id = p_advertiser_id and c.status = 'ACTIVE'),
    (select count(*)::bigint from public.sponsor_campaigns c
      where c.advertiser_id = p_advertiser_id),
    (select count(*)::bigint
       from public.referral_clicks rc
       join public.referral_links rl on rl.id = rc.referral_link_id
       join public.sponsor_campaigns c on c.id = rl.campaign_id
      where c.advertiser_id = p_advertiser_id),
    (select count(*)::bigint from public.conversion_events ce
      where ce.advertiser_id = p_advertiser_id),
    (select count(*)::bigint
       from public.conversion_attributions ca
       join public.sponsor_campaigns c on c.id = ca.campaign_id
      where c.advertiser_id = p_advertiser_id
        and ca.attribution_method <> 'UNATTRIBUTED'),
    (select coalesce(sum(ce.gross_amount_minor), 0)::bigint
       from public.conversion_events ce where ce.advertiser_id = p_advertiser_id),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.advertiser_id = p_advertiser_id
        and l.status in ('PENDING', 'APPROVED'));
end;
$$;

revoke all on function public.advertiser_studio_overview(text) from public, anon;
grant execute on function public.advertiser_studio_overview(text) to authenticated;

create or replace function public.list_my_sponsor_campaigns(p_advertiser_id text)
returns table (
  campaign_id              text,
  title                    text,
  status                   public.sponsor_campaign_status,
  campaign_type            public.sponsor_campaign_type,
  currency                 text,
  starts_at                timestamptz,
  ends_at                  timestamptz,
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
begin
  perform public.assert_advertiser_owner(p_advertiser_id);

  return query
  select
    c.id::text,
    c.title::text,
    c.status,
    c.campaign_type,
    c.currency::text,
    c.starts_at,
    c.ends_at,
    (select count(*)::bigint
       from public.referral_clicks rc
       join public.referral_links rl on rl.id = rc.referral_link_id
      where rl.campaign_id = c.id),
    (select count(*)::bigint from public.conversion_events ce where ce.campaign_id = c.id),
    (select count(*)::bigint
       from public.conversion_attributions ca
      where ca.campaign_id = c.id and ca.attribution_method <> 'UNATTRIBUTED'),
    (select coalesce(sum(ce.gross_amount_minor), 0)::bigint
       from public.conversion_events ce where ce.campaign_id = c.id),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.campaign_id = c.id and l.status in ('PENDING', 'APPROVED'))
  from public.sponsor_campaigns c
  where c.advertiser_id = p_advertiser_id
  order by c.created_at desc;
end;
$$;

revoke all on function public.list_my_sponsor_campaigns(text) from public, anon;
grant execute on function public.list_my_sponsor_campaigns(text) to authenticated;

create or replace function public.advertiser_campaign_creator_stats(p_campaign_id text)
returns table (
  creator_profile_id       text,
  creator_handle           text,
  creator_name             text,
  clicks                   bigint,
  attributed_conversions   bigint,
  commission_accrued_minor bigint,
  commission_type          public.commission_type,
  commission_value         integer,
  assignment_status        public.campaign_creator_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_camp public.sponsor_campaigns%rowtype;
begin
  v_camp := public.assert_campaign_owner(p_campaign_id);

  return query
  select
    cc.creator_profile_id::text,
    p.handle::text,
    p.name::text,
    (select count(*)::bigint
       from public.referral_clicks rc
       join public.referral_links rl on rl.id = rc.referral_link_id
      where rl.campaign_id = v_camp.id
        and rl.creator_profile_id = cc.creator_profile_id),
    (select count(*)::bigint
       from public.conversion_attributions ca
      where ca.campaign_id = v_camp.id
        and ca.creator_profile_id = cc.creator_profile_id
        and ca.attribution_method <> 'UNATTRIBUTED'),
    (select coalesce(sum(l.amount_minor), 0)::bigint
       from public.creator_commission_ledger l
      where l.campaign_id = v_camp.id
        and l.creator_profile_id = cc.creator_profile_id
        and l.status in ('PENDING', 'APPROVED')),
    cc.commission_type,
    cc.commission_value,
    cc.status
  from public.campaign_creators cc
  join public.profiles p on p.id = cc.creator_profile_id
  where cc.campaign_id = v_camp.id
    and cc.status <> 'REMOVED'
  order by 5 desc, p.handle;
end;
$$;

revoke all on function public.advertiser_campaign_creator_stats(text) from public, anon;
grant execute on function public.advertiser_campaign_creator_stats(text) to authenticated;

-- List referral links / coupons for a campaign (owner)
create or replace function public.list_campaign_referral_links(p_campaign_id text)
returns setof public.referral_links
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_campaign_owner(p_campaign_id);
  return query
    select * from public.referral_links
     where campaign_id = p_campaign_id
     order by created_at desc;
end;
$$;

create or replace function public.list_campaign_coupons(p_campaign_id text)
returns setof public.coupon_codes
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_campaign_owner(p_campaign_id);
  return query
    select * from public.coupon_codes
     where campaign_id = p_campaign_id
     order by created_at desc;
end;
$$;

revoke all on function public.list_campaign_referral_links(text) from public, anon;
revoke all on function public.list_campaign_coupons(text) from public, anon;
grant execute on function public.list_campaign_referral_links(text) to authenticated;
grant execute on function public.list_campaign_coupons(text) to authenticated;

-- ── 8. Break RLS recursion between campaigns ↔ creators / links / coupons ───
-- Direct SELECTs as authenticated previously looped:
--   sponsor_campaigns policy → campaign_creators → sponsor_campaigns …
-- Use security-definer helpers so policy checks never re-enter RLS.

create or replace function public.is_assigned_campaign_creator(p_campaign_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_creators cc
     where cc.campaign_id = p_campaign_id
       and cc.creator_profile_id = public.my_profile_id()
       and cc.status <> 'REMOVED'
  );
$$;

create or replace function public.owns_campaign_via_advertiser(p_campaign_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.sponsor_campaigns c
      join public.advertisers a on a.id = c.advertiser_id
     where c.id = p_campaign_id
       and a.created_by_profile_id = public.my_profile_id()
  );
$$;

revoke all on function public.is_assigned_campaign_creator(text) from public, anon;
revoke all on function public.owns_campaign_via_advertiser(text) from public, anon;
grant execute on function public.is_assigned_campaign_creator(text)
  to authenticated, service_role;
grant execute on function public.owns_campaign_via_advertiser(text)
  to authenticated, service_role;

drop policy if exists "advertiser owner or assigned creator can read campaign" on public.sponsor_campaigns;
create policy "advertiser owner or assigned creator can read campaign"
  on public.sponsor_campaigns for select to authenticated
  using (
    public.is_advertiser_owner(advertiser_id)
    or public.is_staff()
    or public.is_assigned_campaign_creator(id)
  );

drop policy if exists "campaign creator assignment visible to parties" on public.campaign_creators;
create policy "campaign creator assignment visible to parties"
  on public.campaign_creators for select to authenticated
  using (
    public.owns_profile(creator_profile_id)
    or public.is_staff()
    or public.owns_campaign_via_advertiser(campaign_id)
  );

drop policy if exists "referral links visible to parties" on public.referral_links;
create policy "referral links visible to parties"
  on public.referral_links for select to authenticated
  using (
    public.owns_profile(creator_profile_id)
    or public.is_staff()
    or public.owns_campaign_via_advertiser(campaign_id)
  );

drop policy if exists "coupon codes visible to parties" on public.coupon_codes;
create policy "coupon codes visible to parties"
  on public.coupon_codes for select to authenticated
  using (
    public.owns_profile(creator_profile_id)
    or public.is_staff()
    or public.owns_campaign_via_advertiser(campaign_id)
  );

-- SECURITY DEFINER write RPCs must bypass RLS while still enforcing ownership
-- in function bodies (assert_*). Keep this explicit for portability.
alter function public.create_advertiser(text, text) set row_security = off;
alter function public.activate_advertiser(text) set row_security = off;
alter function public.create_sponsor_campaign(text, text, text, public.sponsor_campaign_type, text, timestamptz, timestamptz)
  set row_security = off;
alter function public.update_sponsor_campaign(text, text, text, timestamptz, timestamptz, boolean, boolean)
  set row_security = off;
alter function public.set_sponsor_campaign_status(text, public.sponsor_campaign_status)
  set row_security = off;
alter function public.pause_sponsor_campaign(text) set row_security = off;
alter function public.resume_sponsor_campaign(text) set row_security = off;
alter function public.assign_creator_to_campaign(text, text, public.commission_type, integer)
  set row_security = off;
alter function public.update_creator_commission(text, text, public.commission_type, integer)
  set row_security = off;
alter function public.remove_creator_from_campaign(text, text) set row_security = off;
alter function public.create_campaign_referral_link(text, text, timestamptz) set row_security = off;
alter function public.create_campaign_coupon(text, text, text, timestamptz, timestamptz, integer)
  set row_security = off;
alter function public.assert_advertiser_owner(text) set row_security = off;
alter function public.assert_campaign_owner(text) set row_security = off;
alter function public.advertiser_studio_overview(text) set row_security = off;
alter function public.list_my_sponsor_campaigns(text) set row_security = off;
alter function public.advertiser_campaign_creator_stats(text) set row_security = off;
alter function public.list_campaign_referral_links(text) set row_security = off;
alter function public.list_campaign_coupons(text) set row_security = off;

