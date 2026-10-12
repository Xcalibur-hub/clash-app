package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func command(args []string, getenv func(string) string, dial Connector) error {
	return commandWithStore(args, getenv, dial, windowsStore())
}
func commandWithStore(args []string, getenv func(string) string, dial Connector, store secretStore) error {
	f := flag.NewFlagSet("hosted-staging", flag.ContinueOnError)
	f.SetOutput(io.Discard)
	mode := f.String("mode", "", "store-credential, preflight, migrate, investigate, inventory or separately authorized fixtures")
	auth := f.String("authorize", "", "explicit mode:project reference")
	file := f.String("config", "", "reviewed nonsecret configuration file")
	if e := f.Parse(args); e != nil {
		return errors.New("invalid command flags")
	}
	if f.NArg() != 0 {
		return errors.New("unexpected arguments")
	}
	b, e := os.ReadFile(*file)
	if e != nil {
		return errors.New("configuration required")
	}
	var c Config
	dec := json.NewDecoder(strings.NewReader(string(b)))
	dec.DisallowUnknownFields()
	if e = dec.Decode(&c); e != nil {
		return errors.New("invalid nonsecret configuration")
	}
	if dec.Decode(new(any)) != io.EOF {
		return errors.New("trailing configuration data refused")
	}
	if !authorized(*mode, *auth, c.ProjectRef) {
		return errors.New("explicit mode/project authorization required")
	}
	if *mode == "store-credential" {
		if getenv("CLASH_STAGING_PASSWORD") != "" {
			return errors.New("inherited password refused for credential storage")
		}
		return storeCredential(c, store)
	}
	pass, e := passwordFor(c, getenv, store)
	if e != nil {
		return e
	}
	if _, e = connection(c, pass); e != nil {
		return e
	}
	if _, e = artifacts(c); e != nil {
		return e
	}
	// A fresh evidence directory is a single-use attempt claim, not a retry option.
	if !filepath.IsAbs(c.RunDir) {
		return errors.New("absolute fresh run directory required")
	}
	if e = os.Mkdir(c.RunDir, 0700); e != nil {
		return errors.New("run directory exists or cannot be created; no retry")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()
	c.recordPreflight = func(report map[string]any) error { return recordPreflight(c.RunDir, report) }
	count, runError := Run(ctx, c, *mode, *auth, pass, dial)
	outcome := map[string]any{"mode": *mode, "project_ref": c.ProjectRef, "candidate": seal, "completed_items": count, "success": runError == nil, "database_security_passed": false}
	if runError != nil {
		outcome["failure"] = runError.Error()
	}
	data, _ := json.MarshalIndent(outcome, "", "  ")
	if e = os.WriteFile(filepath.Join(c.RunDir, "outcome.json"), append(data, '\n'), 0600); e != nil {
		return errors.New("evidence write failed; operation outcome must be reviewed")
	}
	return runError
}
func main() {
	// No inherited libpq/backend override can affect even parsing. No values logged.
	for _, entry := range os.Environ() {
		key := strings.ToUpper(strings.SplitN(entry, "=", 2)[0])
		for _, prefix := range []string{"PG", "SUPABASE_", "DATABASE_", "JWT_", "GOTRUE_", "S3_"} {
			if strings.HasPrefix(key, prefix) {
				fmt.Fprintln(os.Stderr, "inherited backend override refused; use a clean operator-controlled environment")
				os.Exit(1)
			}
		}
	}
	if e := command(os.Args[1:], os.Getenv, connect); e != nil {
		fmt.Fprintln(os.Stderr, e.Error())
		os.Exit(1)
	}
	fmt.Println("Authorized operation completed; inspect scoped evidence. No database security pass implied.")
}
