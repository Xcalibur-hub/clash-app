package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5"
)

const backendSQL = `select pg_backend_pid() as pid`

// Session mode must retain one backend across BEGIN/COMMIT and session SETs.
// A changed backend is an error, never a reconnect or alternate endpoint.
type boundSession struct {
	Session
	pid string
}

func bindBackend(ctx context.Context, s Session) (Session, error) {
	r, e := query(ctx, s, backendSQL)
	if e != nil || len(r.Rows) != 1 || fmt.Sprint(r.Rows[0]["pid"]) == "<nil>" {
		return s, errors.New("session backend identity unavailable")
	}
	return &boundSession{s, fmt.Sprint(r.Rows[0]["pid"])}, nil
}
func (s *boundSession) sameBackend(ctx context.Context) error {
	r, e := s.Session.Query(ctx, backendSQL)
	if e != nil || len(r.Rows) != 1 || fmt.Sprint(r.Rows[0]["pid"]) != s.pid {
		return errors.New("session backend changed; stop without retry")
	}
	return nil
}
func (s *boundSession) Query(ctx context.Context, q string, args ...any) (Result, error) {
	// An aborted transaction cannot run SELECT. Roll it back first, then verify
	// backend continuity; otherwise the guard itself would prevent safe rollback.
	if q == "rollback" || q == "rollback; reset role" {
		r, e := s.Session.Query(ctx, q, args...)
		if e != nil {
			return r, e
		}
		return r, s.sameBackend(ctx)
	}
	if e := s.sameBackend(ctx); e != nil {
		return Result{}, e
	}
	return s.Session.Query(ctx, q, args...)
}
func sessionConnector(dial Connector) Connector {
	return func(ctx context.Context, c *pgx.ConnConfig) (Session, error) {
		s, e := dial(ctx, c)
		if e != nil {
			return nil, e
		}
		guarded, e := bindBackend(ctx, s)
		if e != nil {
			cleanup, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if closeError := s.Close(cleanup); closeError != nil {
				return nil, errors.New("connection cleanup unconfirmed; stop")
			}
			return nil, e
		}
		return guarded, nil
	}
}

const availableExtensionsSQL = `select name,version,installed,superuser,trusted,relocatable,schema from pg_available_extension_versions where name in ('pgcrypto','postgis','pg_cron','pgtap','dblink') order by name,version`
const rolesSQL = `select rolname as name,rolsuper as superuser,rolinherit as inherits,rolcreaterole as create_role,rolcreatedb as create_db,rolbypassrls as bypass_rls,pg_catalog.pg_has_role(current_user,oid,'MEMBER') as member,pg_catalog.pg_has_role(current_user,oid,'USAGE') as usable from pg_roles where pg_catalog.pg_has_role(current_user,oid,'MEMBER') or rolname in ('postgres','supabase_admin','anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_storage_admin','supabase_realtime_admin','pg_read_server_files','pg_write_server_files','pg_execute_server_program') order by rolname`
const roleEdgesSQL = `select parent.rolname as granted_role,child.rolname as member_role,m.admin_option,m.inherit_option,m.set_option from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles child on child.oid=m.member where child.rolname=current_user or pg_catalog.pg_has_role(current_user,child.oid,'MEMBER') order by granted_role,member_role`
const managedSQL = `select pg_catalog.to_regclass('auth.users') is not null and pg_catalog.to_regclass('storage.objects') is not null and pg_catalog.to_regclass('storage.buckets') is not null and pg_catalog.to_regclass('realtime.messages') is not null as managed, exists(select 1 from pg_publication where pubname='supabase_realtime') as publication, exists(select 1 from pg_roles where rolname='postgres' and not rolsuper) as restricted_role, not pg_catalog.pg_has_role('postgres','pg_read_server_files','member') and not pg_catalog.pg_has_role('postgres','pg_write_server_files','member') and not pg_catalog.pg_has_role('postgres','pg_execute_server_program','member') and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='pg_catalog' and p.proname in ('pg_read_file','pg_read_binary_file') and pg_catalog.has_function_privilege('postgres',p.oid,'execute')) as restricted_files, 'pg_cron'=any(pg_catalog.string_to_array(pg_catalog.replace(pg_catalog.current_setting('shared_preload_libraries'),' ',''),',')) as cron_preloaded, pg_catalog.to_regclass('cron.job') is not null as cron_catalog`

// Exclude extension-managed public objects by pg_depend, not by guessing names.
// Fresh projects must have no non-extension public relations/routines/user types.
const objectsSQL = `select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f','S') and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')) as relations,(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')) as routines,(select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype in ('e','d') and not exists(select 1 from pg_depend d where d.classid='pg_type'::regclass and d.objid=t.oid and d.deptype='e')) as types,(select count(*) from pg_namespace n where n.nspname !~ '^pg_' and n.nspname not in ('information_schema','public','auth','storage','realtime','_realtime','extensions','graphql','graphql_public','vault','net','pgsodium','pgsodium_masks','cron','supabase_functions','supabase_migrations','_analytics') and not exists(select 1 from pg_depend d where d.classid='pg_namespace'::regclass and d.objid=n.oid and d.deptype='e')) as unexpected_schemas`
const dataSQL = `select exists(select 1 from auth.users limit 1) as users,exists(select 1 from storage.objects limit 1) as objects,exists(select 1 from storage.buckets limit 1) as buckets`
const cronSQL = `select exists(select 1 from cron.job limit 1) as jobs`

