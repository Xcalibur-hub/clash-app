package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

func TestIdentityGateDiagnostics(t *testing.T) {
	cases := []struct {
		name, key string
		value     any
		code      string
	}{
		{"database", "db", "MOCK_SECRET", "database_mismatch"},
		{"current_role", "usr", "MOCK_SECRET", "current_role_mismatch"},
		{"session_role", "login", "MOCK_SECRET", "session_role_mismatch"},
		{"ssl_false", "ssl", false, "backend_ssl_required"},
		{"ssl_null", "ssl", nil, "backend_ssl_unknown"},
		{"ssl_malformed", "ssl", "true", "identity_values_malformed"},
		{"database_malformed", "db", 42, "identity_values_malformed"},
		{"role_null", "usr", nil, "identity_values_malformed"},
		{"session_role_malformed", "login", []string{"postgres"}, "identity_values_malformed"},
		{"version_malformed", "version", "170006", "identity_values_malformed"},
		{"version_null", "version", nil, "identity_values_malformed"},
		{"wrong_version", "version", 180000, "postgres_17_required"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := poolConfig(t)
			c.RunDir = t.TempDir()
			c.recordPreflight = func(r map[string]any) error { return recordPreflight(c.RunDir, r) }
			m := &alteredSession{mock: &mock{}, override: func(q string) (Result, bool) {
				if q != identitySQL {
					return Result{}, false
				}
				r, _ := (&mock{}).Query(context.Background(), q)
				r.Rows[0][tc.key] = tc.value
				r.Rows[0]["unrestricted"] = "MOCK_SECRET"
				return r, true
			}}
			_, e := Run(context.Background(), c, "preflight", "preflight:"+c.ProjectRef, "MOCK_SECRET", func(context.Context, *pgx.ConnConfig) (Session, error) { return m, nil })
			if e == nil || e.Error() != tc.code {
				t.Fatal("wrong refusal", e)
			}
			b, e := os.ReadFile(filepath.Join(c.RunDir, "preflight.json"))
			if e != nil {
				t.Fatal(e)
			}
			var report struct {
				Gate identityDiagnostics `json:"identity_gate"`
			}
			if e = json.Unmarshal(b, &report); e != nil {
				t.Fatal(e)
			}
			d := report.Gate
			if d.FailureReason != tc.code || strings.Contains(string(b), "MOCK_SECRET") || strings.Contains(string(b), "unrestricted") {
				t.Fatal("unsafe/missing evidence", string(b))
			}
			if d.DatabaseMatch != (tc.key != "db") || d.CurrentRoleMatch != (tc.key != "usr") || d.SessionRoleMatch != (tc.key != "login") {
				t.Fatal("independent checks lost", d)
			}
			if tc.key == "ssl" {
				if tc.value == false {
					if d.BackendSSL != false {
						t.Fatal(d)
					}
				} else if d.BackendSSL != "unknown" {
					t.Fatal(d)
				}
			} else if d.BackendSSL != true {
				t.Fatal(d)
			}
			joined := strings.Join(m.queries, ";")
			if strings.Contains(joined, extensionsSQL) || !strings.Contains(joined, "rollback") {
				t.Fatal("gate failed to stop/rollback")
			}
		})
	}
}

func TestIdentityGateRowShape(t *testing.T) {
	for _, count := range []int{0, 2} {
		t.Run(string(rune('0'+count)), func(t *testing.T) {
			m := &alteredSession{mock: &mock{}, override: func(q string) (Result, bool) {
				if q != identitySQL {
					return Result{}, false
				}
				r := Result{}
				for i := 0; i < count; i++ {
					r.Rows = append(r.Rows, map[string]any{})
				}
				return r, true
			}}
			report, e := preflight(context.Background(), m)
			code := "identity_row_missing"
			if count == 2 {
				code = "identity_row_count_invalid"
			}
			d, ok := report["identity_gate"].(identityDiagnostics)
			if e == nil || e.Error() != code || !ok || d.FailureReason != code || d.BackendSSL != "unknown" {
				t.Fatal(report, e)
			}
		})
	}
}

