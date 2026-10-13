package main

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const seal = "a92a550527f810913b01f6e6411dc78996c71a06"
const frozenManifest = "a9b30736c87a7fac05c9764404dfd58a876f64db6a3e072e9a348cac8b162b4e"

type Config struct {
	recordPreflight  func(map[string]any) error
	ConnectionMode   string `json:"connection_mode"`
	PoolerHost       string `json:"pooler_host"`
	CredentialSource string `json:"credential_source"`
	ProjectRef       string `json:"project_ref"`
	CAFile           string `json:"ca_file"`
	CAHash           string `json:"ca_sha256"`
	ArtifactDir      string `json:"artifact_dir"`
	ArtifactHash     string `json:"artifact_manifest_sha256"`
	RunDir           string `json:"run_dir"`
	SuiteHash        string `json:"suite_manifest_sha256"`
	Sterile          bool   `json:"sterile_test_project"`
}
type Result struct {
	Rows []map[string]any
	Tag  string
}
type Session interface {
	Query(context.Context, string, ...any) (Result, error)
	Close(context.Context) error
}
type Connector func(context.Context, *pgx.ConnConfig) (Session, error)
type live struct{ c *pgx.Conn }

func (s *live) Query(ctx context.Context, q string, args ...any) (Result, error) {
	if len(args) == 0 {
		results, e := s.c.PgConn().Exec(ctx, q).ReadAll()
		out := Result{}
		if e != nil {
			return out, e
		}
		for _, r := range results {
			out.Tag = r.CommandTag.String()
			for _, v := range r.Rows {
				row := map[string]any{}
				for i, f := range r.FieldDescriptions {
					var value any
					if v[i] != nil {
						if t, ok := s.c.TypeMap().TypeForOID(f.DataTypeOID); ok {
							value, e = t.Codec.DecodeValue(s.c.TypeMap(), f.DataTypeOID, 0, v[i])
							if e != nil {
								return out, e
							}
						} else {
							value = string(v[i])
						}
					}
					row[f.Name] = value
				}
				out.Rows = append(out.Rows, row)
			}
		}
		return out, nil
	}
	rows, e := s.c.Query(ctx, q, args...)
	if e != nil {
		return Result{}, e
	}
	defer rows.Close()
	out := Result{}
	for rows.Next() {
		v, e := rows.Values()
		if e != nil {
			return out, e
		}
		m := map[string]any{}
		for i, f := range rows.FieldDescriptions() {
			m[f.Name] = v[i]
		}
		out.Rows = append(out.Rows, m)
	}
	out.Tag = rows.CommandTag().String()
	return out, rows.Err()
}
func (s *live) Close(ctx context.Context) error { return s.c.Close(ctx) }
func connect(ctx context.Context, c *pgx.ConnConfig) (Session, error) {
	s, e := pgx.ConnectConfig(ctx, c)
	if e != nil {
		return nil, e
	}
	return &live{s}, nil
}
func digest(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func check(b bool, msg string) error {
	if !b {
		return errors.New(msg)
	}
	return nil
}
func connection(c Config, password string) (*pgx.ConnConfig, error) {
	if !regexp.MustCompile(`^[a-z]{20}$`).MatchString(c.ProjectRef) {
		return nil, errors.New("invalid staging project reference")
	}
	if strings.TrimSpace(password) == "" || strings.ContainsAny(password, "\r\n\x00") {
		return nil, errors.New("missing or invalid staging password")
	}
	ca, e := os.ReadFile(c.CAFile)
	if e != nil || digest(ca) != c.CAHash {
		return nil, errors.New("CA fingerprint mismatch")
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(ca) {
		return nil, errors.New("invalid CA PEM")
	}
	// Parse only to obtain pgx's required initialized configuration. Every transport,
	// identity, runtime parameter and credential is then assigned explicitly.
	conf, e := pgx.ParseConfig("host=invalid.invalid port=5432 user=postgres dbname=postgres sslmode=require")
	if e != nil {
		return nil, errors.New("driver configuration refused")
	}
	conf.Host = "db." + c.ProjectRef + ".supabase.co"
	switch c.ConnectionMode {
	case "", "direct":
		if c.PoolerHost != "" {
			return nil, errors.New("pooler host refused in direct mode")
		}
	case "session-pooler":
		// Exact host comes from the approved project's Dashboard, never from region guessing.
		if !regexp.MustCompile(`^aws-[0-9]+-[a-z]{2}-[a-z]+-[1-9][0-9]*\.pooler\.supabase\.com$`).MatchString(c.PoolerHost) {
			return nil, errors.New("approved shared session-pooler hostname required")
		}
		conf.Host = c.PoolerHost
	default:
		return nil, errors.New("unsupported connection mode; transaction pooling refused")
	}
	conf.Port = 5432
	conf.User = "postgres"
	if c.ConnectionMode == "session-pooler" {
		conf.User += "." + c.ProjectRef
	}
	conf.Database = "postgres"
	conf.Password = password
	conf.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12, RootCAs: roots, ServerName: conf.Host}
	conf.Fallbacks = nil
	conf.RuntimeParams = map[string]string{"application_name": "clash-staging-reviewed", "search_path": "public,extensions", "statement_timeout": "60000", "lock_timeout": "10000"}
	conf.ConnectTimeout = 10 * time.Second
	conf.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	return conf, nil
}

type Entry struct {
	Order int    `json:"order"`
	Path  string `json:"path"`
	Hash  string `json:"artifact_sha256"`
}
type Artifact struct {
	Candidate string  `json:"candidate_commit"`
	Manifest  string  `json:"frozen_manifest_sha256"`
	Files     []Entry `json:"files"`
}

func artifacts(c Config) (Artifact, error) {
	var a Artifact
	b, e := os.ReadFile(filepath.Join(c.ArtifactDir, "compatibility-manifest.json"))
	if e != nil {
		return a, e
	}
	if digest(b) != c.ArtifactHash {
		return a, errors.New("artifact manifest mismatch")
	}
	if e = json.Unmarshal(b, &a); e != nil {
		return a, e
	}
	if a.Candidate != seal || a.Manifest != frozenManifest || len(a.Files) != 106 {
		return a, errors.New("frozen lineage mismatch")
	}
	names := []string{}
	for i, f := range a.Files {
		n := filepath.Base(f.Path)
		if f.Path != "supabase/migrations/"+n {
			return a, errors.New("unexpected source path")
		}
		if f.Order != i+1 || !regexp.MustCompile(`^\d{14}_[a-z0-9_]+\.sql$`).MatchString(n) {
			return a, errors.New("invalid migration order/path")
		}
		names = append(names, n)
		p := filepath.Join(c.ArtifactDir, "migrations", n)
		fi, e := os.Lstat(p)
		if e != nil || !fi.Mode().IsRegular() {
			return a, errors.New("redirected migration refused")
		}
		b, e := os.ReadFile(p)
		if e != nil || digest(b) != f.Hash {
			return a, errors.New("migration bytes mismatch")
		}
	}
	sorted := append([]string{}, names...)
	sort.Strings(sorted)
	for i := range sorted {
		if names[i] != sorted[i] || (i > 0 && names[i][:14] == names[i-1][:14]) {
			return a, errors.New("migration ordering mismatch")
		}
	}
	actual, e := os.ReadDir(filepath.Join(c.ArtifactDir, "migrations"))
	if e != nil || len(actual) != 106 {
		return a, errors.New("unexpected migration directory entries")
	}
	return a, nil
}

const identitySQL = `select current_database() as db,current_user as usr,session_user as login,current_setting('server_version_num')::int as version,(select ssl from pg_stat_ssl where pid=pg_backend_pid()) as ssl`
const extensionsSQL = `select e.extname as name,e.extversion as version,n.nspname as schema,pg_get_userbyid(e.extowner) as owner from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('pgcrypto','postgis','pg_cron','pgtap','dblink') order by e.extname`
const ledgerExistsSQL = `select to_regclass('supabase_migrations.schema_migrations') is not null as exists`
const ledgerSQL = `select version,name,array_to_json(statements)::text as statements_json from supabase_migrations.schema_migrations order by version`
const sterileSQL = `select (select count(*) from public.profiles) as profiles,(select count(*) from auth.users) as users,(select count(*) from public.takes) as takes,(select count(*) from public.rate_limit_events) as rates,(select count(*) from public.clashes) as clashes,(select count(*) from public.verdicts) as verdicts,(select count(*) from public.notifications) as notifications,(select count(*) from public.reputation_events) as rewards`

func query(ctx context.Context, s Session, q string, args ...any) (Result, error) {
	r, e := s.Query(ctx, q, args...)
	if e != nil {
		return r, errors.New("database operation failed; diagnostics withheld")
	}
	return r, nil
}

// Only comparisons and fixed codes leave this gate, never raw identity values.
type identityDiagnostics struct {
	DatabaseMatch    bool   `json:"database_match"`
	CurrentRoleMatch bool   `json:"current_role_match"`
	SessionRoleMatch bool   `json:"session_role_match"`
	BackendSSL       any    `json:"backend_ssl_observed"`
	VersionMatch     bool   `json:"postgres_17_match"`
	FailureReason    string `json:"failure_reason"`
}

func inspectIdentity(ctx context.Context, s Session) (identityDiagnostics, error) {
	d := identityDiagnostics{BackendSSL: "unknown"}
	refuse := func(code string) (identityDiagnostics, error) {
		d.FailureReason = code
		return d, errors.New(code)
	}
	r, e := query(ctx, s, identitySQL)
	if e != nil {
		return refuse("identity_query_failed")
	}
	if len(r.Rows) == 0 {
		return refuse("identity_row_missing")
	}
	if len(r.Rows) != 1 {
		return refuse("identity_row_count_invalid")
	}
	v := r.Rows[0]
	db, dbOK := v["db"].(string)
	usr, usrOK := v["usr"].(string)
	login, loginOK := v["login"].(string)
	d.DatabaseMatch = dbOK && db == "postgres"
	d.CurrentRoleMatch = usrOK && usr == "postgres"
	d.SessionRoleMatch = loginOK && login == "postgres"
	ssl, sslOK := v["ssl"].(bool)
	if sslOK {
		d.BackendSSL = ssl
	}
	var version int64
	versionOK := true
	switch n := v["version"].(type) {
	case int:
		version = int64(n)
	case int32:
		version = int64(n)
	case int64:
		version = n
	default:
		versionOK = false
	}
	d.VersionMatch = versionOK && version >= 170000 && version < 180000
	if !dbOK || !usrOK || !loginOK || !versionOK || (v["ssl"] != nil && !sslOK) {
		return refuse("identity_values_malformed")
	}
	if !d.DatabaseMatch {
		return refuse("database_mismatch")
	}
	if !d.CurrentRoleMatch {
		return refuse("current_role_mismatch")
	}
	if !d.SessionRoleMatch {
		return refuse("session_role_mismatch")
	}
	if !sslOK {
		return refuse("backend_ssl_unknown")
	}
	if !ssl {
		return refuse("backend_ssl_required")
	}
	if !d.VersionMatch {
		return refuse("postgres_17_required")
	}
	d.FailureReason = "none"
	return d, nil
}
func identity(ctx context.Context, s Session) error {
	_, e := inspectIdentity(ctx, s)
	return e
}
func ledger(ctx context.Context, s Session) ([]map[string]any, error) {
	r, e := query(ctx, s, ledgerExistsSQL)
	if e != nil {
		return nil, e
	}
	if len(r.Rows) != 1 {
		return nil, errors.New("missing ledger probe")
	}
	if r.Rows[0]["exists"] == false {
		return nil, nil
	}
	r, e = query(ctx, s, ledgerSQL)
	return r.Rows, e
}

const createLedgerSQL = `create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text not null primary key, statements text[], name text)`
const insertLedgerSQL = `insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)`

func migrate(ctx context.Context, s Session, c Config, a Artifact) (int, error) {
	if _, e := preflight(ctx, s); e != nil {
		return 0, e
	}
	if _, e := query(ctx, s, createLedgerSQL); e != nil {
		return 0, e
	}
	completed := 0
	for _, f := range a.Files {
		n := filepath.Base(f.Path)
		sql, e := os.ReadFile(filepath.Join(c.ArtifactDir, "migrations", n))
		if e != nil || digest(sql) != f.Hash {
			return completed, errors.New("migration changed after preflight")
		}
		if _, e = query(ctx, s, "begin"); e != nil {
			return completed, e
		}
		failed := func() error {
			if _, e := query(ctx, s, string(sql)); e != nil {
				return e
			}
			_, e := query(ctx, s, insertLedgerSQL, n[:14], strings.TrimSuffix(n[15:], ".sql"), []string{string(sql)})
			return e
		}()
		if failed != nil {
			_, rb := query(ctx, s, "rollback")
			if rb != nil {
				return completed, errors.New("migration failed; rollback unconfirmed")
			}
			return completed, failed
		}
		if _, e = query(ctx, s, "commit"); e != nil {
			return completed, errors.New("commit outcome unknown; stop and inspect, no retry")
		}
		completed++
		l, e := ledger(ctx, s)
		if e != nil || len(l) != completed {
			return completed, errors.New("ledger verification failed")
		}
		for i, v := range l {
			expected := filepath.Base(a.Files[i].Path)
			var statements []string
			if v["version"] != expected[:14] || v["name"] != strings.TrimSuffix(expected[15:], ".sql") {
				return completed, errors.New("ledger ordering/name mismatch")
			}
			if json.Unmarshal([]byte(fmt.Sprint(v["statements_json"])), &statements) != nil || len(statements) != 1 || digest([]byte(statements[0])) != a.Files[i].Hash {
				return completed, errors.New("ledger statement mismatch")
			}
		}
	}
	return completed, nil
}

const inventorySQL = `select 'H1_anon' as check,not has_function_privilege('anon','public.clash_notify(text,text,public.notification_kind,text)','execute') as ok union all select 'H1_authenticated',not has_function_privilege('authenticated','public.clash_notify(text,text,public.notification_kind,text)','execute') union all select 'H2_anon_body',not has_column_privilege('anon','public.course_lessons','body_text','select') union all select 'H2_authenticated_media',not has_column_privilege('authenticated','public.course_lessons','media_object_id','select') union all select 'H3_anon',not has_any_column_privilege('anon','public.reputation_events','select') union all select 'M1_gate',exists(select 1 from pg_proc where oid='public.clash_readable(text)'::regprocedure and prosecdef and proconfig @> array['search_path=""'])`

func inventory(ctx context.Context, s Session) (err error) {
	if _, e := query(ctx, s, "begin read only"); e != nil {
		return e
	}
	defer func() {
		c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, e := s.Query(c, "rollback"); e != nil {
			err = errors.New("read-only rollback unconfirmed; stop")
		}
	}()
	if e := identity(ctx, s); e != nil {
		return e
	}
	r, e := query(ctx, s, inventorySQL)
	if e != nil {
		return e
	}
	if len(r.Rows) != 6 {
		return errors.New("incomplete security inventory")
	}
	for _, v := range r.Rows {
		if v["ok"] != true {
			return errors.New("effective privilege inventory failed")
		}
	}
	return nil
}
func Run(ctx context.Context, c Config, mode, authorization, password string, dial Connector) (completed int, err error) {
	if !authorized(mode, authorization, c.ProjectRef) {
		return 0, errors.New("explicit mode/project authorization required")
	}
	if mode != "preflight" && mode != "migrate" && mode != "inventory" && mode != "fixtures" && mode != "investigate" && mode != "resume" && mode != "pause-cron" && mode != "verify-complete" {
		return 0, errors.New("unknown or fixture-producing mode refused")
	}
	conf, e := connection(c, password)
	if e != nil {
		return 0, e
	}
	a, e := artifacts(c)
	if e != nil {
		return 0, e
	}
	if c.ConnectionMode == "session-pooler" {
		dial = sessionConnector(dial)
	}
	s, e := dial(ctx, conf)
	if e != nil {
		return 0, errors.New("TLS/authentication/session connection failed; no retry")
	}
	defer func() {
		c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if e := s.Close(c); e != nil {
			err = errors.New("connection cleanup unconfirmed; stop")
		}
	}()
	switch mode {
	case "preflight":
		report, e := preflight(ctx, s)
		if evidenceErr := savePreflight(c, report); evidenceErr != nil {
			e = evidenceErr
		}
		return 0, e
	case "migrate":
		return migrate(ctx, s, c, a)
	case "investigate":
		report, e := investigate(ctx, s, c, a)
		if evidenceErr := saveInvestigate(c.RunDir, report); evidenceErr != nil {
			e = evidenceErr
		}
		return 0, e
	case "resume":
		return resume(ctx, s, c, a)
	case "verify-complete":
		report, e := verifyComplete(ctx, s, c, a)
		if evidenceErr := saveVerifyCompleteReport(c.RunDir, report); evidenceErr != nil {
			e = evidenceErr
		}
		return 0, e
	case "pause-cron":
		return pauseCron(ctx, s, c)
	case "fixtures":
		return executeSuites(ctx, s, conf, dial, c, a)
	default:
		return 0, inventory(ctx, s)
	}
}

func authorized(mode, auth, ref string) bool {
	prefix := mode
	if mode == "fixtures" {
		prefix = "committed-fixtures"
	}
	return (mode == "preflight" || mode == "migrate" || mode == "inventory" || mode == "fixtures" || mode == "store-credential" || mode == "investigate" || mode == "resume" || mode == "pause-cron" || mode == "verify-complete") && auth == prefix+":"+ref
}
