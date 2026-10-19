# Arena Engagement V1 — spectator slice

## Capability audit (before implementation)

Baseline: local and remote `arena-ui-review` both `e95001524fe039107ac705acd1ed814252687679`; V3 source/test changes are committed. Existing untracked screenshots, ZIP, Crew/development files are excluded from this work.

| Capability | Existing contract | Gap / boundary |
| --- | --- | --- |
| Official Stage | `duelTranscript`, `duelLatestMoment`, precise official ordering, fighter identities, history sheet, preview/full access | Latest author visible; timestamp not shown. Existing haptic fires on any changed ID, including regression to older history. |
| Back A/B | `ClashBackingActions`, per-component `backingSide` only | No backing service/RPC/table contract found. No persisted choice, supporter totals, server success or request failure to display. Preserve as explicitly per-visit support; do not claim server recording. |
| Private assists | Account-keyed panel, account guards in service, recipient selection, text/image/video upload, signer, fighter inbox, accept/reject, explicit publication, reports | Names are missing from recipient controls. Spectators cannot list their outgoing decision status; do not invent pending/rejected receipts. GIF not supported here. |
| Crowd | Separate hook/service, authorized context, identity version, pagination, bounded reconnect recovery, ID deduplication, retained retry keys, moderation callback, V3 virtualized rows | Keep contracts; improve announcement/autoscroll behavior without creating engagement. |
| Phases and payoff | `duelPresentation`, `DuelRoomOutcome`, canonical judging eligibility, transactional backend verdict, DRAW/cancelled/pending settlement states | Outcomes embedded below Stage content can be hard to find. No client settlement/clock changes. |
| Permission boundaries | Fighter-only composer via `presentation.canPublish`; locked/cancelled flows deny access; judges and publication gated by existing contracts | No new authorization, judging eligibility or service APIs. Client tests are contract evidence, not proof of deployed RLS. |
| Demo | Explicit development-only local state, varied pairs, backing/Crowd/assists, phase selectors and scripted outcomes | Add an explicit locally simulated incoming official moment and accessible result entry. Never publish demo data or call production services. |

Read: DuelRoomExperience, ImmersiveClash, CurrentArgumentStage, LiveCrowdLayer, ClashBackingActions, PrivateAssistPanel, DuelRoomOutcome, ClashEventHeader, ClashMoreSheet, duelPresentation, officialRecovery, useArenaCrowd, arenaAssistService and the existing demo model/surface. Backing searches covered services, hooks and migration definitions; no database was queried.

## Scope decision

Persistent social backing is unsupported under the current backend and is not implemented in this UI-only slice. The existing local selection will be labeled as lasting for this visit. Real assist acknowledgements and fighter inbox statuses remain server-derived through existing services; spectator rejection tracking is unsupported. Runtime verification will distinguish physical local demo behavior from mocked services and unexecuted real-backend paths.

Implementation and actual verification results follow. No push or merge is authorized until review.

## Implemented presentation slice

- Official arrivals use the existing precise timestamp/ID ordering. First hydration, repeated IDs, edits, older recovery rows, malformed dates and system messages do not trigger an arrival cue. The scoped high-water cursor retains no message body; a new viewer/Room scope resets it. A genuinely later argument receives a subtle border/label and real timestamp, with foreground accessibility announcement and reduced-motion-aware haptic request. Earlier arguments remain accessible through the existing history/full-text actions.
- Backing stays separate from judging and is scoped to the current Room/viewer identity. The label explicitly says **SUPPORT FOR THIS VISIT · NOT A JUDGEMENT**. No network backing operation or invented server acknowledgement exists.
- Private assists inherit the chosen side when opened, identify the fighter by name, preserve existing duplicate-send/account guards, and acknowledge the actual awaited send result. Failed drafts remain available for retry. Fighter acceptance/rejection/publication and private media contracts are unchanged.
- Crowd keeps virtualization, deduplication, moderation actions and the keyboard-safe composer. The new-message affordance no longer appears solely because a fetched array changed while its newest ID stayed the same; reading older rows does not force an incoming scroll.
- The authoritative phase hint is visible near the event header. Terminal/closed Rooms have an explicit result entry using the existing outcome component, including cancellation/pending-settlement handling. No clocks, winner calculations, judging eligibility or rewards changed.
- Demo developer controls explicitly simulate a new argument and advance the scripted phases. The shared Stage, named assist recipient, backing, Crowd and result presentation are reused. Every demo mutation remains local; fixture counts/ballots remain inside the labeled demo only.

Changed source: ImmersiveClash, CurrentArgumentStage, DuelRoomExperience, ClashBackingActions, PrivateAssistPanel, LiveCrowdLayer, duelPresentation, and the existing demo model/surface. Added spectator regression tests; adjusted existing V3 render tests to locate the animated Stage/Crowd by type after the new optional hint child. No service, schema, Supabase, auth, World, Vault, dependency or theme-global files changed.

## Executed verification

