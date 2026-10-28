# Phase 5A - consolidated UI acceptance and release blockers

27 October 2026, Asia/Calcutta. **NO-GO for a public/shared production release of the advertised full CLASH 2.0 feature set. GO for a bounded UI correction and acceptance pass.** This review neither deploys nor authorizes deployment.

The local UI is materially implemented, with real Samsung evidence for text discussion, Crowd/private text assists, country navigation, Play joining and free image reading. It is not uniformly accepted: final integration has a new Live list ownership defect, release-mode/native lifecycle checks remain open, and several essential mutation/security outcomes have never been exercised physically.

## Review boundary and Git inventory

Original checkout `C:\Users\91962\Desktop\Clash`; branch `arena-ui-review`; verified HEAD **`cbe216a3c212a83c432f71b37b59a1debe5caa63`**. No staging, commits, stash, reset, cleanup, push, merge, database/device operations, Metro changes or native build. Existing native reports are historical evidence, not a new device run. Tests use the **current working tree**, not HEAD alone.

| Inventory at review entry | Result |
|---|---|
| Tracked modifications | **27**: 26 app/source/config/test paths plus the tracked Phase4F report |
| Staged paths | **0** |
| Untracked files | **2,293** |
| Original unrelated untracked baseline | **1,920**, every recorded content hash still matches |
| Additions beyond that baseline | **10 UI source/test files**, plus **363 evidence files** (354 JSON, 9 Markdown) |
| New evidence binaries | None among those363 files; private PNGs remain ignored under `.expo` |
| Credential pattern scan of363 evidence files | No literal three-part JWT/private-key pattern hits; this limited scan is not a comprehensive secret/privacy audit |
| Cached upstream | `origin/arena-ui-review` at `0cd6c36aa4831cda115c293b74ba2bf98c6d22df`; **0 behind / 8 ahead** relative to that local cached ref |
| Actual current GitHub head | Not queried; no claim the cached ref proves the remote has not advanced |

The eight local commits relative to the cached upstream are `d51467c`, `ab59990`, `d8d5e75`, `d5268cc`, `6d67714`, `9bad8b0`, `6ca9222`, `cbe216a`. Relevant recent checkpoints:

- `9bad8b0`: committed Explore failed-read versus successful-empty correction.
- `6ca9222`: committed Android World MapView gate and honest list fallback.
- `cbe216a`: committed Play challenge Back accessibility/empty-discovery tests.
- Earlier `d5268cc`/`6d67714`: committed Settings/Vault availability/accessibility work; `d8d5e75`: Meet UI freeze. These are context, not fresh native acceptance.

The accepted Arena/Crowd, Take, collection-entry, World text and final Vault header/Groups fixes are still partly outside Git. **A clean checkout of HEAD does not contain all accepted UI.** In particular, tracked edits import the untracked production files `ArenaRoomText.tsx` and `publicMediaImageSource.ts`; excluding them from a later scoped commit would break that commit. See [precise change manifest](UI_CHANGE_MANIFEST.md). Do not stage all2,293 untracked files.

Unrelated examples preserved: `index.html`, `qwen.html`, `sybil.html`, `Al_Wafi_Final_Recommendations.html`, `add_photos.js`, `upgrade.js`, `arena-v3-review.zip`, `shot.png`, temporary files and pre-existing patch scripts. They are not UI release inputs. The363 evidence additions require a separate publication/privacy decision; they are not automatically part of a source commit.

Automatic approval review rejected an auxiliary inventory helper because it would write an extra snapshot. It was not executed. Inventory was completed with read-only Git/filesystem commands; only these two requested deliverables were subsequently written. An ignored, unexecuted helper `.expo/phase5a-review/inventory.cjs` remains task-local and is excluded from the source manifest.

## Consolidated native acceptance matrix

PASS below means the stated bounded behavior has actual phone evidence. PARTIAL is not an overall feature pass. Automated/API-only evidence is identified explicitly.

