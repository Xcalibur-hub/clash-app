# Arena Phase 3.2B — Samsung A50 verification

Date: 2026-10-14–15. Branch: `feat/arena-v2-editorial-ui`; starting HEAD `b03a2bfb32cd71d583ca619e9141179a42fed510`. PR #65 remains DRAFT and unmerged. This continues the interrupted verification; it does not repeat the repository audit.

## Isolation and device

Samsung SM-A505F connected over USB and unlocked. Existing `com.clash.v2.dev` debug build; no native rebuild, app-data clearing, location-permission change or hosted operation. This installed build uses React Native's **Change Bundle Location** setting, rather than an Expo development-launcher URL. The original `localhost:8081` setting was recorded. The isolated bundle was served on 8083 with `EXPO_NO_DOTENV=1` and the disposable loopback API on 57721; task-specific ADB reverses reached both. A unique Take created through the phone and checked against the disposable API established actual backend selection.

Disposable project: `clash_p11bind_arena32b_20261014`, private ignored scratch `.expo/arena32b-20261014`. Ten task-owned containers including the real Deno Edge runtime, dedicated volumes/network, PostgreSQL/gateway bound to `127.0.0.1:57722/57721`. No access to quarantined hosted project `zrutlrhhvfcsmssjiijl` or the shared development database. Accounts A/B/C and all runtime fixtures belong exclusively to this disposable environment. Unrelated `Microsoft/`, `shot.png`, `sybil.html` and `sybil/` are excluded from commits.

## Confirmed correction: private signed URL origin

Running the actual production Edge Function under Deno exposed a container URL in its response: `http://kong:8000/storage/...`. Authentication and object authorization succeeded, but a phone cannot resolve that internal origin. The handler now adds a relative Storage capability while retaining the old absolute `url` field for compatibility. The client resolves the relative capability against its configured backend and rejects foreign origins or paths outside signed `private-media` objects. Neither ACLs nor RLS changed; service credentials remain server-only.

Before: actual Deno authorized the selected fighter but returned an externally unreachable origin. After: the same production handler returned a relative capability; resolving through the client gateway downloaded HTTP 200 with exact original PNG bytes. Recipient denial, block revocation, direct Storage denial and explicit fighter-owned public-copy publication were exercised by the authenticated workflow. This proves HTTP/media authorization, **not native image/video playback**.

Changed implementation: `supabase/functions/arena-assist-media-access/handler.ts`, `services/arenaAssistService.ts`. Focused regressions: `scripts/assist-signer-check.cjs`, `scripts/assist-service-check.cjs`. `scripts/arena-canonical-e2e.cjs` additionally supports the strictly allowlisted disposable directory and actual gateway/Deno invocation.

## Android workflow results

