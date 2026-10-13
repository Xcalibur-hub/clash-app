package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

var (
	resumeArtifactsOnce sync.Once
	resumeArtifactDir   string
	resumeArtifactHash  string
	resumeSuiteHash     string
	resumeArtifactsErr  error
)

func ensureResumeArtifacts(t *testing.T) {
	t.Helper()
	resumeArtifactsOnce.Do(func() {
		root := filepath.Clean(filepath.Join("..", ".."))
		scratch, e := os.MkdirTemp("", "clash-resume-artifacts-")
		if e != nil {
			resumeArtifactsErr = e
			return
		}
		dest := filepath.Join(scratch, "migration-compatibility-6n-test")
		cmd := exec.Command("node", "-e", `
const path=require('path');
const {generate,prepare,verify}=require('./scripts/migration-compatibility-artifact.cjs');
const {bundle}=require('./tools/hosted-staging/prepare.cjs');
const dest=process.argv[1];
const scratch=path.dirname(dest);
generate(scratch, dest);
verify(dest, prepare());
const fs=require('fs');
const {hash}=require('./tools/isolated-supabase/prepare.cjs');
const b=bundle();
const bytes=Buffer.from(JSON.stringify(b,null,2)+'\n');
fs.writeFileSync(path.join(dest,'hosted-suites.json'), bytes, {flag:'wx'});
process.stdout.write(JSON.stringify({
  artifact_manifest_sha256: hash(fs.readFileSync(path.join(dest,'compatibility-manifest.json'))),
  suite_manifest_sha256: hash(bytes)
}));
`, dest)
		cmd.Dir = root
		out, e := cmd.CombinedOutput()
		if e != nil {
			resumeArtifactsErr = e
			return
		}
		var hashes struct {
			Artifact string `json:"artifact_manifest_sha256"`
			Suite    string `json:"suite_manifest_sha256"`
		}
		if json.Unmarshal(out, &hashes) != nil || hashes.Artifact != resumeRequiredManifest {
			resumeArtifactsErr = errString("unexpected prepared manifest: " + string(out))
			return
		}
		resumeArtifactDir = dest
		resumeArtifactHash = hashes.Artifact
		resumeSuiteHash = hashes.Suite
	})
	if resumeArtifactsErr != nil {
		t.Fatalf("prepare artifacts: %v", resumeArtifactsErr)
	}
}

type errString string

func (e errString) Error() string { return string(e) }

func prepareResumeArtifacts(t *testing.T) (Config, Artifact) {
	t.Helper()
	noPG(t)
	ensureResumeArtifacts(t)
	c := configTest(t)
	c.ArtifactDir = resumeArtifactDir
	c.ArtifactHash = resumeArtifactHash
	c.SuiteHash = resumeSuiteHash
	c.RunDir = filepath.Join(t.TempDir(), "attempt")
	a, e := artifacts(c)
	if e != nil {
		t.Fatal(e)
	}
	if a.Files[resumeStartIndex].Hash != resumeArtifact44Hash {
		t.Fatal("prepared artifact 44 hash mismatch")
	}
	return c, a
}

func ledgerPrefix(t *testing.T, c Config, a Artifact, n int) []map[string]any {
	t.Helper()
	out := make([]map[string]any, 0, n)
	for i := 0; i < n; i++ {
		name := filepath.Base(a.Files[i].Path)
		b, e := os.ReadFile(filepath.Join(c.ArtifactDir, "migrations", name))
		if e != nil {
			t.Fatal(e)
		}
		payload, _ := json.Marshal([]string{string(b)})
		out = append(out, map[string]any{
			"version":         name[:14],
			"name":            strings.TrimSuffix(name[15:], ".sql"),
			"statements_json": string(payload),
		})
	}
	return out
}

func TestResumeRequiresSeparateAuthorization(t *testing.T) {
	c, _ := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "resume", "migrate:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{}))
	if e == nil {
		t.Fatal("cross-mode authorization accepted")
	}
}

func TestResumeRejectsOldManifest(t *testing.T) {
	c, _ := prepareResumeArtifacts(t)
	c.ArtifactHash = "8f50541d3eed55bd905117a217bc8118a6b5483d1ffec2e5d0477b2be71b8c8a"
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{}))
	if e == nil {
		t.Fatal("old manifest accepted")
	}
	if !strings.Contains(e.Error(), "manifest") && !strings.Contains(e.Error(), "corrected") {
		t.Fatal(e)
	}
}

func TestResumeRejectsWrongCA(t *testing.T) {
	c, _ := prepareResumeArtifacts(t)
	c.CAHash = strings.Repeat("0", 64)
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{}))
	if e == nil {
		t.Fatal("wrong CA accepted")
	}
}

func TestResumeRejectsWrongTarget(t *testing.T) {
	c, _ := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{badIdentity: true, ledger: ledgerPrefix(t, c, mustArtifacts(t, c), 43)}
	_, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil {
		t.Fatal("wrong target accepted")
	}
}

func mustArtifacts(t *testing.T, c Config) Artifact {
	t.Helper()
	a, e := artifacts(c)
	if e != nil {
		t.Fatal(e)
	}
	return a
}

