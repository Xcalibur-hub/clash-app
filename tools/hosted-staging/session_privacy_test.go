package main

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"errors"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func poolConfig(t *testing.T) Config {
	c := configTest(t)
	c.ConnectionMode = "session-pooler"
	c.PoolerHost = "aws-0-ap-south-1.pooler.supabase.com"
	return c
}
func TestSessionPoolerContract(t *testing.T) {
	c := poolConfig(t)
	p, e := connection(c, "MOCK_SECRET")
	if e != nil {
		t.Fatal(e)
	}
	if p.Host != c.PoolerHost || p.Port != 5432 || p.User != "postgres."+c.ProjectRef || p.Database != "postgres" || p.TLSConfig.ServerName != c.PoolerHost || p.TLSConfig.InsecureSkipVerify || p.TLSConfig.MinVersion < 0x303 || p.TLSConfig.RootCAs == nil || len(p.Fallbacks) != 0 || p.DefaultQueryExecMode != pgx.QueryExecModeSimpleProtocol {
		t.Fatal("session contract changed")
	}
	for _, mode := range []string{"transaction", "transaction-pooler", "session", "prefer"} {
		t.Run(mode, func(t *testing.T) {
			c.ConnectionMode = mode
			if _, e := connection(c, "MOCK_SECRET"); e == nil {
				t.Fatal("unsafe mode accepted")
			}
		})
	}
}
func TestPoolerRejectsUnapprovedHostForms(t *testing.T) {
	for _, host := range []string{"localhost", "127.0.0.1", "aws-0-ap-south-1.pooler.supabase.com:6543", "postgres://unsafe", "db." + strings.Repeat("a", 20) + ".supabase.co", "aws-0-ap-south-1.pooler.supabase.com.attacker.test", "AWS-0-ap-south-1.pooler.supabase.com", "aws-0-ap-south-1.pooler.supabase.com,evil.test", ""} {
		t.Run(host, func(t *testing.T) {
			c := poolConfig(t)
			c.PoolerHost = host
			called := false
			_, e := Run(context.Background(), c, "preflight", "preflight:"+c.ProjectRef, "MOCK_SECRET", func(context.Context, *pgx.ConnConfig) (Session, error) { called = true; return nil, nil })
			if e == nil || called {
				t.Fatal("target reached connector")
			}
		})
	}
	c := poolConfig(t)
	c.ConnectionMode = "direct"
	if _, e := connection(c, "MOCK_SECRET"); e == nil {
		t.Fatal("silent host fallback")
	}
}
func TestPoolerTLSCertificateVerificationOffline(t *testing.T) {
	c := poolConfig(t)
	p, e := connection(c, "MOCK_SECRET")
	if e != nil {
		t.Fatal(e)
	}
	// Offline x509 validation against the actual configured roots: no TLS listener.
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	cert := &x509.Certificate{SerialNumber: big.NewInt(8), Subject: pkix.Name{CommonName: "untrusted"}, DNSNames: []string{p.Host}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, _ := x509.CreateCertificate(rand.Reader, cert, cert, &key.PublicKey, key)
	leaf, _ := x509.ParseCertificate(der)
	if _, e = leaf.Verify(x509.VerifyOptions{Roots: p.TLSConfig.RootCAs, DNSName: p.TLSConfig.ServerName}); e == nil {
		t.Fatal("untrusted chain accepted")
	}
	if e = leaf.VerifyHostname("wrong.pooler.supabase.com"); e == nil {
		t.Fatal("wrong hostname accepted")
	}
}

type alteredSession struct {
	*mock
	change   string
	override func(string) (Result, bool)
}

func (s *alteredSession) Query(ctx context.Context, q string, args ...any) (Result, error) {
	if s.override != nil {
		if r, ok := s.override(q); ok {
			s.queries = append(s.queries, q)
			return r, nil
		}
	}
	if q == backendSQL && s.change != "" && strings.Contains(strings.Join(s.queries, ";"), s.change) {
		return Result{Rows: []map[string]any{{"pid": 999}}}, nil
	}
	return s.mock.Query(ctx, q, args...)
}
func TestSessionMigrationsKeepSingleBackend(t *testing.T) {
	c := poolConfig(t)
	m := &mock{}
	calls := 0
	n, e := Run(context.Background(), c, "migrate", "migrate:"+c.ProjectRef, "MOCK_SECRET", func(_ context.Context, p *pgx.ConnConfig) (Session, error) {
		calls++
		if p.User != "postgres."+c.ProjectRef {
			t.Fatal("routing identity lost")
		}
		return m, nil
	})
	if e != nil || n != 106 || calls != 1 || len(m.ledger) != 106 {
		t.Fatal(n, e, calls)
	}
}
func TestChangedBackendStopsBeforeNextMigration(t *testing.T) {
	c := poolConfig(t)
	m := &alteredSession{mock: &mock{}, change: "commit"}
	n, e := Run(context.Background(), c, "migrate", "migrate:"+c.ProjectRef, "MOCK_SECRET", func(context.Context, *pgx.ConnConfig) (Session, error) { return m, nil })
	if e == nil || n != 1 || strings.Contains(strings.Join(m.queries, ";"), "select 2;") {
		t.Fatal("backend replacement accepted", n, e)
	}
}
func TestExpandedPreflightDenials(t *testing.T) {
	cases := []struct {
		name, q, key string
		value        any
	}{
		{"wrong_login", identitySQL, "login", "another"},
		{"wrong_database", identitySQL, "db", "another"},
		{"missing_dblink", availableExtensionsSQL, "drop_name", "dblink"},
		{"unsafe_role", managedSQL, "restricted_role", false},
		{"file_access", managedSQL, "restricted_files", false},
		{"missing_auth", managedSQL, "managed", false},
		{"missing_publication", managedSQL, "publication", false},
		{"cron_not_preloaded", managedSQL, "cron_preloaded", false},
		{"existing_relation", objectsSQL, "relations", 1},
		{"existing_routine", objectsSQL, "routines", 1},
		{"existing_type", objectsSQL, "types", 1},
		{"unexpected_schema", objectsSQL, "unexpected_schemas", 1},
		{"existing_auth_data", dataSQL, "users", true},
		{"existing_storage", dataSQL, "objects", true},
		{"existing_bucket", dataSQL, "buckets", true},
		{"cron_job", cronSQL, "jobs", true},
		{"missing_role", rolesSQL, "drop_name", "supabase_admin"},
		{"foreign_pgcrypto_owner", extensionsSQL, "owner", "untrusted_owner"},
		{"wrong_pgcrypto_schema", extensionsSQL, "schema", "public"},
		{"wrong_pgcrypto_version", extensionsSQL, "version", "1.2"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			base := &mock{}
			m := &alteredSession{mock: base}
			m.override = func(q string) (Result, bool) {
				if q != tc.q {
					return Result{}, false
				}
				r, _ := (&mock{}).Query(context.Background(), q)
				if tc.key == "drop_name" {
					out := []map[string]any{}
					for _, v := range r.Rows {
						if v["name"] != tc.value {
							out = append(out, v)
						}
					}
					r.Rows = out
				} else {
					r.Rows[0][tc.key] = tc.value
				}
				return r, true
			}
			_, e := preflight(context.Background(), m)
			if e == nil || len(m.queries) == 0 || m.queries[len(m.queries)-1] != "rollback" {
				t.Fatal("preflight failed to deny/rollback", e)
			}
		})
	}
}
func TestExpandedPreflightReadOnlyAndEvidence(t *testing.T) {
	c := poolConfig(t)
	c.RunDir = t.TempDir()
	c.recordPreflight = func(r map[string]any) error { return recordPreflight(c.RunDir, r) }
	m := &mock{}
	_, e := Run(context.Background(), c, "preflight", "preflight:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e != nil {
		t.Fatal(e)
	}
	for _, q := range m.queries {
		if q != "begin read only" && q != "rollback" && !strings.HasPrefix(q, "select ") {
			t.Fatal("non-read-only statement", q)
		}
	}
	b, e := os.ReadFile(filepath.Join(c.RunDir, "preflight.json"))
	if e != nil {
		t.Fatal(e)
	}
	for _, required := range []string{"available_extensions", "role_inheritance", "application_objects", "unexpected_schema_names", "existing_data", "application_ledger_entries", "cron"} {
		if !strings.Contains(string(b), required) {
			t.Fatal("missing inventory", required)
		}
	}
	if strings.Contains(string(b), "MOCK_SECRET") {
		t.Fatal("secret evidence")
	}
}
func TestPreflightQueryFailureStopsAndRedacts(t *testing.T) {
	m := &mock{fail: availableExtensionsSQL}
	_, e := preflight(context.Background(), m)
	if e == nil || strings.Contains(e.Error(), "MOCK_SECRET") || strings.Contains(strings.Join(m.queries, ";"), rolesSQL) {
		t.Fatal("query failure continued/leaked", e)
	}
}
func TestPreflightNonemptyLedgerAndEvidenceFailure(t *testing.T) {
	m := &mock{ledger: []map[string]any{{"version": "existing"}}}
	if _, e := preflight(context.Background(), m); e == nil {
		t.Fatal("existing ledger accepted")
	}
	c := configTest(t)
	c.recordPreflight = func(map[string]any) error { return errors.New("preflight evidence write failed") }
	if _, e := Run(context.Background(), c, "preflight", "preflight:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{})); e == nil {
		t.Fatal("evidence failure ignored")
	}
}

