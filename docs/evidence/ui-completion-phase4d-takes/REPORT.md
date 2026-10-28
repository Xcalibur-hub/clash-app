# Phase 4D.3 — Take discussions and profile navigation

**Latest update: Phase 4D.3B completed below. Authorized native reactions and both reply publications PASS; four reaction RPCs and two comment RPCs, all successful. The following original Phase 4D.3 summary is historical.**

27 October 2026. **PARTIAL native acceptance. Author navigation FIXED; read-only discussion/draft checks PASS. Live reaction and reply publication BLOCKED pending specific owner approval. Archived native coverage BLOCKED by missing expired fixture.** No application mutations were performed.

Original checkout `C:\Users\91962\Desktop\Clash`, branch `arena-ui-review`, unchanged HEAD `9bad8b0b51ffd1bab5975ceb72f7c75a487d798f`. Changes remain uncommitted.

## Verified baseline and authorization

QA gateway remains `http://127.0.0.1:55481`, project `clash-ui-qa-phase4a`, database system identifier `7700622043081482277`. Application/Storage/Auth/Realtime ledgers remain 111/74/82/88; cron off, zero recorded runs. No infrastructure was started, reconfigured or recreated.

Samsung A50 `SM-A505F`, serial `RZ8M30DE9NL`, existing `com.clash.v2.dev`. Read-only live-runtime inspection confirmed the actual Supabase client targets QA55481 and fictional A remains authenticated. No session/token/password was emitted. Metro8081 and USB routing were reused unchanged; no dotenv startup, Metro restart or reinstall.

Server-clock preflight: `2026-10-27T05:14:35.909766Z`. All four retained Takes were active with future deadlines. Main discussion Take `take_15ae4959a6b2a21e` expires `2026-10-27T16:16:58.252956Z`. No existing expired Take was found. See [baseline](baseline.json).

A bounded approval request was presented for fictional A, exclusively on that Take: up to six reaction-toggle requests for add/remove/rapid-tap checks and exactly one fictional top-level plus one nested reply. No approval response had arrived by reporting. Previous Crowd/assist approvals were not reused for Take writes. **No reaction toggle, reply publication, disallowed-write attempt or other application mutation was invoked. New fixture IDs: none.**

## Native scenarios

| Scenario | Result | Actual evidence / limit |
|---|---|---|
| Normal Home feed → existing Take | PASS | Scrolled actual feed and tapped its labeled card; live Router pathname `/take/take_15ae4959a6b2a21e` |
| Author and full Take content | PASS | QA Rowan, matching author ID and full fictional repairable-phone statement |
| Existing nested discussion | PASS | Actual View replies action loaded B's root and C's child; IDs/depths verified against QA rows |
| Top-level reply composer | PASS | Actual native input focus; empty draft confirmed through production TextInput props |
| Short draft, keyboard Back/dismiss and refocus | PASS | 25-character fictional unsent draft retained; no route exit on keyboard dismissal |
| Long draft and Send geometry | PASS | 180-character fictional unsent draft; input/Send above IME; no Send action |
| Transcript gesture with draft | PASS, limited | Gesture restricted to measured transcript area; 180 characters retained. Android on-drag dismissal occurred as configured; this is not a keyboard-remains-open claim |
| Select reply to root / nested child | PASS, composition only | Actual reply controls selected correct parent IDs and depths1/2; both cancelled without posting |
| Detail author → profile → Back | Initial FAIL, then FIXED/PASS | New native action opened `/profile/u_5245a931e195412f8223dabc34c66fc9`; Back returned to the same Take |
| Reaction add/remove and live count synchronization | BLOCKED | Specific write approval pending; current reaction count remains0 |
| Native double-tap/in-flight reaction guard | BLOCKED | No authorized toggle calls; mocked production-hook tests passed separately |
| Publish one root and one nested reply; verify new persistence | BLOCKED | Specific write approval pending; existing comment count remains2 |
| Native archived/expired read-only UI | BLOCKED | No expired retained Take; no timestamps/statuses changed and no fixture invented |
| Real expired/disallowed RPC denial | BLOCKED | No suitable expired fixture/write approval; catalog inspection is not an executed denial test |
| Loading/error/retry and expiry transition | PASS automated; NOT TESTED native | Existing production-route controlled tests; backend failure/clock manipulation not induced |
| Other-author profile destinations / light theme / enlarged text | NOT TESTED in this phase | Own-author profile checked physically; general callback uses actual author ID. Prior layout acceptance is not relabeled as new coverage |

