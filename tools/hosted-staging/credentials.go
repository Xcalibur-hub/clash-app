package main

import (
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"
)

var errCredentialMissing = errors.New("credential missing")

type credential struct{ user, password string }
type secretStore struct {
	read   func(string) (credential, error)
	write  func(string, credential) error
	prompt func(string) (credential, error)
}

func credentialTarget(ref string) (string, error) {
	if !regexp.MustCompile(`^[a-z]{20}$`).MatchString(ref) {
		return "", errors.New("invalid staging project reference")
	}
	return "CLASH/staging/" + ref + "/postgres", nil
}
func validCredential(v credential) bool {
	return v.user == "postgres" && len(v.password) >= 20 && len(v.password) <= 2560 && utf8.ValidString(v.password) && !strings.ContainsAny(v.password, "\r\n\x00")
}
func storeCredential(c Config, store secretStore) error {
	target, e := credentialTarget(c.ProjectRef)
	if e != nil {
		return e
	}
	if c.CredentialSource != "windows-credential-manager" {
		return errors.New("Windows credential source required")
	}
	_, e = store.read(target)
	if !errors.Is(e, errCredentialMissing) {
		return errors.New("credential already exists or store unavailable; no overwrite")
	}
	v, e := store.prompt(target)
	if e != nil || !validCredential(v) {
		return errors.New("credential entry cancelled or rejected")
	}
	if e = store.write(target, v); e != nil {
		return errors.New("credential storage failed; stop")
	}
	confirmed, e := store.read(target)
	if e != nil || confirmed != v {
		return errors.New("credential storage verification failed; stop without retry")
	}
	return nil
}
func passwordFor(c Config, getenv func(string) string, store secretStore) (string, error) {
	inherited := getenv("CLASH_STAGING_PASSWORD")
	switch c.CredentialSource {
	case "", "environment":
		// Compatibility for already-approved operators; new Windows workflow uses CredRead.
		return inherited, nil
	case "windows-credential-manager":
		if inherited != "" {
			return "", errors.New("ambiguous credential sources refused")
		}
		target, e := credentialTarget(c.ProjectRef)
		if e != nil {
			return "", e
		}
		v, e := store.read(target)
		if e != nil || !validCredential(v) {
			return "", errors.New("project credential missing, inaccessible or invalid")
		}
		return v.password, nil
	default:
		return "", errors.New("unsupported credential source")
	}
}
