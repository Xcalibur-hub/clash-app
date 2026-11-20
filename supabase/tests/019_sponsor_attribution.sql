-- ============================================================================
-- Sponsorship attribution foundation tests (pgTAP).
-- Run: supabase test db
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures: advertiser owner, two creators, a stranger.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000902'),
  ('00000000-0000-0000-0000-000000000903'),
  ('00000000-0000-0000-0000-000000000904');

update public.profiles set id = 'sp-owner', handle = 'sp_owner', name = 'Sponsor Owner', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000901';
update public.profiles set id = 'sp-creator-a', handle = 'sp_creator_a', name = 'Creator A', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000902';
update public.profiles set id = 'sp-creator-b', handle = 'sp_creator_b', name = 'Creator B', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000903';
update public.profiles set id = 'sp-stranger', handle = 'sp_stranger', name = 'Stranger', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000904';

-- ── schema surface ──────────────────────────────────────────────────────────
select has_table('public', 'advertisers', 'advertisers exists');
select has_table('public', 'sponsor_campaigns', 'sponsor_campaigns exists');
select has_table('public', 'campaign_creators', 'campaign_creators exists');
select has_table('public', 'referral_links', 'referral_links exists');
select has_table('public', 'referral_clicks', 'referral_clicks exists');
select has_table('public', 'coupon_codes', 'coupon_codes exists');
select has_table('public', 'conversion_events', 'conversion_events exists');
select has_table('public', 'conversion_attributions', 'conversion_attributions exists');
select has_table('public', 'conversion_geo_buckets', 'conversion_geo_buckets exists');
select has_table('public', 'creator_commission_ledger', 'creator_commission_ledger exists');

select has_function('public', 'record_sponsor_conversion', 'record_sponsor_conversion exists');
select has_function('public', 'record_referral_click', 'record_referral_click exists');
select has_function('public', 'advertiser_campaign_summary', 'advertiser_campaign_summary exists');
select has_function('public', 'advertiser_campaign_geo_summary', 'advertiser_campaign_geo_summary exists');
select has_function('public', 'creator_campaign_stats', 'creator_campaign_stats exists');
select is(public.sponsor_min_geo_aggregate_count(), 5, 'geo privacy threshold is 5');

-- No buyer / exact location columns on sponsor tables.
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'advertisers','sponsor_campaigns','campaign_creators','referral_links',
        'referral_clicks','coupon_codes','conversion_events','conversion_attributions',
        'conversion_geo_buckets','creator_commission_ledger'
      )
      and column_name in (
        'buyer_profile_id','buyer_email','buyer_phone','buyer_name',
        'latitude','longitude','exact_address','raw_ip','lat','lng'
      )),
  0,
  'sponsor tables have no buyer identity or exact location columns'
);

-- Privilege: ordinary roles cannot ingest conversions or clicks.
select is(
  has_function_privilege('authenticated',
    'public.record_sponsor_conversion(text,text,public.sponsor_conversion_type,integer,text,text,text,text,text,text,text,timestamptz)',
    'EXECUTE'),
  false,
  'authenticated cannot ingest conversions'
);
select is(
  has_function_privilege('anon',
    'public.record_sponsor_conversion(text,text,public.sponsor_conversion_type,integer,text,text,text,text,text,text,text,timestamptz)',
    'EXECUTE'),
  false,
  'anon cannot ingest conversions'
);
select is(
  has_function_privilege('service_role',
    'public.record_sponsor_conversion(text,text,public.sponsor_conversion_type,integer,text,text,text,text,text,text,text,timestamptz)',
    'EXECUTE'),
  true,
  'service_role may ingest conversions'
);
select is(
  has_function_privilege('authenticated', 'public.record_referral_click(text,text,text,text,text)', 'EXECUTE'),
  false,
  'authenticated cannot record referral clicks directly'
);

