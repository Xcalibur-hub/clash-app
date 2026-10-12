package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

func TestWindowsCredentialWorkflowOffline(t *testing.T) {
	c := configTest(t)
	c.CredentialSource = "windows-credential-manager"
	value := credential{"postgres", "MOCK_ONLY_LONG_PASSWORD_12345"}
	saved := false
	reads := 0
	target, _ := credentialTarget(c.ProjectRef)
	store := secretStore{
		read: func(got string) (credential, error) {
			reads++
			if got != target {
				t.Fatal("cross-project read")
			}
			if !saved {
				return credential{}, errCredentialMissing
			}
			return value, nil
		},
		write: func(got string, v credential) error {
			if got != target || v != value {
				t.Fatal("unsafe store identity")
			}
			saved = true
			return nil
		},
		prompt: func(got string) (credential, error) {
			if got != target {
				t.Fatal("prompt target")
			}
			return value, nil
		},
	}
	file := filepath.Join(t.TempDir(), "config.json")
	data, _ := json.Marshal(c)
	os.WriteFile(file, data, 0600)
	neverDial := func(context.Context, *pgx.ConnConfig) (Session, error) {
		t.Fatal("credential operation accessed database")
		return nil, nil
	}
	if e := commandWithStore([]string{"--mode", "store-credential", "--authorize", "store-credential:" + c.ProjectRef, "--config", file}, func(string) string { return "" }, neverDial, store); e != nil {
		t.Fatal(e)
	}
	if !saved || reads != 2 {
		t.Fatal("store/readback contract")
	}
	pass, e := passwordFor(c, func(string) string { return "" }, store)
	if e != nil || pass != value.password {
		t.Fatal("retrieve")
	}
	if e := storeCredential(c, store); e == nil {
		t.Fatal("overwrite allowed")
	}
	c.ProjectRef = strings.Repeat("b", 20)
	// A different project's key cannot accidentally load the prior entry.
	store.read = func(got string) (credential, error) {
		if got == target {
			t.Fatal("old identity reused")
		}
		return credential{}, errCredentialMissing
	}
	if _, e := passwordFor(c, func(string) string { return "" }, store); e == nil {
		t.Fatal("missing new project allowed")
	}
}
func TestCredentialRejectionAndRedaction(t *testing.T) {
	for _, name := range []string{"missing", "wrong_user", "short", "newline", "null", "invalid_utf8", "too_large", "source_conflict", "unknown_source"} {
		t.Run(name, func(t *testing.T) {
			c := configTest(t)
			c.CredentialSource = "windows-credential-manager"
			v := credential{"postgres", "MOCK_ONLY_LONG_PASSWORD_12345"}
			inherited := ""
			readError := error(nil)
			switch name {
			case "missing":
				readError = errors.New(v.password)
			case "wrong_user":
				v.user = "service_role"
			case "short":
				v.password = "short"
			case "newline":
				v.password += "\n"
			case "null":
				v.password += "\x00"
			case "invalid_utf8":
				v.password += "\xff"
			case "too_large":
				v.password = strings.Repeat("x", 2561)
			case "source_conflict":
				inherited = v.password
			case "unknown_source":
				c.CredentialSource = "plaintext-file"
			}
			_, e := passwordFor(c, func(string) string { return inherited }, secretStore{read: func(string) (credential, error) { return v, readError }})
			if e == nil || strings.Contains(e.Error(), "MOCK_ONLY") || strings.Contains(e.Error(), "postgres://") {
				t.Fatal("credential rejection leaked or failed", e)
			}
		})
	}
}
func TestCredentialStoreFailuresAreGeneric(t *testing.T) {
	for _, name := range []string{"read_unavailable", "cancel", "bad_prompt", "write_failure", "verify_failure"} {
		t.Run(name, func(t *testing.T) {
			c := configTest(t)
			c.CredentialSource = "windows-credential-manager"
			reads := 0
			writes := 0
			prompts := 0
			v := credential{"postgres", "MOCK_ONLY_LONG_PASSWORD_12345"}
			store := secretStore{
				read: func(string) (credential, error) {
					reads++
					if name == "read_unavailable" || reads > 1 {
						return credential{}, errors.New(v.password)
					}
					return credential{}, errCredentialMissing
				},
				prompt: func(string) (credential, error) {
					prompts++
					if name == "cancel" {
						return credential{}, errors.New(v.password)
					}
					if name == "bad_prompt" {
						return credential{"other", v.password}, nil
					}
					return v, nil
				},
				write: func(string, credential) error {
					writes++
					if name == "write_failure" {
						return errors.New(v.password)
					}
					return nil
				},
			}
			e := storeCredential(c, store)
			if e == nil || strings.Contains(e.Error(), v.password) || writes > 1 || prompts > 1 {
				t.Fatal("store failure not safe", e)
			}
			if name == "read_unavailable" && prompts != 0 {
				t.Fatal("prompt after unavailable store")
			}
		})
	}
}
func TestCredentialEntrypointGuardsAndSafeEvidence(t *testing.T) {
	c := configTest(t)
	c.CredentialSource = "windows-credential-manager"
	file := filepath.Join(t.TempDir(), "config.json")
	b, _ := json.Marshal(c)
	os.WriteFile(file, b, 0600)
	touched := false
	store := secretStore{read: func(string) (credential, error) {
		touched = true
		return credential{"postgres", "MOCK_ONLY_LONG_PASSWORD_12345"}, nil
	}}
	for _, auth := range []string{"", "preflight:" + strings.Repeat("b", 20)} {
		e := commandWithStore([]string{"--mode", "preflight", "--authorize", auth, "--config", file}, func(string) string { return "" }, dialMock(&mock{}), store)
		if e == nil || touched {
			t.Fatal("unauthorized secret retrieval")
		}
	}
	m := &mock{}
	e := commandWithStore([]string{"--mode", "preflight", "--authorize", "preflight:" + c.ProjectRef, "--config", file}, func(string) string { return "" }, func(_ context.Context, p *pgx.ConnConfig) (Session, error) {
		if p.Password != "MOCK_ONLY_LONG_PASSWORD_12345" {
			t.Fatal("password propagation")
		}
		return m, nil
	}, store)
	if e != nil {
		t.Fatal(e)
	}
	files, _ := os.ReadDir(c.RunDir)
	for _, f := range files {
		data, _ := os.ReadFile(filepath.Join(c.RunDir, f.Name()))
		if strings.Contains(string(data), "MOCK_ONLY") {
			t.Fatal("secret persisted")
		}
	}
	// Password flags and URLs are rejected; parsing never echoes their values.
	for _, args := range [][]string{{"--password", "MOCK_ONLY_LONG_PASSWORD_12345"}, {"postgres://MOCK_ONLY_LONG_PASSWORD_12345@host"}} {
		if e := commandWithStore(args, func(string) string { return "" }, nil, store); e == nil || strings.Contains(e.Error(), "MOCK_ONLY") {
			t.Fatal("unsafe argument handling")
		}
	}
}
