# Arena Engagement V1 — personalized Live discovery

## Audit before implementation

Baseline `673d49164b7bcbaeb14283ccd27adde5b1648c21`, existing `arena-ui-review`; tracked tree clean. Unrelated untracked files/configuration are preserved.

- Live currently uses `list_arena_clash_discovery`: caller-scoped, fixture-excluding, server states and canonical Room/legacy routes, at most 60 records shared by challenges/live/upcoming/history. There is no cursor or complete global live index.
- `clash_view` supplies authorized revealed fighter identities, opening/closing timestamps and status. BLIND identities must never be reconstructed from raw relationships.
- `get_arena_room` is an existing read-only visibility-gated payload with real canonical phase; it creates no membership. No Crowd presence subscription is needed for discovery.
- Existing interest catalogue/preferences map explicit topic IDs to Take hoods (onboarding allows 3–5 or skip). Source Takes can be read through RLS with a narrow `id,hood` whitelist; no keyword topic inference is needed.
- Existing Home ranking is a separate bounded Take RPC. It is not a duel ranking contract and must not be repurposed to imply duel popularity.
- `fetchFollowingIds` loads all follows. Discovery will instead read only matching candidate fighter IDs, for the current viewer profile. No full graph, follower counts or behavioral profiling.
- Neither aggregate topic participant counts nor Room participant totals establish current duel viewers. Audience/popularity ranking and counts are unsupported and will be omitted.
- Legacy and canonical routes remain unchanged. No migrations, grants, RLS, authentication or ranking backend changes are planned. This is client selection over authorized bounded data; deployed RLS correctness is not established by client tests.

## Intended deterministic policy

For You: explicit interest match, then followed public fighter, then real opening recency, stable ID tie break. Discover: known topics outside selected interests first, then unfamiliar public fighters, then opening recency and stable ID. With no interests, use an explicit different stable topic traversal; explain the fallback. Following never fills with unrelated rows, and a failed follow read must display an error rather than an empty result. No engagement scores or speculative inferred interests.

Snapshots and UI pages are bounded; refresh/focus establishes a new ordering. Background revalidation may remove inaccessible/ended candidates and update metadata, but must not reshuffle already paginated live results. Record exact implementation/results after validation.

## Implemented behavior

- **For You:** selected interest hood match first, then a publicly revealed fighter the viewer follows, then `clash_view.opensAt` descending, with a binary ID tie break. No dwell-time, inferred preference or engagement-maximization model.
- **Following:** only candidates whose authorized public fighter IDs intersect the viewer's own candidate-scoped follow read. No unrelated fill. Failure, loading, no matching candidates and a successful list have distinct UI states. BLIND fighter identities are neither queried through raw Clash relationships nor used for relevance.
- **Discover:** known topics outside explicit interests first, unfamiliar public fighters next, then opening recency/ID. With no usable interests, traverse known topic hoods deterministically before recency/ID. When all signals are identical there may be no meaningful order difference; no arbitrary novelty score is invented. Topic chips filter only available authorized snapshot hoods and use existing `HOOD_LABEL` display names. The real `/interests` route edits preferences.
- **Cards:** exactly one featured first live card, compact subsequent cards, authorized identities only, authoritative canonical Room phase where available, and a concise signal-derived reason. No duel audience count or popularity number is supplied. Legacy Clashes have no Room phase and retain their original destination.
- **Read safety:** existing discovery RPC supplies the bounded set. Source enrichment selects only `id,hood`, excludes runtime fixtures and obeys existing table RLS. Every Clash view must match the source/Room IDs, and canonical Room reads must still succeed with matching identity. Null, mismatched or denied details are omitted. Later Room terminal status/phase overrides an earlier LIVE snapshot. No read creates membership.
- **Scale/recovery:** at most 60 discovery records, four concurrent detail reads, at most 120 candidate fighter IDs for one filtered follow query; the whole follow graph is never loaded. The FlatList initially exposes 12 rows and extends by 12 with stable keys; initial render is four rows, batches six, window five. Focus/explicit refresh establishes ordering. Successful polling every 20 seconds updates/removes entries without introducing or reshuffling IDs inside an existing live snapshot. Failed aggregate reads stop automatic reloads until refresh/refocus. A 45-second aggregate deadline exits loading; existing in-flight legacy transports may finish, but their results cannot publish or initiate another read sequence after expiry. No automatic transport retry is added.
- **Account isolation:** current auth identity is verified before/after reads and before each detail worker. A focus-generation guard stops obsolete results; the UI additionally requires snapshot owner equality synchronously. There is no cross-account discovery cache or persisted tracking.
- **Demo:** existing six varied duel fixtures now use the same pure ranking function. Explicit local scenarios cover interests/follows, no interests and no follows; For You/Following/Discover explanations are fictional and labeled. All actions remain local. The existing release fixture exclusion and runtime production-service-import guard remain intact. Live filter accessibility labels distinguish them from the global Arena Discover destination.

## Limits and unsupported signals

This is **bounded client personalization**, not complete global discovery. The existing 60-record server window is shared with pending/upcoming/completed records; live duels beyond that window cannot be recovered through an absent cursor. No interest/follow signal guarantees a globally complete result. Empty copy explicitly refers to the snapshot. Optional interest failure falls back with a warning; follow failure disables Following results with an error. Failed metadata enrichment can reduce coverage and is disclosed.

The existing APIs require up to 60 Clash views plus 60 canonical Room reads per full enrichment, in four workers, in addition to the bounded source/preferences/follow reads. This caps memory and concurrency but remains a network-cost ceiling; larger-scale discovery needs a separately approved batched caller-scoped server projection/cursor. No such backend was introduced. New candidates and recovered omitted candidates require refresh/refocus to enter the stable paginated list. Discovery is sampled rather than push-based; state/access changes between checks are enforced again by existing destination/server contracts. No stale snapshot grants participation.

