# Phase 4C — Samsung authenticated UI acceptance

**PARTIAL native acceptance. A confirmed Crowd keyboard/safe-area defect is fixed and physically retested. Other blocked/untested journeys remain open. No production-readiness or full application-security claim.**

Original checkout, branch arena-ui-review, unchanged HEAD 9bad8b0b51ffd1bab5975ceb72f7c75a487d798f. Three UI source files are modified locally, unstaged/uncommitted. No push, merge or deployment. Prior blocked checkpoint preserved in [CHECKPOINT_BEFORE_LOGIN.md](CHECKPOINT_BEFORE_LOGIN.md).

## Verified execution and authentication

Backend: clash-ui-qa-phase4a, gateway http://127.0.0.1:55481. System identifier 7700622043081482277; application ledger 111 and managed Storage/Auth/Realtime 74/82/88, cron off. All 111 source/copy migration hashes remain exact. Accepted Phase 4B exact ledger comparison is historical; current counts/identity and file hashes were rechecked, not a new full security audit.

Samsung SM-A505F, serial RZ8M30DE9NL, installed DEBUGGABLE com.clash.v2.dev, versionName 2.0.0/versionCode 1. QA-only Metro PID 10920, original checkout, 8081, dotenv disabled, CI unset, one worker, anon key only. The actual Android-requested bundle and native cached bundle were verified against QA URL/key, independently of host compilation. [Phone execution](phone-execution.json), [host bundle](host-bundle.json).

Owner signed in through normal password UI using the existing DPAPI credential. Auth recorded a new A session with an okhttp user agent at 2026-10-26T16:43:07.151064Z; authenticated onboarding/feed displayed the matching QA identity. Interest selection Technology/Campus & careers/Local life succeeded. A later force-stop/relaunch restored A without credential entry. No existing non-QA account was signed out, reset or overwritten. No password/token was printed or supplied to ADB. [Auth evidence](authentication-status.json).

## Actual native coverage

| Screen/journey | Result | Evidence and limit |
|---|---|---|
| Current QA bundle and fictional login | PASS | Real bundle/cache, QA Auth event, native QA Rowan identity |
| Interest onboarding | PASS | Actual three interest presses and Continue; 03/04 screenshots |
| Session restoration | PASS | Cold app relaunch returned authenticated Home; 32 screenshot |
| Home/Fresh Takes | PASS populated display | Three real RPC-created QA Takes; 04/05 screenshots |
| Following/Popular/New controls | PASS navigation; partial ordering | Following visibly shows followed B; Popular/New presses exercised; 06/07. No exhaustive pagination/ranking acceptance |
| Take detail and nested discussion | PASS read/navigation | Exact existing Take route; B parent reply and C nested reply expanded; 12/13 |
| Native voting/reaction writes | NOT TESTED | No mutation pass inferred from visible controls |
| Reply composer keyboard | NOT TESTED | Attempted Reply target was outside visible bounds; no tap occurred. 15 is not keyboard evidence |
| Author/profile navigation | PARTIAL | Guest Profile gate and authenticated identity checked; no complete author-profile flow |
| Groups discovery | PASS populated screenshot | Actual QA community, Joined and two members visible; standard hierarchy could not idle; 08 |
| Crew detail/member list | PASS reads/navigation | Entry via explicit supported deep link; actual Members press lists A owner/B member; 10/11. Discovery-card tap not verified |
| Groups channels/discussions | BLOCKED | No existing supported Crew API contract; none fabricated |
| Arena Live discovery | PASS | Real canonical duel, fighters, FINAL ARGUMENTS and interest explanation; actual Watch control entered Room; 33/34 |
| Canonical fighter Stage | PASS Fighter A presentation | Two identities, author role and current official argument; 16/29. C's native view not tested |
| Stage history / assists / verdict | PARTIAL / BLOCKED | Controls visible; API-created two arguments. No fabricated winner or completed result; private delivery not tested |
| Crowd expansion | PASS | Exact measured Expand control; real expanded Crowd; 18 |
| Crowd keyboard/composer | FAIL before -> PASS corrected dark-theme geometry | 19 before, 38 settled after; measurements below. No message was sent |
| Canonical phase progression | PASS observed presentation | OPEN, FINAL ARGUMENTS, then JUDGING appeared under normal clock. Fighter judging denied by visible UI in 38; no settlement operation |
| Arena Discover | PARTIAL | Actual rail press and 39 screenshot; graph interactions/ranking not accepted |
| Explore For You | PASS populated display | QA live duel and Takes from actual APIs in light theme; 23 |
| Explore Live | PASS populated display/navigation | Actual Live control and canonical fixture card; 24 |
| World | PARTIAL | Actual World press and screenshot 26; pins/country controls/loading/retry not fully inspected |
| Play | PASS honest successful-empty shell; content BLOCKED | Actual Play tab and real no-active-challenges state; 25. No Play detail/participation fixture |
| Vault creator | PASS actual creator/container display | Real QA Mira/Vault/collection listing; 27 |
| Collection detail | NOT VERIFIED | Card press attempted but capture still showed creator listing; 28 is not a collection-detail pass |
| Products/services/courses/readers/paid entitlements | BLOCKED | No supported ready content/entitlement fixtures prepared; no fake purchase/access |
| Settings/appearance | PASS navigation and theme changes | Actual Light, Dark and final System presses; 21/22/40 |
| Loading/network-error/retry/denied permutations | NOT TESTED comprehensively | Backend remained healthy; no fabricated failures or unapproved outage |
| Reduced motion/enlarged fonts/full focus order | NOT TESTED | No global accessibility preference or font-size changes |
| Public/private Realtime native delivery | BLOCKED / NOT TESTED | Connected Crowd label is not proof of a delivered event; Phase 4B Windows results are not device evidence |

Many detail routes used explicit app deep links where hierarchy automation was blocked. Actual rendering/API data was inspected; intent delivery alone was never counted as success. Populated fixtures and successful empty shells are distinguished from full feature acceptance.

## Confirmed defect and exact correction

Before: focus Crowd input in an authenticated fighter Room. Samsung keyboard opens; composer/Send disappear. Raw heights shrank to approximately 25dp, and the screenshot confirmed invisibility. Competing fighter/Crowd composer layouts and fixed Crowd minimum height exhausted keyboard space. Hiding the fighter composer additionally exposed existing fighter-specific inset ownership: without its footer, Crowd's input was placed at y2218–2334 inside Android's navigation region starting y2214. This was identified and corrected before final acceptance.