Existing root `c_6c3a6976aede1098`, author QA B, depth0. Existing child `c_3d784ddb7a98f4d4`, author QA C, parent=root, depth1. Selecting Reply on the root supplied parent=root/depth1; selecting Reply on its child supplied parent=child/depth2. See [nested rendering](r3-nested-thread.json), [root target](r3-parent-target.json), [child target](r3-nested-reply-target.json).

### Measured keyboard and touch geometry

Native display1080×2340, density420 (~2.625px/dp); IME begins at y1359, system navigation at y2214.

- Short draft input `[76,1047,1004,1194]`; long draft input `[76,942,1004,1194]`.
- Send `[864,1215,1004,1330]`: about44dp high, wholly above IME. Parent-reply Send similarly ends at y1330.
- After transcript gesture/IME dismissal, long input ends at y1855 and Send at y1991, above system navigation.
- New author action `[42,389,1038,505]`: about44.2dp high. No nested competing action was introduced.

[Draft summary](draft-summary.json) and per-capture raw-bound JSON distinguish native geometry from JS state. An initially empty field reported placeholder text as length14 in Android accessibility; production TextInput props confirmed actual length0 before editing. Placeholder length was not treated as user content.

The first automated draft-clear pass left44 characters of task-created text. That cleanup assertion failed and was not counted as an app or layout pass. A second bounded native deletion pass removed only the remaining fictional draft; actual input value length0 was verified before navigation and at final preservation. No send occurred. Short/long assertions preceding cleanup and stored native captures remain valid; the cleanup failure is explicitly retained.

## Scoped correction

Confirmed source/native gap: `TakeEditorialHeader` rendered ArenaIdentity as display-only text. Its route supplied no profile action; live component props independently confirmed `authorAction:false` before the change.

- `app/take/[takeId].tsx`: passes the existing profile destination using the actual `author.id`.
- `components/arena/TakeEditorialHeader.tsx`: optional `onOpenAuthor`, labeled button and min44dp target around the identity only. Static previews without a callback remain plain identity content, not disabled/dead buttons. Typography and scaling unchanged.
- `scripts/take-detail-check.test.cjs`: adds actual route-callback coverage for active and archived reads.
- New `scripts/take-profile-navigation.test.cjs`: mounted production header/action/preview tests.
- New `scripts/take-reaction-behavior.test.cjs`: actual hook with deferred mocked transport, duplicate suppression, authoritative add/remove totals, rollback/no retry and account-switch rejection. No production reaction logic was changed.

Before-fix route test was RED: missing `onOpenAuthor`. Afterward the actual phone exposed the new action, executed its correct profile route and returned with Back. Live props show `authorAction:true`. This proves changed code executes on the phone; it is not merely a host bundle compilation claim. Existing QA SDK target and actor were reverified at completion. No claim that the cached full-file hash captures every Fast Refresh module update.

## Existing mutation contracts inspected

`apiService.toggleTakeReaction` calls `toggle_take_reaction(p_take_id)`, which derives the viewer, owns the aggregate and rejects expired/removed Takes and blocked relationships. `useTakeReaction` has a synchronous per-Take in-flight guard, authoritative response synchronization and rejection rollback.

`RebuttalInput` calls `postComment` → `create_comment`, carrying `p_parent_comment_id`; it checks account scope and current user, owns a busy ref and retains rejected drafts. The **actual deployed** function was inspected, not inferred solely from an older migration: it explicitly requires an active Take with `expires_at > now()`, otherwise raises42501. Effective EXECUTE is authenticated=true, anon=false for both RPCs. [Read-only catalog evidence](reply-contract-catalog.json), [final grant checks](final-verification.json). These facts do not substitute for live mutation/denial acceptance.

## Validation

| Final check | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | PASS exit0 |
| `npm test` | PASS806 +232 = **1,038**, zero failed/skipped |
| Focused Take route/profile/reaction/challenge plus preserved Vault/Crowd/DEV/Room text suites | PASS **54**, zero failed/skipped |
| `npm run test:duel:render` | PASS **22/22** controlled scenarios |
| `git diff --check` | PASS; configured line-ending warnings only |

Logs: `.expo/ui-completion-phase4d3/{typecheck,npm-test,focused,render}.log`. [Counts and hashes](final-verification.json). Route tests execute production callbacks with controlled hooks/service boundaries; header/reaction tests mount actual React components/hooks with mocked native/transport dependencies. They are not live backend or device reaction tests. Existing focused suites include mixed test styles; no source-text assertion is offered as proof of this correction or native geometry. Separately run suites overlap configured tests.

## Private evidence and preservation

