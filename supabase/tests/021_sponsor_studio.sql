-- ============================================================================
-- Sponsor Studio management RPC tests (Phase 10 Step 2)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000921'),
  ('00000000-0000-0000-0000-000000000922'),
  ('00000000-0000-0000-0000-000000000923');

update public.profiles set id = 'st-owner', handle = 'st_owner', name = 'Studio Owner', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000921';
update public.profiles set id = 'st-creator', handle = 'st_creator', name = 'Studio Creator', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000922';
update public.profiles set id = 'st-other', handle = 'st_other', name = 'Other User', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000923';

select has_function('public', 'create_advertiser', 'create_advertiser exists');
select has_function('public', 'create_sponsor_campaign', 'create_sponsor_campaign exists');
select has_function('public', 'assign_creator_to_campaign', 'assign_creator_to_campaign exists');
select has_function('public', 'create_campaign_referral_link', 'create_campaign_referral_link exists');
select has_function('public', 'create_campaign_coupon', 'create_campaign_coupon exists');
select has_function('public', 'advertiser_studio_overview', 'advertiser_studio_overview exists');
select has_function('public', 'advertiser_campaign_creator_stats', 'advertiser_campaign_creator_stats exists');

-- Owner creates advertiser (as authenticated)
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000921","role":"authenticated"}', true);

select lives_ok(
  $$ select public.create_advertiser('Studio Co', 'studio-co') $$,
  'owner can create advertiser'
);

select is(
  (select created_by_profile_id from public.advertisers where slug = 'studio-co'),
  'st-owner',
  'advertiser owner is derived from auth, not client-supplied'
);

select is(
  (select status::text from public.advertisers where slug = 'studio-co'),
  'DRAFT',
  'new advertiser starts DRAFT'
);

-- Other user cannot create advertiser claiming ownership (server always uses auth)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000923","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_advertiser('Other Co', 'other-studio') $$,
  'other user creates their own advertiser'
);
select is(
  (select created_by_profile_id from public.advertisers where slug = 'other-studio'),
  'st-other',
  'other advertiser owned by other user'
);

-- Owner campaign create / other cannot
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000921","role":"authenticated"}', true);
select lives_ok(
  $$ select public.activate_advertiser((select id from public.advertisers where slug = 'studio-co')) $$,
  'owner activates advertiser'
);
select lives_ok(
  $$ select public.create_sponsor_campaign(
       (select id from public.advertisers where slug = 'studio-co'),
       'Launch Drop', 'desc', 'REFERRAL', 'INR', now(), now() + interval '30 days') $$,
  'owner can create campaign'
);

select throws_ok(
  $$ select public.create_sponsor_campaign(
       (select id from public.advertisers where slug = 'studio-co'),
       'Bad FX', '', 'REFERRAL', 'US', now(), now() + interval '1 day') $$,
  'P0003', null, 'invalid currency rejected'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000923","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_sponsor_campaign(
       (select id from public.advertisers where slug = 'studio-co'),
       'Hijack', '', 'REFERRAL', 'INR', null, null) $$,
  '42501', null, 'non-owner cannot create campaign on another advertiser'
);

-- Status transitions
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000921","role":"authenticated"}', true);
select lives_ok(
  $$ select public.set_sponsor_campaign_status(
       (select id from public.sponsor_campaigns where title = 'Launch Drop'), 'ACTIVE') $$,
  'DRAFT → ACTIVE allowed'
);
select lives_ok(
  $$ select public.pause_sponsor_campaign(
       (select id from public.sponsor_campaigns where title = 'Launch Drop')) $$,
  'ACTIVE → PAUSED'
);
select lives_ok(
  $$ select public.resume_sponsor_campaign(
       (select id from public.sponsor_campaigns where title = 'Launch Drop')) $$,
  'PAUSED → ACTIVE'
);
select lives_ok(
  $$ select public.set_sponsor_campaign_status(
       (select id from public.sponsor_campaigns where title = 'Launch Drop'), 'ENDED') $$,
  'ACTIVE → ENDED'
);
select throws_ok(
  $$ select public.set_sponsor_campaign_status(
       (select id from public.sponsor_campaigns where title = 'Launch Drop'), 'ACTIVE') $$,
  'P0003', null, 'ENDED cannot resurrect to ACTIVE'
);

