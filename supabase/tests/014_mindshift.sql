-- ============================================================================
-- Mindshift tests (pgTAP): private stances, immutable writes, safe aggregate.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000501'),
  ('00000000-0000-0000-0000-000000000502'),
  ('00000000-0000-0000-0000-000000000503'),
  ('00000000-0000-0000-0000-000000000504'),
  ('00000000-0000-0000-0000-000000000505'),
  ('00000000-0000-0000-0000-000000000506');

update public.profiles set id = 'ms-a', handle = 'ms_a', name = 'Mind A', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000501';
update public.profiles set id = 'ms-b', handle = 'ms_b', name = 'Mind B', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000502';
update public.profiles set id = 'ms-c', handle = 'ms_c', name = 'Mind C', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000503';
update public.profiles set id = 'ms-d', handle = 'ms_d', name = 'Mind D', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000504';
update public.profiles set id = 'ms-e', handle = 'ms_e', name = 'Mind E', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000505';
update public.profiles set id = 'ms-f', handle = 'ms_f', name = 'Mind F', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000506';

insert into public.takes (id, author_id, hood, text, status, created_at, expires_at) values
  ('ms-live',    'ms-a', 'techtakes', 'mindshift live',    'active',  now(), now() + interval '12 hours'),
  ('ms-empty',   'ms-a', 'techtakes', 'mindshift empty',   'active',  now(), now() + interval '12 hours'),
  ('ms-removed', 'ms-a', 'techtakes', 'mindshift removed', 'removed', now(), now() + interval '12 hours'),
  ('ms-blocked', 'ms-a', 'techtakes', 'mindshift blocked', 'active',  now(), now() + interval '12 hours');

insert into public.blocks (blocker_id, blocked_id) values ('ms-a', 'ms-f');

-- ── schema + privileges ─────────────────────────────────────────────────────
select has_table('public', 'take_stances', 'take_stances table');
select has_function('public', 'record_initial_stance', 'record_initial_stance exists');
select has_function('public', 'record_final_stance', 'record_final_stance exists');
select has_function('public', 'mindshift_stats', 'mindshift_stats exists');

select is(has_table_privilege('authenticated', 'public.take_stances', 'INSERT'), false, 'no client INSERT on take_stances');
select is(has_table_privilege('authenticated', 'public.take_stances', 'UPDATE'), false, 'no client UPDATE on take_stances');
select is(has_table_privilege('authenticated', 'public.take_stances', 'DELETE'), false, 'no client DELETE on take_stances');
select is(has_table_privilege('anon', 'public.take_stances', 'SELECT'), false, 'anon cannot read stance rows');
select is(has_table_privilege('authenticated', 'public.take_stances', 'SELECT'), true, 'authenticated may select own stance rows');

select is(has_function_privilege('anon', 'public.record_initial_stance(text,take_stance)', 'EXECUTE'), false, 'anon cannot record initial stance');
select is(has_function_privilege('anon', 'public.record_final_stance(text,take_stance)', 'EXECUTE'), false, 'anon cannot record final stance');
select is(has_function_privilege('authenticated', 'public.record_initial_stance(text,take_stance)', 'EXECUTE'), true, 'authenticated can record initial stance');
select is(has_function_privilege('authenticated', 'public.record_final_stance(text,take_stance)', 'EXECUTE'), true, 'authenticated can record final stance');
select is(has_function_privilege('anon', 'public.mindshift_stats(text)', 'EXECUTE'), true, 'anon may read aggregate stats');
select is(has_function_privilege('authenticated', 'public.mindshift_stats(text)', 'EXECUTE'), true, 'authenticated may read aggregate stats');
select is(has_function_privilege('anon', 'public.take_stance_payload(take_stances)', 'EXECUTE'), false, 'anon cannot call the payload helper');

-- ── guest cannot record ─────────────────────────────────────────────────────
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.record_initial_stance('ms-live', 'AGREE') $$, '42501', null, 'guest cannot record initial stance');
select throws_ok($$ select public.record_final_stance('ms-live', 'AGREE') $$, '42501', null, 'guest cannot record final stance');
reset role;

-- ── missing / removed takes ─────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}', true);
select throws_ok($$ select public.record_initial_stance('ms-nope', 'AGREE') $$, 'P0002', null, 'missing take rejected');
select throws_ok($$ select public.record_initial_stance('ms-removed', 'AGREE') $$, 'P0003', null, 'removed take rejected');

-- ── authenticated records initial; identity is the session ──────────────────
select is(
  public.record_initial_stance('ms-live', 'AGREE') ->> 'initialStance',
  'AGREE',
  'authenticated user can record initial stance'
);
select is(
  (select profile_id from public.take_stances where take_id = 'ms-live' and profile_id = 'ms-b'),
  'ms-b',
  'stance is attributed to the caller, not a client-supplied id'
);
select is(
  (select count(*)::int from public.take_stances where take_id = 'ms-live' and profile_id = 'ms-a'),
  0,
  'recording as B cannot forge a stance for A'
);
select is(
  (select final_stance is null from public.take_stances where take_id = 'ms-live' and profile_id = 'ms-b'),
  true,
  'changed is unset until a final stance exists'
);

