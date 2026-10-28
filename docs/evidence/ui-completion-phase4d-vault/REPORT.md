# Phase 4D.1 — Vault collection navigation

27 October 2026. **Scoped fix implemented; real collection-entry navigation PASS on Samsung A50.** Changes remain uncommitted. This is not acceptance of populated episodes, paid access or all Vault experiences.

## Baseline and scope

Original checkout: `C:\Users\91962\Desktop\Clash`; branch `arena-ui-review`; unchanged HEAD `9bad8b0b51ffd1bab5975ceb72f7c75a487d798f`.

Only these application files changed in this phase:

- `components/vault/world/WorldChapter.tsx`: forwards the existing `onOpenCollection` callback to the collections composition.
- `components/vault/world/SeriesComposition.tsx`: makes the collection heading a separate Pressable with button role, explicit label/hint and minimum 44dp height. Heading text supports font scaling and unrestricted wrapping. Episode posters remain siblings with the original Drop callback.

Added `scripts/vault-collection-navigation.test.cjs`. No changes to VaultScreen, the collection route, services, entitlements or backend contracts were necessary. Existing six modified Arena files and their three untracked source/test files were hash-checked and preserved.

## Root cause and correction

`VaultScreen` already supplies `router.push('/vault/collection/' + id)`. WorldChapter declared that callback but never forwarded it. SeriesComposition exposed only plain heading text and poster-to-Drop actions. An empty collection therefore had no navigation target.

Before the fix, native `QA Field Notes` was nonclickable at `[42,1747,1038,1818]`. The new independent heading action invokes the collection ID, while each poster retains its Drop ID and callback. There are no nested collection/poster press targets.

The production-component regression was RED before the fix: 1 failed (`empty collections need an actionable entry`), 1 passed (existing poster behavior). It now passes, together with a production CollectionWorld failure → retry → successful-empty test. These tests execute production callbacks/components with mocked native/service boundaries; they do not claim native geometry or real network-failure acceptance.

## Device, backend and bundle

Samsung `SM-A505F`, serial `RZ8M30DE9NL`, existing package `com.clash.v2.dev`. No reinstall, rebuild, account switch or app-data clearing.

Verified QA gateway `127.0.0.1:55481`, project `clash-ui-qa-phase4a`, cluster system identifier `7700622043081482277`; application ledger 111, Storage 74, Auth 82, Realtime 88; cron off and zero recorded job runs. All 111 source/copied migration hashes match. No fixtures were created or changed.

Existing Metro PID `10920` remained the single loopback 8081 listener. The actual device-cached Android development bundle contains the new collection action/callback, QA gateway and matching QA anon key, and no QA service-role key. SHA-256: `863b5fa46e3606ff8ae6c579e94af1f805d35a97b670c5ba0805501b98feb09c`. See [bundle evidence](delivered-bundle.json). Existing app-only launches were used; Metro and application environment were not reconfigured.

Existing fictional creator: `u_d2af864cce5b4e72a9ff5ff56586f522` (QA Mira). Existing collection: **`vc_954bfedaebd5b811`**, QA Field Notes; zero episode rows verified read-only. Expected dedicated destination: `/vault/collection/vc_954bfedaebd5b811`. The collection was reached by tapping its actual creator-page heading, never by collection deep link. ID verification combines the production callback/route wiring, read-only fixture identity and the matching native detail/empty content; no separate runtime Router-state dump was captured. See [fixture identity](collection-identity.json).

## Physical acceptance

| Check | Result | Evidence / limit |
|---|---|---|
| Creator collection heading → collection detail | PASS | Actual accessibility-bound tap, followed by QA Field Notes and Empty series |
| Honest empty collection | PASS | “No episodes in this Collection yet”; no fabricated episode or unlock action |
| Header Back → creator → re-entry | PASS | Repeated through real controls in both themes and text scales |
| Android Back → creator | PASS | Actual Android Back key; collection heading present again |
| Dark/light at 1.0× | PASS | Entry `[42,1697,1038,1900]`, about 77.3dp high |
| Dark/light at 1.3× | PASS for collection journey | Entry `[42,1715,1038,1964]`, about 94.9dp high; title and detail copy readable |
| Collection action / detail Back safe areas | PASS | Entry ends before navigation begins at y2214; detail Back `[42,125,158,241]`, about 44.2dp square |
| Separate episode-poster behavior | PASS automated; BLOCKED native | Existing empty collection has no episode poster; production callback retains Drop ID |
| Network error and retry | PASS automated; NOT TESTED native | Controlled mocked read failure retries into real CollectionWorld empty presentation. No backend outage induced |
| TalkBack focus traversal / other screen sizes | NOT TESTED | Raw accessibility labels, clickable state and bounds measured; not a screen-reader acceptance claim |

See [normal-text matrix](native-1.0.json) and [enlarged-text matrix](native-1.3.json). The first enlarged-text launch exceeded the initial readiness wait. One longer bounded check then completed both themes. Font restoration caused another activity/navigation readiness interruption; System appearance was subsequently selected through the actual Settings UI. No unrelated navigation fix was attempted.

Twenty real, unedited ADB screenshots (including intermediate captures) remain private and ignored under `.expo/ui-completion-phase4d/`, all 1080×2340. [Manifest with hashes](screenshots.json). Useful comparisons:

- Before: `d1-before-creator.png`.
- Normal dark: `d1-10-dark-creator.png`, `d1-10-dark-detail.png`.
- Normal light: `d1-10-light-creator.png`, `d1-10-light-detail.png`.
- Enlarged light: `d1-13-light-creator.png`, `d1-13-light-detail.png`.
- Enlarged dark detail: `d1-13-dark-detail.png`.

`d1-13-dark-creator.png` includes transient development Refreshing/warning overlays and is intermediate evidence, not a clean whole-screen visual pass. Subsequent detail captures are clear. Raw captures contain status-bar notification icons; they are not published or embedded here. Allowlisted hierarchy evidence excludes credentials and arbitrary personal text.

## Validation and preservation

| Command | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | PASS, exit 0 |
| `npm test` | PASS, 806 + 232 = **1,038 tests**, zero failures/skips |
| `node --test scripts/vault-collection-navigation.test.cjs scripts/crowd-stage-focus.test.cjs scripts/arena-room-text.test.cjs` | PASS, **10 tests**, including 3 Vault and 7 preserved Arena checks |
| `npm run test:duel` | PASS, **29 tests** |
| `npm run test:duel:render` | PASS, **22/22** controlled render scenarios |
| `git diff --check` | PASS; Git reports only existing/platform line-ending conversion warnings |

Local raw command outputs: `.expo/ui-completion-phase4d/{typecheck,npm-test,focused,duel,render}.log`. [Final hashes, counts and preservation checks](final-verification.json).

All 1,920 originally recorded unrelated untracked files were verified unchanged. Environment files, native development preferences and original ADB reverse mappings (`8081`, `55481`) are unchanged. Font scale restored to `1.0`; appearance restored to System. The task-only read-only accessibility collector was hash-verified and removed from the phone. Protected shared/E3.5.7 resource metadata is unchanged; no connection to those databases was made. Existing QA storage, accounts and fixtures remain intact.

Remaining Vault acceptance work: populated collection/episode rendering and poster-to-Drop navigation on a real authorized content fixture; native failure/retry, entitlement boundary and reader/media coverage. No fake episodes, purchases or access grants were introduced. No staging, commit, push, merge or deployment. Stop after Phase 4D.1.
