package main

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	old "github.com/jackc/pgconn"
	clidriver "github.com/jackc/pgx/v4"
	"github.com/jackc/pgx/v5"
	"go/format"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func noPG(t *testing.T) {
	t.Helper()
	for _, v := range os.Environ() {
		k := strings.SplitN(v, "=", 2)[0]
		if strings.HasPrefix(k, "PG") {
			t.Setenv(k, "")
		}
	}
}
func configTest(t *testing.T) Config {
	t.Helper()
	noPG(t)
	d := t.TempDir()
	key, e := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if e != nil {
		t.Fatal(e)
	}
	cert := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "offline mock CA"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	der, e := x509.CreateCertificate(rand.Reader, cert, cert, &key.PublicKey, key)
	if e != nil {
		t.Fatal(e)
	}
	ca := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	os.WriteFile(filepath.Join(d, "ca.pem"), ca, 0600)
	os.Mkdir(filepath.Join(d, "migrations"), 0700)
	a := Artifact{Candidate: seal, Manifest: frozenManifest}
	for i := 1; i <= 106; i++ {
		n := fmt.Sprintf("202610%08d_mock.sql", i)
		b := []byte(fmt.Sprintf("select %d;", i))
		os.WriteFile(filepath.Join(d, "migrations", n), b, 0600)
		a.Files = append(a.Files, Entry{i, "supabase/migrations/" + n, digest(b)})
	}
	b, _ := json.Marshal(a)
	os.WriteFile(filepath.Join(d, "compatibility-manifest.json"), b, 0600)
	return Config{ProjectRef: strings.Repeat("a", 20), CAFile: filepath.Join(d, "ca.pem"), CAHash: digest(ca), ArtifactDir: d, ArtifactHash: digest(b), RunDir: filepath.Join(d, "attempt")}
}

type mock struct {
	queries                                         []string
	fail                                            string
	rollbackFail, closeFail, badIdentity, badLedger bool
	cronActive, missingPrefixDeps, lockHeld         bool
	mig44Objects                                    bool
	pauseInactive, duplicateCron, missingCronJob    bool
	wrongCronCommand, alterUnavailable              bool
	pauseRunning, pauseRunningClearAfter, pausePolls int
	pauseSelectCalls, failPauseSelectAt             int
	pauseActivity, pauseLivePIDs                    int
	pauseHistoryFail, pauseActivityFail             bool
	pauseHistoryMode                                string // "", "unexpected", "stale", "incomplete"
	ledger                                          []map[string]any
	args                                            []any
}

