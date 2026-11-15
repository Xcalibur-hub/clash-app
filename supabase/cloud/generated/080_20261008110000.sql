-- ============================================================================
-- CLASH cloud wrapper — step 80 of 111
-- version           : 20261008110000
-- ledger name       : profile_read_security
-- mode              : direct
-- executed source   : supabase/migrations/20261008110000_profile_read_security.sql
-- executed sha256   : ba2396fd40d4d57dc4d98830119a9bfd575a25bfd8c84ee6761b4292b3418a6e
-- normalisation     : none
-- normalized sha256 : ba2396fd40d4d57dc4d98830119a9bfd575a25bfd8c84ee6761b4292b3418a6e
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- If this file fails, neither the schema change nor the ledger row survives.
-- ============================================================================
begin;

-- Public identities are readable; account linkage, balances and authority are not.
-- Keep the existing table and editable-column grants for compatibility.
revoke select on public.profiles from public, anon, authenticated;
do $$
declare v_columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_columns
  from pg_attribute where attrelid = 'public.profiles'::regclass
    and attnum > 0 and not attisdropped;
  execute 'revoke select (' || v_columns || ') on public.profiles from public, anon, authenticated';
end $$;
grant select (id, handle, name, avatar_tint, bio, home_hood, reputation, rank, streak)
  on public.profiles to anon, authenticated;

create or replace function public.get_my_profile()
returns table (
  id text, handle text, name text, avatar_tint text, bio text,
  home_hood public.hood_id, reputation integer, rank public.rank_name,
  streak integer, coins integer
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.handle, p.name, p.avatar_tint, p.bio, p.home_hood,
    p.reputation, p.rank, p.streak, p.coins
  from public.profiles p
  where auth.uid() is not null and p.auth_user_id = auth.uid();
$$;
revoke all on function public.get_my_profile() from public, anon, authenticated;
grant execute on function public.get_my_profile() to authenticated;
notify pgrst, 'reload schema';


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261008110000',
  'profile_read_security',
  array['sha256:ba2396fd40d4d57dc4d98830119a9bfd575a25bfd8c84ee6761b4292b3418a6e'],
  'clash-cloud-wrapper-v1'
)
on conflict (version) do nothing;

commit;