| Feature | Classification | Physically validated behavior and remaining boundary |
|---|---|---|
| Onboarding, fictional login, session restoration | PASS, QA only | Phase4C normal sign-in, interests and cold relaunch. No production Auth/OAuth or real-account acceptance |
| Home / Fresh Takes | PARTIAL | Populated QA feed displayed; Following/Popular/New navigation exercised. Ranking, long pagination, refresh races and release performance not fully accepted |
| Take detail / nested discussion reads | PASS | Actual retained Take, full content, expanded parent/child conversation and Back |
| Take author/profile navigation | PASS, bounded | Phase4D.3 corrected real author callback; own-author profile and Back. Other public-profile combinations not exhaustively tested |
| Take reactions | PARTIAL | Phase4D.3B four successful native toggle RPCs, count sequence0->1->0->1->0, restored original state. Two rapid input taps produced one RPC; this does not prove both reached JS during an in-flight request. Native rollback/lost-response/expiry transition not exercised |
| Root and nested reply publication | PASS, bounded | Exactly one root `c_6355ae7180b2633c` and child `c_841235572dd0b8c3`, correct A identity, parent/depth and API persistence; normal re-entry rendered them. Rejected-send recovery not accepted physically |
| Archived/expired Take interaction boundaries | BLOCKED for native write-denial acceptance | UI/server guards inspected and tested automatically; authorized native Take was active. No forbidden expired write was performed |
| Arena Live discovery / Watch | PARTIAL | Phase4C real canonical fighters/phase and Watch entered Room. Latest Groups container change affects Live scroll ownership; no post-change populated Live regression evidence |
| Canonical Stage and role presentation | PARTIAL | Fighter A, official arguments, OPEN/FINAL/JUDGING; B/C native role/account matrix missing |
| Crowd text delivery and composer | PASS, bounded | Actual C messages rendered on A50; SDK received exact INSERT, native reconciliation transport not inferred solely from screenshot. Dark/light IME, long draft, two-message gesture, mounted fighter draft and Focus Stage tested |
| Private text assists | PARTIAL | Native A received, accepted then explicitly published one assist once, and rejected another. B/C denial/isolation passed API/SDK checks, not native account switching. No media-assist acceptance; no dedicated assist WebSocket exists |
| JUDGING safe area / enlarged Stage / transcript and pending result sheet | PASS, bounded | Phase4C.3/4C.4 corrected overlap and1.3x clipping in both themes; transcript and settlement-pending result controls opened. This is not a settled verdict |
| Actual settlement, winner/draw/cancel/reward and release verdict navigation | BLOCKED | No completed authoritative native settlement lifecycle in these phases; cron deliberately off and retained timed duel closed. Controlled render/service tests are insufficient |
| Arena Discover constellation | PARTIAL | Real native surface observed; graph actions/ranking and latest scroll-parent integration not fully accepted |
| Groups discovery -> card -> detail -> Back/re-entry | PASS, dark bounded | Phase4H real QA Repair Circle; card/header/Android Back and Joined status. New outer-scroll behavior still needs integrated Live/Discover coverage |
| Groups membership state | PASS display only | A owner/Joined shown; no join/leave/follow mutation pass |
| Groups Members tab | PASS, bounded native read/navigation | Later Phase4H.2 verified About ? Members, two authorized fictional members, Back and re-entry. Prior4H.1 failure was stale inspection/off-target taps. Membership mutations remain NOT TESTED |
| Groups join/leave/create/invite/moderation | NOT TESTED natively | Services/UI exist for some operations; authorization and create route presence are not acceptance. Channels/discussions/pins/crew-to-duel association unsupported |
| Explore For You / Live | PARTIAL | Populated native views/navigation in4C; failed-read separation in3D and controlled tests. No exhaustive native denied/error/retry matrix |
| Explore country map / picker / destination / Clear | PASS, bounded | Phase4E.1 normal and1.3x dark/light, India/United Kingdom/Brazil, measured map point, actual routes/Back and label geometry |
| Explore globe / Surprise / Teleport | PARTIAL | Map/globe toggle worked; globe intentionally passive. Surprise unavailable with zero activity-country pool. Teleport revealed a server candidate; no full destination acceptance |
| Sidebar World missions list fallback | PARTIAL | Later4E.2 supersedes4E.1 crash for default config: same PID, banner, mission entry, Back and QA session. New controlled probe finds false-empty mission copy while loading |
| Android native street map / recenter / markers / pan/zoom | BLOCKED | Installed APK lacks Maps metadata. JS opt-in is not binary verification; no Maps-configured build accepted |
| Play discovery/detail/Back | PASS, bounded | Phase4F.2 populated real challenge, title/host/window and repeat entry; minimum44dp Back |
| Play joining | PASS, bounded | One native Join by A, joined UI plus real participant persistence/authenticated reads |
| Play photo/video submission, entry reactions and completed results | NOT TESTED | No media selected/submitted, no result flow. Treasure flows likewise not accepted |
| Vault creator / collection entry | PASS | Independent collection action preserves episode-to-Drop action; empty collection and Back accepted both themes/1.3x |
| Populated collection / free image Drop reader | PASS, bounded historical | Phase4G.2 actual synthetic PNG visible, free/no-subscription read, collection/poster/reader/Back/re-entry. Final4H origin restriction has automated coverage but no new complete native matrix |
| Vault locked/private/subscriber/paid/course/service/product delivery | BLOCKED for native functional acceptance | UI availability/disabled states implemented and controlled-tested. No native entitlement, purchase, private media, course progress or service delivery acceptance |
| Vault wins / profile history | NOT TESTED for populated native history | `VaultWins` uses authorized return-visit data, not hardcoded zero. No real settled fixture accepted in this run |
| People search -> B creator/Vault | PASS, bounded | Actual4G path; global search modes/filter/error behavior not comprehensively accepted |
| Profile / Settings / Appearance / Back | PARTIAL | Real profile identity, appearance changes and many Back paths accepted. Account editing/destructive actions and broad navigation stack coverage absent |
| Font-change route restoration | FAIL | Detail -> system font change -> Home; duplicate-linking warning, authentication survived. Release-build behavior unverified |
| Full TalkBack/reduced-motion/device-width acceptance | NOT TESTED comprehensively | Some measured labels/targets,1.3x and reduced-motion controlled tests. No full focus traversal or release/device matrix |