Fifteen real unedited ADB screenshots remain ignored under `.expo/ui-completion-phase4d3/`, all1080×2340. [Manifest](screenshots.json). Examples: `r3-feed-target.png`, `r3-take-initial.png` (before), `r3-short-draft.png`, `r3-long-draft.png`, `r3-long-after-scroll.png`, `r3-author-action-after.png`, `r3-nested-visible.png`, `r3-parent-reply-composer.png`, `r3-profile-after.png`. Transient Refreshing/loading frames and status-bar notification indicators are retained privately, not published or presented as clean whole-screen acceptance. Geometry logs allowlist fictional labels and draft lengths only.

All prior Arena/Vault/DEV source and focused tests were hash-preserved. All1,920 originally recorded unrelated untracked files, environment files, native preferences, 111 source/copied migration hashes and protected-resource metadata are unchanged. QA comments remain2, reactions0; no new fixtures, accounts, timed duels or application mutations. No shared/hosted/E3.5.7 database access.

Original reverse routes8081/55481, font1.0 and System appearance remain; keyboard dismissed and original empty draft restored. Three exact task-owned inspector JAR versions were hash-verified and removed. Existing authentication preserved. No commit, push, merge, deployment or infrastructure changes.

**Next gate:** obtain the pending bounded Take-write approval before live reaction/reply acceptance. A real expired retained fixture or separately agreed future test is needed for native/archive denial coverage. Stop after Phase4D.3.

---

## Phase 4D.3B - authorized fictional write acceptance

27 October 2026, approximately 11:57-12:08 IST. **Native reaction add/remove, bounded rapid taps, root publication, nested publication and persistence: PASS.** This continuation supersedes the earlier write-authorization blockers above; that original report remains historical. Failure rollback and expired-write rejection were not exercised on the phone.

HEAD remains `9bad8b0b51ffd1bab5975ceb72f7c75a487d798f`, branch `arena-ui-review`. No application source or test changes were required in this continuation. All existing Arena, Vault, development-chrome and Take corrections remain uncommitted. No commit, push or deployment.

### Isolation and writable-window gate

[Preflight](b-preflight.json) verified the actual live app client points to `http://127.0.0.1:55481`, fictional A is authenticated, and the current route is `/take/take_15ae4959a6b2a21e`. The device remained the existing Samsung A50/dev installation. The database system identifier is `7700622043081482277`; application/Storage/Auth/Realtime ledgers are 111/74/82/88, cron off and zero cron runs. No infrastructure or account changes.

At server time `2026-10-27T06:27:11.223275Z`, the authorized Take was active and writable, expiring at `2026-10-27T16:16:58.252956Z`. Initial reactions were zero and comments two. The successful server RPCs independently enforced their own window and permissions. No timestamps or status values were changed.

### Actual native operations and RPC accounting

All writes used real accessibility-located Android controls and the existing composer. No debugger/service invocation performed a mutation. A temporary in-memory diagnostic wrapper delegated unchanged arguments and receiver to the original `fetch`, recording only the two RPC names, request time and HTTP status; no headers, tokens, credentials or request bodies were retained. It observed four reaction requests and two comment requests, all HTTP 200, and was removed afterward with the original function restored. [Final counter](b-rpc-restore.json).

Hermes does not support CDP `Network.enable`; that attempted passive observer was not treated as working evidence. An initial asynchronous API probe also failed because Hermes Runtime.evaluate does not compile async arrow functions. The corrected read-only probe used Promise chains and polled a sanitized result. Early `b-state-*.json` entries containing internal Promise fields are **not** authenticated API evidence; use the completed `b-api-*.json` results linked below. No failed diagnostic issued a write.

| Scenario | Native result | Corroboration and limit |
|---|---|---|
| Reaction add | PASS | Actual React button press; selected accessibility state and visible count 1. One HTTP 200 RPC |
| Reaction remove | PASS | Second press; server aggregate and row count returned to zero |
| Two rapid native taps | PASS for observed behavior | Two back-to-back Android input taps on freshly measured button bounds produced one additional RPC; selected state, database and authenticated API agreed on count 1. Does not independently prove that both touches reached the JS callback while its request was pending |
| Restore original reaction selection | PASS | Fourth and final toggle; native button unselected, API aggregate and database rows zero |
| Root reply | PASS | Typed 87 characters, tapped native Send once; one successful `create_comment` |
| Nested reply | PASS | Actual Reply control on the newly created root selected its exact parent and depth 1. Typed 88 characters; tapped native Send reply once |
| Persistence after leaving/re-entering | PASS | Back to actual Home feed, normal Take-card re-entry, View replies. New root and child rendered again with correct identity and nesting; authenticated API independently returned both |
| Pending optimistic frame | NOT TESTED as a distinct native frame | Final selected/count synchronization verified. No artificial network delay; transient pre-response state not captured. Existing deferred production-hook tests cover optimism and guards separately |
| Natural mutation failure/rollback | NOT OBSERVED | All six calls succeeded. No outage, prohibited write or expired mutation induced |
| Archived/expired denial | BLOCKED | Authorized Take remained active; no replacement Take, time manipulation or additional write attempt |

