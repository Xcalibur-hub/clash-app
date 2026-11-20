-- ============================================================================
-- CLASH cloud wrapper — step 2 of 119
-- version           : 20260926130000
-- ledger name       : auth_profile_trigger
-- mode              : direct
-- executed source   : supabase/migrations/20260926130000_auth_profile_trigger.sql
-- executed sha256   : 482469bd8112d7be201edd961f8ce4a046eb20e809018c5ae78e758a4e761387
-- normalisation     : none
-- normalized sha256 : 482469bd8112d7be201edd961f8ce4a046eb20e809018c5ae78e758a4e761387
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- A server-side error before COMMIT aborts the transaction, so neither the
-- schema change nor its ledger row survives. A connection lost around COMMIT
-- can leave the outcome unknown, which is why the runner classifies it from
-- the ledger instead of claiming a rollback.
--
-- CONCURRENCY (Round 8): the ledger insert has NO conflict clause. If a row for
-- this version already exists, the insert raises unique_violation, the whole
-- transaction aborts and no statement of the migration survives. An
-- 'on conflict do nothing' would have skipped the row while re-executing the
-- migration body - the one case the read-back could not detect.
-- ============================================================================
begin;

-- ============================================================================
-- CLASH 2.0 · 0002 — automatic profile creation
-- ----------------------------------------------------------------------------
-- Every Supabase Auth sign-up writes exactly one row into public.profiles, with
-- no manual SQL step. The public handle is temporary and random (`user_XXXXXX`);
-- it is never derived from the email, and no client-supplied value is trusted.
--
--   security definer : the trigger fires inside the auth.users insert
--                      transaction, where the inserting role (supabase_auth_admin)
--                      has no write access to public.profiles. Definer rights run
--                      it as its owner (postgres) — the only privilege that adds
--                      is the ability to create the profile row. It can therefore
--                      never be used to create an elevated user: role, rank,
--                      reputation, coins and moderation data are hard-coded here.
--   search_path = '' : pins every name; public.profiles is fully qualified and
--                      nothing resolves through a caller-controlled path.
--   safe defaults    : role 'viewer', moderated_hoods '{}', reputation 0,
--                      coins 50, streak 0, rank 'Rookie'. Nothing is read from
--                      raw_user_meta_data or the email address.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      text;
  v_handle  text;
  v_tint    text;
  v_attempt integer := 0;
begin
  -- Opaque profile id derived from the auth uid only: unique by construction,
  -- never from the email and never client-supplied.
  v_id := 'u_' || replace(new.id::text, '-', '');

  -- A random tint from the product palette, not a client choice.
  v_tint := (array['#FF6A3D', '#A580FF', '#3D8BFF', '#22C55E'])[1 + floor(random() * 4)::int];

  -- Temporary unique handle: `user_` + 6 hex chars. Retry on the rare collision.
  loop
    v_handle := 'user_' || lower(substr(md5(new.id::text || v_attempt::text || clock_timestamp()::text), 1, 6));

    begin
      insert into public.profiles
        (id, auth_user_id, handle, name, avatar_tint, role, moderated_hoods,
         reputation, coins, streak, rank)
      values
        (v_id, new.id, v_handle, 'Challenger', v_tint, 'viewer', '{}',
         0, 50, 0, 'Rookie');
      exit;
    exception
      when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt > 20 then
          raise;
        end if;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20260926130000',
  'auth_profile_trigger',
  array['sha256:482469bd8112d7be201edd961f8ce4a046eb20e809018c5ae78e758a4e761387'],
  'clash-cloud-wrapper-v1'
);

commit;
