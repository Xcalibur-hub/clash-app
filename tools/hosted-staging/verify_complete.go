package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"
)

// verify-complete: read-only post-deployment verification of the COMPLETE
// 106-migration state. Deliberately separate from the 43-migration recovery
// investigator (investigate). It never writes, repairs or resumes anything.
// Object, storage and cron checks live in the sibling verify_complete_*.go files.

const verifyCompleteExpectedCount = 106

// verifyCompleteArtifactGates pins the corrected 106-artifact lineage before any
// database work. Mirrors resumeArtifactGates and never weakens it.
func verifyCompleteArtifactGates(c Config, a Artifact) error {
	if c.ArtifactHash != resumeRequiredManifest {
		return errors.New("verify-complete requires the corrected 106-artifact manifest")
	}
	if len(a.Files) != verifyCompleteExpectedCount {
		return errors.New("verify-complete requires exactly 106 artifacts")
	}
	if a.Candidate != seal || a.Manifest != frozenManifest {
		return errors.New("frozen lineage mismatch")
	}
	if a.Files[resumeStartIndex].Hash != resumeArtifact44Hash {
		return errors.New("corrected artifact 44 required")
	}
	return nil
}

func verifyComplete(ctx context.Context, s Session, c Config, a Artifact) (report map[string]any, err error) {
	report = map[string]any{
		"mode": "verify-complete", "project_ref": c.ProjectRef, "candidate": seal,
		"expected_migrations": verifyCompleteExpectedCount, "database_security_passed": false,
	}
	if e := verifyCompleteArtifactGates(c, a); e != nil {
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
	l, e := ledger(ctx, s)
	if e != nil {
		return report, e
	}
	report["ledger_count"] = len(l)
	if e := verifyExactLedgerPrefix(l, a, verifyCompleteExpectedCount); e != nil {
		return report, e
	}
	report["ledger_verified"] = true
	if e := verifyCompleteExtensions(ctx, s, report); e != nil {
		return report, e
	}
	schemas, e := query(ctx, s, unexpectedSchemaNamesSQL)
	if e != nil {
		return report, e
	}
	report["unexpected_schema_names"] = schemas.Rows
	if len(schemas.Rows) != 0 {
		return report, errors.New("unexpected schemas; schema drift detected")
	}
	if e := verifyCompleteStorage(ctx, s, report); e != nil {
		return report, e
	}
	if e := verifyCompleteManaged(ctx, s, report); e != nil {
		return report, e
	}
	if e := verifyCompleteObjects(ctx, s, report); e != nil {
		return report, e
	}
	if e := verifyCompleteCron(ctx, s, report); e != nil {
		return report, e
	}
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
