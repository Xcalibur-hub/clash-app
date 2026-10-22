# E3.2.5 — Meet database security validation

Date: 2026-10-22. Branch: `arena-ui-review`.

## Database isolation and destruction boundary — recorded before execution

**No database execution is authorized against the existing local or hosted stack.**
No existing project credentials, database URLs, containers, volumes, networks or
Supabase CLI project bindings will be used. No migrations, seeds, reset or SQL
writes have been run against any database during this task.

A future execution environment must be a newly created, disposable PostgreSQL /
Supabase-compatible instance with pgTAP and dblink, no existing volumes or host
data mounts, no production credentials, no exposed TCP port and no network route
to any existing database. Replay the real migration history there; do not replace
auth/RLS/rate-limit dependencies with mocks. Disable scheduled jobs in that
instance. Name its database `clash_e325_<unique suffix>` and explicitly set
`test.e325_disposable=on` in the test connection. The suite refuses other targets.

The dblink concurrency tests connect only through that instance's Unix socket,
as `postgres`, to `current_database()`. They commit namespaced concurrency
fixtures so a second connection can see them, then delete those fixtures. Other
fixtures use the existing pgTAP BEGIN / no_plan / finish / ROLLBACK convention.
If execution aborts before cleanup, destroy the whole disposable instance.
Destruction must target only the exact newly created container and its private
ephemeral storage; never run Docker/Supabase prune, reset or blanket cleanup.

**Availability: BLOCKED.** Read-only Docker discovery found the configured
`desktop-linux` context, but `dockerDesktopLinuxEngine` does not exist. The default
engine pipe is also unavailable. `psql`, `initdb`, `pg_ctl` and `pg_prove` are not
installed on PATH; no `C:\Program Files\PostgreSQL` installation was found.
No daemon, container or database was started. No destruction was necessary.

## Current result

**Deployment: NO-GO. pgTAP: NOT EXECUTED.** Static and client checks cannot prove
PostgreSQL trigger/index order, locking, RLS, transactional effects or audit
persistence. Results and coverage details follow.

## Existing E3.2 commit

Atomic local commit: `9eee8e9d45fccb0b9fe5019386ae4bcf1058c14c` (`feat(meet): add E3.2 safety and session lifecycle
contract`), parent `58c031655a2ba717e371eb860a5fca208f8f449d`. Exactly 16 E3.2 files
were staged by explicit path, including the migration and E3.2 report. Unrelated
untracked files were excluded. E3.2.5 validation files are separate working-tree
deliverables, not silently folded into that existing-work commit.

## Deliverables and coverage

- `supabase/tests/097_meet_safety_and_lifecycle.sql`: **101 authored pgTAP
  assertions; 0 executed**. Follows transaction-scoped repository conventions,
  with an explicitly documented exception for committed second-backend fixtures.
- `scripts/meet-safety-static-check.cjs`: repeatable Node/std-library file-only
  checker. It never connects to a database or loads project credentials.
- This report. No existing migration or application code was changed after the
  requested E3.2 snapshot commit.

| Requested contract | Authored coverage | Runtime result |
|---|---|---|
| BEFORE INSERT versus partial uniqueness | Real insert of both participants while expired indexed seats remain; old seats released; genuinely live duplicate still rejected | **BLOCKED / NOT EXECUTED** |
| Concurrent drain / SKIP LOCKED | dblink backend holds oldest session; second backend drains other expired rows, skips locked backlog, then drains released row; matching skips locked candidate, later matches it, checks shared session and duplicate seats | **BLOCKED / NOT EXECUTED** |
| Moderation audit survives permitted deletion | Staff RPC writes audit; reports close; retention guard clears; session/transcript deleted; audit row must remain | **BLOCKED / NOT EXECUTED** |
| Expired active sessions rejected | get/touch/send/publish/list-signals/poll/join contracts; message history intentionally remains readable to participants | **BLOCKED / NOT EXECUTED** |
| Authorization / evidence isolation | Outsider report/moderation/history/block/heartbeat rejection, forged participant and lease writes, populated report/audit RLS, own/foreign/missing message symmetry, foreign reports/messages and ICE excluded | **BLOCKED / NOT EXECUTED** |
| Abuse / lifecycle | All 12 configured RPC budget families, heartbeat exact boundary, shared reporting budget, client cannot clear rate ledger, six-hour ceiling, repeated heartbeat throttle, idempotent expiration and seat release | **BLOCKED / NOT EXECUTED** |

