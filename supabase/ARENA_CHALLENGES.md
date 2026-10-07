# Arena Challenge lifecycle (Phase 2)

Take → explicit Challenge with a counter-position → author ACCEPT/PASS →
the existing canonical Clash and linked duel Room. Reply remains a comment.
There is no additional battle engine, fighter registry or verdict.

## Storage and states

`arena_challenges` stores a UUID, source Take, frozen challenger/author identities,
20–500 character trimmed counter-position, status, timestamps and accepted Clash
FK. Its Room is derived from the Phase 1 unique `arena_rooms.clash_id` relationship.
No old Clash requires a Challenge and there is no historical backfill.

`PENDING → ACCEPTED | PASSED | CANCELLED | EXPIRED`; terminal rows cannot change.
The challenger can CANCEL a pending offer; only the author can ACCEPT or PASS.
PASS has no reputation or battle effects. Accepted cancellation belongs to the
existing Clash lifecycle and cannot be performed through a Challenge action.

The shared private server function `arena_challenge_duration()` defines a two-hour
offer lifetime, capped at Take expiry minus the existing 30-minute duel window.
List/create/actions expire due offers server-side. Payloads also report elapsed
pending offers as EXPIRED; actions persist expiry and **return** the expired state
so the expiry write is not rolled back by a raised exception. Removed/ineligible
sources also expire on action. No new scheduler is required.

## Operations and concurrency

- `create_arena_challenge(take_id, counter_position)` derives both identities,
  checks live/eligible source and bilateral block/mute safety, and applies the
  existing atomic throttle (10 new offers/hour per challenger). Take-row locking
  plus the partial unique pending `(take_id, challenger_id)` index makes double
  submissions return the first pending offer, preserving its original counter.
  A retry consumes neither another throttle event nor notification.
- `resolve_arena_challenge(challenge_id, ACCEPT|PASS|CANCEL)` authorizes before
  acting and rechecks expiry, source and safety. ACCEPT obtains the Phase 1
  `arena-duel:<Challenge UUID>` advisory lock before the Take lock, then locks the
  Challenge and calls `create_arena_duel(take_id, challenger_id, challenge.id)`.
  Clash, Room, fighters, accepted link, competing cancellation and notification
  commit or roll back together. Terminal retries return the existing state;
  a repeated accepted request returns the same canonical IDs with `created=false`.
- `list_arena_challenges(take_id, before_created_at?, before_id?, limit=20)` is
  private to the author/challenger, filters safety, and uses descending
  `(created_at,id)` keyset pagination capped at 50. The client requests 20.

A Take may have many pending challengers. Challenge acceptance admits **one active
canonical duel for the Take**, considering all existing Phase 1 open duels. The
first accepted offer wins; other pending offers become CANCELLED. Concurrent
losing accepts return CANCELLED with null battle links. New offers are rejected
while a canonical duel is open. Once it finishes, a new offer can be created.
Historical ACCEPTED rows remain accepted after their Clash finishes.

Phase 1's internal service operation stays available. Its insert trigger cancels
incompatible pending offers; a live accepted Challenge prevents another direct
canonical creation or reopening on that Take. Existing legacy/group battles are
unchanged. Pre-existing multiple service-created Phase 1 duels are not destroyed
or rewritten; an offer cannot be accepted until incompatible open duels finish.

## Security and notifications

Authenticated table access is SELECT-only, under party/safety/source RLS.
There are no client INSERT/UPDATE/DELETE policies or grants; client operations
cannot supply fighter identities, status, Clash or Room links. Trigger guards also
freeze source author and Challenge identity/terminal state and validate accepted
canonical links. Internal functions have empty search paths and revoked API
execution. Phase 1 creation and private view helpers remain inaccessible.

Existing `notifications` holds two new kinds with deterministic IDs:
`challenge_received_<uuid>` targets the Take, and `challenge_accepted_<uuid>` targets
the canonical Room. Room notifications use a null `entity_type` because the
existing reporting enum has no Room target; routing uses the notification kind.
Retries cannot produce duplicate notifications. No optional Pass/expiry events.

## Client and compatibility

Typed services strictly parse canonical links and server states. The existing
feed has a distinct Challenge button; Take detail adds a small source-context
composer and paginated incoming/own offers with ACCEPT/PASS/CANCEL/OPEN DUEL.
Focus plus a bounded 30-second foreground refresh reconciles competing state;
local expiry only removes stale action buttons. Accepted navigation follows the
server result. Notification links hydrate Take/profile context when absent from
the feed store. No dependency, animation or Arena redesign was added.

The accepted counter-position is exposed as `sideBText` by the existing canonical
Clash view, without manufacturing a comment. Other legacy view fields, group
Room paths, normal replies, voting/settlement, fighter publishing, moderation,
Mindshift, Battle Moments, Pulse, Crew Phase A, Vault and World remain intact.

## Validation

`056_arena_challenge_lifecycle.sql` tests lifecycle, privacy, permissions, immutable
identities, expiry, throttles, paging, notifications and a final-write failure.
`057_arena_challenge_concurrency.sql` uses two independent authenticated dblink
sessions and deliberately holds the first transaction open while the second
waits, covering double create, double accept and competing accepts. Fixtures
commit remotely and are cleaned remotely; no test depends on outer uncommitted
fixtures. Run via the local admin connection because Supabase's non-superuser
postgres role cannot initiate dblink under the local trust HBA configuration:

```powershell
supabase test db --db-url 'postgresql://supabase_admin:postgres@127.0.0.1:55322/postgres'
npm.cmd run test:unit
npm.cmd run typecheck
npx.cmd expo-doctor
```

A clean migration replay/test database excludes unrelated uncommitted Crew
discovery migration/tests and supplies generated public/GraphQL types. This
phase does not deploy hosted database migrations; apply both additive migrations
in order when deploying the app (enum additions must commit before their use).

Validation on 2026-10-07: Phase 2 pgTAP 108/108 (82 lifecycle/security and
26 concurrency assertions); full clean committed suite 2,331/2,331 across
57 files; full existing workspace suite including the uncommitted Crew discovery
test 2,352/2,352 across 58 files. Unit suite 340/340, TypeScript passed, Expo
Doctor 18/18. Local Supabase was available and no database test was skipped.

Corners, support/Pick-a-Side, all Assists/media/ranking/attribution, new Mindshift,
fighter records/rivalries, additional rematch flows, Crew qualification/Phase B,
Community Clashes, seasons/tournaments/promotion/relegation, XP/RPG roles,
AI/platform-generated Challenges, Vault and World changes are deferred. Phase 3
is not implemented.
