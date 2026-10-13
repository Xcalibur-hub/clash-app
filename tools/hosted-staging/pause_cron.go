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

// pause-cron deactivates exactly one clash-maintenance job without unscheduling.
// It does not migrate, resume, or alter any other scheduler state.

const pauseCronJobName = "clash-maintenance"
const pauseCronExpectedSchedule = "* * * * *"
const pauseCronExpectedCommand = "select public.run_maintenance(500)"
const pauseCronExpectedUsername = "postgres"
const pauseCronAdvisoryLockKey int64 = 872314060

const pauseCronAlterProcSQL = `select to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is not null as available`
const pauseCronSelectSQL = `select jobid::text as jobid, jobname, schedule, command, username, active
  from cron.job where jobname=$1 order by jobid`
const pauseCronAlterSQL = `select cron.alter_job($1::bigint, null, null, null, null, false)`

// History alone never proves quiescence. Unfinished/ambiguous run rows fail closed.
// Known in-progress statuses include starting/running plus connecting/sending.
const pauseCronHistorySQL = `select
  count(*) filter (
    where end_time is null
       or status in ('starting','running','connecting','sending')
  )::int as unfinished,
  count(*) filter (
    where end_time is null
      and coalesce(start_time, '-infinity'::timestamptz) <= now() - interval '15 minutes'
  )::int as stale_unfinished,
  count(*) filter (
    where end_time is null
      and status is not null
      and status not in ('starting','running','connecting','sending','succeeded','failed')
  )::int as unexpected_status,
  count(*)::int as history_rows
from cron.job_run_details
where jobid=$1::bigint
  and (
    end_time is null
    or start_time is null
    or start_time > now() - interval '30 minutes'
  )`

// Live backends matching the maintenance command (or unfinished run PIDs).
const pauseCronActivitySQL = `select
  (
    select count(*)::int
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
      and query ilike '%public.run_maintenance(500)%'
      and coalesce(state, '') <> 'idle'
  ) as active_backends,
  (
    select count(*)::int
    from cron.job_run_details d
    join pg_stat_activity a on a.pid = d.job_pid
    where d.jobid = $1::bigint
      and d.end_time is null
      and d.job_pid is not null
  ) as live_job_pids`

// Test seams for quiescence polling.
var pauseCronSleep = time.Sleep

var pauseCronPollInterval = 200 * time.Millisecond
var pauseCronQuiesceTimeout = 30 * time.Second

type pauseCronJob struct {
	JobID    string
	JobName  string
	Schedule string
	Command  string
	Username string
	Active   bool
}

type quiescenceSnapshot struct {
	Unfinished       int
	StaleUnfinished  int
	UnexpectedStatus int
	HistoryRows      int
	ActiveBackends   int
	LiveJobPIDs      int
}

func parsePauseCronJobs(rows []map[string]any) ([]pauseCronJob, error) {
	out := make([]pauseCronJob, 0, len(rows))
	for _, r := range rows {
		j := pauseCronJob{
			JobID:    fmt.Sprint(r["jobid"]),
			JobName:  fmt.Sprint(r["jobname"]),
			Schedule: fmt.Sprint(r["schedule"]),
			Command:  fmt.Sprint(r["command"]),
			Username: fmt.Sprint(r["username"]),
		}
		active, ok := r["active"].(bool)
		if !ok {
			return nil, errors.New("cron job active flag malformed")
		}
		j.Active = active
		out = append(out, j)
	}
	return out, nil
}

func expectSingleClashMaintenance(jobs []pauseCronJob) (pauseCronJob, error) {
	if len(jobs) == 0 {
		return pauseCronJob{}, errors.New("clash-maintenance job missing")
	}
	if len(jobs) != 1 {
		return pauseCronJob{}, errors.New("duplicate clash-maintenance jobs; quarantine retained")
	}
	j := jobs[0]
	if j.JobName != pauseCronJobName {
		return pauseCronJob{}, errors.New("unexpected cron job name")
	}
	if j.Schedule != pauseCronExpectedSchedule || j.Command != pauseCronExpectedCommand || j.Username != pauseCronExpectedUsername {
		return pauseCronJob{}, errors.New("unexpected scheduler configuration")
	}
	if j.JobID == "" || j.JobID == "<nil>" {
		return pauseCronJob{}, errors.New("cron job id missing")
	}
	return j, nil
}

func acquirePauseCronLock(ctx context.Context, s Session) error {
	r, e := query(ctx, s, resumeLockSQL, pauseCronAdvisoryLockKey)
	if e != nil {
		return e
	}
	if len(r.Rows) != 1 || r.Rows[0]["acquired"] != true {
		return errors.New("concurrent cron pause rejected; advisory lock unavailable")
	}
	return nil
}

func releasePauseCronLock(ctx context.Context, s Session) error {
	r, e := query(ctx, s, resumeUnlockSQL, pauseCronAdvisoryLockKey)
	if e != nil {
		return errors.New("pause-cron lock release unconfirmed; stop")
	}
	if len(r.Rows) != 1 || r.Rows[0]["released"] != true {
		return errors.New("pause-cron lock release unconfirmed; stop")
	}
	return nil
}

