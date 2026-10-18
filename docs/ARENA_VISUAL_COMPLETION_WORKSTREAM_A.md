# Arena visual completion — Workstream A

UI implementation on `feat/arena-visual-completion-a-20261017`, based on PR #70 head `7b32d3f0bf9a1d90cc5c1fef6cdaebbd58174267`. This branch targets `integration/arena-groups-live-20261017`; PR #70 itself is unchanged and remains OPEN/DRAFT. No merge or deployment.

## Implemented surfaces

- **Home/Fresh Takes:** preserve the existing featured carousel and every eligible feed row. Refine editorial hierarchy and spacing. Main feed cards now separate author, copy, media, response preview and actions into normal document flow instead of fixed-height media overlays or oversized text posters. Theme-based surfaces, fine borders, accessible wrapping actions, truthful failed-media previews, all original reaction/save/share/challenge/detail actions retained.
- **Live discovery:** compact shortcut/navigation hierarchy and proposition-led Clash cards, with restrained red/blue fighter rails. Existing caller-scoped `fetchClashView` supplies identities; never derive names from unrelated profile data or reveal BLIND identities. At most eight identity previews are requested per discovery surface, with no membership writes. Missing/mismatched successful preview responses remove the stale card metadata. Network failures retain the discovery entry with generic role labels rather than inventing names. Server-returned terminal status replaces the live card label when observed. Pending invitations still open their Take; canonical and legacy destinations retain the existing routing helper.
- **Truthful availability:** guest discovery offers sign-in rather than reporting zero duels. Discovery and topic loading/error states remain distinct from successful empty results. Home no longer silently turns failed topic fetches into verified empty activity. Its gateway labels actual returned *discussions*, not fabricated Room/viewer totals. Failed optional personalization preserves the server topic order. Topic state is scoped to the current account and late requests are ignored.
- **Discover:** replace the appended ranked trends section with selectable topic/trend constellations using the existing canonical catalogue and server-only trend service. Lines mean shared communities, not inferred activity or relationships. Nodes have 44-point marks, full accessibility labels, adaptive columns/row spacing and a bounded scroll viewport. Selected topics expose existing community/question actions; selected trends preserve Room/topic entry. Real active discussions and questions remain available. Selection detail fades honor reduced motion; no continuous graph animation. The existing API returns at most ten trends; these are displayed spatially, without a top-ten list or fabricated scores.
- **Shared navigation:** consistent neutral rail, refined brand/action sizing, 44-point top-bar controls and an Arena-only wider dock with safe-area clearance. Arena dock hides while the keyboard is visible and removes listeners on cleanup. Vault retains its previous dock styling and behavior.
- **Take discussions:** quieter heading/count hierarchy, root thread rails around the existing nested-reply component, wrapping sort controls and a distinct composer surface. Empty replies are suppressed during loading/errors. Preserve existing reply pagination, drafts, media, moderation, reactions, authentication and Clash flows. Android relies on native window resizing rather than adding a second padding adjustment; iOS retains keyboard padding. Native keyboard geometry still requires device review.

## Exact application files changed

1. `app/(tabs)/index.tsx`
2. `components/arena/ArenaTopBar.tsx`
3. `components/arena/ArenaLiveGateway.tsx`
4. `components/arena/ArenaClashes.tsx`
5. `components/arena/ArenaTopics.tsx`
6. `components/arena/TakeFeedItem.tsx`
7. `components/arena/ArenaSideRail.tsx`
8. `components/navigation/RealmTabBar.tsx` — Arena-only behavior/style branches
9. `app/take/[takeId].tsx`

Additional files: `components/arena/ArenaVisualCompletion.test.cjs`, this report and the two explicitly labelled web-preview PNGs below. No dependency installation or manifest/configuration changes.

## Validation actually executed

