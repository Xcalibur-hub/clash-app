# E3.5.1 - Meet typing security

Date: 23 October 2026. Branch: `arena-ui-review`. Parent: `670d7013742d6736930714f5949988b2bd2fd070`.

**Code/offline tests: PASS. Draft SQL and live Realtime enforcement: NOT VERIFIED. NO-GO for deployment until separately authorized migration and runtime acceptance pass.**

Read `.clinerules`, `CLASH_SPEC.md` Section 38 and [E3.5](../explore-e35/REPORT.md). Worked only in the original checkout. No database connection/write, SQL execution, migration application, Docker/device operation, settings change, rebuild, push or merge occurred. Only the scoped implementation, tests, migration draft and this report/evidence are committed locally; unrelated work remains untouched.

## Root cause and chosen boundary

Old `subscribeMeetTyping` opened a public-default channel, tracked Presence on subscribe/foreground even without typing, used the same `typing` key for everyone, and inferred peer activity from distinct key count. Client Presence payloads/keys are not authoritative participant identities. A private channel plus a join-time RLS check alone also cannot guarantee an already-joined publisher remains authorized after Leave, Block or lease expiry.

The correction follows the repository's existing private Arena typing pattern: **server-owned, expiring state; empty private Broadcast hints; authorized reads for the actual indicator**. Raw Presence is removed rather than assigned a different but still client-controlled key. This avoids creating a second identity/presence system. No Presence state, supplied actor ID, client timestamp, broadcast payload or count of keys can make the UI show a peer typing.

