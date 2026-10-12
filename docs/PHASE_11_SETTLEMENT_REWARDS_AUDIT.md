# Phase 11 Step 2E — Settlement Rewards Audit & E2E Harness Hardening

**Date:** 2026-10-11  
**Worktree:** `C:\p11r` · branch `docs/phase-11-settlement-rewards-audit`  
**Baseline:** latest `main`  
**References:** PR #16 (Arena E2E), PR #14 (Profile Wins), PR #13 (Comment notifications)  
**Scope:** Document current Clash/Duel settlement reward semantics; harden the E2E SQL harness.  
**Out of scope:** Changing `settle_clash` / reward amounts; UI; World / MapLibre / Vault / payments; production migrations; merging PRs #7–#16.

---

## 1. Executive finding

**Juror-only Clash Engine rewards are intentional, not a Step 2D harness bug.**

Authoritative sources:

| Source | Statement |
|--------|-----------|
| `20260926160000_clash_engine.sql` | Settlement rewards loop over `judgements` (`j.juror_id`). Debaters receive `clash_result` notifications only. |
| `20260927010000_clash_draw.sql` | “every juror keeps … `clash_participation`”; win/dissent are juror-side bonuses. No fighter ledger writes. |
| `supabase/tests/002_clash_engine.sql` | Asserts ledger + profile reputation on **jurors** (`t-j1`, `t-j2`), not author/challenger. |
| `supabase/tests/008_clash_draw.sql` | Same juror-centric economy; fighters only checked for `clash_result` notifications. |
| PR #14 `PHASE_11_PROFILE_STATS_REPUTATION.md` | Fighter **wins** are verdict-derived via `profile_clash_stats`, separate from `reputation_events` / `profiles.reputation`. |

**Naming trap:** enum `clash_win` means “juror ballot matched the winning side,” **not** “fighter won the Clash.” Do not infer fighter payouts from the enum name alone.

Duel rooms call `settle_arena_room` → `settle_clash` → `settle_clash_legacy` and therefore inherit the juror model. Group Live Arena rooms use a **different** path (`settle_arena_group_room`) that rewards **debaters** (participation / winning-side vote / best argument / evidence). Duels must not receive those group ledger rows (`054_arena_duel_foundation.sql`).

---

## 2. Call graph (current)

```
settle_arena_room(room_id)
  ├─ if arena_rooms.clash_id IS NOT NULL → settle_clash(clash_id)   -- DUEL / linked Clash
  └─ else → settle_arena_group_room(room_id)                        -- GROUP Live Arena

settle_clash(clash_id)   -- wrapper from 20261007120000
  ├─ FOR UPDATE clash (+ room when duel_key set)
  ├─ settle_clash_legacy(clash_id)   -- draw-aware engine from 20260927010000
  └─ sync room status SETTLED / CANCELLED for duels

settle_clash_legacy
  ├─ lock clash
  ├─ if already settled → return existing verdict (no ledger writes)
  ├─ if closes_at > now() → P0006
  ├─ if jury_size = 0 → status cancelled; no verdict; no rewards
  ├─ insert verdict (A / B / DRAW)
  ├─ for each juror: reputation_events + profiles update
  └─ clash_notify author + challenger (clash_result)
```

Facets: `reputation_events` → trigger `sync_reputation_facet` → `profile_reputation_facets` (`reputation_facet_for`).  
Own standing: `get_my_arena_reputation()` (authenticated, own-only).  
Global ladder: `profiles.reputation` + `rank_for_rep`.

---

## 3. Actual reward recipient matrix (IMPLEMENTED)

### 3.1 Clash Engine / Duel (`settle_clash_legacy`)

| Scenario | Verdict | Juror on winning side | Juror on losing side | Fighter A (author) | Fighter B (challenger) | Idempotency |
|----------|---------|----------------------|----------------------|--------------------|------------------------|-------------|
| **A wins** | `A` | `clash_participation` +15; `clash_win` +105 / coins +40; streak +1; total rep +120 | `clash_participation` +15; `clash_dissent` +10 / coins +18; streak 0; total rep +25 | **No** ledger rows; `clash_result` notify | **No** ledger rows; `clash_result` notify | Re-settle returns verdict; no new ledger rows (`status = settled` early return) |
| **B wins** | `B` | same as A-wins “winning juror” | same as A-wins “losing juror” | notify only | notify only | same |
| **Draw** | `DRAW` | `clash_participation` +15 only; no coins; streak untouched | same | notify only | notify only | same |
| **Judge selects winning side** | — | receives participation + `clash_win` (see above) | — | — | — | one ballot / juror (`judgements` PK) |
| **Judge selects losing side** | — | — | participation + `clash_dissent` | — | — | |
| **No eligible judgement** (`jury_size = 0`) | none | none | none | none | none | Clash → `cancelled`; Room (duel) → `CANCELLED`; no rewards |
| **Repeated settlement** | unchanged | no new events | no new events | no new notifies from reward loop | | Payload replay from `verdicts` |
| **Concurrent settlement** | one winner | single award pass | | | | `FOR UPDATE` on clash (duel also locks room) |
| **Challenge cancelled / expired / PASS** | n/a | n/a | n/a | n/a | n/a | No Clash created → no settlement rewards (`056_arena_challenge_lifecycle`) |