Evidence precedence: [4C delivery and C3/C4 updates](../ui-completion-phase4c-device/REPORT.md), [4D.1](../ui-completion-phase4d-vault/REPORT.md), [4D.2](../ui-completion-phase4d-runtime/REPORT.md), [4D.3B continuation](../ui-completion-phase4d-takes/REPORT.md), [4E.1](../ui-completion-phase4e-world/REPORT.md), [later World fallback](../ui-completion-phase4e-missions-map/REPORT.md), [4F.2](../ui-completion-phase4f-play/REPORT.md), [4G.2](../ui-completion-phase4g-vault/REPORT.md), [4H](../ui-completion-phase4h-groups/REPORT.md), [later4H.2 Members closeout](../ui-completion-phase4h-groups/PHASE_4H2.md). Earlier BLOCKED rows are superseded only by explicitly exercised later scenarios.

## Ranked blockers and review findings

### P0 - release gates, not newly demonstrated exploits

1. **Production environment/artifact identity is unaccepted.** QA55481/native development builds and cron-off are deliberate test configuration, not a launch target. No release artifact, production anon-key/URL pairing, APK metadata, release-only permissions, RLS/runtime or operational maintenance acceptance was performed here. Before any release, separately verify the target/bundle contains the intended public configuration, no service-role credentials, no QA/fixture/DPAPI material, and no shared55321 fallback. Keep the current QA setup unchanged. This is a missing release gate, not a discovered credential leak.
2. **Meet policy/compatibility blockers remain if Meet is exposed.** [E3.8.1](../explore-e381/REPORT.md) documents missing approved retention/legal-hold mechanisms and evidence-loss boundaries; [E3.8.3](../explore-e383/REPORT.md) is an unimplemented admission-gate design. No later Step4 UI change touches those contracts. Owner/legal decisions and implementation/acceptance remain prerequisites for public Meet. UI hiding alone does not restrict existing RPCs. Video/TURN remains separately unaccepted. No legal retention period is adopted by this review.
3. **Conditional native crash risk if Maps is enabled incorrectly.** The default gate prevents the known missing-key crash. `worldNativeMapAvailability.ts:16-18` trusts a JS flag; setting it true without a compatible installed APK again mounts MapView. Keep it false unless manifest/provider verification and a separately authorized build/device pass succeed. This is not a current default-path crash.