// This mock models PostgreSQL's aborted-transaction behavior, not just tags.
type abortSession struct {
	*mock
	aborted bool
}

func (s *abortSession) Query(ctx context.Context, q string, args ...any) (Result, error) {
	if q == "select 2;" {
		s.aborted = true
		s.queries = append(s.queries, q)
		return Result{}, errors.New("MOCK_SECRET")
	}
	if q == "rollback" || q == "rollback; reset role" {
		s.aborted = false
		return s.mock.Query(ctx, q, args...)
	}
	if s.aborted {
		return Result{}, errors.New("transaction aborted")
	}
	return s.mock.Query(ctx, q, args...)
}
func TestPoolerFailedMigrationStillRollsBack(t *testing.T) {
	c := poolConfig(t)
	m := &abortSession{mock: &mock{}}
	n, e := Run(context.Background(), c, "migrate", "migrate:"+c.ProjectRef, "MOCK_SECRET", func(context.Context, *pgx.ConnConfig) (Session, error) { return m, nil })
	if e == nil || n != 1 || m.aborted || !strings.Contains(strings.Join(m.queries, ";"), "rollback") || strings.Contains(strings.Join(m.queries, ";"), "select 3;") {
		t.Fatal("failed migration not rolled back", n, e)
	}
}
func TestPoolerIndependentConnectionsEachBindTheirBackend(t *testing.T) {
	calls := 0
	c := poolConfig(t)
	conf, e := connection(c, "MOCK_SECRET")
	if e != nil {
		t.Fatal(e)
	}
	dial := sessionConnector(func(context.Context, *pgx.ConnConfig) (Session, error) { calls++; return &mock{}, nil })
	first, e := dial(context.Background(), conf)
	if e != nil {
		t.Fatal(e)
	}
	second, e := dial(context.Background(), conf.Copy())
	if e != nil {
		t.Fatal(e)
	}
	if first == second || calls != 2 {
		t.Fatal("independent sessions merged")
	}
	for _, s := range []Session{first, second} {
		if _, ok := s.(*boundSession); !ok {
			t.Fatal("missing remote continuity guard")
		}
		if e := s.Close(context.Background()); e != nil {
			t.Fatal(e)
		}
	}
}
func TestPoolerGuardSetupFailureClosesSession(t *testing.T) {
	c := poolConfig(t)
	m := &mock{fail: backendSQL, closeFail: true}
	_, e := Run(context.Background(), c, "preflight", "preflight:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || strings.Contains(e.Error(), "MOCK_SECRET") {
		t.Fatal("guard failure not redacted", e)
	}
}

func TestPreflightRejectsInheritedSuperuser(t *testing.T) {
	m := &alteredSession{mock: &mock{}, override: func(q string) (Result, bool) {
		if q != rolesSQL {
			return Result{}, false
		}
		r, _ := (&mock{}).Query(context.Background(), q)
		r.Rows = append(r.Rows, map[string]any{"name": "unexpected_privileged_role", "member": true, "superuser": true})
		return r, true
	}}
	if _, e := preflight(context.Background(), m); e == nil {
		t.Fatal("superuser membership accepted")
	}
}

func TestPoolerAbortedRemoteCleanupStillResetsRole(t *testing.T) {
	m := &abortSession{mock: &mock{}}
	s, e := bindBackend(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Query(context.Background(), "select 2;"); e == nil {
		t.Fatal("expected simulated remote error")
	}
	if _, e = s.Query(context.Background(), "rollback; reset role"); e != nil || m.aborted {
		t.Fatal("remote cleanup prevented", e)
	}
}
