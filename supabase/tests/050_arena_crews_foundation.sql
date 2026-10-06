-- Phase A: Arena Crews foundation (pgTAP)
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_table('public', 'arena_crews', 'arena_crews exists');
select has_table('public', 'arena_crew_memberships', 'memberships exist');
select has_table('public', 'arena_crew_follows', 'follows exist');
select has_table('public', 'arena_crew_invites', 'invites exist');
select has_table('public', 'arena_crew_join_requests', 'join requests exist');
select has_table('public', 'arena_crew_leave_cooldowns', 'leave cooldowns exist');

select has_function('public', 'create_arena_crew', 'create_arena_crew exists');
select has_function('public', 'join_arena_crew', 'join_arena_crew exists');
select has_function('public', 'leave_arena_crew', 'leave_arena_crew exists');
select has_function('public', 'follow_arena_crew', 'follow_arena_crew exists');
select has_function('public', 'invite_to_arena_crew', 'invite_to_arena_crew exists');
select has_function('public', 'request_arena_crew_join', 'request_arena_crew_join exists');
select has_function('public', 'list_arena_crews', 'list_arena_crews exists');

select is(
  has_table_privilege('authenticated', 'public.arena_crews', 'INSERT'),
  false,
  'clients cannot insert crews directly'
);
select is(
  has_table_privilege('authenticated', 'public.arena_crew_memberships', 'INSERT'),
  false,
  'clients cannot insert memberships directly'
);
select is(
  has_table_privilege('authenticated', 'public.arena_crew_invites', 'INSERT'),
  false,
  'clients cannot insert invites directly'
);

select ok(
  'Tech' = any (public.arena_crew_specialty_vocabulary()),
  'specialty vocabulary includes Tech'
);

select * from finish();
rollback;
