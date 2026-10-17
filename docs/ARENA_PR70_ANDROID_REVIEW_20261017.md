# PR #70 — physical Samsung A50 review, 17 October 2026

**Native launch gate: FAIL. Guest navigation: PASS. Authenticated Groups and canonical Live Room: BLOCKED.**

Tested application revision: `e214b33426574abf8662e9a9be515393f6c7d5fc`, branch `integration/arena-groups-live-20261017`. No application code or approved design was changed. This follow-up supersedes the earlier **device unavailable** blocker, but does not establish an overall native pass.

## Actual launch and environment

ADB detected the connected, unlocked Samsung A50 (`SM-A505F`). Candidate Metro ran on 8083 from the integration worktree. The launcher reused the existing development configuration, asserted a loopback backend on 55321, disabled dotenv autoload and enabled the existing development-only motion/navigation flags. No backend was created, started, reset, migrated or reconfigured. No hosted service was accessed.

The existing loopback Auth health endpoint was **unreachable**. App logs reported the 12-second Arena hydration timeout and retryable network failures. The visible app session was a guest; no sign-in/out or credential submission was performed. Routine SDK startup/refresh behavior is not a claim that authentication storage is byte-identical.

Both invocations of the existing `scripts/android-bundle-preflight.cjs` in `arena` mode returned **exit 1**, `launch_gate_incomplete`:

| Gate check | First launch | Relaunch after Skip |
|---|---|---|
| Device connected | true | true |
| Metro reachable | true | true |
| Real Android bundle served | true, HTTP 200, 70,332 ms | true, HTTP 200, 311 ms |
| Bundle executed | true | true |
| Usable Arena UI at gate check | false | false |

Fresh hierarchy inspection after each failure showed **onboarding**, not Arena. Using the actual “Skip the introduction” control opened the guest Arena. Cold relaunch returned to onboarding again. `app/onboard.tsx` dispatches `markOnboarded()` and replaces the route; `app/index.tsx` chooses onboarding when neither signed-in nor onboarded. Successful persistence across this offline cold start was not demonstrated. The exact persistence cause was not investigated further or changed. The gate itself was not weakened or edited.

This is a real served/executed candidate bundle, not an embedded-bundle inference. It is also **not** a passed cold-launch gate. See [first result](evidence/arena-pr70-android-20261017/gate-initial.json), [relaunch](evidence/arena-pr70-android-20261017/gate-relaunch.json), and [request evidence](evidence/arena-pr70-android-20261017/bundle-trace.jsonl).

## Physical interactions and exact limits

| Scenario | Result | Native evidence / limitation |
|---|---|---|
| Groups navigation | PASS, guest UI | Actual Arena Groups rail press; redesigned “Better together” surface rendered. |
| Joined / Explore | PASS, guest UI | Actual tab presses; selected Joined and Explore screenshots. No authenticated membership rows were available. |
| Specialty control | PARTIAL | Actual Tech control pressed. Backend filtering/results not verified. |
| Create group gate | PASS | Actual Create a group control opened local sign-in. No group created or membership operation attempted. |
| Live discovery navigation | PASS for navigation only | Actual Live rail press rendered Live Arena and its challenge/archive shortcuts. No canonical Room opened. |
| Challenge Inbox / Back | PASS, guest gate | Actual shortcut opened Challenge Inbox with Sign in; Back to Arena returned successfully. |
| Auth keyboard focus / dismissal | PASS, limited | Email field focused; Android reported `mInputShown=true`, then false after Back. No deliberate field edits or credential submission. Does not verify Crowd/argument keyboard behavior. |
| Keyboard scroll automation | FAIL | Scroll attempt used app container bounds occluded by the IME and accidentally appended a character to the unsubmitted local email draft. See recovery below. Not counted as a successful scroll/layout check. |
| Visible safe areas | PARTIAL | Guest Groups and Live primary controls visually fit between status/navigation regions; Back to Home remained above the dock. Development-only LOCAL badge overlapped the CLASH wordmark. No full-screen duel/composer or large-font/light-theme coverage. |
| Authenticated group profile/members | BLOCKED | Existing backend unreachable and no authenticated session. |
| Canonical Stage, Crowd, media, private assists | BLOCKED | No readable server-backed Room could be selected. No fake Room or messages were created. |
| Live composer keyboard, playback and recipient isolation | NOT TESTED | Require authenticated canonical Room and working unchanged backend. |

## Confirmed data-state failure

Live displayed **“0 live now”**, **“No live duels yet”** and **“No topic rooms to explore right now”** while the backend was unavailable. These are not verified server-derived empty results.

The confirmed chain is:

- `app/(tabs)/index.tsx` catches failed `fetchLiveTopics()` calls and replaces topics with an empty array, without passing that error state to Live.
- `ArenaClashes.tsx` skips the discovery RPC for a guest and clears loading without setting an error.
- With no topics/entries and error false, it renders a numeric zero and empty-state claims.

The same count/guest logic exists at baseline `76bf0bf`; this is not attributed to the new Groups or Live style commits. It was reported without modifying approved UI or backend behavior. Home correctly showed **“Couldn’t load Arena”**, which makes the Live zero-count claim particularly misleading in this run.

## Automation failure and recovery

The keyboard-overlap swipe was an automation error, not proof of a successful scroll or an application submission. The initial cleanup comparison detected the unexpected draft change and stopped before configuration restoration. After returning through normal navigation and reopening sign-in, both fields matched their captured original values. No sign-in request was submitted, password changed, or app data cleared. [Recovery evidence](evidence/arena-pr70-android-20261017/credential-draft-recovery.json).

Future automation must account for the visible IME boundary before scrolling an app container. Fresh accessibility bounds alone did not establish that the gesture started in an unobscured app region. No change to the existing primary-checkout driver was made.

## Screenshots

**11 actual PNG screenshots** were captured and retained privately under:

```text
.expo/arena-integration-20261017/.expo/native-review-20261017/screens/
```

Review examples: `groups-explore.png`, `groups-joined.png`, `live-offline-empty.png`, `onboarding-on-relaunch.png`, `auth-keyboard-open.png`, `auth-keyboard-closed.png`, `auth-keyboard-scrolled.png`, and `final-home-offline.png`. `arena-gate-failure.png` caught a transient blank frame before the subsequent hierarchy showed onboarding; it is not a screenshot of a successfully loaded Arena.

Raw screenshots and XML/logs are ignored and protected by private NTFS permissions. They are not uploaded to GitHub because status bars contain personal notification indicators and auth screens contain built-in local development sign-in details. [Filename/size/SHA-256 manifest](evidence/arena-pr70-android-20261017/screenshots.json) records captures without publishing their contents.

## Restoration and next prerequisites

Original native development preferences restored **byte-for-byte** to localhost:8081; original ADB reverse list restored **exactly**. Only task-added reverses and temporary phone files were removed. The task-owned Metro process tree was identity-checked and stopped. No normal Metro was listening at the start of this review, and none was started during cleanup. The test app was closed after restoration. [Restoration evidence](evidence/arena-pr70-android-20261017/restoration.json).

No unrelated files, primary-checkout branch, application source, backend configuration, database, native installation, location permissions or production infrastructure was changed. Only this report and sanitized evidence are added to PR #70. No automated suite was rerun: previous automated results remain historical, and no application code changed here.

Next: restore availability of the existing backend through a separately agreed operational action, establish a working authenticated session without clearing data, then rerun the cold-launch gate and authenticated Groups/Room/keyboard checks. Keep PR #70 **OPEN and DRAFT**. No merge, deployment or production-readiness claim.
