# Phase 4E.1 - World navigation and accessibility

27 October 2026. **PARTIAL native acceptance. Explore World country navigation and the bounded accessibility corrections PASS. The separate sidebar World missions map FAILS at native mount because the installed Android app lacks a Google Maps API key.** No overall World-complete or release-readiness claim.

Original checkout `C:\Users\91962\Desktop\Clash`, branch `arena-ui-review`, unchanged HEAD `9bad8b0b51ffd1bab5975ceb72f7c75a487d798f`. All work remains uncommitted. No push, merge or deployment.

## Baseline and actual execution

[Baseline](baseline.json) verified the existing Samsung A50 `SM-A505F`, scoped ADB target `RZ8M30DE9NL`, package `com.clash.v2.dev`, authenticated fictional A and the actual running Supabase client URL `http://127.0.0.1:55481`. QA system identifier is `7700622043081482277`; application/Storage/Auth/Realtime ledgers are 111/74/82/88, cron off with zero recorded runs. Metro remains the original PID10920 listening on `127.0.0.1:8081`. Environment and Metro configuration were not changed.

The device was opened through the normal Home dock Explore control, then the World mode rail. Live production props showed World activity `ready`, zero activity countries/challenges/treasures, and initially `allowFontScaling=false` on the empty copy. After editing, the same live production component reported scaling enabled and the 52dp rail inset. Actual native controls changed from 30/40dp to approximately 44dp and the enlarged copy wrapped clear of the rail. These changed runtime properties and native geometry prove execution of the correction, rather than merely host compilation. A later app reopen also executed the final implementation. No full cached-bundle byte-hash claim is made.

[Authenticated read results](authenticated-read-results.json) used the existing app session, without extracting tokens: `get_explore_world_summary` returned HTTP200 with zero countries/challenges/treasures. `get_explore_country(IN)` returned HTTP200, no Take rows and two canonical live-topic rows. Their titles happen to match retained fictional Take propositions; the observed LIVE labels therefore were not an incorrect conversion of Take rows. No data mapping or Live behavior was changed.

## Confirmed corrections

| Defect | Evidence and minimal correction |
|---|---|
| Successful-empty World copy ignores Android text scaling | Native before screenshots and live props confirmed suppression at both requested scales. `WorldExperience.tsx` now uses normal Text scaling, without a line clamp or fixed height |
| Enlarged empty text extends behind the floating mode rail | Initial 1.3x correction exposed overlap: text ended at x1017 while the resting rail begins around x902. Reused `worldPanelRailInset()` on the empty copy; accepted text ends at x881, with full wording visible |
| World mode/action targets too small | Actual Map/Globe targets were 79px high (~30dp); Search was105px (~40dp). World-only `visualChip` and `RoundControl` minimums are now44dp. Labels and the World heading/instruction use normal font scaling. Unrelated Explore filter-chip styling is unchanged |
| Country destination Back accessibility rectangle too small | Before `[21,115,116,209]`, about36dp. Existing hitSlop enlarged touch dispatch, but did not enlarge its accessible rectangle. Its own View geometry is now44x44dp; after `[21,115,137,230]`. Existing Back/fallback destinations and hitSlop preserved |
| Selected country labels suppress scaling | Enabled scaling for country-panel name, metadata, empty description and CTA, plus the country destination headline. CTA retains flexible minimum height, adds modest padding and shrinkable centered text so long country labels can wrap |

Only four production paths changed:

- `app/(tabs)/explore.tsx` - World heading/instruction, Map/Globe and Search/Teleport presentation.
- `app/explore/country/[code].tsx` - country headline scaling and Back geometry.
- `components/explore/WorldExperience.tsx` - successful-empty scaling and rail clearance.
- `components/explore/WorldCountryPanel.tsx` - selected-country typography and flexible CTA.

New `scripts/world-accessibility.test.cjs` has four production-component/callback regressions. No service, backend, permissions, navigation architecture, mission definition or global typography change.

## Native coverage

