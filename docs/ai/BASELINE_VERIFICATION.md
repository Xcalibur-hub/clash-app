# BASELINE VERIFICATION — 2026-11-05

Offline verification of the current working tree before continued development and
a selective GitHub checkpoint. Read-only: no application code changed, no DB /
Auth / gateway / device interaction, no installs, no commits.

---

## 1. Git baseline

| Fact | Value |
|---|---|
| Branch | `arena-ui-review` |
| HEAD | `2b898748a48e317ac5737da62c7a964f50aca2a8` (`feat(live): connect audience reads and harden session recovery`, 2026-11-01) |
| Index | **0 staged files** |
| Status entries | 292 — 11 listed modified, 281 untracked |
| Real content modifications | **8** (3 others are line-endings-only; see `DEVELOPMENT_STATUS_REVIEW.md` §7) |
| Node | v22.11.0 |

## 2. Results

| Check | Command | Result |
|---|---|---|
| **TypeScript** | `npx tsc --noEmit` | **PASS** — exit 0, zero diagnostics |
| **Full suite** | `npm test` | **PASS — 1,216 / 1,216**, 0 failed, 0 cancelled, 0 skipped, exit 0 |

Suite composition (three TAP runs inside `npm test`):

| Stage | Tests | Pass | Fail |
|---|---:|---:|---:|
| `test:unit` (124 files, `node --experimental-strip-types --test`) | 820 | 820 | 0 |
| Lifecycle/UI harness (24 `scripts/*.test.cjs`) | 331 | 331 | 0 |
| `release-scope.test.cjs` | 65 | 65 | 0 |

No `not ok` lines, no `npm error`, no `ELIFECYCLE`. Duration ~7.3 s for the final
stage; total run a few minutes.

**These numbers match the last recorded baseline (1,216/1,216, 820 + 331 + 65,
2026-11-05).** The working tree has introduced no regression.

### Failures introduced by the working tree

**None.** Typecheck and the full suite are green with every uncommitted change
present.

## 3. `DuelPersonalResult.tsx` and related Arena changes

| Question | Finding |
|---|---|
| Tracked? | **No** — untracked (`??`), 3,461 bytes |
| In compilation? | **Yes** — `tsconfig.json` includes `**/*.tsx`; only `node_modules`, `dist`, `supabase/functions`, `**/*.test.ts` are excluded. Typecheck would fail on it if broken |
| Wired into the app? | **Yes** — imported by `components/liveArena/DuelRoomExperience.tsx` (line 32; used at line 453), which is itself a *modified tracked* file |
| Directly unit-tested? | **No** — no test file references it by name |

Related modified tracked Arena files: `components/liveArena/DuelRoomExperience.tsx`
(6 lines changed), `components/onboarding/InterestOnboardingGate.tsx`, `app/auth.tsx`.
All compile; all are exercised indirectly by the lifecycle/render suites.

**Conclusion:** the new component is real, compiled, and integrated — but
**untested at the unit level**. `DuelRoomExperience.tsx` importing an untracked
file means a checkout of HEAD alone would not contain it; the pair must be
committed together or the build breaks for anyone else.

## 4. Arena coverage: FINAL, JUDGING, ballot, verdict, rewards

### Automated coverage that exists (mocked/controlled — no device)

| Area | Representative tests | Depth |
|---|---|---|
| Verdict presentation/view | `utils/verdictPresentation.test.ts` (4), `utils/verdictView.test.ts` (9) | Strong for rendering logic |
| Settlement logic | `utils/clashSettlement.test.ts` (4) | Real settlement arithmetic |
| Phase/game state | `utils/arenaGameState.test.ts` (17, 3 phase refs), `utils/immersiveClash.test.ts` (11) | Phase-state modelling |
| Ballot / judgement flow | `scripts/arena-correctness-lifecycle.test.cjs` (10) | Controlled lifecycle |
| Duel payload/presentation | `utils/arenaDuelPayload.test.ts`, `utils/duelPresentation.test.ts` | 29/29 PASS per A50 report |
| Duel render | `scripts/duel-render-smoke.cjs` | Component + 28 community-result scenarios |

**Not wired into `npm test`** (would need deliberate addition):
`arena-demo-check`, `arena-live-v2-check`, `arena-return-visits`,
`arena-runtime-chrome`, `arena-spectator-check`, `crowd-stage-focus`,
`creator-live-backend-correctness`.

