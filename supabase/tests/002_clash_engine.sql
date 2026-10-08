-- ============================================================================
-- Clash + reputation engine tests (pgTAP). Self-contained; run: supabase test db
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures: author, challenger and three jurors, plus one live take.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-00000000000e');

update public.profiles set id = 't-author', handle = 'author_t', name = 'Author', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set id = 't-challenger', handle = 'chall_t', name = 'Challenger', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set id = 't-j1', handle = 'juror1_t', name = 'Juror1', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000c';
update public.profiles set id = 't-j2', handle = 'juror2_t', name = 'Juror2', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000d';
update public.profiles set id = 't-j3', handle = 'juror3_t', name = 'Juror3', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000e';

insert into public.takes (id, author_id, hood, text, status, expires_at)
values ('t-test-clash', 't-author', 'techtakes', 'The test take.', 'active', now() + interval '24 hours');

-- schema + privileges
select has_table('public', 'clashes', 'clashes table');
select has_table('public', 'judgements', 'judgements table');
select has_table('public', 'verdicts', 'verdicts table');
select has_table('public', 'reputation_events', 'reputation_events table');
select has_function('public', 'start_clash', 'start_clash exists');
select has_function('public', 'submit_judgement', 'submit_judgement exists');
select has_function('public', 'settle_clash', 'settle_clash exists');
select is(has_table_privilege('authenticated', 'public.judgements', 'INSERT'), false, 'no blanket INSERT judgements');
select is(has_table_privilege('authenticated', 'public.verdicts', 'INSERT'), false, 'no blanket INSERT verdicts');
select is(has_table_privilege('authenticated', 'public.reputation_events', 'INSERT'), false, 'no blanket INSERT reputation_events');
select is(has_table_privilege('anon', 'public.judgements', 'SELECT'), false, 'anon cannot read judgements');

-- creation
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"anon"}', true);
select throws_ok($$ select public.start_clash('t-test-clash') $$, '42501', null, 'anon cannot start clash');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.start_clash('t-test-clash') $$, 'P0001', null, 'author cannot clash own take');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ select public.start_clash('nope') $$, 'P0002', null, 'invalid take rejected');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$ select public.start_clash('t-test-clash') $$, 'challenger starts clash');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ select public.start_clash('t-test-clash') $$, 'P0005', null, 'duplicate clash rejected');
reset role;

-- ballots
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.submit_judgement((select id from public.clashes where take_id = 't-test-clash'), 'A') $$, 'P0005', null, 'author cannot vote own clash');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ select public.submit_judgement((select id from public.clashes where take_id = 't-test-clash'), 'A') $$, 'P0005', null, 'challenger cannot vote own clash');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_ok($$ select public.submit_judgement((select id from public.clashes where take_id = 't-test-clash'), 'C') $$, '22P02', null, 'invalid side rejected');
select throws_ok($$ insert into public.judgements (clash_id, juror_id, side) values ((select id from public.clashes where take_id = 't-test-clash'), 't-j1', 'A') $$, '42501', null, 'client cannot insert raw ballot');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id = 't-test-clash'), 'A') $$, 'j1 votes A');
reset role;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id = 't-test-clash'), 'B') $$, 'j2 votes B');
reset role;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id = 't-test-clash'), 'A') $$, 'j3 votes A');
reset role;

-- one ballot per profile: j1 re-vote is a no-op, the first ballot stands
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id = 't-test-clash'), 'B') $$, 'j1 re-vote no-op');
reset role;
select is((select count(*)::int from public.judgements where juror_id = 't-j1'), 1, 'one ballot per profile');
select is((select side::text from public.judgements where juror_id = 't-j1'), 'A', 'first ballot stands');

-- privacy: a non-juror (the author) cannot read unfinished ballots
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.judgements where clash_id = (select id from public.clashes where take_id = 't-test-clash')), 0, 'non-juror cannot read ballots');
reset role;

-- premature settlement is refused
select throws_ok($$ select public.settle_clash((select id from public.clashes where take_id = 't-test-clash')) $$, 'P0006', null, 'cannot settle before close');
reset role;

-- advance the clock in test context, then confirm voting closes and settlement runs
update public.clashes set opens_at = now() - interval '2 hours', closes_at = now() - interval '1 hour' where take_id = 't-test-clash';

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_ok($$ select public.submit_judgement((select id from public.clashes where take_id = 't-test-clash'), 'A') $$, 'P0004', null, 'cannot vote after close');
reset role;