| Feature / scenario | Result | Actual scope |
|---|---|---|
| Home dock -> Explore -> World | PASS | Real native presses, no deep link used to substitute for entry |
| Country picker -> India -> country page -> Back -> Clear | PASS | Actual controls; Router confirmed `/explore/country/IN`, retained selection on return, then cleared |
| Enlarged United Kingdom selection and destination | PASS, 1.3x dark | Full name/action and wrapped description visible; actual route/open/Back/Clear. `w-13-uk-*` evidence |
| Tap Brazil on flat map | PASS | Tap derived from the measured native map rectangle and the production `projectMap` projection of the public catalogue centroid, not guessed screen coordinates. Actual selected code BR confirmed |
| Normal-scale Brazil destination/Back/Clear | PASS, dark and light | Final controlled matrix asserts exact `/explore/country/BR` and selection restoration; [results](normal-native-matrix.json) |
| Map/Globe toggle | PASS for visual-mode change | Native toggle rendered the existing globe and returned to map. Globe is intentionally passive; no invented pan/zoom or per-country globe actions |
| Surprise me | BLOCKED by available data | This action is not rendered for the actual successful zero-country summary. Its existing implementation selects only from returned activity countries; no synthetic country activity added |
| Teleport | PARTIAL | Native press showed TELEPORT LANDED with an existing server candidate. This is the existing read-only candidate RPC and local exclusion history. The reveal extends below the viewport and was not opened; no full-card or random-country navigation acceptance claimed |
| Successful empty vs error/loading | PASS native successful-empty; PASS automated separation | Actual summary HTTP200/ready/zero. Loading/error/unavailable/retry are covered with deferred test transport; no outage or permission failure was induced on device |
| Country page content | PASS for observed navigation/read | India returned two real topic rows. No new posts, missions, map pins, scores or fixtures invented |
| Vertical scrolling | LIMITED | Measured native ScrollView gesture attempted on quiet Brazil destination. This is not proof of populated mission/history scrolling or a map pan/zoom feature |
| Accessible country alternative | PASS for inspected controls | Search, labeled country-row buttons, Explore-country and Clear are exposed and usable through native controls. Full TalkBack focus traversal/activation was not enabled or tested |
| Sidebar World -> native missions map | FAIL / further testing BLOCKED | Actual sidebar entry reached the native map mount and terminated the app; see below |

### Theme and text-scale acceptance

| Accepted check | 1.0 dark | 1.0 light | 1.3 dark | 1.3 light |
|---|---|---|---|---|
| Empty copy readable, scaling enabled, outside resting rail | PASS | PASS | PASS | PASS |
| World Map/Globe and Search/Teleport targets and labels | PASS | PASS | PASS | PASS |
| Country selection -> destination -> Back -> Clear | PASS, Brazil | PASS, Brazil | PASS, United Kingdom | PASS, Brazil |
| Selected panel readable, controls above navigation | PASS | PASS | PASS | PASS |
| Country destination Back geometry/contrast | PASS | PASS | PASS | PASS |

Normal-scale acceptance uses final `w-normal-dark-*` / `w-normal-light-*` captures and [asserted matrix results](normal-native-matrix.json). Enlarged acceptance uses `w-13-rail-clear`, `w-13-uk-panel`, `w-13-uk-detail`, `w-13-light-brazil`, `w-13-light-destination` and `w-13-light-empty`. Long-country wrapping was specifically exercised in the 1.3x dark United Kingdom panel; not every country or arbitrary text scale was tested.

Native display1080x2340, density420 (~2.625px/dp), system navigation begins y2214. [Raw geometry summary](native-geometry-summary.json):

- Map/Globe before height79px, after115px (~44dp, pixel rounding).
- Search before105px, after115-116px (~44dp).
- Final normal Explore Brazil `[85,1607,838,1733]`, Clear Brazil `[743,1330,859,1445]`, Back `[21,115,137,230]`.
- Enlarged Explore United Kingdom `[85,1769,838,1895]`; corresponding Clear ends y1509. Targets remain above Android navigation and separate from the rail.
- Enlarged empty text after `[42,1382,881,1528]`; prior right edge1017. Its complete text remains visible without ellipsis.

These are actual accessibility button bounds, not smaller child Text glyph rectangles. They do not establish every offscreen control or full TalkBack ordering.

## Native limitations and failure evidence

**Separate `/world` missions map: confirmed installed-build blocker.** Actual Home -> menu -> World selection was attempted after the Explore checks. The process exited and the screenshot showed Android launcher. Sanitized Android crash-buffer evidence reports:

```text
java.lang.IllegalStateException: API key not found.
Check that <meta-data android:name="com.google.android.geo.API_KEY" .../>
is in the <application> element of AndroidManifest.xml
```

[Failure evidence](native-map-failure.json). This is distinct from the working SVG Explore World map. The existing app was reopened once against the same approved Metro/QA target; fictional A remained authenticated. No native configuration, API key, Maps provider, permission or installation was changed. A separately scoped native configuration/build correction and subsequent physical retest are required. No claim of mission-map gestures, recenter, privacy controls, Drop navigation or mission participation acceptance.

