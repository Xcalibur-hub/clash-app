package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type TAP struct{ Assertions, Passed, Failed, Skipped, TODO int }

func account(lines []string) (TAP, error) {
	out := TAP{}
	plans := 0
	planned := -1
	plan := regexp.MustCompile(`^1\.\.(\d+)(?:\s*#\s*(.*))?$`)
	row := regexp.MustCompile(`^(not ok|ok)\s+(\d+)(?:\s+(.*))?$`)
	for _, text := range lines {
		for _, line := range strings.Split(text, "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "Bail out!") {
				return out, errors.New("TAP bailout")
			}
			if p := plan.FindStringSubmatch(line); p != nil {
				plans++
				fmt.Sscan(p[1], &planned)
				if planned == 0 && !strings.HasPrefix(strings.ToLower(p[2]), "skip") {
					return out, errors.New("unexplained empty TAP")
				}
				continue
			}
			if r := row.FindStringSubmatch(line); r != nil {
				var n int
				fmt.Sscan(r[2], &n)
				out.Assertions++
				if n != out.Assertions {
					return out, errors.New("TAP sequence mismatch")
				}
				switch {
				case regexp.MustCompile(`(?i)#\s*skip\b`).MatchString(r[3]):
					out.Skipped++
				case regexp.MustCompile(`(?i)#\s*todo\b`).MatchString(r[3]):
					out.TODO++
					if r[1] == "ok" {
						return out, errors.New("unexpected TODO pass")
					}
				case r[1] == "not ok":
					out.Failed++
				default:
					out.Passed++
				}
			}
		}
	}
	if plans != 1 || planned != out.Assertions {
		return out, errors.New("TAP plan mismatch")
	}
	if out.Failed > 0 {
		return out, errors.New("TAP failed")
	}
	return out, nil
}
func completeLedger(ctx context.Context, s Session, a Artifact) error {
	l, e := ledger(ctx, s)
	if e != nil || len(l) != 106 {
		return errors.New("complete candidate ledger required")
	}
	for i, v := range l {
		n := filepath.Base(a.Files[i].Path)
		var st []string
		if v["version"] != n[:14] || v["name"] != strings.TrimSuffix(n[15:], ".sql") || json.Unmarshal([]byte(fmt.Sprint(v["statements_json"])), &st) != nil || len(st) != 1 || digest([]byte(st[0])) != a.Files[i].Hash {
			return errors.New("candidate ledger bytes mismatch")
		}
	}
	return nil
}
func executeSuites(ctx context.Context, s Session, conf *pgx.ConnConfig, dial Connector, c Config, a Artifact) (int, error) {
	// This command is intentionally separate from read-only inventory. Every suite,
	// even one with ROLLBACK, requires sterile-target and committing-test approval.
	if !c.Sterile {
		return 0, errors.New("dedicated sterile project attestation required")
	}
	b, e := loadBundle(c.ArtifactDir, c.SuiteHash)
	if e != nil {
		return 0, e
	}
	if e = fixtureGate(ctx, s, true); e != nil {
		return 0, e
	}
	if e = completeLedger(ctx, s, a); e != nil {
		return 0, e
	}
	r, e := query(ctx, s, "select not exists(select 1 from cron.job where active) as quiet")
	if e != nil || len(r.Rows) != 1 || r.Rows[0]["quiet"] != true {
		return 0, errors.New("scheduled jobs must be separately approved and quiesced before fixture testing")
	}
	completed := 0
	for _, suite := range b.Suites {
		lines, runError := runSuite(ctx, s, conf, dial, suite)
		counts, tapError := account(lines)
		evidence := map[string]any{"suite": suite.Name, "source_sha256": suite.SourceHash, "counts": counts, "run_success": runError == nil, "tap_success": tapError == nil}
		data, _ := json.MarshalIndent(evidence, "", "  ")
		if e = os.WriteFile(filepath.Join(c.RunDir, suite.Name+".json"), append(data, '\n'), 0600); e != nil {
			return completed, errors.New("suite evidence write failed; stop")
		}
		if runError != nil {
			return completed, runError
		}
		if tapError != nil {
			return completed, tapError
		}
		if regexp.MustCompile(`^(085|087|088|089)_`).MatchString(suite.Name) && (counts.Assertions == 0 || counts.Skipped+counts.TODO > 0) {
			return completed, errors.New("focused security suite cannot skip or TODO")
		}
		if _, e = query(ctx, s, "reset role"); e != nil {
			return completed, e
		}
		if e = fixtureGate(ctx, s, true); e != nil {
			return completed, errors.New("fixture residue detected; quarantine target")
		}
		completed++
	}
	return completed, nil
}
