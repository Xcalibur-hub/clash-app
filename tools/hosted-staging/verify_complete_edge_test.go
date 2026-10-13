package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// Edge-case regressions for the read-only verify-complete mode.

func TestVerifyCompleteRejectsCronExecutionInProgress(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	m := verifyCompleteMock(t, c, a)
	m.pauseRunning = 1
	if e := runVerifyComplete(t, c, m, "verify-complete:"+c.ProjectRef); e == nil {
		t.Fatal("in-progress maintenance execution accepted")
	}
}

func TestVerifyCompleteRejectsUnfinishedStatusDrift(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	m := verifyCompleteMock(t, c, a)
	m.pauseHistoryMode = "unexpected"
	if e := runVerifyComplete(t, c, m, "verify-complete:"+c.ProjectRef); e == nil {
		t.Fatal("unexpected maintenance status accepted")
	}
}

func TestVerifyCompleteRejectsManagedDrift(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	m := verifyCompleteMock(t, c, a)
	m.managedRow = map[string]any{"managed": true, "publication": true, "restricted_role": true, "restricted_files": false, "cron_preloaded": true}
	if e := runVerifyComplete(t, c, m, "verify-complete:"+c.ProjectRef); e == nil {
		t.Fatal("managed inventory drift accepted")
	}
}

func TestVerifyCompleteRejectsMissingManagedInventory(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	m := verifyCompleteMock(t, c, a)
	m.managedRow = map[string]any{"managed": true, "publication": true, "restricted_role": true, "cron_preloaded": true}
	if e := runVerifyComplete(t, c, m, "verify-complete:"+c.ProjectRef); e == nil {
		t.Fatal("incomplete managed inventory accepted")
	}
}

func TestVerifyCompleteRequiresPgCronInstalled(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	m := verifyCompleteMock(t, c, a)
	m.installedExts = []map[string]any{{"name": "pgcrypto", "version": "1.3", "schema": "extensions", "owner": "supabase_admin"}}
	if e := runVerifyComplete(t, c, m, "verify-complete:"+c.ProjectRef); e == nil {
		t.Fatal("available-but-not-installed pg_cron accepted")
	}
}

func TestVerifyCompleteArtifactGatesRejectForeignLineage(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	foreign := a
	foreign.Candidate = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
	if e := verifyCompleteArtifactGates(c, foreign); e == nil {
		t.Fatal("foreign candidate accepted")
	}
	short := a
	short.Files = a.Files[:105]
	if e := verifyCompleteArtifactGates(c, short); e == nil {
		t.Fatal("105-artifact set accepted")
	}
	if e := verifyCompleteArtifactGates(Config{ArtifactHash: "x"}, a); e == nil {
		t.Fatal("wrong manifest accepted")
	}
}

// The object probe must never hard-error on a missing object: no erroring cast
// is permitted, and each check is guarded by to_regclass with a coalesce default.
func TestVerifyCompleteObjectProbeIsFailSafe(t *testing.T) {
	for _, forbidden := range []string{"::regclass", "::regprocedure"} {
		if strings.Contains(verifyCompleteObjectsSQL, forbidden) {
			t.Fatalf("object probe contains erroring cast %s", forbidden)
		}
	}
	required := []string{"to_regclass('public.course_lessons')", "to_regclass('public.reputation_events')", "coalesce(", "bool_and("}
	for _, r := range required {
		if !strings.Contains(verifyCompleteObjectsSQL, r) {
			t.Fatalf("object probe missing fail-safe guard %s", r)
		}
	}
}

// The probe must reference the real objects created by the final migrations
// (105 adds a function; 106 adds two functions and a trigger), never guessed
// names. This regressions the wrong-name false BLOCK found in Step 8 Part B.
func TestVerifyCompleteProbeCoversFinalMigrationsObjects(t *testing.T) {
	c, a := prepareResumeArtifacts(t)
	for _, name := range []string{"profile_clash_stats", "arena_comment_notify", "notify_arena_comment", "comments_notify_arena"} {
		if !strings.Contains(verifyCompleteObjectsSQL, name) {
			t.Fatalf("probe omits final-migration object %s", name)
		}
	}
	created := regexp.MustCompile(`(?i)create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_]+)`)
	for _, idx := range []int{104, 105} {
		base := filepath.Base(a.Files[idx].Path)
		b, e := os.ReadFile(filepath.Join(c.ArtifactDir, "migrations", base))
		if e != nil {
			t.Fatal(e)
		}
		for _, m := range created.FindAllStringSubmatch(string(b), -1) {
			if !strings.Contains(verifyCompleteObjectsSQL, m[1]) {
				t.Fatalf("artifact %s creates %s but the probe does not check it", base, m[1])
			}
		}
	}
}
