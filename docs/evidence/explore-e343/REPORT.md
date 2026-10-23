# E3.4.3 - Meet RPC permission hardening

Date: 23 October 2026. Branch: `arena-ui-review`. Tested parent: `f96b2851c95f254d62b33d4f8ae25df9ddecac02`.

**GO for the scoped ACL correction and local commit. NO-GO for production deployment.**

All 17 affected client RPCs now deny anonymous execution on both fresh and historically applied schemas. Authenticated and service-role access, function definitions/ownership/search paths, existing RLS and internal calls remain intact. No existing or hosted database was accessed. Nothing was pushed, merged or deployed.

## Exact correction

New additive migration: [20261023130000_meet_rpc_permission_hardening.sql](../../../supabase/migrations/20261023130000_meet_rpc_permission_hardening.sql).

Two explicit `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon` statements cover:

| Origin | Exact functions (types are explicit in the migration) |
|---|---|
| Five legacy grants | `ack_meet_video_safety`, `get_meet_ice_servers`, `has_meet_video_safety_ack`, `leave_meet_queue`, six-argument `next_meet` |
| Twelve historical lifecycle grants | `block_meet_peer`, `get_meet_session`, five-argument `join_meet_queue`, `leave_meet_session`, `list_meet_messages`, `list_meet_signals`, `poll_meet_queue`, `publish_meet_signal`, `report_meet_message`, `report_meet_session`, `send_meet_message`, `touch_meet_session` |

This removes both the explicit managed `anon` grant and the inherited PUBLIC route. It does not grant new privileges, redefine functions, transfer ownership, change table policies, adjust default grants, or impose interactive authentication on background maintenance.

The file was created using `supabase migration new meet_rpc_permission_hardening` (CLI 2.40.7). Its generated same-day 08:29 version preceded the already-existing 12:00 retention migration, so the **new, unapplied file only** was renamed to the unique forward version `20261023130000`. All **109 historical source files retain their exact prior raw hashes**. [Source verification](historical-source-verification.json), [110-file manifest](migration-manifest.json).

New migration raw SHA-256: `2f6d391cd4f033ff4909102e420287c068092578ef5eb26995bf9b5a3930b1bc`.

## Effective permission results

| Context | Before: current 109 | Before: historical 109 | After: both 110 |
|---|---:|---:|---:|
| Anonymous EXECUTE on the affected signatures | 5/17 | 17/17 | **0/17** |
| Authenticated EXECUTE | 17/17 | 17/17 | **17/17** |
| Service-role EXECUTE | 17/17 | 17/17 | **17/17** |
| PUBLIC EXECUTE | Absent in the inspected sources | Absent in the inspected sources | Absent; actual PUBLIC-only probe calls denied |

The current-109 count is prior E3.4.2 evidence; the historical-109 and final-110 inventories were executed during this task. All public Meet functions were inventoried; none retained effective anonymous EXECUTE after correction. The historical before/after comparison independently verified unchanged definitions, owners, pinned search paths and authenticated/service execution. [Permission matrix with definition hashes](meet-permission-matrix.json), [comparison](permission-comparison.json).

Inspected `services/meetService.ts`, `components/meet/MeetHomePanel.tsx`, and the original text/video/lifecycle migrations. Client signatures are unchanged. Video selection checks `requireAuth()` before acknowledgement lookup; authenticated ICE retrieval and acknowledgement were exercised in SQL. `next_meet` still invokes `leave_meet_session` and `join_meet_queue` under its existing definer owner. The real call successfully ended the old session, released both seats and queued the caller. Service-role expiry/signal cleanup still execute without an interactive JWT. Staff moderation remains staff-only. Generated application types need no regeneration for an ACL-only change.

## Actual validation

| Check | Fresh cluster | Historical populated upgrade |
|---|---|---|
| Real CLI migration replay | **110/110 PASS** | **107 baseline + 2 historical/current + 1 forward = 110 PASS** |
| 097 lifecycle/safety pgTAP | **101/101 PASS** | **101/101 PASS** |
| 098 moderation/audit-retention pgTAP | **61/61 PASS** | **61/61 PASS** |
| New 099 permission pgTAP | **120/120 PASS** | **120/120 PASS** |
| Failed/skipped SQL assertions | **0 / 0** | **0 / 0** |
| New ACL-suite fixtures and probe role after rollback | **0 remaining** | **0 remaining** |

**564 passing SQL assertions across six completed suites**, with sequential `ok` numbers, exact final TAP plans and no failure/skip markers. Process exit zero alone was not accepted as proof. The final migration and all suites ran once per history without repair or rerun. See [validation summary and ledger hashes](validation-summary.json) and the six retained TAP transcripts:

- [Fresh 097](fresh-097.tap), [fresh 098](fresh-098.tap), [fresh 099](fresh-099.tap).
- [Historical 097](historical-097.tap), [historical 098](historical-098.tap), [historical 099](historical-099.tap).

The new [099 suite](../../../supabase/tests/099_meet_rpc_permissions.sql) has an independent 17-signature inventory: one inventory-count assertion, 68 effective-grant/PUBLIC checks, 34 actual denied invocations under `anon` and a PUBLIC-only non-login role, and 17 positive-flow/compatibility assertions. Denials require the **function privilege error message**, so a function-body sign-in rejection cannot satisfy the ACL test. Fixtures, temporary permissions and the probe role roll back.

