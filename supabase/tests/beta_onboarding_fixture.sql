-- Prefix 066_arena_interest_preferences.sql inside the same transaction when
-- using a data-free schema clone. That historical suite expects at least one
-- returning account present at the original preferences-migration boundary.
begin;
insert into auth.users(id) values('00000000-0000-0000-0000-00000000bc01');
-- Exact returning-user backfill from 20261008134000, synthetic account only.
insert into public.arena_interest_preferences(auth_user_id,skipped)
  select id,true from auth.users where id='00000000-0000-0000-0000-00000000bc01';
-- The historical suite's final ROLLBACK removes this fixture as well.