| Case | Result | Actual evidence / boundary |
|---|---|---|
| Native startup on isolated bundle | PASS | Metro compiled 4,649 modules; isolated test Take visible; no fatal missing-camera-module startup error encountered. |
| Home, Live, Groups, Discover, Challenges, Hall of Fame | PASS for inspected states | Native dark-theme navigation and scrolling inspected; Groups honestly empty; Live empty/completed records and challenge states came from the test server. This is not every possible data state. |
| Light theme | PASS for inspected states | Native Profile appearance switch, Live, Take, Stage, Crowd, assist and judging screens inspected. The file named `home-light-a` actually shows Live; it is not evidence of Home light-theme verification. |
| A creates Take; B challenges; A accepts | PASS for server operation | Performed through the native forms. Pending displayed before acceptance. Server confirmed exactly one canonical Clash, one linked Room, exactly two fighters. |
| Acceptance automatically opens linked Room | PASS on focused repeat; initial anomaly unresolved | First physical acceptance stayed on the Take. One additional labelled disposable A/B fixture was created through authenticated RPCs, then accepted through the phone. Temporary status-only logs showed focused=true, ACCEPTED, linked=true, confirmation and navigation; phone entered Fighter A's canonical Stage. No routing code change justified; temporary logs removed. |
| Official Fighter A argument | PASS | Native composer submitted text; server count became one; latest argument and author appeared above Crowd. |
| Fighter B official composition | NOT TESTED physically | Both fighter submissions and spectator denial passed real authenticated RPC tests, separately from Android. |
| Spectator entry and support | PASS | C used Watch Clash, server-derived count became one, no official composer appeared, Back A selected. Backing was not treated as a ballot. |
| Crowd | PASS for text and cross-account read | C sent real text through native UI; A saw it after account switch; closed Room became read-only. Separate automated test verified actual websocket delivery and gap recovery. |
| Private text assist | PASS for send/receive/accept | C selected Fighter A and sent text; A's private inbox showed PENDING, then ACCEPTED. |
| Native assist publication/rejection | NOT COMPLETED | The official window closed before publication completed; accepted assist remained unpublished. Rejection, incorporation and idempotent retry passed automated RPC tests only. |
| Judging and verdict | PASS | Server schedule advanced Room to judging; fighters saw ineligibility; C cast an actual ballot; maintenance settled one A verdict, shown on phone; Crowd read-only. No phone-fixture clock modifications. |
| Official history modal | PASS for settled text history | Review transcript opened the actual historical modal with Side A, author, timestamp and the physically submitted argument; no write controls. |
| Keyboard | PASS for tested corrected Crowd and fighter cycles | Before: closing keyboard retained a blank bottom region. Existing Android height avoidance now enabled only while the existing keyboard visibility state is true; two Crowd open/close cycles restored the full canvas and retained draft. A fresh open Room also retained the fighter draft across open/close with composer above IME and full canvas after dismissal. iOS behavior unchanged. |
| Account switching | PASS for observed A/B/C transitions | Native sign-out/sign-in changed actor handles and fighter/spectator permissions; no previous fighter composer remained for C. Not a full cache penetration test. |
| Entrance animation | PASS for observation only | Arena/duel entrance displayed; no quantitative frame-rate claim. |
| Reduced motion, screen reader, full theme matrix | NOT TESTED physically | Reduced-motion render branches covered by bridged smoke checks; system settings were not changed. |
| Native image/video/GIF picker, upload and playback | NOT TESTED | HTTP PNG/MP4 retrieval and selected-fighter Deno authorization passed; they do not establish native processing/playback. |

## Automated verification

Saved pre-interruption results were inspected and are identified separately from resumed checks. No command exit code is substituted for TAP assertion inspection.

Earlier in this same disposable verification:

- Clean replay: **104/104 migrations** in filename order, ledger count 104; historical source migrations unchanged. The previously reviewed compatibility artifact was used for redundant pgcrypto initialization. No assist policy on managed `storage.objects`; postgres remained non-superuser without Storage-owner membership.
- **13 pgTAP suites, 495 assertions passed, zero failed/skipped**: 001 (25), 054 (78), 055 (17), 056 (82), 057 (36), 058 (61), 059 (13), 070 (50), 072 (38), 073 (12), 074 (21), 090 (47), 091 (15). Actual plans/results saved in private `sql-results.json` and individual logs. This is relevant coverage, not the entire repository SQL directory.
- `node scripts/arena-canonical-e2e.cjs .expo/arena32b-20261014`: **15/15 groups**, real Auth and actual RPCs, real Realtime and production Deno handler. Includes concurrent acceptance, two fighter submissions, same-key deduplication/altered-payload denial, spectator authorization, Crowd reconnect, discovery, assist recipient isolation, reject/accept/explicit incorporation, PNG signing/revocation/public copy, MP4 byte retrieval, actual judgement, concurrent settlement and closed Crowd denial. Controlled clocks were used only for this automated fixture, unlike the later phone fixture.
- `node scripts/official-service-check.cjs`: **14/14**, controlled transport.
- `node scripts/crowd-service-check.cjs`: **7/7**, controlled transport.
- Strict Edge Function TypeScript check exited 0.

Executed again after resuming:

- `npm run typecheck`: exit **0**; explicit final `TYPECHECK_EXIT=0` captured.
- `npm run test:unit`: **474 passed, 120 suites, zero failed/skipped/cancelled**, exit 0.
- `node scripts/duel-render-smoke.cjs`: **22/22**, explicit independent `RENDER_EXIT=0`. Native animation/media are bridged. A combined PowerShell redirected invocation returned 1 despite complete passing output; independent rerun established the actual render process exit. Deprecation warning: `props.pointerEvents`.
- `node scripts/assist-service-check.cjs`: **10/10**.
- `node scripts/assist-signer-check.cjs`: **14/14**.
- `npx expo-doctor`: **18/18**, exit 0.
- `git diff --check`: no whitespace errors (Git emitted normal line-ending notices).

