# Phase 5G — one replacement QA duel through authoritative settlement

28 October 2026 (UTC). Original checkout `C:\Users\91962\Desktop\Clash`, branch `arena-ui-review`, HEAD **`cbe216a3c212a83c432f71b37b59a1debe5caa63`** unchanged.

**PASS for the single authorized competitive lifecycle through natural OPEN → FINAL → JUDGING → close → `settle_clash` ×2, with Samsung A50 fighter-A native acceptance of the available phase windows and terminal result.** No second duel. Old Phase 5F fixture preserved unsettled. No cron, migrations, RLS, grants, commit, push, merge, or deploy.

## Authorization consumed

| Allowance | Used |
|---|---|
| Exactly one new fictional canonical STANDARD Arena duel on QA `127.0.0.1:55481` / system id `7700622043081482277` | **1/1** |
| At most one QA magic-link/OTP each for B and C | **1/1 each** |
| Ordinary A password login (owner DPAPI) + authorized A/B/C session refresh | Used as needed; **no extra links** |
| Phase 5C §4 bounded ops, denials, typing ≤20, settlement idempotency + automatic QA reward/notification effects | Executed |
| Replacement if this attempt fails | **Not used / not authorized** |

Phase 5F `duel-started.json` slot was superseded only after verifying it referred to stopped Clash `cl_317c02f552618658` / Room `ar_334e2de5f3807d08`. Historical 5F evidence archived under `.expo/phase5f/evidence/duel-started-phase5f-*` and `run-ledger-phase5f-*` (not deleted).

## Gate results

| Gate | Result | Notes |
|---|---|---|
| 1 Runner / host preflight | **PASS** | QA identity/ledgers/cron-off; SM-A505F + reverses 8081/55481; 5F.1 held-child `SetThreadExecutionState`; AC power connected; attended lid confirmed by operator authorization; STOP-before-Take guards active |
| 2 Authentication | **PASS** | A password; B/C one magic-link each; identities match; RAM-only clients; no detached stdin holder |
| 3 Canonical duel | **PASS** | Full natural windows; both denials; C ballot for A; settle ×2 idempotent |
| 4 Samsung A50 (fighter A) | **PASS** | LIVE/OPEN, FINAL, JUDGING, SETTLED/RESULT; composer+keyboard; official args; verdict/history/Back/re-entry |
| 5 Verdict / rewards | **PASS** | Winner A; C +120/+40/+1; retained fixtures unchanged; idempotent settle |
| 6 Tests / report | **PASS** | `tsc` exit 0; `npm test` 816 unit + 239 lifecycle; duel 29/29; render 22/22; settlement-history 11/11; 5F.1 safety 12/12; adapter 8/8 |

## Exact new fixture

| Field | Value |
|---|---|
| Take | `take_105dd427e7f85b96` |
| Challenge | `bf0237fe-f1dc-4582-a0c6-1784f077e9fa` |
| Clash | `cl_adcd423e215be1e3` |
| Room | `ar_c5593e849585dc8e` |
| Topic | `at_581fac241c8ebb59` |
| Opens (UTC) | `2026-10-28T02:19:08.974031Z` |
| FINAL | `2026-10-28T02:39:08.974031Z` |
| JUDGING | `2026-10-28T02:44:08.974031Z` |
| Closes | `2026-10-28T02:49:08.974031Z` |
| Terminal | Clash **`settled`**, Room **`SETTLED`** |

## Gate 1 — runner and host

- Gateway `__qa/identity`: project `clash-ui-qa-phase4a`, system id `7700622043081482277`.
- Ledgers application/storage/auth/realtime **111/74/82/88**; `cron.launch_active_jobs=off`; cron runs 0; users 3.
- Corrected 5F.1 runner: long-lived PowerShell holder keeps `ES_CONTINUOUS|ES_SYSTEM_REQUIRED` until stop-file release (one-shot invoke is not used for live runs).
- Acquire held (`holderPid` 24704) from before auth through settlement; release logged `host_awake_release` after complete. Holder process gone afterward.
- Attended host: `AC=True;BatteryStatus=2;Charge=100`; lid open treated as operator-confirmed for this authorized attended run. Wake request does **not** override lid-close/hibernate/policy.
- Server-time checks, suspension discontinuity detection, and missed-window STOP remain wired via `phase-gate` / `safe-wait` before time-sensitive RPCs.
- Single-run controller retained ordinary authenticated clients in RAM (no detached stdin holder).

## Gate 2 — authentication

| Actor | Mechanism | Profile |
|---|---|---|
| A | `signInWithPassword` via owner-bound DPAPI | `u_5245a931e195412f8223dabc34c66fc9` |
| B | one `generate_link` + `verifyOtp` magiclink | `u_d2af864cce5b4e72a9ff5ff56586f522` |
| C | one `generate_link` + `verifyOtp` magiclink | `u_0779d3991b2647d2be10a65f924c568d` |

JWT role `authenticated` for all actor RPCs. Admin used only for B/C link generation. Phone A session left in place for native viewing. Credentials not persisted or printed.

## Gate 3 — authenticated operation ledger

