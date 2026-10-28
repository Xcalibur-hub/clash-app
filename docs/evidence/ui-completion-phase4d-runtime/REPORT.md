# Phase 4D.2 — font-change route loss and development chrome

27 October 2026. **PARTIAL: DEV/Crowd obstruction fixed and physically verified. Font-change route retention remains FAIL / unresolved.** No speculative navigation persistence or native changes were made.

Original checkout `C:\Users\91962\Desktop\Clash`, branch `arena-ui-review`, unchanged HEAD `9bad8b0b51ffd1bab5975ceb72f7c75a487d798f`. All changes remain uncommitted.

## Font-change reproduction and bounded diagnosis

The initial ADB screenshot was black and the read-only inspector exited 137; no font change had occurred. Testing resumed after the owner confirmed CLASH was open and unlocked.

Actual retained collection: `/vault/collection/vc_954bfedaebd5b811`, opened through the creator's collection action. Changing system font scale from 1.0 to 1.3 returned to Home. A second measured sequence during restoration from 1.3 to 1.0 independently read the live Expo Router store before/after:

- Before: `/vault/collection/vc_954bfedaebd5b811`, segments `vault/collection/[collectionId]`.
- After: `/`, followed by the native Arena Home hierarchy. There was no test-issued navigation between the font change and this observation.
- Application PID remained `23429`. Android recorded `wm_relaunch_resume_activity` for `com.clash.v2.dev/.MainActivity` with configuration bit `40000000` (font scale). An unchanged ActivityRecord token is not evidence that its Activity instance survived a relaunch.
- Exactly **one new** “Looks like you have configured linking in multiple places” warning appeared in the existing Metro log during the measured sequence. Settled React renderer inspection showed one mounted app root; a persistent second root was not demonstrated.

See [live route proof](font-runtime-proof.json), [initial reproduction](font-reproduction.json) and [sanitized lifecycle diagnostics](runtime-diagnostics.json). Only route/root metadata and allowlisted warning counts were recorded; no tokens or arbitrary log payloads.

Confirmed failure boundary: an Android configuration relaunch reinitializes the development application's Router at the root instead of restoring the detail route. Authentication survives. The relaunch is expected Android lifecycle behavior; losing the user's in-app route is the unwanted result.

Source inspection found one Expo Router entry (`expo-router/entry`) and no application-owned second NavigationContainer/custom URL listener. The installed Router's `build/fork/useLinking.native.js:60–92` warns when another enabled linking hook registers before the previous hook unregisters; the warning alone does not prove duplicate handwritten linking configuration. Router initialization derives state from the initial URL (`build/link/linking.js`, `build/global-state/router-store.js`), rather than an application route-restoration contract.

The repository native template omits `fontScale` from `android:configChanges` (`android/app/src/main/AndroidManifest.xml:27`) and uses `super.onCreate(null)` (`MainActivity.kt:19`). This is relevant lifecycle context, not proof that changing either line alone safely repairs this installed development client. Its native binary was not rebuilt or equated with current native source. The exact SDK/native teardown owner causing the transient duplicate-hook registration remains unproven.

**No route fix was applied.** Adding global route persistence, overriding Expo Router linking or patching vendor lifecycle code would be speculative here. Release-build behavior was not tested, so this is not claimed to be exclusively a development-client defect. A separate bounded native lifecycle investigation, with explicit rebuild authorization if needed, is required before route-retention acceptance. Manual reopening of retained routes during QA is not counted as automatic restoration.

## Confirmed badge fix

The obstructing control was **DuelDevPanel's DEV toggle**, positioned absolutely at `left: space.sm, bottom: 88` over the collapsed Crowd. The separate LocalSupabaseBadge is already an 8dp noninteractive gutter dot with accessibility descendants hidden; it was not changed.

Scoped application changes:

1. `components/liveArena/DuelRoomExperience.tsx`: moves the sole DuelDevPanel instance into the existing ClashMoreSheet, reached through “More Clash options”. All previous Crowd, inset, draft and enlarged-text corrections remain intact.
2. `components/liveArena/DuelDevPanel.tsx`: removes absolute positioning and stacking; keeps the collapsible diagnostics in normal sheet flow; adds minimum 44×44dp toggle geometry and expanded accessibility state. Its existing `__DEV__` guard remains.
3. `components/liveArena/ClashMoreSheet.tsx`: accepts the diagnostics child. During native testing, its existing Close row ended at y2276 inside Android navigation, which starts at y2214. A **development-only** bottom inset now moves Close above navigation. Release spacing remains the original `space.xl`; release diagnostics still render null.

Native after: Close `[43,2046,1037,2183]`; final diagnostic toggle `[85,1930,201,2045]`, approximately 44dp square. Closed menu exposes no DEV node over Crowd. The LOCAL gutter dot remains separate from the heading and controls. No new permanent toolbar or floating decoration.

## Physical acceptance

Device: authorized Samsung A50 `SM-A505F`, serial `RZ8M30DE9NL`, existing development package `com.clash.v2.dev`, version 2.0.0. Tested retained Room `/arena/room/ar_8d837deeb59e3ace` and the collection above. The Room is naturally closed for writes/awaiting settlement; no phase, timestamp, verdict or fixture was changed.

