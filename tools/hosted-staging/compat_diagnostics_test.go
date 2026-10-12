package main

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestPgcryptoAcceptableOwners(t *testing.T) {
	for _, owner := range []string{"supabase_admin", "postgres"} {
		if !pgcryptoAcceptableOwner(owner) {
			t.Fatalf("managed owner refused: %s", owner)
		}
	}
	for _, owner := range []string{"", "anon", "authenticated", "service_role", "untrusted_owner", "supabase_auth_admin"} {
		if pgcryptoAcceptableOwner(owner) {
			t.Fatalf("untrusted owner accepted: %s", owner)
		}
	}
}

func TestPgcryptoManagedReadyRequiresSchemaVersionAndOwner(t *testing.T) {
	ok := []map[string]any{{"name": "pgcrypto", "version": "1.3", "schema": "extensions", "owner": "postgres"}}
	if !pgcryptoManagedReady(ok) {
		t.Fatal("postgres-owned extensions.pgcrypto 1.3 refused")
	}
	ok[0]["owner"] = "supabase_admin"
	if !pgcryptoManagedReady(ok) {
		t.Fatal("supabase_admin-owned extensions.pgcrypto 1.3 refused")
	}
	cases := []map[string]any{
		{"name": "pgcrypto", "version": "1.3", "schema": "public", "owner": "postgres"},
		{"name": "pgcrypto", "version": "1.2", "schema": "extensions", "owner": "postgres"},
		{"name": "pgcrypto", "version": "1.3", "schema": "extensions", "owner": "nobody"},
		{"name": "postgis", "version": "1.3", "schema": "extensions", "owner": "postgres"},
	}
	for i, row := range cases {
		if pgcryptoManagedReady([]map[string]any{row}) {
			t.Fatalf("invalid pgcrypto accepted at %d: %#v", i, row)
		}
	}
}

func TestPreflightAcceptsPostgresOwnedPgcrypto(t *testing.T) {
	m := &alteredSession{mock: &mock{}}
	m.override = func(q string) (Result, bool) {
		if q != extensionsSQL {
			return Result{}, false
		}
		return Result{Rows: []map[string]any{{"name": "pgcrypto", "version": "1.3", "schema": "extensions", "owner": "postgres"}}}, true
	}
	if _, e := preflight(context.Background(), m); e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(strings.Join(m.queries, ";"), unexpectedSchemaNamesSQL) {
		t.Fatal("unexpected schema name inventory not queried")
	}
}

func TestUnexpectedSchemaNamesRecordedAndStillDenied(t *testing.T) {
	m := &alteredSession{mock: &mock{}}
	m.override = func(q string) (Result, bool) {
		switch q {
		case objectsSQL:
			return Result{Rows: []map[string]any{{"relations": 0, "routines": 0, "types": 0, "unexpected_schemas": 1}}}, true
		case unexpectedSchemaNamesSQL:
			return Result{Rows: []map[string]any{{"name": "mystery_managed"}}}, true
		default:
			return Result{}, false
		}
	}
	report, e := preflight(context.Background(), m)
	if e == nil || e.Error() != "unexpected application objects; review required" {
		t.Fatal("unexpected schema must remain fail-closed", e)
	}
	rows, ok := report["unexpected_schema_names"].([]map[string]any)
	if !ok || len(rows) != 1 || fmt.Sprint(rows[0]["name"]) != "mystery_managed" {
		t.Fatalf("schema name inventory missing: %#v", report["unexpected_schema_names"])
	}
	// Names-only inventory must never request table contents.
	for _, q := range m.queries {
		if strings.Contains(strings.ToLower(q), " from mystery_managed") || strings.Contains(q, "pg_class") && strings.Contains(q, "mystery_managed") {
			t.Fatal("content probe detected", q)
		}
	}
}

func TestManagedSchemaAllowlistSharedByCountAndNameQueries(t *testing.T) {
	if !strings.Contains(objectsSQL, managedSchemaAllowlist) || !strings.Contains(unexpectedSchemaNamesSQL, managedSchemaAllowlist) {
		t.Fatal("count and name queries drifted apart")
	}
	if !strings.Contains(unexpectedSchemaNamesSQL, "order by n.nspname limit 32") {
		t.Fatal("name inventory must stay bounded")
	}
	if strings.Contains(unexpectedSchemaNamesSQL, "pg_class") || strings.Contains(unexpectedSchemaNamesSQL, "pg_proc") {
		t.Fatal("name inventory must not join object catalogs")
	}
}

func TestManagedSchemaAllowlistIncludesDocumentedPgbouncer(t *testing.T) {
	if !strings.Contains(managedSchemaAllowlist, "'pgbouncer'") {
		t.Fatal("documented supabase/postgres pgbouncer schema missing from allowlist")
	}
}

func TestPreflightAcceptsSolePgbouncerManagedSchema(t *testing.T) {
	// Mimic Step 6G inventory shape after allowlisting: zero unexpected schemas.
	m := &alteredSession{mock: &mock{}}
	m.override = func(q string) (Result, bool) {
		switch q {
		case objectsSQL:
			return Result{Rows: []map[string]any{{"relations": 0, "routines": 0, "types": 0, "unexpected_schemas": 0}}}, true
		case unexpectedSchemaNamesSQL:
			return Result{Rows: []map[string]any{}}, true
		default:
			return Result{}, false
		}
	}
	if _, e := preflight(context.Background(), m); e != nil {
		t.Fatal(e)
	}
}

func TestPreflightStillRejectsUnknownSchema(t *testing.T) {
	m := &alteredSession{mock: &mock{}}
	m.override = func(q string) (Result, bool) {
		switch q {
		case objectsSQL:
			return Result{Rows: []map[string]any{{"relations": 0, "routines": 0, "types": 0, "unexpected_schemas": 1}}}, true
		case unexpectedSchemaNamesSQL:
			return Result{Rows: []map[string]any{{"name": "app_private"}}}, true
		default:
			return Result{}, false
		}
	}
	report, e := preflight(context.Background(), m)
	if e == nil || e.Error() != "unexpected application objects; review required" {
		t.Fatal("unknown schema must remain fail-closed", e)
	}
	rows, _ := report["unexpected_schema_names"].([]map[string]any)
	if len(rows) != 1 || fmt.Sprint(rows[0]["name"]) != "app_private" {
		t.Fatalf("unknown schema name not retained: %#v", report["unexpected_schema_names"])
	}
}