Observed reaction sequence: **0 -> 1 -> 0 -> 1 -> 0**, with **4/6** authorized reaction requests used. Exactly **2/2** authorized replies were published; neither was retried. [Rapid-state database read](b-state-rapid.json), [authenticated rapid-state API](b-api-rapid.json), [final authenticated API](b-api-final.json), [native re-entry props](b-persistence-runtime.json).

### Retained fixture IDs

Both new rows belong to fictional A, profile `u_5245a931e195412f8223dabc34c66fc9`, on `take_15ae4959a6b2a21e`:

| Row | ID | Parent | Depth |
|---|---|---|---|
| New root | `c_6355ae7180b2633c` | null | 0 |
| New nested reply | `c_841235572dd0b8c3` | `c_6355ae7180b2633c` | 1 |

Root text: `Fictional QA 4D3B root reply. Clear repair information helps people keep phones longer.`

Nested text: `Fictional QA 4D3B nested reply. Affordable replacement parts make repair support useful.`

Database parent IDs, authenticated PostgREST reads using the app's existing session, and rendered production comment depths agree. Total comments rose from two to four; original B/C rows remain intact. Both new rows are not removed. Fixtures remain for later explicitly authorized cleanup. No reaction rows remain. [Final verification](b-final-verification.json).

### Native screenshots and geometry

Ten unedited ADB PNGs, each 1080x2340, remain local/ignored under `.expo/ui-completion-phase4d3/`, prefixed `b-`. [Private filename/hash manifest](b-screenshots.json). No images were staged or uploaded; status bars contain personal notification indicators, so screenshots remain private.

Useful frames: `b-reaction-added.png`, `b-rapid-selected.png`, `b-root-draft.png`, `b-root-detail.png`, `b-nested-draft.png`, `b-nested-published.png`, `b-nested-reentered.png`, `b-final-zero.png`. `b-root-published.png` actually shows the normal Home feed after Back, including the new reply preview; it is not a detail-screen capture. Draft frames contain a development Refreshing banner and are offered for composer geometry, not unobscured header acceptance.

Root and nested keyboard input bounds: `[76,1040,1004,1194]`. Actual Send/Send reply **button** bounds: `[864,1215,1004,1330]`, about 44dp high and above the IME top at y1359. The smaller child Text node `[895,1251,972,1293]` is not the touch target. Final closed-keyboard composer `[76,2085,878,2201]` ends above system navigation at y2214. Actual submission succeeded through those controls; both drafts cleared after success. Dark appearance and normal font scale were exercised; no new light/enlarged-text acceptance is claimed here.

### Rerun validation and preservation

| Check | Actual result |
|---|---|
| `npx tsc --noEmit --incremental false` | PASS, exit 0 |
| `npm test` | PASS, 806 + 232 = **1,038**, zero failures/skips |
| Focused Take/profile/reaction/challenge and preserved Vault/Crowd/DEV/Room-text tests | PASS, **54**, zero failures/skips |
| `npm run test:duel:render` | PASS, **22** scenarios, exit 0; existing pointerEvents deprecation warning |
| `git diff --check` | PASS, exit 0; configured line-ending warnings only |

Logs are ignored under `.expo/ui-completion-phase4d3b/`; hashes/counts are in [final verification](b-final-verification.json). Focused suites overlap the full suite; counts are not summed into a unique-test claim. Deferred-hook tests use controlled transport and do not substitute for the native results above.

Preservation checks passed for the previous Arena/Vault/DEV corrections, all 1,920 originally recorded unrelated untracked files, environment files, 111 source and QA-copy migration hashes, protected container/network/volume metadata, native development preferences and exact USB reverses 8081/55481. Existing A authentication, font 1.0 and System appearance remain. Keyboard closed, draft empty, route still the authorized Take. The task-owned inspector JAR was hash-verified and removed; the failed passive observer process was stopped; diagnostic fetch restored. Metro/backend configuration remained unchanged. No shared/hosted/E3.5.7 database access, schema/security change, fixture cleanup or application source edit in 4D.3B.

**Remaining limits:** native failure/rollback, expired-state denial, instantaneous optimistic frames and light/enlarged-text write layouts remain unverified in this bounded run. No reproducible reaction/publication defect required a new client correction. Stop after this report.
