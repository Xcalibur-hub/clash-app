-- ============================================================================
-- Take reactions tests (pgTAP): the server-authoritative reaction toggle.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures: author (t-a), reactor (t-b), blocked author (t-c).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');

update public.profiles set id = 't-a', handle = 'reaction_a', name = 'Reaction A', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set id = 't-b', handle = 'reaction_b', name = 'Reaction B', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set id = 't-c', handle = 'reaction_c', name = 'Reaction C', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000c';

insert into public.takes (id, author_id, hood, text, status, created_at, expires_at) values
  ('t-live',    't-a', 'techtakes', 'live take',    'active',  now(),                     now() + interval '12 hours'),
  ('t-expired', 't-a', 'techtakes', 'expired take', 'active',  now() - interval '2 hours', now() - interval '1 hour'),
  ('t-removed', 't-a', 'techtakes', 'removed take', 'removed', now(),                     now() + interval '12 hours'),
  ('t-blocked', 't-c', 'techtakes', 'blocked take', 'active',  now(),                     now() + interval '12 hours');

-- t-b blocks t-c: a block in either direction refuses the interaction.
insert into public.blocks (blocker_id, blocked_id) values ('t-b', 't-c');

-- schema + privileges
select has_table('public', 'take_reactions', 'take_reactions table');
select has_function('public', 'toggle_take_reaction', 'toggle_take_reaction exists');
select is(has_table_privilege('authenticated', 'public.take_reactions', 'INSERT'), false, 'no client INSERT on take_reactions');
select is(has_table_privilege('authenticated', 'public.take_reactions', 'DELETE'), false, 'no client DELETE on take_reactions');
select is(has_table_privilege('authenticated', 'public.take_reactions', 'UPDATE'), false, 'no client UPDATE on take_reactions');
select is(has_table_privilege('anon', 'public.take_reactions', 'SELECT'), false, 'anon cannot read reactions');
select is(has_function_privilege('anon', 'public.toggle_take_reaction(text)', 'EXECUTE'), false, 'anon cannot execute the RPC');
select is(has_function_privilege('authenticated', 'public.toggle_take_reaction(text)', 'EXECUTE'), true, 'authenticated can execute the RPC');

-- unauthenticated
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.toggle_take_reaction('t-live') $$, '42501', null, 'anon cannot react');
reset role;

-- happy path (t-b)
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is(public.toggle_take_reaction('t-live') ->> 'reacted', 'true', 'first toggle adds a reaction');
select is((select reactions_count from public.takes where id = 't-live'), 1, 'reactions_count incremented exactly once');
select is((select count(*)::int from public.take_reactions where take_id = 't-live'), 1, 'exactly one reaction row');
select is((select user_id from public.take_reactions where take_id = 't-live'), 't-b', 'reaction attributed to the caller');
select is(public.toggle_take_reaction('t-live') ->> 'reacted', 'false', 'second toggle removes the reaction');
select is((select reactions_count from public.takes where id = 't-live'), 0, 'reactions_count decremented exactly once');
select is((select count(*)::int from public.take_reactions where take_id = 't-live'), 0, 'reaction row removed');

-- raw client writes denied
select throws_ok($$ insert into public.take_reactions (take_id, user_id) values ('t-live', 't-a') $$, '42501', null, 'client cannot insert a raw reaction');
select throws_ok($$ delete from public.take_reactions where take_id = 't-live' $$, '42501', null, 'client cannot delete a raw reaction');
select throws_ok($$ update public.takes set reactions_count = 999 where id = 't-live' $$, '42501', null, 'client cannot write reactions_count');

-- validity rules
select throws_ok($$ select public.toggle_take_reaction('nope') $$, 'P0002', null, 'missing take rejected');
select throws_ok($$ select public.toggle_take_reaction('t-expired') $$, 'P0004', null, 'expired take cannot be reacted to');
select throws_ok($$ select public.toggle_take_reaction('t-removed') $$, 'P0003', null, 'removed take cannot be reacted to');
select throws_ok($$ select public.toggle_take_reaction('t-blocked') $$, 'P0005', null, 'blocked interaction rejected');
reset role;

-- one reaction per profile per take (primary key enforces it)
insert into public.take_reactions (take_id, user_id) values ('t-live', 't-a');
select throws_ok($$ insert into public.take_reactions (take_id, user_id) values ('t-live', 't-a') $$, '23505', null, 'duplicate reaction impossible');
delete from public.take_reactions where take_id = 't-live' and user_id = 't-a';
select is((select reactions_count from public.takes where id = 't-live'), 0, 'aggregate never goes negative');

-- the counter itself can never be negative
select throws_ok($$ update public.takes set reactions_count = -1 where id = 't-live' $$, '23514', null, 'reactions_count cannot go negative');

-- rate limit: 120 / 10 minutes (see 0006's central table)
insert into public.rate_limit_events (actor_id, action, occurred_at)
  select 't-b', 'take_reaction', now() from generate_series(1, 120);
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ select public.toggle_take_reaction('t-live') $$, 'P0001', null, 'reaction rate limit enforced');
reset role;
select is((select reactions_count from public.takes where id = 't-live'), 0, 'rate-limited attempt left the count untouched');

select * from finish();
rollback;
