-- FUTURE DISPOSABLE ENVIRONMENT ONLY. Never executed during Step 5K.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_user <> 'supabase_admin' OR current_database() <> 'postgres' THEN
   RAISE EXCEPTION 'Unexpected bootstrap identity'; END IF;
 IF NOT EXISTS (SELECT FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
   JOIN pg_roles r ON r.oid=e.extowner WHERE e.extname='pgcrypto' AND e.extversion='1.3'
   AND n.nspname='extensions' AND r.rolname='supabase_admin') THEN
   RAISE EXCEPTION 'Managed pgcrypto prerequisite differs'; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='postgres' AND NOT rolsuper) THEN
   RAISE EXCEPTION 'Migration identity must not be superuser'; END IF;
 IF EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='pg_catalog' AND p.proname IN ('pg_read_file','pg_read_binary_file')
   AND has_function_privilege('postgres',p.oid,'EXECUTE'))
   OR pg_has_role('postgres','pg_read_server_files','MEMBER') THEN
   RAISE EXCEPTION 'Unexpected migration file-reading privilege'; END IF;
END $$;
-- Managed extensions installed only in a NEW disposable target. No role/grant changes.
-- Avoid redundant CREATE EXTENSION hook invocation for already-installed extensions.
SELECT command FROM (VALUES
 ('postgis','CREATE EXTENSION postgis WITH SCHEMA extensions'),
 ('pg_cron','CREATE EXTENSION pg_cron'),
 ('pgtap','CREATE EXTENSION pgtap WITH SCHEMA extensions'),
 ('dblink','CREATE EXTENSION dblink WITH SCHEMA extensions')
) AS required(name,command) WHERE NOT EXISTS (SELECT FROM pg_extension WHERE extname=required.name)
\gexec
SELECT version(), current_database(), current_user;
SELECT e.extname, e.extversion, n.nspname, r.rolname
 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace JOIN pg_roles r ON r.oid=e.extowner
 WHERE e.extname IN ('pgcrypto','postgis','pg_cron','pgtap','dblink') ORDER BY e.extname;
