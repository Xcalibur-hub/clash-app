//go:build windows

package main

import (
	"errors"
	"runtime"
	"syscall"
	"unsafe"
)

// Generic credentials are encrypted by Windows for the logged-on user, local
// machine persistence only (2), never roaming. No shell or credential subprocess.
type winCredential struct {
	Flags, Type             uint32
	TargetName, Comment     *uint16
	LastWritten             syscall.Filetime
	CredentialBlobSize      uint32
	CredentialBlob          *byte
	Persist, AttributeCount uint32
	Attributes              uintptr
	TargetAlias, UserName   *uint16
}
type credUI struct {
	Size             uint32
	Parent           uintptr
	Message, Caption *uint16
	Banner           uintptr
}

// Load only Windows system DLLs, never a similarly named DLL in the worktree.
//go:uintptrescapes
func systemCall(dll, proc string, args ...uintptr) (uintptr, uintptr, error) {
	name, e := syscall.UTF16PtrFromString(dll)
	if e != nil {
		return 0, 0, e
	}
	load := syscall.NewLazyDLL("kernel32.dll").NewProc("LoadLibraryExW")
	h, _, e := load.Call(uintptr(unsafe.Pointer(name)), 0, 0x800) // LOAD_LIBRARY_SEARCH_SYSTEM32
	if h == 0 {
		return 0, 0, e
	}
	defer syscall.FreeLibrary(syscall.Handle(h))
	address, e := syscall.GetProcAddress(syscall.Handle(h), proc)
	if e != nil {
		return 0, 0, e
	}
	return syscall.SyscallN(address, args...)
}

func windowsStore() secretStore {
	return secretStore{
		read: func(target string) (credential, error) {
			t, e := syscall.UTF16PtrFromString(target)
			if e != nil {
				return credential{}, errors.New("invalid credential target")
			}
			var raw *winCredential
			ok, _, status := systemCall("advapi32.dll", "CredReadW", uintptr(unsafe.Pointer(t)), 1, 0, uintptr(unsafe.Pointer(&raw)))
			if ok == 0 {
				if status == syscall.Errno(1168) {
					return credential{}, errCredentialMissing
				}
				return credential{}, errors.New("credential read failed")
			}
			defer systemCall("advapi32.dll", "CredFree", uintptr(unsafe.Pointer(raw)))
			if raw == nil || raw.Type != 1 || raw.Persist != 2 || raw.CredentialBlobSize == 0 || raw.CredentialBlobSize > 2560 || raw.CredentialBlob == nil || raw.UserName == nil {
				return credential{}, errors.New("credential metadata rejected")
			}
			blob := unsafe.Slice(raw.CredentialBlob, int(raw.CredentialBlobSize))
			defer clear(blob)
			// This module writes a fixed postgres username; bounded comparison avoids
			// scanning arbitrary native memory for a terminator.
			expected := syscall.StringToUTF16("postgres")
			for i, v := range expected {
				value := *(*uint16)(unsafe.Add(unsafe.Pointer(raw.UserName), i*2))
				if value != v {
					return credential{}, errors.New("credential user rejected")
				}
			}
			return credential{"postgres", string(blob)}, nil
		},
		write: func(target string, v credential) error {
			if !validCredential(v) {
				return errors.New("credential rejected")
			}
			t, e := syscall.UTF16PtrFromString(target)
			if e != nil {
				return errors.New("credential target rejected")
			}
			u, _ := syscall.UTF16PtrFromString("postgres")
			blob := []byte(v.password)
			defer clear(blob)
			raw := winCredential{Type: 1, TargetName: t, UserName: u, Persist: 2, CredentialBlobSize: uint32(len(blob)), CredentialBlob: &blob[0]}
			ok, _, _ := systemCall("advapi32.dll", "CredWriteW", uintptr(unsafe.Pointer(&raw)), 0)
			runtime.KeepAlive(blob)
			runtime.KeepAlive(t)
			runtime.KeepAlive(u)
			if ok == 0 {
				return errors.New("credential write failed")
			}
			return nil
		},
		prompt: func(target string) (credential, error) {
			t, _ := syscall.UTF16PtrFromString(target)
			message, _ := syscall.UTF16PtrFromString("Enter the fresh database password chosen for this staging project in Supabase Dashboard. Username must remain postgres.")
			caption, _ := syscall.UTF16PtrFromString("CLASH staging credential storage")
			info := credUI{Message: message, Caption: caption}
			info.Size = uint32(unsafe.Sizeof(info))
			user := make([]uint16, 513)
			copy(user, syscall.StringToUTF16("postgres"))
			password := make([]uint16, 257)
			defer clear(password)
			defer clear(user)
			var save uint32
			// GENERIC_CREDENTIALS | ALWAYS_SHOW_UI | DO_NOT_PERSIST: only our reviewed
			// CredWrite call stores the validated entry, never the UI's automatic save.
			code, _, _ := systemCall("credui.dll", "CredUIPromptForCredentialsW", uintptr(unsafe.Pointer(&info)), uintptr(unsafe.Pointer(t)), 0, 0, uintptr(unsafe.Pointer(&user[0])), uintptr(len(user)), uintptr(unsafe.Pointer(&password[0])), uintptr(len(password)), uintptr(unsafe.Pointer(&save)), 0x40082)
			runtime.KeepAlive(info)
			runtime.KeepAlive(t)
			if code != 0 {
				return credential{}, errors.New("credential prompt cancelled or failed")
			}
			return credential{syscall.UTF16ToString(user), syscall.UTF16ToString(password)}, nil
		},
	}
}
