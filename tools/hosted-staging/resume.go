package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Resume recovers quarantined clash-staging from the verified 43-migration prefix.
// It never weakens empty-database migrate preflight and never repairs ledger rows.

const resumeRequiredManifest = "5c39f97c62559b1f5ed175be409480fb3515fded61a16f0b1b33cc3e22768110"
const resumeArtifact44Hash = "380b693fd09edcefbe30028c8ed5de72ae9716776198f1d45c6ed8a1ef17f261"
const resumePrefixCount = 43
const resumeStartIndex = 43 // 0-based; first migration applied by resume
const resumeAdvisoryLockKey int64 = 872314059

const resumePrefixDepsSQL = `select
  to_regclass('public.explore_challenges') is not null as explore_challenges,
  to_regclass('public.explore_treasure_hunts') is not null as explore_treasure_hunts,
  to_regclass('public.explore_treasure_progress') is not null as explore_treasure_progress,
  to_regclass('public.profiles') is not null as profiles,
  to_regclass('public.media_objects') is not null as media_objects`

const resumeLockSQL = `select pg_try_advisory_lock($1) as acquired`
const resumeUnlockSQL = `select pg_advisory_unlock($1) as released`

func verifyExactLedgerPrefix(l []map[string]any, a Artifact, expectedCount int) error {
	if expectedCount < 0 || expectedCount > len(a.Files) {
		return errors.New("invalid expected ledger prefix count")
	}
	if len(l) != expectedCount {
		return errors.New("ledger prefix count mismatch")
	}
	seen := map[string]bool{}
	for i := 0; i < expectedCount; i++ {
		expected := filepath.Base(a.Files[i].Path)
		version := fmt.Sprint(l[i]["version"])
		name := fmt.Sprint(l[i]["name"])
		// Migration 44 may only appear once resume has applied it (expectedCount > 43).
		if expectedCount == resumePrefixCount && (version == investigateFailedVersion || name == investigateFailedName) {
			return errors.New("migration 44 present in ledger prefix")
		}
		if version != expected[:14] || name != strings.TrimSuffix(expected[15:], ".sql") {
			return errors.New("ledger ordering/name mismatch")
		}
		key := version + "/" + name
		if seen[key] {
			return errors.New("duplicated ledger row")
		}
		seen[key] = true
		var statements []string
		if json.Unmarshal([]byte(fmt.Sprint(l[i]["statements_json"])), &statements) != nil || len(statements) != 1 || digest([]byte(statements[0])) != a.Files[i].Hash {
			return errors.New("ledger statement hash mismatch")
		}
	}
	return nil
}

func resumeArtifactGates(c Config, a Artifact) error {
	if c.ArtifactHash != resumeRequiredManifest {
		return errors.New("resume requires corrected compatibility manifest")
	}
	if len(a.Files) != 106 {
		return errors.New("resume requires exactly 106 artifacts")
	}
	if a.Candidate != seal || a.Manifest != frozenManifest {
		return errors.New("frozen lineage mismatch")
	}
	if a.Files[resumeStartIndex].Hash != resumeArtifact44Hash {
		return errors.New("corrected artifact 44 required")
	}
	expected := filepath.Base(a.Files[resumeStartIndex].Path)
	if !strings.HasPrefix(expected, "20261004120000_") || !strings.HasSuffix(expected, ".sql") {
		return errors.New("resume start migration path mismatch")
	}
	return nil
}

func anyTrueRow(row map[string]any) bool {
	for _, v := range row {
		if v == true {
			return true
		}
	}
	return false
}

func allTrueRow(row map[string]any) bool {
	if len(row) == 0 {
		return false
	}
	for _, v := range row {
		if v != true {
			return false
		}
	}
	return true
}

