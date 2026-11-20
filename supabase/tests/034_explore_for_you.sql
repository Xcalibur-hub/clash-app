-- ============================================================================
-- Explore For You + Live (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'get_explore_for_you', 'for you exists');
select has_function('public', 'get_explore_live', 'live feed exists');

select ok(
  public.get_explore_for_you(10, 0) ? 'items',
  'for you returns items envelope'
);

select ok(
  public.get_explore_live(10) ? 'topics',
  'live returns topics envelope'
);

select ok(
  public.search_explore('tech', 10) ? 'hoods',
  'search includes hoods group'
);

-- Vault preview security still holds through for-you path
select ok(
  (public.get_explore_for_you(40, 0)::text) not like '%subscriber%',
  'for you payload does not advertise subscriber access'
);

select * from finish();
rollback;
