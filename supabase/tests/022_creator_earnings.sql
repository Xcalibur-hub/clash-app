-- ============================================================================
-- Creator earnings reporting (Phase 10 Step 3)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000931'),
  ('00000000-0000-0000-0000-000000000932'),
  ('00000000-0000-0000-0000-000000000933');

update public.profiles set id = 'ce-owner', handle = 'ce_owner', name = 'Earn Advertiser', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000931';
update public.profiles set id = 'ce-creator-a', handle = 'ce_creator_a', name = 'Creator A', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000932';
update public.profiles set id = 'ce-creator-b', handle = 'ce_creator_b', name = 'Creator B', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000933';

select has_function('public', 'creator_earnings_summary', 'creator_earnings_summary exists');
select has_function('public', 'creator_my_referral_links', 'creator_my_referral_links exists');
select has_function('public', 'creator_my_coupons', 'creator_my_coupons exists');

-- Seed advertiser + campaign as owner
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000931","role":"authenticated"}', true);

select lives_ok($$ select public.create_advertiser('Earn Co', 'earn-co') $$, 'create advertiser');
select lives_ok(
  $$ select public.activate_advertiser((select id from public.advertisers where slug = 'earn-co')) $$,
  'activate advertiser'
);
select lives_ok(
  $$ select public.create_sponsor_campaign(
       (select id from public.advertisers where slug = 'earn-co'),
       'Campus Drop', '', 'REFERRAL', 'INR', now(), now() + interval '30 days') $$,
  'create campaign'
);
select lives_ok(
  $$ select public.set_sponsor_campaign_status(
       (select id from public.sponsor_campaigns where title = 'Campus Drop'), 'ACTIVE') $$,
  'activate campaign'
);
select lives_ok(
  $$ select public.assign_creator_to_campaign(
       (select id from public.sponsor_campaigns where title = 'Campus Drop'),
       'ce-creator-a', 'PERCENTAGE', 1250) $$,
  'assign creator A at 12.5%'
);
select lives_ok(
  $$ select public.create_campaign_referral_link(
       (select id from public.sponsor_campaigns where title = 'Campus Drop'), 'ce-creator-a') $$,
  'create referral for A'
);
select lives_ok(
  $$ select public.create_campaign_coupon(
       (select id from public.sponsor_campaigns where title = 'Campus Drop'),
       'ce-creator-a', 'CEARNA', null, null, null) $$,
  'create coupon for A'
);

-- Assign B on same campaign with own assets
select lives_ok(
  $$ select public.assign_creator_to_campaign(
       (select id from public.sponsor_campaigns where title = 'Campus Drop'),
       'ce-creator-b', 'FIXED_PER_CONVERSION', 5000) $$,
  'assign creator B'
);
select lives_ok(
  $$ select public.create_campaign_referral_link(
       (select id from public.sponsor_campaigns where title = 'Campus Drop'), 'ce-creator-b') $$,
  'create referral for B'
);
select lives_ok(
  $$ select public.create_campaign_coupon(
       (select id from public.sponsor_campaigns where title = 'Campus Drop'),
       'ce-creator-b', 'CEARNB', null, null, null) $$,
  'create coupon for B'
);

-- Capture ids + tokens
reset role;
select set_config('request.jwt.claims', null, true);

create temporary table ce_ids as
select
  (select id from public.sponsor_campaigns where title = 'Campus Drop') as campaign_id,
  (select id from public.advertisers where slug = 'earn-co') as advertiser_id,
  (select id from public.referral_links where creator_profile_id = 'ce-creator-a' limit 1) as link_a,
  (select id from public.referral_links where creator_profile_id = 'ce-creator-b' limit 1) as link_b,
  (select token from public.referral_links where creator_profile_id = 'ce-creator-a' limit 1) as token_a,
  (select token from public.referral_links where creator_profile_id = 'ce-creator-b' limit 1) as token_b,
  (select id from public.coupon_codes where creator_profile_id = 'ce-creator-a' limit 1) as coupon_a,
  (select id from public.coupon_codes where creator_profile_id = 'ce-creator-b' limit 1) as coupon_b;

grant select on ce_ids to authenticated;