The original report's fourth assumption also mentions client interpretation of
expired payloads. This suite covers the requested RPC side. The existing Meet
unit suite covers client lifecycle helpers; no device behavior is asserted.

The lock tests use a real held lock in one backend while another executes the
production functions. They are not an exhaustive randomized deadlock/stress
proof. Their execution still depends on the documented socket/auth/extension
configuration in a fresh, unseeded disposable instance.

## Executed validation results

| Gate | Result | Evidence / limits |
|---|---|---|
| Existing E3.2 atomic commit | **PASS** | 16 explicit paths; parent `58c031655a2ba717e371eb860a5fca208f8f449d`; no unrelated scratch paths |
| `node scripts/meet-safety-static-check.cjs` | **PASS — 81 checks** | Lexical delimiters; all 20 definer search paths and explicit revocations; anonymous grants; enum transaction safety; lease/trigger/sweep/budget structure; audit RLS; evidence signaling exclusion; test isolation guard and coverage markers |
| PostgreSQL parser / migration compilation | **BLOCKED** | No PostgreSQL tooling or installed SQL parser available; lexical checks do not establish SQL/PLpgSQL validity or runtime ACLs |
| `npm test` unit stage | **PASS — 806/806**, 194 suites | Actual current run; no failures or cancellations |
| `npm test` lifecycle stage | **FAIL — 99/109**, 10 failures | Full command exit 1; all failures in `scripts/arena-correctness-lifecycle.test.cjs` |
| Focused failing lifecycle file | **FAIL — 10/10** | Harness rejects current Arena imports, including `react-native-safe-area-context` and `../../utils/verdictPresentation`; reproduced independently of the full runner |
| Meet subset | **PASS — 51/51**, 15 suites | `meetLifecycle`, `meetSafety`, `meetVideoSession`, `meetModes`; overlaps unit total |
| `tsc --noEmit --incremental false` | **PASS — exit 0** | No diagnostics |
| `node scripts/duel-render-smoke.cjs` | **PASS — 22/22** | Native behavior is bridged, not device evidence |
| pgTAP / migration replay / DB writes | **BLOCKED — NOT EXECUTED** | Docker engine unavailable; no isolated target created |
| New validation-file whitespace | **PASS** | Checked separately from committed E3.2 snapshot |

The lifecycle failure is an existing Arena fixture/import mismatch: neither the
fixture nor its Arena components were changed in the 16-file E3.2 commit. It was
not hidden, patched or counted as a pass. The full automated gate remains FAIL.
The snapshot commit also preserves two existing end-of-file blank-line warnings
in its migration and E3.2 report; these are not SQL security verification failures.

## Security review boundaries and remaining risks

Static review found the intended definer search paths, role revocations,
participant checks, lease gates and configured budgets. That supports the
authored test plan; it does not prove authorization or concurrency behavior.
The suite uses actual `authenticated` roles/JWT subjects for adversarial calls,
not superuser-only simulations. Fixture setup and retention simulation run as
the test owner in the disposable database only.

The audit intentionally verifies deletion of a **session**, not deletion of the
moderator profile. `meet_moderation_reads.moderator_id` still has `ON DELETE
CASCADE`, as already acknowledged in E3.2: hard-deleting staff can erase their
read audit. E3.7 retention implementation does not yet exist, so its deletion
permissions and use of `meet_session_under_review` remain unverified.

The E3.2 report overstates generated-type completeness: its committed type diff
adds heartbeat/report RPCs and the report enum, but does not add
`meet_moderation_reads` or the Meet session lease/participant heartbeat columns.
Current TypeScript passes because those server-owned tables are accessed through
RPCs. Regeneration against a verified isolated schema remains owed; no type
generation was run against the current database.

## Decision and exact next action

**Deployment recommendation: NO-GO.** All four PostgreSQL assumptions and all
adversarial database assertions remain **NOT EXECUTED**. The complete automated
suite also has ten unrelated lifecycle harness failures. No database safety or
migration-deployment authorization is claimed.

Next authorized validation needs a separately provisioned disposable instance
meeting the isolation boundary above, full real-schema replay without seed data,
and execution of `097` with TAP failures treated as failures (not merely psql exit
status). Record the complete TAP output, migration/extension versions, concurrency
results and exact instance destruction. Repair the existing Arena harness in a
separate scoped change and rerun the full automated gate. Only then reconsider
deployment, with migration-before-app ordering from E3.2.

Stopped at the database boundary. No push, merge, reset, stash, clean, branch
creation, native rebuild, existing-stack restart, SQL write, seed or database test
execution occurred. Unrelated files were preserved.
