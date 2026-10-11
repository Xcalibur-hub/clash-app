# Phase 11 Step 2D — Arena End-to-End Validation

**Date:** 2026-10-11  
**Worktree:** `C:\p11v` (short path) on branch `docs/phase-11-arena-e2e-validation`  
**Base:** latest `main` at validation start (`eccd521`)  
**Scope:** real local Supabase Arena journey — Take → Challenge → Accept → Duel → Judgement → Settlement → Reputation → Profile Wins  
**Safety:** no merge of PRs #7–#15; no Supabase/Docker volume reset; no production migrations; no Android data clear; no World / MapLibre / Vault payments / native config changes; Crew dirt preserved in primary checkout

---

## Environment

| Item | Observed |
|------|----------|
| Local API | `http://127.0.0.1:55321` |
| Local DB | Docker `supabase_db_clash` / Postgres `55322` |
| Seeded sign-in account | `dev@clash.local` (not used for fighter journey) |
| Journey accounts | Local-only auth users `e2e.a.phase11@clash.local`, `e2e.b.phase11@clash.local`, `e2e.judge.phase11@clash.local` (JWT-claims simulation; no passwords; no production data) |
| Profiles | `e2e_p11_a` / `e2e_p11_b` / `e2e_p11_j` |
| Device | Samsung A50 `RZ8M30DE9NL` (`SM_A505F`) |
| Installed build | `com.clash.v2.dev` versionName `2.0.0` / versionCode `1` (existing; not rebuilt) |

### PR #13 / #14 migration presence (before any apply)

| Dependency | Local evidence | Action taken |
|------------|----------------|--------------|
| PR #13 comment notify | `schema_migrations.version = 20261011120000` present (name empty); trigger `comments_notify_arena` → `notify_arena_comment()` | **None** — already present |
| PR #14 profile stats | Function `public.profile_clash_stats(text)` present and executable; version `20261010120000` **not** in `schema_migrations` (ad-hoc from Step 2B) | **None** — did not apply missing migration row; validated via existing function |

No migrations were applied during this step.

---

## Journey IDs (test data only)

Canonical settled journey used for the matrix below:

| Entity | ID |
|--------|-----|
| Take | `take_728109cf809e14ee` |
| Challenge | `6e99dceb-4a32-4472-89e6-bd85c1993856` |
| Clash | `cl_c8132f8b40dce3d8` |
| Room | `ar_192344534b6146c2` |
| Author A | `u_0000000000004000e2e00000000000a1` |
| Challenger B | `u_0000000000004000e2e00000000000b2` |
| Judge | `u_0000000000004000e2e00000000000c3` |
| Verdict | winner_side=`A`, jury_size=`1`, label=`SPLIT DECISION` |

Comment-notification host Take (separate): `take_027b734f12f3f5ea` / comment `c_60a7266226f4aaad`.

**Verification method for A–G:** live RPC calls against local Postgres with `request.jwt.claims` + `authenticated` role (same contract the API uses). Not mocked service responses.

Reproduction harness (local only, not product UI): `scripts/phase11_arena_e2e_validation.sql` → report table `public._phase11_e2e_report`.

---

## Verification matrix

