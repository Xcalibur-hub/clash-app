-- ============================================================================
-- Blind Clash tests (pgTAP): masking, reveal rules, STANDARD unchanged.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000601'),
  ('00000000-0000-0000-0000-000000000602'),
  ('00000000-0000-0000-0000-000000000603'),
  ('00000000-0000-0000-0000-000000000604'),
  ('00000000-0000-0000-0000-000000000605');

update public.profiles set id = 'bl-a', handle = 'bl_a', name = 'Blind A', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000601';
update public.profiles set id = 'bl-b', handle = 'bl_b', name = 'Blind B', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000602';
update public.profiles set id = 'bl-c', handle = 'bl_c', name = 'Blind C', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000603';
update public.profiles set id = 'bl-d', handle = 'bl_d', name = 'Blind D', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000604';
update public.profiles set id = 'bl-e', handle = 'bl_e', name = 'Blind E', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000605';

insert into public.takes (id, author_id, hood, text, status, created_at, expires_at) values
  ('bl-take-std',   'bl-a', 'techtakes', 'standard take', 'active', now(), now() + interval '12 hours'),
  ('bl-take-blind', 'bl-a', 'techtakes', 'blind take argument', 'active', now(), now() + interval '12 hours'),
  ('bl-take-ms',    'bl-a', 'techtakes', 'blind mindshift take', 'active', now(), now() + interval '12 hours');

insert into public.comments (id, take_id, author_id, text) values
  ('bl-c-std',   'bl-take-std',   'bl-b', 'standard rebuttal'),
  ('bl-c-blind', 'bl-take-blind', 'bl-b', 'blind rebuttal argument'),
  ('bl-c-ms',    'bl-take-ms',    'bl-b', 'mindshift rebuttal');

select has_function('public', 'clash_view', 'clash_view exists');
select has_function('public', 'clash_view_for_take', 'clash_view_for_take exists');
select is(has_column_privilege('authenticated', 'public.clashes', 'challenger_id', 'SELECT'), false, 'authenticated cannot select challenger_id');
select is(has_column_privilege('anon', 'public.clashes', 'challenger_id', 'SELECT'), false, 'anon cannot select challenger_id');
select is(has_column_privilege('authenticated', 'public.clashes', 'challenger_comment_id', 'SELECT'), false, 'authenticated cannot select challenger_comment_id');
select is(has_column_privilege('authenticated', 'public.clashes', 'id', 'SELECT'), true, 'authenticated can select clash id');
select is(has_function_privilege('anon', 'public.clash_view(text)', 'EXECUTE'), true, 'anon may call clash_view');
select is(has_function_privilege('anon', 'public.start_clash(text,text,clash_mode)', 'EXECUTE'), false, 'anon cannot start a clash');

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Legacy competition creation is revoked (20261111120200_beta_legacy_visibility),
-- so this temp constructor builds the identical non-duel Clash that start_clash
-- used to produce -- 'open' over the Take's own window, carrying mode and
-- challenger comment, no duel_key, no room -- keeping these BLIND/STANDARD
-- assertions meaningful rather than stubbing them. Admission denial against the
-- real entry point is asserted just above.
create function pg_temp.legacy_start_clash(
  p_take_id text, p_comment_id text, p_challenger text,
  p_mode public.clash_mode default 'STANDARD')
returns void language sql as $$
  insert into public.clashes
    (id, take_id, challenger_id, challenger_comment_id, status, mode, opens_at, closes_at)
  select 'cl_legacy_' || t.id, t.id, p_challenger, p_comment_id, 'open',
         coalesce(p_mode, 'STANDARD'), now(), t.expires_at
    from public.takes t where t.id = p_take_id;
  select public.clash_notify(t.author_id, p_challenger, 'clash_started', 'cl_legacy_' || t.id)
    from public.takes t where t.id = p_take_id;
$$;

-- ── STANDARD default unchanged ──────────────────────────────────────────────
select lives_ok($$ select pg_temp.legacy_start_clash('bl-take-std', 'bl-c-std', 'bl-b') $$, 'standard clash starts with two-arg call');

