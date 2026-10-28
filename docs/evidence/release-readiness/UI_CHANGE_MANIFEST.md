# UI change manifest - Phase 5A

27 October 2026. Branch `arena-ui-review`, HEAD `cbe216a3c212a83c432f71b37b59a1debe5caa63`. **Inventory only; nothing staged or committed.** Companion: [acceptance and blockers](PHASE_5A_REPORT.md).

This identifies the candidate source/test boundary for a later approved freeze. “Belongs to UI work” does not mean every diff is ready: the Live ScrollView integration must be corrected first. Preserve current files and review final hashes again before any commit.

## Pending tracked paths - 26

M = tracked modification relative to HEAD. All26 are attributable to the reviewed UI work; the tracked Phase4F evidence report is listed separately below.

| State | Exact path | Phase / purpose |
|---|---|---|
| M | `app/(tabs)/explore.tsx` | 4E.1 World text scaling and44dp Map/Globe/Search/Teleport; retain existing3D read-state guards |
| M | `app/(tabs)/index.tsx` | 4H Groups/Discover scroll ownership; **HOLD: also wraps Live FlatList in plain ScrollView** |
| M | `app/explore/country/[code].tsx` | 4E.1 country headline scaling and44dp Back |
| M | `app/take/[takeId].tsx` | 4D.3 actual author/profile route callback |
| M | `components/arena/ArenaSideRail.tsx` | 4H rail stacking above content layers |
| M | `components/arena/TakeEditorialHeader.tsx` | 4D.3 accessible author action; static preview remains noninteractive |
| M | `components/explore/WorldCountryPanel.tsx` | 4E.1 scaling/wrapping and flexible CTA |
| M | `components/explore/WorldExperience.tsx` | 4E.1 successful-empty scaling and resting-rail clearance |
| M | `components/liveArena/ClashMoreSheet.tsx` | 4D.2 diagnostics child slot and development-only safe inset |
| M | `components/liveArena/ClashProposition.tsx` | 4C.4 native font remeasurement wrapper |
| M | `components/liveArena/CurrentArgumentStage.tsx` | 4C.4 enlarged full argument / remeasurement |
| M | `components/liveArena/DuelDevPanel.tsx` | 4D.2 normal-flow collapsible diagnostics,44dp target |
| M | `components/liveArena/DuelRoomExperience.tsx` | 4C Crowd inset/layout and4D.2 More-sheet diagnostics; preserve combined corrections |
| M | `components/liveArena/DuelRoomOutcome.tsx` | 4C.4 readable outcome text/actions and labels |
| M | `components/liveArena/ImmersiveClash.tsx` | 4C-C4 IME/Stage draft preservation, Focus Stage dismissal, JUDGING inset and enlarged scrolling |
| M | `components/liveArena/LiveCrowdLayer.tsx` | 4C nonshrinking composer/Send |
| M | `components/shared/MediaViewer.tsx` | 4G/4H trusted public Image source; video behavior unchanged |
| M | `components/vault/VaultMediaTile.tsx` | 4G/4H trusted poster Image source |
| M | `components/vault/VaultReaderMedia.tsx` | 4G/4H trusted reader Image source |
| M | `components/vault/world/EditorialMedia.tsx` | 4G/4H trusted creator-world Image source |
| M | `components/vault/world/SeriesComposition.tsx` | 4D.1 separate collection title action versus episode-to-Drop action |
| M | `components/vault/world/WorldChapter.tsx` | 4D.1 forwards existing collection callback |
| M | `services/mediaService.ts` | 4G re-export of public media Image helper; no backend/service mutation change |
| M | `package.json` | 4G/4H add public-media unit test to existing command; preserve committed World/Play tests. No dependency/lockfile change |
| M | `scripts/take-detail-check.test.cjs` | 4D.3 real active/archived route author callback test |
| M | `utils/arenaHomePresentation.test.ts` | 4H rail/home source-contract assertions; **review combined-mode regex, which currently misses the Live nesting defect** |

## Pending untracked paths - 10

U = not in Git. These are additions since the original1,920-file unrelated baseline. They must not be lost in a tracked-only freeze.

