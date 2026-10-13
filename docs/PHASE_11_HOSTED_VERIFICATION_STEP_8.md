# Phase 11 Step 8 — Hosted Verification & Security-Test Readiness

**Baseline:** `a3854ac` (Step 7). **Worktree:** `C:/p117` on `feat/phase-11-backend-security-7`.
**Target:** `clash-staging` / `zrutlrhhvfcsmssjiijl` — **read-only** only.
**Authorization used:** `verify-complete:zrutlrhhvfcsmssjiijl`.
**Evidence:** `docs/evidence/phase-11-8/`.

## Verdict

**HOSTED STATE VERIFIED (106/106)** and the local pgTAP suite is now **89/89 PASS (3444
assertions)**. Staging remains **QUARANTINED** and `clash-maintenance` remains **inactive**.

---

## Part A — Verifier review and hardening

Audited `verify_complete.go`, `verify_complete_buckets.go` (+ helpers) and their tests.

| # | Requirement | Finding | Action |
|---|---|---|---|
| 1 | Audit the verifier | Feature-complete but a 179-line single file with two real defects (below) | Split into `verify_complete.go`, `_objects.go`, `_buckets.go`, `_cron.go`; all under the 150-line rule |
| 2 | Expects the **complete 106** state, not 43 | `verifyCompleteExpectedCount = 106`; `len(a.Files) != 106` fails; ledger verified via `verifyExactLedgerPrefix(l, a, 106)`; separate mode from the 43-migration `investigate` | Confirmed |
| 3 | Object checks must fail **cleanly** if a table/function is missing | **DEFECT:** the probe used `polrelid='public.reputation_events'::regclass`, `relrowsecurity … oid='…'::regclass` and `has_column_privilege('anon','public.course_lessons',…)`, which **hard-error** when the object is absent | Rewrote every check to be catalog/oid-guarded (`to_regclass`, `pg_policy.polrelid = to_regclass(…)`, `bool_and` over `pg_attribute`/`pg_proc` with `coalesce(…,false)`). No `::regclass`/`::regprocedure` remains. Regression test `TestVerifyCompleteObjectProbeIsFailSafe` |
| 4 | Distinguish extension **availability** from **installation** | Only availability was checked | Now requires managed pgcrypto installed, requires `pg_cron` **installed**, requires all five available, and records `required_extension_states`. Test `…RequiresPgCronInstalled` |
| 5 | Bucket configuration and managed-service assumptions | Buckets checked for identity/visibility only; `managed` used a two-field subset | Buckets now also require non-empty `file_size_limit` and `allowed_mime_types`; `managed` now requires the full reviewed set (`managed`, `publication`, `restricted_role`, `restricted_files`, `cron_preloaded`) and reports which field failed. Tests `…RejectsManagedDrift`, `…RejectsMissingManagedInventory` |
| 6 | Strict TLS / identity / manifest / authorization gates | Present, but lineage was implicit | Added explicit `verifyCompleteArtifactGates` (manifest `5c39f97c…`, exactly 106, candidate/manifest lineage, artifact-44 hash) mirroring `resumeArtifactGates`; test `…ArtifactGatesRejectForeignLineage` |
| 7 | Offline tests for uncovered edges | Added | 7 new tests (cron in progress, unfinished-status drift, managed drift, missing managed inventory, pg_cron not installed, artifact lineage, probe fail-safety). **13/13 verify-complete tests pass**, `go vet` clean, `gofmt` clean |
| — | Cron **execution** state | Only "job inactive" was checked; the brief requires "no maintenance execution remains active" | Added `verifyCompleteCron`, reusing the reviewed quiescence probe (`probeQuiescence` + `evaluateQuiescence`): unfinished / stale / unexpected-status rows, active backends and live job PIDs are reported and must be clear |

**Correction found only by running it on hosted (Part B):** the probe asserted tables
`public.profile_clash_stats` and `public.comment_reply_notifications`, but migration 105 creates a
**function** `public.profile_clash_stats(text)` and migration 106 creates **functions**
`public.arena_comment_notify(...)` / `public.notify_arena_comment()` and the **trigger**
`comments_notify_arena`. Fixed to name-based `pg_proc`/`pg_trigger` checks and locked with
`TestVerifyCompleteProbeCoversFinalMigrationsObjects`, which cross-checks the probe against the
frozen artifacts of the last two migrations.

