# Pre-beta server-security remediation — 11 November 2026

**PARTIAL / NOT DEPLOYED.** Source corrections and disposable PostgreSQL acceptance are complete for the boundaries below. Public beta remains blocked by F2 Storage admission, F4's open historical-visibility decision, and separately authorized target deployment/E2E. No application source or releaseScope was changed. No accepted database write, credential operation, native operation, staging integration, commit or push occurred.

Baseline: `arena-ui-review` at `2b898748a48e317ac5737da62c7a964f50aca2a8`, intentionally dirty, index empty. Audit: [original findings](BETA_STAGING_AUTHORIZATION_AUDIT_20261111.md). Private executable evidence: `.expo/beta-security-remediation-20261111/`.

## Findings and contracts

| Finding | Candidate status | Correction / remaining boundary |
|---|---|---|
| F1 Take identity | **FIXED in tested candidate** | Freeze debate identity while an unexpired pending challenge, accepted challenge, or any historical Clash depends on it. Owner edits before binding and after an expired unaccepted offer remain supported. Other authors cannot edit. Parent row-version stamping prevents a stale REPEATABLE READ snapshot from missing a newly bound challenge. |
| F2 deferred capabilities | **PARTIAL** | 57 exact overload signatures receive conditional server admission checks; six implicit membership/participant insertion boundaries receive write fences. Existing Meet gates are prerequisites; existing Creator Live B3 approval provenance remains required. Storage's own-namespace INSERT policy still permits arbitrary new objects without a `media_objects` admission record. This is a remaining server boundary, not fixed by gating `create_media_upload`. |
| F3 legacy start_clash | **FIXED in tested candidate** | Preserve the exact text-returning signature/defaults, revoke public/anon/authenticated/service-role execution, and make the owner-callable body fail closed with `42501`. Canonical create/invite/author accept and historical reads remain available. |
| F4 Take visibility | **PARTIAL** | Restrictive client SELECT policy excludes runtime fixtures; the SECURITY DEFINER readability helper also excludes them. Existing removed-content and actor-blocking helper checks remain. Owner explicitly answered **“Leave this decision open”** about public expired history. Expiry continues to remove discovery eligibility without inventing a privacy boundary. |

F1 freezes all row identity/content fields except lifecycle status, expiry, counters, heat and server-only fixture classification. Ordinary clients do not gain UPDATE access to that classification. Administrative fixture tagging, removal and historical access remain possible. Settled history stays bound because existing readers derive the proposition from the Take. No stored verdict, reward or settlement implementation changes.

## Exact source changes

New migrations, applied only to the fresh disposable clone:

- `supabase/migrations/20261111120000_beta_take_identity.sql`
- `supabase/migrations/20261111120100_beta_deferred_admission.sql`
- `supabase/migrations/20261111120130_beta_admission_write_fences.sql`
- `supabase/migrations/20261111120200_beta_legacy_visibility.sql`

New policy/tests/tooling:

- `supabase/policies/beta-admission-rpcs.json`
- `supabase/tests/beta_security_remediation.pgtap.sql`
- `supabase/tests/beta_deferred_admission.pgtap.sql`
- `supabase/tests/beta_onboarding_fixture.sql`
- `scripts/beta-security-concurrency.cjs`
- `scripts/beta-security-remediation.test.cjs`

Modified existing paths:

- `supabase/tests/064_arena_discovery_states.sql`: strengthen fixture direct-read expectation to NULL, retaining all 15 assertions.
- `supabase/tests/082_explore_security_contract.sql`: add two trusted pre-existing participation fixtures, retaining all 61 validation/ownership assertions under closed admission.
- `scripts/beta-security-audit.test.cjs`: replace obsolete expected server-gap assertions with candidate checks; retain frontend/auth contract assertions.
- `package.json`: add the six offline remediation tests to the existing test command, preserving prior edits.
- `docs/ai/TASKS.md`, `docs/ai/CURRENT_STATE.md`, `docs/ai/HANDOFF.md`: current status/handoff.
- This report and `docs/evidence/release-readiness/BETA_RPC_CAPABILITY_MATRIX_20261111.md`.

Private snapshots, clone bootstrap scripts, receipts and logs are confined to `.expo/beta-security-remediation-20261111/`; they are not public checkpoint inputs. Historical migrations, pending Creator Live/Meet proposals and production frontend files were not edited by this task.

## Authorization matrix and dependencies

[Complete installed signature/ACL matrix](BETA_RPC_CAPABILITY_MATRIX_20261111.md) inventories the original 479 public functions plus candidate helpers. The typed-by-signature JSON policy records all 57 guard predicates and original function-body MD5 identities. Admission denies with `42501`; mixed functions preserve decline, disable, existing membership/progress and terminal paths. Existing authorization still applies after a continuation passes the admission test.

