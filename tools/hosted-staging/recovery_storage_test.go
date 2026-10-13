package main

import "testing"

func TestValidateRecoveryStorageExpectedBuckets(t *testing.T) {
	buckets := []recoveryBucket{
		{ID: "private-media", Name: "private-media", Public: false},
		{ID: "public-media", Name: "public-media", Public: true},
	}
	class, e := validateRecoveryStorageState(buckets, 0, 0)
	if e != nil || class["public-media"] != "expected" || class["private-media"] != "expected" {
		t.Fatal(e, class)
	}
}

func TestValidateRecoveryStorageRejectsEmptyBucketGateMistake(t *testing.T) {
	// Nonempty expected buckets after migration 43 must not be treated as empty-DB failure.
	buckets := []recoveryBucket{
		{ID: "public-media", Name: "public-media", Public: true},
		{ID: "private-media", Name: "private-media", Public: false},
	}
	if _, e := validateRecoveryStorageState(buckets, 0, 0); e != nil {
		t.Fatal(e)
	}
}

func TestValidateRecoveryStorageRejectsExtraBucket(t *testing.T) {
	buckets := []recoveryBucket{
		{ID: "public-media", Name: "public-media", Public: true},
		{ID: "private-media", Name: "private-media", Public: false},
		{ID: "avatars", Name: "avatars", Public: true},
	}
	class, e := validateRecoveryStorageState(buckets, 0, 0)
	if e == nil || class["avatars"] != "unexpected" {
		t.Fatal(e, class)
	}
}

func TestValidateRecoveryStorageRejectsUsersOrObjects(t *testing.T) {
	buckets := []recoveryBucket{
		{ID: "public-media", Name: "public-media", Public: true},
		{ID: "private-media", Name: "private-media", Public: false},
	}
	if _, e := validateRecoveryStorageState(buckets, 1, 0); e == nil {
		t.Fatal("users accepted")
	}
	if _, e := validateRecoveryStorageState(buckets, 0, 2); e == nil {
		t.Fatal("objects accepted")
	}
}

func TestValidateRecoveryStorageRejectsMissingOrWrongPublic(t *testing.T) {
	if _, e := validateRecoveryStorageState([]recoveryBucket{{ID: "public-media", Name: "public-media", Public: true}}, 0, 0); e == nil {
		t.Fatal("missing private accepted")
	}
	buckets := []recoveryBucket{
		{ID: "public-media", Name: "public-media", Public: false},
		{ID: "private-media", Name: "private-media", Public: false},
	}
	if _, e := validateRecoveryStorageState(buckets, 0, 0); e == nil {
		t.Fatal("wrong public flag accepted")
	}
}