| State | Exact path | Purpose |
|---|---|---|
| U | `components/liveArena/ArenaRoomText.tsx` | **Required production dependency** for four modified Room components; native text remeasurement without parent/draft remount |
| U | `utils/publicMediaImageSource.ts` | **Required production dependency** for four modified media consumers and service re-export; exact-origin/public-path header gate |
| U | `utils/publicMediaImageSource.test.ts` | URL/header helper regression tests; configured in `npm test` |
| U | `scripts/arena-room-text.test.cjs` | Room text wrapper and enlarged content tests |
| U | `scripts/arena-runtime-chrome.test.cjs` | development/release diagnostics and More-sheet tests |
| U | `scripts/crowd-stage-focus.test.cjs` | mounted draft/focus/keyboard/inset regressions |
| U | `scripts/take-profile-navigation.test.cjs` | actual header identity/preview callbacks |
| U | `scripts/take-reaction-behavior.test.cjs` | actual hook/deferred transport, guard/rollback/account scope |
| U | `scripts/vault-collection-navigation.test.cjs` | collection entry, poster callback and retry/read behavior |
| U | `scripts/world-accessibility.test.cjs` | production World/country component geometry properties, scaling and callbacks |

**Pending boundary:36 paths =26 modified +10 new.** It contains25 production source paths, one package/config path and10 test paths. Only the public-media unit addition is newly wired into the default test command; explicitly preserve/run the other pending focused suites until a later reviewed test-command integration.

## Already committed Phase4 source/test paths

Do not recommit/reset these as if missing; package.json also has later pending additions above. There are9 distinct code/config/test paths across the two Phase4 commits (44 unique Phase4 pending-or-committed paths after accounting for shared package.json).

| Commit | Paths already in Git |
|---|---|
| `6ca9222` | `app/world/index.tsx`; `components/world/WorldMapUnavailable.tsx`; `utils/worldNativeMapAvailability.ts`; `utils/worldNativeMapAvailability.test.ts`; `scripts/world-discovery-runtime-check.cjs`; `scripts/world-empty-discovery-check.cjs`; `package.json` |
| `cbe216a` | `app/explore/challenge/[id].tsx`; `scripts/play-challenge-accessibility.test.cjs`; `package.json` |

Earlier prerequisites already in Git:3D `9bad8b0` Explore read-state correction and `scripts/explore-read-states.test.cjs`; Phase1/2 Settings/Vault availability and accessibility commits `d5268cc`/`6d67714`; Meet UI freeze `d8d5e75`. Unchanged `GroupDiscovery.tsx`/its8-test suite, Crew detail, collection/reader routes, entitlement services and canonical Clash engine are dependencies, not new pending edits. No migration/database types file belongs to this UI freeze.

## Evidence-only changes - review separately

- One tracked modified evidence path: `docs/evidence/ui-completion-phase4f-play/REPORT.md` (later4F.2 native join update over committed4F.1).
- Before Phase5A:363 new evidence files,354 JSON +9 Markdown, under Phase4C/4D/4E/4F/4G/4H report directories. No new PNG/JPG/ZIP/JAR among them. They contain fixture identifiers and device metadata; absence of literal JWT/private-key regex hits does not authorize public publication.
- These two Phase5A deliverables are requested report additions, separate from the36-file source candidate.
- Private screenshots, raw XML/logs, DPAPI credentials, environment files, `.expo` tooling/bundles and QA runtime state **must not** be included in a source commit. In particular, no `.expo/ui-completion-phase4*/` directory is a source dependency.
- Existing unrelated1,920-file baseline is excluded. Examples include root HTML/agency work, `add_photos.js`, `upgrade.js`, `shot.png`, `arena-v3-review.zip`, old `_patch_*`/`_write_*` scripts and pre-existing Android tooling. Preserve them; do not delete or blanket-stage them.

## Freeze conditions

1. Resolve the Live scroll-owner finding and review the World fallback read-status finding; retain this manifest as provenance, not a blind stage command.
2. Add every required production helper together with its importers; do not stage tracked files alone.
3. Rerun TypeScript/full/focused/render checks, repair the existing settlement-history harness, and perform the scoped native gates in the report.
4. Re-inventory and review the complete selected diff for dependencies, secrets and personal evidence. Separate source changes from any evidence-publication decision.
5. Only after separate authorization create a scoped freeze commit. **No staging or commit performed by Phase5A.**
