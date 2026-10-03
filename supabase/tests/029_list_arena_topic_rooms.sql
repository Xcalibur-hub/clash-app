-- Room discovery RPC — public capacity cards, no stance splits.

begin;
select plan(5);

select has_function('public', 'list_arena_topic_rooms', 'list_arena_topic_rooms exists');

select is(
  has_function_privilege('authenticated', 'public.list_arena_topic_rooms(text)', 'EXECUTE'),
  true,
  'authenticated can list topic rooms'
);

select is(
  has_function_privilege('anon', 'public.list_arena_topic_rooms(text)', 'EXECUTE'),
  true,
  'anon can list topic rooms'
);

select throws_ok(
  $$ select public.list_arena_topic_rooms('nope-topic') $$,
  'P0002',
  'topic does not exist',
  'missing topic raises P0002'
);

select ok(
  not exists (
    select 1
      from public.arena_daily_topics t
     cross join lateral jsonb_array_elements(
       coalesce(public.list_arena_topic_rooms(t.id) -> 'rooms', '[]'::jsonb)
     ) r
     where t.status = 'live'
       and (r ? 'stance' or r ? 'agreeCount' or r ? 'viewerStance')
  ),
  'room cards never include stance aggregates'
);

select * from finish();
rollback;
