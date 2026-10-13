# Phase 11 — Comprehensive backend audit & staging recovery

**Date:** 13 October 2026  
**Mode:** Offline fixes + **read-only** hosted investigate. **No hosted writes.**  
**Staging:** `clash-staging` / `zrutlrhhvfcsmssjiijl` remains **QUARANTINED**.  
**Worktree:** `C:/p116q`, branch `feat/phase-11-recovery-verify-6q`.

## Executive verdict

| Question | Answer |
|---|---|
| Are all 106 migrations verified locally? | **YES** (disposable PostGIS 17 + platform stubs; see caveats) |
| Is 43→106 recovery path verified locally? | **YES** (same caveats) |
| Is storage bucket discrepancy explained? | **YES — expected** `public-media` + `private-media` from migration 4 (`media_storage`) |
| Remaining P0 deployment blockers? | **None offline** after recovery-storage fix; hosted **resume still unauthorized** |
| Remaining P1 security issues? | Spot-audit only — no newly confirmed critical live exploit in this pass; full pgTAP/RLS matrix not re-run against disposable DB |
| Frontend/backend contract? | No new launch-blocking RPC mismatches proven this pass; Crew UI work remains out of scope |
| Hosted staging recovery READY or BLOCKED? | **READY for separately authorized resume** (fresh investigate gates all true) |
| Next authorization? | One bounded `resume:zrutlrhhvfcsmssjiijl` (direct IPv6, pinned CA, corrected manifest) |

---

## Issue register

### P0 — Deployment blockers

