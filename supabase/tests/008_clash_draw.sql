-- ============================================================================
-- Clash DRAW tests (pgTAP). Self-contained; run: supabase test db
-- A tied ballot settles as a real DRAW: no side wins, no clash_win reward, no
-- winner coins, exactly one verdict, idempotent re-settlement, and the normal
-- A-win / B-win contract is unchanged.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures: author, challenger, four jurors.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000103'),
  ('00000000-0000-0000-0000-000000000104'),
  ('00000000-0000-0000-0000-000000000105'),
  ('00000000-0000-0000-0000-000000000106');

update public.profiles set id = 'td-author', handle = 'd_author', name = 'DAuthor', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000101';
update public.profiles set id = 'td-challenger', handle = 'd_chall', name = 'DChall', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000102';
update public.profiles set id = 'td-j1', handle = 'd_j1', name = 'DJ1', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000103';
update public.profiles set id = 'td-j2', handle = 'd_j2', name = 'DJ2', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000104';
update public.profiles set id = 'td-j3', handle = 'd_j3', name = 'DJ3', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000105';
update public.profiles set id = 'td-j4', handle = 'd_j4', name = 'DJ4', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000106';

insert into public.takes (id, author_id, hood, text, status, expires_at) values
  ('td-take-draw', 'td-author', 'techtakes', 'Draw fixture take.',       'active', now() + interval '24 hours'),
  ('td-take-bwin', 'td-author', 'techtakes', 'B-majority fixture take.', 'active', now() + interval '24 hours'),
  ('td-take-awin', 'td-author', 'techtakes', 'A-majority fixture take.', 'active', now() + interval '24 hours');

select has_function('public', 'settle_clash', 'settle_clash exists');

-- ── Start three Clashes as the challenger ───────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}', true);
select lives_ok($$ select public.start_clash('td-take-draw') $$, 'start draw clash');
select lives_ok($$ select public.start_clash('td-take-bwin') $$, 'start B-majority clash');
select lives_ok($$ select public.start_clash('td-take-awin') $$, 'start A-majority clash');
reset role;

-- Ballots: draw = 2×A + 2×B; B-majority = 1×A + 2×B; A-majority = 2×A + 1×B.
select set_config('role','authenticated',true); select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}',true);
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id='td-take-draw'),'A') $$, 'j1 A (draw)');
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id='td-take-bwin'),'A') $$, 'j1 A (B-win)');
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id='td-take-awin'),'A') $$, 'j1 A (A-win)');
reset role;

select set_config('role','authenticated',true); select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000104","role":"authenticated"}',true);
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id='td-take-draw'),'A') $$, 'j2 A (draw)');
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id='td-take-bwin'),'B') $$, 'j2 B (B-win)');
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id='td-take-awin'),'A') $$, 'j2 A (A-win)');
reset role;

select set_config('role','authenticated',true); select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000105","role":"authenticated"}',true);
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id='td-take-draw'),'B') $$, 'j3 B (draw)');
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id='td-take-bwin'),'B') $$, 'j3 B (B-win)');
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id='td-take-awin'),'B') $$, 'j3 B (A-win)');
reset role;

select set_config('role','authenticated',true); select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000106","role":"authenticated"}',true);
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id='td-take-draw'),'B') $$, 'j4 B (draw)');
reset role;

-- Close every Clash.
update public.clashes set opens_at = now() - interval '2 hours', closes_at = now() - interval '1 hour'
 where take_id in ('td-take-draw', 'td-take-bwin', 'td-take-awin');