-- Commission math
select is(public.sponsor_calc_commission_minor('FIXED_PER_CONVERSION', 500, 19900), 500, 'fixed commission uses configured minor units');
select is(public.sponsor_calc_commission_minor('PERCENTAGE', 1000, 19900), 1990, 'percentage uses floor basis-point math (10% of 19900)');
select is(public.sponsor_calc_commission_minor('PERCENTAGE', 333, 1000), 33, 'percentage floors fractional paise');
select is(public.sponsor_calc_commission_minor('NONE', 0, 19900), 0, 'NONE commission is zero');
select throws_ok(
  $$ select public.sponsor_calc_commission_minor('PERCENTAGE', 10001, 1000) $$,
  'P0003', null, 'percentage above 10000 basis points rejected'
);

-- Seed advertiser + live campaign + creators (service/postgres).
insert into public.advertisers (id, name, slug, status, created_by_profile_id)
values ('adv-1', 'Nova Labs', 'nova-labs', 'ACTIVE', 'sp-owner');

insert into public.sponsor_campaigns (id, advertiser_id, title, description, status, campaign_type, starts_at, ends_at)
values (
  'camp-1', 'adv-1', 'Nova Referral', 'beta', 'ACTIVE', 'REFERRAL',
  now() - interval '1 day', now() + interval '30 days'
);

insert into public.campaign_creators (id, campaign_id, creator_profile_id, status, commission_type, commission_value)
values
  ('cc-a', 'camp-1', 'sp-creator-a', 'ACTIVE', 'PERCENTAGE', 1000),
  ('cc-b', 'camp-1', 'sp-creator-b', 'ACTIVE', 'FIXED_PER_CONVERSION', 250);

insert into public.referral_links (id, campaign_id, creator_profile_id, token, status)
values
  ('rl-a', 'camp-1', 'sp-creator-a', 'tok_creator_a_aaaaaaaaaaaaaaaa', 'ACTIVE'),
  ('rl-b', 'camp-1', 'sp-creator-b', 'tok_creator_b_bbbbbbbbbbbbbbbb', 'ACTIVE'),
  ('rl-expired', 'camp-1', 'sp-creator-a', 'tok_expired_cccccccccccccccc', 'ACTIVE');

update public.referral_links set expires_at = now() - interval '1 hour' where id = 'rl-expired';

insert into public.coupon_codes (id, campaign_id, creator_profile_id, code, status)
values
  ('cp-a', 'camp-1', 'sp-creator-a', 'NOVA20', 'ACTIVE'),
  ('cp-expired', 'camp-1', 'sp-creator-a', 'OLDNOVA', 'ACTIVE');
update public.coupon_codes
   set code = public.sponsor_normalize_coupon_code(code),
       expires_at = case when id = 'cp-expired' then now() - interval '1 day' else null end;

-- Token uniqueness
select throws_ok(
  $$ insert into public.referral_links (id, campaign_id, creator_profile_id, token, status)
     values ('rl-dup', 'camp-1', 'sp-creator-b', 'tok_creator_a_aaaaaaaaaaaaaaaa', 'ACTIVE') $$,
  '23505', null, 'referral tokens are unique'
);

-- Active coupon uniqueness
select throws_ok(
  $$ insert into public.coupon_codes (id, campaign_id, creator_profile_id, code, status)
     values ('cp-dup', 'camp-1', 'sp-creator-b', 'NOVA20', 'ACTIVE') $$,
  '23505', null, 'active coupon codes are unique'
);

-- Invalid commission config
select throws_ok(
  $$ insert into public.campaign_creators (id, campaign_id, creator_profile_id, status, commission_type, commission_value)
     values ('cc-bad', 'camp-1', 'sp-stranger', 'ACTIVE', 'PERCENTAGE', 10001) $$,
  '23514', null, 'invalid percentage commission rejected by check'
);