- ImmersiveClash.tsx: release Crowd minimum height in condensed mode; hide the fighter composer while Crowd is expanded using display:none and accessibility exclusion, keeping it mounted to preserve drafts. Focus Stage restores it; no authorization or publishing service changed.
- LiveCrowdLayer.tsx: composer row and Send cannot flex-shrink.
- DuelRoomExperience.tsx: expanded Crowd retains the existing safe-area bottom inset for fighters as well as spectators.

Native final: keyboard closed input y2093–2209 / Send y2094–2210, above navigation-bar top2214. Keyboard open input y1216–1332 / Send y1217–1333, above IME top1359. Density420 => 2.625px/dp; heights116px ≈44.2dp. A harmless unsent “QA draft only” enabled Send; screenshot 38 clearly shows both controls, no Refreshing overlay. Exactly that draft was deleted and keyboard dismissed with Android Back. No send action was performed. [Final raw bounds](38-enabled-send-raw.json), [closed-keyboard bounds](36-crowd-safe-inset.json).

Intermediate 20/37 captures contain a Refreshing overlay and are not final settled evidence. A subsequent inspector timed out with exit137 and the launcher became foreground; capture30 is excluded/private, not inspected or published. No new CLASH crash was established by exit history. Before further taps the app was safely relaunched and session restoration verified. The raw inspector revealed the navigation-region overlap; no pass was based on the failed probe. Future automation must reject system-navigation/IME-overlapping coordinates, not just positive bounds.

Standard uiautomator repeatedly reported could-not-get-idle-state on Groups/Room. A reviewed standalone read-only display-aware collector supplied actual raw control bounds without requiring idle. Only allowlisted controls/states were recorded; no app rebuild/APK installation, input injection by the collector, networking, app-data read or accessibility-setting change. The exact task JAR was hash-verified and removed. Actual taps were separate ADB input actions using fresh measured targets. [Collector review](inspector-review.json).

## Automated validation

- node node_modules/typescript/bin/tsc --noEmit --incremental false: PASS, including final inset change.
- npm.cmd test: PASS, 806 configured unit tests +232 lifecycle/UI/RPC tests = **1,038**, zero failures/skips. Final log .expo/ui-completion-phase4c/npm-test-final.log.
- npm.cmd run test:duel: PASS, 29 tests. This run predates the last one-line inset expression; final full/render checks followed that change.
- node --experimental-strip-types --test utils/immersiveClashUi.test.ts: PASS, 15 tests/3 suites.
- node scripts/duel-render-smoke.cjs: PASS, 22/22 scenarios, final run after source correction. Native/media/animation bridges remain test limitations.
- git diff --check: PASS.

No new weak source-text assertion was added to claim native geometry. Existing automated checks are regressions, not device-layout proof; actual A50 before/after is the layout evidence. The final settled screenshot38 is in JUDGING. Screenshot37 shows visible controls during FINAL ARGUMENTS but includes a Refreshing overlay; a settled OPEN/FINAL repeat remains required before accepting the fighter keyboard flow across all phases. Light-theme keyboard, long drafts, populated Crowd scrolling and fighter-draft retention across focus changes also need native coverage.

## Fixtures and mutation boundary

[Exact IDs](fixtures.json): three fictional accounts/profiles, three Takes, parent/nested reply, Crew with two members, A-following-B, empty creator Vault/collection, one challenge/canonical Clash/linked Room, two official arguments. Canonical IDs: challenge7893d308-4349-4a05-b029-2f1f34d13dbe; Clash cl_4e8db7e401366644; Room ar_19c92b711f303d05. Server clock opens16:47:06.783964Z and closes17:17:06.783964Z, unmodified. [Canonical fixture evidence](canonical-fixture.json).

For canonical fixture setup, existing fictional A/B/C identities authenticated through QA Auth admin-generated magic links and normal OTP verification, with tokens held only in memory. Passwords were not changed; each content write then used the actor's real application RPC/JWT. One accepted challenge produced exactly one linked Room. Two fighter argument RPCs succeeded; C room-read RPC succeeded. These are API setup results, not native B/C interactions or spectator publishing-denial evidence.

Automatic approval review rejected the proposed additional Crowd post/private-assist write as requiring separate authorization. An explicit owner-approval question is pending. The helper was written but never executed; **no Crowd or assist fixture was created**, no retry bypass occurred. Accordingly recipient isolation, authorized private delivery, acceptance/publication and unauthorized posting tests remain unexecuted. No positive private messaging readiness is claimed.

Fixtures are deliberately retained because acceptance is incomplete. Cleanup must use exact manifest IDs and resolve dependent comments, messages, Room/challenge/Clash, memberships/community, collection/Vault, follows and sessions before removing verified profiles/accounts. Auth deletion alone leaves orphan profiles. Unsupported deletion contracts require a reviewed QA-only exact-ID procedure; no broad prefix deletion or automatic cleanup is scheduled. No paid transaction, entitlement fabrication, scheduler activation or forced result occurred.

## Preservation and remaining priorities

All 1920 original untracked hashes and original .env/.env.local hashes match. Frozen SQL unchanged. Protected shared/E3.5.7 container/image/mount/network/volume identities remain unchanged by metadata comparison; no protected service connection or operation. QA identity/ledgers and cron-off preserved. No staging, commit, push, merge or deployment.

System appearance restored and temporary inspector removed; no font/motion/system-accessibility settings changed. **QA Metro8081 and reverses8081/55481 remain intentionally active for owner review. Original Metro55471 configuration, native preferences and reverse list are saved but rollback has not been executed.** This avoids reopening an unapproved old backend while review remains incomplete. No environment file was edited. Existing non-QA sessions remain isolated by origin/port. Do not launch default dotenv/dev-local tooling against shared55321 or hosted defaults.

Private screenshots/hierarchies remain under .expo/ui-completion-phase4c/. [All capture dimensions/hashes and exclusions](screenshots.json). No credential screen or password was captured; desktop dialog capture exclusion remained separate. Status indicators may be personal: no raw image/log was committed, uploaded or copied to Gallery. screenshot30 is a non-CLASH capture and excluded. No sanitized/redacted-pixel publication claim is made.

Priorities: (1) explicit approval for the two delivery fixtures, then authorized native spectator/private-delivery/error-disposal tests; (2) light-theme/long-draft/scroll/fighter-focus regression; (3) real Vault/Play content/access fixtures and collection navigation; (4) enlarged fonts/reduced motion/focus order and full Discover/World coverage. The two-argument duel's canonical lifecycle must continue normally; no new timed fixture or clock bypass is implicit in this report.

**STOP: partial acceptance reported; local UI fix awaits review, not production approval.**

## Phase 4C.1 — approved delivery preflight, 27 October 2026

