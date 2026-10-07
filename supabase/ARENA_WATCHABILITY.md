# Arena watchable 1v1 experience — Phase 3

This phase specializes the existing Room presentation. It adds no database
migration, competitive entity, permission, subscription or lifecycle engine.
Phase 2 acceptance continues navigating directly to the canonical duel Room.

## Screen and hierarchy

`app/arena/room/[roomId].tsx` gates `DuelRoomExperience` on the canonical DUEL
marker, matching Clash link and parsed duel payload. Group Rooms continue using
their existing header, Pulse/Battle Moments, cast, thread, composer, judging and
result presentation.

The duel hierarchy is:

1. Compact back/status bar; a spectator count appears only when returned by the
   existing server Room-load API.
2. Full source Take, canonical Fighter A/B avatars, names, handles and positions.
   Long counter-positions can be expanded. The text comes directly from Phase 2's
   accepted position and the existing Clash view; no generated summary.
3. Server phase and viewer relationship: WATCHING, YOU'RE FIGHTING · FIGHTER A/B,
   or MODERATOR · WATCHING.
4. Transcript (default) or the existing Evidence surface.
5. The flat chronological fighter arguments and attached/standalone evidence.
6. Official judging/result after the arguments; the compact bottom action jumps
   to the latest arguments, judgement choices or verdict. Fighters retain their
   existing composer while publishing is permitted.

The duel surface uses neutral existing theme tokens with a restrained red live
indicator. It does not use the group split-side colours, atmospheric surfaces,
Pulse ranking strips or event bursts. Those systems are preserved for groups.

## Identity, permissions and lifecycle

Canonical Fighter A is the Take author; B is the Challenger. Participant ordering,
reaction totals and Pulse leaders never identify fighters or decide outcomes.
The parser now preserves already-existing source/counter text, avatar tint and
settled ballot split, retaining compatibility with older payloads that omit them.
Malformed identities, links, permissions and verdicts still fail closed.

Supported labels are Waiting, Live, Final arguments, Judging, Awaiting verdict,
Complete and Cancelled. They reflect the server's existing phase and canonical
Clash state. There are no invented opening/counter rounds or countdowns.

The current backend explicitly denies spectator Room messages, reactions and
evidence marking. Phase 3 does not widen those permissions or advertise Live
Chat. Spectators can watch/read, open profiles, report visible content and cast
the official judgement when allowed. The Evidence tab reuses a genuine existing
feature. A locked live transcript offers Watch Clash via the existing authenticated
`watchRoom` operation, which assigns spectator membership without a fighter slot.
Historical transcripts retain the existing membership restrictions.

Fighter composition/reply actions follow canonical identity plus server phase.
Reaction/evidence interactions also require existing debater membership. The
expressive reply menu hides fighter-only reply options from duel spectators and
after publishing closes. Group menus keep their original default behaviour.

## Transcript, outcome and safety

`duelPresentation` filters the existing visible stream to canonical fighters and
system notices, sorts actual timestamps with deterministic ID ties, and flattens
fighter responses instead of hiding them in ranked nested previews. It never
reintroduces a hidden/evicted parent or its attached citation. Standalone evidence
and actual media/reaction/report components are reused.

Fighter contributions have flat surfaces, stronger text hierarchy, explicit
FIGHTER A/B labels and actual local creation times. No elapsed-round timestamps
are fabricated. Evidence remains a secondary paginated/virtualized view.

`DuelRoomOutcome` submits through `submitJudgement`. It prevents repeat pending
submissions, hides self-judging, and clearly distinguishes official ballots from
reactions. It renders only the canonical Clash verdict, both fighters, the ballot
count and split when available, draw/cancellation, and transcript/Arena actions.
No group Room result, popularity signal or client calculation supplies a winner.

Loading, empty, missing visible fighter arguments, membership refusal, update
failure and cancelled/awaiting-verdict states have truthful copy and retry/entry
actions. Cached arguments remain readable on refresh failure. Duel mutation
notices and ballot errors avoid raw technical details; failed composers retain
the existing draft behaviour.

## Realtime, performance and accessibility

The existing `useLiveArenaRoom` INSERT patching, 30-second reconciliation,
foreground refresh, bounded rotating visibility checks and message eviction
remain unchanged. Only duel mutation notice wording changes in that hook.
Derived transcript/evidence maps are memoized, the list renders 12 initial rows
with bounded batches/windowing, media animation is viewability-gated, and earlier
arguments use the existing 40-row pagination. New posts follow the latest edge
only when the viewer is already there; reading older arguments is not interrupted.
There is no new per-message Room fetch. Duel Pulse polling is unnecessary and is
not displayed or scheduled by the route's Pulse effect.

Fighter/side and stage information is explicit text, not colour. New controls have
accessible labels, readable role/live-state announcements and 44-point targets.
Source/argument text is selectable; duel argument text supports system scaling.

## Validation on 2026-10-07

- `npm.cmd run test:unit`: 358/358 tests, zero failed/skipped.
- `npm.cmd run test:duel`: 24/24 (9 payload and 15 presentation regressions).
- `npm.cmd run test:duel:render`: 9/9 actual component render scenarios — spectator,
  fighter, judging, draw, cancelled, error, loading, locked and moderated.
- Phase 0/1/2 pgTAP: 238/238 assertions across five files, using independent
  dblink connections for the existing concurrency coverage.
- TypeScript: passed. Expo Doctor: 18/18 checks passed.

The render smoke uses React Native Web primitives and bridges native animation,
icons and media modules. Phone-sized spectator/judging/error/draw HTML previews
were visually inspected in headless Edge with a system-font fallback. This is
not a device test: native keyboard behaviour, native media playback and actual
interaction/network recovery were not exercised on an emulator or physical
device. No runtime dependency was added.

Unrelated dirty Crew discovery/UI files are preserved and excluded from the
Phase 3 commit. Pick-a-Side, Corners, all Assists/queues/media/attribution,
new Mindshift, reputation, careers/rivalries/rematches, Crew competition,
Community Clashes, seasons/tournaments/XP/roles, Vault and World changes are
out of scope. Phase 4 is not started.
