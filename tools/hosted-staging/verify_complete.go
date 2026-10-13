package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// verify-complete: read-only post-deployment verification of the COMPLETE
// 106-migration state. Deliberately separate from the 43-migration recovery
// investigator (investigate). It never writes, repairs or resumes anything.

const verifyCompleteExpectedCount = 106

// Final-state assertions across the last authorized migration set (44-106).
const verifyCompleteObjectsSQL = `select
  to_regclass('public.comment_reply_notifications') is not null as v106_comment_reply_notifications,
  to_regclass('public.profile_clash_stats') is not null as profile_clash_stats,
  to_regclass('public.arena_interest_preferences') is not null as arena_interest_preferences,
  to_regclass('public.explore_challenge_results') is not null as explore_challenge_results,
  exists(select 1 from pg_policy where polrelid='public.reputation_events'::regclass
    and polname='reputation history owner boundary' and not polpermissive) as h3_reputation_owner_gate,
  not has_column_privilege('anon','public.course_lessons','body_text','select') as h2_lesson_body_guarded,
  not has_function_privilege('anon','public.clash_notify(text,text,public.notification_kind,text)','execute') as h1_notify_guarded,
  (select relrowsecurity from pg_class where oid='public.reputation_events'::regclass) as reputation_rls_enabled`

func verifyComplete(ctx context.Context, s Session, c Config, a Artifact) (report map[string]any, err error) {
	report = map[string]any{
		"mode": "verify-complete", "project_ref": c.ProjectRef, "candidate": seal,
		"expected_migrations": verifyCompleteExpectedCount, "database_security_passed": false,
	}
	if c.ArtifactHash != resumeRequiredManifest || len(a.Files) != verifyCompleteExpectedCount || a.Files[resumeStartIndex].Hash != resumeArtifact44Hash {
		return report, errors.New("verify-complete requires the corrected 106-artifact manifest")
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
	l, e := ledger(ctx, s)
	if e != nil {
		return report, e
	}
	report["ledger_count"] = len(l)
	if e := verifyExactLedgerPrefix(l, a, verifyCompleteExpectedCount); e != nil {
		return report, e
	}
	report["ledger_verified"] = true
	ext, e := query(ctx, s, extensionsSQL)
	if e != nil {
		return report, e
	}
	report["installed_extensions"] = ext.Rows
	if !pgcryptoManagedReady(ext.Rows) {
		return report, errors.New("managed pgcrypto prerequisite mismatch")
	}
	avail, e := query(ctx, s, availableExtensionsSQL)
	if e != nil {
		return report, e
	}
	available := map[string]bool{}
	for _, v := range avail.Rows {
		available[fmt.Sprint(v["name"])] = true
	}
	for _, name := range []string{"pgcrypto", "postgis", "pg_cron", "pgtap", "dblink"} {
		if !available[name] {
			return report, errors.New("required extension unavailable: " + name)
		}
	}
	schemas, e := query(ctx, s, unexpectedSchemaNamesSQL)
	if e != nil {
		return report, e
	}
	report["unexpected_schema_names"] = schemas.Rows
	if len(schemas.Rows) != 0 {
		return report, errors.New("unexpected schemas; schema drift detected")
	}
	buckets, users, objects, bucketCount, e := probeRecoveryStorage(ctx, s)
	if e != nil {
		return report, e
	}
	report["storage_buckets"] = buckets
	report["storage_bucket_count"] = bucketCount
	report["auth_user_count"] = users
	report["storage_object_count"] = objects
	class, e := verifyCompleteBucketInventory(buckets)
	report["storage_bucket_classification"] = class
	if e != nil {
		return report, e
	}
	managed, e := query(ctx, s, managedSQL)
	if e != nil {
		return report, e
	}
	report["managed"] = managed.Rows
	if len(managed.Rows) != 1 || managed.Rows[0]["managed"] != true || managed.Rows[0]["publication"] != true {
		return report, errors.New("managed service inventory mismatch")
	}
	objs, e := query(ctx, s, verifyCompleteObjectsSQL)
	if e != nil {
		return report, e
	}
	report["expected_objects"] = objs.Rows
	if len(objs.Rows) != 1 || !allTrueRow(objs.Rows[0]) {
		return report, errors.New("expected migrated objects missing; drift detected")
	}
	jobs, e := query(ctx, s, investigateCronSQL)
	if e != nil {
		return report, e
	}
	report["clash_maintenance_jobs"] = jobs.Rows
	if e := assertClashMaintenanceInactiveForResume(jobs.Rows); e != nil {
		report["clash_maintenance_active"] = len(jobs.Rows) > 0 && jobs.Rows[0]["active"] == true
		return report, e
	}
	report["clash_maintenance_active"] = false
	report["verified_complete"] = true
	return report, nil
}

func saveVerifyCompleteReport(dir string, report map[string]any) error {
	b, e := json.MarshalIndent(report, "", "  ")
	if e != nil {
		return errors.New("verify-complete evidence encoding failed")
	}
	if e = os.WriteFile(filepath.Join(dir, "verify-complete.json"), append(b, '\n'), 0600); e != nil {
		return errors.New("verify-complete evidence write failed")
	}
	return nil
}