| ID | Area | Root cause | Evidence | Fix | Status | Validation |
|---|---|---|---|---|---|---|
| P0-1 | Recovery preflight | Empty-DB `buckets=false` gate reused for **resume/investigate** after prefix-43; migration `20260926150000_media_storage` inserts exactly `public-media` + `private-media` | Hosted 6Q `buckets=true`; migration lines 263–269; prior 6I/6K empty only because **pre-migrate** | `recovery_storage.go` exact-bucket allowlist; resume + investigate use it; empty-DB migrate unchanged | **Fixed offline** | Go unit tests; hosted investigate-attempt-2 `recovery_verification_ready=true` |
| P0-2 | Historical 6K | Compatibility artifact asserted `pgcrypto` owner `supabase_admin` only; hosted owner `postgres` | 6L/6M | Allowlist `postgres\|supabase_admin` (PR #60) | **Fixed earlier** | Hosted `artifact_assert_would_pass=true` |

### P1 — Critical security/integrity

| ID | Area | Root cause | Evidence | Fix | Status | Validation |
|---|---|---|---|---|---|---|
| P1-1 | Security review depth | Full pgTAP/RLS/security suite not re-executed in this disposable environment | Scope/time; Docker sim lacks full Supabase Auth/Realtime | Re-run local `supabase test` / hosted inventory after resume under separate auth | **Needs approval / follow-up** | N/A this pass |
| P1-2 | SECURITY DEFINER surface | Large corpus of `security definer` RPCs; most set `search_path=''` by convention | Migrations Arena/Vault/World | No silent weaken; keep definer+empty search_path discipline | **Open (monitor)** | Static convention; full grant audit deferred |

### P2 — Functional / tooling

| ID | Area | Root cause | Evidence | Fix | Status | Validation |
|---|---|---|---|---|---|---|
| P2-1 | Investigate fail-fast | First storage boolean failure skipped cron/deps probes | 6Q evidence | Collect-all-then-fail in `investigate.go` | **Fixed** | Hosted attempt-2 recorded all gates |
| P2-2 | Local sim stubs | Vanilla Postgres lacks PostGIS / realtime.messages.extension / publication | Failures at mig 23 / 82 / 78 | Document required stubs in `simulate-bootstrap.sql` | **Fixed (tooling)** | Resume sim SUCCESS 106 |
| P2-3 | pg_cron in disposable image | `clash-maintenance` not scheduled locally | NOTICE in sim log | Hosted cron verified separately (6P + investigate-2) | **Accepted gap** | Hosted cron gates PASS |

### P3 — Improvements

| ID | Area | Notes | Status |
|---|---|---|---|
| P3-1 | Simulation harness | Add one-command docker compose with PostGIS + stubs + wal_level=logical | Documented |
| P3-2 | Evidence | Keep empty-DB vs recovery storage gates labeled distinctly in reports | Done |

---

## Part B — Hosted drift (fresh read-only)

**Authorization:** `investigate:zrutlrhhvfcsmssjiijl`  
**Binary:** `5406ee59573f44429fa9d45066c80fad1e2057b2616158bb4976a2ff83824bb6`  
**Result:** exit **0**, `recovery_verification_ready=true`, `stop_condition=none`

| Gate | Result |
|---|---|
| Identity / PG17 / TLS / role | PASS |
| Ledger exactly 43 + statement hashes | PASS |
| Migration 44 ledger/objects | Absent / `confirmed_absent` |
| Prefix-43 dependencies | PASS |
| Manifest `5c39f97c…` / artifact 44 `380b693f…` | PASS |
| Storage | `public-media`+`private-media` **expected**; users=0; objects=0 |
| Empty-DB boolean `buckets` | true (expected; **not** a resume blocker) |
| Cron `clash-maintenance` jobid=1 | inactive; identity match; quiescence clear |
| Unexpected schemas | none |

Evidence: [docs/evidence/phase-11-comprehensive-audit/hosted-investigate.json](evidence/phase-11-comprehensive-audit/hosted-investigate.json)

### Bucket classification

| Bucket | Class | Source |
|---|---|---|
| `public-media` | **expected** | `20260926150000_media_storage.sql` (public=true) |
| `private-media` | **expected** | same (public=false) |

Earlier “zero buckets” evidence was from **empty-project preflight before migrations**, not post-43 state. Treating nonempty buckets as fail was a **false P0**.

---

## Part C — Local migration simulation

Environment: `postgis/postgis:17-3.5` disposable container + auth/storage/realtime stubs (`tools/hosted-staging/simulate-bootstrap.sql`).

| Simulation | Result |
|---|---|
| Full 1→106 (after stubs) | **SUCCESS** ledger 106 |
| Resume: apply 1–43 then 44–106 | **SUCCESS** (publication stub required before Crowd) |
| Artifact 44 apply | **PASS** (`explore_play_system`) |

**Caveats (not identical to hosted Supabase):** no managed Auth/Storage services; `wal_level` warning on publication; `pg_cron` unavailable locally; stubs substitute `auth.uid`, `realtime.*`. Proves **artifact SQL ordering and corrected pgcrypto assert**, not full platform parity.

Logs: `docs/evidence/phase-11-comprehensive-audit/migration-sim-*.log`

---

## Part D — Recovery executor audit (summary)

| Control | Status |
|---|---|
| Mode authorization isolation | Intact (`pause-cron` / `resume` / `investigate` / `migrate`) |
| Empty-ledger `migrate` | Unchanged (still refuses nonempty) |
| Resume storage gate | **Corrected** to expected-bucket inventory |
| Investigate collect-all | **Corrected** |
| Advisory locks | resume `872314059`; pause-cron `872314060` |
| Cron inactive required for resume | Intact |
| Commit-unknown / rollback-unconfirmed | Fail-closed (prior 6O.1) |

---

## Part E–F — Security & app integration (bounded)

This pass prioritized recovery correctness. Static notes:

- Storage policies for media remain owner-namespaced under `public-media` / `private-media`.
- Large SECURITY DEFINER RPC surface generally uses `set search_path=''`.
- Full RLS/pgTAP and client contract matrix: **not re-certified** here; run after hosted resume under separate auth.

Crew UI / unrelated dirty work: **not merged**.

---

## Part G — Offline fixes shipped

1. `tools/hosted-staging/recovery_storage.go` (+ tests)  
2. `investigate.go` — recovery storage + collect-all gates  
3. `resume.go` — recovery storage instead of empty-bucket gate  
4. Simulation bootstrap / docs / evidence  

---

## Part H — Verification matrix (executed)

| Check | Result |
|---|---|
| `go test ./...` (hosted-staging) | PASS |
| `go vet ./...` | PASS |
| Node migration-compatibility-artifact tests | PASS (6/6) |
| Hosted read-only investigate | PASS (recovery ready) |
| Local migration 1→106 | PASS (stubbed platform) |
| Local resume 43→106 | PASS (stubbed platform) |
| TypeScript / Expo Doctor / full pgTAP | **Not run this pass** (record as unverified) |

---

## Part J — Controlled recovery runbook (DO NOT EXECUTE without new auth)

1. Rebuild executor from reviewed head; record binary SHA-256.  
2. `prepare.cjs` → manifest `5c39f97c…`, artifact 44 `380b693f…`.  
3. Fresh private `run_dir`; direct IPv6; CA `7007235814…`; Cred Manager.  
4. Optional fresh `investigate:zrutlrhhvfcsmssjiijl` — require `recovery_verification_ready=true`.  
5. **Authorize once:**  
   `hosted-staging --mode resume --authorize resume:zrutlrhhvfcsmssjiijl --config <private>`  
6. Expect resume-preflight: prefix 43, mig-44 absent, expected buckets, cron inactive.  
7. Apply artifacts 44–106; stop on any failure / commit-unknown; **no retry**.  
8. Post-success: ledger 106; fresh investigate; separately authorize security suites.  
9. Quarantine lifts only after security verification auth.  
10. Cron reactivation requires **separate** write authorization (not part of resume).

---

## Explicit answers

1. **106 locally verified?** Yes (disposable PostGIS + stubs).  
2. **43→106 verified?** Yes (same).  
3. **Buckets explained?** Yes — expected media_storage pair.  
4. **Remaining P0?** None for offline recovery tooling; hosted resume awaits auth.  
5. **Remaining P1?** Full security re-cert deferred.  
6. **Frontend match?** No new P0 contract break found; not fully re-audited.  
7. **Unverified?** Hosted resume execution; full pgTAP/RLS; Expo/TS matrix; managed Realtime/Auth parity in local sim.  
8. **Hosted recovery?** **READY** for separately authorized `resume` (gates green).  
9. **Next auth?** Exactly one: `resume:zrutlrhhvfcsmssjiijl` (plus later security + cron re-enable auths).