func TestResumeAcceptsExactPrefix43(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{ledger: ledgerPrefix(t, c, a, 43)}
	n, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e != nil || n != 63 {
		t.Fatalf("n=%d err=%v", n, e)
	}
	if len(m.ledger) != 106 {
		t.Fatalf("ledger=%d", len(m.ledger))
	}
	joined := strings.Join(m.queries, "\n")
	if strings.Contains(joined, createLedgerSQL) {
		t.Fatal("resume must not recreate ledger infrastructure via createLedgerSQL")
	}
	if !strings.Contains(joined, resumeLockSQL) || !strings.Contains(joined, resumeUnlockSQL) {
		t.Fatal("advisory lock missing")
	}
}

func TestResumeRejectsPrefix42Or44(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	for _, n := range []int{42, 44} {
		os.RemoveAll(c.RunDir)
		os.Mkdir(c.RunDir, 0700)
		m := &mock{ledger: ledgerPrefix(t, c, a, n)}
		_, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
		if e == nil {
			t.Fatalf("prefix %d accepted", n)
		}
	}
}

func TestResumeRejectsReorderedOrHashMismatch(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	l := ledgerPrefix(t, c, a, 43)
	l[0], l[1] = l[1], l[0]
	_, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{ledger: l}))
	if e == nil {
		t.Fatal("reordered ledger accepted")
	}
	os.RemoveAll(c.RunDir)
	os.Mkdir(c.RunDir, 0700)
	l = ledgerPrefix(t, c, a, 43)
	l[5]["statements_json"] = `["select 'tampered';"]`
	_, e = Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{ledger: l}))
	if e == nil {
		t.Fatal("hash mismatch accepted")
	}
}

func TestResumeRejectsDuplicateLedgerRow(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	l := ledgerPrefix(t, c, a, 43)
	l[10] = l[9]
	_, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{ledger: l}))
	if e == nil {
		t.Fatal("duplicate ledger accepted")
	}
}

func TestResumeRejectsMig44Objects(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{ledger: ledgerPrefix(t, c, a, 43), mig44Objects: true}
	_, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || !strings.Contains(e.Error(), "migration-44") {
		t.Fatal(e)
	}
}

func TestResumeRejectsActiveCron(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{ledger: ledgerPrefix(t, c, a, 43), cronActive: true}
	_, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || !strings.Contains(e.Error(), "clash-maintenance") {
		t.Fatal(e)
	}
}

func TestResumeRejectsConcurrentLock(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{ledger: ledgerPrefix(t, c, a, 43), lockHeld: true}
	_, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || !strings.Contains(e.Error(), "concurrent") {
		t.Fatal(e)
	}
}

func TestResumeStopsOnMigration44SQLFailure(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	first := filepath.Base(a.Files[resumeStartIndex].Path)
	body, _ := os.ReadFile(filepath.Join(c.ArtifactDir, "migrations", first))
	m := &mock{ledger: ledgerPrefix(t, c, a, 43), fail: string(body)}
	n, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || n != 0 || len(m.ledger) != 43 {
		t.Fatalf("n=%d ledger=%d err=%v", n, len(m.ledger), e)
	}
}

func TestResumeStopsAfterLaterCommitWithoutRetry(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	second := filepath.Base(a.Files[resumeStartIndex+1].Path)
	body, _ := os.ReadFile(filepath.Join(c.ArtifactDir, "migrations", second))
	m := &mock{ledger: ledgerPrefix(t, c, a, 43), fail: string(body)}
	n, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || n != 1 || len(m.ledger) != 44 {
		t.Fatalf("n=%d ledger=%d err=%v", n, len(m.ledger), e)
	}
	third := filepath.Base(a.Files[resumeStartIndex+2].Path)
	if strings.Contains(strings.Join(m.queries, "\n"), third) {
		t.Fatal("continued after failure")
	}
}

func TestResumeCommitUnknownQuarantines(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{ledger: ledgerPrefix(t, c, a, 43), fail: "commit"}
	n, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || n != 0 || !strings.Contains(e.Error(), "unknown") {
		t.Fatal(n, e)
	}
}

func TestResumeRollbackUnconfirmedQuarantines(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	first := filepath.Base(a.Files[resumeStartIndex].Path)
	body, _ := os.ReadFile(filepath.Join(c.ArtifactDir, "migrations", first))
	m := &mock{ledger: ledgerPrefix(t, c, a, 43), fail: string(body), rollbackFail: true}
	_, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || !strings.Contains(e.Error(), "rollback unconfirmed") {
		t.Fatal(e)
	}
}

func TestResumeEvidenceHasNoSecrets(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{ledger: ledgerPrefix(t, c, a, 43)}
	_, e := Run(context.Background(), c, "resume", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e != nil {
		t.Fatal(e)
	}
	data, _ := os.ReadFile(filepath.Join(c.RunDir, "resume-preflight.json"))
	if strings.Contains(string(data), "MOCK_SECRET") || strings.Contains(string(data), "ca.pem") {
		t.Fatal("secret leaked")
	}
}

func TestFreshMigrateStillRejectsNonemptyLedger(t *testing.T) {
	c := configTest(t)
	m := &mock{ledger: []map[string]any{{"version": "20260926120000", "name": "initial_arena_schema", "statements_json": "[]"}}}
	_, e := Run(context.Background(), c, "migrate", "migrate:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil {
		t.Fatal("fresh migrate accepted nonempty ledger")
	}
}

func TestVerifyExactLedgerPrefixHelpers(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	l := ledgerPrefix(t, c, a, 43)
	if e := verifyExactLedgerPrefix(l, a, 43); e != nil {
		t.Fatal(e)
	}
	if e := verifyExactLedgerPrefix(l[:42], a, 43); e == nil {
		t.Fatal("short prefix accepted")
	}
}
