package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInvestigateRequiresSeparateAuthorization(t *testing.T) {
	c := configTest(t)
	m := &mock{}
	_, e := Run(context.Background(), c, "investigate", "preflight:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil {
		t.Fatal("cross-mode authorization accepted")
	}
}

func TestInvestigateReadOnlyPrefixAndMig44Absent(t *testing.T) {
	c := configTest(t)
	if e := os.Mkdir(c.RunDir, 0700); e != nil {
		t.Fatal(e)
	}
	a, e := artifacts(c)
	if e != nil {
		t.Fatal(e)
	}
	m := &mock{ledger: make([]map[string]any, 0, 43)}
	for i := 0; i < 43; i++ {
		n := filepath.Base(a.Files[i].Path)
		b, err := os.ReadFile(filepath.Join(c.ArtifactDir, "migrations", n))
		if err != nil {
			t.Fatal(err)
		}
		payload, _ := json.Marshal([]string{string(b)})
		m.ledger = append(m.ledger, map[string]any{
			"version":         n[:14],
			"name":            strings.TrimSuffix(n[15:], ".sql"),
			"statements_json": string(payload),
		})
	}
	n, e := Run(context.Background(), c, "investigate", "investigate:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e != nil || n != 0 {
		t.Fatalf("n=%d err=%v", n, e)
	}
	joined := strings.Join(m.queries, "\n")
	if !strings.Contains(joined, "begin read only") || strings.Contains(joined, createLedgerSQL) || strings.Contains(joined, "explore_play_system.sql") {
		t.Fatal("investigate left read-only contract")
	}
	data, err := os.ReadFile(filepath.Join(c.RunDir, "investigate.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "MOCK_SECRET") {
		t.Fatal("secret leaked")
	}
	var report map[string]any
	if json.Unmarshal(data, &report) != nil {
		t.Fatal("bad evidence")
	}
	if report["first_43_integrity"] != true || report["migration_44_objects_present"] != false || report["ledger_count"].(float64) != 43 {
		t.Fatalf("report=%v", report)
	}
}

func TestInvestigateStopsOnLedgerPrefixMismatch(t *testing.T) {
	c := configTest(t)
	if e := os.Mkdir(c.RunDir, 0700); e != nil {
		t.Fatal(e)
	}
	m := &mock{ledger: []map[string]any{{"version": "20261004120000", "name": "explore_play_system", "statements_json": "[]"}}}
	_, e := Run(context.Background(), c, "investigate", "investigate:"+c.ProjectRef, "MOCK_SECRET", dialMock(m))
	if e == nil || !strings.Contains(e.Error(), "ledger") {
		t.Fatal(e)
	}
	if _, err := os.Stat(filepath.Join(c.RunDir, "investigate.json")); err != nil {
		t.Fatal("evidence missing on stop condition")
	}
}
