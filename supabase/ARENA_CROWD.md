# Arena Crowd — Phase 3.8

## Architecture and security audit

The existing canonical duel ties `clashes.duel_key` to exactly one
`arena_rooms.clash_id`. Fighter identities and the canonical relationship are
protected by existing constraints/triggers. Only Fighter A and Fighter B can
publish official `arena_room_messages`; spectators do not gain this permission.
The official transcript, evidence, ballot settlement and authoritative Clash
verdict already have server guards. Legacy GROUP Room behavior stays unchanged.

Before this phase, the immersive Crowd was an inactive development layout, with
no public chat storage, paging API, send operation or authorized subscription.
Existing server infrastructure provides transactional advisory-lock rate limits,
Room membership checks, bidirectional block/one-way viewer mute filtering,
report storage and Hood moderator audit actions. Existing Back A / Back B is
local social support and does not change ballots or the official verdict.

The additive implementation uses `arena_crowd_messages` exclusively. It neither
reads nor changes private Room channels/messages, and never merges audience
text into the fighter transcript. Arena, Fresh Takes and the immersive Stage
remain the entry points and visual structure.

## Database and API

Apply these migrations in order, as separate migration transactions:

1. `20261008100000_arena_crowd_report_target.sql` adds the report enum value.
2. `20261008100100_arena_crowd_chat.sql` adds the table, RLS, RPCs and publication.

| Operation | Server contract |
| --- | --- |
| `get_arena_crowd` | Entered canonical duel, readable source/fighters, server-clock sending state, actual spectator membership count |
| `post_arena_crowd_message` | Auth-derived author, 1–500 characters / ≤2,000 bytes, UUID idempotency, open server deadline |
| `list_arena_crowd_messages` | Stable `(created_at,id)` cursor, older/newer directions, 1–100 rows, chronological response |
| `get_arena_crowd_messages` | Authorized hydration/visibility check, at most 100 IDs, bound to one Room |
| `submit_report` | Existing reporting, plus readable Crowd targets and 20 Crowd reports/hour |
| `moderate_arena_crowd_message` | Correct Hood moderator only, hide/restore with required reason and atomic audit |

Authenticated readers need existing membership in a canonical duel whose source
has not been removed and whose Clash/Room is not cancelled. Blocks in either
direction and the reader's mutes hide authors. A fighter's reverse mute also
prevents that muted viewer from publishing in the fighter's duel. Closed chat
remains readable; new sends require the authoritative Clash's open interval.
No anon access, client INSERT/UPDATE/DELETE, or public helper execution exists.
The request key is not an authenticated SELECT column or response field.
Only the new public table is added to `supabase_realtime`.

Posting locks the canonical Clash before checking status, serializes per
Room/author retries, then uses the existing global actor rate limiter: 5/minute
and 30/10 minutes. Exact retries return the existing readable row before charging
quota; altered-body retries fail. Hidden rows cannot be recovered through retry.
Quota failure rolls back the message and all quota charges. Status/deadline is
checked again after lock waits. A closed exact retry may acknowledge a previously
accepted message; it creates no new message. Cancellation denies access entirely.

## Client and interface

The service validates JSON and Room identity. Realtime events are hints containing
IDs; event text is never rendered. Authorized hydration determines visible rows.
The hook loads 40 messages, deduplicates UUIDs, preserves PostgreSQL microsecond
cursor precision, reconciles gaps on connection/foreground and every 15 seconds
while active, and rotates visibility checks over the bounded 200-row window.
Only authoritative page results advance the gap cursor, so an early live event
cannot skip messages missed during a disconnect. Account changes reset the
subscription, cached rows and composer. Stale operations cannot update a new Room.

The Crowd uses a virtualized FlatList, earlier-message loading, Latest chat,
loading/error/retry/empty/read-only states and a public text composer. A failed
send retains its body/request key for an idempotent retry. The existing safety
sheet provides reporting/blocking; parent safety refresh and periodic hydration
evict content hidden by safety changes. Moderator hides are reconciled even when
RLS prevents delivery of the newly hidden update.