No new confirmed credential disclosure, authorization bypass or data loss was established by the scoped review. Automated tests and the absence of pattern-scan hits are not a security sign-off.

### P1 - integration and core-flow acceptance

1. **New confirmed structural regression: Live FlatList nested inside a plain vertical ScrollView.** `app/(tabs)/index.tsx:355-366,531-543` now wraps `clashes`, `community` and `topics` alike. `ArenaClashes.tsx:81-88` returns its own vertical FlatList, refresh and onEndReached handlers. Switching from the original Live View to ScrollView creates the same-axis nesting warned against by the installed RN VirtualizedList (`node_modules/@react-native/virtualized-lists/Lists/VirtualizedList.js:1152-1167`). Windowing/scroll ownership is compromised; pagination/pull-to-refresh performance is at risk. The parent-child structure is proven; a specific dropped-row/device failure was **not** reproduced here. Minimal correction: preserve the bounded flex View for Live and apply the new plain ScrollView only to nonvirtualized Groups/Discover; add an integrated parent/child ownership test and populated native Live recheck. Current `arenaHomePresentation.test.ts` only regex-checks the combined condition and therefore blesses the regression.
2. **Confirmed font-change route reset, unresolved.** [4D.2 route proof](../ui-completion-phase4d-runtime/font-runtime-proof.json): collection route -> `/` after Android configuration recreation, with duplicate-linking warning. Do not assume the warning proves duplicate application NavigationContainers; source showed one Router entry. Minimal next step is an authorized release-mode lifecycle reproduction, then a narrowly justified native/router correction. Include unsent-draft outcomes; no data-loss claim is inferred from navigation alone.
3. **Core Clash conclusion not accepted.** Actual settlement/winner/result/reward and role-specific native boundaries need an authoritative eligible lifecycle test. The expired fixture cannot be reopened or timestamps changed. No production-like release should advertise a completed competitive loop based only on settlement-pending UI and mocked results.
4. **Incomplete essential mutation paths.** Play submit/storage/result, Vault restricted delivery and Groups membership mutations remain unverified. Ship only the narrower accepted scope, or obtain separate bounded acceptance authorization. Later Phase4H.2 closes Members-tab read/navigation acceptance only; it does not close membership mutation acceptance.
5. **Freeze/reproducibility gap.** The source/test manifest contains36 pending files. Review and include essential untracked production dependencies before a later owner-approved scoped commit; do not build a purported accepted release from HEAD alone.

### P2 - confirmed presentation/test defects and acceptance debt

1. **World fallback falsely claims no active mission during loading.** `components/world/WorldMapUnavailable.tsx:40,61-64` checks `primary`, not loading status, before rendering empty mission text. A file-free probe mounted this **production component** with `loading:true, missions:[]` and produced `No active Mission this week.` with the spinner. Error paths in `app/world/index.tsx:171-186,210-227` dispatch notices but pass no mission read/error status to the fallback, so failed reads can also look empty. Minimal correction: explicit per-read status, successful-empty-only copy and local retry, with pending/error/independent-results tests. No native outage was induced; the loading contradiction is independently reproduced with controlled rendering.
2. **Existing settlement-history harness failure.** `scripts/settlement-history-check.cjs:12-15,54-56` manually invokes the production hook but inherits the real `useSyncExternalStore`; the current hook calls it at `hooks/useLiveArenaRoom.ts:129`. After9 service checks the suite aborts with invalid-hook-call/null dispatcher. Both files are unchanged at HEAD (last relevant commits `14f674a`/`6b5d6d1`), so this is an existing stale harness, not evidence of an application hook misuse introduced by these UI changes. Use a mounted React harness before relying on its historical-read assertions. Do not weaken production code or mock the assertion away.
3. **Accessibility breadth remains partial.** Latest Groups light/1.3x breadth, populated Vault light/1.3x after final media hardening, full TalkBack order, reduced-motion native behavior and release overflow-sheet safe areas are not accepted. `ClashMoreSheet.tsx:31-33` deliberately applies the added bottom inset only in development; controlled tests preserve release spacing but cannot prove release geometry.
4. **Media coverage/claim boundaries.** `publicMediaImageSource.ts:29-59` correctly requires exact configured origin, rejects user-info URLs and restricts public Storage paths before attaching **the supplied anon key**. Foreign/Tenor/signed paths receive no added headers. This does not grant private-bucket access. Current call sites import the helper; no session/service-role source was found. The final test named “never embeds a service-role or session-shaped secret” only checks a supplied fake anon value and header names; it does not validate arbitrary key privilege. Configuration remains a release gate. Redirect/header forwarding and non-image playback are untested. `MediaViewer.tsx:75-80` still gives video a URI directly; the PNG fix is not proof of QA video delivery.
5. **Evidence/test maintenance.** Mixed-case source-contract assertions, custom hook doubles and production-mounted tests provide different confidence. Several new UI suites are run only by explicit commands, not `npm test`; no new integrated Arena outer-scroll test exists. Reports4G/4H contain limited light-mode attempts (`cmd uimode` did not change in-app preference); those are not theme passes. Older transient/wrong-screen frames must remain excluded.