func (m *mock) Close(context.Context) error {
	if m.closeFail {
		return errors.New("MOCK_SECRET")
	}
	return nil
}
func (m *mock) Query(_ context.Context, q string, args ...any) (Result, error) {
	m.queries = append(m.queries, q)
	if m.fail != "" && q == m.fail {
		return Result{}, errors.New("MOCK_SECRET")
	}
	if q == "rollback" && m.rollbackFail {
		return Result{}, errors.New("MOCK_SECRET")
	}
	switch q {
	case backendSQL:
		return Result{Rows: []map[string]any{{"pid": 123}}}, nil
	case availableExtensionsSQL:
		out := Result{}
		for _, name := range []string{"pgcrypto", "postgis", "pg_cron", "pgtap", "dblink"} {
			out.Rows = append(out.Rows, map[string]any{"name": name, "version": "mock"})
		}
		return out, nil
	case rolesSQL:
		out := Result{}
		for _, name := range []string{"postgres", "supabase_admin", "anon", "authenticated", "service_role", "authenticator", "supabase_auth_admin", "supabase_storage_admin"} {
			out.Rows = append(out.Rows, map[string]any{"name": name})
		}
		return out, nil
	case roleEdgesSQL:
		return Result{}, nil
	case objectsSQL:
		return Result{Rows: []map[string]any{{"relations": 0, "routines": 0, "types": 0, "unexpected_schemas": 0}}}, nil
	case unexpectedSchemaNamesSQL:
		return Result{Rows: []map[string]any{}}, nil
	case dataSQL:
		return Result{Rows: []map[string]any{{"users": false, "objects": false, "buckets": false}}}, nil
	case cronSQL:
		return Result{Rows: []map[string]any{{"jobs": false}}}, nil
	case identitySQL:
		db := "postgres"
		if m.badIdentity {
			db = "other"
		}
		return Result{Rows: []map[string]any{{"db": db, "usr": "postgres", "login": "postgres", "version": 170006, "ssl": true}}}, nil
	case extensionsSQL:
		return Result{Rows: []map[string]any{{"name": "pgcrypto", "version": "1.3", "schema": "extensions", "owner": "supabase_admin"}}}, nil
	case ledgerExistsSQL:
		return Result{Rows: []map[string]any{{"exists": len(m.ledger) > 0}}}, nil
	case ledgerSQL:
		if m.badLedger {
			return Result{}, nil
		}
		return Result{Rows: m.ledger}, nil
	case insertLedgerSQL:
		b, _ := json.Marshal(args[2])
		m.ledger = append(m.ledger, map[string]any{"version": args[0], "name": args[1], "statements_json": string(b)})
	case sterileSQL:
		return Result{Rows: []map[string]any{{"profiles": 0, "users": 0, "takes": 0, "rates": 0, "clashes": 0, "verdicts": 0, "notifications": 0, "rewards": 0}}}, nil
	case inventorySQL:
		r := Result{}
		for i := 0; i < 6; i++ {
			r.Rows = append(r.Rows, map[string]any{"ok": true})
		}
		return r, nil
	case investigatePgcryptoSQL:
		return Result{Rows: []map[string]any{{"version": "1.3", "schema": "extensions", "owner": "postgres", "owner_is_supabase_admin": false, "owner_is_postgres": true}}}, nil
	case investigatePgcryptoAssertSQL:
		return Result{Rows: []map[string]any{{"artifact_assert_would_pass": false}}}, nil
	case investigateMig44ObjectsSQL:
		present := m.mig44Objects
		return Result{Rows: []map[string]any{{
			"explore_challenge_participants": present, "explore_challenge_entries": present, "explore_challenge_entry_reactions": present,
			"explore_challenge_results": present, "explore_treasure_clues": present, "explore_treasure_clue_progress": present,
			"explore_treasure_reward_claims": present, "explore_entry_status": present, "explore_treasure_type": present,
			"explore_clue_type": present, "explore_content_target": present, "explore_answer_digest": present,
			"join_challenge": present, "settle_challenge": present, "explore_challenges_reward_type": present,
			"explore_treasure_hunts_hunt_type": present, "notification_kind_challenge_result": present,
		}}}, nil
	case investigateCronSQL:
		if m.cronActive {
			return Result{Rows: []map[string]any{{"jobid": "1", "jobname": "clash-maintenance", "schedule": "* * * * *", "command": "select public.run_maintenance(500)", "username": "postgres", "active": true}}}, nil
		}
		return Result{Rows: []map[string]any{{"jobid": "1", "jobname": "clash-maintenance", "schedule": "* * * * *", "command": "select public.run_maintenance(500)", "username": "postgres", "active": false}}}, nil
	case investigateCronRunsSQL:
		return Result{Rows: []map[string]any{{"runs_1h": 0, "succeeded_1h": 0, "failed_1h": 0}}}, nil
	case resumePrefixDepsSQL:
		if m.missingPrefixDeps {
			return Result{Rows: []map[string]any{{"explore_challenges": false, "explore_treasure_hunts": true, "explore_treasure_progress": true, "profiles": true, "media_objects": true}}}, nil
		}
		return Result{Rows: []map[string]any{{"explore_challenges": true, "explore_treasure_hunts": true, "explore_treasure_progress": true, "profiles": true, "media_objects": true}}}, nil
	case resumeLockSQL:
		if m.lockHeld {
			return Result{Rows: []map[string]any{{"acquired": false}}}, nil
		}
		m.lockHeld = true
		return Result{Rows: []map[string]any{{"acquired": true}}}, nil
	case resumeUnlockSQL:
		m.lockHeld = false
		return Result{Rows: []map[string]any{{"released": true}}}, nil
	case pauseCronAlterProcSQL:
		return Result{Rows: []map[string]any{{"available": !m.alterUnavailable}}}, nil
	case pauseCronSelectSQL:
		m.pauseSelectCalls++
		if m.failPauseSelectAt > 0 && m.pauseSelectCalls == m.failPauseSelectAt {
			return Result{}, errors.New("MOCK_SECRET")
		}
		if m.missingCronJob {
			return Result{}, nil
		}
		cmd := pauseCronExpectedCommand
		if m.wrongCronCommand {
			cmd = "select evil()"
		}
		row := map[string]any{"jobid": "1", "jobname": pauseCronJobName, "schedule": pauseCronExpectedSchedule, "command": cmd, "username": pauseCronExpectedUsername, "active": !m.pauseInactive}
		if m.duplicateCron {
			return Result{Rows: []map[string]any{row, {"jobid": "2", "jobname": pauseCronJobName, "schedule": pauseCronExpectedSchedule, "command": cmd, "username": pauseCronExpectedUsername, "active": true}}}, nil
		}
		return Result{Rows: []map[string]any{row}}, nil
	case pauseCronAlterSQL:
		m.pauseInactive = true
		return Result{Tag: "SELECT 1"}, nil
	case pauseCronHistorySQL:
		m.pausePolls++
		if m.pauseHistoryFail {
			return Result{}, errors.New("MOCK_SECRET")
		}
		switch m.pauseHistoryMode {
		case "unexpected":
			return Result{Rows: []map[string]any{{"unfinished": 1, "stale_unfinished": 0, "unexpected_status": 1, "history_rows": 1}}}, nil
		case "stale":
			return Result{Rows: []map[string]any{{"unfinished": 1, "stale_unfinished": 1, "unexpected_status": 0, "history_rows": 1}}}, nil
		case "incomplete":
			return Result{Rows: []map[string]any{}}, nil
		}
		unfinished := m.pauseRunning
		if m.pauseRunningClearAfter > 0 && m.pausePolls > m.pauseRunningClearAfter {
			unfinished = 0
		}
		return Result{Rows: []map[string]any{{"unfinished": unfinished, "stale_unfinished": 0, "unexpected_status": 0, "history_rows": unfinished}}}, nil
	case pauseCronActivitySQL:
		if m.pauseActivityFail {
			return Result{}, errors.New("MOCK_SECRET")
		}
		active := m.pauseActivity
		live := m.pauseLivePIDs
		if m.pauseRunningClearAfter > 0 && m.pausePolls > m.pauseRunningClearAfter {
			active = 0
			live = 0
		}
		return Result{Rows: []map[string]any{{"active_backends": active, "live_job_pids": live}}}, nil
	case recoveryBucketInventorySQL:
		return Result{Rows: []map[string]any{
			{"id": "private-media", "name": "private-media", "public": false, "file_size_limit": int64(104857600), "allowed_mime_types": "{image/jpeg}", "created_at": "2026-01-01"},
			{"id": "public-media", "name": "public-media", "public": true, "file_size_limit": int64(104857600), "allowed_mime_types": "{image/jpeg}", "created_at": "2026-01-01"},
		}}, nil
	case recoveryAuthStorageCountsSQL:
		return Result{Rows: []map[string]any{{"user_count": 0, "object_count": 0, "bucket_count": 2}}}, nil
	}
	if q == managedSQL {
		return Result{Rows: []map[string]any{{"managed": true, "fresh": true, "publication": true, "restricted_role": true, "restricted_files": true, "cron_preloaded": true, "cron_catalog": true}}}, nil
	}
	if q == `select to_regclass('cron.job') is not null as cron_catalog` {
		return Result{Rows: []map[string]any{{"cron_catalog": true}}}, nil
	}
	if q == "select set_config('statement_timeout','15000',true)" {
		return Result{Rows: []map[string]any{{"set_config": "15000"}}}, nil
	}
	if strings.HasPrefix(q, "select jsonb_build_array(") {
		return Result{Rows: []map[string]any{{"args": m.args}}}, nil
	}
	return Result{Tag: "OK"}, nil
}
func dialMock(m *mock) Connector {
	return func(context.Context, *pgx.ConnConfig) (Session, error) { return m, nil }
}
func TestPinnedCLITLSRoundTrip(t *testing.T) {
	noPG(t)
	c := configTest(t)
	for _, mode := range []string{"disable", "require", "verify-ca", "verify-full"} {
		t.Run(mode, func(t *testing.T) {
			v, e := old.ParseConfig("host=localhost port=57722 user=postgres dbname=postgres sslmode=" + mode + " sslrootcert=" + filepath.ToSlash(c.CAFile))
			if e != nil {
				t.Fatal(e)
			}
			u := ToPostgresURL(*v)
			if strings.Contains(u, "sslmode") || strings.Contains(u, "sslrootcert") {
				t.Fatal("TLS options unexpectedly serialized")
			}
			round, e := old.ParseConfig(u)
			if e != nil {
				t.Fatal(e)
			}
			if round.TLSConfig == nil || !round.TLSConfig.InsecureSkipVerify {
				t.Fatal("expected default prefer without certificate verification")
			}
			if round.Port != 57722 {
				t.Fatal("port lost")
			}
			if mode == "verify-full" && (v.TLSConfig.InsecureSkipVerify || round.TLSConfig.RootCAs != nil) {
				t.Fatal("source verification contract changed")
			}
		})
	}
	t.Setenv("PGSSLMODE", "verify-full")
	v, _ := old.ParseConfig("host=localhost user=postgres sslmode=disable")
	r, e := old.ParseConfig(ToPostgresURL(*v))
	if e != nil || r.TLSConfig == nil || r.TLSConfig.InsecureSkipVerify {
		t.Fatal("reparse should honor explicit PGSSLMODE instead of dropped source sslmode")
	}
}
func TestVendoredCLIExactExtraction(t *testing.T) {
	b, e := os.ReadFile("vendor-evidence/cli-connect.go.txt")
	if e != nil || digest(b) != "d665915954bd9ab413f2a49843fdf1095f3d9644a47bf8425748bf28e8d517e9" {
		t.Fatal("source drift")
	}
	start := strings.Index(string(b), "func ToPostgresURL(")
	tail := string(b)[start:]
	end := strings.Index(tail, "\nfunc ")
	source := tail[:end]
	ours, _ := os.ReadFile("cli_url_compat.go")
	ours = ours[strings.Index(string(ours), "func ToPostgresURL("):]
	a, e := format.Source([]byte("package main\n" + source))
	if e != nil {
		t.Fatal(e)
	}
	o, e := format.Source(append([]byte("package main\n"), ours...))
	if e != nil || string(a) != string(o) {
		t.Fatal("extraction differs")
	}
}
func TestVerifiedConnectionContract(t *testing.T) {
	c := configTest(t)
	p, e := connection(c, "MOCK_SECRET")
	if e != nil {
		t.Fatal(e)
	}
	if p.Host != "db."+c.ProjectRef+".supabase.co" || p.Port != 5432 || p.User != "postgres" || p.Database != "postgres" || p.TLSConfig.ServerName != p.Host || p.TLSConfig.InsecureSkipVerify || p.TLSConfig.RootCAs == nil || len(p.Fallbacks) != 0 || p.Password != "MOCK_SECRET" {
		t.Fatal("unsafe config")
	}
}
func TestGuardsBeforeDial(t *testing.T) {
	for _, name := range []string{"unauthorized", "missing_password", "wrong_target", "bad_ca", "changed_artifact", "fixture_mode"} {
		t.Run(name, func(t *testing.T) {
			c := configTest(t)
			mode, auth, pass := "preflight", "preflight:"+c.ProjectRef, "MOCK_SECRET"
			switch name {
			case "unauthorized":
				auth = ""
			case "missing_password":
				pass = ""
			case "wrong_target":
				c.ProjectRef = "production.example.org"
			case "bad_ca":
				c.CAHash = "wrong"
			case "changed_artifact":
				os.WriteFile(filepath.Join(c.ArtifactDir, "migrations", "20261000000001_mock.sql"), []byte("altered"), 0600)
			case "fixture_mode":
				mode = "fixtures"
				auth = mode + ":" + c.ProjectRef
			}
			called := false
			_, e := Run(context.Background(), c, mode, auth, pass, func(context.Context, *pgx.ConnConfig) (Session, error) {
				called = true
				return nil, errors.New("unexpected")
			})
			if e == nil || called {
				t.Fatal("guard did not stop before dial")
			}
		})
	}
}
func TestTLSFailureRedacted(t *testing.T) {
	c := configTest(t)
	_, e := Run(context.Background(), c, "preflight", "preflight:"+c.ProjectRef, "MOCK_SECRET", func(context.Context, *pgx.ConnConfig) (Session, error) {
		return nil, errors.New("MOCK_SECRET postgres://unsafe")
	})
	if e == nil || strings.Contains(e.Error(), "MOCK_SECRET") || strings.Contains(e.Error(), "postgres://") {
		t.Fatal(e)
	}
}
func TestWrongDatabaseStopsBeforeMigration(t *testing.T) {
	c := configTest(t)
	m := &mock{badIdentity: true}
	n, e := Run(context.Background(), c, "migrate", "migrate:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || n != 0 || strings.Contains(strings.Join(m.queries, "\n"), createLedgerSQL) {
		t.Fatal("identity guard failed")
	}
}
func TestPartialMigrationFirstFailure(t *testing.T) {
	c := configTest(t)
	m := &mock{fail: "select 2;"}
	n, e := Run(context.Background(), c, "migrate", "migrate:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || n != 1 || len(m.ledger) != 1 || strings.Contains(strings.Join(m.queries, "\n"), "select 3;") || strings.Contains(e.Error(), "MOCK_SECRET") {
		t.Fatalf("n=%d err=%v", n, e)
	}
}
func TestCommitUncertaintyStops(t *testing.T) {
	c := configTest(t)
	m := &mock{fail: "commit"}
	n, e := Run(context.Background(), c, "migrate", "migrate:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || n != 0 || !strings.Contains(e.Error(), "unknown") || strings.Contains(strings.Join(m.queries, "\n"), "select 2;") {
		t.Fatal(n, e)
	}
}
func TestLedgerMismatchStops(t *testing.T) {
	c := configTest(t)
	m := &mock{badLedger: true}
	n, e := Run(context.Background(), c, "migrate", "migrate:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || n != 1 || strings.Contains(strings.Join(m.queries, "\n"), "select 2;") {
		t.Fatal(n, e)
	}
}
func TestAll106MockTransactions(t *testing.T) {
	c := configTest(t)
	m := &mock{}
	n, e := Run(context.Background(), c, "migrate", "migrate:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e != nil || n != 106 || len(m.ledger) != 106 {
		t.Fatal(n, e)
	}
}
func TestCleanupFailureReported(t *testing.T) {
	for _, name := range []string{"readonly_rollback", "connection_close", "failed_migration_rollback"} {
		t.Run(name, func(t *testing.T) {
			c := configTest(t)
			m := &mock{}
			mode := "preflight"
			switch name {
			case "readonly_rollback":
				m.rollbackFail = true
			case "connection_close":
				m.closeFail = true
			default:
				mode = "migrate"
				m.fail = "select 1;"
				m.rollbackFail = true
			}
			_, e := Run(context.Background(), c, mode, mode+":"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
			if e == nil || strings.Contains(e.Error(), "MOCK_SECRET") {
				t.Fatal(e)
			}
		})
	}
}
func TestActualEntrypointAndEvidenceRedaction(t *testing.T) {
	c := configTest(t)
	file := filepath.Join(t.TempDir(), "config.json")
	b, _ := json.Marshal(c)
	os.WriteFile(file, b, 0600)
	m := &mock{}
	args := []string{"--mode", "preflight", "--authorize", "preflight:" + c.ProjectRef, "--config", file}
	e := command(args, func(string) string { return "MOCK_SECRET" }, dialMock(m))
	if e != nil {
		t.Fatal(e)
	}
	data, _ := os.ReadFile(filepath.Join(c.RunDir, "outcome.json"))
	if strings.Contains(string(data), "MOCK_SECRET") || strings.Contains(string(data), "ca.pem") {
		t.Fatal("secret leaked")
	}
	if e = command(args, func(string) string { return "MOCK_SECRET" }, dialMock(m)); e == nil {
		t.Fatal("attempt reuse allowed")
	}
}
func TestInventoryReadOnly(t *testing.T) {
	m := &mock{}
	if e := inventory(context.Background(), m); e != nil {
		t.Fatal(e)
	}
	if m.queries[0] != "begin read only" || m.queries[len(m.queries)-1] != "rollback" {
		t.Fatal(m.queries)
	}
}

func TestPinnedCLIActualPGX4ParserLosesSourceTLS(t *testing.T) {
	noPG(t)
	c := configTest(t)
	for _, mode := range []string{"disable", "require", "verify-full"} {
		v, e := old.ParseConfig("host=localhost user=postgres sslmode=" + mode + " sslrootcert=" + filepath.ToSlash(c.CAFile))
		if e != nil {
			t.Fatal(e)
		}
		r, e := clidriver.ParseConfig(ToPostgresURL(*v))
		if e != nil || r.TLSConfig == nil || !r.TLSConfig.InsecureSkipVerify {
			t.Fatal("unexpected final parser contract", e)
		}
	}
}
func TestTAPAccounting(t *testing.T) {
	for _, tc := range []struct {
		name, source string
		valid        bool
	}{{"success", "ok 1 - works\nok 2 - works\n1..2", true}, {"skip", "ok 1 - skip # SKIP unavailable\n1..1", true}, {"empty_skip", "1..0 # SKIP unavailable", true}, {"failure", "not ok 1 - bad\n1..1", false}, {"no_plan", "ok 1 - bad", false}, {"plan_mismatch", "ok 1 - works\n1..2", false}, {"bailout", "Bail out! failure", false}, {"todo_pass", "ok 1 - unexpected # TODO future\n1..1", false}, {"duplicate", "ok 1 - a\nok 1 - b\n1..2", false}, {"empty", "1..0", false}} {
		t.Run(tc.name, func(t *testing.T) {
			_, e := account(strings.Split(tc.source, "\n"))
			if (e == nil) != tc.valid {
				t.Fatal(e)
			}
		})
	}
}
func TestFixtureModeCannotBeOrdinaryAuthorization(t *testing.T) {
	if authorized("fixtures", "fixtures:"+strings.Repeat("a", 20), strings.Repeat("a", 20)) {
		t.Fatal("fixture scope collapsed")
	}
	if !authorized("fixtures", "committed-fixtures:"+strings.Repeat("a", 20), strings.Repeat("a", 20)) {
		t.Fatal("explicit fixture scope refused")
	}
}
func TestFixtureWorkflowRefusesNonSterileAttestation(t *testing.T) {
	c := configTest(t)
	m := &mock{}
	_, e := executeSuites(context.Background(), m, nil, nil, c, Artifact{})
	if e == nil || len(m.queries) > 0 {
		t.Fatal(e)
	}
}