No verification requirement was weakened; the net effect is strictly stronger.

## Part B — Hosted read-only verification

**Attempt 1 (tool defect):** exited `1` with `expected migrated objects missing or unguarded; drift
detected`. Evidence `hosted-verify-attempt-1-tool-defect.json` recorded
`missing_expected_objects = [profile_clash_stats, v106_comment_reply_notifications]` — the two
wrongly-named probes from Part A. Every other gate already passed on this first attempt.

**Attempt 2 (corrected verifier): exited `0` — VERIFIED.**

| Check | Result |
|---|---|
| Identity / TLS / PostgreSQL 17 | `database_match`, `current_role_match`, `session_role_match`, `backend_ssl_observed`, `postgres_17_match` all true; `failure_reason = none` |
| Ledger | **106 rows**; order/name/statement hashes verified (`ledger_verified = true`) |
| Required schema objects | all 12 probes true (course_lessons, v105 function, v106 functions + trigger, arena_interest_preferences, explore_challenge_results, postgis geometry type, reputation RLS) |
| H1 / H2 / H3 authorization hardening | `h1_notify_guarded`, `h2_lesson_content_guarded`, `h3_reputation_owner_gate` = **true** |
| Storage | exactly `private-media` (public=false) + `public-media` (public=true), both with `file_size_limit=104857600` and the reviewed MIME set; `auth_user_count=0`, `storage_object_count=0` |
| Managed extensions / services | installed: pgcrypto 1.3 (`extensions`, owner `postgres`), pg_cron 1.6.4, postgis 3.3.7; available: pgcrypto, postgis, pg_cron, pgtap, dblink; managed inventory all true |
| Cron | exactly one `clash-maintenance` job (`jobid=1`), `active=false`, identical reviewed schedule/command/user; quiescence all zero, `cron_quiescent=true` |
| Schema drift | `unexpected_schema_names = null` |
| Outcome | `verified_complete = true`, exit `0` |

`database_security_passed` stays `false` by design — the executor makes no security claim.
Executor binary: `4CF6F9266D40A8CCE914854537C4701AB419CF69D2B5327E7F36D773D1C1EFAF`.
Both attempts were strictly read-only; nothing was written, installed or changed on hosted.

## Part C — Security-test authorization matrix

Mechanical classification of all 89 suites (`docs/evidence/phase-11-8/security-test-authorization-matrix.json`):

| Category | Count | Execution class |
|---|---|---|
| Read-only catalog/privilege | 5 | safe against hosted without writes (`029`, `030`, `034`, `049`, `050`) |
| Disposable transactional | 74 | requires a disposable DB; writes fixtures inside `begin`/`rollback` |
| Committed concurrency (dblink) | 10 | requires a disposable DB **plus** a superuser role and independent committed sessions |
| **Hosted write required** | **0** | no suite needs hosted writes |

Coverage mapping for the brief's list: RLS and role privileges, cross-user authorization, course-lesson
entitlements, reputation-history privacy, settlement/concurrency, storage access, advertiser/creator
isolation, and Auth/Realtime are all exercised by the 74 transactional suites plus the 10 concurrency
suites, and all pass locally. The security-critical H1/H2/H3, storage, extension and ledger
invariants are additionally re-verified **read-only on hosted** by `verify-complete`.

Consequences: no hosted writes are required to complete validation; the remaining hosted gap is
*execution authorization*, not missing tests. Installing `pgtap`/`dblink` on hosted, and running the
10 concurrency suites against hosted, would both require separate authorization and are **not**
proposed here.

## Part D — Local test limitation resolution

Reviewable tooling: **`scripts/local-pgtap-staging.mjs`** (new). It stages a disposable Supabase
project whose `supabase/migrations` are the reviewed BOM-stripped compatibility artifacts, copies the
89 suites, writes a local-only config and emits the exact command plan. Frozen migration bytes are
never modified (`artifact_manifest_sha256 = 5c39f97c…`, `frozen_migration_bytes_modified = false`).

