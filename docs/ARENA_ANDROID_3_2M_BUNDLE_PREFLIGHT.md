# Phase 3.2M — Android development bundle preflight

2026-10-15 · branch `feat/arena-v2-editorial-ui` · revision `ab4843072fc0717b6d42c70b557607bb306e1113`

**8083 bundle loading: PASS in this session. Historical 3.2L root cause: BLOCKED / unconfirmed. Arena Home automated accessibility readiness: FAIL.** No disposable backend or duel was created. No application/native code changed. PR #65 was not modified, merged, or deployed; no commit/push was requested or performed.

## Findings and evidence

Normal Metro 8081, existing PID 34616, was healthy before changes. Original reverse entries were 8081 and 55321; original native `debug_http_host` was `localhost:8081`. Normal MainActivity launch built/executed JavaScript and rendered the actual Arena Home, Live, Groups, Discover navigation, gateway and Fresh Takes. App-specific logcat recorded `Running "main"` and `arena_viewed`; Metro recorded an Android bundle. Screenshots were inspected privately, not published, because they contain existing account/feed content and personal notification indicators.

Diagnostic Metro 8083 used the existing local 55321 backend configuration, with `EXPO_NO_DOTENV=1`, development variant, motion-freeze=1 and navigation-diagnostics=1. The reviewed launcher asserted a localhost/127.0.0.1 backend on port 55321 before startup. No backend credentials or environment files were changed. The normal app's ordinary local requests continued; no SQL, migration, reset, hosted connection or new database infrastructure was used.

Actual Windows listener inspection reported **`[::]:8083`**, despite Expo's `--localhost` option. This option was not treated as proof of loopback-only host publication. ADB reverse provided the verified USB path; no firewall or network configuration changes were made.

| Launch check | Actual evidence | Result |
|---|---|---|
| Device connected | Samsung A50, ADB `device`, unlocked | PASS |
| Metro listening/reachable | Listener inspection; status; Android-originated HTTP requests through reverse 8083 | PASS |
| Real bundle requested | HTTP preload observed Android `/.expo/.virtual-metro-entry.bundle` request | PASS |
| Bundle built/served | First diagnostic response 200 after **49,549 ms**; restarted diagnostic response 200 after **42,668 ms** | PASS |
| Bundle executed | Fresh app PID logcat `ReactNativeJS: Running "main"`, followed by Arena event | PASS |
| Actual CLASH screen | Arena screenshot visually confirmed; two subsequent cold app launches passed fresh static Profile accessibility controls | PASS for rendering/static Profile |
| Arena Home accessibility gate | Fresh bundle 200, execution true, but no usable hierarchy after bounded attempts | FAIL, not substituted with Profile |

See [first request](evidence/arena32m/first-bundle.json), [subsequent Android requests](evidence/arena32m/bundle-trace.jsonl), [sanitized runtime](evidence/arena32m/runtime.sanitized.log), [native pass 1](evidence/arena32m/native-profile-pass-1.json), [native pass 2](evidence/arena32m/native-profile-pass-2.json) and [Arena gate failure](evidence/arena32m/native-arena-accessibility-failure.json).

The first 8083 launch initially reproduced the visible blank/reload period. Continuing observation showed a real request and successful response, followed by splash, Arena and usable static Profile. Warm native launch responses took **296 ms** and **436 ms**. The separate Arena-only gate response took **374 ms**, but its hierarchy check failed. Thus a status endpoint or immediate empty hierarchy cannot establish compilation completion or application readiness.

**Confirmed harness gaps:** 3.2L had no request/response instrumentation or bounded bundle-to-UI readiness gate. CLI output alone was insufficient to establish whether a bundle request had arrived. This phase also reproduced two defects in the newly introduced gate before correction: navigating to Profile before startup routing finished, and treating a momentarily absent PID immediately after `am start` as permanent failure. Both failed runs are retained as evidence, not counted as passes.

**Unconfirmed historical cause:** retained 3.2L logs do not prove why its reload screen persisted. Slow fresh Metro readiness is compatible with this session's timings, but it is not proof of the original cause. No specific application runtime, compiler, transport or development-client defect was established. The original isolated backend configuration was not recreated in this phase, and no backend-dependent media readiness claim follows from these results.