**BLOCKED: the authorized existing canonical duel has passed its server-enforced deadline. No application writes or replacement fixture were attempted.** This follow-up supersedes the earlier pending authorization for Crowd/assist writes: owner authorization was received, but its current-phase prerequisite failed.

| Check | Result | Actual evidence |
|---|---|---|
| Exact gateway/project | PASS | `http://127.0.0.1:55481/__qa/identity` returned HTTP 200 and `clash-ui-qa-phase4a` |
| Database identity | PASS | Read-only SQL returned system identifier `7700622043081482277` |
| Accepted database baseline | PASS, catalog check | Application 111, Storage 74, Auth 82, Realtime 88; cron off, recorded cron runs 0 |
| Existing canonical relationship | PASS | Room `ar_19c92b711f303d05` links to Clash `cl_4e8db7e401366644` |
| Current write window | BLOCKED | Server time `2026-10-27T01:40:22.647339Z`; closesAt `2026-10-26T17:17:06.783964Z` (26 October 22:47:06 IST) |
| Supported RPCs and actor roles | PASS, contract inspection only | Existing profiles resolve to A fighter, B fighter and C spectator. Deployed Crowd post, assist send and private inbox RPCs grant authenticated EXECUTE and deny anon EXECUTE. This does not prove runtime actor authorization/delivery |
| Native spectator/Crowd delivery | BLOCKED | No eligible timed fixture; no post attempted |
| Authorized private-assist delivery/recipient isolation | BLOCKED | No eligible timed fixture; no assist attempted |
| Unauthorized posting/private subscription denial | NOT TESTED | No authenticated mutation/subscription test performed in this continuation |
| SDK timeout/retry disposal | NOT TESTED | No subscription or transport-failure test performed |
| Light-theme Crowd keyboard, long draft, populated scrolling, fighter-focus transitions | BLOCKED in this run | No eligible fixture; earlier partial native results remain historical |

The deployed `get_arena_crowd` computes canSend using `clock_timestamp() < closes_at`; `post_arena_crowd_message` rechecks it before insertion and raises `P0003` when closed. `send_arena_private_assist` invokes `assert_private_assist_window`, which requires the canonical access contract, Room membership, an open Clash within its clock window, and a pre-judging deadline; failure raises `42501`. Therefore stored Clash `open` / Room `OPEN` is not permission to send. No clock, status, scheduler, permission or verdict was modified to bypass these guards.

Proposed operations for a separately authorized eligible replacement: C posts one clearly fictional QA Crowd text through `post_arena_crowd_message`; C sends one private text to side A through `send_arena_private_assist`; A reads through `list_arena_private_assists`, B verifies recipient isolation, and C is denied fighter-only publishing/private inbox access. Native delivery and authenticated private-channel denial require separate actual runtime evidence. These operations were **not executed** against the expired fixture.

Read-only counts remain **0 Crowd messages / 0 private assists** for this Room. No new fixture IDs exist. [Preflight and preservation](phase4c1-preflight.json), [deployed role/window/privilege evidence](phase4c1-permissions.json). An initial diagnostic SELECT used the wrong Room table name and was rolled back; correcting the ignored diagnostic to the existing `public.arena_rooms` allowed the read-only check to finish. No application SQL or RPC mutation was retried.

HEAD remains `9bad8b0b51ffd1bab5975ceb72f7c75a487d798f` on `arena-ui-review`. All 1,920 original untracked file hashes match their baseline. The same three UI files remain uncommitted, with their hashes recorded; staging is empty. No UI edits, authentication operations, device/Metro/environment changes, shared/hosted/E3.5.7 access, commit, push, merge or deployment occurred in this continuation. Automated suites were not rerun because application code did not change. Only local diagnostic/evidence/report files were added or updated.

**Next required owner decision:** authorize exactly one replacement canonical timed duel using existing fictional QA A/B/C, normal unmodified clock and supported application RPCs, in this QA backend only. Existing authorization does not cover that replacement. STOP pending that separate authorization.

## Phase 4C.2 — authorized replacement and delivery tests, 27 October 2026

**PARTIAL acceptance. Actual native Crowd delivery and fighter-A private-assist accept/publish/reject passed. A confirmed JUDGING safe-area defect remains; native B/C role switching was not performed.** Owner authorization for exactly one replacement was received after the preceding checkpoint. No second replacement was created.

### Isolation, execution and exact retained fixtures

QA identity verified at `http://127.0.0.1:55481`, database system identifier `7700622043081482277`, application ledger111, managed Storage/Auth/Realtime74/82/88, cron off and recorded cron runs0. Existing Samsung `SM-A505F`, serial `RZ8M30DE9NL`, package `com.clash.v2.dev` remained on fictional A. Original Metro PID10920 was reused on8081; no restart or second server. Only reverses8081/55481 were restored after the prior reconnection removed them. [Preflight](phase4c2-preflight.json).

The native cached bundle contains QA55481 and its matching anon key, with no QA service-role key. After the scoped focus correction, one controlled development-client relaunch generated a fresh Android HTTP200 bundle request and the native cached implementation contained `Keyboard.dismiss()` in the actual Focus Stage handler. Native retesting demonstrated execution of that change. Network-response hash `ea79a3397fdd4bc02fa2750533fae1f96f8f8e59fca9795aa962982f437dc080` differs from cached-file hash `3a58c1c3a25498ffd170f7ff31b05b1b6b834dab3b73eaba80b269d96d547c91`; **byte identity is not claimed**. [Actual request/cache evidence](phase4c2-phone-bundle.json).

All writes used existing fictional A/B/C and supported authenticated RPCs after identity checks. Separate API sessions used QA-generated magic links and normal OTP verification; tokens stayed in memory and only those API sessions were signed out locally. No password reset, new account, native account switch or native sign-out occurred. A new Take was used for the single new challenge/acceptance flow. [Exact fixture manifest](phase4c2-fixtures.json):

| Object | ID |
|---|---|
| Take | `take_e60164dc324e2c96` |
| Challenge | `3e4eff08-ff07-474c-aa60-c4aab29a89ad` |
| Canonical Clash | `cl_4e59c3897392b820` |
| Exactly one linked Room | `ar_8d837deeb59e3ace` |
| C Crowd message | `ef461bf3-c513-464a-b872-06162f5e34fb` |
| C live-delivery Crowd message | `868a6993-cf3f-480a-85fe-39fcb6b87a01` |
| C → A accepted/published assist | `81f796f5-7864-4016-ae46-642d3061b27c` |
| Resulting official message | `am_a7c4ce84dfd2520d` |
| C → A rejection-only assist | `58ff8a19-8211-4c80-9be0-b50e657be7cc` |