The gate inserts a check into the exact existing body and fails deployment on missing/signature/body drift. Installed verification restored the 57 bodies by removing only that exact inserted fragment and matched every original body hash and ACL. No schema-wide revocation, table grant expansion or weaker read fallback was introduced. Helper EXECUTE is private. The sole changed existing function ACL is retired `start_clash`.

Canonical text Take/comment creation, challenge/accept, Room watch, official contributions, judging, onboarding saves, public/free Vault reading, authorized membership/history, Leave, decline, cancellation and terminal/safety functions are not blanket-disabled. A membership or progress row must already exist for deferred continuation; concurrent deletion cannot be converted into a fresh UPSERT admission. Canonical Clash-backed Room participants are explicitly preserved.

Source Edge review: `creator-ai` calls the caller-scoped `creator_ai_begin_turn` before its privileged completion; `digital-creator` starts through the gated caller RPC. Existing media-access functions authorize the target before signing. Their deployed HTTP behavior was **NOT TESTED** here. Trusted owner/service direct writers and DDL remain a privileged trust boundary; RPC gates do not secure unrestricted admin credentials.

**F2 next correction:** replace the permissive Storage upload admission with a narrow, actor-scoped existing-upload contract. An upload should match an already admitted, nondeleted `media_objects` row's owner/bucket/path and valid upload state; deny unmatched inserts/overwrites while preserving existing reads/deletion and authorized in-progress completion. Audit all effective Storage policies, signed-upload bypasses and UPDATE/UPSERT behavior first. Test genuine Storage HTTP and SQL-role positive/negative cases before claiming media admission closed. No Storage policy was silently changed in this batch.

## Disposable PostgreSQL execution

Fresh target `clash-beta-security-20261111`, container `4b6132e1e5e152a20ba8885b014bc123b28ab190a82e3bdcdd4a6719ca72f6eb`, system ID **7706794265281839121**. Image `public.ecr.aws/supabase/postgres@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108`, PostgreSQL 17.11.

Network `none`, no published ports, read-only root, fresh tmpfs `/tmp`, no existing volumes or host mounts, no external workers, no cron extension/preload. Only local Unix-socket connections inside this disposable container. No production secrets, passwords, user data or tokens copied/generated. Synthetic Auth rows exist only on this target; PostgreSQL roles are exercised with real SET ROLE and fictional claims, not a claim of real Auth login verification.

An equivalent **schema-only clone** was used, not a replay of the dirty migrations directory: public/auth/storage/extensions/realtime definitions, relevant extensions and no data. Provenance records the accepted target's 112 ledger row digests. Two exact interest-catalogue INSERT statements supply public reference data. Then apply the reviewed Meet cancel/admission prerequisites followed by the four new migrations. All six SHA-256 values are in `final-migration-inputs.json`. No manual ledger entries or accepted-target migration application occurred. Full from-zero migration replay is **NOT TESTED**.

Original prototype databases and failed attempts are retained. Final acceptance uses `beta_security_v4`; creating fresh databases in the same disposable cluster preserved prior failures instead of resetting them. Clone-only `world_fuzz_location` return type deparses as `extensions.geography` instead of `geography`; identical source body and same PostGIS type, no semantic change. All other existing function differences are the reviewed 57 guards, two visibility/legacy functions and five Meet prerequisite bodies.

## Actual results

| Executed check | Result / evidence |
|---|---|
| New authorization SQL | **45/45 PASS**, `v4-beta_security_remediation.pgtap.sql.log` |
| Deferred admission SQL | **141/141 PASS**, real anon/authenticated/service_role execution, `v4-beta_deferred_admission.pgtap.sql.log` |
| Canonical challenge lifecycle / Inbox | **82/82 + 39/39 PASS**, v4 logs |
| Interests/preferences, catalogue, ranking | **20/20 + 9/9 + 16/16 PASS**, v4/final logs |
| Visibility/discovery | **20/20 + 15/15 PASS**, v4/final logs |
| Vault preview / For You / Explore security | **9/9 + 6/6 + 61/61 PASS**, final logs |
| Existing Meet gate/roles regressions | **50/50 + 55/55 PASS**, v4 logs |
| SQL assertion total | **568/568 PASS**, no skips; SQL transactions roll back fixtures |
| Real independent PostgreSQL race sessions | **4/4 PASS**, `concurrency.log` and `disposable-target.json.concurrency.json` |
| Focused Node security tests | **11/11 PASS**, `offline-focused.log` |
| Full npm test | **1,542/1,542 PASS** = 835 unit + 642 lifecycle/script + 65 scope, `full.log` |
| TypeScript | **PASS**, `typecheck.log` |
| Navigation / offline Arena harness | **11/11 + 206/206 PASS**, `navigation.log`, `arena-offline.log`; no live runner |
| Duel payload / renders | **29/29 + 22/22 + 28/28 PASS**, `duel.log`, `duel-render.log` |
| EAS dependency/archive closure | **PASS 723 files**, runtime delta 0, `archive.log` |

