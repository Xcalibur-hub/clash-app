-- READ-ONLY inspection for a FUTURE authorized DISPOSABLE attempt, after all migrations.
\set ON_ERROR_STOP on
SELECT current_database(), current_user, version();
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles ORDER BY rolname;
SELECT pg_get_userbyid(roleid) AS role, pg_get_userbyid(member) AS member, admin_option FROM pg_auth_members ORDER BY 1,2;
SELECT e.extname,e.extversion,n.nspname,pg_get_userbyid(e.extowner) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1;
SELECT nspname,pg_get_userbyid(nspowner),nspacl FROM pg_namespace WHERE nspname !~ '^pg_' ORDER BY 1;
SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,c.relacl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','auth','storage','realtime') AND c.relkind IN ('r','p','v') ORDER BY 1,2;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies ORDER BY 1,2,3;
SELECT table_schema,table_name,column_name,grantee,privilege_type FROM information_schema.column_privileges
 WHERE table_schema IN ('public','storage') ORDER BY 1,2,3,4,5;
SELECT n.nspname,p.oid::regprocedure,pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,p.proacl
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','storage','realtime') AND p.prosecdef ORDER BY 1,2;
SELECT pg_get_userbyid(defaclrole),defaclnamespace::regnamespace,defaclobjtype,defaclacl FROM pg_default_acl ORDER BY 1,2,3;
SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id;
SELECT * FROM pg_publication ORDER BY pubname;
SELECT pubname,schemaname,tablename FROM pg_publication_tables ORDER BY 1,2,3;
SELECT jobid,schedule,database,username,active FROM cron.job ORDER BY jobid;
