# Phase 4F.1 — Play challenge discovery, detail and authorized participation

27 October 2026. **PARTIAL native acceptance.** Play discovery (successful empty), My Play empty, missing-challenge detail and Back/session preservation **PASS** on the Samsung A50. **Join / submit / entry-reaction participation is BLOCKED** because QA has zero `explore_challenges` / treasure fixtures and no write approval was granted for seeding or mutations. No overall Play-complete claim.

## Git HEAD reconciliation (read-only)

| Check | Result |
|---|---|
| `git rev-parse HEAD` | `6ca92225dfc1521851781db17339d427063d8a7e` |
| Reported local commit | `6ca9222` (`fix(world): gate Android MapView behind Maps rebuild opt-in`) |
| Object exists | yes (`commit`) |
| `6ca9222` is ancestor of / equal to HEAD | yes (HEAD **is** that commit) |
| Destructive ops | none — no reset, cherry-pick, amend or replacement commit |

Unrelated Arena/Vault/Take/World uncommitted work and existing QA evidence directories were left untouched. World fallback from Phase 4E.2 was not reopened; no map-provider research.

Branch `arena-ui-review`. Original checkout `C:\Users\91962\Desktop\Clash`. No push, merge or deployment.

## Baseline

[baseline.json](baseline.json). QA DB `clash-ui-qa-phase4a-db-1`, system identifier `7700622043081482277`, client URL via existing reverse `http://127.0.0.1:55481`. Metro PID10920 on `8081`. Device `SM-A505F` / `RZ8M30DE9NL`, package `com.clash.v2.dev`, process **2546** stable. Fictional A remains authenticated (`Local Supabase session`).

Read-only inventory:

| Table / RPC | Count / payload |
|---|---|
| `explore_challenges` | **0** |
| `explore_treasure_hunts` | **0** |
| `explore_challenge_participants` / `entries` | **0** |
| `list_play_home()` | `{"challenges":[],"treasures":[],...}` |

QA profiles `qa4c_a/b/c` are role **viewer** (cannot `host_explore_challenge` without creator vault / elevated role). `authenticated` has no INSERT on `explore_challenges`.

## Native scenarios

| Scenario | Result | Evidence |
|---|---|---|
| Home dock → Explore → Play mode | PASS | Real taps; `Play, selected`; PLAY kicker |
| Challenges tab successful empty | PASS | “No active challenges right now. Check back soon.” — not an error/loading false-empty |
| Treasure tab successful empty | PASS | “No treasure hunts right now…” |
| My Play → empty sections → Back | PASS | MY PLAY / Nothing here yet; returned with session chip |
| Missing challenge deep link | PASS | `clash-dev://explore/challenge/ec_missing_4f1` → “challenge not found” + Back; process alive |
| Session after Back | PASS | `Local Supabase session` retained |
| Open active challenge → Join | **BLOCKED** | No active challenge row to open |
| Submit photo/video entry | **BLOCKED** | Requires joined active challenge + media + write approval |
| Entry reaction toggle | **BLOCKED** | No entries |
| Closed/ended challenge UI | **BLOCKED** | No ended fixture |
| Picker cancel / upload failure retry | **NOT TESTED** | Needs participation surface |

Private captures under `.expo/ui-completion-phase4f-play/` (`02-play.png`, `03-my-play.png`, `06-missing-challenge.png`, `09-challenges-empty.png` + UI XML). Not staged.

## Scoped correction

Confirmed source defect on the detail hero Back: **40×40** style (under 44dp). Minimal change only:

- `app/explore/challenge/[id].tsx` — Back control **44×44**.
- `scripts/play-challenge-accessibility.test.cjs` — style + Join/missing contracts.

Play home already uses `ReadFeedback` + retry (Phase 1 coverage). No World/map files touched.

## Authorized participation — approval request (not executed)

To complete join/submit acceptance without inventing silent fixtures, owner approval is required for **exactly**:

1. **One** public `explore_challenges` row: fictional title, `status=active`, `challenge_type=GLOBAL`, window covering the test day (SQL service insert **or** temporary creator capability + `host_explore_challenge` for a QA account).
2. Fictional **A**: one `join_challenge` call on that id.
3. Optional: one photo `submit_challenge_entry` (or explicit deferral of media submit).
4. Optional cleanup of that fixture after the pass.

Until approved, participation remains **BLOCKED**. Catalog confirms `join_challenge` / `submit_challenge_entry` EXECUTE for `authenticated`; that is not native acceptance.

## Validation

| Command | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | PASS exit 0 |
| Focused Play/Explore read suites + new challenge a11y + `playRails` | PASS (28 script + 2 unit in focused run) |
| `npm test` | PASS **810 + 234 = 1,044** (includes new `play-challenge-accessibility` **2**) |

## Remaining gaps

- Populated discovery rails, join CTA, compose/upload, reactions, ended/complete result card — need fixtures + write approval.
- My Play history when joined/submitted — empty-only here.
- Treasure answer/reveal — separate from challenge participation; also empty.

**Stop after reporting.** No push/merge/deploy. World map work unchanged.