| Stage | Check | Result | Evidence / method |
|-------|-------|--------|-------------------|
| Env | PR #13 migration marker local | **PASS** | `20261011120000` in `schema_migrations` |
| Env | Step 2B `profile_clash_stats` callable | **PASS** | Function present (migration row `20261010120000` absent — noted) |
| Env | Comment notify trigger | **PASS** | `comments_notify_arena` |
| Env | Isolated test accounts | **PASS** | Three local auth+profile pairs |
| **A** Take creation | A creates Take; persisted active | **PASS** | `create_take` → `take_728109cf809e14ee` |
| **A** Visibility | B can select Take | **PASS** | Authenticated select as B |
| **B** Challenge | B creates PENDING challenge | **PASS** | `create_arena_challenge` `created=true` |
| **B** Participants | challenger=B, challenged=A | **PASS** | Challenge payload |
| **B** Inbox notify | A receives `challenge_received` deep-linking Take | **PASS** | `entity_id=take_728109cf809e14ee` |
| **B** Accept | A ACCEPT → Clash + Room | **PASS** | `resolve_arena_challenge(...,'ACCEPT')` |
| **B** Uniqueness | Exactly one Clash for Take | **PASS** | `count=1` |
| **B** Links | Clash linked to Take + A/B | **PASS** | DB row check |
| **C** Duel sides | Room view fighter A/B + relationship | **PASS** | `get_arena_room` as A then B |
| **C** Content | Counter-position on Clash view | **PASS** | matches challenge text |
| **C** Reopen | Leave JWT / reopen as B same room | **PASS** | `roomId` + `fighter_b`, status `OPEN` |
| **D** Unauthorized fighter judge | Rejected | **PASS** | `P0005:cannot judge your own clash` |
| **D** Unauthenticated judge | Rejected | **PASS** | `42501:sign in to judge` |
| **D** Eligible judge + duplicate ballot | One ballot after retry | **PASS** | `submit_judgement` ×2 → `judgements` count `1` |
| **E** Settlement | `settle_arena_room` / `settle_clash` | **PASS** | clash `settled`, room `SETTLED` |
| **E** Verdict once | Single verdict winner A | **PASS** | `verdicts` count `1` |
| **E** Idempotent settle | Repeat settle no double award | **PASS** | payloads equal; reputation count stable (`2`) |
| **E** Reputation events | Ledger rows written | **PASS** | juror `clash_participation` + `clash_win` |
| **E** Reputation target model | Juror rewarded; fighters via verdict/stats | **PASS** | Observed Clash Engine contract (see defects) |
| **F** Winner wins | A `wins >= 1` | **PASS** | `profile_clash_stats` |
| **F** Loser no win | B `wins=0`, `losses>=1` | **PASS** | `profile_clash_stats` |
| **F** Settled Clash counts | Both `clashes >= 1` | **PASS** | A=2 B=2 after two local runs |
| **F** Profile refresh | Repeat RPC stable | **PASS** | RPC only — **no UI profile screen refresh on device** |
| **G** Comment notify | B comments → A notified | **PASS** | `kind=comment` |
| **G** Deep link | Notification `entity_id` = Take | **PASS** | |
| **G** Self-notify | Author self-comment → 0 self notifies | **PASS** | |
| **G** Block | Blocked challenger cannot comment / no notify | **PASS** | `P0005:blocked` |
| Device | Full multi-account UI journey | **BLOCKED** | See device section |
| Device | Launch existing dev build + port reverse | **PASS** | Partial smoke only |

**Harness summary:** `32/32` checks in `_phase11_e2e_report` = **PASS** (device full journey tracked separately as BLOCKED).

---

## Steps attempted vs expected

### A. Take creation
1. Authenticate as A → `create_take('techtakes', …)`.
2. Authenticate as B → select Take by id.  
**Expected / actual:** active Take with author A; visible to B. **PASS** (Supabase).

### B. Challenge
1. B → `create_arena_challenge(take, counter_position)`.
2. Confirm `challenge_received` for A (entity = Take).
3. A → `resolve_arena_challenge(id,'ACCEPT')`.  
**Expected / actual:** one Clash + one DUEL room; participants A/B. **PASS** (Supabase).

### C. Duel
1. A/B → `get_arena_room(roomId)`.
2. Clear claims; reopen as B.  
**Expected / actual:** correct sides/text; stable room identity. **PASS** (Supabase).  
**Not verified on device UI** (see device).

### D. Judgement
1. Shift Clash/Room/topic clocks into judging (server-side updates; no device clock).
2. Fighter A `submit_judgement` → expect reject.
3. No JWT `submit_judgement` → expect reject.
4. Judge `submit_judgement('A')` twice → one ballot.  
**PASS** (Supabase).

### E. Settlement
1. Close clocks; `settle_arena_room(roomId)`; repeat via `settle_clash(clashId)`.  
**Expected / actual:** one verdict A; statuses settled; no double ledger growth. **PASS** (Supabase).  
Related notifications observed (`clash_result` / `reputation` family; count related ≥ 3).

### F. Profile
`profile_clash_stats` available locally → winner/loser/clash counts verified.  
UI profile refresh after settlement: **not device-verified** (RPC-only PASS).

### G. Comments
Step 2A trigger present → comment notify, deep link, self-block, block restriction verified. **PASS** (Supabase).

---

## Device smoke (Samsung A50)