Normal server opensAt `2026-10-27T01:52:56.267187Z`, closesAt `02:22:56.267187Z` (07:22:56–07:52:56 IST). No deadline, phase, status or verdict was manually changed. Two initial fighter arguments plus the explicitly published assist give three official messages. Two Crowd messages were necessary to check initial delivery and a subsequent live INSERT; two assists exercised publication and rejection separately. Final read-only counts: Crowd2, assists2, official3, published-link count1, linked Rooms1. Fixtures remain retained; no cleanup authorization was assumed. [Final API state](phase4c2-final-api.json).

### Actual results

| Scenario | Result | Evidence and limits |
|---|---|---|
| C spectator admission | PASS API; native C NOT TESTED | `watch_arena_room` admitted C; `get_arena_room` returns `spectator`. An initial Crowd read before joining correctly returned42501; no Crowd/assist write had occurred. Joining through the supported RPC resolved that prerequisite |
| C Crowd posting and persistence | PASS API | Real `post_arena_crowd_message`, exact C profile author, persisted rows. [RPC results](phase4c2-delivery-api.json) |
| C message rendered on A50 | PASS native | `c2-11-crowd-persisted.png` shows C identity/text. Earlier immediate `c2-05` still showed empty Crowd and is not delivery proof |
| Subsequent actual WebSocket delivery | PASS API/SDK and native rendering | Authenticated A channel received INSERT for exact second ID at02:13:55.751Z. `c2-30-live-arrival.png` shows both messages without navigation refresh. Native update may include reconciliation polling; do not infer its precise transport solely from the screenshot. [WebSocket result](phase4c2-crowd-websocket.json) |
| C official fighter posting | PASS denial, API | Existing `post_arena_room_message` rejected C with42501; no unauthorized argument persisted |
| A private assist receipt | PASS native/API | `c2-06-assist-inbox.png` and `c2-07-assist-loaded.png` show exact private text in A inbox; actual list RPC returned the row |
| B recipient isolation | PASS API; native B BLOCKED | B list returned empty before and after publication/rejection. Phone remained on A; secure B/C native account switching was not established in this run |
| C private inbox denial | PASS API | Actual list RPC returned42501 |
| Native Accept → explicit Publish | PASS native/persistence | `c2-08` shows Accepted/still private before the separate Publish press. `c2-10` shows Published once; SQL verifies one official row/link and three total official messages. The attempted intermediate accepted-state SQL diagnostic used the wrong table name and rolled back; no intermediate SQL checkpoint is claimed. `c2-09` is a busy transition, not completed publication proof |
| Native Reject | PASS | `c2-29-assist-rejected.png` shows Rejected; final RPC status REJECTED with null publication link |
| Authorized private subscription | PASS SDK | A joined the supported `arena-typing:<Room>` private channel: SUBSCRIBED |
| Unauthorized private subscriptions | PASS denial, SDK | Anonymous current-Room and authenticated C nonexistent-Room joins returned CHANNEL_ERROR, not a timeout. These are private Arena typing authorization checks, **not a fabricated private-assist subscription** |
| Dedicated private-assist channel | NOT SUPPORTED | `PrivateAssistPanel` uses authenticated inbox RPCs and a15-second polling timer. No private-assist WebSocket subscription exists in this UI |
| SDK rejection/disposal | PASS bounded SDK probe; native timer instrumentation NOT TESTED | All three channels removed with `ok`, zero channels, closed state, no join timeout. Retained rejected-channel timer handles had `_destroyed=true`, tries0: SDK reset clears the timeout without clearing its reference. No active retry leak was established and no SDK workaround was added. [Details](phase4c2-realtime.json) |
| OPEN dark long draft/IME | PASS native geometry | `c2-12-dark-long-draft.png`: unsent long fictional text, input y1091–1333, Send y1218–1334, IME top1359. Same original three layout corrections; this capture precedes the new focus-handler correction |
| OPEN light long draft/IME | PASS geometry, limited editing | `c2-13-light-ime.png`, input y1090–1332, Send y1217–1333. The light test appended at the current selection within the previous QA draft; it was not a pristine short-draft test |
| Patched light composer/Send | PASS native | `c2-26`: input y1217–1333, Send y1218–1334, both above IME1359 and approximately44dp high |
| Fighter draft preservation | PASS native | Raw `c2-25` and `c2-27` both record21 characters across Crowd expansion, Crowd editing and Focus Stage |
| Focus Stage with keyboard | FAIL before → PASS after scoped fix | `c2-19/20` reproduce overlapping compressed Crowd/fighter composers. Fresh-bundle `c2-27` restores Stage, IME false, fighter draft21. `c2-21` still exercised stale code and is explicitly superseded |
| Populated Crowd gesture with IME | PASS bounded native gesture | Two actual messages; scroll container measured `[42,911,1038,1178]`, gesture stayed inside it and above composer/IME. Keyboard remained open. `c2-34-final-keyboard-scroll.png`; [gesture evidence](phase4c2-scroll.json). This is not large-history/pagination acceptance |
| Natural FINAL ARGUMENTS | PASS native presentation/keyboard | `c2-30`, `c2-34`, `c2-35`; normal20-minute phase boundary, no forced transition |
| Natural JUDGING / collapsed Crowd safe area | **FAIL** | `c2-37-final-restored.png` visibly puts Crowd/Expand under Android navigation. Raw `c2-38`: header y2130–2340, Expand text y2214–2257; navigation begins2214. No unsafe tap on this control. Requires a scoped follow-up correction and retest |
| Back and appearance restoration | PASS native | System selected through Settings; normal Android Back returned to Arena Home (`c2-39-exited.png`). No message draft was submitted |

### Scoped correction and validation

Reproduced root cause: when Crowd owns the IME, Focus Stage sets `crowdExpanded=false` but leaves the keyboard open (`condensed=true`), making the fighter composer reappear while the Crowd still occupies the condensed layout. `ImmersiveClash.tsx` now calls `Keyboard.dismiss()` in that exact focus handler before collapsing Crowd. It preserves the existing mounted composer/draft behavior; no permission, mutation or service contract changed. This is the Ponytail minimal-change workflow: native keyboard dismissal, no new controller or dependency.

Added `scripts/crowd-stage-focus.test.cjs`: executes the actual transpiled production render/press callback with narrow React/native bridges. Once bridge setup was corrected, it failed specifically `0 !== 1` for missing dismissal before the fix, then passed after. It checks fighter composer remains mounted and focus collapses Crowd. It is a handler behavioral test, **not a Yoga/native geometry test**; device evidence supplies geometry proof.