| Step | Attempts | Successes | Rejected (expected) | Uncertain |
|---|---:|---:|---:|---:|
| A `create_take` | 1 | 1 | 0 | 0 |
| B `create_arena_challenge` | 1 | 1 | 0 | 0 |
| A `resolve_arena_challenge` ACCEPT | 1 | 1 | 0 | 0 |
| C `watch_arena_room` | 1 | 1 | 0 | 0 |
| A/B `submit_arena_official` OPEN | 2 | 2 | 0 | 0 |
| C spectator official (denial) | 1 | 0 | 1 (`42501` / HTTP 403) | 0 |
| A/B `submit_arena_official` FINAL | 2 | 2 | 0 | 0 |
| A fighter judgement (denial) | 1 | 0 | 1 (`P0005` / HTTP 500) | 0 |
| C `submit_judgement` side A | 1 | 1 (HTTP 204) | 0 | 0 |
| A `settle_clash` | 2 | 2 (idempotent) | 0 | 0 |

RPC counters (ledger): `create_take`1, `create_arena_challenge`1, `resolve_arena_challenge`1, `watch_arena_room`1, `submit_arena_official`5 (4 publish + 1 denial attempt), `submit_judgement`2 (1 denial + 1 ballot), `settle_clash`2. Mutation-capable ceiling respected. Magic links B:1 C:1. No second duel. No writes to old Clash `cl_317c02f552618658`.

Natural waits used server deadlines only; wait ticks continued every ~60s through FINAL/JUDGING/close without host-suspension STOP.

## Gate 4 — native Samsung A50 (fighter A)

Private captures under `.expo/phase5g/evidence/`.

| Check | Result | Evidence |
|---|---|---|
| Enter new duel (Arena deep link after Live) | **PASS** | `g4-02-live.png`, `g4-03-room-open.png` |
| Fighter A/B identities + proposition | **PASS** | Rowan/Mira; 5C proposition text |
| LIVE / OPEN | **PASS** | `g4-03-room-open.png` |
| Composer + keyboard geometry | **PASS** (`imeShown=true`) | `g4-04b-composer-keyboard.png` |
| Official argument visibility | **PASS** | B OPEN then B FINAL on Stage |
| FINAL presentation | **PASS** | `g4-07-final.png` (LIVE · FINAL) |
| JUDGING presentation | **PASS** | `g4-08-judging.png` (“Fighters cannot judge…”) |
| Settled RESULT / verdict | **PASS** | `g4-09-settled-room.png` — “QA Rowan made the stronger case”, 1 judgment · SPLIT DECISION, 100%/0% |
| More → Argument history | **PASS** | `g4-10-more-sheet.png`, `g4-15-argument-history.png` |
| Back + re-entry | **PASS** | `g4-04e`/`g4-04f` (OPEN), `g4-13`/`g4-14` (SETTLED) |

B/C remain API evidence only (not native role acceptance).

## Gate 5 — verdict and rewards

| Check | Actual |
|---|---|
| C ballot | Juror `u_0779…568d`, side **A**, at `02:44:10Z` |
| Settlement contract | `winner_side=A`, `side_a_score=1`, `side_b_score=0`, `jury_size=1`, `agreement=1`, `margin=1`, `verdict_label=SPLIT DECISION` |
| Idempotent second settle | Same payload; no duplicate reward drift |
| Terminal status | Clash `settled`, Room `SETTLED` |
| C deltas | reputation **0→120**, coins **50→90**, streak **0→1** |
| A/B game stats | unchanged (0 / 50 / 0) |
| Notifications (new since open) | A `challenge_received`; B `challenge_accepted`; C `reputation`; A+B `clash_result` (one each) |
| Old 5F fixture | `cl_317c02f552618658` still `open` / Room `OPEN`, **0 ballots / 0 verdicts** |
| Other retained open fixtures | `cl_4e59…`, `cl_4e8d…` still 0 ballots / 0 verdicts |

## Gate 6 — tests

| Suite | Result |
|---|---|
| `tsc --noEmit --incremental false` | exit 0 |
| `npm run test:unit` | **816/816 PASS** |
| `npm test` lifecycle/UI subset | **239/239 PASS** |
| `npm run test:duel` | **29/29 PASS** |
| `npm run test:duel:render` | **22/22 PASS** |
| `node scripts/settlement-history-check.cjs` | **11/11 PASS** |
| `.expo/phase5f1/runner-safety.test.cjs` | **12/12 PASS** |
| `.expo/phase5f/adapter.test.cjs` | **8/8 PASS** |

## Remaining release limitations

1. **Operational settlement ownership** — QA cron remains off; this run used an explicit per-Clash `settle_clash`. Production scheduling/monitoring/retry of due Clashes is still a separate release gate.
2. **Jury scope** — one valid juror accepted; this is **not** nine-juror selection/quorum/fairness acceptance (`CLASH_SPEC` advertising vs installed variable-jury engine).
3. **Role coverage** — native acceptance is fighter A on SM-A505F only; B/C juror/spectator UI on distinct devices not native-accepted here.
4. **Prior unsettled fixtures** — Phase 5F and earlier zero-ballot open Clashes remain for separate cleanup authorization (settling them would cancel, not compete).
5. **Wake helper** — best-effort; lid-close/hibernate/policy can still abort a future unattended run.
6. Broader Phase 5A access/security, release-build identity, and font-change route concerns from prior preflights remain open.

## Preservation / restrictions honored

HEAD/branch unchanged; no commit/push/merge/deploy/reset/stash. No shared55321 / E3.5.7 / hosted access. No migrations/RLS/grants/scheduler enablement. No batch `run_maintenance` / `settle_due_clashes`. No Crowd/assist/media/reaction/follow writes beyond authorized typing ephemeral allowance. Old Clash/Room untouched. Prior UI work and evidence preserved. Tooling/evidence under ignored `.expo/phase5f*`, `.expo/phase5g*`, plus this report.

**STOP.**