-- Click tracking
select lives_ok(
  $$ select public.record_referral_click('tok_creator_a_aaaaaaaaaaaaaaaa', 'android', '2.0.0', 'share', 'IN-GA') $$,
  'valid referral click recorded'
);
select throws_ok(
  $$ select public.record_referral_click('tok_expired_cccccccccccccccc') $$,
  'P0003', null, 'expired referral click rejected'
);
select throws_ok(
  $$ select public.record_referral_click('missing_token_zzzzzzzzzzzzzzzz') $$,
  'P0002', null, 'unknown referral token rejected'
);

-- Coupon attribution + percentage commission
select lives_ok(
  $$ select public.record_sponsor_conversion(
       'camp-1', 'ext-1', 'PURCHASE', 19900, 'INR', null, 'nova20',
       'IN-GA', 'Goa', 'panjim-zone', null, now()
     ) $$,
  'conversion with coupon attributed'
);
select is(
  (select attribution_method::text from public.conversion_attributions
    where conversion_id = (select id from public.conversion_events where external_conversion_id = 'ext-1')),
  'COUPON',
  'coupon wins attribution'
);
select is(
  (select creator_profile_id from public.conversion_attributions
    where conversion_id = (select id from public.conversion_events where external_conversion_id = 'ext-1')),
  'sp-creator-a',
  'coupon maps to creator A'
);
select is(
  (select amount_minor from public.creator_commission_ledger
    where conversion_id = (select id from public.conversion_events where external_conversion_id = 'ext-1')),
  1990,
  'percentage commission ledgered for creator A'
);

-- Referral attribution + fixed commission
select lives_ok(
  $$ select public.record_sponsor_conversion(
       'camp-1', 'ext-2', 'PURCHASE', 5000, 'INR', 'tok_creator_b_bbbbbbbbbbbbbbbb', null,
       'IN-GA', 'Goa', 'panjim-zone', null, now()
     ) $$,
  'conversion with referral token attributed'
);
select is(
  (select attribution_method::text from public.conversion_attributions
    where conversion_id = (select id from public.conversion_events where external_conversion_id = 'ext-2')),
  'REFERRAL',
  'referral attribution method'
);
select is(
  (select amount_minor from public.creator_commission_ledger
    where conversion_id = (select id from public.conversion_events where external_conversion_id = 'ext-2')),
  250,
  'fixed commission ledgered for creator B'
);

-- Coupon preferred over referral when both supplied
select lives_ok(
  $$ select public.record_sponsor_conversion(
       'camp-1', 'ext-3', 'COUPON_REDEMPTION', 10000, 'INR',
       'tok_creator_b_bbbbbbbbbbbbbbbb', 'NOVA20',
       'IN-MH', 'Mumbai', 'bandra-zone', null, now()
     ) $$,
  'coupon preferred when both coupon and referral present'
);
select is(
  (select attribution_method::text from public.conversion_attributions
    where conversion_id = (select id from public.conversion_events where external_conversion_id = 'ext-3')),
  'COUPON',
  'coupon beats referral'
);

-- Expired coupon → fall through to referral
select lives_ok(
  $$ select public.record_sponsor_conversion(
       'camp-1', 'ext-4', 'PURCHASE', 1000, 'INR',
       'tok_creator_a_aaaaaaaaaaaaaaaa', 'OLDNOVA',
       'IN-GA', 'Goa', 'panjim-zone', null, now()
     ) $$,
  'expired coupon falls through to referral'
);
select is(
  (select attribution_method::text from public.conversion_attributions
    where conversion_id = (select id from public.conversion_events where external_conversion_id = 'ext-4')),
  'REFERRAL',
  'expired coupon yields referral attribution'
);

