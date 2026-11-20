-- ============================================================================
-- Sponsor attribution hardening tests (Phase 10 Step 1.5).
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000911'),
  ('00000000-0000-0000-0000-000000000912'),
  ('00000000-0000-0000-0000-000000000913');

update public.profiles set id = 'h-owner', handle = 'h_owner', name = 'Hard Owner', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000911';
update public.profiles set id = 'h-creator', handle = 'h_creator', name = 'Hard Creator', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000912';
update public.profiles set id = 'h-stranger', handle = 'h_stranger', name = 'Hard Stranger', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000913';

-- Campaign currency column present
select has_column('public', 'sponsor_campaigns', 'currency', 'campaign currency column exists');

-- Token generation: crypto, format, entropy, uniqueness
select is(
  has_function_privilege('authenticated', 'public.sponsor_new_referral_token()', 'EXECUTE'),
  false,
  'authenticated cannot generate referral tokens'
);
select is(
  has_function_privilege('service_role', 'public.sponsor_new_referral_token()', 'EXECUTE'),
  true,
  'service_role may generate referral tokens'
);

create temporary table tmp_tokens (token text primary key);

do $$
declare
  i int;
  t text;
begin
  for i in 1..32 loop
    t := public.sponsor_new_referral_token();
    if t is null or t = '' then
      raise exception 'empty token';
    end if;
    if t !~ '^[0-9a-f]{48}$' then
      raise exception 'bad token format: %', t;
    end if;
    insert into tmp_tokens(token) values (t);
  end loop;
end $$;

select is((select count(*)::int from tmp_tokens), 32, '32 generated tokens are unique');
select ok(
  (select bool_and(char_length(token) = 48 and token ~ '^[0-9a-f]+$') from tmp_tokens),
  'tokens are 48-char lowercase hex (192-bit entropy)'
);

-- Fixtures
insert into public.advertisers (id, name, slug, status, created_by_profile_id)
values ('h-adv', 'Hard Adv', 'hard-adv', 'ACTIVE', 'h-owner');

insert into public.sponsor_campaigns (
  id, advertiser_id, title, description, status, campaign_type, currency, starts_at, ends_at
) values (
  'h-camp', 'h-adv', 'Hard Camp', '', 'ACTIVE', 'COUPON', 'INR',
  now() - interval '1 day', now() + interval '30 days'
);

insert into public.campaign_creators (
  id, campaign_id, creator_profile_id, status, commission_type, commission_value
) values
  ('h-cc', 'h-camp', 'h-creator', 'ACTIVE', 'FIXED_PER_CONVERSION', 500);

insert into public.referral_links (id, campaign_id, creator_profile_id, token, status)
values ('h-rl', 'h-camp', 'h-creator', public.sponsor_new_referral_token(), 'ACTIVE');

-- Coupon canonicalization on write
insert into public.coupon_codes (id, campaign_id, creator_profile_id, code, status, max_redemptions)
values ('h-cp', 'h-camp', 'h-creator', '  save 10 ', 'ACTIVE', 1);

select is(
  (select code from public.coupon_codes where id = 'h-cp'),
  'SAVE10',
  'coupon code is canonicalized on insert'
);

select throws_ok(
  $$ insert into public.coupon_codes (id, campaign_id, creator_profile_id, code, status)
     values ('h-cp2', 'h-camp', 'h-creator', 'save10', 'ACTIVE') $$,
  '23505', null, 'save10 collides with active SAVE10'
);

select throws_ok(
  $$ insert into public.coupon_codes (id, campaign_id, creator_profile_id, code, status)
     values ('h-cp3', 'h-camp', 'h-creator', 'SAVE 10', 'ACTIVE') $$,
  '23505', null, 'SAVE 10 collides with active SAVE10'
);

-- Currency mismatch rejected
select throws_ok(
  $$ select public.record_sponsor_conversion(
       'h-camp', 'h-ext-usd', 'PURCHASE', 1000, 'USD', null, 'SAVE10') $$,
  'P0003', null, 'USD conversion rejected on INR campaign'
);

-- Fixed commission success + currency retained
select lives_ok(
  $$ select public.record_sponsor_conversion(
       'h-camp', 'h-ext-1', 'PURCHASE', 19900, 'INR', null, 'SAVE10',
       'IN-GA', 'Goa', 'panjim-zone', null, now()) $$,
  'INR conversion with coupon succeeds'
);

select is(
  (select attribution_method::text from public.conversion_attributions ca
    join public.conversion_events ce on ce.id = ca.conversion_id
   where ce.external_conversion_id = 'h-ext-1'),
  'COUPON',
  'first max_redemptions=1 conversion is COUPON'
);

select is(
  (select l.currency from public.creator_commission_ledger l
    join public.conversion_events ce on ce.id = l.conversion_id
   where ce.external_conversion_id = 'h-ext-1'),
  'INR',
  'fixed commission ledger currency is INR'
);

select is(
  (select amount_minor from public.creator_commission_ledger l
    join public.conversion_events ce on ce.id = l.conversion_id
   where ce.external_conversion_id = 'h-ext-1'),
  500,
  'fixed commission amount is 500'
);

select is(
  (select redemption_count from public.coupon_codes where id = 'h-cp'),
  1,
  'coupon redemption_count is 1 after first use'
);

-- Second conversion cannot consume the exhausted coupon; falls through to referral
select lives_ok(
  $$ select public.record_sponsor_conversion(
       'h-camp', 'h-ext-2', 'PURCHASE', 1000, 'INR',
       (select token from public.referral_links where id = 'h-rl'), 'SAVE10') $$,
  'second conversion accepted after coupon exhausted'
);