| Final command | Result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS exit0 |
| `npm.cmd test` | PASS:806 unit +232 configured lifecycle/UI/RPC =1,038; zero failures/skips |
| `node --test scripts/crowd-stage-focus.test.cjs` | PASS1; targeted before-fix assertion failure independently observed |
| `node --experimental-strip-types --test utils/immersiveClashUi.test.ts` | PASS15 |
| `npm.cmd run test:duel` | PASS29 |
| `node scripts/duel-render-smoke.cjs` | PASS22/22 controlled scenarios |
| `git diff --check` | PASS |

Logs remain private under `.expo/ui-completion-phase4c/c2-*.log`. No tests were weakened. No application changes followed those validation runs.

### Preservation, privacy and remaining gates

HEAD stays `9bad8b0b51ffd1bab5975ceb72f7c75a487d798f`, `arena-ui-review`; staging empty. Original three UI files remain uncommitted, with the additional minimal handler change within `ImmersiveClash.tsx`; new focused test is untracked. All1,920 original unrelated untracked hashes, original environment hashes and111 source/QA migration hashes match. Protected container/network/volume metadata unchanged; no protected service connection. [Preservation](phase4c2-preservation.json).

Native PNGs are actual1080×2340 ADB captures, retained privately in `.expo/ui-completion-phase4c/c2-*.png`; status indicators may contain personal notifications. They have **not** been published, committed, copied to Gallery or represented as redacted. The manifest hashes files without claiming every intermediate frame is accepted. [Capture manifest](phase4c2-screenshots.json). Standard idle hierarchy was unreliable; bounded read-only raw collector used allowlisted controls/draft lengths, with separate measured ADB inputs. A diagnostic-only Java BOM caused one compile failure, corrected without touching the app; all task JARs were subsequently hash-verified and removed.

System appearance and keyboard restored, native Back exited Room. Attempted draft deletion initially left15 task-created characters; no complete field-clear pass is claimed. Back then unmounted the Room; `LiveRoomComposer` keeps drafts in component-local `useState`, without persistence. No existing owner draft or credentials were read/modified. [Restoration](phase4c2-restoration.json).

QA Metro8081 and restored QA reverses8081/55481 remain intentionally available for owner review, with prior rollback configuration retained. No fallback to shared55321, hosted or E3.5.7. No migration, grants/RLS change, clock manipulation, scheduler activation, fabricated verdict, paid transaction, native rebuild, commit, push, merge or deployment.

Remaining: fix/retest JUDGING bottom safe area; secure owner-controlled native B/C role checks; large-history/pagination and native subscription-unmount instrumentation; media assists remain outside this text-delivery run. Preserve all listed fixtures until explicit cleanup authorization. **STOP: delivery vertical slice demonstrated; overall native acceptance remains partial.**

## Phase 4C.3 — collapsed Crowd inset correction and focused native regression

**Safe-area correction verified on the retained expired Room in dark/light and at 1.3 text scale. Overall acceptance remains partial: enlarged text clips, and a fresh live-JUDGING/active-composer test is BLOCKED by the unchanged expired window.** This section supersedes the preceding unresolved collapsed-Crowd overlap finding; it does not turn historical OPEN/FINAL or API tests into new native results.

### Reproduction, root cause and scoped source change

Original checkout/branch/HEAD verified: `arena-ui-review`, `9bad8b0b51ffd1bab5975ceb72f7c75a487d798f`. QA gateway55481, system identifier7700622043081482277, application111, managed74/82/88 and cron off verified. Existing Metro PID10920 on loopback8081 and A50 `SM-A505F` / `RZ8M30DE9NL` / `com.clash.v2.dev` reused. No backend startup, new fixture, account switching or migration. [Preflight](phase4c3-preflight.json).

Reopened existing Room `ar_8d837deeb59e3ace` through `clash-dev://arena/room/...`. Its close time remains02:22:56.267187Z; preflight server time02:31:58.555475Z was already later. Stored Room status remains OPEN, but current authoritative UI says **SETTLEMENT PENDING**, not a new live JUDGING interval. No verdict was fabricated or settlement forced.

The same collapsed/nonpublishing layout reproduced the defect: `c3-01-before` hit bounds `[0,2131,1080,2340]`, Expand text `[922,2215,1027,2258]`; Android navigation starts2214. Previous live-JUDGING `c2-38` had the equivalent overlap. The native before screenshot/raw bounds establish the defect independently of the historical capture.

Inset ownership was incomplete:

- `DuelRoomExperience` already computes and passes `crowdPaddingBottom`, removing stale Android navigation padding while the IME is open.
- The mounted fighter composer already owns its bottom inset. Expanded `LiveCrowdLayer` owns its own padding.
- Collapsed Crowd is an absolute header inside Stage. When publishing is unavailable and the fighter composer is absent, neither existing inset owner is mounted; its bottom frame reached2340.

Only the root presentation boundary in `components/liveArena/ImmersiveClash.tsx:183` changed during this phase:

```tsx
style={[styles.root, {
  paddingBottom: crowdHeaderOnly && !fighterComposer
    ? crowdPaddingBottom + StyleSheet.hairlineWidth
    : 0,
}]}
```

The conditional transfers ownership only when collapsed Crowd has no fighter footer. Expanded/keyboard Crowd and mounted fighter composers continue owning their existing inset; root adds zero in those cases. First device retest with inset alone ended at2215 because of native rounding. One physical pixel (`StyleSheet.hairlineWidth`) corrected that last pixel; final bounds end2214. No Stage redesign, role/authorization changes, draft remount, API/service changes or composer changes.

Existing `DuelRoomExperience.tsx` and `LiveCrowdLayer.tsx` file hashes exactly match the Phase4C.3 starting hashes. Previous `Keyboard.dismiss()` focus correction and the mounted-draft wrapper remain intact. `scripts/crowd-stage-focus.test.cjs` was extended, not replaced with a source-text assertion: it executes the actual transpiled production render/handler and the real `duelStageLayout` rules with narrow native/hook bridges. Before the root correction the new JUDGING/no-composer case failed specifically `undefined !== 48`; after correction/refinement all4 cases pass. Tests cover JUDGING inset ownership, active-fighter nonduplication, expanded/keyboard nonduplication, and the original focus/draft-mount contract. Native Yoga is not simulated by this test.

### Actual native geometry and coverage

Fresh Android HTTP200 bundle delivery was observed after controlled development-client relaunches; cached Android code was checked for the final conditional plus hairline and QA URL/anon key. Server credentials absent. Network/cache hashes differ and are explicitly not treated as byte identity. [Phone implementation evidence](phase4c3-phone-bundle.json). One early post-reload route attempt captured Home and another captured loading; neither is a Room pass. Reopening the supported route after hydration produced settled content.