| Native check | 1.0 dark | 1.0 light | 1.3 dark | 1.3 light |
|---|---|---|---|---|
| DEV absent from Room content; Crowd/Expand unobstructed | PASS | PASS | PASS | PASS |
| Expand → Focus Stage → collapsed | PASS | PASS | PASS | PASS |
| Diagnostics accessible through More; expand/collapse; safe Close | PASS | PASS | PASS | PASS |
| Arena Back and retained collection entry/detail/Back | PASS | PASS | PASS | PASS |
| Live Router confirms exact Room and collection IDs | PASS | PASS | PASS | PASS |
| Fictional A remains authenticated; actual SDK targets QA55481 | PASS | PASS | PASS | PASS |
| Font change automatically retains current detail route | FAIL | Not a separate theme-specific test | FAIL | Not a separate theme-specific test |

[Native measurements and live runtime metadata](native-acceptance.json) include reported font scales 1/1.3, Crowd heading/Expand bounds, menu bounds and Back destinations. Expand consistently ends at y2213, above Android navigation at y2214. This is not fresh OPEN-duel, posting, assist delivery or keyboard acceptance; those actions were not exercised on the expired retained fixture. TalkBack traversal and release-device behavior remain untested.

The final release-spacing guard was added after the four-case matrix. It does not change development geometry. One existing-app-only relaunch delivered the final full bundle, followed by a final physical More/Close check with the same safe bounds. A transient inspector exit immediately after that launch was not treated as a blank-screen pass; subsequent Router reads and native menu inspection succeeded. Metro was never restarted.

Final phone-cached bundle SHA-256: `1c4f657992b81919ba9f8e9f5ab632442e3f1c7dd6570b0087bbc5931c45dc1c`, 23,784,819 bytes, final `bottomPadding` implementation present, QA55481 and matching QA anon key, server credentials absent. [Bundle evidence](final-phone-bundle.json). Final live SDK URL, fictional A identity boolean, font and appearance were checked without exposing credentials.

## Private screenshots

Real unedited ADB captures remain ignored under `.expo/ui-completion-phase4d2/`; native resolution 1080×2340. [Filename/hash manifest](screenshots.json). No PNG is staged or published.

- Before obstruction: existing `.expo/ui-completion-phase4c/c4-10-dark-top.png` visibly shows DEV covering the Crowd heading.
- Route-loss sequence: `r2-route-proof-before.png`, `r2-route-proof-after.png`.
- After Room: `r2-13-light-room.png`, plus final `r2-final-settled-room.png`.
- Expanded Crowd / collection: `r2-{10,13}-{dark,light}-expanded.png` and corresponding `-collection.png`.
- Final menu geometry: `r2-final-verified-menu.json` and private corresponding PNG.

Some captures contain notification banners, including `r2-10-dark-room.png` and `r2-13-light-diagnostics.png`; they are private, excluded from clean whole-screen evidence and must not be published. The initial black capture and initial loading-frame `r2-final-verified-room.png` are also not successful visual evidence. Allowlisted hierarchy JSON excludes notification content. No notification settings or permissions were changed.

## Regression results

| Final command | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | PASS, exit 0 |
| `npm test` | PASS: 806 + 232 = **1,038**, zero failed/skipped |
| Runtime chrome + Vault navigation + preserved Crowd focus/Room text suites | PASS: **15**, zero failed/skipped |
| Crowd / Crowd presentation / immersive UI suites | PASS: **37**, zero failed/skipped |
| `npm run test:duel` | PASS: **29** |
| `npm run test:duel:render` | PASS: **22/22** controlled scenarios |
| `git diff --check` | PASS; configured line-ending conversion warnings only |

New `scripts/arena-runtime-chrome.test.cjs` has five production-component tests: local diagnostic expansion/geometry; release suppression; overflow child/Close behavior; unchanged release spacing; actual Room callback opening the sheet containing its sole diagnostic instance. React hooks and callbacks execute with mocked native/service boundaries. No source-text assertions substitute for native geometry. A pre-guard release-spacing check failed (40 versus original 32 in the harness); the final development-only guard corrected it. No unit test claims the unresolved route reset is fixed. Separate suites overlap the full suite and are not additional unique native/security assertions.

Raw final outputs remain `.expo/ui-completion-phase4d2/{typecheck,npm-test,focused,crowd,duel,render}.log`. [Final counts and preservation](final-verification.json).

## Preservation and handoff

All previous Arena/Vault edits and focused tests were preserved; the prior DuelRoomExperience bytes are recoverable exactly by reversing only this task's panel relocation. All 1,920 originally recorded unrelated untracked files, environment bytes, native development preferences, 111 source/copied migration hashes and protected-resource metadata were verified unchanged.

QA project `clash-ui-qa-phase4a`, system identifier `7700622043081482277`; ledgers 111/74/82/88; cron off, zero recorded runs. Retained counts remain Crowd 2, assists 2, official messages 3, collection episodes 0. No new account, fixture or application mutation. No shared/hosted/E3.5.7 database connections.

Metro remains PID10920 on loopback8081. Original USB reverses8081/55481, font1.0 and System appearance restored; authenticated fictional A remains. Task-owned diagnostic JAR hash-verified and removed. No native rebuild, application-data reset, commit, push, merge or deployment.

**Handoff:** badge correction ready for review; font-change route retention is still a blocker for that specific acceptance criterion. Stop after Phase4D.2.
