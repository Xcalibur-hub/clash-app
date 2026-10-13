package main

import (
	"context"
	"os"
	"testing"
)

// Offline tests for the read-only verify-complete mode. They reuse the shared
// mock Session and the real prepared 106 artifacts; no socket is opened.

func verifyCompleteFullLedger(t *testing.T, c Config, a Artifact) []map[string]any {
	t.Helper()
	return ledgerPrefix(t, c, a, verifyCompleteExpectedCount)
}

func TestVerifyCompleteAcceptsCompleteState(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{ledger: verifyCompleteFullLedger(t, c, a), completeObjects: true}
	n, e := Run(context.Background(), c, "verify-complete", "verify-complete:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e != nil || n != 0 {
		t.Fatalf("n=%d err=%v", n, e)
	}
	if _, e := os.Stat(c.RunDir + string(os.PathSeparator) + "verify-complete.json"); e != nil {
		t.Fatalf("evidence not written: %v", e)
	}
}

func TestVerifyCompleteRejectsShortLedger(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{ledger: ledgerPrefix(t, c, a, 105), completeObjects: true}
	if _, e := Run(context.Background(), c, "verify-complete", "verify-complete:"+c.ProjectRef, "MOCK_SECRET", dialMock(m)); e == nil {
		t.Fatal("short ledger accepted")
	}
}

func TestVerifyCompleteRejectsMissingObjects(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{ledger: verifyCompleteFullLedger(t, c, a)}
	if _, e := Run(context.Background(), c, "verify-complete", "verify-complete:"+c.ProjectRef, "MOCK_SECRET", dialMock(m)); e == nil {
		t.Fatal("missing migrated objects accepted")
	}
}

func TestVerifyCompleteRejectsActiveCron(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{ledger: verifyCompleteFullLedger(t, c, a), completeObjects: true, cronActive: true}
	if _, e := Run(context.Background(), c, "verify-complete", "verify-complete:"+c.ProjectRef, "MOCK_SECRET", dialMock(m)); e == nil {
		t.Fatal("active cron accepted")
	}
}

func TestVerifyCompleteRejectsSameManifestDrift(t *testing.T) {
	c, _ := prepareResumeArtifacts(t)
	c.ArtifactHash = "8f50541d3eed55bd905117a217bc8118a6b5483d1ffec2e5d0477b2be71b8c8a"
	os.Mkdir(c.RunDir, 0700)
	if _, e := Run(context.Background(), c, "verify-complete", "verify-complete:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{})); e == nil {
		t.Fatal("stale manifest accepted")
	}
}

func TestVerifyCompleteRequiresOwnAuthorization(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{ledger: verifyCompleteFullLedger(t, c, a), completeObjects: true}
	if _, e := Run(context.Background(), c, "verify-complete", "investigate:"+c.ProjectRef, "MOCK_SECRET", dialMock(m)); e == nil {
		t.Fatal("cross-mode authorization accepted")
	}
}