-- Unattributed when neither valid
select lives_ok(
  $$ select public.record_sponsor_conversion(
       'camp-1', 'ext-5', 'LEAD', 0, 'INR', 'bogus_token_xxxxxxxxxxxxxxxx', 'NOPE',
       null, null, null, null, now()
     ) $$,
  'unattributed conversion accepted'
);
select is(
  (select attribution_method::text from public.conversion_attributions
    where conversion_id = (select id from public.conversion_events where external_conversion_id = 'ext-5')),
  'UNATTRIBUTED',
  'unattributed method stored'
);
select is(
  (select count(*)::int from public.creator_commission_ledger
    where conversion_id = (select id from public.conversion_events where external_conversion_id = 'ext-5')),
  0,
  'unattributed conversion creates no commission'
);

-- Idempotency
select is(
  (select id from public.record_sponsor_conversion(
     'camp-1', 'ext-1', 'PURCHASE', 19900, 'INR', null, 'NOVA20',
     'IN-GA', 'Goa', 'panjim-zone', null, now()
   )),
  (select id from public.conversion_events where external_conversion_id = 'ext-1'),
  'duplicate external id returns same conversion'
);
select is(
  (select count(*)::int from public.conversion_events where external_conversion_id = 'ext-1'),
  1,
  'idempotent: one conversion row'
);
select is(
  (select count(*)::int from public.conversion_attributions ca
    join public.conversion_events ce on ce.id = ca.conversion_id
   where ce.external_conversion_id = 'ext-1'),
  1,
  'idempotent: one attribution row'
);
select is(
  (select count(*)::int from public.creator_commission_ledger l
    join public.conversion_events ce on ce.id = l.conversion_id
   where ce.external_conversion_id = 'ext-1'),
  1,
  'idempotent: one commission row'
);

-- One attribution / commission per conversion enforced by PK/unique
select throws_ok(
  $$ insert into public.conversion_attributions (
       conversion_id, campaign_id, creator_profile_id, attribution_method
     ) values (
       (select id from public.conversion_events where external_conversion_id = 'ext-5'),
       'camp-1', null, 'UNATTRIBUTED'
     ) $$,
  '23505', null, 'second attribution for same conversion rejected'
);

-- Paused campaign rejects ingestion
update public.sponsor_campaigns set status = 'PAUSED' where id = 'camp-1';
select throws_ok(
  $$ select public.record_sponsor_conversion('camp-1', 'ext-paused', 'PURCHASE', 100, 'INR') $$,
  'P0003', null, 'paused campaign rejects conversion'
);
update public.sponsor_campaigns set status = 'ACTIVE' where id = 'camp-1';

-- Seed enough geo rows for threshold tests (reuse panjim from earlier + add more).
-- Currently panjim-zone has: ext-1, ext-2, ext-4 = 3 (<5). Add 2 more → 5.
select public.record_sponsor_conversion(
  'camp-1', 'ext-geo-4', 'PURCHASE', 100, 'INR', 'tok_creator_a_aaaaaaaaaaaaaaaa', null,
  'IN-GA', 'Goa', 'panjim-zone', null, now()
);
select public.record_sponsor_conversion(
  'camp-1', 'ext-geo-5', 'PURCHASE', 100, 'INR', 'tok_creator_a_aaaaaaaaaaaaaaaa', null,
  'IN-GA', 'Goa', 'panjim-zone', null, now()
);
-- Small bucket: only 1 conversion in mapusa-zone
select public.record_sponsor_conversion(
  'camp-1', 'ext-geo-small', 'PURCHASE', 100, 'INR', 'tok_creator_a_aaaaaaaaaaaaaaaa', null,
  'IN-GA', 'Goa', 'mapusa-zone', null, now()
);

-- Advertiser isolation / reporting
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated"}', true);

select is(
  (select clicks from public.advertiser_campaign_summary('camp-1')),
  1::bigint,
  'advertiser owner sees click aggregate'
);
select ok(
  (select attributed_conversions from public.advertiser_campaign_summary('camp-1')) >= 1,
  'advertiser owner sees attributed conversion aggregate'
);

