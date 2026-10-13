# Phase 11 Step 6M: Pgcrypto compatibility correction and recovery preparation

**Mode:** FILE-ONLY. No hosted access, migration execution, resume, cron changes, or ledger repair.

**Baseline:** PR #59 / `a33def304c32b7f4f4f589c0fa01073d0c0fde4a`.  
**Worktree:** `C:/p116m`, branch `fix/phase-11-pgcrypto-artifact-recovery-6m`.

## Staging status: QUARANTINE (unchanged)

This step corrects the offline compatibility artifact only. **clash-staging remains quarantined** until a separately authorized recovery operation succeeds.

## 1. Compatibility correction

**Problem (confirmed in 6L):** `assert-managed-pgcrypto` on migration 44 required owner **`supabase_admin` only**. Hosted clash-staging has **`postgres`**. Executor preflight already accepts both (Step 6F); the artifact generator did not.

**Change:** In `scripts/extension-hook-preflight.cjs`, the generated preflight block now requires:

| Field | Requirement |
|---|---|
| `extname` | `pgcrypto` |
| `extversion` | `1.3` |
| `nspname` | `extensions` |
| `rolname` | **`postgres` OR `supabase_admin` only** (`in ('postgres', 'supabase_admin')`) |

No wildcard owners. No weakening of version/schema checks or other extension inventory gates.

**Aligned updates:**

- `docs/PHASE_11_EXTENSION_HOOK_PREFLIGHT.json` (regenerated proposal hashes/text)
- `tools/hosted-staging/investigate.go` probe `artifact_assert_would_pass` (read-only diagnostic parity)

**Not changed:** Any of the 106 **source** migration blobs, 245 integration file hashes, or seal `a92a550…`.

## 2. Artifact and manifest hashes

| Item | SHA-256 |
|---|---|
| Artifact 44 **old** | `de384efd4f41ef992377b53eccc230a59110d91669c873d06431a868f0b5af11` |
| Artifact 44 **new** | `380b693fd09edcefbe30028c8ed5de72ae9716776198f1d45c6ed8a1ef17f261` |
| Compatibility manifest **old** | `8f50541d3eed55bd905117a217bc8118a6b5483d1ffec2e5d0477b2be71b8c8a` |
| Compatibility manifest **new** | `5c39f97c62559b1f5ed175be409480fb3515fded61a16f0b1b33cc3e22768110` |
| Suite bundle manifest | **Unchanged** `12cac2a2b0119cb99110061800e14ea167f0928919da4bbd4e464dc0fbead7fe` |
| Seal Git-blob manifest | **Unchanged** `a9b30736c87a7fac05c9764404dfd58a876f64db6a3e072e9a348cac8b162b4e` |

Operators must pin **`5c39f97c…`** (not `8f50541d…`) for any **future** deploy/resume using corrected artifacts. The **43 rows already on hosted staging** remain tied to the **old** per-file digests for migrations 1–43 (unchanged artifact bytes).

## 3. Committed prefix validation (artifacts 1–43)

Compared regenerated manifest to the legacy snapshot used for 6K deploy (`legacy-compatibility-manifest-snapshot.json`):

- **43/43** `artifact_sha256` values **identical**
- Order and names unchanged
- **Only** migration 44 artifact bytes/hash changed (assert text)
- Still exactly **3** BOM-only transforms + **1** assert transform

**Result: PASS** — not BLOCKED.

## 4. Offline tests

| Suite | Result |
|---|---|
| `scripts/extension-hook-preflight.test.cjs` | PASS |
| `scripts/migration-compatibility-artifact.test.cjs` | PASS |
| `scripts/pgcrypto-artifact-assert.test.cjs` (new) | PASS |
| `go test ./...` / `go vet` (`tools/hosted-staging`) | PASS |
| `node tools/hosted-staging/prepare.cjs` | PASS (new manifest `5c39f97c…`) |

Regression coverage includes: both approved owners, rejected owners/version/schema, single assert transform, prefix-43 unchanged, 245-file bundle + seal blob unchanged.

## 5. Recovery options (analysis only)

### Option A — Controlled continuation from ledger prefix 43 (recommended)

**Pros:** Reuses verified clash-staging prefix; no new project; aligns with 6L rollback confirmation; smallest operational redo.

**Cons:** Requires **new executor `resume` capability** (not in tree yet) that:

1. Verifies target identity/TLS and pinned **new** manifest `5c39f97c…`
2. Reads ledger; requires **exactly 43** rows matching frozen artifacts 1–43 hashes
3. Confirms migration 44 **absent** from ledger and catalogs (investigate probes)
4. Rejects unexpected app data/objects; handles cron policy explicitly
5. Applies artifacts **44–106 only** in order; stop-on-first-failure; no skip/repair
6. Never re-runs committed migrations or mutates existing ledger rows

**Cron:** `clash-maintenance` may remain active during resume authorization; maintenance is bounded/idempotent but runs against partial schema until 106 complete — document in recovery auth.

### Option B — Fresh sterile staging project

**Pros:** Clean full-106 apply with corrected manifest; no resume logic; simpler mental model.

**Cons:** New project creation/budget/credentials; abandons quarantined partial DB; repeats 43 migrations worth of work; does not exercise prefix recovery path.

### Recommendation

**Option A** after implementing and offline-testing **resume-from-prefix-43** on the reviewed executor, using manifest **`5c39f97c…`**. Option B remains fallback if resume validation fails or product prefers a clean slate.

## 6. Remaining risks

1. **Resume not implemented** — correction alone does not unblock staging.
2. **Manifest pin drift** — configs still referencing `8f50541d…` will refuse or mismatch artifact 44.
3. **Partial schema + active cron** until migrations 44–106 complete.
4. **Further artifact asserts** — only migration 44 had assert transform; later failures still stop-and-quarantine.
5. **Application security** still unverified post-complete deploy.

## 7. Exact next authorization required

1. **Merge/review this PR** (artifact correction + tests + docs).
2. **FILE-ONLY:** Implement **`resume`** (or equivalent) mode with offline tests mirroring 6M requirements — separate PR.
3. **Then separately authorize:** one bounded direct IPv6 **`resume:zrutlrhhvfcsmssjiijl`** (or named equivalent) with:
   - Executor revision including resume + corrected investigate assert
   - Binary hash recorded at run time
   - Config `artifact_manifest_sha256`: **`5c39f97c62559b1f5ed175be409480fb3515fded61a16f0b1b33cc3e22768110`**
   - Fresh **`investigate`** + **`preflight`** immediately before resume
   - Stop-and-quarantine on any failure

Do **not** authorize blind re-run of full **`migrate`** on nonempty ledger.

## Evidence

[docs/evidence/phase-11-6m/](evidence/phase-11-6m/)