No true duel viewer count, verified popularity, live argument volume, followed-duel subscription signal or behavioral history is available to this selector. None is fabricated. Source engagement and Home Take ranking are deliberately not advertised as duel engagement. Canonical/legacy navigation, official judging, Crowd, assists, authentication, RLS, schemas and gameplay rules are unchanged.

## Executed validation

| Check | Actual result |
| --- | --- |
| `npm.cmd run typecheck` | PASS, exit 0 |
| `npm.cmd run test:unit` | PASS: 500 tests / 126 suites, 0 failed/skipped, exit 0 |
| `node --test scripts/personalized-live-discovery.test.cjs scripts/arena-live-v2-check.test.cjs scripts/arena-spectator-check.test.cjs scripts/arena-demo-check.test.cjs components/arena/ArenaVisualCompletion.test.cjs scripts/take-challenge-check.test.cjs` | PASS: 94 tests, 0 failed/skipped, exit 0 |
| Shared demo controlled render at dark/light × 320/360/430 | PASS: six static renders, zero production service imports; not a native layout measurement |
| `git diff --check` | PASS |

Sixteen new controlled tests cover deterministic ranking, sparse signals, distinct Discover ordering, no Following fill, BLIND identity exclusion, duplicates/conflicts, terminal/pending states, frozen ordering/revocation, exact source whitelist and follow limits, four-worker concurrency, known-ID/mismatched/denied reads, account/focus races, metadata/follow/interest failures, deadline expiry, actual connected UI loading/error/empty states, page bounds, one featured card and topic filtering. Existing seven discovery UI tests were adapted to the new read-snapshot boundary while preserving guest, canonical/legacy routing, BLIND, stale-account, denied-card and virtualization assertions. The existing demo identity test locates cards by source proposition rather than assuming an unranked order; its identity and varied-pair assertions remain.

Intermediate failures: generated database typings omit the already-existing runtime-fixture column; the query was corrected to reuse the repository's existing `.filter('is_runtime_fixture','eq',false)` pattern. One new test expected the wrong equal-recency ID tie break; its expectation was corrected to the documented policy. The existing demo test initially expected six fixtures after a temporary eight-fixture expansion; the original six fixtures were retained. Seven old UI tests initially rejected the new read-adapter dependency and were migrated to its contract. All final checks above actually ran. No assertions were skipped, and no backend permissions were relaxed.

No SQL/pgTAP, live authenticated data reads, migrations, Supabase CLI, Docker, hosted-project access, Expo Doctor, native rebuild or deployment was performed. Mocked read tests do not prove deployed RLS or real-server compatibility. No dependency/native configuration changed.

## Samsung A50 smoke test — 19 October 2026

Device model SM-A505F was verified, with the original preferences and ADB reverse list matching the saved baseline before testing. Existing normal Metro 8081 and loopback backend configuration were retained. The initial bounded `am start -W` timed out and the first hierarchy was empty: neither is counted as a launch-gate pass. Subsequent actual accessibility controls succeeded, and the new local scenarios/filter labels appeared. Real Android bundle response evidence reported HTTP 200. No ADB restart, login, permission change, app-data clearing or backend reconfiguration was used.

Physically exercised **local demo only**:

1. Enter Demo Arena → Live: interest-matched featured duel and compact subsequent content.
2. Following: followed-fighter card and matching reason.
3. No follows: honest empty Following without unrelated fill.
4. Discover: broader topic reason and a different featured result.
5. Sparse interests → For You: followed-fighter fallback.
6. Light theme: readable identities/reason/actions and bottom dock within safe areas.
7. Watch the reordered featured card: matching Jordan Okafor/Maya Chen demo Room opened; Android Back returned.
8. Return dark, exit demo and run the scoped restoration helper: PASS, original preferences byte-equal and ADB reverses exact. Normal Metro remains on 8081.

A confirmed native accessibility ambiguity stopped the first Discover tap (global Discover and Live Discover had identical names). Live filters now have explicit `Live filter: …` names in both real/demo UI; the exact native retry succeeded. No coordinates were guessed. Screenshot status bars contain notification indicators, so captures remain private and untracked.

Seven native screenshots, all 1080 × 2340, are retained under `.expo/live-v2/native/screens/`:

- `discovery-01-for-you.png`
- `discovery-02-following.png`
- `discovery-03-empty-following.png`
- `discovery-04-discover.png`
- `discovery-05-sparse.png`
- `discovery-06-light.png`
- `discovery-07-linked-demo-room.png`

Private dimensions/SHA-256 manifest: `.expo/live-v2/native/discovery-capture-manifest.json`. No images, raw device logs, account data, secrets or private configuration are committed. The final real-mode topic chips and aggregate deadline were added after native review and are controlled-test verified, not physically verified. Real authenticated personalized discovery, actual follow changes, server outages/RLS enforcement and large live datasets remain **NOT TESTED** here.

## Changed files and delivery

- `components/arena/ArenaClashes.tsx`
- `components/arena/LiveDuelCard.tsx`
- `components/dev/arenaDemo/DemoLiveDiscovery.tsx`
- `services/personalizedLiveDiscoveryService.ts` (new read adapter)
- `utils/personalizedLiveDiscovery.ts` (new pure selection)
- `scripts/personalized-live-discovery.test.cjs` (new regressions)
- `components/arena/ArenaVisualCompletion.test.cjs`
- `scripts/arena-demo-check.test.cjs`
- This report.

Only intended changes are committed locally on `arena-ui-review`. No push, merge, worktree or new branch. Unrelated untracked files/local configuration are preserved. Review before authorizing publication.