EAS inventory SHA-256 remains `9e04ddf401830f68372235748dfc3374f1bb9f1fa275d2bfad4d623cb062a86f`. No packaging rule or runtime file admission change.

Race evidence uses observed `pg_blocking_pids`, not sequential mocks: challenge-before-edit rejects `23514`; edit-before-challenge remains legitimate; stale REPEATABLE READ edit rejects `40001`; deletion while deferred join waits rejects re-admission `42501`. Distinct backend PIDs and blockers are retained. Cross-session fixtures remain owned on the disposable target: two synthetic users, three Takes/challenges and one Play challenge; **zero Clashes, Rooms or ballots**. No live duel was created.

## Failures preserved and corrected

Baseline new core tests exposed the original gaps (28 passes/13 failures before remediation). Early fixture setup had an invalid Take time window, expected the wrong existing fixture-denial SQLSTATE, and carried actor claims into an anonymous check; corrected fixtures/expectations, not authorization rules. An out-of-order gate and a deliberately missing-body prerequisite both aborted with SQL exit 3 and rolled back all partial migration effects (`ordering-negative.log`, `atomic-drift-negative.log`).

Prototype deferred tests found invalid community status `paused` and an actual case/quoting mismatch in its guard; corrected to the real `active/disabled` enum and case-normalized predicate. The 57-row source/SQL equality test now detects such drift. Historical 066 requires a returning-user backfill fixture absent in an empty clone; the prefix uses the exact historical skipped-preference semantics. Historical 069 exposed overly broad fixture-flag immutability; exempted server-only moderation metadata and retested on fresh v4. Original 064 fixture-read expectation was intentionally replaced with denial. Original 082 lost two validation branches under closed admission; added only existing participant fixtures to exercise the original assertions. Original failure logs remain alongside final passes.

The first snapshot-verification helper compared differently shaped metadata objects; narrowed comparison to common signature/body/ACL fields, then verified all 479 functions and 112 ledger digests unchanged. The only clone formatting discrepancy was the schema-qualified PostGIS return type described above. No failure was hidden by psql's sometimes-zero TAP exit: every run checked both SQL status and `not ok` output.

## Preservation, rollback and next authorization

Accepted isolated database system ID **7703813712308420644** was accessed only for read-only schema/catalogue/count inspection. All 479 function definitions/ACLs, 118 public policies, three Take triggers and 112 ledger digests remain unchanged. Post counts: nine Takes, nine Clashes, nine Rooms, nine challenges, seven ballots, three verdicts. No maintenance/settlement/credential call, restart or accepted-target write occurred. No fresh pre-task full-row digest was captured; catalogue/count equality must not be described as a new byte-for-byte audit of every historical data row. Prior Duel #9 evidence remains preserved.

Filesystem preservation receipts compare all 4,533 baseline nonignored files; only the seven authorized existing paths (package, audit test, two historical SQL tests and three AI handoff documents) change. New files are scoped source/evidence. `index.html`, frontend work, Meet/B3 proposals and prior evidence retain their baseline bytes. HEAD and index remain unchanged. Final details are in `preservation-after.json`.

All 143 protected acceptance entries retain their task-start bytes. Two evolving sources already differed from the historical accepted-source hashes before this task: `app/take/[takeId].tsx` and `services/arenaChallengeService.ts`. Those inherited changes were preserved exactly; no acceptance manifest was rebound and no new native PASS is inferred.

Every new migration is transactional. Ordering and mid-migration failure rollback were executed on disposable PostgreSQL; removing successfully deployed guards/reopening legacy admission is **not** an approved rollback. Prefer a reviewed forward correction. No historical content/backfill rewrite is needed. Row-version stamping adds a bounded parent UPDATE/lock cost; production load and complete migration-chain replay remain unverified.

The disposable tmpfs target is retained intact; stopping it would lose its databases. No automatic cleanup is performed. Exact-resource disposal requires separate owner approval. Logs remain on the host.

Next: finish/review the narrow Storage boundary and decide historical visibility. Eventual deployment requires separate approval naming a target, pinned migration hashes/order, baseline/backup, scheduler state and rollback/forward-repair plan. Staging Auth/Storage/Edge and multi-actor E2E require their own bounded operation budgets. Nothing here authorizes modifying the accepted nine-duel database or automatically running the staging plan.