-- Conversions → ledger (service_role path). Coupon CEARNA → A, referral B → B.
select lives_ok(
  $$ select public.record_sponsor_conversion(
       (select campaign_id from ce_ids), 'ce-ext-a1', 'PURCHASE', 1000000, 'INR',
       null, 'CEARNA', 'IN-GA', 'Goa', 'panjim-zone', null, now()) $$,
  'conversion for creator A (pending ledger)'
);
select lives_ok(
  $$ select public.record_sponsor_conversion(
       (select campaign_id from ce_ids), 'ce-ext-a2', 'PURCHASE', 2000000, 'INR',
       null, 'CEARNA', 'IN-GA', 'Goa', 'panjim-zone', null, now()) $$,
  'second conversion for creator A'
);
select lives_ok(
  $$ select public.record_sponsor_conversion(
       (select campaign_id from ce_ids), 'ce-ext-b1', 'PURCHASE', 10000, 'INR',
       (select token_b from ce_ids), null, 'IN-GA', 'Goa', 'panjim-zone', null, now()) $$,
  'conversion for creator B'
);

-- Approve one of A's ledger rows (service/admin path)
update public.creator_commission_ledger
   set status = 'APPROVED'
 where creator_profile_id = 'ce-creator-a'
   and conversion_id = (
     select id from public.conversion_events where external_conversion_id = 'ce-ext-a2'
   );

-- Expected A amounts: 12.5% of 1_000_000 = 125_000 pending; 12.5% of 2_000_000 = 250_000 approved
-- B: FIXED 5000 pending

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000932","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.creator_campaign_stats()),
  1,
  'creator A sees own campaign stats'
);
select is(
  (select commission_value from public.creator_campaign_stats()),
  1250,
  'creator A sees own commission bp'
);
select is(
  (select pending_commission_minor from public.creator_campaign_stats()),
  125000::bigint,
  'pending separated correctly on campaign stats'
);
select is(
  (select approved_commission_minor from public.creator_campaign_stats()),
  250000::bigint,
  'approved separated correctly on campaign stats'
);

select is(
  (select total_earned_minor from public.creator_earnings_summary()),
  375000::bigint,
  'creator totals only include own ledger pending+approved'
);
select is(
  (select pending_commission_minor from public.creator_earnings_summary()),
  125000::bigint,
  'summary pending is own only'
);
select is(
  (select approved_commission_minor from public.creator_earnings_summary()),
  250000::bigint,
  'summary approved is own only'
);

select is(
  (select count(*)::int from public.creator_my_referral_links(null)),
  1,
  'creator A sees own links'
);
select is(
  (select count(*)::int from public.creator_my_referral_links((select campaign_id from ce_ids))
     where id = (select link_b from ce_ids)),
  0,
  'creator A cannot see another creator links'
);

select is(
  (select count(*)::int from public.creator_my_coupons(null)),
  1,
  'creator A sees own coupons'
);
select is(
  (select count(*)::int from public.creator_my_coupons(null)
     where id = (select coupon_b from ce_ids)),
  0,
  'creator A cannot see another creator coupons'
);

-- Creator B isolation
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000933","role":"authenticated"}', true);
select is(
  (select pending_commission_minor from public.creator_earnings_summary()),
  5000::bigint,
  'creator B totals only include own ledger'
);
select is(
  (select count(*)::int from public.creator_my_referral_links(null)
     where id = (select link_a from ce_ids)),
  0,
  'creator B cannot see creator A links'
);
select is(
  (select count(*)::int from public.creator_campaign_stats()
     where pending_commission_minor = 125000),
  0,
  'creator B cannot see creator A campaign stats amounts'
);

-- Raw conversion tables remain inaccessible
select throws_ok(
  $$ select * from public.conversion_events $$,
  '42501', null, 'raw conversion_events inaccessible to creator'
);
select throws_ok(
  $$ select * from public.conversion_attributions $$,
  '42501', null, 'raw conversion_attributions inaccessible to creator'
);

-- Geo reporting remains advertiser-only
select throws_ok(
  $$ select public.advertiser_campaign_geo_summary((select campaign_id from ce_ids)) $$,
  '42501', null, 'geo reporting remains inaccessible to creator'
);

reset role;
select * from finish();
rollback;