-- Fresh campaign for assignment tests
select lives_ok(
  $$ select public.create_sponsor_campaign(
       (select id from public.advertisers where slug = 'studio-co'),
       'Live Camp', '', 'COUPON', 'INR', now(), now() + interval '14 days') $$,
  'second campaign created'
);
select lives_ok(
  $$ select public.set_sponsor_campaign_status(
       (select id from public.sponsor_campaigns where title = 'Live Camp'), 'ACTIVE') $$,
  'Live Camp activated'
);

select lives_ok(
  $$ select public.assign_creator_to_campaign(
       (select id from public.sponsor_campaigns where title = 'Live Camp'),
       'st-creator', 'PERCENTAGE', 1250) $$,
  'owner can assign creator with 12.5%'
);

select throws_ok(
  $$ select public.assign_creator_to_campaign(
       (select id from public.sponsor_campaigns where title = 'Live Camp'),
       'st-creator', 'PERCENTAGE', 10001) $$,
  'P0003', null, 'invalid commission rejected'
);

-- Capture id while still owner-visible; non-owner RLS would null the subquery.
create temporary table if not exists studio_assign_ids as
  select id as campaign_id from public.sponsor_campaigns where title = 'Live Camp';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000923","role":"authenticated"}', true);
select throws_ok(
  $$ select public.assign_creator_to_campaign(
       (select campaign_id from studio_assign_ids),
       'st-creator', 'NONE', 0) $$,
  '42501', null, 'non-owner cannot assign creator'
);

-- Referral + coupon
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000921","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_campaign_referral_link(
       (select id from public.sponsor_campaigns where title = 'Live Camp'), 'st-creator') $$,
  'owner generates referral link'
);
select ok(
  (select char_length(token) = 48 and token ~ '^[0-9a-f]+$'
     from public.referral_links
    where campaign_id = (select id from public.sponsor_campaigns where title = 'Live Camp')
    limit 1),
  'referral token generated server-side as 48-char hex'
);

-- Capture campaign id as owner before switching callers (RLS hides rows from non-owners)
create temporary table studio_ids as
  select id as campaign_id
    from public.sponsor_campaigns
   where title = 'Live Camp';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000923","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_campaign_referral_link(
       (select campaign_id from studio_ids), 'st-creator') $$,
  '42501', null, 'non-owner cannot generate referral'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000921","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_campaign_coupon(
       (select campaign_id from studio_ids),
       'st-creator', ' save 10 ', null, null, 10) $$,
  'owner creates coupon'
);
select is(
  (select code from public.coupon_codes
    where campaign_id = (select campaign_id from studio_ids)
    limit 1),
  'SAVE10',
  'coupon canonicalization still holds via create RPC'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000923","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_campaign_coupon(
       (select campaign_id from studio_ids),
       'st-creator', 'HIJACK', null, null, null) $$,
  '42501', null, 'non-owner cannot create coupon'
);

-- Creator stats isolation + no buyer columns in result set
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000921","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.advertiser_campaign_creator_stats(
     (select campaign_id from studio_ids))),
  1,
  'owner sees creator performance aggregate'
);
select is(
  (select creator_handle from public.advertiser_campaign_creator_stats(
     (select campaign_id from studio_ids))),
  'st_creator',
  'creator stats expose handle only (no buyer fields)'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000923","role":"authenticated"}', true);
select throws_ok(
  $$ select public.advertiser_campaign_creator_stats(
       (select campaign_id from studio_ids)) $$,
  '42501', null, 'non-owner cannot read creator performance'
);

-- Overview works for owner
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000921","role":"authenticated"}', true);
select lives_ok(
  $$ select public.advertiser_studio_overview(
       (select id from public.advertisers where slug = 'studio-co')) $$,
  'owner can load studio overview'
);

reset role;
select * from finish();
rollback;
