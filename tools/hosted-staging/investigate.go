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

// Quarantine investigation: read-only catalog/ledger probes only.
// Never executes migration bodies, DDL, or application RPCs.

const investigatePgcryptoSQL = `select e.extversion as version, n.nspname as schema, pg_get_userbyid(e.extowner) as owner,
  (pg_get_userbyid(e.extowner)='supabase_admin') as owner_is_supabase_admin,
  (pg_get_userbyid(e.extowner)='postgres') as owner_is_postgres
  from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'`

const investigatePgcryptoAssertSQL = `select exists(
  select 1 from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid=e.extnamespace
  join pg_catalog.pg_roles r on r.oid=e.extowner
  where e.extname='pgcrypto' and e.extversion='1.3'
    and n.nspname='extensions' and r.rolname in ('postgres', 'supabase_admin')
) as artifact_assert_would_pass`

const investigateMig44ObjectsSQL = `select
  to_regclass('public.explore_challenge_participants') is not null as explore_challenge_participants,
  to_regclass('public.explore_challenge_entries') is not null as explore_challenge_entries,
  to_regclass('public.explore_challenge_entry_reactions') is not null as explore_challenge_entry_reactions,
  to_regclass('public.explore_challenge_results') is not null as explore_challenge_results,
  to_regclass('public.explore_treasure_clues') is not null as explore_treasure_clues,
  to_regclass('public.explore_treasure_clue_progress') is not null as explore_treasure_clue_progress,
  to_regclass('public.explore_treasure_reward_claims') is not null as explore_treasure_reward_claims,
  to_regtype('public.explore_entry_status') is not null as explore_entry_status,
  to_regtype('public.explore_treasure_type') is not null as explore_treasure_type,
  to_regtype('public.explore_clue_type') is not null as explore_clue_type,
  to_regtype('public.explore_content_target') is not null as explore_content_target,
  to_regprocedure('public.explore_answer_digest(text,text)') is not null as explore_answer_digest,
  to_regprocedure('public.join_challenge(text)') is not null as join_challenge,
  to_regprocedure('public.settle_challenge(text)') is not null as settle_challenge,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='explore_challenges' and column_name='reward_type') as explore_challenges_reward_type,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='explore_treasure_hunts' and column_name='hunt_type') as explore_treasure_hunts_hunt_type,
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname='notification_kind' and e.enumlabel='challenge_result') as notification_kind_challenge_result`

const investigateCronSQL = `select jobid::text as jobid, jobname, schedule, command, username, active
  from cron.job where jobname='clash-maintenance' order by jobid`

const investigateCronRunsSQL = `select count(*)::int as runs_1h,
  count(*) filter (where status='succeeded')::int as succeeded_1h,
  count(*) filter (where status='failed')::int as failed_1h
  from cron.job_run_details d
  join cron.job j on j.jobid=d.jobid
  where j.jobname='clash-maintenance' and d.start_time > now() - interval '1 hour'`

const investigatePrefixCount = 43
const investigateFailedVersion = "20261004120000"
const investigateFailedName = "explore_play_system"

