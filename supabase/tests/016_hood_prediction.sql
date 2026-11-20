-- ============================================================================
-- Hood Prediction Games tests (pgTAP).
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000701'),
  ('00000000-0000-0000-0000-000000000702'),
  ('00000000-0000-0000-0000-000000000703'),
  ('00000000-0000-0000-0000-000000000704'),
  ('00000000-0000-0000-0000-000000000705'),
  ('00000000-0000-0000-0000-000000000706');

-- A is football moderator; F is a techtakes moderator (wrong hood).
update public.profiles
   set id = 'hg-a', handle = 'hg_a', name = 'HG Mod', role = 'moderator',
       moderated_hoods = array['football']::public.hood_id[],
       reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000701';
update public.profiles set id = 'hg-b', handle = 'hg_b', name = 'HG B', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000702';
update public.profiles set id = 'hg-c', handle = 'hg_c', name = 'HG C', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000703';
update public.profiles set id = 'hg-d', handle = 'hg_d', name = 'HG D', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000704';
update public.profiles set id = 'hg-e', handle = 'hg_e', name = 'HG E', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000705';
update public.profiles
   set id = 'hg-f', handle = 'hg_f', name = 'HG Wrong Hood', role = 'moderator',
       moderated_hoods = array['techtakes']::public.hood_id[],
       reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000706';

select has_table('public', 'hood_games', 'hood_games table');
select has_table('public', 'hood_game_options', 'hood_game_options table');
select has_table('public', 'hood_game_entries', 'hood_game_entries table');
select has_function('public', 'create_prediction_game', 'create_prediction_game exists');
select has_function('public', 'submit_prediction', 'submit_prediction exists');
select has_function('public', 'resolve_prediction_game', 'resolve_prediction_game exists');
select has_function('public', 'close_prediction_games', 'close_prediction_games exists');
select has_function('public', 'hood_game_view', 'hood_game_view exists');

select is(has_table_privilege('authenticated', 'public.hood_games', 'INSERT'), false, 'no client INSERT on hood_games');
select is(has_table_privilege('authenticated', 'public.hood_game_options', 'INSERT'), false, 'no client INSERT on options');
select is(has_table_privilege('authenticated', 'public.hood_game_entries', 'INSERT'), false, 'no client INSERT on entries');
select is(has_table_privilege('anon', 'public.hood_game_entries', 'SELECT'), false, 'anon cannot read entries');
select is(has_function_privilege('anon', 'public.create_prediction_game(hood_id,text,text[],timestamptz)', 'EXECUTE'), false, 'anon cannot create');
select is(has_function_privilege('authenticated', 'public.close_prediction_games(integer)', 'EXECUTE'), false, 'clients cannot close via RPC');
select is(has_function_privilege('service_role', 'public.close_prediction_games(integer)', 'EXECUTE'), true, 'service_role may close');

-- unauthorized cannot create
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_prediction_game('football', 'Who scores first?', array['Arsenal','Barcelona'], now() + interval '2 hours') $$,
  '42501', null, 'unauthorized user cannot create'
);
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000706","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_prediction_game('football', 'Who scores first?', array['Arsenal','Barcelona'], now() + interval '2 hours') $$,
  '42501', null, 'moderator of another hood cannot create'
);
reset role;

-- validation
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_prediction_game('football', 'Only one?', array['Arsenal'], now() + interval '2 hours') $$,
  'P0003', null, 'exactly one option rejected'
);
select throws_ok(
  $$ select public.create_prediction_game('football', 'Too many?', array['A','B','C','D','E'], now() + interval '2 hours') $$,
  'P0003', null, 'five options rejected'
);
select throws_ok(
  $$ select public.create_prediction_game('football', 'Dupes?', array['Arsenal','arsenal'], now() + interval '2 hours') $$,
  'P0005', null, 'duplicate options rejected'
);
select throws_ok(
  $$ select public.create_prediction_game('football', 'Past?', array['Arsenal','Barcelona'], now() - interval '1 minute') $$,
  'P0002', null, 'closes_at must be future'
);

