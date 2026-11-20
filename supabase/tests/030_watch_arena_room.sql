-- Explicit spectator room selection.

begin;
select plan(5);

select has_function('public', 'watch_arena_room', 'watch_arena_room exists');

select is(
  has_function_privilege('authenticated', 'public.watch_arena_room(text)', 'EXECUTE'),
  true,
  'authenticated can watch a room'
);

select is(
  has_function_privilege('anon', 'public.watch_arena_room(text)', 'EXECUTE'),
  false,
  'anon cannot watch a room'
);

select throws_ok(
  $$ select public.watch_arena_room('nope-room') $$,
  '42501',
  'sign in to watch a room',
  'unsigned watch raises 42501'
);

select ok(
  pg_get_functiondef('public.watch_arena_room(text)'::regprocedure)
    not ilike '%participant_count = participant_count + 1%',
  'watching a room never increments debater capacity'
);

select * from finish();
rollback;
