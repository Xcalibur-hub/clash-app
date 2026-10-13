package main

import "errors"

// verifyCompleteBucketInventory accepts exactly the media_storage bootstrap
// buckets with the expected visibility, without imposing the recovery
// contract's zero-row auth/storage requirement (counts are reported instead).
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