select lives_ok(
  $$ select public.create_prediction_game(
       'football',
       'Who scores first tonight?',
       array['Arsenal','Barcelona','No goal'],
       now() + interval '2 hours'
     ) $$,
  'authorized moderator can create'
);
reset role;

select is((select count(*)::int from public.hood_game_options where game_id = (select id from public.hood_games where hood = 'football' limit 1)), 3, 'three options stored');
select is((select status::text from public.hood_games where hood = 'football' limit 1), 'OPEN', 'game opens as OPEN');

-- guest cannot predict
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.submit_prediction(
       (select id from public.hood_games where hood = 'football' limit 1),
       (select id from public.hood_game_options where label = 'Arsenal' limit 1)
     ) $$,
  '42501', null, 'guest cannot predict'
);
-- anti-bandwagon before prediction
select is(
  public.hood_game_view((select id from public.hood_games where hood = 'football' limit 1)) -> 'totalParticipants',
  'null'::jsonb,
  'before prediction, totalParticipants hidden'
);
select is(
  public.hood_game_view((select id from public.hood_games where hood = 'football' limit 1)) #>> '{options,0,percent}',
  null,
  'before prediction, percentages hidden'
);
reset role;

-- B predicts Arsenal
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}', true);
select lives_ok(
  $$ select public.submit_prediction(
       (select id from public.hood_games where hood = 'football' limit 1),
       (select id from public.hood_game_options where label = 'Arsenal' and game_id = (select id from public.hood_games where hood = 'football' limit 1))
     ) $$,
  'user can predict once'
);
select throws_ok(
  $$ select public.submit_prediction(
       (select id from public.hood_games where hood = 'football' limit 1),
       (select id from public.hood_game_options where label = 'Barcelona' and game_id = (select id from public.hood_games where hood = 'football' limit 1))
     ) $$,
  'P0006', null, 'cannot change prediction'
);
select is(
  (public.hood_game_view((select id from public.hood_games where hood = 'football' limit 1)) ->> 'totalParticipants')::int,
  1,
  'after prediction, total count visible'
);
select is(
  public.hood_game_view((select id from public.hood_games where hood = 'football' limit 1)) #>> '{options,0,percent}',
  null,
  'after prediction but before close, percentages still hidden'
);
select throws_ok(
  $$ insert into public.hood_game_entries (game_id, profile_id, option_id)
     values (
       (select id from public.hood_games where hood = 'football' limit 1),
       'hg-b',
       (select id from public.hood_game_options where label = 'Arsenal' limit 1)
     ) $$,
  '42501', null, 'raw entry insert denied'
);
reset role;

-- C Arsenal, D Barcelona, E No goal
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000703","role":"authenticated"}', true);
select lives_ok(
  $$ select public.submit_prediction(
       (select id from public.hood_games where hood = 'football' limit 1),
       (select id from public.hood_game_options where label = 'Arsenal' and game_id = (select id from public.hood_games where hood = 'football' limit 1))
     ) $$,
  'C predicts Arsenal'
);
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000704","role":"authenticated"}', true);
select lives_ok(
  $$ select public.submit_prediction(
       (select id from public.hood_games where hood = 'football' limit 1),
       (select id from public.hood_game_options where label = 'Barcelona' and game_id = (select id from public.hood_games where hood = 'football' limit 1))
     ) $$,
  'D predicts Barcelona'
);
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000705","role":"authenticated"}', true);
select lives_ok(
  $$ select public.submit_prediction(
       (select id from public.hood_games where hood = 'football' limit 1),
       (select id from public.hood_game_options where label = 'No goal' and game_id = (select id from public.hood_games where hood = 'football' limit 1))
     ) $$,
  'E predicts No goal'
);
select throws_ok(
  $$ select public.submit_prediction(
       (select id from public.hood_games where hood = 'football' limit 1),
       'hgo_missing'
     ) $$,
  'P0004', null, 'invalid option rejected'
);
reset role;