select is(
  (select attribution_method::text from public.conversion_attributions ca
    join public.conversion_events ce on ce.id = ca.conversion_id
   where ce.external_conversion_id = 'h-ext-2'),
  'REFERRAL',
  'exhausted coupon falls through to referral'
);

select is(
  (select redemption_count from public.coupon_codes where id = 'h-cp'),
  1,
  'coupon redemption_count does not exceed max_redemptions'
);

-- Idempotency: duplicate external id does not double coupon or commission
select is(
  (select redemption_count from public.coupon_codes where id = 'h-cp'),
  1,
  'precondition: coupon still at 1 before duplicate ingest'
);

select is(
  (select id from public.record_sponsor_conversion(
     'h-camp', 'h-ext-1', 'PURCHASE', 19900, 'INR', null, 'SAVE10')),
  (select id from public.conversion_events where external_conversion_id = 'h-ext-1'),
  'duplicate ingest returns same conversion id'
);

select is(
  (select count(*)::int from public.conversion_events where external_conversion_id = 'h-ext-1'),
  1,
  'duplicate ingest does not create a second conversion'
);

select is(
  (select count(*)::int from public.creator_commission_ledger l
    join public.conversion_events ce on ce.id = l.conversion_id
   where ce.external_conversion_id = 'h-ext-1'),
  1,
  'duplicate ingest does not duplicate commission'
);

select is(
  (select redemption_count from public.coupon_codes where id = 'h-cp'),
  1,
  'duplicate ingest does not double-increment coupon'
);

-- Percentage commission currency on a second campaign
insert into public.sponsor_campaigns (
  id, advertiser_id, title, status, campaign_type, currency, starts_at, ends_at
) values (
  'h-camp-pct', 'h-adv', 'Pct Camp', 'ACTIVE', 'REFERRAL', 'INR',
  now() - interval '1 day', now() + interval '30 days'
);
insert into public.campaign_creators (
  id, campaign_id, creator_profile_id, status, commission_type, commission_value
) values ('h-cc-pct', 'h-camp-pct', 'h-creator', 'ACTIVE', 'PERCENTAGE', 1000);
insert into public.referral_links (id, campaign_id, creator_profile_id, token, status)
values ('h-rl-pct', 'h-camp-pct', 'h-creator', public.sponsor_new_referral_token(), 'ACTIVE');

select lives_ok(
  $$ select public.record_sponsor_conversion(
       'h-camp-pct', 'h-ext-pct', 'PURCHASE', 10000, 'INR',
       (select token from public.referral_links where id = 'h-rl-pct'), null) $$,
  'percentage commission conversion succeeds'
);
select is(
  (select l.currency from public.creator_commission_ledger l
    join public.conversion_events ce on ce.id = l.conversion_id
   where ce.external_conversion_id = 'h-ext-pct'),
  'INR',
  'percentage commission ledger currency is INR'
);
select is(
  (select amount_minor from public.creator_commission_ledger l
    join public.conversion_events ce on ce.id = l.conversion_id
   where ce.external_conversion_id = 'h-ext-pct'),
  1000,
  'percentage commission is floor(10000 * 1000 / 10000) = 1000'
);

-- Paused advertiser rejects conversion + click; reporting still readable for owner
update public.advertisers set status = 'PAUSED' where id = 'h-adv';

select throws_ok(
  $$ select public.record_sponsor_conversion('h-camp', 'h-ext-paused', 'PURCHASE', 100, 'INR') $$,
  'P0003', null, 'paused advertiser rejects conversion'
);

select throws_ok(
  $$ select public.record_referral_click((select token from public.referral_links where id = 'h-rl')) $$,
  'P0003', null, 'paused advertiser rejects referral click'
);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000911","role":"authenticated"}', true);
select lives_ok(
  $$ select public.advertiser_campaign_summary('h-camp') $$,
  'paused advertiser owner can still read campaign summary'
);

-- Authenticated still cannot ingest
select is(
  has_function_privilege('authenticated',
    'public.record_sponsor_conversion(text,text,public.sponsor_conversion_type,integer,text,text,text,text,text,text,text,timestamptz)',
    'EXECUTE'),
  false,
  'authenticated still cannot ingest conversions'
);

-- Restore ACTIVE and prove success path still works
reset role;
update public.advertisers set status = 'ACTIVE' where id = 'h-adv';
select lives_ok(
  $$ select public.record_sponsor_conversion(
       'h-camp', 'h-ext-active', 'LEAD', 0, 'INR',
       (select token from public.referral_links where id = 'h-rl'), null) $$,
  'ACTIVE advertiser + ACTIVE campaign accepts conversion'
);
select lives_ok(
  $$ select public.record_referral_click((select token from public.referral_links where id = 'h-rl')) $$,
  'ACTIVE advertiser accepts referral click'
);

-- DRAFT / SUSPENDED also rejected
update public.advertisers set status = 'DRAFT' where id = 'h-adv';
select throws_ok(
  $$ select public.record_sponsor_conversion('h-camp', 'h-ext-draft', 'PURCHASE', 100, 'INR') $$,
  'P0003', null, 'DRAFT advertiser rejects conversion'
);
update public.advertisers set status = 'SUSPENDED' where id = 'h-adv';
select throws_ok(
  $$ select public.record_sponsor_conversion('h-camp', 'h-ext-susp', 'PURCHASE', 100, 'INR') $$,
  'P0003', null, 'SUSPENDED advertiser rejects conversion'
);

reset role;
select * from finish();
rollback;