### Coverage gaps — automated

1. **No test directly covers a FINAL → JUDGING → close transition sequence.**
   Phase references exist (3 in `arenaGameState`, 2 in `immersiveClash`) but no
   dedicated transition test.
2. **No automated reward-calculation test.** Zero `reward` references in any
   verdict/settlement test. Reward deltas are only asserted end-to-end by a live
   run.
3. **No ballot-tally test.** `ballot`/`judgement` appears 1–3 times in verdict
   tests but no test asserts tally arithmetic.
4. **`DuelPersonalResult.tsx` has no unit test.**
5. Seven Arena/creator scripts sit outside `npm test`.

### Physical-device acceptance (compare separately)

Per `docs/evidence/ui-completion/ACTIVE_ARENA_A50_ACCEPTANCE.md` and
`CLASH_MEGA_INTEGRATION_COMPLETION.md`:

- **A50 native:** opening phase only — admission, Stage, OPEN, empty Crowd, one
  native send, Back/disposal. **Finals, JUDGING UI, ballot, verdict and reward
  are NOT TESTED / BLOCKED on device.**
- **Backend-only (Node clients):** the full settled lifecycle including DRAW
  (A 1 / B 1, jury 2) — proves the server engine, **not** the UI.

**Summary:** FINAL/JUDGING/ballot/verdict/reward are covered **automatically at
unit/render level and at backend level, but never end-to-end on a physical
device.** Do not cite automated green as native acceptance.

## 5. Essential files for a clean checkpoint

Derived from `DEVELOPMENT_STATUS_REVIEW.md` §8; **~203 KB total** vs 343 MB of
untracked content.

**Group A — workspace + docs (no runtime effect):**
`AGENTS.md`, `CLAUDE.md`, `docs/ai/` (11 files), `.agents/`,
`docs/ARENA_ANDROID_3_2{K,L,M}_*.md`.

**Group B — product code (must ship with its importer):**
`components/liveArena/DuelPersonalResult.tsx` **+** modified
`components/liveArena/DuelRoomExperience.tsx`.

**Group C — standalone backend tests/scripts:**
`supabase/migrations/20261031161138_creator_live_correctness.sql`,
`supabase/tests/{creator_live_correctness.pgtap.sql,meet_cancel_search_concurrency.sql,meet_new_admission_concurrency.sql}`,
`scripts/android-bundle-{preflight,preflight.test,trace}.cjs`,
`scripts/creator-live-{backend-correctness.test,isolation-output-check}.cjs`.

**Exclude — private evidence / generated / bundles:** all of `docs/evidence/`
(238 entries, 343 MB; seven ~22.5 MB `bundle66*.js`, screenshots, UIAutomator XML,
JSON ledgers). *(Note: `docs/evidence/ui-completion-phase4f-play/REPORT.md` is a
tracked file with a pre-existing modification — a separate decision.)*

**Exclude — temporary / scaffolding:** `scripts/_fix*.cjs`, `scripts/_patch*.cjs`,
`scripts/_write*.cjs` (9), `.tmp/`, `.tmp_d.txt`, `.tmp_p.txt`.

**Exclude — unrelated / personal:** `Al_Wafi_Final_Recommendations.html`,
`sybil.html`, `sybil/`, `qwen.html`, `index.html`, `add_photos.js`,
`upgrade.js`, `shot.png`, `arena-v3-review.zip`, `Microsoft/`, `expo/`.

**Exclude — secrets:** none found. No `.env*` is untracked; the only token-like
value is a public `anon` demo key (`iss: supabase-demo`) inside excluded bundles.

**Exclude — line-endings-only:** `scripts/meet-admission-postgres-concurrency.cjs`,
`supabase/migrations/20261028210000_meet_new_admission_gate.sql`,
`supabase/tests/meet_new_admission_gate.pgtap.sql` (blob hashes equal HEAD).

## 6. Verdict

**The working tree is healthy.** TypeScript passes and all 1,216 automated tests
pass with every uncommitted change in place. Nothing in the current tree blocks
continued development.

It is **not yet a clean checkpoint**: 281 untracked entries, 343 MB of evidence,
nine throwaway scripts, unrelated personal files, and one untracked component
that must be committed with its importer. Those are packaging decisions, not
code health problems.
