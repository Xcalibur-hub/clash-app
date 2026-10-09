# Phase 3 Step 2C — Historical access, maintenance recovery and cancellation

Baseline: `4317b7124ed1e92a40895ce545311b4d13cb90e4`. Scope is L6–L8 only. Step 2A authorization and Step 2B retry/recovery remain in place. No new judging eligibility, winner/reward rule, timing, Crowd permission, competition engine, engagement feature or Stage redesign is introduced.

## Exact changes

- `components/liveArena/DuelRoomExperience.tsx`: offers the existing Watch operation for settled canonical history, explaining that it is read-only. Existing cancelled nonmember entry remains unavailable.
- `hooks/useLiveArenaRoom.ts`: either members-only transcript/evidence denial locks private content while preserving the already-authorized Room metadata. Previously an evidence denial could fail the whole screen before Watch appeared. Only a successful authorized subsequent read unlocks the transcript.
- `utils/duelPresentation.ts`, `components/liveArena/DuelRoomOutcome.tsx`: server-derived closed phase with a still-open Clash now says **Settlement pending**, explicitly allowing for eventual verdict or cancellation. This takes precedence over the recorded-ballot headline. Existing refresh/recovery paths check server state; no client clock settles or awards anything.
- `services/clashEngineService.ts`, `utils/clashSettlement.ts`: discriminated terminal settlement response, including successful zero-ballot cancellation. The existing snake/camel verdict read adapters remain compatible.
- Migration `20261009120000_historical_settlement_recovery.sql`: private bounded diagnostics and narrow patches to the installed three maintenance functions. Existing function grants, unrelated maintenance operations and limits are retained.
- Tests: new SQL 074, 075, 076; updated maintenance key contract in SQL 025; `utils/clashSettlement.test.ts`, `utils/duelPresentation.test.ts`, `scripts/settlement-history-check.cjs`, and three added scenarios in `scripts/duel-render-smoke.cjs`. `package.json` includes the new checks. This report is the remaining changed file.

## Historical entry and security

`watch_arena_room` already supports readable SETTLED canonical Rooms, including closed topics; its server implementation is unchanged. The client now exposes that operation rather than inferring membership. Step 2A revalidation and locks continue to enforce source/Room readability, blocks/mutes, publication and membership rules. Runtime fixture discovery exclusions are untouched.

Authorized new historical spectators obtain genuine server membership, can read the official transcript and see the genuine canonical verdict, and cannot write official contributions, judgements or Crowd messages. Settled Crowd history remains governed by existing policies. Cancelled Rooms still refuse new spectators; existing authorized members retain Stage history but cancelled Crowd is denied. GROUP entry, ranked evidence, group settlement and legacy Clash routes remain intact. No public RLS policy or client privilege was added.

## Maintenance failure/retry design

The installed `settle_due_clashes` and `transition_due_arena_rooms` isolated item failures with silent exception handlers. They now record those failures in `arena_maintenance_failures` and continue the existing batch.

Each `(operation,item_id)` record includes first/last failure time, failed-attempt count, SQLSTATE, a fixed safe error-class description, pending/resolved retry status and resolution time. Categories are `clash_settlement` and `room_transition`. Raw exception MESSAGE, DETAIL and CONTEXT are deliberately not stored because they may embed private content. Item IDs and all diagnostics remain operator-only: table RLS enabled, no client policies or anon/authenticated grants, service_role SELECT only. Private record/resolve helpers have no public, anon, authenticated or service_role EXECUTE. Existing maintenance entry points remain owner/service-role operations.

The ledger is capped at **1,000 items**, evicting oldest last failures, and pruned after **seven days**, including unresolved failures. Every logged failure enforces the cap; maintenance also prunes aged records on clean runs. Failed-attempt counts saturate safely. Successful attempts resolve their record. Maintenance additionally resolves diagnostics for already-terminal Clashes/Rooms, including items recovered through another existing settlement path.

All three batch entry points take the same nonblocking transaction advisory lock before item locks. Nested calls in the same transaction remain valid. An overlapping `run_maintenance` returns `{skipped:true,reason:'maintenance_in_progress'}`; overlapping integer batch helpers return zero processed items. This prevents competing batches from inverting Clash/Room/diagnostic locks and makes the count cap deterministic. Existing cron remains `clash-maintenance`, `* * * * *`, `select public.run_maintenance(500)`.

Successful maintenance retains every previous result key and adds:

```json
{"maintenance_item_failures":0,"partial_failure":false,"pending_retry_items":0}
```

The failure count includes failed attempts in both loops, even if a later attempt in that run recovers. Pending count reflects current retained unresolved records. Existing `clashes_settled` continues counting successful terminal operations, including zero-ballot cancellations, as before.

No new single-Clash client retry was necessary. Operators can retry through existing maintenance; failed items remain due and are attempted on later existing cron ticks. `settle_clash` and its locked, transactional tally are unchanged. A failed item rolls back verdict, ledger, profile and notification writes together. The next successful attempt awards once; settled/cancelled retries retain existing early-return behavior. Zero votes still cancel, one ballot still suffices, and nonzero ties remain DRAW. Fighters receive no new rewards.

Operator inspection (owner/service role only):

```sql
select operation,item_id,last_failed_at,failed_attempts,sqlstate,safe_detail,retry_status
from public.arena_maintenance_failures
order by last_failed_at desc;
-- Existing batch retry; inspect the returned partial_failure/skipped fields:
select public.run_maintenance(500);
```