**Fighter participation / fighter victory reputation via ledger:** **not defined** in Clash Engine.  
**Fighter win/loss counts:** via `profile_clash_stats` / `profile_clash_list` when PR #14 function is present (verdict-based; not coin/rep awards).

### 3.2 Group Live Arena (`settle_arena_group_room`) — contrast only

| Award | Recipient | Kind | Δ rep | Coins |
|-------|-----------|------|-------|-------|
| Participation | every `debater` in room | `arena_participation` | +10 | 0 |
| Winning-side vote | debaters who **side-voted** with winner | `arena_winning_side` | +25 | 0 |
| Best argument | author of top-voted message | `arena_best_argument` | +40 | 0 |
| Useful evidence | authors with `useful_count >= 3` | `arena_useful_evidence` | +15 | 0 |

Skipped on DRAW for winning-side bonus. Idempotent via room `SETTLED` lock. **Not applied to duel rooms.**

---

## 4. Proposed vs current (no code changes in this step)

| Topic | Current (implemented) | Proposed | Status |
|-------|----------------------|----------|--------|
| Who earns `clash_win` | Jurors who voted with majority | Keep juror semantics **or** rename enum / docs for clarity | **Product decision** if rename |
| Fighter victory reputation | None in ledger; wins via `profile_clash_stats` | Optionally add fighter ledger kinds (e.g. `clash_fighter_win`) with new amounts | **Requires approved spec** |
| Fighter participation | None in Clash Engine | Optionally award small participation to both fighters on settle | **Requires approved spec** |
| Group vs Duel consistency | Different models by design | Keep separate; document in product copy | Recommended |
| Double-award protection | Status early-return + row lock | Keep | No change |
| Coins on Clash settle | Juror win +40 / dissent +18 | Keep until economy review | No change |

### Recommended reward model (rationale)

**Keep juror-centric Clash Engine rewards as the implemented contract** until product explicitly wants fighter economy:

1. Spec and tests have always paid jurors; changing now is a settlement behavior change (disallowed without approved spec).
2. Fighter “Wins” on profile are already covered by PR #14 verdict stats — orthogonal to `profiles.reputation`.
3. Group Arena already has a fighter/debater participation model; conflating it with Duel without a design doc risks double-paying when both systems touch a linked Clash.

If product later wants fighter rewards, preferred approach:

1. New `reputation_kind` values (do not overload `clash_win`).
2. Award inside `settle_clash_legacy` after verdict insert, still under the same lock / settled early-return.
3. Explicit deltas in a short product spec + pgTAP updates to `002` / `008` / `054`.
4. No real-money / payout coupling.

---

## 5. Unresolved product decisions

