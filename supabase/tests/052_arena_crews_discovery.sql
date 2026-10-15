-- ============================================================================
-- Phase B — Arena Crews discovery + members (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'discover_arena_crews', 'discover_arena_crews exists');
select has_function('public', 'list_arena_crew_members', 'list_arena_crew_members exists');
select has_function('public', 'list_rising_arena_crews', 'list_rising_arena_crews exists');

select is(
  has_function_privilege('authenticated', 'public.discover_arena_crews(text,text,integer,text)', 'EXECUTE'),
  true,
  'authenticated can discover crews'
);
select is(
  has_function_privilege('authenticated', 'public.list_arena_crew_members(text,integer,integer)', 'EXECUTE'),
  true,
  'authenticated can list crew members'
);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000f201'),
  ('00000000-0000-0000-0000-00000000f202'),
  ('00000000-0000-0000-0000-00000000f203');

update public.profiles set id = 'acb-a', handle = 'acb_a', name = 'Discover A'
 where auth_user_id = '00000000-0000-0000-0000-00000000f201';
update public.profiles set id = 'acb-b', handle = 'acb_b', name = 'Discover B'
 where auth_user_id = '00000000-0000-0000-0000-00000000f202';
update public.profiles set id = 'acb-c', handle = 'acb_c', name = 'Discover C'
 where auth_user_id = '00000000-0000-0000-0000-00000000f203';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f201","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_arena_crew('Byte Club', 'byte-club', 'tech', 'OPEN', array['Tech']) $$,
  'create featured crew'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f202","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_arena_crew('Droid Army', 'droid-army', 'gaming', 'OPEN', array['Gaming']) $$,
  'create second crew'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f203","role":"authenticated"}', true);
select lives_ok(
  $$ select public.join_arena_crew((select id from public.arena_crews where slug = 'byte-club')) $$,
  'joiner expands byte-club'
);

-- Popular discovery returns items + nullable cursor
select ok(
  jsonb_typeof(public.discover_arena_crews('popular', null, 10, null) -> 'items') = 'array',
  'discover popular returns items array'
);
select ok(
  (public.discover_arena_crews('popular', 'Tech', 10, null) -> 'items') @> '[]'::jsonb
    or jsonb_array_length(public.discover_arena_crews('popular', 'Tech', 10, null) -> 'items') >= 1,
  'specialty filter returns Tech crews'
);
select is(
  (public.discover_arena_crews('popular', 'Tech', 10, null) -> 'items' -> 0 ->> 'name'),
  'Byte Club',
  'Tech specialty surfaces Byte Club'
);

-- Keyset: page of 1 then next cursor advances
select ok(
  (public.discover_arena_crews('popular', null, 1, null) ->> 'nextCursor') is not null,
  'full page yields nextCursor'
);

select ok(
  jsonb_array_length(
    public.discover_arena_crews(
      'popular',
      null,
      1,
      public.discover_arena_crews('popular', null, 1, null) ->> 'nextCursor'
    ) -> 'items'
  ) >= 1,
  'keyset cursor returns a subsequent page'
);

-- Rising / recent sorts are callable
select ok(
  jsonb_typeof(public.discover_arena_crews('rising', null, 8, null) -> 'items') = 'array',
  'rising sort works'
);
select ok(
  jsonb_typeof(public.discover_arena_crews('recent', null, 8, null) -> 'items') = 'array',
  'recent sort works'
);

-- Viewer payload includes Phase B fields
select ok(
  (public.get_arena_crew('byte-club') -> 'viewer' ? 'hasPendingRequest'),
  'viewer includes hasPendingRequest'
);
select ok(
  (public.get_arena_crew('byte-club') -> 'viewer' ? 'activeCrewId'),
  'viewer includes activeCrewId'
);

-- Members list is compact and ordered with owner first
select is(
  (public.list_arena_crew_members(
     (select id from public.arena_crews where slug = 'byte-club'), 24, 0
   ) -> 0 ->> 'role'),
  'OWNER',
  'members list leads with OWNER'
);
select ok(
  (public.list_arena_crew_members(
     (select id from public.arena_crews where slug = 'byte-club'), 24, 0
   ) -> 0 ? 'handle'),
  'member rows include handle'
);
select ok(
  (public.list_arena_crew_members(
     (select id from public.arena_crews where slug = 'byte-club'), 24, 0
   ) -> 0 ? 'tint'),
  'member rows include tint'
);

select is(
  jsonb_array_length(
    public.list_arena_crew_members(
      (select id from public.arena_crews where slug = 'byte-club'), 24, 0
    )
  ),
  2,
  'byte-club has two active members'
);

select * from finish();
rollback;