### DEFERRED - scope decisions

Crew discussions/channels/pins, crew-linked duel invites, full-text Groups search, missing invite/moderator consoles, unsupported commerce acquisition, payments/rewards, native street-map enablement, video Meet/WebRTC/TURN and other unaccepted media workflows. Defer explicitly rather than expose enabled no-op controls or manufacture data/contracts. Existing backend RPC presence alone does not make a complete product feature.

## Fixture validity and environment boundaries

This phase made **no backend or phone calls** and created no fixtures. Current server validity was not rechecked.

| Retained evidence fixture | Recorded validity / future acceptance boundary |
|---|---|
| Room `ar_8d837deeb59e3ace`, Clash `cl_4e59c3897392b820` | Recorded close `2026-10-27T02:22:56.267187Z` (07:52:56 IST); already naturally JUDGING in C3/C4. Not eligible for assumed new live writes |
| Take `take_15ae4959a6b2a21e` | Recorded expiry `2026-10-27T16:16:58.252956Z` (21:46:58 IST); recheck server window before any later mutation, even on the same date |
| Play `ec_9d69882d0dc1eb53` | Recorded end `2026-11-03T09:20:15.574Z`; A joined once. Future state must be read, not inferred from this report |
| Vault Drop `vd_1a4dd9af3f6980b2`, media `m_b46a151103fead7ac59aa114` | Recorded expiry `2026-11-03T10:27:39.064245Z`; synthetic PNG, free. Retain until separately authorized cleanup |
| Collection `vc_954bfedaebd5b811`, Crew `ac_08433d0e2f9693fd` | Existing canonical IDs; membership/content may change independently. No cleanup here |

QA isolation/session-key separation exists in `services/supabaseClient.ts` and `utils/supabaseEnv.ts`; it is not proof of a production artifact's configuration. The UI source does not hardcode QA55481 as a release destination. Tests/logged QA origin strings are not deployment instructions. No shared/hosted/E3.5.7 access, scheduler change or migration execution occurred. Private credentials, native screenshots and raw device logs remain excluded from the source manifest.

## Recommended first release

These are proposed capabilities **after the applicable release gates**, not permission to ship now.

| Treatment | Narrow proposed scope |
|---|---|
| Ship normally after regression/release verification | Home/Fresh Takes read/navigation, supported text discussions, author routing, search/identity, Settings/Appearance, creator/collection/free-image reading |
| Ship with explicit limitations | Feed relevance is bounded, not exhaustive personalization; Groups discovery/About/Members read navigation and membership status only; SVG country exploration; honest World missions/recent-list fallback without street-map controls; free Vault reading without unsupported acquisition |
| Keep hidden/disabled until functional acceptance | Play media submission/results if not tested; private/paid/subscriber/course/service delivery without native access tests; unaccepted membership mutations/console controls; street-map flag on unverified APKs |
| Core feature cannot be advertised complete yet | Live challenge -> duel -> authoritative settlement/result/reward. Enable only after role/realtime/lifecycle/result acceptance and list-parent correction |
| Defer or gate at the server as well as UI where needed | Meet public admission pending policy/compatibility gates; video/media infrastructure; unsupported Groups social contracts; payment/monetization. Hiding navigation is not an authorization boundary |