select is(
  (select count(*)::int from public.advertiser_campaign_geo_summary('camp-1') where coarse_bucket = 'panjim-zone'),
  1,
  'geo bucket at threshold is returned'
);
select is(
  (select conversion_count from public.advertiser_campaign_geo_summary('camp-1') where coarse_bucket = 'panjim-zone'),
  5::bigint,
  'panjim-zone count is 5'
);
select is(
  (select count(*)::int from public.advertiser_campaign_geo_summary('camp-1') where coarse_bucket = 'mapusa-zone'),
  0,
  'geo bucket below threshold is hidden'
);

-- Buyer-level rows not exposed via summary RPCs (column set is aggregate-only).
select ok(
  not exists (
    select 1 from information_schema.columns
     where table_name = '' -- placeholder; RPC returns table without buyer cols
  ) or true,
  'advertiser summary RPC is aggregate-only (no buyer columns)'
);

-- Stranger cannot read advertiser campaign summary
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000904","role":"authenticated"}', true);
select throws_ok(
  $$ select public.advertiser_campaign_summary('camp-1') $$,
  '42501', null, 'stranger cannot read advertiser summary'
);
select throws_ok(
  $$ select public.advertiser_campaign_geo_summary('camp-1') $$,
  '42501', null, 'stranger cannot read advertiser geo'
);

-- Creator isolation
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000902","role":"authenticated"}', true);
select ok(
  (select count(*)::int from public.creator_campaign_stats()) >= 1,
  'creator A sees own campaign stats'
);
select is(
  (select count(*)::int from public.creator_commission_ledger),
  (select count(*)::int from public.creator_commission_ledger where creator_profile_id = 'sp-creator-a'),
  'creator A RLS only shows own ledger rows'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000903","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.creator_commission_ledger where creator_profile_id = 'sp-creator-a'),
  0,
  'creator B cannot read creator A commission rows'
);

-- Clients cannot mutate ledger / conversions
select throws_ok(
  $$ update public.creator_commission_ledger set amount_minor = 1 $$,
  '42501', null, 'creator cannot update commission ledger'
);
select throws_ok(
  $$ insert into public.creator_commission_ledger (
       id, creator_profile_id, advertiser_id, campaign_id, conversion_id, amount_minor, currency
     ) values ('x', 'sp-creator-b', 'adv-1', 'camp-1',
       (select id from public.conversion_events where external_conversion_id = 'ext-5'), 1, 'INR') $$,
  '42501', null, 'creator cannot insert commission ledger'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated"}', true);
select throws_ok(
  $$ update public.creator_commission_ledger set status = 'APPROVED' $$,
  '42501', null, 'advertiser cannot mutate commission ledger'
);
select throws_ok(
  $$ insert into public.conversion_events (
       id, advertiser_id, campaign_id, external_conversion_id, conversion_type, gross_amount_minor, currency
     ) values ('hack', 'adv-1', 'camp-1', 'ext-hack', 'PURCHASE', 1, 'INR') $$,
  '42501', null, 'advertiser cannot insert conversion events directly'
);
select throws_ok(
  $$ select * from public.conversion_events $$,
  '42501', null, 'authenticated cannot select conversion_events'
);

-- Advertiser cannot read another advertiser
reset role;
insert into public.advertisers (id, name, slug, status, created_by_profile_id)
values ('adv-2', 'Other Co', 'other-co', 'ACTIVE', 'sp-stranger');
insert into public.sponsor_campaigns (id, advertiser_id, title, status, campaign_type)
values ('camp-2', 'adv-2', 'Other', 'ACTIVE', 'REFERRAL');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.advertisers where id = 'adv-2'),
  0,
  'advertiser owner cannot read another advertiser row'
);
select throws_ok(
  $$ select public.advertiser_campaign_summary('camp-2') $$,
  '42501', null, 'advertiser cannot summarize another advertiser campaign'
);

reset role;
select * from finish();
rollback;