-- ── DRAW: 2 × A vs 2 × B ────────────────────────────────────────────────────
select lives_ok($$ select public.settle_clash((select id from public.clashes where take_id='td-take-draw')) $$, 'settle draw clash');
reset role;
select is((select count(*)::int from public.verdicts where clash_id=(select id from public.clashes where take_id='td-take-draw')), 1, 'exactly one verdict');
select is((select winner_side::text from public.verdicts where clash_id=(select id from public.clashes where take_id='td-take-draw')), 'DRAW', 'a tie settles DRAW');
select is((select verdict_label from public.verdicts where clash_id=(select id from public.clashes where take_id='td-take-draw')), 'DRAW', 'draw label persisted server-side');
select is((select side_a_score from public.verdicts where clash_id=(select id from public.clashes where take_id='td-take-draw')), 2, 'side A score 2');
select is((select side_b_score from public.verdicts where clash_id=(select id from public.clashes where take_id='td-take-draw')), 2, 'side B score 2');
select is((select jury_size from public.verdicts where clash_id=(select id from public.clashes where take_id='td-take-draw')), 4, 'jury size 4');
select is((select margin from public.verdicts where clash_id=(select id from public.clashes where take_id='td-take-draw')), 0, 'margin 0');

-- no winner reward in either direction, no winner coins
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-draw') and kind='clash_win'), 0, 'draw awards no clash_win (no side wins)');
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-draw') and kind='clash_dissent'), 0, 'draw awards no dissent');
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-draw') and kind='clash_participation'), 4, 'draw keeps 4 participation events');
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-draw')), 4, 'draw writes exactly 4 ledger rows');
select is((select coalesce(sum(coins_delta),0)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-draw')), 0, 'draw awards no coins');
select is((select reputation from public.profiles where id='td-j1'), 15, 'A voter gets participation only');
select is((select coins from public.profiles where id='td-j1'), 0, 'A voter gets no coins');
select is((select reputation from public.profiles where id='td-j3'), 15, 'B voter gets participation only');
select is((select coins from public.profiles where id='td-j3'), 0, 'B voter gets no coins');
select is((select streak from public.profiles where id='td-j1'), 0, 'draw does not touch streak');

-- draw still notifies both debaters, and jurors, without naming a winner
select is((select count(*)::int from public.notifications where entity_id=(select id from public.clashes where take_id='td-take-draw') and kind='clash_result'), 2, 'draw notifies both debaters');
select is((select count(*)::int from public.notifications where entity_id=(select id from public.clashes where take_id='td-take-draw') and kind='reputation'), 4, 'juror reputation notifications');

-- idempotent re-settlement: one verdict, no duplicate ledger rows, no double reward
select lives_ok($$ select public.settle_clash((select id from public.clashes where take_id='td-take-draw')) $$, 're-settle draw clash');
reset role;
select is((select count(*)::int from public.verdicts where clash_id=(select id from public.clashes where take_id='td-take-draw')), 1, 're-settle keeps exactly one verdict');
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-draw')), 4, 're-settle writes no duplicate ledger rows');
select is((select reputation from public.profiles where id='td-j1'), 15, 're-settle awards no duplicate reputation');

-- ── B majority still settles B ──────────────────────────────────────────────
select lives_ok($$ select public.settle_clash((select id from public.clashes where take_id='td-take-bwin')) $$, 'settle B-majority clash');
reset role;
select is((select winner_side::text from public.verdicts where clash_id=(select id from public.clashes where take_id='td-take-bwin')), 'B', 'B majority settles B');
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-bwin')), 6, 'B-win keeps 6 ledger rows');
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-bwin') and kind='clash_win'), 2, 'B-win keeps 2 win events');
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-bwin') and kind='clash_dissent'), 1, 'B-win keeps 1 dissent event');
select is((select coalesce(sum(coins_delta),0)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-bwin')), 98, 'B-win coin contract unchanged');

-- ── A majority still settles A ──────────────────────────────────────────────
select lives_ok($$ select public.settle_clash((select id from public.clashes where take_id='td-take-awin')) $$, 'settle A-majority clash');
reset role;
select is((select winner_side::text from public.verdicts where clash_id=(select id from public.clashes where take_id='td-take-awin')), 'A', 'A majority settles A');
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-awin')), 6, 'A-win keeps 6 ledger rows');
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-awin') and kind='clash_win'), 2, 'A-win keeps 2 win events');
select is((select coalesce(sum(coins_delta),0)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='td-take-awin')), 98, 'A-win coin contract unchanged');

select * from finish();
rollback;