If competitive Live is excluded, describe the first release as a narrower discussion/read beta rather than the full CLASH competitive MVP. The owner must choose that product trade-off explicitly.

## Remaining tasks in dependency order

1. Review this report and the36-file candidate manifest; preserve evidence and select first-release capabilities. Do not bundle unrelated files or private evidence.
2. Correct Live's outer scroll ownership; add production-composition coverage. Correct fallback loading/error/empty/retry presentation. Repair the stale settlement-history test harness. Rerun current checks; no new infrastructure needed.
3. Preserve the later Phase4H.2 Members read/navigation PASS; verify changed Live/Groups/Discover composition on A50. Recheck final trusted-origin PNG path, Free/locked boundaries, Back/keyboard and appropriate dark/light/1.3x states without claiming unavailable scenarios.
4. Plan a separately authorized release-mode Android artifact/lifecycle test: safe target identity, no QA secrets/fixtures, verified Maps opt-in state, font recreation/route/draft restoration and release safe areas. Do not rebuild or repoint the present environment as part of this review.
5. For capabilities kept in scope, obtain narrowly bounded acceptance authorization: an eligible canonical duel through real settlement/roles/result; Play upload/submission; restricted Vault media/access; Groups membership. Read existing fixture phase before any write; never silently replace expired records.
6. Resolve owner/operational release gates separately: Meet policy/compatibility or enforceable feature disablement, release-target Auth/Realtime/Storage/permissions, maintenance/settlement scheduling and monitoring. QA cron-off must remain untouched here; UI work does not certify production operations.
7. Close native failures or explicitly remove the affected capabilities from the release contract; repeat integrated release-candidate acceptance. Then request a separately approved scoped freeze/commit using the manifest, including untracked dependencies/tests. No such commit is made now.

## Quality gates executed now

| Check | Result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS exit0 |
| `npm test` | PASS **816 +234 =1,050**, zero failures/skips |
| Focused Take/Vault/Crowd/Room/World/Groups suites | PASS **66**, zero failures/skips |
| `npm run test:duel` | PASS **29** |
| `npm run test:duel:render` | PASS **22/22**, controlled bridges only |
| `node scripts/world-discovery-runtime-check.cjs` | PASS **36/36**, controlled production screen/hook bridge |
| World consent / empty / pan / request-order scripts | PASS **8 /13 /8 /21** source-contract checks |
| `node scripts/official-service-check.cjs` | PASS **14/14**, transport/storage doubles |
| `node scripts/settlement-history-check.cjs` | **FAIL exit1**, nine service assertions passed before invalid hook call; historical hook portion not executed |
| Read-only production fallback probe | Reproduced false-empty mission copy with `loading:true`; no test file/source changed |
| `git diff --check` | PASS exit0; configured LF/CRLF warnings only |

Focused suites overlap `npm test`; totals are not summed into unique tests or native coverage. The66 command covered Take route/profile/reaction/challenge, collection navigation, Crowd focus, runtime chrome, Room text, World accessibility and GroupDiscovery. Source-contract counts are not asynchronous/native proof.

No newly introduced failure appeared in the requested TypeScript/full-unit/render checks. The additional stale harness failure and the two code findings remain actionable. No failed test was weakened, no defect fixed in this review. Final handoff: same HEAD/branch, same27 tracked modifications, zero staged paths,2,295 untracked files (the original2,293 plus these two reports), and all1,920 original baseline hashes unchanged. No diff in Supabase files, Android/native configuration, Metro configuration, Supabase client or the production Room hook. Existing QA/Metro/device state was not operated on. Line-ending warnings alone are not whitespace failures.

**Decision:** NO-GO for full public release; conditional GO to continue bounded local UI fixes/testing. No native acceptance, production security or deployment PASS is inferred from the green suites. STOP after this report and manifest.
