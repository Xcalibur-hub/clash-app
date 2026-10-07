# Arena duel foundation — Phase 1

```
Take (source proposition; author = Fighter A)
  └─ Clash (challenger = Fighter B; canonical competition)
       ├─ judgements → verdict (A / B / DRAW)
       └─ one arena_rooms.clash_id → live Room
            ├─ dedicated existing topic clock
            ├─ exactly A + B as debaters; other members are spectators
            └─ existing messages / evidence / realtime / Pulse
```

`arena_rooms.clash_id IS NULL` means GROUP. A linked Room means DUEL.
Historical Clashes are not backfilled. Group capacity, private stances, ballots,
results, rewards and spectator upgrades retain their existing behavior.

## Server creation contract

`create_arena_duel(p_take_id text, p_fighter_b_id text, p_request_key uuid)`
is executable only by `service_role` and the function owner. There is no public
creation endpoint or Challenge button. A future accepted event must supply one
stable server-generated UUID across retries. The mobile app must never carry a
service-role key or call this creation operation.

The RPC returns `{ clashId, roomId, created }`. A matching retry returns the same
IDs and `created: false`, even after settlement; reusing the UUID for a different
Take or Fighter B is rejected. Different keys cannot create another open duel for
the same Take and Fighter B. After a terminal result a new key may create another
duel. Phase 2 must additionally bind its accepted Challenge to that stable key.

Creation validates the live Take and both profile identities, rejects self-duels,
blocks and mutes in either direction, and applies the existing atomic rate limiter
to both fighters (five creations per hour). The entire Clash/topic/Room/two-member
graph and throttle events commit together. Advisory request locking and a Take
row lock serialize retries and different-key requests; unique constraints are
the final duplicate defense.

The dedicated topic reuses the existing execution clock: 20 minutes of arguments,
five minutes of final arguments, five minutes of judging. The Take must remain
active through that 30-minute window. Topic title is an execution label; the Take
remains the canonical proposition. No third competition or realtime engine exists.

## Identity, permissions and outcome

Fighter A is always `takes.author_id`; Fighter B is `clashes.challenger_id`.
Duel Take ownership, Clash identity/mode/key and Room link/topic are immutable.
The Room has capacity/count two; spectators do not consume fighter slots.
Immediate participant guards reject noncanonical debaters. Deferred constraints
require the complete two-fighter graph, synchronized clocks and terminal outcome,
including a verdict for every settled duel. Removing a fighter or verdict cannot
commit a partial graph. Cascading deletion of the source competition remains valid.

Existing publishing RPCs resolve the actor from the authenticated session.
Message/evidence guards additionally authorize canonical fighters on every insert
path, including reshares, and reject arguments once judging begins even if stored
Room phase has not advanced. Moderation updates and trusted system notices remain
available. Client table writes and relationship edits remain denied by grants/RLS.

Nonfighters use the existing public Clash ballot during the judging window;
fighters cannot judge themselves. Blocks/mutes prevent ballot access. A spectator
cannot promote themselves through topic joining, upgrades or direct row mutation.
Future spectator support/Assist capabilities are not implemented.

`judgements` and `verdicts` are the only duel ballots and outcomes. Guards prohibit
duel group side ballots, argument ballots and `arena_room_results`. Both settlement
entry points delegate to the existing Clash tally/reward implementation and update
the linked Room atomically. A tie is DRAW; zero ballots cancel both entities.
Group Room rewards and Mindshift settlement never run for duels. Full unification
of legacy group judging with Clash judging remains outside Phase 1.

Publishing, ballot insertion, settlement and duel scheduler status updates acquire
the Clash row before mutating the Room. The scheduler rechecks terminal Clash state
after locking. Concurrent ballots cannot escape the settlement snapshot.

Private legacy delegates are inaccessible to API roles so callers cannot bypass
the bridge. All new definer functions use an empty search path and qualified names.
The request key is not included in API column grants or public view payloads.

## Client and realtime

`get_arena_room` adds `roomMode`, `clashId` and a compact `duel` payload, with canonical
fighters, viewer relationship, Clash lifecycle, ballot permission and verdict.
`clash_view` also exposes the linked Room and judging time. Historical payloads
continue working. Typed mappers reject inconsistent duel identity/outcome payloads.

The existing room header shows canonical Fighter A VS Fighter B. The room screen
uses canonical relationship for publishing, keeps group judging/upgrades/backup
controls confined to group Rooms, and uses `submitJudgement` for public duel ballots.
It displays the Clash verdict rather than group results. No public duel creation UI
is introduced. `fetchClashView` provides a compact read by canonical ID.

`useLiveArenaRoom` and its realtime subscriptions are reused unchanged. Phase 0's
30-second authoritative refresh, bounded message hydration/visibility reconciliation,
foreground refresh and neutral Pulse cache are retained.

## Validation

The new suites are `054_arena_duel_foundation.sql` and
`055_arena_duel_concurrency.sql`. They cover transactional rollback, graph constraints,
client privileges, fighter/spectator publishing, moderation, outcome ownership,
scheduler cancellation, draws, retries and actual concurrent creation and settlement.
The Phase 0 suite also remains required. Its matcher uses pgTAP `matches` and its
committed rate-race fixture is cleaned before reuse after interrupted test runs.
The existing trend regression fixture is anchored inside the completed bucket
that its writer actually counts, eliminating a wall-clock-dependent false failure.

Supabase's local `postgres` role is not a superuser. Under local trust authentication,
`dblink_connect` requires a superuser caller even with a password supplied. Run the
concurrency suites through the **local-only** admin test connection:

```powershell
supabase test db --db-url 'postgresql://supabase_admin:postgres@127.0.0.1:55322/postgres'
npm.cmd run test:unit
npm.cmd run test:duel
npm.cmd run typecheck
npx.cmd expo-doctor
```

Security assertions still explicitly switch to authenticated/anonymous roles.
Do not use local test credentials or grant superuser access in hosted environments.
For a checkout with unrelated dirty migrations, run the tracked migration/test set
in an isolated local database. Generate types from that same schema, retaining
`public,graphql_public`, so unrelated APIs are not included in the Phase 1 commit.

## Deferred

The required checks passed locally: unit 334/334 (including six duel payload tests),
the targeted duel command 6/6, TypeScript,
Expo Doctor 18/18, and the complete workspace pgTAP suite 2,244 assertions across
56 files. The isolated clean tracked-migration database passed 2,223 assertions
across 55 files, so dirty
Crew discovery schema cannot hide a dependency. No hosted migration was applied.
Additional SQL lint reported existing PostGIS helper diagnostics and the existing
saved-expressive-media `createdAt` alias error; no new duel function errors were
reported. Those unrelated implementation changes are outside this commit.

No Challenge requests, ACCEPT/PASS, notifications or ranking; Corners, support state,
Assists (including media, ranking, attribution and use/dismiss); new Mindshift;
fighter career records or rivalries; Crew qualification or Phase B expansion;
Community Clashes, seasons, promotion/relegation, XP or RPG roles. Vault and World
are unchanged. Phase 1 ends at this foundation.