| Native check | Result | Evidence |
|---|---|---|
| Dark collapsed Crowd | PASS | `c3-07-dark-settled.png` / raw JSON: hit region `[0,2004,1080,2214]`; Expand text `[922,2088,1027,2131]` |
| Dark Expand reachable | PASS | Actual exact-label press now safely above navigation; `c3-08-dark-expanded.png`, Focus Stage `[0,693,1080,847]` |
| Dark expanded → collapsed | PASS | Actual Focus Stage press; `c3-09-dark-recollapsed.json` returns hit region ending2214 |
| Light collapsed Crowd | PASS | `c3-12-light-collapsed.png`, raw `c3-11-light-open.json`: identical safe hit/text geometry |
| Light expanded → collapsed | PASS | Actual presses; `c3-13-light-expanded.png` and `c3-14-light-recollapsed.json`, final bottom2214 |
| Other observed controls/safe areas | PASS, limited | Back `[42,83,158,199]`, Transcript `[42,1240,289,1356]`, expanded Crowd scroll region `[42,966,1038,2103]`; screenshots show visible result/transcript actions above navigation. This is not exhaustive focus-order acceptance |
| Live JUDGING after correction | BLOCKED | Retained fixture is now past its unchanged deadline and renders settlement pending. Production render case executes `judgingFocus=true`; native current-state results are not mislabeled as live JUDGING |
| Active Crowd/fighter keyboard opening, dismissal and mounted-draft repeat | BLOCKED in this phase | Current server context makes Crowd read-only and removes fighter publishing. No editable Room input was available; no denied send was attempted. Prior Phase4C.2 native OPEN/FINAL results remain historical |
| Focus Stage keyboard callback | PASS automated; native active-IME repeat BLOCKED | Existing actual handler still dismisses keyboard and collapses Crowd in behavioral test; native current-state focus transitions passed with IME already hidden |
| 1.3 font scale — bottom safe area | PASS | `c3-17-large-settled.png` / raw JSON: Expand hit region still `[0,2004,1080,2214]` |
| 1.3 font scale — text legibility/layout | **FAIL** | Same screenshot shows clipped proposition/official argument/notice text and truncated Transcript, result-action and Expand labels. This is an outstanding enlarged-text layout issue; no broad typography redesign was made |
| Font/settings restoration | PASS | Original `font_scale=1.0` restored in `finally`, then original System appearance selected; IME confirmed false. [Font evidence](phase4c3-font.json) |

At1.3, Android configuration recreation initially left the Room; the first capture did not contain Expand and the test correctly failed while restoring1.0. A bounded second run reopened the same normal Room route after recreation, captured the settled scaled layout, then restored1.0. Do not claim uninterrupted route retention across system font changes. This is recorded separately from the safe-area result.

Comparison with accepted Phase4C.2 OPEN/FINAL geometry: keyboard-open input/Send ended1333/1334, above IME1359; keyboard-closed composer ended2209/2210, above navigation2214. This phase's conditional is inactive for those mounted-composer/expanded layouts; behavioral regressions verify zero duplicate root inset. Fresh native replay of those active flows was not possible without another timed fixture, which was prohibited and not created.

### Final automated validation

All following final runs include the one-pixel refinement:

| Command | Result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS exit0 |
| `npm.cmd test` | PASS806 unit +232 configured lifecycle/UI/RPC =1,038, zero failures/skips, exit0 |
| `node --test scripts/crowd-stage-focus.test.cjs` | PASS4, original behavior preserved plus scoped layout regressions |
| `npm.cmd run test:duel` | PASS29, zero failures/skips |
| `node scripts/duel-render-smoke.cjs` | PASS22/22 controlled renders; native animation/media bridges remain limitations |
| `node --experimental-strip-types --test utils/immersiveClashUi.test.ts` | PASS15 |
| `git diff --check` | PASS |

Private logs: `.expo/ui-completion-phase4c/c3-final-*.log`, plus `c3-focus-test.log`. No assertions or authorization checks weakened.

### Preservation and remaining issues

[Final preservation and measured geometry](phase4c3-final.json): all1,920 original unrelated untracked hashes, environment files and111 source/QA migration hashes match. Protected resource identities unchanged. Current fixture counts remain Crowd2 / assists2 / official3 / linked Rooms1. No fictional fixture, message, assist or verdict was added, modified or cleaned up in this phase. Ordinary app reads/refresh behavior is not a claim of authentication-storage byte identity.

The task-owned standalone diagnostic JAR was hash-verified and removed; prior local inspector-state bytes restored. No app rebuild/install, accessibility-service change or permission reset. Original font1.0, System appearance, existing8081/55481 USB reverses and existing QA Metro configuration restored/preserved. No shared55321, hosted or E3.5.7 service access. HEAD unchanged; source/test work remains unstaged and uncommitted. No push, merge or deployment.

Twelve actual1080×2340 ADB screenshots remain **private** under `.expo/ui-completion-phase4c/c3-*.png`; status indicators may be personal. [Hash/dimension manifest](phase4c3-screenshots.json). Selected final evidence: dark `c3-07`, light `c3-12`, expanded `c3-08/13`, enlarged-text failure `c3-17`. `c3-03` is the intermediate one-pixel overlap; `c3-05` is Home, `c3-06` loading, and `c3-15` is the unsuccessful initial font-state capture. These are not accepted final Room screenshots. No raw image published or committed.

Outstanding: enlarged-text clipping/route recreation, development LOCAL/DEV badge obscuring part of the Crowd heading, and historical pending native B/C/large-history/media checks. Current live-JUDGING and active-keyboard repeats remain blocked by fixture expiry. **STOP: the collapsed-Crowd navigation overlap is corrected and measured; full native/accessibility acceptance is not claimed.**

## Phase 4C.4 — enlarged-text correction and product UI handoff

**PASS for the retained Room's settled layout at1.0/1.3 in dark/light, including readable full text, scroll access, Transcript/result sheets and Crowd transitions. Runtime font-change route restoration remains unresolved. This is bounded layout acceptance, not full Arena or release acceptance.**

### Baseline and diagnosis

Original checkout, branch `arena-ui-review`, HEAD `9bad8b0b51ffd1bab5975ceb72f7c75a487d798f` verified. Existing A50 `SM-A505F` / `RZ8M30DE9NL`, dev package `com.clash.v2.dev`, Metro PID10920/loopback8081, QA gateway55481 and system identifier7700622043081482277 reused. Application111, managed Storage/Auth/Realtime74/82/88 and cron off preserved. No duel, account, message, assist, verdict or other fixture was created. Retained Room remains `ar_8d837deeb59e3ace`, with an expired write window and actual **settlement-pending** presentation. [Preflight](phase4c4-preflight.json).

