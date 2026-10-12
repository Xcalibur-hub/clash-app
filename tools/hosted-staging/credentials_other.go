//go:build !windows

package main

import "errors"

func windowsStore() secretStore {
	return secretStore{
		read: func(string) (credential, error) {
			return credential{}, errors.New("Windows Credential Manager unavailable")
		},
		write: func(string, credential) error { return errors.New("Windows Credential Manager unavailable") },
		prompt: func(string) (credential, error) {
			return credential{}, errors.New("Windows Credential Manager unavailable")
		},
	}
}