| Command | Actual result |
| --- | --- |
| `npm.cmd run typecheck` | PASS, exit 0 |
| `npm.cmd run test:unit` | PASS: 500 tests, 126 suites; 0 failures/skips; exit 0 |
| `node --test components/arena/ArenaVisualCompletion.test.cjs scripts/arena-live-v2-check.test.cjs scripts/arena-spectator-check.test.cjs scripts/arena-demo-check.test.cjs scripts/take-challenge-check.test.cjs` | PASS: 78 tests, 0 failures/skips; exit 0 |
| `node scripts/duel-render-smoke.cjs` | PASS: 22 controlled render scenarios |
| `node scripts/assist-service-check.cjs` | PASS: 10 controlled service checks |
| `node scripts/assist-signer-check.cjs` | PASS: 14 mocked signer checks |
| `node scripts/crowd-service-check.cjs` | PASS: 7 reported controlled checks |
| `git diff --check` | PASS |

The ten new spectator tests cover arrival ordering/microseconds, missing timestamps, spectator transcript exclusion, unchanged publishing/judging boundaries, local-only simulated arrival, backing separation, assist recipient isolation and explicit publication, plus the actual assist component with mocked services: named initial recipient, duplicate-send suppression, post-response acknowledgement, failure draft retention, account-key change and guest/staff denial. Existing demo tests check isolation from production mutations. These are client/controlled transport checks, **not deployed RLS or real-backend execution**. No SQL, pgTAP, real uploads, live signer or Supabase changes were performed. Expo Doctor was not rerun for this dependency-free UI change.

## Physical Samsung A50 review — 19 October 2026

The authorized SM-A505F ran the current development bundle through normal Metro 8081. A real phone-originated bundle response was recorded at HTTP 200; subsequent native controls and newly added presentation were visible. The initial foreground/accessibility attempt produced a blank capture and timed out; this was not counted as a pass. After the owner unlocked/opened CLASH, the existing development client was launched on 8081 successfully. No ADB restart, app-data clearing, installation, login/logout, permission change or backend reconfiguration was needed.

| Interaction | Actual native result |
| --- | --- |
| Enter Demo Arena → Live → Watch Duel | PASS: labeled fictional spectator Room rendered |
| More → Simulate next official argument | PASS: new author/text/time and latest-official cue appeared; physical haptic perception was not independently verified |
| Stage scroll → Back Priya Shah | PASS: selected-side UI changed; per-visit/non-judgement label visible |
| Private assist | PASS: Priya/Fighter B was preselected from backing and explicitly named |
| Compose and Send demo | PASS: fictional text appeared in local pending card for Fighter B, draft cleared; no real service call |
| Expand Crowd, focus composer | PASS: Samsung keyboard opened; compact two-fighter Stage, full-argument action, input and Send remained visible above IME |
| Send public Crowd message, Android Back | PASS: local text appeared once in Crowd; keyboard dismissed; Focus Stage restored the full Stage |
| Advance demo phase three times | PASS: FINAL, JUDGING and SETTLED appeared with the corresponding phase hints |
| View official result | PASS: shared outcome surface opened, explicitly SCRIPTED DEMO RESULT; no real verdict or reward created |
| Dark/light | PASS for captured settled/result surfaces; full light-theme interaction matrix and alternate device widths were not exercised |
| Exit demo/restoration | PASS: exited normally; original preferences byte-equal and reverse list exactly restored |

The latest argument/history and support controls live in a scrollable Stage; the screenshot at the top of FINAL intentionally shows the lower support controls partially below that viewport. Scrolling exposes them. No claim is made that every control fits simultaneously. The existing outcome animation remains unchanged. Reduced-motion system settings were not changed or physically tested; gating is covered by source/render checks. Native fighter inbox accept/reject/publication, media upload/playback, real-network recovery and real-backend privacy are **NOT TESTED** in this checkpoint.

## Local screenshot evidence and restoration

Selected native screenshots are retained privately in `.expo/live-v2/native/screens/`, all **1080 × 2340**:

- `engagement-01-spectator.png`
- `engagement-03-backing.png`
- `engagement-04-private-assist.png`
- `engagement-05-assist-draft.png`
- `engagement-06-assist-sent.png`
- `engagement-08-crowd-keyboard-clean.png`
- `engagement-09-final.png`
- `engagement-10-judging.png`
- `engagement-12-light-settled.png`
- `engagement-13-light-result.png`

Their dimensions/SHA-256 values are recorded in the private `.expo/live-v2/native/engagement-capture-manifest.json`. Two additional captures contained personal notification banners and are excluded from selected review evidence. No raw images, device logs, account data, preferences, ZIPs or private manifests are committed or published. The final screenshot captures precede the small clarification from “roles above” to “roles in More” in demo assist instructions; that copy change is automated-test verified.

`node .expo/live-v2/native/restore-device.cjs` returned PASS: original development preferences restored byte-for-byte and ADB reverses exactly restored to 8081/55321. Existing Metro PID 25432 continues listening on normal 8081. No disposable backend, hosted access, database writes or temporary Metro instance was used. Unrelated working-tree files remain untouched.

## Remaining limitations / review boundary

This is a functioning UI/local-demo spectator slice with existing real service integration preserved. Persisted social backing and spectator outgoing rejection tracking are unsupported capabilities requiring a separately approved backend/product contract. No fake persisted support or success states were added. Real-account end-to-end/RLS, media and network retry verification remain outstanding. Review the local captures and implementation before authorizing a push. This task makes a **local commit only**, with no push or merge.