func TestIdentityGateMalformedMissingAndMultipleFailures(t *testing.T) {
	m := &alteredSession{mock: &mock{}, override: func(q string) (Result, bool) {
		if q != identitySQL {
			return Result{}, false
		}
		return Result{Rows: []map[string]any{{"db": "wrong", "usr": "wrong", "login": "wrong", "version": 170006}}}, true
	}}
	d, e := inspectIdentity(context.Background(), m)
	if e == nil || d.DatabaseMatch || d.CurrentRoleMatch || d.SessionRoleMatch || d.BackendSSL != "unknown" || d.FailureReason != "database_mismatch" {
		t.Fatal(d, e)
	}
	// A missing SSL column, like a NULL/missing pg_stat_ssl row, must deny access.
	m.override = func(q string) (Result, bool) {
		if q != identitySQL {
			return Result{}, false
		}
		r, _ := (&mock{}).Query(context.Background(), q)
		delete(r.Rows[0], "ssl")
		return r, true
	}
	if d, e = inspectIdentity(context.Background(), m); e == nil || d.FailureReason != "backend_ssl_unknown" {
		t.Fatal(d, e)
	}
}

func TestIdentityGateQueryFailureAndChangedBackend(t *testing.T) {
	for _, changed := range []bool{false, true} {
		c := poolConfig(t)
		var saved map[string]any
		c.recordPreflight = func(r map[string]any) error { saved = r; return nil }
		m := &alteredSession{mock: &mock{fail: identitySQL}}
		if changed {
			m.mock.fail = ""
			m.change = "begin read only"
		}
		_, e := Run(context.Background(), c, "preflight", "preflight:"+c.ProjectRef, "MOCK_SECRET", func(context.Context, *pgx.ConnConfig) (Session, error) { return m, nil })
		if e == nil || strings.Contains(e.Error(), "MOCK_SECRET") {
			t.Fatal(e)
		}
		d, ok := saved["identity_gate"].(identityDiagnostics)
		if !ok || d.FailureReason != "identity_query_failed" || d.BackendSSL != "unknown" {
			t.Fatal(saved)
		}
		joined := strings.Join(m.queries, ";")
		if strings.Contains(joined, extensionsSQL) || !strings.Contains(joined, "rollback") {
			t.Fatal("did not stop")
		}
		if changed && strings.Contains(joined, identitySQL) {
			t.Fatal("queried replaced backend")
		}
	}
}

func TestIdentityGateEvidenceWriteFailure(t *testing.T) {
	c := poolConfig(t)
	c.recordPreflight = func(r map[string]any) error {
		if r["identity_gate"].(identityDiagnostics).FailureReason != "database_mismatch" {
			t.Fatal(r)
		}
		return errors.New("preflight evidence write failed")
	}
	m := &mock{badIdentity: true}
	_, e := Run(context.Background(), c, "preflight", "preflight:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || e.Error() != "preflight evidence write failed" || strings.Contains(strings.Join(m.queries, ";"), extensionsSQL) {
		t.Fatal(e)
	}
	// Actual filesystem failure is sanitized too; raw OS/path details do not escape.
	if e = recordPreflight(filepath.Join(t.TempDir(), "missing"), map[string]any{}); e == nil || e.Error() != "preflight evidence write failed" {
		t.Fatal(e)
	}
}

func TestIdentityGateSuccessAndPIDContract(t *testing.T) {
	d, e := inspectIdentity(context.Background(), &mock{})
	if e != nil || !d.DatabaseMatch || !d.CurrentRoleMatch || !d.SessionRoleMatch || d.BackendSSL != true || !d.VersionMatch || d.FailureReason != "none" {
		t.Fatal(d, e)
	}
	if !strings.Contains(identitySQL, "where pid=pg_backend_pid()") || strings.Contains(identitySQL, "coalesce") {
		t.Fatal("SSL observation contract changed")
	}
}