func loadClashMaintenanceJobs(ctx context.Context, s Session) ([]pauseCronJob, error) {
	r, e := query(ctx, s, pauseCronSelectSQL, pauseCronJobName)
	if e != nil {
		return nil, e
	}
	return parsePauseCronJobs(r.Rows)
}

// pauseCronRollback never discards a rollback failure. Distinguishes confirmed
// rollback (return cause) from rollback-unconfirmed (quarantine uncertainty).
func pauseCronRollback(ctx context.Context, s Session, cause error, unconfirmed string) error {
	_, rb := query(ctx, s, "rollback")
	if rb != nil {
		if unconfirmed == "" {
			unconfirmed = "pause failed; rollback unconfirmed; quarantine retained"
		}
		return errors.New(unconfirmed)
	}
	if cause == nil {
		return errors.New("pause rolled back; quarantine retained")
	}
	return cause
}

func asInt(v any, label string) (int, error) {
	switch n := v.(type) {
	case int:
		return n, nil
	case int32:
		return int(n), nil
	case int64:
		return int(n), nil
	case float64:
		return int(n), nil
	default:
		return 0, fmt.Errorf("%s malformed", label)
	}
}

func probeCronHistory(ctx context.Context, s Session, jobID string) (quiescenceSnapshot, error) {
	r, e := query(ctx, s, pauseCronHistorySQL, jobID)
	if e != nil {
		return quiescenceSnapshot{}, errors.New("run-history evidence incomplete; quarantine retained")
	}
	if len(r.Rows) != 1 {
		return quiescenceSnapshot{}, errors.New("run-history evidence incomplete; quarantine retained")
	}
	row := r.Rows[0]
	unfinished, e := asInt(row["unfinished"], "unfinished")
	if e != nil {
		return quiescenceSnapshot{}, errors.New("run-history evidence incomplete; quarantine retained")
	}
	stale, e := asInt(row["stale_unfinished"], "stale_unfinished")
	if e != nil {
		return quiescenceSnapshot{}, errors.New("run-history evidence incomplete; quarantine retained")
	}
	unexpected, e := asInt(row["unexpected_status"], "unexpected_status")
	if e != nil {
		return quiescenceSnapshot{}, errors.New("run-history evidence incomplete; quarantine retained")
	}
	historyRows, e := asInt(row["history_rows"], "history_rows")
	if e != nil {
		return quiescenceSnapshot{}, errors.New("run-history evidence incomplete; quarantine retained")
	}
	return quiescenceSnapshot{
		Unfinished:       unfinished,
		StaleUnfinished:  stale,
		UnexpectedStatus: unexpected,
		HistoryRows:      historyRows,
	}, nil
}

func probeCronActivity(ctx context.Context, s Session, jobID string) (active int, livePIDs int, err error) {
	r, e := query(ctx, s, pauseCronActivitySQL, jobID)
	if e != nil {
		return 0, 0, errors.New("activity evidence incomplete; quarantine retained")
	}
	if len(r.Rows) != 1 {
		return 0, 0, errors.New("activity evidence incomplete; quarantine retained")
	}
	active, e = asInt(r.Rows[0]["active_backends"], "active_backends")
	if e != nil {
		return 0, 0, errors.New("activity evidence incomplete; quarantine retained")
	}
	livePIDs, e = asInt(r.Rows[0]["live_job_pids"], "live_job_pids")
	if e != nil {
		return 0, 0, errors.New("activity evidence incomplete; quarantine retained")
	}
	return active, livePIDs, nil
}

func probeQuiescence(ctx context.Context, s Session, jobID string) (quiescenceSnapshot, error) {
	snap, e := probeCronHistory(ctx, s, jobID)
	if e != nil {
		return quiescenceSnapshot{}, e
	}
	active, live, e := probeCronActivity(ctx, s, jobID)
	if e != nil {
		return quiescenceSnapshot{}, e
	}
	snap.ActiveBackends = active
	snap.LiveJobPIDs = live
	return snap, nil
}

// evaluateQuiescence returns (clear, terminalErr). terminalErr stops polling
// immediately (ambiguous/stale/incomplete). clear=false with nil error means retry.
func evaluateQuiescence(snap quiescenceSnapshot) (clear bool, terminal error) {
	if snap.UnexpectedStatus > 0 {
		return false, errors.New("unexpected unfinished job status; quarantine retained")
	}
	if snap.StaleUnfinished > 0 {
		return false, errors.New("stale unfinished execution; quarantine retained")
	}
	if snap.Unfinished > 0 || snap.ActiveBackends > 0 || snap.LiveJobPIDs > 0 {
		return false, nil
	}
	return true, nil
}

