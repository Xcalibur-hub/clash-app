# Phase 3 Step 2B — Official submission idempotency and transcript recovery

Scope: audit findings L4 and L5, on baseline `57a9c3360b5978291890fb3a0a6672658613b330`. L6–L8, judging, competition timing, reputation, Crowd semantics and Stage design are unchanged.

Changed files: the migration and SQL tests 072/073; `services/liveArenaService.ts`, `services/officialRequestStore.ts`, `hooks/useLiveArenaRoom.ts`; the existing `LiveRoomComposer.tsx` and `EvidenceComposerSheet.tsx`; `utils/officialRecovery.ts`, its unit tests, `utils/liveRoomThread.ts`, `utils/duelPresentation.ts`; `scripts/official-service-check.cjs`, `package.json`, `tsconfig.json`, and this report. The TypeScript configuration permits explicit `.ts` imports required by Node's existing strip-types test runner.

## Migration and server contract

`20261009110000_official_retry_and_recovery.sql` adds:

- `arena_official_requests`: internal receipts pointing to existing message/evidence rows. RLS enabled, no client policies or table grants, including no service-role table grant. No second transcript.
- `submit_arena_official(p_room_id text, p_operation text, p_payload jsonb, p_request_key uuid default null) -> jsonb`. Operations are `message`, `evidence`, `reshare`; payload fields match the existing posting APIs. Message fields: body, parentId, mediaObjectId, mediaUrl, gifProvider, gifExternalId. Evidence fields: kind, title, sourceUrl, mediaObjectId, mediaUrl. Reshare fields: sourceMessageId, parentId, body. A missing key retains non-idempotent submission behavior. The endpoint requires a canonical Room; legacy GROUP callers retain their existing APIs.
- `list_arena_official_page(p_room_id, p_stream='message', p_cursor_at timestamptz=null, p_cursor_id text=null, p_direction='older', p_limit=40) -> jsonb`. Both cursor components are required together; limit 1–100. Older pages descend and newer pages ascend by `(created_at,id)`. Message and evidence streams remain separate.
- `get_arena_official_evidence_visibility(p_room_id, p_ids text[]) -> text[]`: authorized visibility checks for at most 100 known evidence IDs.
- An evidence keyset index, and a narrow patch to the existing canonical contribution guard that stamps new fighter rows with `clock_timestamp()` after Clash serialization. This prevents transaction-start timestamps from backdating an insert that waited on a lock. Existing rows, GROUP rows, trusted system/moderation exceptions and competition clocks are unchanged. The patch fails if the expected function anchor changes.

All new RPCs are SECURITY DEFINER with an empty search_path, qualified object references, and authenticated-only EXECUTE. Existing posting RPC signatures remain available.

## Retry and security guarantees

The server acquires a request-key advisory transaction lock before the existing Clash/Take authorization locks. It reuses Step 2A's `assert_canonical_clash_access`, membership and fighter checks before looking up a receipt. New contributions delegate to the existing message, evidence or reshare operation; contribution, receipt, quota and side effects commit together.

An exact committed retry returns its original currently visible contribution. It creates no row and consumes no additional quota. A changed operation, Room or JSON payload fails with `P0006`; another identity's key fails with `42501`, without returning its receipt. Global request-key uniqueness and serialization make concurrent same-key calls return one result. Authorization is reevaluated on every retry: removed sources, blocks/mutes, lost membership and hidden contributions cannot be bypassed. Cancelled canonical submissions are refused. Readable settled/expired requests can acknowledge an already committed contribution, but cannot insert a new one.

The canonical client captures the auth account and persists the request key and payload fingerprint in account/Room/operation-scoped AsyncStorage before sending. Network failure retains the key; confirmation removes it. Editing the payload abandons the previous key. Concurrent local acquisition is serialized. Returned authoritative IDs replace optimistic echoes and merge by ID. Uploaded attachment references are reused while retrying a failed composer submission. Account identity is checked before dispatch and after the response. There is no automatic offline replay queue. Existing no-key service callers remain compatible but do not gain retry guarantees.

## Recovery guarantees