1. **Should fighters receive any `reputation_events` on Duel settle?** (today: no)  
2. **Should `clash_win` be renamed** to something like `juror_majority` for clarity? (breaking for clients reading the enum)  
3. **Should fighter win streaks / coins exist** separately from juror streaks? (today fighter streak untouched by Clash settle)  
4. **Minimum jury size** for rewards (comment in engine: “minimum of 1 ballot locally”; production aspiration 9) — reward scaling not specified.  
5. **Public readability of `reputation_events`** (noted in PR #14) vs fighter privacy — out of scope here.

**Stop condition:** Do not change settlement reward logic until (1)–(3) are decided in writing.

---

## 6. Migration integrity — PR #14 ad-hoc function

### Observed (local Docker `supabase_db_clash`)

| Check | Result |
|-------|--------|
| `to_regprocedure('public.profile_clash_stats(text)')` | Present |
| `schema_migrations.version = '20261010120000'` | **Absent** |
| Canonical file (PR #14) | `supabase/migrations/20261010120000_profile_clash_stats.sql` |

### Safe reconciliation (manual; do **not** auto-fabricate ledger)

**Option A — preferred on a disposable local DB**

1. Confirm function body matches PR #14 migration (diff `pg_get_functiondef` vs file).  
2. If identical: insert **only** the version row after human review:

   ```sql
   -- ONLY after verifying function matches the migration file bit-for-bit intent
   INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('20261010120000', 'profile_clash_stats')
   ON CONFLICT DO NOTHING;
   ```

3. Never do this on production without release process.

**Option B — clean local**

1. Drop the ad-hoc function (and any dependent grants) in a reviewed session.  
2. Apply via `supabase migration up` / normal chain so the ledger records the file.

**Option C — wait for PR #14 merge**

1. Leave ad-hoc function in place for local validation.  
2. Document drift (as PR #16 / this audit do).  
3. After merge, reconcile with A or B.

**Forbidden:** inventing checksums, rewriting migration filenames, or `db reset` on shared local volumes without approval.

---

## 7. E2E harness safety changes

### Files

| File | Role |
|------|------|
| `scripts/phase11_arena_e2e_validation.sql` | Hardened journey harness |
| `scripts/phase11_arena_e2e_cleanup.sql` | Opt-in cleanup for durable leftovers |

### Improvements vs Step 2D

| Before (2D) | After (2E) |
|-------------|------------|
| Always created `public._phase11_e2e_report` + public `SECURITY DEFINER` helper | Report in `pg_temp`; session-local `pg_temp` note helper only (not installed in `public`) |
| Committed fixtures every run | Default **ROLLBACK** after printing matrix |
| No environment gate | Fail-closed unless `app.phase11_e2e_allow=local-docker` |
| No hosted refusal | Refuses roles/DB mismatch + `supabase.co` iss markers in `auth.users` |
| Re-run rate-limit / handle collisions | Clears actor rate limits; unique handles per run tag |
| Durable pollution undocumented | Persist only if `app.phase11_e2e_persist=1`; cleanup script requires second confirm GUC |

### How to run

```powershell
docker cp C:\p11r\scripts\phase11_arena_e2e_validation.sql supabase_db_clash:/tmp/phase11_e2e.sql
docker exec supabase_db_clash psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
  -c "SELECT set_config('app.phase11_e2e_allow','local-docker', false)" `
  -f /tmp/phase11_e2e.sql
```

Without the allow GUC the script **exits with error** (BLOCKED / refused) — do not bypass.

### Existing Step 2D artifacts (local)

May still exist from earlier durable runs:

- `public._phase11_e2e_report`
- `public._phase11_e2e_note(...)` (SECURITY DEFINER)
- Auth users `e2e.*.phase11@clash.local` / UUIDs `…e2e0…a1/b2/c3`
- Related takes / clashes / reputation rows from those identities

**Cleanup (authorized opt-in only):**

```powershell
docker exec supabase_db_clash psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
  -c "SELECT set_config('app.phase11_e2e_allow','local-docker', false)" `
  -f /tmp/phase11_arena_e2e_cleanup.sql
# preview only; then:
docker exec supabase_db_clash psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
  -c "SELECT set_config('app.phase11_e2e_allow','local-docker', false)" `
  -c "SELECT set_config('app.phase11_e2e_cleanup_confirm','yes', false)" `
  -f /tmp/phase11_arena_e2e_cleanup.sql
```

Do not run cleanup against hosted/production.

---

## 8. Validation results (this step)

| Check | Result |
|-------|--------|
| Harness without allow GUC | **PASS** (refused with `42501`) |
| Harness with allow GUC (rollback mode) | **32/32 PASS**; journey fixtures rolled back (`take_0f50…` absent after) |
| pgTAP `002` / `008` / `054` | **186 PASS** |
| `npm run test:duel` (worktree) | **29/29 PASS** |
| `npm run typecheck` (primary checkout) | **PASS** (`tsc --noEmit`, no errors) |
| `npm run test:unit` (primary) | **466/466 PASS** |
| `npx expo-doctor` (primary) | **18/18 PASS** |
| Settlement reward logic changed | **No** |

---

## 9. Acceptance checklist

- [x] Current recipient matrix from code + tests (not enum-name inference)  
- [x] Juror-only Clash rewards classified as intentional  
- [x] Proposed model + stop-short product decisions  
- [x] PR #14 migration drift reconciliation process (no auto ledger write)  
- [x] Harness hardened (fail-closed, rollback default, no public definer)  
- [x] Cleanup procedure documented  
- [x] Draft PR open — do not merge