select is(
  (select mode::text from public.clashes where take_id = 'bl-take-std'),
  'STANDARD',
  'default mode remains STANDARD'
);

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.clash_view_for_take('bl-take-std') ->> 'revealed', 'true', 'standard clash is revealed to a guest');
select is(public.clash_view_for_take('bl-take-std') #>> '{sideA,handle}', 'bl_a', 'standard clash returns side A handle');
select is(public.clash_view_for_take('bl-take-std') #>> '{sideB,handle}', 'bl_b', 'standard clash returns side B handle');
reset role;

-- ── Blind creation ──────────────────────────────────────────────────────────
select lives_ok($$ select pg_temp.legacy_start_clash('bl-take-blind', 'bl-c-blind', 'bl-b', 'BLIND') $$, 'blind clash creation works');
select lives_ok($$ select pg_temp.legacy_start_clash('bl-take-ms', 'bl-c-ms', 'bl-b', 'BLIND') $$, 'second blind clash for mindshift');

select is((select mode::text from public.clashes where take_id = 'bl-take-blind'), 'BLIND', 'stored mode is BLIND');

-- ── Guest / unjudged: no identity ───────────────────────────────────────────
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.clash_view_for_take('bl-take-blind') ->> 'revealed', 'false', 'guest does not get identities on an open blind clash');
select is(public.clash_view_for_take('bl-take-blind') ->> 'sideAText', 'blind take argument', 'guest still sees side A argument');
select is(public.clash_view_for_take('bl-take-blind') ->> 'sideBText', 'blind rebuttal argument', 'guest still sees side B argument');
select is(public.clash_view_for_take('bl-take-blind') -> 'sideA', 'null'::jsonb, 'guest side A participant is null');
select is(public.clash_view_for_take('bl-take-blind') -> 'sideB', 'null'::jsonb, 'guest side B participant is null');
select is(public.clash_view_for_take('bl-take-blind') ? 'challengerId', false, 'clash_view has no challengerId key');
select is(public.clash_view_for_take('bl-take-blind') #>> '{sideA,id}', null, 'no nested side A id');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000603","role":"authenticated"}', true);
select is(public.clash_view_for_take('bl-take-blind') ->> 'revealed', 'false', 'unjudged viewer does not receive identity');
select is(public.clash_view_for_take('bl-take-blind') -> 'sideB', 'null'::jsonb, 'unjudged viewer has no side B participant');
select is(public.clash_view_for_take('bl-take-blind') ->> 'mayJudge', 'true', 'eligible viewer may judge');
select throws_ok(
  $$ select challenger_id from public.clashes where take_id = 'bl-take-blind' $$,
  '42501', null, 'raw table read cannot select hidden challenger_id'
);
reset role;

-- ── Participants see the matchup ────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}', true);
select is(public.clash_view_for_take('bl-take-blind') ->> 'revealed', 'true', 'author sees identities');
select is(public.clash_view_for_take('bl-take-blind') #>> '{sideB,id}', 'bl-b', 'author sees the challenger');
select is(public.clash_view_for_take('bl-take-blind') ->> 'mayJudge', 'false', 'author cannot judge');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000602","role":"authenticated"}', true);
select is(public.clash_view_for_take('bl-take-blind') ->> 'revealed', 'true', 'challenger sees identities');
select is(public.clash_view_for_take('bl-take-blind') #>> '{sideA,id}', 'bl-a', 'challenger sees the author');
reset role;

-- ── After judgement, C is revealed; D is not ────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000603","role":"authenticated"}', true);
select lives_ok(
  $$ select public.submit_judgement((select id from public.clashes where take_id = 'bl-take-blind'), 'A') $$,
  'C judges the blind clash'
);
select lives_ok(
  $$ select public.submit_judgement((select id from public.clashes where take_id = 'bl-take-blind'), 'B') $$,
  'a second submit is a no-op (one ballot per juror)'
);
select is(public.clash_view_for_take('bl-take-blind') ->> 'revealed', 'true', 'viewer who judged receives identities');
select is(public.clash_view_for_take('bl-take-blind') #>> '{sideA,handle}', 'bl_a', 'judged viewer sees author handle');
select is(public.clash_view_for_take('bl-take-blind') ->> 'hasJudged', 'true', 'ballot is recorded');
select is(public.clash_view_for_take('bl-take-blind') ->> 'myBallot', 'A', 'locked ballot side is A');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000604","role":"authenticated"}', true);
select is(public.clash_view_for_take('bl-take-blind') ->> 'revealed', 'false', 'D still does not see identities');
select is(public.clash_view_for_take('bl-take-blind') -> 'sideA', 'null'::jsonb, 'D has no side A participant');
reset role;

-- Profile history: stranger D must not see the open Blind matchup on A
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000604","role":"authenticated"}', true);
select is(
  (select jsonb_array_length(public.profile_clash_list('bl-a'))),
  1,
  'stranger profile history omits open Blind clashes (only the STANDARD one remains)'
);
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}', true);
select ok(
  public.profile_clash_list('bl-a')::text like '%bl-take-blind%',
  'participant still sees their own open Blind clash on their profile'
);
reset role;

-- ── Settle: D now sees identities; economy unchanged ────────────────────────
update public.clashes
   set opens_at = now() - interval '2 hours',
       closes_at = now() - interval '1 second'
 where take_id = 'bl-take-blind';

select lives_ok(
  $$ select public.settle_clash((select id from public.clashes where take_id = 'bl-take-blind')) $$,
  'blind clash settles'
);

select is((select status::text from public.clashes where take_id = 'bl-take-blind'), 'settled', 'status is settled');
select is((select winner_side::text from public.verdicts v join public.clashes c on c.id = v.clash_id where c.take_id = 'bl-take-blind'), 'A', 'verdict is unchanged A');
select is((select reputation_delta from public.reputation_events e join public.clashes c on c.id = e.clash_id where c.take_id = 'bl-take-blind' and e.kind = 'clash_win' and e.profile_id = 'bl-c'), 105, 'win reward is unchanged');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000604","role":"authenticated"}', true);
select is(public.clash_view_for_take('bl-take-blind') ->> 'revealed', 'true', 'settled Blind Clash reveals identities to D');
select is(public.clash_view_for_take('bl-take-blind') #>> '{sideB,handle}', 'bl_b', 'D sees challenger after settlement');
reset role;

-- ── Mindshift still works on a Blind Clash take ─────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000603","role":"authenticated"}', true);
select is(public.record_initial_stance('bl-take-ms', 'UNSURE') ->> 'initialStance', 'UNSURE', 'initial stance on a blind take');
select is(public.record_final_stance('bl-take-ms', 'AGREE') ->> 'changed', 'true', 'final stance on a blind take');
select is((public.mindshift_stats('bl-take-ms') ->> 'changedCount')::int, 1, 'mindshift aggregate works beside Blind Clash');
select is(public.clash_view_for_take('bl-take-ms') -> 'sideA', 'null'::jsonb, 'mindshift does not reveal blind identity');
reset role;

select * from finish();
rollback;