Raw PostgreSQL timestamps are retained alongside existing millisecond display values. Sorting preserves six fractional digits and uses the unique ID for equal timestamps; reply IDs remain intact. A separate fetched cursor per stream advances only after an accepted, authorized page. Websocket IDs are hydration hints; neither websocket delivery nor a newest-page refresh skips the gap cursor forward.

Recovery drains up to five 40-row pages per stream per pass. Larger gaps resume from the last accepted cursor on later passes. Empty initial streams use an epoch cursor so a large first reconnect gap is not skipped. Results are ID-deduplicated. Older message and canonical evidence pages also use the full cursor. Focus, foreground, subscription recovery, explicit refresh and periodic reconciliation trigger repair. Requests have a 15-second abort signal; cursor non-advancement fails rather than looping. Account changes, unmount and revoked-access generations discard stale recovery results. Failed older-page loads retain retryability. Rotating visibility checks evict hidden message/evidence rows. Legacy GROUP evidence retains the existing ranked rail/API.

## Verification — 2026-10-09

| Check | Actual result |
| --- | --- |
| Complete local pgTAP suite | 74 SQL files; 2,735 assertions passed, zero failed |
| New retry/recovery pgTAP file 072 | 38 assertions passed |
| New concurrency pgTAP file 073 | 12 assertions passed using two authenticated dblink sessions |
| TypeScript | `npm run typecheck` passed |
| Complete unit suite | 426 tests passed; 112 suites; zero failed/skipped |
| Official service/store checks | 14/14 passed against actual service/store code with network/storage doubles |
| Existing Stage render checks | 19/19 passed; native media/animations bridged |
| Existing Crowd service checks | 7/7 passed with network doubles |
| Expo Doctor | 18/18 checks passed |

Server coverage includes lost-response retries for message/evidence/reshare, changed payloads, identity reuse, spectator rejection, removed source, block/mute changes, hidden rows, quota/row uniqueness, deadlines, settled/cancelled history, GROUP compatibility, precision and 100 equal-timestamp rows in each stream. Concurrency tests hold the first transaction open while the second same-key call waits, then verify one authoritative result for each operation. The complete suite also reruns Step 2A authorization and visibility-lock concurrency tests. Client coverage includes gaps of 41, 81, 125 and 260 rows, bounded continuation, repeated delivery, durable key reacquisition after store reload, and account changes during submission/recovery.

pgTAP ran through the existing ignored direct PostgreSQL runner against local port 55322, with transaction-scoped test extension/search_path setup and existing psql-variable adaptation. This was not a `supabase test db` CLI invocation. Existing dirty Crew test 052 was included unchanged; a separate clean tracked-only database replay was not performed. Initial fixture/setup failures and the final import-extension typecheck failure were corrected before the successful reruns. Tests used rollback fixtures or explicitly owned concurrency fixtures with cleanup; final checks found zero leftover retry receipts or concurrency fixture profiles. No legitimate competition was reopened or modified. No reset occurred.

Installed RPC bodies and effective EXECUTE privileges were compared to this migration; receipt columns, constraints, RLS/ACL, index and retained guard checks were inspected before recording version `20261009110000` in the local ledger. No hosted migration command was run. Unrelated dirty Crew work and development scripts were excluded from the commit.

## Physical runtime and limitations

Samsung A50 `RZ8M30DE9NL` is ADB-connected; reverse mappings for 8081 and 55321 are active. Metro and local Supabase health endpoints responded successfully during this checkpoint. The phone remained locked (NotificationShade), including the final device check. Physical official submission, reconnect and Stage/Crowd navigation were **not verified**; no fake live competition or Crowd activity was created to simulate them. Bridged render/service tests do not establish native-device behavior or real two-device Realtime delivery.

Keys survive process restarts, but the composer draft itself is not automatically restored; resubmitting the same payload reacquires its pending key. AsyncStorage confirmation cleanup is best effort after a confirmed server response. Receipts follow the lifetime of their referenced row; trusted hard deletion removes the receipt. Recovery is bounded per pass and eventually completes when authorization and connectivity remain available; it is not a snapshot-isolated export. Trusted historical imports/backdated updates are outside the new-insert guarantee. Hosted rollout and physical network-loss tests remain outstanding. L6–L8 remain deferred; this checkpoint does not claim production readiness or absence of all vulnerabilities.