func waitForCronQuiescence(ctx context.Context, s Session, jobID string) error {
	deadline := time.Now().Add(pauseCronQuiesceTimeout)
	for {
		snap, e := probeQuiescence(ctx, s, jobID)
		if e != nil {
			return e
		}
		clear, terminal := evaluateQuiescence(snap)
		if terminal != nil {
			return terminal
		}
		if clear {
			return nil
		}
		if time.Now().After(deadline) {
			return errors.New("quiescence timeout; unknown execution state; quarantine retained")
		}
		select {
		case <-ctx.Done():
			return errors.New("quiescence wait cancelled; quarantine retained")
		default:
		}
		pauseCronSleep(pauseCronPollInterval)
	}
}

func savePauseCronEvidence(dir string, report map[string]any) error {
	b, e := json.MarshalIndent(report, "", "  ")
	if e != nil {
		return errors.New("pause-cron evidence encoding failed")
	}
	if e = os.WriteFile(filepath.Join(dir, "pause-cron.json"), append(b, '\n'), 0600); e != nil {
		return errors.New("pause-cron evidence write failed")
	}
	return nil
}

func pauseCron(ctx context.Context, s Session, c Config) (completed int, err error) {
	report := map[string]any{
		"mode":                     "pause-cron",
		"project_ref":              c.ProjectRef,
		"candidate":                seal,
		"job_name":                 pauseCronJobName,
		"expected_schedule":        pauseCronExpectedSchedule,
		"expected_command":         pauseCronExpectedCommand,
		"expected_username":        pauseCronExpectedUsername,
		"mechanism":                "cron.alter_job(job_id, active:=false)",
		"database_security_passed": false,
		"wrote_active_false":       false,
		"quiescence_requires":      []string{"job_run_details", "pg_stat_activity"},
	}
	defer func() {
		if evidenceErr := savePauseCronEvidence(c.RunDir, report); evidenceErr != nil && err == nil {
			err = evidenceErr
		}
	}()

	id, e := inspectIdentity(ctx, s)
	report["identity_gate"] = id
	if e != nil {
		return 0, e
	}

	cronCat, e := query(ctx, s, `select to_regclass('cron.job') is not null as cron_catalog`)
	if e != nil {
		return 0, e
	}
	report["cron_catalog"] = cronCat.Rows
	if len(cronCat.Rows) != 1 || cronCat.Rows[0]["cron_catalog"] != true {
		return 0, errors.New("cron catalog missing")
	}

	avail, e := query(ctx, s, pauseCronAlterProcSQL)
	if e != nil {
		return 0, e
	}
	report["alter_job_available"] = avail.Rows
	if len(avail.Rows) != 1 || avail.Rows[0]["available"] != true {
		return 0, errors.New("cron.alter_job unavailable; refuse unschedule fallback")
	}

	if e := acquirePauseCronLock(ctx, s); e != nil {
		return 0, e
	}
	defer func() {
		c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if unlockErr := releasePauseCronLock(c, s); unlockErr != nil && err == nil {
			err = unlockErr
		}
	}()

	jobs, e := loadClashMaintenanceJobs(ctx, s)
	if e != nil {
		return 0, e
	}
	report["jobs_before"] = jobs
	job, e := expectSingleClashMaintenance(jobs)
	if e != nil {
		return 0, e
	}
	report["jobid"] = job.JobID

	if job.Active {
		if _, e = query(ctx, s, "begin"); e != nil {
			return 0, e
		}
		if _, e = query(ctx, s, pauseCronAlterSQL, job.JobID); e != nil {
			return 0, pauseCronRollback(ctx, s, e, "pause failed; rollback unconfirmed; quarantine retained")
		}
		// Re-read inside the same transaction before commit.
		mid, e := loadClashMaintenanceJobs(ctx, s)
		if e != nil {
			return 0, pauseCronRollback(ctx, s, e, "pause verification failed; rollback unconfirmed; quarantine retained")
		}
		midJob, e := expectSingleClashMaintenance(mid)
		if e != nil || midJob.JobID != job.JobID || midJob.Active {
			cause := e
			if cause == nil {
				cause = errors.New("job remained active after alter_job")
			}
			return 0, pauseCronRollback(ctx, s, cause, "pause verification failed; rollback unconfirmed; quarantine retained")
		}
		if _, e = query(ctx, s, "commit"); e != nil {
			return 0, errors.New("commit outcome unknown; stop and inspect, no retry")
		}
		report["wrote_active_false"] = true
	} else {
		report["already_inactive"] = true
	}

	if e := waitForCronQuiescence(ctx, s, job.JobID); e != nil {
		report["quiescence"] = "failed"
		return 0, e
	}
	report["quiescence"] = "history_and_activity_clear"

	after, e := loadClashMaintenanceJobs(ctx, s)
	if e != nil {
		return 0, e
	}
	report["jobs_after"] = after
	final, e := expectSingleClashMaintenance(after)
	if e != nil {
		return 0, e
	}
	if final.JobID != job.JobID {
		return 0, errors.New("job identity changed during pause; quarantine retained")
	}
	if final.Active {
		return 0, errors.New("job remains active after pause")
	}
	if final.Schedule != pauseCronExpectedSchedule || final.Command != pauseCronExpectedCommand {
		return 0, errors.New("scheduler configuration changed during pause; quarantine retained")
	}
	report["success"] = true
	return 1, nil
}
