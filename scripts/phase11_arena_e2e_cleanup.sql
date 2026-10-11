-- ============================================================================
-- Phase 11 — optional cleanup for durable E2E artifacts (LOCAL DOCKER ONLY)
-- ----------------------------------------------------------------------------
-- Removes ONLY harness-owned objects / identities created by
-- scripts/phase11_arena_e2e_validation.sql when run with
-- app.phase11_e2e_persist=1, plus leftover Step 2D objects if still present.
--
-- Does NOT truncate product tables, drop migrations, reset volumes, or touch
-- non-e2e accounts.
--
-- Requires the same allow GUC as the validation harness:
--   SELECT set_config('app.phase11_e2e_allow','local-docker', false);
--
-- Review the SELECT preview section before the destructive block runs.
-- ============================================================================

\set ON_ERROR_STOP on

do $guard$
begin
  if coalesce(current_setting('app.phase11_e2e_allow', true), '') is distinct from 'local-docker' then
    raise exception
      'phase11 cleanup refused: set app.phase11_e2e_allow=local-docker first'
      using errcode = '42501';
  end if;
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception 'phase11 cleanup refused: unexpected role %', current_user using errcode = '42501';
  end if;
end;
$guard$;

-- Preview (always)
select 'preview_auth_users' as section, id::text, email
from auth.users
where id in (
  '00000000-0000-4000-e2e0-0000000000a1',
  '00000000-0000-4000-e2e0-0000000000b2',
  '00000000-0000-4000-e2e0-0000000000c3'
)
   or email ilike 'e2e.%.phase11@clash.local';

select 'preview_report_table' as section,
       to_regclass('public._phase11_e2e_report')::text as report_table,
       to_regprocedure('public._phase11_e2e_note(text,text,text,text,text,text)')::text as note_fn;

-- Require a second explicit confirm GUC before deletes.
do $confirm$
begin
  if coalesce(current_setting('app.phase11_e2e_cleanup_confirm', true), '') is distinct from 'yes' then
    raise exception
      'phase11 cleanup preview only: re-run after set_config(''app.phase11_e2e_cleanup_confirm'',''yes'', false)'
      using errcode = 'P0001';
  end if;
end;
$confirm$;

begin;

-- Drop harness report helpers first (Step 2D leftover SECURITY DEFINER included).
drop function if exists public._phase11_e2e_note(text, text, text, text, text, text);
drop table if exists public._phase11_e2e_report;

-- Delete auth users (cascade/trigger should remove matching profiles).
delete from auth.users
where id in (
  '00000000-0000-4000-e2e0-0000000000a1',
  '00000000-0000-4000-e2e0-0000000000b2',
  '00000000-0000-4000-e2e0-0000000000c3'
)
   or email ilike 'e2e.%.phase11@clash.local';

-- Orphan profile cleanup if trigger did not cascade (profiles keyed by auth_user_id).
delete from public.profiles
where auth_user_id in (
  '00000000-0000-4000-e2e0-0000000000a1',
  '00000000-0000-4000-e2e0-0000000000b2',
  '00000000-0000-4000-e2e0-0000000000c3'
)
   or handle like 'e2e_p11_%'
   or handle like 'e2ea_%'
   or handle like 'e2eb_%'
   or handle like 'e2ej_%';

commit;

select 'cleanup_complete' as status, now() as at;