func investigate(ctx context.Context, s Session, c Config, a Artifact) (report map[string]any, err error) {
	report = map[string]any{
		"mode":                       "investigate",
		"project_ref":                c.ProjectRef,
		"candidate":                  seal,
		"expected_committed_prefix":  investigatePrefixCount,
		"failed_migration_version":   investigateFailedVersion,
		"failed_migration_name":      investigateFailedName,
		"original_sqlstate":          "unavailable",
		"original_sqlstate_reason":   "executor redacts database errors as database operation failed; diagnostics withheld",
		"database_security_passed":   false,
		"quarantine_retained":        true,
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

	pg, e := query(ctx, s, investigatePgcryptoSQL)
	if e != nil {
		return report, e
	}
	report["pgcrypto"] = pg.Rows
	assertRow, e := query(ctx, s, investigatePgcryptoAssertSQL)
	if e != nil {
		return report, e
	}
	report["artifact_pgcrypto_assert"] = assertRow.Rows

	l, e := ledger(ctx, s)
	if e != nil {
		return report, e
	}
	report["ledger_count"] = len(l)
	entries := make([]map[string]any, 0, len(l))
	prefixOK := len(l) == investigatePrefixCount
	unexpected := false
	hasFailed := false
	for i, v := range l {
		version := fmt.Sprint(v["version"])
		name := fmt.Sprint(v["name"])
		var statements []string
		hashOK := false
		expectedLabel := ""
		if i < len(a.Files) {
			expected := filepath.Base(a.Files[i].Path)
			expectedLabel = expected
			if version == expected[:14] && name == strings.TrimSuffix(expected[15:], ".sql") {
				if json.Unmarshal([]byte(fmt.Sprint(v["statements_json"])), &statements) == nil && len(statements) == 1 && digest([]byte(statements[0])) == a.Files[i].Hash {
					hashOK = true
				}
			} else {
				prefixOK = false
			}
		} else {
			prefixOK = false
			unexpected = true
		}
		if version == investigateFailedVersion || name == investigateFailedName {
			hasFailed = true
			unexpected = true
			prefixOK = false
		}
		entries = append(entries, map[string]any{
			"index":           i + 1,
			"version":         version,
			"name":            name,
			"hash_match":      hashOK,
			"expected_file":   expectedLabel,
		})
	}
	if len(l) > investigatePrefixCount {
		unexpected = true
		prefixOK = false
	}
	if len(l) < investigatePrefixCount {
		prefixOK = false
	}
	for i := 0; i < len(l) && i < investigatePrefixCount; i++ {
		if entries[i]["hash_match"] != true {
			prefixOK = false
		}
	}
	report["ledger_entries"] = entries
	report["first_43_integrity"] = prefixOK && !hasFailed && len(l) == investigatePrefixCount
	report["migration_44_ledger_entry"] = hasFailed
	report["unexpected_ledger_entries"] = unexpected || hasFailed || len(l) != investigatePrefixCount

	objs, e := query(ctx, s, investigateMig44ObjectsSQL)
	if e != nil {
		return report, e
	}
	report["migration_44_objects"] = objs.Rows
	anyMig44 := false
	if len(objs.Rows) == 1 {
		for k, v := range objs.Rows[0] {
			if v == true {
				anyMig44 = true
				_ = k
			}
		}
	}
	report["migration_44_objects_present"] = anyMig44
	switch {
	case !anyMig44 && !hasFailed && prefixOK:
		report["migration_44_rollback"] = "confirmed_absent"
	case anyMig44:
		report["migration_44_rollback"] = "objects_present_uncertain_or_partial"
	default:
		report["migration_44_rollback"] = "uncertain"
	}

	cronCat, e := query(ctx, s, `select to_regclass('cron.job') is not null as cron_catalog`)
	if e != nil {
		return report, e
	}
	report["cron_catalog"] = cronCat.Rows
	if len(cronCat.Rows) == 1 && cronCat.Rows[0]["cron_catalog"] == true {
		jobs, e := query(ctx, s, investigateCronSQL)
		if e != nil {
			return report, e
		}
		report["clash_maintenance_jobs"] = jobs.Rows
		runs, e := query(ctx, s, investigateCronRunsSQL)
		if e != nil {
			return report, e
		}
		report["clash_maintenance_runs_1h"] = runs.Rows
	}

	if id.FailureReason != "none" && id.FailureReason != "" {
		return report, errors.New("target identity differs; stop")
	}
	if !prefixOK || unexpected || hasFailed {
		report["stop_condition"] = "ledger_prefix_mismatch_or_unexpected"
		// Still return report for evidence; caller treats as investigation complete with quarantine retained.
		return report, errors.New("ledger data differs from expected committed prefix; quarantine retained")
	}
	if anyMig44 {
		report["stop_condition"] = "unexpected_migration_44_objects"
		return report, errors.New("unexpected application modifications; quarantine retained")
	}
	report["stop_condition"] = "none"
	report["failure_classification"] = map[string]any{
		"most_likely": "artifact_pgcrypto_owner_assert_requires_supabase_admin_but_hosted_owner_is_postgres",
		"evidence":    "offline artifact assert + live pgcrypto owner + artifact_assert_would_pass",
		"sqlstate":    "unavailable_from_original_migrate",
	}
	return report, nil
}

func saveInvestigate(dir string, report map[string]any) error {
	b, e := json.MarshalIndent(report, "", "  ")
	if e != nil {
		return errors.New("investigate evidence encoding failed")
	}
	if e = os.WriteFile(filepath.Join(dir, "investigate.json"), append(b, '\n'), 0600); e != nil {
		return errors.New("investigate evidence write failed")
	}
	return nil
}
