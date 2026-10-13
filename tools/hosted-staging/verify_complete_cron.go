package main

import (
	"context"
	"errors"
)

// verifyCompleteCron requires exactly one correctly configured clash-maintenance
// job that is inactive, with no unfinished, stale or live maintenance execution
// remaining. Quiescence is evaluated on a single read-only pass: a not-clear
// snapshot fails immediately rather than polling.
func verifyCompleteCron(ctx context.Context, s Session, report map[string]any) error {
	jobs, e := query(ctx, s, investigateCronSQL)
	if e != nil {
		return e
	}
	report["clash_maintenance_jobs"] = jobs.Rows
	if e := assertClashMaintenanceInactiveForResume(jobs.Rows); e != nil {
		report["clash_maintenance_active"] = len(jobs.Rows) > 0 && jobs.Rows[0]["active"] == true
		return e
	}
	parsed, e := parsePauseCronJobs(jobs.Rows)
	if e != nil {
		return e
	}
	job, e := expectSingleClashMaintenance(parsed)
	if e != nil {
		return e
	}
	snap, e := probeQuiescence(ctx, s, job.JobID)
	if e != nil {
		return e
	}
	report["clash_maintenance_quiescence"] = map[string]any{
		"unfinished": snap.Unfinished, "stale_unfinished": snap.StaleUnfinished,
		"unexpected_status": snap.UnexpectedStatus, "history_rows": snap.HistoryRows,
		"active_backends": snap.ActiveBackends, "live_job_pids": snap.LiveJobPIDs,
	}
	clear, terminal := evaluateQuiescence(snap)
	if terminal != nil {
		return errors.New("maintenance execution state unclear; quarantine retained: " + terminal.Error())
	}
	if !clear {
		return errors.New("maintenance execution still active; quarantine retained")
	}
	report["clash_maintenance_active"] = false
	report["cron_quiescent"] = true
	return nil
}
