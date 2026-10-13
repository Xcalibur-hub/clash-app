package main

import (
	"context"
	"errors"
	"fmt"
)

// verifyCompleteBucketInventory accepts exactly the media_storage bootstrap
// buckets with the expected identity, visibility and non-empty configuration.
// It does not impose the recovery contract's zero-row auth/storage requirement;
// those counts are reported instead of being required.
func verifyCompleteBucketInventory(buckets []recoveryBucket) (map[string]string, error) {
	classification := map[string]string{}
	seen := map[string]bool{}
	for _, b := range buckets {
		expected, known := recoveryExpectedBuckets[b.ID]
		if b.ID == "" || b.ID == "<nil>" || b.Name != b.ID {
			classification[b.ID] = "malformed"
			return classification, errors.New("storage bucket identity malformed; drift detected")
		}
		if !known {
			classification[b.ID] = "unexpected"
			return classification, errors.New("unexpected storage bucket; drift detected")
		}
		if b.Public != expected {
			classification[b.ID] = "unexpected_public_flag"
			return classification, errors.New("storage bucket visibility mismatch; drift detected")
		}
		if size := fmt.Sprint(b.SizeLimit); b.SizeLimit == nil || size == "" || size == "<nil>" {
			classification[b.ID] = "missing_file_size_limit"
			return classification, errors.New("storage bucket configuration incomplete; drift detected")
		}
		if b.MIME == "" || b.MIME == "<nil>" {
			classification[b.ID] = "missing_mime_types"
			return classification, errors.New("storage bucket configuration incomplete; drift detected")
		}
		classification[b.ID] = "expected"
		seen[b.ID] = true
	}
	for id := range recoveryExpectedBuckets {
		if !seen[id] {
			classification[id] = "missing"
			return classification, errors.New("expected storage bucket missing; drift detected")
		}
	}
	return classification, nil
}

func verifyCompleteStorage(ctx context.Context, s Session, report map[string]any) error {
	buckets, users, objects, bucketCount, e := probeRecoveryStorage(ctx, s)
	if e != nil {
		return e
	}
	report["storage_buckets"] = buckets
	report["storage_bucket_count"] = bucketCount
	report["auth_user_count"] = users
	report["storage_object_count"] = objects
	class, e := verifyCompleteBucketInventory(buckets)
	report["storage_bucket_classification"] = class
	return e
}

// verifyCompleteManaged requires the full managed-service inventory, matching
// the reviewed empty-DB preflight rather than the weaker two-field subset the
// resume path used, and reports which field failed.
func verifyCompleteManaged(ctx context.Context, s Session, report map[string]any) error {
	managed, e := query(ctx, s, managedSQL)
	if e != nil {
		return e
	}
	report["managed"] = managed.Rows
	if len(managed.Rows) != 1 {
		return errors.New("managed service inventory missing")
	}
	for _, key := range []string{"managed", "publication", "restricted_role", "restricted_files", "cron_preloaded"} {
		if managed.Rows[0][key] != true {
			report["managed_mismatch"] = key
			return errors.New("managed service inventory mismatch: " + key)
		}
	}
	return nil
}