select lives_ok($$ select public.settle_clash((select id from public.clashes where take_id = 't-test-clash')) $$, 'settle_clash runs');
reset role;

-- exactly one verdict, totals match the persisted ballots (A=2, B=1)
select is((select count(*)::int from public.verdicts where clash_id = (select id from public.clashes where take_id = 't-test-clash')), 1, 'exactly one verdict');
select is((select winner_side::text from public.verdicts where clash_id = (select id from public.clashes where take_id = 't-test-clash')), 'A', 'winner is A');
select is((select side_a_score from public.verdicts where clash_id = (select id from public.clashes where take_id = 't-test-clash')), 2, 'side A score 2');
select is((select side_b_score from public.verdicts where clash_id = (select id from public.clashes where take_id = 't-test-clash')), 1, 'side B score 1');
select is((select jury_size from public.verdicts where clash_id = (select id from public.clashes where take_id = 't-test-clash')), 3, 'jury size 3');

-- reward ledger: 2 rows per juror, matching the contract
select is((select count(*)::int from public.reputation_events where clash_id = (select id from public.clashes where take_id = 't-test-clash')), 6, '6 ledger rows');
select is((select count(*)::int from public.reputation_events where kind = 'clash_participation' and clash_id = (select id from public.clashes where take_id = 't-test-clash')), 3, '3 participation events');
select is((select count(*)::int from public.reputation_events where kind = 'clash_win' and clash_id = (select id from public.clashes where take_id = 't-test-clash')), 2, '2 win events');
select is((select count(*)::int from public.reputation_events where kind = 'clash_dissent' and clash_id = (select id from public.clashes where take_id = 't-test-clash')), 1, '1 dissent event');

-- derived profile state (winner +120/+40/streak+1, minority +25/+18/streak 0)
select is((select reputation from public.profiles where id = 't-j1'), 120, 'j1 reputation +120');
select is((select coins from public.profiles where id = 't-j1'), 40, 'j1 coins +40');
select is((select streak from public.profiles where id = 't-j1'), 1, 'j1 streak 1');
select is((select reputation from public.profiles where id = 't-j2'), 25, 'j2 reputation +25');
select is((select coins from public.profiles where id = 't-j2'), 18, 'j2 coins +18');
select is((select streak from public.profiles where id = 't-j2'), 0, 'j2 streak 0');
select is((select rank::text from public.profiles where id = 't-j1'), 'Rookie', 'rank derived from reputation');

-- client cannot write economy columns or forge the ledger
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_ok($$ update public.profiles set reputation = 999 where id = 't-j1' $$, '42501', null, 'client cannot write reputation');
select throws_ok($$ update public.profiles set coins = 999 where id = 't-j1' $$, '42501', null, 'client cannot write coins');
select throws_ok($$ update public.profiles set rank = 'Legend' where id = 't-j1' $$, '42501', null, 'client cannot write rank');
select throws_ok($$ insert into public.reputation_events (id, profile_id, kind, reputation_delta) values ('re-forge', 't-j1', 'clash_win', 5000) $$, '42501', null, 'client cannot forge reputation_events');
reset role;

-- idempotent settlement: re-settle neither duplicates nor re-awards
select lives_ok($$ select public.settle_clash((select id from public.clashes where take_id = 't-test-clash')) $$, 're-settle is idempotent');
select is((select count(*)::int from public.verdicts where clash_id = (select id from public.clashes where take_id = 't-test-clash')), 1, 'still one verdict');
select is((select count(*)::int from public.reputation_events where clash_id = (select id from public.clashes where take_id = 't-test-clash')), 6, 'still 6 ledger rows');
select is((select reputation from public.profiles where id = 't-j1'), 120, 'j1 reputation unchanged');

-- notifications are server-created only
select is((select count(*)::int from public.notifications where entity_id = (select id from public.clashes where take_id = 't-test-clash')), 6, '6 clash notifications');
select is((select count(*)::int from public.notifications where kind = 'clash_started' and recipient_id = 't-author'), 1, 'clash_started to author');
select is((select count(*)::int from public.notifications where kind = 'clash_result' and entity_id = (select id from public.clashes where take_id = 't-test-clash')), 2, 'clash_result to both debaters');
select is((select count(*)::int from public.notifications where kind = 'reputation' and entity_id = (select id from public.clashes where take_id = 't-test-clash')), 3, 'reputation to each juror');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_ok($$ insert into public.notifications (id, recipient_id, kind) values ('n-forge', 't-j1', 'clash_result') $$, '42501', null, 'client cannot forge notifications');
reset role;

select * from finish();
rollback;