The existing mission RPC is functional: authenticated `world_active_missions` returned HTTP200 and the migration-defined `wm_best_200_meal` and `wm_goa_after_dark`. This API-only observation does not override the native map failure. No mission, Drop, photo, location permission or participation record was created.

**Existing font-change runtime limitation persists.** Changing font scale recreated the activity and returned to Home; A authentication/QA routing remained. Initial attempts immediately after recreation found no ready target and did not inject a guessed tap. Later, after returning to1.0, some native Text measurements still matched1.3 although live JS Dimensions reported1.0. Those first `w-10-*` and `*-fresh-*` attempts are superseded as normal-size acceptance. The app reopen after the map crash cleared the mismatch, and the final normal matrix independently retested both themes with native glyph bounds43px versus enlarged55px. No global Router, font or linking workaround added.

An initial normal-size picker attempt targeted United Kingdom while only India/Japan/South Korea were exposed above the keyboard; the allowlisted target lookup rejected it. Subsequent missing-target/map checks also made no input injection. These are incomplete automation attempts, not passed navigation evidence. The final bounded normal matrix used a visible map point, asserted each route and stopped on failure. No messages or other writes occurred.

Other untested scope: denied/network-failure native states, full TalkBack traversal, map multi-touch/zoom, every country name, populated mission scrolling, release-build behavior and arbitrary screen widths. Existing source still contains other static presentation labels with suppressed scaling outside this bounded correction; no blanket all-World typography-complete claim.

## Regression results

| Command | Actual result |
|---|---|
| `npx tsc --noEmit --incremental false` | PASS, exit0 |
| `npm test` | PASS806 +232 = **1,038**, no failed/skipped |
| `node --test scripts/world-accessibility.test.cjs scripts/explore-read-states.test.cjs` | PASS **12**, no failed/skipped |
| `npm run test:duel:render` | PASS **22/22**, exit0; existing pointerEvents deprecation warning |
| `git diff --check` via direct child-process exit status | PASS exit0; configured line-ending warnings only |

New tests execute production components and callbacks with mocked native/transport boundaries: successful-empty scaling/no line clamp/rail reservation; selected-country open versus clear; mode toggles and actual RoundControl presentation; country Back/fallback routing and headline scaling. Existing eight Explore read-state tests preserve independent feed/World/Live/Play states, retry and disposal behavior. No source-text assertions substitute for native geometry.

Initial pre-fix tests were red on empty scaling, country-panel scaling and Back geometry. The first mode-control test had a missing `interpolate` test-double implementation; that harness error was corrected before it could assess the production controls. All four final tests pass. Logs remain private/ignored under `.expo/ui-completion-phase4e-world/`; [hashes and counts](final-verification.json). Separately run suites overlap the full suite; no summed unique-test claim.

## Evidence and preservation

**44 unedited private ADB screenshots** remain under `.expo/ui-completion-phase4e-world/`, each1080x2340. [Filename/dimensions/hash manifest](screenshots.json). Selected before frames: `w-before-world.png`, `w-13-before.png`, `w-country-detail-before.png`. Accepted after frames are named in the matrix above. `w-mission-map-direct.png` is the Android launcher after the crash, not a World screen. Other transitional, modal, mixed-scale or wrongly named early frames are retained but excluded from acceptance. Status bars and launcher captures contain personal indicators; no images are staged, published or copied to external services.

[Final preservation verification](final-verification.json): every previously recorded Arena/Vault/DEV/Take source/test hash preserved; all1,920 original unrelated untracked file hashes, environment bytes,111 source/QA migration hashes, native development preferences, exact USB reverses8081/55481 and protected-resource metadata unchanged. QA managed ledgers, cron-off and system identity unchanged. Existing authorized Take fixtures remain four comments/zero reactions; no new accounts, content or application writes. No shared/hosted/E3.5.7 database connections.

Font scale restored to1.0, appearance to System, keyboard closed, fictional A authenticated and SDK still QA55481. The task-owned read-only inspector JAR was hash-verified and removed. No infrastructure, Metro or device-permission reconfiguration. No source changes after the passing suites. Current changes remain uncommitted; nothing staged.

**Next actions:** review these four UI diffs and focused tests; separately resolve the installed native Maps-key prerequisite before `/world` mission-map acceptance; investigate the already documented development font-change route/cache limitation in its own scope. Stop after Phase4E.1.
