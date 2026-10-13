-- H3: raw reward history is private; public profile totals/ranks are unchanged.
-- File only in Step 4E. Apply only after separately authorized DB validation.
alter table public.reputation_events enable row level security;

drop policy if exists "reputation events are readable by everyone"
  on public.reputation_events;

create policy "owners read their reputation history"
  on public.reputation_events for select to authenticated
  using (profile_id = (select public.my_profile_id()));

-- Prevent any overlapping permissive SELECT/ALL policy from widening access.
-- Trusted owner/BYPASSRLS writers keep their existing behavior, without a staff
-- exception or new definer endpoint.
create policy "reputation history owner boundary"
  on public.reputation_events as restrictive for select to authenticated
  using (profile_id = (select public.my_profile_id()));

-- Table privileges and column privileges are independent. Remove both, including
-- any explicit grants on columns added since the initial ledger definition.
revoke select on table public.reputation_events from public, anon, authenticated;
do $columns$
declare v_columns text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_columns
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.reputation_events'::regclass
      and a.attnum > 0 and not a.attisdropped;
  execute format('revoke select (%s) on public.reputation_events from public, anon, authenticated', v_columns);
end;
$columns$;

grant select (id, profile_id, clash_id, arena_room_id, kind,
  reputation_delta, coins_delta, created_at)
  on public.reputation_events to authenticated;

-- Fail closed on unreviewed inherited privileges instead of altering role
-- memberships (which could break unrelated APIs). No global grant changes.
do $privileges$
begin
  if exists (select 1 from pg_catalog.pg_roles
      where rolname in ('anon', 'authenticated') and (rolsuper or rolbypassrls))
    or has_table_privilege('anon', 'public.reputation_events', 'SELECT')
    or has_any_column_privilege('anon', 'public.reputation_events', 'SELECT')
    or has_table_privilege('authenticated', 'public.reputation_events', 'SELECT')
    or exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = 'public.reputation_events'::regclass
        and a.attnum > 0 and not a.attisdropped
        and a.attname <> all(array['id','profile_id','clash_id','arena_room_id',
          'kind','reputation_delta','coins_delta','created_at'])
        and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))
  then
    raise exception 'H3: unreviewed effective reputation_events privileges; review role inheritance before deployment';
  end if;
end;
$privileges$;

-- No INSERT/UPDATE/DELETE ACL, function ownership, trigger, award or service-role
-- privileges are changed. Existing settlement and facet synchronization remain.
notify pgrst, 'reload schema';