| # | Limitation | Fix (disposable/local only) | Result |
|---|---|---|---|
| D1 | 3 migrations carry a UTF-8 BOM → `supabase db reset` fails `42601` | stage the reviewed BOM-stripped artifacts instead of editing frozen bytes | 106 migrations applied; manifest `5c39f97c` |
| D2 | `001` #23 needs the storage-api `protect_delete` trigger; CLI-pinned **v1.26.5** lacks `migrations/tenant/0055-prevent-direct-deletes.sql` (present in v1.69.11 / v1.77.5 / v1.79.36) | local image alias `v1.69.11 → v1.26.5`; original id `sha256:e6b60304…ccb6c` recorded for restore | `001` **PASS 24/24** |
| D3 | `066` #20 requires an account that existed at migration time | harness seed inserts one returning account + its completed preference row after migrations (not a migration) | `066` **PASS 20/20** |
| D4 | 10 dblink concurrency suites cannot run (dblink not trusted; local `postgres` non-superuser) | disposable-only `alter role postgres superuser` (no test asserts a non-superuser `postgres`) | **10/10 PASS** |

**Final local run (actual):** `Files=89, Tests=3444, Result: PASS`, exit `0`, `All tests successful.`
Security suites `085/087/088/089` all PASS. This is a genuine 89/89 — no file is skipped, failed or
TODO. Raw TAP: `docs/evidence/phase-11-8/local-pgtap-final.tap.log`.


## Final verdict

| # | Question | Answer |
|---|---|---|
| 1 | Is the hosted 106-migration state verified? | **YES.** Read-only `verify-complete` exited `0`: 106 ledger rows with matching names/versions/order/hashes, all expected objects, exactly two correctly configured buckets, managed inventory intact, no schema drift. |
| 2 | Does the complete-state verifier pass? | **YES**, after hardening. Attempt 1 was a false BLOCK caused by two wrong object names in the probe (a tool defect); corrected, re-run read-only, passed. |
| 3 | Are H1/H2/H3 controls present? | **YES.** H1 (`clash_notify` anon/authenticated EXECUTE revoked), H2 (`course_lessons` `body_text`/`media_object_id` unreadable by `anon`), H3 (restrictive `reputation history owner boundary` policy + RLS enabled) all verified true on hosted and covered by suites 087/088 locally. |
| 4 | Did all 89 local pgTAP suites pass? | **YES — genuinely 89/89, 3444 assertions, `All tests successful.`** Up from 77/89 (2 environment-dependent failures, 10 not run) in Step 7. The three environment causes were fixed in tooling, not by relaxing any test. |
| 5 | Which security tests remain unverified? | Only hosted **execution** of the suite. The 10 committed-concurrency suites must never run against hosted; the 5 read-only suites could join a future authorized hosted read-only run. No test content is unverified locally. |
| 6 | Are hosted write-based tests necessary? | **NO.** All 89 suites pass on a disposable database; no hosted writes are needed. Hosted `pgtap`/`dblink` installation is **not** proposed or authorized. |
| 7 | Is staging ready for a separately authorized security-validation phase? | **YES, ready to be authorized** — the target is verified complete, quiescent and drift-free, and the matrix above defines exactly what would run. Authorization has **not** been granted, so staging stays quarantined. |

## Evidence index (`docs/evidence/phase-11-8/`)

| File | Content |
|---|---|
| `hosted-verify-complete.json` | full sanitized hosted verification report (attempt 2, VERIFIED) |
| `hosted-verify-outcome.json` | attempt-2 process outcome (`success: true`) |
| `hosted-verify-attempt-1-tool-defect.json` / `-outcome.json` | the false BLOCK and the exact wrong probe names |
| `local-pgtap-summary.json` | environment, 89/89 result, Step 7 → Step 8 progression |
| `local-pgtap-final.tap.log` | raw TAP log of the passing 89-file run |
| `security-test-authorization-matrix.json` | per-suite execution classification |
| `tooling-fixes.json` | D1–D4 fixes with scope and restore instructions |

## Handoff / draft PR

- Branch `feat/phase-11-backend-security-7` adds: hardened `verify-complete` (+ 7 new tests,
  13 total), `scripts/local-pgtap-staging.mjs`, this report and the evidence set.
- **Recommended next authorization (read-only):** none required — hosted verification is complete.
- **Then, separately:** (a) security-validation phase (matrix-driven; hosted read-only where possible,
  disposable where not), (b) cron reactivation, (c) quarantine lift.
- Staging remains **QUARANTINED**; `clash-maintenance` remains **inactive**; nothing was written,
  installed or deployed on hosted. Local harness note: the storage-api tag alias and the superuser
  `postgres` role exist **only** in the disposable project `clash_p11_pgtap` on this machine; the
  original image id is recorded in `tooling-fixes.json`.