func preflight(ctx context.Context, s Session) (report map[string]any, err error) {
	report = map[string]any{"database_security_passed": false}
	if _, e := query(ctx, s, "begin read only"); e != nil {
		return report, e
	}
	defer func() {
		c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, e := s.Query(c, "rollback"); e != nil {
			err = errors.New("read-only rollback unconfirmed; stop")
		}
	}()
	diagnostics, identityError := inspectIdentity(ctx, s)
	report["identity_gate"] = diagnostics
	if identityError != nil {
		return report, identityError
	}
	// Only catalog fields, relevant role memberships and existence/counts are recorded.
	// No user records, function bodies, role settings, SQL text or connection secrets.
	for _, item := range []struct{ name, q string }{
		{"installed_extensions", extensionsSQL}, {"available_extensions", availableExtensionsSQL}, {"roles", rolesSQL}, {"role_inheritance", roleEdgesSQL}, {"managed", managedSQL}, {"application_objects", objectsSQL}, {"existing_data", dataSQL},
	} {
		result, e := query(ctx, s, item.q)
		if e != nil {
			return report, e
		}
		report[item.name] = result.Rows
	}
	installed := report["installed_extensions"].([]map[string]any)
	valid := false
	for _, v := range installed {
		if v["name"] == "pgcrypto" && v["version"] == "1.3" && v["schema"] == "extensions" && v["owner"] == "supabase_admin" {
			valid = true
		}
	}
	if !valid {
		return report, errors.New("managed pgcrypto prerequisite mismatch")
	}
	available := map[string]bool{}
	for _, v := range report["available_extensions"].([]map[string]any) {
		available[fmt.Sprint(v["name"])] = true
	}
	for _, name := range []string{"pgcrypto", "postgis", "pg_cron", "pgtap", "dblink"} {
		if !available[name] {
			return report, errors.New("required extension unavailable: " + name)
		}
	}
	managed := report["managed"].([]map[string]any)
	if len(managed) != 1 {
		return report, errors.New("managed prerequisite missing")
	}
	for _, k := range []string{"managed", "publication", "restricted_role", "restricted_files", "cron_preloaded"} {
		if managed[0][k] != true {
			return report, errors.New("managed prerequisite refused: " + k)
		}
	}
	roles := report["roles"].([]map[string]any)
	required := map[string]bool{"postgres": false, "supabase_admin": false, "anon": false, "authenticated": false, "service_role": false, "authenticator": false, "supabase_auth_admin": false, "supabase_storage_admin": false}
	for _, v := range roles {
		if v["member"] == true && v["superuser"] == true {
			return report, errors.New("superuser role membership refused")
		}
		if _, ok := required[fmt.Sprint(v["name"])]; ok {
			required[fmt.Sprint(v["name"])] = true
		}
	}
	for name, found := range required {
		if !found {
			return report, errors.New("required managed role missing: " + name)
		}
	}
	objects := report["application_objects"].([]map[string]any)
	if len(objects) != 1 {
		return report, errors.New("application object inventory missing")
	}
	for _, k := range []string{"relations", "routines", "types", "unexpected_schemas"} {
		if fmt.Sprint(objects[0][k]) != "0" {
			return report, errors.New("unexpected application objects; review required")
		}
	}
	data := report["existing_data"].([]map[string]any)
	if len(data) != 1 {
		return report, errors.New("fresh-project data inventory missing")
	}
	for _, k := range []string{"users", "objects", "buckets"} {
		if data[0][k] != false {
			return report, errors.New("existing user or Storage data; stop")
		}
	}
	if managed[0]["cron_catalog"] == true {
		jobs, e := query(ctx, s, cronSQL)
		if e != nil {
			return report, e
		}
		report["cron"] = jobs.Rows
		if len(jobs.Rows) != 1 || jobs.Rows[0]["jobs"] != false {
			return report, errors.New("existing cron jobs; stop")
		}
	}
	l, e := ledger(ctx, s)
	if e != nil {
		return report, e
	}
	report["application_ledger_entries"] = len(l)
	if len(l) > 0 {
		return report, errors.New("nonempty application ledger refused")
	}
	return report, nil
}
func savePreflight(c Config, report map[string]any) error {
	if c.recordPreflight == nil {
		return nil
	}
	return c.recordPreflight(report)
}
func recordPreflight(dir string, report map[string]any) error {
	b, e := json.MarshalIndent(report, "", "  ")
	if e != nil {
		return errors.New("preflight evidence encoding failed")
	}
	if e = os.WriteFile(filepath.Join(dir, "preflight.json"), append(b, '\n'), 0600); e != nil {
		return errors.New("preflight evidence write failed")
	}
	return nil
}