-- initial cannot be rewritten
select throws_ok($$ select public.record_initial_stance('ms-live', 'DISAGREE') $$, 'P0006', null, 'initial stance cannot be rewritten');
select is(
  (select initial_stance::text from public.take_stances where take_id = 'ms-live' and profile_id = 'ms-b'),
  'AGREE',
  'first initial stance is the one that stuck'
);

-- raw writes denied
select throws_ok(
  $$ insert into public.take_stances (take_id, profile_id, initial_stance) values ('ms-empty', 'ms-b', 'AGREE') $$,
  '42501', null, 'raw insert denied'
);
select throws_ok(
  $$ update public.take_stances set initial_stance = 'DISAGREE' where take_id = 'ms-live' and profile_id = 'ms-b' $$,
  '42501', null, 'raw update denied'
);
select throws_ok(
  $$ delete from public.take_stances where take_id = 'ms-live' and profile_id = 'ms-b' $$,
  '42501', null, 'raw delete denied'
);

-- final requires initial
select throws_ok($$ select public.record_final_stance('ms-empty', 'AGREE') $$, 'P0007', null, 'final stance requires an initial stance');

-- same stance = unchanged
select is(public.record_final_stance('ms-live', 'AGREE') ->> 'changed', 'false', 'same stance is unchanged');
select throws_ok($$ select public.record_final_stance('ms-live', 'DISAGREE') $$, 'P0008', null, 'final stance cannot be rewritten');
select is(
  (select final_stance::text from public.take_stances where take_id = 'ms-live' and profile_id = 'ms-b'),
  'AGREE',
  'first final stance is the one that stuck'
);
reset role;

-- ── 50% Mindshift scenario (B unchanged, C/D changed, E unchanged) ──────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000503","role":"authenticated"}', true);
select lives_ok($$ select public.record_initial_stance('ms-live', 'AGREE') $$, 'C records initial AGREE');
select is(public.record_final_stance('ms-live', 'DISAGREE') ->> 'changed', 'true', 'AGREE -> DISAGREE counts as changed');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000504","role":"authenticated"}', true);
select lives_ok($$ select public.record_initial_stance('ms-live', 'UNSURE') $$, 'D records initial UNSURE');
select is(public.record_final_stance('ms-live', 'AGREE') ->> 'changed', 'true', 'UNSURE -> AGREE counts as changed');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000505","role":"authenticated"}', true);
select lives_ok($$ select public.record_initial_stance('ms-live', 'DISAGREE') $$, 'E records initial DISAGREE');
select is(public.record_final_stance('ms-live', 'DISAGREE') ->> 'changed', 'false', 'DISAGREE -> DISAGREE is unchanged');
reset role;

select is((public.mindshift_stats('ms-live') ->> 'completedParticipants')::int, 4, 'completed participants = 4');
select is((public.mindshift_stats('ms-live') ->> 'changedCount')::int, 2, 'changed count = 2');
select is((public.mindshift_stats('ms-live') ->> 'changedPercent')::int, 50, 'Mindshift = 50%');
select is((public.mindshift_stats('ms-live') ->> 'totalInitialParticipants')::int, 4, 'four initial stances');
select is(public.mindshift_stats('ms-live') ? 'profile_id', false, 'aggregate has no profile_id');
select is(public.mindshift_stats('ms-live') ? 'initialStance', false, 'aggregate has no initialStance');
select is(public.mindshift_stats('ms-live') ? 'finalStance', false, 'aggregate has no finalStance');
select is(
  (select array(select jsonb_object_keys(public.mindshift_stats('ms-live')) order by 1)),
  ARRAY['changedCount','changedPercent','completedParticipants','takeId','totalInitialParticipants'],
  'aggregate exposes only safe keys'
);

select is(public.mindshift_stats('ms-empty') -> 'changedPercent', 'null'::jsonb, 'zero completed => changedPercent is null');
select is((public.mindshift_stats('ms-empty') ->> 'completedParticipants')::int, 0, 'empty take has 0 completed');
select is((public.mindshift_stats('ms-empty') ->> 'changedCount')::int, 0, 'empty take has 0 changed');

-- ── stance rows are private ─────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000503","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.take_stances where take_id = 'ms-live'),
  1,
  'C sees only their own stance row'
);
select is(
  (select count(*)::int from public.take_stances where take_id = 'ms-live' and profile_id = 'ms-b'),
  0,
  'C cannot read B''s stance'
);
select is(
  (select final_stance::text from public.take_stances where take_id = 'ms-live' and profile_id = 'ms-c'),
  'DISAGREE',
  'owner can read their own final stance'
);
reset role;

-- ── blocked relationship denied (either direction) ──────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000506","role":"authenticated"}', true);
select throws_ok($$ select public.record_initial_stance('ms-blocked', 'AGREE') $$, 'P0005', null, 'blocked viewer cannot record a stance');
select throws_ok($$ select public.record_final_stance('ms-blocked', 'AGREE') $$, 'P0005', null, 'blocked viewer cannot record a final stance');
reset role;

-- ── existing Arena permissions unaffected ───────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}', true);
select is(public.toggle_take_reaction('ms-live') ->> 'reacted', 'true', 'take reactions still work beside Mindshift');
select is((select count(*)::int from public.takes where id = 'ms-live' and status = 'active'), 1, 'live take is still readable');
reset role;

select * from finish();
rollback;
