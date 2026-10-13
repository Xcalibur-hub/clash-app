package main

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// After migrations 1–43 (includes media_storage), exactly these empty buckets are expected.
// Fresh empty-DB migrate preflight still requires zero buckets via dataSQL.
var recoveryExpectedBuckets = map[string]bool{
	"public-media":  true,  // public=true
	"private-media": false, // public=false
}

const recoveryBucketInventorySQL = `select id::text as id, name::text as name, public,
  file_size_limit, allowed_mime_types::text as allowed_mime_types,
  created_at::text as created_at
from storage.buckets order by id`

const recoveryAuthStorageCountsSQL = `select
  (select count(*)::int from auth.users) as user_count,
  (select count(*)::int from storage.objects) as object_count,
  (select count(*)::int from storage.buckets) as bucket_count`

type recoveryBucket struct {
	ID        string
	Name      string
	Public    bool
	SizeLimit any
	MIME      string
	CreatedAt string
}

func parseRecoveryBuckets(rows []map[string]any) ([]recoveryBucket, error) {
	out := make([]recoveryBucket, 0, len(rows))
	for _, r := range rows {
		pub, ok := r["public"].(bool)
		if !ok {
			return nil, errors.New("storage bucket public flag malformed")
		}
		out = append(out, recoveryBucket{
			ID:        fmt.Sprint(r["id"]),
			Name:      fmt.Sprint(r["name"]),
			Public:    pub,
			SizeLimit: r["file_size_limit"],
			MIME:      fmt.Sprint(r["allowed_mime_types"]),
			CreatedAt: fmt.Sprint(r["created_at"]),
		})
	}
	return out, nil
}

// validateRecoveryStorageState accepts the exact media_storage bootstrap buckets
// with zero auth users and zero storage objects. Extra/missing/mismatched buckets fail closed.
func validateRecoveryStorageState(buckets []recoveryBucket, userCount, objectCount int) (classification map[string]string, err error) {
	classification = map[string]string{}
	if userCount != 0 {
		return classification, errors.New("unexpected auth users; quarantine retained")
	}
	if objectCount != 0 {
		return classification, errors.New("unexpected storage objects; quarantine retained")
	}
	seen := map[string]bool{}
	for _, b := range buckets {
		key := b.ID
		if key == "" || key == "<nil>" {
			return classification, errors.New("storage bucket id missing")
		}
		if b.Name != b.ID {
			classification[key] = "unexpected_name_mismatch"
			return classification, errors.New("storage bucket name/id mismatch; quarantine retained")
		}
		expectedPublic, known := recoveryExpectedBuckets[key]
		if !known {
			classification[key] = "unexpected"
			return classification, errors.New("unexpected storage bucket; quarantine retained")
		}
		if b.Public != expectedPublic {
			classification[key] = "unexpected_public_flag"
			return classification, errors.New("storage bucket public flag mismatch; quarantine retained")
		}
		classification[key] = "expected"
		seen[key] = true
	}
	missing := make([]string, 0)
	for id := range recoveryExpectedBuckets {
		if !seen[id] {
			missing = append(missing, id)
			classification[id] = "missing"
		}
	}
	if len(missing) != 0 {
		sort.Strings(missing)
		return classification, fmt.Errorf("expected storage buckets missing: %s; quarantine retained", strings.Join(missing, ","))
	}
	if len(buckets) != len(recoveryExpectedBuckets) {
		return classification, errors.New("storage bucket count mismatch; quarantine retained")
	}
	return classification, nil
}

func probeRecoveryStorage(ctx context.Context, s Session) (buckets []recoveryBucket, userCount, objectCount, bucketCount int, err error) {
	inv, e := query(ctx, s, recoveryBucketInventorySQL)
	if e != nil {
		return nil, 0, 0, 0, errors.New("storage bucket inventory incomplete; quarantine retained")
	}
	buckets, e = parseRecoveryBuckets(inv.Rows)
	if e != nil {
		return nil, 0, 0, 0, e
	}
	counts, e := query(ctx, s, recoveryAuthStorageCountsSQL)
	if e != nil || len(counts.Rows) != 1 {
		return nil, 0, 0, 0, errors.New("auth/storage count probe incomplete; quarantine retained")
	}
	userCount, e = asInt(counts.Rows[0]["user_count"], "user_count")
	if e != nil {
		return nil, 0, 0, 0, errors.New("auth/storage count probe incomplete; quarantine retained")
	}
	objectCount, e = asInt(counts.Rows[0]["object_count"], "object_count")
	if e != nil {
		return nil, 0, 0, 0, errors.New("auth/storage count probe incomplete; quarantine retained")
	}
	bucketCount, e = asInt(counts.Rows[0]["bucket_count"], "bucket_count")
	if e != nil {
		return nil, 0, 0, 0, errors.New("auth/storage count probe incomplete; quarantine retained")
	}
	return buckets, userCount, objectCount, bucketCount, nil
}