| Action | Result |
|--------|--------|
| `adb devices` | `RZ8M30DE9NL` connected |
| Existing package | `com.clash.v2.dev` `2.0.0` present |
| `adb reverse tcp:55321 tcp:55321` | Listed |
| Launch `com.clash.v2.dev/.MainActivity` | Focus `MainActivity`, pid observed |
| Rebuild / reinstall / clear data | **Not done** (per safety) |
| Sign in as e2e A/B/judge and click through full journey | **Not done** — e2e users have no password; only JWT SQL simulation. Would require creating signable local passwords or using `dev@clash.local` + second OTP account with approval |

**Verdict:** device access **available** for launch/reverse smoke; full Arena UI journey on device is **BLOCKED** (not fabricated as pass). Partial smoke ≠ journey validation.

---

## Automated tests performed

| Suite | Command | Result |
|-------|---------|--------|
| Arena duel foundation (pgTAP) | `npx supabase test db supabase/tests/054_arena_duel_foundation.sql` | **PASS** |
| Arena challenge lifecycle (pgTAP) | `…/056_arena_challenge_lifecycle.sql` | **PASS** |
| Arena challenge inbox (pgTAP) | `…/069_arena_challenge_inbox.sql` | **PASS** |
| Combined | 3 files / **199** tests | **PASS** |
| Duel unit | `npm run test:duel` (worktree) | **29/29 PASS** |
| Unit suite | `npm run test:unit` (primary checkout) | **466/466 PASS** |
| Challenge inbox client | `npm run test:challenge-inbox` (primary) | **18/18 PASS** |
| Arena engagement harness | `npm run test:arena-engagement` (primary) | **8/8 PASS** |
| Live SQL journey harness | `scripts/phase11_arena_e2e_validation.sql` | **32/32 PASS** |

Worktree lacked `node_modules`; babel-dependent scripts were run from the primary checkout (same `main` tip for those packages). That does not substitute for the live Supabase journey above.

---

## Defects / product notes (prioritized)

### P1 — Clash Engine reputation targets jurors, not fighters
**Observed:** After settlement with winner A, `reputation_events` for the Clash were `clash_participation` + `clash_win` on **judge** `e2e_p11_j`, with **zero** fighter ledger rows.  
**Also observed:** `profile_clash_stats` correctly gave A a win and B a loss from the verdict.  
**Implication:** “Reputation → Profile Wins” is split today — wins come from verdicts/RPC; coin/rep deltas from `settle_clash_legacy` go to jurors.  
**Recommended fix (focused):** decide product intent. If fighters should earn `clash_win` / participation, extend settlement to award author/challenger from `winner_side` without double-paying jurors; keep idempotent lock. Do **not** change this in Step 2D (docs-only).

### P2 — PR #14 migration not recorded in `schema_migrations`
**Observed:** `profile_clash_stats` works locally but `20261010120000` is absent from `schema_migrations`.  
**Risk:** fresh environments / CI may miss the function until PR #14 merges cleanly.  
**Recommended fix:** land PR #14 migration recording; avoid ad-hoc DDL drift.

### P3 — Device multi-account journey not runnable with JWT-only e2e users
**Blocker for UI proof:** e2e accounts created without encrypted passwords.  
**Recommended fix (ops):** seed two passworded local Auth users (or document OTP via Inbucket) for physical A/B flows; then re-run device matrix without rebuild if build already points at local API.

### P4 — Worktree missing `node_modules`
Some client harness scripts failed in `C:\p11v` until run from primary tree. Non-blocking for backend validation.

---

## Blockers summary

| Item | Status |
|------|--------|
| Missing PR #13/#14 SQL to apply | None required — present enough to validate |
| Profile stats section | Not blocked — function present |
| Comment notify section | Not blocked — trigger present |
| Full device UI journey | **BLOCKED** (no signable e2e passwords; approval needed to create) |
| Production / reset / PR merges | Intentionally not done |

---

## Acceptance checklist

- [x] Clear evidence per Arena stage against real backend  
- [x] No fabricated device or backend verification  
- [x] No production mutations  
- [x] No unrelated product/source feature changes in this PR (docs + optional local SQL harness only)  
- [x] Blockers and focused fix recommendations prioritized  
- [x] Draft PR to `main` — **do not merge**