-- privacy: C cannot see B's entry row
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000703","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.hood_game_entries where game_id = (select id from public.hood_games where hood = 'football' limit 1)),
  1,
  'viewer sees only their own entry'
);
select is(
  (select count(*)::int from public.hood_game_entries where profile_id = 'hg-b'),
  0,
  'per-user entries are private'
);
reset role;

-- normal user cannot resolve while open
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}', true);
select throws_ok(
  $$ select public.resolve_prediction_game(
       (select id from public.hood_games where hood = 'football' limit 1),
       (select id from public.hood_game_options where label = 'Arsenal' and game_id = (select id from public.hood_games where hood = 'football' limit 1))
     ) $$,
  '42501', null, 'normal user cannot resolve'
);
reset role;

-- moderator cannot resolve while still open
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}', true);
select throws_ok(
  $$ select public.resolve_prediction_game(
       (select id from public.hood_games where hood = 'football' limit 1),
       (select id from public.hood_game_options where label = 'Arsenal' and game_id = (select id from public.hood_games where hood = 'football' limit 1))
     ) $$,
  'P0003', null, 'cannot resolve before close'
);
reset role;

-- automatic close via maintenance
update public.hood_games
   set opens_at = now() - interval '3 hours',
       closes_at = now() - interval '1 second'
 where hood = 'football';

select is((public.close_prediction_games(10)), 1, 'automatic close works');
select is((select status::text from public.hood_games where hood = 'football' limit 1), 'CLOSED', 'status is CLOSED');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}', true);
select throws_ok(
  $$ select public.submit_prediction(
       (select id from public.hood_games where hood = 'football' limit 1),
       (select id from public.hood_game_options where label = 'Arsenal' and game_id = (select id from public.hood_games where hood = 'football' limit 1))
     ) $$,
  'P0003', null, 'cannot predict after close'
);
-- aggregates visible after close
select is(
  (public.hood_game_view((select id from public.hood_games where hood = 'football' limit 1)) ->> 'totalParticipants')::int,
  4,
  'after close, total participants visible'
);
select is(
  (public.hood_game_view((select id from public.hood_games where hood = 'football' limit 1)) #>> '{options,0,percent}')::int is not null,
  true,
  'after close, percentages visible'
);
reset role;

-- resolve
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}', true);
select throws_ok(
  $$ select public.resolve_prediction_game(
       (select id from public.hood_games where hood = 'football' limit 1),
       'hgo_not_real'
     ) $$,
  'P0004', null, 'winning option must belong to game'
);
select lives_ok(
  $$ select public.resolve_prediction_game(
       (select id from public.hood_games where hood = 'football' limit 1),
       (select id from public.hood_game_options where label = 'Arsenal' and game_id = (select id from public.hood_games where hood = 'football' limit 1))
     ) $$,
  'moderator can resolve'
);
select lives_ok(
  $$ select public.resolve_prediction_game(
       (select id from public.hood_games where hood = 'football' limit 1),
       (select id from public.hood_game_options where label = 'Arsenal' and game_id = (select id from public.hood_games where hood = 'football' limit 1))
     ) $$,
  'repeated resolution with same winner is harmless'
);
reset role;

select is((select status::text from public.hood_games where hood = 'football' limit 1), 'RESOLVED', 'status is RESOLVED');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}', true);
select is(public.hood_game_view((select id from public.hood_games where hood = 'football' limit 1)) ->> 'viewerCorrect', 'true', 'B is correct');
select is((public.hood_game_view((select id from public.hood_games where hood = 'football' limit 1)) ->> 'correctPercent')::int, 50, '50% predicted correctly');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000704","role":"authenticated"}', true);
select is(public.hood_game_view((select id from public.hood_games where hood = 'football' limit 1)) ->> 'viewerCorrect', 'false', 'D is incorrect');
reset role;

-- maintenance still reports Arena keys and the new prediction key
select ok(
  (public.run_maintenance(0)) ?& array['clashes_settled', 'takes_expired', 'media', 'rate_limits_pruned', 'prediction_games_closed'],
  'maintenance integration keeps existing keys and reports prediction closes'
);

select * from finish();
rollback;