The newest official fighter argument remains on the separate Stage above Crowd.
Back A / Back B retains its existing social-support behavior. The header says
`N joined`, using actual spectator rows, rather than pretending those memberships
are simultaneous online viewers. Missing counts are omitted. Android keyboard
height avoidance and a bounded scrollable Stage keep the composer usable without
allowing Stage text to overlap Crowd on a small viewport.

## Verification

Verification date: 2026-10-08. All database/runtime checks use local Supabase.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run test:unit` | 409 tests, 111 suites passed |
| `npm run test:crowd:service` | 7 service/subscription checks passed |
| `npm run test:duel:render` | 19 render scenarios passed; bridged native modules |
| `npx expo-doctor` | 18/18 checks passed |
| Full `supabase test db` | 60 files, 2,426 assertions passed |
| Crowd pgTAP files 058 + 059 | 74 assertions passed |

Security coverage includes anon/nonmember denial, cross-Room hydration, safe
column grants, denied direct DML/helper/report bypass, actual two-fighter
invariant, spectator official-write denial, text/invisible-text bounds, block and
mute filtering, wrong-Hood moderation denial, authorized hide/restore audit,
hidden retry denial, private target reporting denial, burst and sustained quota,
rollback, pagination, server deadlines, closed retries, cancellation and GROUP
compatibility. dblink tests use independent committed sessions for duplicate
send contention, sixth-message quota contention and cancellation versus a queued
send. The whole database suite also exercises existing Phase 0–3 protections.

`scripts/crowd-runtime-check.cjs` creates disposable local Auth users and a clearly
marked local duel, then uses real authenticated PostgREST/WebSocket sessions:
both clients receive each other's messages, a nonmember receives no events,
spectators cannot send official arguments, a disconnected client recovers gaps,
reconnection delivers subsequent events, mute removes cached sender content and
the server count matches two joined spectators. Eight runtime checks passed.
The script is localhost-only and cleans fixtures by default; `--keep-for-device`
and `--cleanup` support an explicit physical check. No test credentials or
fixture messages are committed or seeded into production.

A physical Samsung Galaxy A50 with the installed development client displayed
the Stage, server Crowd rows and actual three joined spectators after entering.
Messages sent through its Crowd composer were received and confirmed persisted
by another authenticated session. Sending with the Samsung keyboard open also
passed after fixing height avoidance and Stage overflow. The second session's
messages appeared on Android. This is one physical device plus an independent
authenticated test client, not two physical phones. Initial cold local Realtime
startup timed out; the runtime harness now waits for database subscription
readiness rather than merely a joined WebSocket. App gap reconciliation remains
the recovery path for missing/late live events.

## Changed files

- Database: the two migrations, `database.types.ts`, tests 058/059.
- Service/state: `services/arenaCrowdService.ts`, `hooks/useArenaCrowd.ts`,
  `utils/arenaCrowd.ts`, `utils/arenaCrowd.test.ts`.
- UI: `app/arena/room/[roomId].tsx`, `ClashEventHeader.tsx`,
  `DuelRoomExperience.tsx`, `ImmersiveClash.tsx`, `LiveCrowdLayer.tsx`.
- Verification: `package.json`, `scripts/crowd-service-check.cjs`,
  `scripts/crowd-runtime-check.cjs`, `scripts/duel-render-smoke.cjs`,
  `utils/immersiveClash.test.ts`, this report.

## Deployment and limits

Migrations were applied and validated locally; hosted Supabase deployment is not
claimed. Deploy the two migrations before publishing this client. The existing
Arena membership semantics are preserved. Counts are joined memberships, not
presence estimates. Backing remains the existing local support toggle.
Safety changes made elsewhere may take up to two 15-second visibility sweeps to
evict all cached rows; access is rechecked on every server request. Rendering is
bounded to 200 rows; this MVP does not expose an unlimited archive or durable
offline send queue. No second physical device, iOS device, production load test
or hosted environment was verified.

No camera streaming, paid feature, AI clone, Corner or later-phase feature is
implemented. Unrelated pre-existing Crew discovery/UI changes stay outside this
commit. Stop after Phase 3.8.