**Separate accessibility limitation:** `FreshTakesStage.tsx` and `FreshTakeCard.tsx` run continuous `withRepeat` motion and use system reduced-motion state; they do not consume the existing Live Room development freeze. Home inspection repeatedly timed out while screenshots showed rendered content. Static Profile inspection succeeded. This is consistent with UIAutomator idle starvation; no animation or user accessibility setting was modified to force a pass. Screenshots and logs establish rendering, not automated Arena interaction success.

## Minimal harness changes

- `scripts/android-bundle-trace.cjs`: diagnostic Metro preload. Records only request/finish events, times, Android caller classification and status. Never records query strings, headers, bodies or backend traffic.
- `scripts/android-bundle-preflight.cjs`: explicit 8083-only gate. Checks device, reverse, exact host preference and Metro; cold-launches existing MainActivity; requires a new Android 200 bundle, fresh-PID JS execution and meaningful enabled CLASH controls. Uses a 150-second readiness bound and at most three 15-second tree attempts. No taps, login, permission changes or data clearing.
- `scripts/android-bundle-preflight.test.cjs`: negative regressions for stale/probe/error responses, no execution, blank/splash/reload trees, and Profile being incorrectly accepted as Arena; mocked trace redaction/completion test.

The gate's `profile` mode explicitly navigates to the existing read-only self-profile after the existing Arena-ready event. It does not count as an Arena accessibility pass. Default `arena` mode requires Arena labels and controls. Missing/blank trees fail closed. Profile mode requires the existing analytics `arena_viewed` event; if unavailable it times out rather than guessing readiness.

For a future session, start diagnostic Metro using the reviewed local launcher with a **private absolute** `CLASH_ANDROID_BUNDLE_TRACE` file and preload `scripts/android-bundle-trace.cjs` in that child process only. Keep credentials out of arguments. Verify the host preference/reverse before invoking:

```powershell
node scripts/android-bundle-preflight.cjs 8083 <absolute-private-trace.jsonl> <new-private-evidence-directory> arena
# Explicit static-screen check, reported separately:
node scripts/android-bundle-preflight.cjs 8083 <absolute-private-trace.jsonl> <another-new-private-directory> profile
```

Evidence directories must be new and inherit private NTFS permissions. The gate does not configure/start Metro, repoint preferences or restore them; the surrounding reviewed session must save/restore those settings. It never authorizes backend/duel creation.

## Tests and failures

- `node --test scripts/android-bundle-preflight.test.cjs`: **14 tests passed**, 0 failures/skips, exit 0.
- `node --experimental-strip-types --test utils/navDiagnostics.test.ts utils/decorativeMotion.test.ts`: **9 tests passed**, 2 suites, 0 failures/skips, exit 0.
- `node --check scripts/android-bundle-preflight.cjs` and `node --check scripts/android-bundle-trace.cjs`: exit 0.
- `git diff --check`: exit 0.
- Real native gate after fixes: **two Profile passes**, exit 0; **one Arena accessibility failure**, exit 1. Earlier gate [UI readiness failure](evidence/arena32m/initial-gate-ui-failure.json) and [process-start failure](evidence/arena32m/initial-gate-process-failure.json) are retained. The initial version lacked stage-specific failure evidence; the corrected version records an allowlisted failure stage.
- Existing warnings: require cycles, event-target-shim export fallback, missing Sentry build configuration; none prevented the observed successful bundle execution. They were not suppressed or reclassified as passes.
- Full units, TypeScript, Expo Doctor and database suites were not run; only Node harness files changed and focused regressions were requested. No prior passes are presented as fresh results.

## Restoration and conclusion

Original native preferences restored **byte-for-byte**, original reverse list restored **exactly** (8081/55321), task reverse 8083 and temporary phone XML/preferences removed. No sign-in/out, permission change or app-data clear. Authentication storage was not intentionally modified or exported; routine app session refresh is not a byte-equivalence claim.

Only the identified diagnostic Metro process tree was stopped. Listener 8083 is absent; original Metro 8081 remains PID 34616 and reports running. Normal MainActivity was reopened and Arena rendering confirmed again by private screenshot. No Docker resources were created, so no database cleanup was needed. Unrelated processes and working-tree files were preserved. [Restoration evidence](evidence/arena32m/device-restoration.json), [cleanup](evidence/arena32m/cleanup.json).

The A50 demonstrably loads CLASH through 8083, including repeated fresh bundle and accessible static-screen checks. Fully automated Arena Home readiness remains blocked by hierarchy idling. The exact 3.2L root cause remains unconfirmed, so this report does not label that historical incident fixed or authorize the next media/duel phase.