The final strict handler compilation was also rerun successfully with `npx tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --lib 'ES2022,DOM' supabase/functions/arena-assist-media-access/handler.ts` (exit 0). Its first unquoted PowerShell comma argument produced TS6046; quoting corrected the command, with no source change.

Other failed/inconclusive verification actions: an isolated read-only helper's direct service-role assist SELECT was denied, consistent with explicit table grants; helper changed to the authenticated fighter inbox RPC and succeeded. Early screenshot/accessibility attempts did not produce fresh UI trees; screenshots were used and stale XML rejected. ADB navigation taps made during keyboard/transition layout changes were not counted as successful interactions. No native-media or UI success is inferred from source existence.

## Remaining limits and release status

Partial verification, not a production-readiness certificate. Monitor the initial acceptance anomaly, which did not reproduce on the focused repeat. Remaining native-media, assist publication/rejection, full accessibility/theme/error/retry matrix require further verification before approval. No migrations or security policies were added or relaxed in this checkpoint. Existing engine, judging, rewards and moderation are preserved. PR #65 must remain DRAFT.

The keyboard fix changes only `components/liveArena/DuelRoomExperience.tsx`. Installed React Native 0.81.5 forwards Android `keyboardDidHide` to its change handler and can compute a residual avoidance offset from the hidden frame. Binding the existing KAV's enabled state to existing keyboard visibility ensures a hidden keyboard cannot reserve that space. Changing Android to padding and removing avoidance were tried, failed to solve both states, and reverted. No native configuration changed.

## Screenshot evidence

Only reviewed screenshots of disposable accounts were selected; authentication forms and an unrelated transient personal notification were excluded. These are original device captures, without synthetic activity or image editing.

- [Before: residual keyboard gap](evidence/arena32b/official-stage-confirmed-a.png).
- [After: fighter composer with keyboard](evidence/arena32b/fighter-guard-open-final.png) and [after dismissal, preserved draft/full canvas](evidence/arena32b/fighter-guard-closed-final.png). The before/after captures use different identified disposable Rooms.
- [Actual Crowd message](evidence/arena32b/resumed-current.png).
- [Selected fighter private inbox](evidence/arena32b/inbox-content-a.png) and [accepted, still private](evidence/arena32b/accepted-assist-a.png).
- [Real final verdict and read-only Crowd](evidence/arena32b/verdict-c.png).
- [Focused acceptance repeat reaches canonical Stage](evidence/arena32b/routing-after-a.png).
- [Actual settled official transcript](evidence/arena32b/history-clean-a.png).

## Commits, evidence and cleanup

- `c097c176cffd81a3e2e7dec711ed1d58d2ebb1d0`: private signed-URL origin correction and focused client/signer/workflow checks.
- `5ee577f8d38f62c48c475a9013875e44da8d4fda`: Android keyboard visibility guard, physically verified.
- The subsequent documentation commit contains this report, nine reviewed screenshots and five sanitized JSON summaries. It includes no private runtime configuration or raw logs.

[Authenticated workflow groups](evidence/arena32b/canonical-results.json), [actual TAP totals](evidence/arena32b/sql-results.json), [actual Deno PNG result](evidence/arena32b/deno-url-after.json), [phone fixture final server state](evidence/arena32b/phone-state.sanitized.json), [cleanup](evidence/arena32b/cleanup.json).

Cleanup completed successfully: ten verified project-labelled disposable containers and their dedicated volumes/network removed; all pre-existing container IDs, volume names and network IDs exactly matched the saved baseline. Task Metro root/CLI/workers and its child console were identity-checked before stopping; pre-existing Metro PID 9828 was preserved. Original phone bundle setting `localhost:8081` restored, task reverses 8083/57721 removed, known development reverses 8081/55321 restored. Only the task's UI XML scratch file was removed from the phone; CLASH was closed without clearing app data. No native media asset was copied to the phone.

The disposable fixtures and test backend are no longer available after cleanup. Normal development requires its original Metro/backend and may require signing back into the owner's account; restoring the bundle host does not restore an earlier cached login. No ordinary app server was started with inherited backend settings. PR #65 was verified open, DRAFT and unmerged through GitHub metadata. No deployment or merge performed.
