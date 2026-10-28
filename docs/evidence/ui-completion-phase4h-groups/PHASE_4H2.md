# Phase 4H.2 — Groups Members tab + membership interaction closeout

27 October 2026. **PASS for Members-tab display and About ↔ Members navigation on Samsung A50.** No confirmed product defect; prior “Members failed” was **stale inspection / off-target taps**. Membership **writes not executed** (approval blocked). No commit, push, merge or deployment.

HEAD: `cbe216a3c212a83c432f71b37b59a1debe5caa63` (`arena-ui-review`). Prior commits, uncommitted UI/Vault work, QA fixtures and evidence preserved. Crew unchanged: `ac_08433d0e2f9693fd` / `qa-repair-1d1e36`.

## Baseline

| Check | Result |
|---|---|
| Branch / HEAD | `arena-ui-review` @ `cbe216a…` |
| QA gateway | `http://127.0.0.1:55481/__qa/identity` → `clash-ui-qa-phase4a`, system id `7700622043081482277` |
| Device | `SM-A505F` / `RZ8M30DE9NL` / `com.clash.v2.dev` |
| Actor | Fictional **A** (OWNER of QA crew) |
| Fixture mutations | **None** |

## Members-tab root cause

| Hypothesis | Verdict |
|---|---|
| Touch interception / ScrollView steal | **Rejected** — accurate taps switch `tab` immediately |
| Tab state / `setTab` broken | **Rejected** — CDP `tab: "members"` after hit |
| Members loading failure | **Rejected** — members loaded while still on About |
| Unavailable member data | **Rejected** — RPC/list in fiber shows 2 rows |
| Stale uiautomator / miss-taps | **Confirmed** — Phase 4H.1 taps at ~`(720,1380)` / `(400,1540)` missed the Pressable; About underline pixels at **x 100–193, y 1603–1619**; Members underline at **x 303–449**. Working tap ≈ **`(270–370, 1585)`** |

**Intended behavior (production):** `app/arena/crews/[slug].tsx` — tabs `accessibilityRole="tab"` + `accessibilityState.selected`, `minHeight: 48`, `onPress → setTab`; members from `listArenaCrewMembers`; empty/error copy when none/failed. Matches runtime.

**Code fix:** **None.** No confirmed defect to patch.

## Native results (A50)

Evidence: pulled screencaps + CDP fiber (`crew-runtime.cjs`). Private captures under `.expo/ui-completion-phase4h2-groups/`. Hashes: [phase4h2-screenshots.json](phase4h2-screenshots.json).

| Check | Result | Evidence |
|---|---|---|
| Detail About baseline | PASS | `01-detail-about` — Joined, About selected |
| Miss-tap still About | PASS (diagnostic) | `03-members` + CDP `tab: "about"` |
| Members tab switch | PASS | `04-members` / `06-members-again` — CDP `tab: "members"` |
| Member identities / counts | PASS | UI + CDP: **Showing 2 of 2**; **QA Rowan** `@qa4c_a_1d1e36` owner; **QA Mira** `@qa4c_b_1d1e36` member. No invented members |
| About → Members → About | PASS | CDP + `05-about-again` |
| Header Back → Groups discovery | PASS | `07-after-back` — Groups selected; QA Repair Circle JOINED |
| Re-entry → About default | PASS | `08-reentry` |
| Re-entry → Members | PASS | `09-reentry-members`, `15-final-members` |
| Component executes on device | PASS | `CrewProfileScreen` fiber hooks live on A50 |

## Membership actions (display vs writes)

### Verified display (no mutations)

| Surface | Observed for A on `qa-repair-1d1e36` |
|---|---|
| Primary CTA | **Joined** — `crewJoinAction` → `member`; `GroupButton` **disabled** (`action !== 'join' && !== 'request'`) |
| Follow | **Hidden** while `viewer.isMember` (code: Follow only when `!isMember`) |
| Leave | **Hidden** for OWNER (`Leave group` only when `isMember && role !== 'OWNER'`) |
| Viewer CDP | `isMember: true`, `role: OWNER`, `activeCrewId: ac_08433d0e2f9693fd`, `isFollowing: false`, `joinMode: OPEN`, `memberCount: 2`, `followerCount: 0` |
| One-Crew copy | Present in code for `blocked_other`; **not shown** here because A is already member of this crew |

Contracts inspected (not invoked): `joinArenaCrew`, `requestArenaCrewJoin`, `leaveArenaCrew`, `followArenaCrew`, `unfollowArenaCrew` in `services/arenaCrewService.ts`; gating via `utils/arenaCrewIdentity.ts` `crewJoinAction`.

### Untested writes / approval blockers

| Action | Status |
|---|---|
| Join / leave / follow / unfollow native acceptance | **NOT EXECUTED** — requires explicit owner authorization |
| Safe fictional follow scenario | **BLOCKED** — only this QA crew is in scope; A is already a member, so Follow is hidden. A second OPEN crew (A non-member) would be needed for follow without violating one-Crew membership; creating that fixture was out of scope and not authorized |
| Remove A from crew / change ownership | **Forbidden** by phase restrictions |
| Bypass one-Crew restriction | **Forbidden** |

**Clearly:** membership **display** for owner/Joined is verified. Membership **writes** remain untested.

## Accessibility / theme / scale

| Check | Result |
|---|---|
| Tab roles / selected | PASS — `accessibilityRole="tab"`, `accessibilityState.selected` matches underline |
| Touch targets | PASS — `styles.tab.minHeight: 48`; Back `44×48` |
| Dark theme | PASS — primary matrix |
| Light (system `uimode night no`) | LIMITED — does not flip in-app theme preference; caused reload toast mid-session |
| Font scale 1.3× | LIMITED — system scale change triggered Expo reload / “(tabs) was removed…”; settings restored to **1.0** and night **yes** afterward |
| Phone settings restored | PASS — `font_scale=1.0`, `Night mode: yes` |

## Exact fixes

**None.** Members-tab issue was evidence/QA targeting, not production code.

## Regressions

| Command | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | PASS |
| `npm test` | PASS, **816 + 234 = 1,050** |
| `GroupDiscovery.test.cjs` | PASS, **8** |
| `publicMediaImageSource` + `arenaCrewIdentity` (strip-types) | PASS, **7** |

## Restrictions honored

No new chat/channel/invites/activity/moderation. No migrations/RLS/scheduler. No shared/hosted/E3.5.7. No resets/stashes/broad cleanup. No commit/push/merge/deploy. No unauthorized membership mutations.

## Remaining for later authorization

1. Owner-approved native follow on a second fictional OPEN crew (A non-member).
2. Owner-approved join/leave matrix on disposable crews (without removing A from `ac_08433d0e2f9693fd`).
3. In-app light theme + font-scale matrix without system settings that force Metro reload.

**STOP.**
