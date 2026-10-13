package main

import (
	"context"
	"os"
	"testing"
)

// Offline tests for the read-only verify-complete mode. They reuse the shared
// mock Session and the real prepared 106 artifacts; no socket is opened.

// verifyCompleteMock returns a happy-path mock for the read-only verifier:
// full 106-entry ledger, all expected objects, managed extensions and services.
func verifyCompleteMock(t *testing.T, c Config, a Artifact) *mock {
	t.Helper()
	return &mock{
		ledger:          ledgerPrefix(t, c, a, verifyCompleteExpectedCount),
		completeObjects: true,
		installedExts: []map[string]any{
			{"name": "pgcrypto", "version": "1.3", "schema": "extensions", "owner": "supabase_admin"},
			{"name": "pg_cron", "version": "1.6.4", "schema": "pg_catalog", "owner": "supabase_admin"},
			{"name": "postgis", "version": "3.5.0", "schema": "extensions", "owner": "supabase_admin"},
		},
	}
}

func runVerifyComplete(t *testing.T, c Config, m *mock, auth string) error {
	t.Helper()
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "verify-complete", auth, "MOCK_SECRET", dialMock(m))
	return e
}

func TestVerifyCompleteAcceptsCompleteState(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	if e := runVerifyComplete(t, c, verifyCompleteMock(t, c, a), "verify-complete:"+c.ProjectRef); e != nil {
		t.Fatalf("err=%v", e)
	}
	if _, e := os.Stat(c.RunDir + string(os.PathSeparator) + "verify-complete.json"); e != nil {
		t.Fatalf("evidence not written: %v", e)
	}
}

func TestVerifyCompleteRejectsShortLedger(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	m := verifyCompleteMock(t, c, a)
	m.ledger = ledgerPrefix(t, c, a, 105)
	if e := runVerifyComplete(t, c, m, "verify-complete:"+c.ProjectRef); e == nil {
		t.Fatal("short ledger accepted")
	}
}

func TestVerifyCompleteRejectsMissingObjects(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	m := verifyCompleteMock(t, c, a)
	m.completeObjects = false
	if e := runVerifyComplete(t, c, m, "verify-complete:"+c.ProjectRef); e == nil {
		t.Fatal("missing migrated objects accepted")
	}
}

func TestVerifyCompleteRejectsActiveCron(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	m := verifyCompleteMock(t, c, a)
	m.cronActive = true
	if e := runVerifyComplete(t, c, m, "verify-complete:"+c.ProjectRef); e == nil {
		t.Fatal("active cron accepted")
	}
}

func TestVerifyCompleteRejectsSameManifestDrift(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	c.ArtifactHash = "8f50541d3eed55bd905117a217bc8118a6b5483d1ffec2e5d0477b2be71b8c8a"
	m := verifyCompleteMock(t, c, a)
	if e := runVerifyComplete(t, c, m, "verify-complete:"+c.ProjectRef); e == nil {
		t.Fatal("stale manifest accepted")
	}
}

func TestVerifyCompleteRequiresOwnAuthorization(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	m := verifyCompleteMock(t, c, a)
	if e := runVerifyComplete(t, c, m, "investigate:"+c.ProjectRef); e == nil {
		t.Fatal("cross-mode authorization accepted")
	}
}
