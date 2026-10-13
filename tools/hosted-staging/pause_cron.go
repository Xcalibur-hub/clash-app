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
const pauseCronRunningSQL = `select count(*)::int as running
  from cron.job_run_details
  where jobid=$1::bigint
    and (
      status in ('starting','running')
      or (end_time is null and start_time > now() - interval '15 minutes')
    )`
// Test seam for quiescence polling.
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

func runningCount(ctx context.Context, s Session, jobID string) (int, error) {
	r, e := query(ctx, s, pauseCronRunningSQL, jobID)
	if e != nil {
		return 0, e
	}
	if len(r.Rows) != 1 {
		return 0, errors.New("incomplete running-job probe")
	}
	switch n := r.Rows[0]["running"].(type) {
	case int:
		return n, nil
	case int32:
		return int(n), nil
	case int64:
		return int(n), nil
	case float64:
		return int(n), nil
	default:
		return 0, errors.New("running-job probe malformed")
	}
}

func waitForCronQuiescence(ctx context.Context, s Session, jobID string) error {
	deadline := time.Now().Add(pauseCronQuiesceTimeout)
	for {
		n, e := runningCount(ctx, s, jobID)
		if e != nil {
			return e
		}
		if n == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return errors.New("job inactive but execution still running; quarantine retained")
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
			_, rb := query(ctx, s, "rollback")
			if rb != nil {
				return 0, errors.New("pause failed; rollback unconfirmed")
			}
			return 0, e
		}
		// Re-read inside the same transaction before commit.
		mid, e := loadClashMaintenanceJobs(ctx, s)
		if e != nil {
			_, _ = query(ctx, s, "rollback")
			return 0, e
		}
		midJob, e := expectSingleClashMaintenance(mid)
		if e != nil || midJob.JobID != job.JobID || midJob.Active {
			_, rb := query(ctx, s, "rollback")
			if rb != nil {
				return 0, errors.New("pause verification failed; rollback unconfirmed")
			}
			return 0, errors.New("job remained active after alter_job")
		}
		if _, e = query(ctx, s, "commit"); e != nil {
			return 0, errors.New("commit outcome unknown; stop and inspect, no retry")
		}
		report["wrote_active_false"] = true
	} else {
		report["already_inactive"] = true
	}

	if e := waitForCronQuiescence(ctx, s, job.JobID); e != nil {
		return 0, e
	}
	report["quiescence"] = "no_in_progress_execution"

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
