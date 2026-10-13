package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPauseCronRequiresSeparateAuthorization(t *testing.T) {
	c := configTest(t)
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "pause-cron", "resume:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{}))
	if e == nil {
		t.Fatal("cross-mode authorization accepted")
	}
}

func TestPauseCronRejectsWrongTarget(t *testing.T) {
	c := configTest(t)
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{badIdentity: true}))
	if e == nil {
		t.Fatal("wrong target accepted")
	}
}

func TestPauseCronRejectsWrongCA(t *testing.T) {
	c := configTest(t)
	c.CAHash = strings.Repeat("ab", 32)
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{}))
	if e == nil {
		t.Fatal("wrong CA accepted")
	}
}

func TestPauseCronSuccessDeactivatesSingleJob(t *testing.T) {
	c := configTest(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{}
	n, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e != nil || n != 1 || !m.pauseInactive {
		t.Fatalf("n=%d inactive=%v err=%v", n, m.pauseInactive, e)
	}
	joined := strings.Join(m.queries, "\n")
	if !strings.Contains(joined, pauseCronAlterSQL) || strings.Contains(joined, "cron.unschedule") {
		t.Fatal("expected alter_job only")
	}
	data, _ := os.ReadFile(filepath.Join(c.RunDir, "pause-cron.json"))
	if strings.Contains(string(data), "MOCK_SECRET") {
		t.Fatal("secret leaked")
	}
}

func TestPauseCronIdempotentWhenAlreadyInactive(t *testing.T) {
	c := configTest(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{pauseInactive: true}
	n, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e != nil || n != 1 {
		t.Fatal(n, e)
	}
	if strings.Contains(strings.Join(m.queries, "\n"), pauseCronAlterSQL) {
		t.Fatal("alter_job should not run when already inactive")
	}
}

func TestPauseCronRejectsMissingOrDuplicateJob(t *testing.T) {
	c := configTest(t)
	for _, m := range []*mock{{missingCronJob: true}, {duplicateCron: true}} {
		os.RemoveAll(c.RunDir)
		os.Mkdir(c.RunDir, 0700)
		_, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
		if e == nil {
			t.Fatal("expected rejection")
		}
	}
}

func TestPauseCronRejectsUnexpectedCommand(t *testing.T) {
	c := configTest(t)
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{wrongCronCommand: true}))
	if e == nil || !strings.Contains(e.Error(), "scheduler configuration") {
		t.Fatal(e)
	}
}

func TestPauseCronRejectsMissingAlterJob(t *testing.T) {
	c := configTest(t)
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{alterUnavailable: true}))
	if e == nil || !strings.Contains(e.Error(), "alter_job") {
		t.Fatal(e)
	}
}

func TestPauseCronRejectsConcurrentLock(t *testing.T) {
	c := configTest(t)
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{lockHeld: true}))
	if e == nil || !strings.Contains(e.Error(), "concurrent") {
		t.Fatal(e)
	}
}

func TestPauseCronAlterFailureRollsBack(t *testing.T) {
	c := configTest(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{fail: pauseCronAlterSQL}
	_, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || m.pauseInactive {
		t.Fatal(e, m.pauseInactive)
	}
	if !strings.Contains(strings.Join(m.queries, "\n"), "rollback") {
		t.Fatal("missing rollback")
	}
}

func TestPauseCronCommitUnknownQuarantines(t *testing.T) {
	c := configTest(t)
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{fail: "commit"}))
	if e == nil || !strings.Contains(e.Error(), "unknown") {
		t.Fatal(e)
	}
}

func TestPauseCronRollbackUnconfirmedQuarantines(t *testing.T) {
	c := configTest(t)
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{fail: pauseCronAlterSQL, rollbackFail: true}))
	if e == nil || !strings.Contains(e.Error(), "rollback unconfirmed") {
		t.Fatal(e)
	}
}

func TestPauseCronQuiescenceEventuallySucceeds(t *testing.T) {
	old := pauseCronSleep
	pauseCronSleep = func(time.Duration) {}
	defer func() { pauseCronSleep = old }()
	c := configTest(t)
	os.Mkdir(c.RunDir, 0700)
	m := &mock{pauseRunning: 1, pauseRunningClearAfter: 2}
	n, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e != nil || n != 1 || m.pausePolls < 3 {
		t.Fatalf("n=%d polls=%d err=%v", n, m.pausePolls, e)
	}
}

func TestPauseCronQuiescenceTimeout(t *testing.T) {
	oldSleep := pauseCronSleep
	oldTimeout := pauseCronQuiesceTimeout
	pauseCronSleep = func(time.Duration) {}
	pauseCronQuiesceTimeout = 0
	defer func() {
		pauseCronSleep = oldSleep
		pauseCronQuiesceTimeout = oldTimeout
	}()
	c := configTest(t)
	os.Mkdir(c.RunDir, 0700)
	_, e := Run(context.Background(), c, "pause-cron", "pause-cron:"+c.ProjectRef, "MOCK_SECRET", dialMock(&mock{pauseRunning: 1}))
	if e == nil || !strings.Contains(e.Error(), "still running") {
		t.Fatal(e)
	}
}

func TestExpectSingleClashMaintenanceHelpers(t *testing.T) {
	_, e := expectSingleClashMaintenance(nil)
	if e == nil {
		t.Fatal("empty accepted")
	}
	ok := []pauseCronJob{{JobID: "1", JobName: pauseCronJobName, Schedule: pauseCronExpectedSchedule, Command: pauseCronExpectedCommand, Username: pauseCronExpectedUsername, Active: true}}
	if _, e := expectSingleClashMaintenance(ok); e != nil {
		t.Fatal(e)
	}
}