The documented `c3-17-large-settled.png` shows actual clipped glyphs and labels after a running-app font-scale change. An unchanged-source fresh launch at1.3 produced correctly wrapped proposition/notice/action text, but pinned outcome content left a small Stage scroll budget and pushed the official argument out of the first viewport. [Before fresh-launch evidence](phase4c4-font-before.json), private `c4-02-before-fresh.png`. This distinguishes runtime stale measurement from a blanket claim that all text was always broken at1.3.

Runtime scale/configuration changes also recreated the Android activity, returned to Home and logged **“Looks like you have configured linking in multiple places.”** An initial gate that navigated before Home hydration failed; bounded actual Home/Room gates succeeded after hydration. A separate no-JS-reload scale probe failed to keep the Room route and restored the scale. Accordingly the exact React Native cache internals and fully seamless runtime-scale recovery are **not independently established as fixed**. No global Expo Router/auth/native configuration change was made. Static1.3 native checks use fresh JS at that scale; the remaining configuration-navigation issue is a separate confirmed development-runtime finding.

### Scoped implementation

| Source | Correction |
|---|---|
| `components/liveArena/ArenaRoomText.tsx` — new | Font-aware native Text wrapper: changes the native text key when `useWindowDimensions().fontScale` changes, forwarding props/ref. This invalidates text measurement without keying the Room, draft or surrounding action. No font-size override, scaling disable or new truncation |
| `ClashProposition.tsx` | Uses the wrapper for the complete normal Stage proposition; existing explicit compact presentation remains unchanged |
| `CurrentArgumentStage.tsx` | Uses the wrapper; enlarged non-condensed presentation reads the entire actual body with no line cap, within the Stage scroll. Existing full-history access remains |
| `ImmersiveClash.tsx` | Uses font-aware labels/notices. At enlarged scale, **read-only** outcome/footer actions share Stage scroll space, with96dp bottom clearance for the absolute Crowd strip. Live mutation controls remain pinned in their original host across scale changes. Existing root safe-area ownership and `Keyboard.dismiss()` focus correction remain intact |
| `DuelRoomExperience.tsx` | Keys only the stateless Transcript/assist action presentation by font scale; callbacks, disabled permissions, sheets, composer and insets unchanged |
| `DuelRoomOutcome.tsx` | Font-aware support/action text, keyed animated heading and explicit Review/Return accessibility labels. No judgement, verdict, request or busy-state contract changes |

`LiveCrowdLayer.tsx` remains byte-identical to the phase starting hash, retaining the previously accepted flex-shrink correction. The fighter composer remains mounted as before; no new key is applied to it. No theme-global, Groups, World, Vault, Play, service, schema, RLS, engine or authentication source changed. Existing responsive type sizes remain; the correction does not reduce every font or suppress Android scaling.

The enlarged scroll-containment behavioral regression failed before correction (`result actions must scroll with enlarged Stage text`). Final tests execute actual transpiled production render/press code and the actual Stage layout rules, not source-text matching. `scripts/crowd-stage-focus.test.cjs` now has6 cases, retaining its original focus/inset cases and covering enlarged scrolling plus stable live action hosts. New `scripts/arena-room-text.test.cjs` tests production text-key changes, unchanged font-scaling props, content/style/ref/label forwarding. Together7 tests pass. These bridges do not simulate native Yoga; native screenshots/raw measurements remain the geometry evidence.

### Native acceptance and before/after

Four actual cases completed: [1.0 dark/light](phase4c4-native-1.0.json), [1.3 dark/light](phase4c4-native-1.3.json). All used fictional A's existing authentication and the retained read-only Room. No messages or forbidden expired operations were attempted.

| Check | 1.0 Dark / Light | 1.3 Dark / Light | Exact scope/evidence |
|---|---|---|---|
| Full proposition and actual current argument | PASS / PASS | PASS / PASS | Private `c4-10-*-top.png`, `c4-13-*-top.png`; enlarged complete argument/body and byline visible, no added ellipsis |
| Settlement notice/outcome copy | PASS / PASS | PASS / PASS | `*-bottom.png`: scroll reaches complete settlement-pending copy and actions; no winner fabricated |
| Transcript/result labels and actions | PASS / PASS | PASS / PASS | Actual measured presses opened history and Official result sheets; `*-history.png`, `*-result.png`; actual Close returned to Room |
| Collapsed → expanded → collapsed | PASS / PASS | PASS / PASS | Actual Expand and Focus Stage presses, `*-expanded.png`, `*-recollapsed.png` |
| Collapsed Crowd outside Android navigation | PASS / PASS | PASS / PASS | Navigation top2214. At1.0 hit region `[0,2004,1080,2214]`; at1.3 `[0,2003,1080,2213]` |
| Measured primary controls overlap | PASS / PASS | PASS / PASS | Pairwise checked Back, View result, Transcript, Review transcript, Return and Expand at recorded settled positions: zero intersections. This is not a claim about every offscreen or modal descendant |
| Back/Return reach Arena Home | PASS normal-scale follow-up | NOT separately repeated at1.3 | Actual settled Home hierarchy/screens `c4-24-navigation-settled` and `c4-26-return-settled`; immediate `c4-21` was transitional and is not navigation proof |
| Live sending/fighter draft/IME repeat | BLOCKED | BLOCKED | Expired fixture exposes no authorized live composer. Prior Phase4C.2 native results remain historical; production focus/inset tests still pass |
| Runtime font-change route retention | FAIL development runtime | FAIL development runtime | Activity recreation returned to Home with duplicate-linking error; not hidden by relaunch success |

Native density is420dpi (2.625px/dp). At1.0, Back/Transcript/Review/Return hit heights are116px (44.2dp); View result116px. At1.3, Transcript128px, Review/Return132px, View result166px, Back116px. Expand210px. All recorded hit rectangles are above system navigation; typography can grow and outcome content scrolls instead of being clipped by the fixed footer. The glyphs and full labels were also visually inspected, not accepted from accessibility labels alone.

Selected private comparisons:

- Before runtime clipping: `c3-17-large-settled.png`; unchanged-source fresh1.3 budget issue: `c4-02-before-fresh.png`.
- Enlarged after: `c4-13-dark-top.png`, `c4-13-dark-bottom.png`, `c4-13-light-bottom.png` show full proposition/argument and readable complete outcome/actions after scrolling.
- Normal after: `c4-10-dark-top.png`, `c4-10-light-result.png` preserve editorial presentation and actual result-sheet access.

