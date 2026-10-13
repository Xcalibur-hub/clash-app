# Phase 11 Step 6Q: Fresh recovery verification

**Mode:** READ-ONLY hosted investigation. No pause-cron, resume, migrate, fixtures, or writes.  
**Baseline:** 6N PR #61 · 6O PR #62 · 6P PR #63 / `9ba4baf313430321f12d3b436e0aa6ca121c06c7`.  
**Worktree:** `C:/p116q`, branch `feat/phase-11-recovery-verify-6q`.  
**Authorization:** `investigate:zrutlrhhvfcsmssjiijl`.

## Verdict: BLOCKED

Fresh investigate **stopped fail-closed** on storage drift: `storage.buckets` has at least one row (`buckets=true`), while `auth.users` and `storage.objects` remain empty. Prior 6I/6K preflights recorded `buckets=false`.  

Staging remains **QUARANTINED**. **Resume is not authorized.** No one-time resume procedure is issued from this step.

| # | Check | Result |
|---|---|---|
| 1 | Identity / PG17 / role / TLS | **PASS** |
| 2 | Exactly 43 migrations; version/name/order/hash vs frozen artifacts | **PASS** (0 hash mismatches) |
| 3 | Migration 44 absent from ledger + catalog | **PASS** (`confirmed_absent`) |
| 4 | First-43 dependencies present | **NOT REACHED** (stopped earlier) |
| 5 | Manifest `5c39f97c…` | **PASS** (offline prepare + config pin; live load accepted) |
| 6 | Artifact 44 `380b693f…` | **PASS** (offline file hash + config pin) |
| 7 | Exactly one inactive `clash-maintenance` jobid=1 | **NOT REACHED** (stopped earlier; last write evidence: 6P success) |
| 8 | No running maintenance / unexpected activity | **NOT REACHED** |
| 9 | No unexpected schemas / auth users / storage objects / buckets | **FAIL** — `buckets=true` (users=false, objects=false; schemas not listed as unexpected before stop) |

`artifact_assert_would_pass` (corrected pgcrypto allowlist) = **true**.

## Connection gates

| Item | Value |
|---|---|
| Executor tree | `9ba4baf` + recovery investigate probes (`investigate.go`) |
| Binary SHA-256 | `40edcdd9ac125528266a7e7d7994a9567a8a295229fa62a77fcc6f4d4d7262ef` |
| CA | `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7` |
| Transport | direct IPv6; Cred Manager; exit **1** |
| Failure | `unexpected auth or storage data; quarantine retained` |
| `stop_condition` | `unexpected_auth_or_storage` |

## Observed storage state

```json
{ "users": false, "objects": false, "buckets": true }
```

Empty-project / resume preflight contracts require all three **false**. A platform or operator change since 6K introduced bucket metadata without objects/users. Treat as **unexpected** until separately investigated (read-only bucket inventory) and explicitly accepted or cleared under new authorization.

## Resume procedure

**Not provided.** Recovery remains blocked until:

1. Separately authorized read-only diagnosis of `storage.buckets` drift (and any follow-on remediation auth if required).
2. A fresh investigate (or equivalent) showing all nine checks **PASS**, including inactive quiescent cron and empty auth/storage/buckets.
3. Then a **separate** write authorization for `resume:zrutlrhhvfcsmssjiijl` only.

## Evidence

[docs/evidence/phase-11-6q/](evidence/phase-11-6q/)