Supabase documents that [Realtime authorization is calculated when joining](https://supabase.com/docs/guides/realtime/authorization), and that [Presence keys group client-provided payloads](https://supabase.com/docs/guides/realtime/presence). These properties explain why merely renaming the shared key is insufficient.

Source inspection of the rehearsed [Realtime v2.140.10 authorization implementation](https://github.com/supabase/realtime/blob/v2.140.10/lib/realtime/tenants/authorization.ex) confirmed its probes set the message row topic and `realtime.topic` from the same authorization context. The draft's exact row/request-topic comparison follows that contract. This is source evidence, not a service execution result or verification of any hosted version.

## Production correction

| File | Exact scope |
|---|---|
| [services/meetService.ts](../../../services/meetService.ts) | Remove unsafe Presence helper and re-export its replacement; other RPCs/parsers remain unchanged. |
| [services/meetTypingService.ts](../../../services/meetTypingService.ts) | Private `meet-typing:<sessionId>` Broadcast channel. Payloads only trigger an authenticated read; they are never rendered. Auth changes dispose the scope; same-account refresh preserves it. SDK RPC receiver is preserved with `.call(client, ...)`; narrow additive contracts avoid editing generated types before migration replay. |
| [utils/meetTyping.ts](../../../utils/meetTyping.ts) | One in-flight read, four-second reconciliation, one in-flight idempotent state write plus one coalesced pending value; two-second publish throttle and three-second idle clear. Validate server boolean/TTL, expire locally within at most six seconds, subtract request latency, ignore stale/disposed reads, and hide on disconnect/error. Never automatically replay a failed `true` publication. |
| [hooks/useMeetChat.ts](../../../hooks/useMeetChat.ts) | Dispose typing synchronously on terminal status, on background/unmount and at the known lease deadline. No automatic foreground publication. Clear own typing after a successful send using the captured subscription scope. |
| [app/explore/meet/[sessionId].tsx](../../../app/explore/meet/[sessionId].tsx) | Empty composer clears own typing; text changes publish intent. No visual or matching redesign. |
| [package.json](../../../package.json) | Include new offline regression suite in full `npm test`; no dependency/lockfile change. |

Clearing **our** composer does not hide the **other** participant's legitimate indicator. Disconnect, disposal and terminal state hide the local indicator immediately. Stop drops queued work rather than sending a delayed clear under a different account. If clearing cannot safely complete, the server TTL is the fallback: remote indication can persist only for its remaining authorized validity, not indefinitely. Local lifecycle clearing is immediate; remote Block/Leave discovery depends on authorized polling/hints and network delivery, so this report does not promise zero-latency remote clearing.

Room matching, message delivery/read/send contracts, lease renewal, Leave/Next/Block/report RPCs, canonical engine, Auth implementation and existing permissions are not redefined. Text message polling works independently of optional typing. If the new RPCs/policies are absent or denied, typing fails closed with no public Presence fallback and no fake peer indication.

## Additive migration draft - NOT APPLIED

[20261023140000_meet_private_typing.sql](../../../supabase/migrations/20261023140000_meet_private_typing.sql) was generated with CLI 2.40.7's `migration new` command. Only the newly created, unapplied filename was moved to the unique forward 14:00 version because the generated 10:50 timestamp preceded existing 13:00 hardening. **All 110 earlier migration raw hashes match the E3.4.3 manifest.** There are now 111 source files; no 111-migration replay is claimed.

The draft:

- Checks that managed `realtime.messages` already has RLS enabled without attempting to alter its managed ownership/RLS flag.
- Adds only nullable `meet_participants.typing_until`; no new table, identity history or matching engine.
- Defines caller-bound `meet_typing_allowed(text)`: current profile is a participant, canonical session is active/unexpired, both participants have not left, and neither blocks the other. A volatile wall-clock expiry check also rejects a lease that elapsed while the write waited for its row lock; transaction-start `now()` is not used for this admission check. No caller-supplied profile ID is trusted.
- Defines `set_meet_typing(text, boolean)`: locks the caller's joined canonical session against Leave/sweep, checks authorization on every invocation, updates only the caller's participant row and caps TTL at six seconds or the session lease. It never renews that lease. Writes are limited to 60/minute and only an empty private server hint is sent.
- Defines `get_meet_typing(text)`: checks authorization on every call, reads the **other** participant's unexpired state and returns only `typing` and bounded `validForMs`; reads are limited to 120/minute. Unknown and unauthorized sessions use the same safe denial.
- Pins all three definer search paths; explicitly revokes PUBLIC/anon/service-role execution on these new caller-facing functions and grants authenticated execution. Existing maintenance and other service-role grants are untouched.
- Adds restrictive Meet-namespace authenticated-read, guest-read and client-publication boundaries plus a permissive authenticated Broadcast-receive policy. Both the row topic and request topic must match for a Meet read. Guest denial uses no authenticated-only helper, avoiding helper-EXECUTE errors while evaluating unrelated Arena policies. These prevent sibling permissive policies from reopening Presence reads, foreign-topic rows or client Presence/Broadcast publication for this namespace. Other Arena topics are outside the restrictive namespace condition.

**Cached authorization limit:** an old socket might still receive empty hints after its original join authorization was cached. Hints carry no identity, timestamp or typing boolean; subsequent RPC reads/writes reauthorize against current membership, block and lease state. The UI never uses hint contents as evidence. Revocation and queued-delivery behavior still require real service tests. No project-wide public-channel setting was changed; this code always requests a private topic. Old clients still using public Presence are not fixed remotely by this patch and remain subject to E3.5's minimum-client rollout gate.

`typing_until` is one overwritten timestamp, not a typing-history stream. Expiry makes it unreadable as active state, but does not physically delete the last stored timestamp; safe clears set it null. Retention/account-deletion requirements remain part of E3.5's separately approved policy work. No retention job was added here.

Generated database types were intentionally not regenerated from an existing database. The adapter uses only the two exact new RPC names and validates JSON at runtime. Regenerate and compare types after the separately authorized disposable migration rehearsal.

## Tests and exact results

| Check | Actual result |
|---|---|
| `node --test scripts/meet-typing.test.cjs` / same suite in full npm command | **35 PASS**, 0 failed/skipped/cancelled: **28 production adapter/controller behavioral tests**, **5 real mounted-hook tests**, **2 clearly labelled static checks**. |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | **PASS**, exit 0, no diagnostics. [Evidence](typecheck-result.json) |
| `npm.cmd test` | **PASS**, exit 0: **806 unit tests / 194 suites + 167 lifecycle/Crowd/typing tests = 973 tests**, 0 failed/skipped/cancelled. [Evidence](npm-test-result.json) |
| Existing migration manifest comparison | **PASS**, all 110 historical raw hashes unchanged. |
| SQL draft lexical/static boundary checks | **PASS**, not a PostgreSQL compilation/RLS execution result. |
| `git diff --check` | **PASS** before local commit. |
| New pgTAP, migration replay, real socket authorization, Android | **NOT RUN**, outside authorization. |

The [Node suite](../../../scripts/meet-typing.test.cjs) executes production TypeScript through the repository's Babel/VM testing approach. It invokes the **installed `SupabaseClient.prototype.rpc`** with mocked transport and asserts its receiver. Virtual timers and deferred promises exercise forged Broadcast data, old shared-key payloads, denied/missing RPCs, signed-out initialization, account changes during reads/writes, same-account token refresh, delayed clear ordering, queue bounds, disconnect/reconnect, missed hints, malformed responses, hung reads/TTL expiry, network latency and no automatic replay of failed publications. No native storage, real credential or network client is loaded.

Five tests mount the **actual `useMeetChat` hook** using the repository's real ReactDOM reconciler setup and mocked native AppState/transports/timers. They verify Leave, `markEnded` (used after Block/Next), background/resume, deadline expiry despite stale active context, and composer/send clearing without hiding peer state. This is React hook evidence, not a native renderer or real backend result. Two additional tests explicitly check hook wiring and draft SQL structure/lexical balance; these are not behavioral SQL tests.

## Adversarial SQL suite prepared - NOT EXECUTED

[100_meet_private_typing.sql](../../../supabase/tests/100_meet_private_typing.sql) contains **33 draft assertion statements**, using real roles and rollback-guarded fixtures. It refuses any database not explicitly marked `test.e351_disposable=on` with a disposable `clash_e351_*` name.

Prepared cases cover effective anon denial, direct participant-row modification denial, restrictive policy flags/search paths, real anon/outsider calls, unknown-ID parity, participant self-versus-peer state, server TTL, stale clearing, Block, departed peer, expired and terminal sessions, malformed topic suffixes, rate limits and forged Presence/Broadcast writes. Temporary deliberately permissive **test-only** sibling policies verify restrictive Meet boundaries cannot be OR-ed open; they roll back with the entire suite. No such policy was applied to any database.

The draft suite still needs compilation and real TAP counting in a newly authorized disposable environment. Neither mocked authorization errors nor static SQL checks prove server RLS, managed-policy permissions or publication behavior. Previous 097/098/099 results remain historical evidence and were not rerun against this new draft schema.

## Remaining acceptance and precise next action

1. Review the local code/migration commit; **do not deploy it from this report**. Separately authorize a fresh isolated environment, full 111-source ledger rehearsal and upgrade from 110, generated-type comparison, and 097/098/099/100 execution. Stop on unexplained migration/authorization failure; do not broaden grants or modify managed ownership.
2. With real Auth JWTs and the managed Realtime service, use participants A/B plus guest/outsider C. Verify private join, real peer typing/idle expiry, forged direct Presence/Broadcast denial, account switch, repeated subscribe, socket reconnect and cached joins after Leave/Block/expiry. Verify that empty/forged hints never become typing without a successful current-scope RPC. Record real TAP and service results separately.
3. Test network-delayed/hung requests, server rate limits, skewed device clocks, background/foreground and server lease renewal on A50. A hung read hides at TTL but reconciliation waits for transport completion; it never starts unbounded parallel reads. Establish the actual transport timeout/recovery behavior during runtime acceptance.
4. Before broader release, resolve the E3.5 old-client/shared-lease, retention/holds, scheduled maintenance, WebRTC/TURN and target backup gates. This patch does not provide final Meet release readiness.

No database/runtime security pass is claimed. Stop after the local commit; no push, merge or further phase is authorized.