## Settlement response contract

`settleClash(clashId): Promise<ClashSettlementResult>` returns:

```ts
type ClashSettlementResult =
  | (ServerVerdict & { status: 'settled'; verdict: ServerVerdict })
  | { status: 'cancelled'; clashId: string; jurySize: 0; verdict: null };
```

Settled results retain the old flat verdict fields alongside the discriminator and explicit verdict. Existing in-repository caller awaits settlement then refetches authoritative state; it requires no behavioral change. External typed consumers must narrow `status` before assuming a verdict. Cancellation does not create a winner, verdict or bad_payload error. RPC errors still propagate. Invalid/foreign-ID, contradictory, nonfinite or malformed terminal payloads fail with bad_payload. Validation checks consistency of the server response; it does not calculate or choose the official outcome.

## Actual verification — 2026-10-09

| Check | Result |
| --- | --- |
| Full local pgTAP | **77 SQL files, 2,804 assertions passed**, zero failed |
| Historical entry SQL 074 | 21 passed |
| Failure/recovery/security/GROUP SQL 075 | 43 passed |
| Real dblink maintenance contention SQL 076 | 5 passed |
| Full unit suite | **431 passed**, 112 suites, zero failed/skipped |
| TypeScript | `npm run typecheck` passed |
| Actual settlement service/Room hook checks | **11/11 passed**, controlled network/React dependencies |
| Stage renders | **22/22 passed**, native media/animations bridged |
| Official service/store | **14/14 passed**, controlled dependencies |
| Crowd service | **7/7 passed**, controlled dependencies |
| Expo Doctor | **18/18 passed** |

Failure injection occurs at notification insertion after verdict/reward work starts. Tests prove the failed operation leaves no verdict, award, profile change or notification, reports both failed categories, increments attempts, and later recovers with one result and one set of side effects. Other checks cover removed sources, blocks/mutes, new historical spectators, cancellation denial, closed writes, cancelled retries, diagnostic access/forgery denial, age/count limits, GROUP failure/recovery, and a genuinely overlapping batch through dblink. Existing Step 2A, Step 2B, DRAW, challenge, canonical concurrency and Crowd tests reran in the full suite.

Initial new-test failures were corrected for the actual judging error code, Crowd RPC name, and an ambiguous test column. The first full run found the existing exact maintenance JSON-key assertion; it was updated to cover the additive fields. Typecheck identified redundant closed-phase branches and a verdict read helper still needed by legacy parsing; these were corrected and both verdict read formats are tested. Final reruns passed. The initial controlled hook harness needed a store bridge; its final 11 checks passed. No failing result is represented as a pass.

pgTAP used the existing ignored direct PostgreSQL runner at localhost:55322, with transaction-scoped test extension/search_path and existing psql-variable adaptation. `supabase test db` CLI success is not claimed. Existing dirty Crew test 052 was included unchanged. No separate clean tracked-only migration replay was performed. New tests use rollback fixtures; dblink contention needs no public activity. Final checks found zero diagnostic rows or new history/recovery/concurrency fixture profiles outside those transactions.

Installed batch definitions and retained ACLs were compared with a rollback replay of the patch against saved baseline definitions. Private helper bodies/grants, diagnostic schema/constraints/RLS/ACL and unchanged cron were verified before recording local ledger version `20261009120000`. No reset, hosted migration or persistent legitimate-record mutation occurred.

## Physical Samsung A50

Samsung A50 `RZ8M30DE9NL` was unlocked with CLASH foregrounded. Reverse ports 8081/55321 were restored; Metro status responded running and local Auth health returned HTTP 200.

- Opened retained cancelled canonical Room `ar_3511812688853a0c`, Clash `cl_b22e92269cf3ab99`. Nonmember UI showed members-only historical access with no Watch button, transcript or Crowd UI. No membership was inferred or created.
- Opened existing completed legacy Clash `devfx_clash_settled`, Take `devfx_take_settled`, through Live Clashes. Its canonical Room link is null; the legacy Judgement screen retained its genuine Side A / SPLIT DECISION verdict, 67% and three judgements. Those records were not edited.
- Local inventory contains exactly one canonical Room, the retained cancelled fixture above. There is no settled canonical Room or pending canonical settlement to test physically without manufacturing/changing records. Physical settled joining, member historical Stage/Crowd reading, failure recovery and new two-device Realtime delivery remain **unverified**. Screenshots are ignored local artifacts, not fake public activity.

## Remaining operational limitations

Diagnostics are bounded troubleshooting evidence, not a permanent audit log or alerting system. Seven-day/count eviction can remove unresolved older items; inspect authoritative due Clashes as well. Safe summaries intentionally omit raw error text, so deeper root-cause work may require protected database/cron logs. Failures outside the two per-item handlers (including a top-level/deferred transaction failure) abort the run and roll back diagnostic writes; existing cron failure logs remain necessary. No external alerting or automatic repair/reopen/winner rule was added. One-minute cron retries and bounded batches do not promise immediate settlement. Client refresh eventually reflects server state but does not guarantee instantaneous revocation of already-rendered content. Hosted rollout, clean tracked-only replay and the unavailable physical paths above remain outstanding. This checkpoint is not a production-readiness or zero-vulnerability certification. Stop after L6–L8.