| Non-database command | Result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | **PASS**, exit 0, no diagnostics. [Evidence](typecheck-result.json) |
| `npm.cmd test` | **PASS**, exit 0: **806 unit tests / 194 suites + 132 lifecycle/Crowd tests = 938 tests**, zero failures/cancellations/skips. [Evidence](npm-test-result.json) |
| Historical raw-source hash comparison; UTF-8/BOM/version preflight | **PASS**, original 109 unchanged; new total 110 unique versions. |
| `git diff --check` / staged scope inspection | **PASS** before local commit. |

No application implementation or existing test assertion changed. No Expo/native execution was required for this SQL-only correction.

## Historical ledger rehearsal

The separate historical cluster first applied versions 1-107, then received committed fictional fixtures: four profiles, two Meet sessions, one message, a canonical Clash/Room, a real spectator Crowd post and a pre-upgrade moderation action. It then applied the exact old lifecycle bytes from `59cdf394eecf06cf240a32d22fdbfcb1e43d0998` plus current retention version 109. The old lifecycle raw hash was verified as `e89c20e3a994bc459a0cd32eb36f10cbfdf584889c990cf0c1712dfb6363b9d4`; **all 17 anonymous grants were observed**.

Only the disposable artifact used the older bytes. The current historical source file and new forward migration were subsequently presented to CLI. CLI applied **only the new forward version**; all existing 109 ledger rows, names and parsed statements remained exactly unchanged. No history repair, manual ledger insert or same-version replay occurred. All four profiles, two sessions, one message and original audit action survived; retention added the expected immutable actor snapshot. Current artifacts matched all 110 source hashes. Historical and fresh ledger hashes appropriately differ at the intentionally historical lifecycle version; both have identical forward-migration statement hashes.

One preliminary file-inspection helper incorrectly compared Git LF blobs to CRLF checkout bytes and reported differences. It made no changes; comparison against the prior frozen **raw checkout manifest**, together with a clean tracked diff, verified all 109 original files unchanged. This was an inspection-helper error, not a failed migration or test.

## Isolation, platform and shutdown

Only two newly initialized PostgreSQL clusters were queried:

- `clash-e343-ade4ff97524f-fresh`, database `clash_e325_e343_ade4ff97524f_fresh`.
- `clash-e343-ade4ff97524f-historical`, database `clash_e325_e343_ade4ff97524f_historical`.

Both used verified `network=none`, no published ports, no host mounts or persistent volumes, read-only roots, private tmpfs, restart policy `no` and resource limits. Five additional new vendor-bootstrap helpers shared only the new database's PID/socket namespace where needed. Resources used unique names and attempt labels; no existing container was queried via SQL, executed into, restarted or reconfigured.

Pinned platform: PostgreSQL **17.11**, image `sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108`; managed Auth **v2.197.0**, Realtime **v2.140.10**, Storage **v1.79.36** schemas initialized using their actual vendor migrations. The verified CLI **2.40.7** binary hash is `568db201105cf8c261226fc16ab412ecc3b7bd03f25ea657852127a638b1601c`. pgTAP was installed in `public` in each disposable database for compatibility with 098's restricted probe role. Jobs were inventoried with `cron.launch_active_jobs=off`.

The reviewed container-local executor used `migration up --db-url postgresql://postgres@127.0.0.1:5432/<disposable-db>?sslmode=disable --workdir /tmp/project`, with matching isolated `[db] port=5432`. Credentials were generated in memory and forwarded through stdin/process environment, never URL/arguments or evidence. This non-TLS connection was confined to **container-private loopback with networking disabled**, not a hosted TLS bypass. No existing environment/secret file or database snapshot was reused.

Both PostgreSQL processes were stopped gracefully. All **seven task-owned containers were ownership-checked and stopped**. Their tmpfs database contents were discarded; stopped container metadata was intentionally retained to honor the no-destructive-cleanup constraint. No `docker rm`, prune or volume deletion was used. The **46 pre-existing container identities, nine networks and 26 volumes** match the baseline exactly. This proves resource identity preservation, not that independently running services retained identical runtime status. [Full scoped shutdown and exact identifiers](cleanup.json).

Raw CLI/bootstrap/catalog logs and ledgers remain local under this evidence directory; the ignored harness is `.expo/explore-e343/`. Only the migration, regression suite, this report and selected sanitized evidence are included in the local commit. Unrelated files remain untouched.

## Remaining release prerequisites

The E3.4.2 anonymous-EXECUTE blockers are closed for the two rehearsed histories. **Production remains NO-GO** until the separately authorized target's actual ledger/owners/grants and backup/restore readiness are checked, old clients without heartbeat support are addressed, and moderation/transcript retention durations, holds, purge authority and monitoring are approved. No retention job was scheduled here.

This task did not verify hosted/API JWT transport, enabled cron execution, managed runtime service connectivity, Samsung A50 Meet UI, WebRTC or TURN. SQL role-context success does not establish native or end-to-end production readiness. Any rollback must be a separately reviewed forward change; do not restore anonymous grants merely to roll back.

Official references reviewed: [function security and privileges](https://supabase.com/docs/guides/database/functions), [PostgreSQL 17.11 compatibility notes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes). The next action is review of this local commit, followed by separately authorized deployment planning and remaining acceptance checks. No deployment is authorized by this report.
