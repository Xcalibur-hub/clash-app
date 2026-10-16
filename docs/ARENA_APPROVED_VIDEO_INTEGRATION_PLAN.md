# Arena approved-video integration — execution contract (16 October 2026)

## Objective
Port the approved Gemini Arena visual language to the **existing Expo/React Native architecture**, improving Groups using a hybrid Reddit/Discord information hierarchy. Preserve Home, Live, Take discussions, duel stage, and Discover visual direction. No changes to Supabase schema, auth, Clash engine, or unrelated World/Vault functionality.

## Baseline and precautions
- This planning branch is based on `design/arena-unified-ui-pass-20261016` (PR #66). **Not** a chosen merge baseline; confirm against local `preview/arena-live-ui` and uncommitted/untracked files before implementation.
- Gemini's `apply-arena-apple-hig.mjs` is **not** approved for execution; it replaces routes and service contracts wholesale.
- Critically, `app/(tabs)/explore.tsx` contains the cross-app Explore/World experience. Do not replace it with Arena Discover. Existing Arena Discover is `components/arena/ArenaTopics.tsx`.
- Only two agents should write concurrently if their file sets are disjoint. Integrator owns shared theme, nav, and `app/(tabs)/index.tsx`.

## Workstream ownership / no-overlap file boundaries

### Codex — Groups (highest priority)
Exclusive edit: `components/arena/ArenaCommunity.tsx`, `app/arena/crews/**` after verifying real routes. May add **new** `components/arena/groups/**` files. Avoid changing `app/(tabs)/index.tsx`.
- Hybrid UI: Joined/Explore horizontal switch, branded community hero/profile, description and interests, activity indicators only from actual data, pinned discussions where supported, live clashes and people/members where supported, native-feeling membership and invitation navigation.
- Preserve `listArenaCrews`, `listMyArenaCrews`, signed-in checks, pagination, permission restrictions, and `ArenaCrew` types; no invented values.
- Verify navigation uses supported route ID/slug. Handle loading, error, empty, leave/join/restricted states as supported by existing service.
- No new community-versus-community battle model. Community invitation to 1v1 Clash remains optional.

### Cline — Duel stage / Live Arena
Exclusive edit: `components/liveArena/**`, `app/arena/room/[roomId].tsx` after verifying route. Avoid `components/arena/ArenaClashes.tsx` and Home.
- Port Gemini approved red/blue fighter split, compact stage proposition, chat, reactions, private assists to current components.
- Preserve exactly two fighters, spectators read-only in fighter actions, actual live count, room lifecycle, accepted assists, and authoritative Clash verdict.
- Improve responsive layout, safe areas, keyboard, accessibility/reduced-motion. No mock votes or fake crowd counts.

### Integrator (ChatGPT or designated lead) — visual system and composition
Exclusive edit: `app/(tabs)/index.tsx`, `components/arena/ArenaTopBar.tsx`, `components/arena/ArenaLiveGateway.tsx`, `components/arena/ArenaClashes.tsx`, `components/arena/ArenaTopics.tsx`, `components/arena/TakeFeedItem.tsx`, `app/take/[takeId].tsx`, new `theme/arenaAppleHig.ts`, shared Arena-only UI primitives. Never overwrite app-wide Explore.
- Prefer styling adapter to destructively replacing existing route or selectors.
- Maintain `useClash`, `reloadArena`, feed scopes, interest ranking, live services, reaction RPCs, and navigation.
- Retain approved home feed + live cards + discussions; address dock overlap/keyboard padding.
- Discover: retain interactive trending visualization; topic click enters real topics/Takes/live groups, no fake data.

## Integration discipline
1. Inspect actual repository contracts before editing. Create three separate branches from the **same** verified baseline SHA; avoid direct concurrent commits to a shared branch.
2. Each agent delivers a draft PR, lists changed files and real tests. Keep PR #66 unmerged during evaluation.
3. Integrate in order: tokens+Home, Groups, Live duel, Discover/Take detail. Resolve any shared component conflicts centrally.
4. Gates: `npx tsc --noEmit`; lint; existing Arena tests; Expo Doctor; Android bundle preflight; real Android manual navigation/safe-area/keyboard/live controls.
5. Production-readiness claims require verified end-to-end backend functionality; otherwise label the result "visual integration candidate".

## Five-hour goal and decision gate
Target **testable visual integration**, not guaranteed production-ready app:
- 0:00–0:30 freeze approved reference + baseline, inventory routes, contracts, safe branches.
- 0:30–2:45 three nonoverlapping workstreams; per-screen mockups in native components.
- 2:45–3:45 merge/integrate, fix type and navigation errors.
- 3:45–4:45 Android device review, keyboard/safe-area/scrolling, fixes.
- 4:45–5:00 PR diff, regression summary, fallback/rollback.
If backend actions, routing, or native builds are failing at 4:45, do not merge. Ship a draft PR and issue list instead.