func resumePreflight(ctx context.Context, s Session, c Config, a Artifact) (report map[string]any, err error) {
	report = map[string]any{
		"mode":                      "resume-preflight",
		"project_ref":               c.ProjectRef,
		"candidate":                 seal,
		"expected_committed_prefix": resumePrefixCount,
		"database_security_passed":  false,
		"cron_policy":               "active_clash_maintenance_refused",
	}
	if e := resumeArtifactGates(c, a); e != nil {
		return report, e
	}
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
	if _, e := query(ctx, s, "select set_config('statement_timeout','15000',true)"); e != nil {
		return report, e
	}
	id, e := inspectIdentity(ctx, s)
	report["identity_gate"] = id
	if e != nil {
		return report, e
	}
	ext, e := query(ctx, s, extensionsSQL)
	if e != nil {
		return report, e
	}
	report["installed_extensions"] = ext.Rows
	if !pgcryptoManagedReady(ext.Rows) {
		return report, errors.New("managed pgcrypto prerequisite mismatch")
	}
	managed, e := query(ctx, s, managedSQL)
	if e != nil {
		return report, e
	}
	report["managed"] = managed.Rows
	if len(managed.Rows) != 1 || managed.Rows[0]["managed"] != true || managed.Rows[0]["publication"] != true {
		return report, errors.New("managed service inventory mismatch")
	}
	schemas, e := query(ctx, s, unexpectedSchemaNamesSQL)
	if e != nil {
		return report, e
	}
	report["unexpected_schema_names"] = schemas.Rows
	if len(schemas.Rows) != 0 {
		return report, errors.New("unexpected schemas; quarantine retained")
	}
	data, e := query(ctx, s, dataSQL)
	if e != nil {
		return report, e
	}
	report["existing_data"] = data.Rows
	if len(data.Rows) != 1 || data.Rows[0]["users"] != false || data.Rows[0]["objects"] != false || data.Rows[0]["buckets"] != false {
		return report, errors.New("unexpected auth or storage data; quarantine retained")
	}
	deps, e := query(ctx, s, resumePrefixDepsSQL)
	if e != nil {
		return report, e
	}
	report["prefix_dependencies"] = deps.Rows
	if len(deps.Rows) != 1 || !allTrueRow(deps.Rows[0]) {
		return report, errors.New("required prefix-43 dependencies missing")
	}
	objs, e := query(ctx, s, investigateMig44ObjectsSQL)
	if e != nil {
		return report, e
	}
	report["migration_44_objects"] = objs.Rows
	if len(objs.Rows) != 1 || anyTrueRow(objs.Rows[0]) {
		return report, errors.New("unexpected migration-44 objects; quarantine retained")
	}
	l, e := ledger(ctx, s)
	if e != nil {
		return report, e
	}
	report["ledger_count"] = len(l)
	if e := verifyExactLedgerPrefix(l, a, resumePrefixCount); e != nil {
		return report, e
	}
	report["first_43_integrity"] = true
	report["migration_44_ledger_entry"] = false

	cronCat, e := query(ctx, s, `select to_regclass('cron.job') is not null as cron_catalog`)
	if e != nil {
		return report, e
	}
	report["cron_catalog"] = cronCat.Rows
	if len(cronCat.Rows) != 1 || cronCat.Rows[0]["cron_catalog"] != true {
		return report, errors.New("cron catalog required for resume safety assessment")
	}
	jobs, e := query(ctx, s, investigateCronSQL)
	if e != nil {
		return report, e
	}
	report["clash_maintenance_jobs"] = jobs.Rows
	active := false
	for _, j := range jobs.Rows {
		if j["active"] == true {
			active = true
		}
	}
	report["clash_maintenance_active"] = active
	if active || len(jobs.Rows) == 0 {
		// Active maintenance coexists with DDL only with residual lock risk; fail closed.
		// Missing job after scheduler migration is unexpected drift.
		if active {
			return report, errors.New("active clash-maintenance refused; authorize cron pause before resume")
		}
		return report, errors.New("clash-maintenance job missing; unexpected scheduler drift")
	}
	report["cron_safety"] = "inactive_job_present_accepted"
	return report, nil
}

func saveResumePreflight(dir string, report map[string]any) error {
	b, e := json.MarshalIndent(report, "", "  ")
	if e != nil {
		return errors.New("resume preflight evidence encoding failed")
	}
	if e = os.WriteFile(filepath.Join(dir, "resume-preflight.json"), append(b, '\n'), 0600); e != nil {
		return errors.New("resume preflight evidence write failed")
	}
	return nil
}

func acquireResumeLock(ctx context.Context, s Session) error {
	r, e := query(ctx, s, resumeLockSQL, resumeAdvisoryLockKey)
	if e != nil {
		return e
	}
	if len(r.Rows) != 1 || r.Rows[0]["acquired"] != true {
		return errors.New("concurrent recovery rejected; advisory lock unavailable")
	}
	return nil
}

func releaseResumeLock(ctx context.Context, s Session) error {
	r, e := query(ctx, s, resumeUnlockSQL, resumeAdvisoryLockKey)
	if e != nil {
		return errors.New("resume lock release unconfirmed; stop")
	}
	if len(r.Rows) != 1 || r.Rows[0]["released"] != true {
		return errors.New("resume lock release unconfirmed; stop")
	}
	return nil
}

func revalidateResumeProgress(ctx context.Context, s Session, a Artifact, applied int) error {
	l, e := ledger(ctx, s)
	if e != nil {
		return e
	}
	expected := resumePrefixCount + applied
	if e := verifyExactLedgerPrefix(l, a, expected); e != nil {
		return e
	}
	return nil
}

func resume(ctx context.Context, s Session, c Config, a Artifact) (completed int, err error) {
	if e := resumeArtifactGates(c, a); e != nil {
		return 0, e
	}
	report, e := resumePreflight(ctx, s, c, a)
	if evidenceErr := saveResumePreflight(c.RunDir, report); evidenceErr != nil {
		return 0, evidenceErr
	}
	if e != nil {
		return 0, e
	}
	if e := acquireResumeLock(ctx, s); e != nil {
		return 0, e
	}
	defer func() {
		c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if unlockErr := releaseResumeLock(c, s); unlockErr != nil && err == nil {
			err = unlockErr
		}
	}()
	// Revalidate after lock: concurrent writers must not have advanced the ledger.
	if e := revalidateResumeProgress(ctx, s, a, 0); e != nil {
		return 0, errors.New("ledger changed before resume execution; quarantine retained")
	}
	for i := resumeStartIndex; i < len(a.Files); i++ {
		if e := revalidateResumeProgress(ctx, s, a, completed); e != nil {
			return completed, errors.New("ledger changed during resume; quarantine retained")
		}
		n := filepath.Base(a.Files[i].Path)
		sql, e := os.ReadFile(filepath.Join(c.ArtifactDir, "migrations", n))
		if e != nil || digest(sql) != a.Files[i].Hash {
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
		if e := revalidateResumeProgress(ctx, s, a, completed); e != nil {
			return completed, errors.New("ledger verification failed")
		}
	}
	return completed, nil
}