The final live-only host-preservation guard was added after the main matrix. It is inactive for this non-live fixture, so its read-only matrix layout is unchanged; the exact final source was subsequently delivered, cached-code checked and rendered normally (`c4-20-final-normal`). [Final device bundle](phase4c4-phone-bundle.json): QA55481/matching anon, no server credentials, cached SHA256 `218e2f8f4c249288249bc77419a0b8867e0451aa11977e8a55328168282b4456`. Network/cache hash equality is recorded, not assumed. No new live-flow native acceptance is inferred from this guard.

### Final regression outputs

| Command | Actual final result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS exit0 |
| `npm.cmd test` | PASS806 unit +232 configured lifecycle/UI/RPC =1,038; zero failures/skips, exit0 |
| `node --test scripts/crowd-stage-focus.test.cjs scripts/arena-room-text.test.cjs` | PASS7, zero failures/skips |
| `npm.cmd run test:duel` | PASS29 |
| `node scripts/duel-render-smoke.cjs` | PASS22/22 controlled scenarios |
| `node --experimental-strip-types --test utils/arenaCrowd.test.ts utils/crowdPresentation.test.ts utils/immersiveClashUi.test.ts` | PASS37 /5 suites |
| `git diff --check` | PASS; Git only warns about its configured future LF→CRLF conversion for three edited files |

Final logs are `.expo/ui-completion-phase4c/c4-final-*.log`. The separately run focused suites overlap the configured suite; they are not added to1,038 as unique device/security assertions. No application source changed after these final runs. No test was weakened to force acceptance.

### Ranked product UI handoff — focused inventory, no implementation outside Arena

| Rank | Area / status | Evidence and exact next task |
|---|---|---|
| 1 — confirmed UI dead end | **Vault collection-card navigation** | `VaultScreen.tsx:180` supplies `onOpenCollection`, but `WorldChapter.tsx:44–96` never consumes it. `SeriesComposition.tsx:27–63` renders the collection title/metadata as plain Text; only episode posters call the legitimate Drop action. An empty collection therefore has no collection-entry control. This matches earlier native capture28 staying on creator listing, but no new Vault native run is claimed here. Add a separate accessible collection-title/card action using the existing collection ID/route; preserve poster → Drop behavior. Do not blindly replace `onOpenDrop` with collection navigation. Existing `/vault/collection/[collectionId]` / `CollectionWorld` already supports read/retry, honest empty series and episode detail routing |
| 2 — confirmed development-runtime navigation defect | **Font/configuration change recovery** | Device activity recreation returned to Home and emitted the duplicate-linking error. Investigate Expo Router/development-client root/link listener ownership and restore the intended route; keep authentication untouched. Whether it occurs in a release build remains unverified. Do not substitute new backend setup for this UI investigation |
| 3 — confirmed visible polish | **Development badge obstruction** | LOCAL/DEV badge still covers part of the collapsed Crowd heading in native captures. Move developer-only chrome out of the content hit/read area in a scoped task; it does not currently obscure the right-side Expand label or change authorization |
| 4 — missing native interaction coverage, not a proven broken contract | **Take reply composer and reactions** | `/take/[takeId].tsx:520–559` has keyboard-aware `RebuttalInput`, parent/depth handling and archived read-only state; `useTakeReaction.ts:19–43` has authenticated toggle/rollback and per-Take in-flight guard. Earlier nested discussion read passed, but reply keyboard, unsent long drafts, reaction error/retry and expiry transition still need current-device tests. Start with retained authorized Takes and unsent drafts; obtain separate approval for any mutation. Do not label existing reactions broken merely because they were not exercised |
| 5 — native controls/accessibility follow-up | **World navigation** | `WorldExperience.tsx:63–103` carries real activity status and country open/clear controls; Explore binds `goCountryPage`/select/surprise callbacks. Earlier native World observation was only partial. Test country selection → country route → Back, clear, map gestures, denied/unavailable and larger labels. The successful-empty copy still explicitly suppresses scaling (`allowFontScaling={false}`), a source-confirmed accessibility debt; this phase did not edit World |
| 6 — fixture-blocked coverage | **Play populated challenge/detail** | `PlayHomePanel.tsx:111` routes to `/explore/challenge/[id]`; detail imports actual fetch/join/entries/submission services and scope guards; inline retry exists. Current QA only has an honestly empty Play shell. First obtain an authorized supported challenge fixture and test read/access/Back/picker cancellation; join/submission writes require their own approval. No new ranking/backend infrastructure or fake challenge cards needed |
| 7 — supported discovery/membership; unsupported discussion capability | **Groups** | `GroupDiscovery.tsx:90–92` opens the actual `/arena/crews/${slug}` route; Crew profile implements About/Members with bounded pagination and existing membership rules. Recheck whole-card navigation/Back and large-label wrapping on retained Crew. Channels, pinned feeds and crew-linked discussion/duel contracts are not supplied by the current Crew API; this is an explicit product-scope decision, not a reason to invent posts or show enabled no-op discussion controls |

This ranking puts confirmed navigation/visible defects ahead of missing fixtures. The five requested product areas were inspected in current source; their old device evidence remains historical, not newly accepted by this inventory. No Vault/Play/Take/Groups/World implementation was changed during this phase.

### Preservation and stop

[Final verification](phase4c4-final.json): all1,920 original unrelated untracked hashes, original environment files,111 source/QA migration hashes and protected resource metadata preserved. QA system/managed ledgers/cron-off unchanged. Retained counts remain Crowd2 / assists2 / official3 / linked Rooms1. No shared/hosted/E3.5.7 connection, fixture cleanup, account/password modification, migration, grants/RLS change, native rebuild, Metro restart, commit, push, merge or deployment.

Original font1.0, System appearance and the exact existing8081/55481 reverse list restored/preserved. Temporary read-only diagnostic JARs were hash-verified and removed; prior local inspector-state bytes restored. No permission or accessibility-service changes. Existing QA Metro remains available. Source/test changes remain uncommitted and staging empty.

Thirty-six actual1080×2340 ADB PNGs are private under `.expo/ui-completion-phase4c/c4-*.png`; status indicators may be personal. [Filename/dimension/hash manifest](phase4c4-screenshots.json). No raw screenshot/log was published, committed or copied to Gallery. Intermediate Home/loading/gate-failure frames are retained for evidence and are not blanket passes.

**STOP: static normal/enlarged Room layout and requested UI handoff completed; runtime font-change navigation, developer badge obstruction and previously untested live/role/media journeys remain explicit limitations.**