| Command/check | Actual result |
|---|---|
| `npm.cmd run typecheck` | PASS, exit 0; rerun after final application changes |
| `npm.cmd run test:unit` | PASS, exit 0; final run **500 tests / 126 suites**, 0 failed/cancelled/skipped |
| `node --test components/arena/ArenaVisualCompletion.test.cjs` | PASS, exit 0; **16 tests**, 0 failures/skips |
| `node --test components/arena/groups/GroupDiscovery.test.cjs` | PASS, exit 0; **8 tests**, 0 failures/skips |
| `node --experimental-strip-types --test components/liveArena/liveArenaStyles.test.ts` | PASS, exit 0; **8 tests / 4 suites**, 0 failures/skips |
| `node scripts/duel-render-smoke.cjs` | PASS, exit 0; **22/22 controlled render scenarios** |
| `node scripts/arena-engagement-check.cjs` | PASS, exit 0; **8/8 controlled hook/composer checks** |
| `node node_modules/expo-doctor/build/index.js` | PASS, exit 0; **18/18 checks** |
| Exact application path allowlist and protected-directory diff against base | PASS; exactly nine application files, protected paths unchanged |
| `git diff --check` | PASS after removing one trailing whitespace line |

The four Node test commands total **532 tests**. Controlled render/hook checks are listed separately. New coverage exercises graph layout/connections at narrow widths and enlarged fonts, node selection and real destinations, server-only trends, loading/error retry, discarded late/account/blur responses, guest Live gating, Pending/Upcoming/Completed routes, BLIND/authorized identities, terminal previews, denied/mismatched records, bounded preview calls, preserved feed actions/questions/challenges, failed-media fallback, unknown gateway counts, and Arena keyboard/Vault isolation.

Initial new-harness failures were test-tree recursion and JSX-whitespace comparison issues; the harness was corrected and all behavior assertions retained. One-off preview generation initially needed its theme/native bridge corrected. No application assertion was removed or backend/security behavior relaxed to obtain a pass. Node emitted its existing experimental type-stripping/module-type warnings; the render bridge also emitted its existing pointerEvents deprecation. The web-only SVG bridge warned about `testID` on a DOM element. These are not Android results.

## Visual evidence and limits

Both captures render the **real new feed, Live discovery and Discover components** through React Native Web at 360-point panel width, using the existing dark/light palettes. Every image is prominently marked **LOCAL VISUAL PREVIEW — FIXTURE DATA — NOT LIVE — WEB LAYOUT ONLY**. All names, topics and activity in these images are isolated synthetic fixtures; none were inserted into an application store/database or added as a production fallback. The one-off renderer and browser profiles remain ignored under `.expo/visual-review`; only sanitized labelled images are committed.

- [Dark web layout preview](evidence/arena-workstream-a-20261017/preview-dark.png)
- [Light web layout preview](evidence/arena-workstream-a-20261017/preview-light.png)

Browser/React Native Web evidence is **not** a physical-device or backend pass. Avatar rendering, native animations and managed modules were bridged; the question module was represented by a clearly labelled offline placeholder in this one-off preview only. The screenshot does not cover the complete Home carousel, Take discussion or native dock. No visual fixture code is imported by production components.

## Still needs visual/runtime review

- Samsung A50: cold launch of this exact branch, typography, rail/dock safe areas, navigation/refocus and touch targets; physical light/dark and enlarged-font rendering.
- Actual Android/iOS keyboard open/dismiss/resize behavior in Take discussions and content scroll above the composer/dock.
- Real catalogue/trend density, long topic names, nested graph scrolling and TalkBack focus/selection. Trend selection is covered by controlled interaction tests, not a native screenshot.
- Long/media-heavy feed cards, actual image/video/GIF playback and the unchanged Fresh Takes carousel. No native-media pass is claimed.
- Authenticated live discovery identities, BLIND privacy, canonical spectator entry and denied/removed content against a working authorized backend. The existing server service/permission contracts are unchanged; controlled tests do not establish database security.
- Existing onboarding/backend availability blockers recorded in PR #70 were not diagnosed or changed here.

**Android: NOT TESTED in this workstream. Database/authenticated end-to-end: NOT TESTED.** No device launch, permissions change, app-data clearing, Metro configuration change, local/hosted database access, Supabase operations, migrations, native installation or infrastructure changes were performed. Groups/Crew screens and services, Live Duel components/Room route, World, Vault application screens, backend/schema, global themes and existing unrelated primary-checkout work remain untouched.
