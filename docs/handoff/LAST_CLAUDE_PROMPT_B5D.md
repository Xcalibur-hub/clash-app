# Exact last Claude prompt — LIVE-CONNECT-B5D

**Status at handoff:** This prompt was already sent to Claude. Its output was pending. Do not resend automatically; review the result first.

---

CLASH — LIVE-CONNECT-B5D: RECOVERY CLI INITIALIZATION AND FAILURE JOURNAL CORRECTION

Repository: Xcalibur-hub/clash-app  
Checkout: founder's existing local Windows checkout (exact local user path intentionally omitted from this public handoff)  
Branch: arena-ui-review  
Expected local HEAD: 2b898748a48e317ac5737da62c7a964f50aca2a8

MISSION

Correct the confirmed B5C recovery CLI circular-dependency failure, add real direct-entrypoint regression coverage, and prepare the existing retained disposable database for a separately authorized B5E recovery attempt.

SOURCE-ONLY PHASE. No database startup or lifecycle operations.

READ FIRST
- .clinerules
- LIVE_CONNECT_B5R_POSTGRES_ACCEPTANCE.md
- LIVE_CONNECT_B5B_LIFECYCLE_RECOVERY.md
- LIVE_CONNECT_B5C_RECOVERY_ACCEPTANCE.md
- Current B4A harness/recovery code and README
- B5C attempt controller, stage journal and original recovery records
- Current 167-path harness seal and input receipts

CONFIRMED FAILURE

In recovery.cjs, direct execution starts async main() before module.exports is assigned. The start path enters runtime.enterRecovery(), which requires recovery.cjs while its exports are incomplete.

Observed:
- accept-created: PASS
- start: exit 1 before Docker invocation
- Circular dependency warning for missing context export
- No PostgreSQL start
- No SQL
- Original B5R and B5C records preserved

PHASE 1 — PRESERVATION

Verify HEAD, branch, empty index, all 167 sealed paths, 128 inputs, retained resource identities and immutable B5R/B5C evidence. Do not decrypt credentials or start the container.

PHASE 2 — SOURCE CORRECTION

Correct CommonJS initialization ordering so all required exports are available before direct CLI execution begins. Prefer the smallest auditable change. Review whether the recovery/runtime circular dependency can be eliminated safely without broad refactoring.

Preserve existing authorization, ownership, identity, recovery-context and stage gates. Ensure a missing or invalid recovery context still fails closed. Do not introduce a default context, fallback context, implicit retry or automatic continuation.

PHASE 3 — DIRECT CLI REGRESSION

Add tests that execute the actual recovery.cjs Node entrypoint in a fresh child process, not merely import the module.

Reproduce the original circular-initialization defect against the original source. Confirm the corrected source no longer produces the incomplete-export warning.

Run both:
- Missing authorization
- Validly structured but non-executing, safely gated recovery invocation

Prevent all Docker lifecycle, credential decryption and database operations during tests through explicit test-safe boundaries. Do not claim a real database recovery PASS from mocks or unit tests.

PHASE 4 — FAILURE JOURNAL

Review the distinction between:
- A stage invocation being recorded
- The runner entering its stage
- The stage performing a mutation
- The stage succeeding or failing

Ensure a CLI bootstrap failure cannot appear resumable simply because the private runner never marked attempted.start.

Do not alter the historical B5C failed invocation or its records. Prepare a future separate-attempt mechanism that preserves the previous UUID, original acceptance receipt and failure evidence. A future attempt must still require fresh authorization, ownership verification, source hashes, nonexpired credentials and exact retained resources. No generic resume-anything behavior.

PHASE 5 — OFFLINE VERIFICATION

Run:
- Direct-entrypoint regressions
- Full harness tests
- Recovery-state tests
- Backend source tests
- 128-input closure
- Native tester receipt
- Compose validation
- Read-only retained-resource identity check
- Unauthorized invocation rejection
- Release archive closure
- Original B5R/B5C preservation checks

Reseal the harness only after a successful review.

PHASE 6 — REPORT

Create:
docs/evidence/ui-completion/LIVE_CONNECT_B5D_RECOVERY_CLI_FIX.md

Include:
- Precise source defect and correction
- Exact changed paths
- Direct CLI reproduction before and after
- Failure-journal behavior
- All test results
- New harness seal
- Retained container/network/volume states
- Preservation verification
- Remaining blockers
- Exact authorization needed for B5E

PROHIBITIONS

- No Docker create/start/stop/remove
- No new resources or credential generation/rotation
- No database connection, managed initialization, migration or SQL
- No modification of B3 SQL proposals/tests
- No reuse of the failed B5C attempt ID
- No rewriting B5R or B5C failure evidence
- No staging, commit, push, merge, reset, stash, clean or deployment

REPORT AND STOP.
