# Phase 11 Step 6L: Quarantined staging investigation

**Mode:** Read-only investigation. No migrate, resume, repair, reset, fixtures, or SQL security suites.

**Baseline:** PR #58 / `56b441cc6db011ea501c767c33d34635a21d5cab` (Step 6K quarantine).  
**Worktree:** `C:/p116l`, branch `audit/phase-11-quarantine-investigation-6l`.

## Quarantine status: RETAINED

| Finding | Result |
|---|---|
| Hosted ledger count | **43** |
| First 43 integrity (order/name/hash vs frozen artifacts) | **PASS** (0 hash mismatches) |
| Migration 44 ledger entry | **Absent** |
| Migration 44 application objects | **Absent** (tables/types/functions/columns/enum labels probed) |
| Migration 44 rollback | **`confirmed_absent`** |
| Cron `clash-maintenance` | **Present, active**; 25/25 succeeded in last hour |
| Original migrate SQLSTATE | **Unavailable** (executor withholds diagnostics) |
| Most likely failure cause | **Confirmed** — see below |
| Staging safe to continue without new auth | **No** |

## Offline analysis (before connect)

Frozen compatibility artifact `20261004120000_explore_play_system.sql` begins with a managed-pgcrypto assertion injected by `scripts/migration-compatibility-artifact.cjs` (`assert-managed-pgcrypto`):

- Replaces source `create extension if not exists pgcrypto with schema extensions;`
- Requires `pgcrypto` **1.3** in schema `extensions` owned by **`supabase_admin`**
- Raises if that predicate fails — **before** any enums/tables/RPCs in the file

Step 6K/6I preflight already recorded hosted `pgcrypto` owner **`postgres`**. Therefore migration 44’s first statement fails inside the migrate transaction; the reviewed executor rolls back that transaction and never inserts a ledger row.

Competing hypotheses (enum/`ALTER TYPE`, missing explore deps, permissions mid-file) are **unlikely**: those statements are unreachable if the opening assert fails, and probes show no mig-44 objects.

## Read-only hosted inventory

| Item | Value |
|---|---|
| Authorization | `investigate:zrutlrhhvfcsmssjiijl` (new read-only mode; reuses TLS/credential/artifact gates) |
| Executor revision (this step) | branch head including `investigate` (docs PR) |
| Binary SHA-256 | `2ae1a66e50bcf5dbacbb9948fede995e14b5df8239e1c813be34ef305b444464` |
| Connection | direct IPv6; CA `7007235814…`; identity PASS |
| Transaction | `BEGIN READ ONLY` + `statement_timeout=15s`; rollback confirmed |
| Outcome | exit 0 / `success=true` (investigation only; not a security pass) |

### A. Ledger

- Count **43**
- First: `20260926120000_initial_arena_schema`
- Last: `20261003200000_explore_for_you_ia` (matches 6K last successful)
- All 43 statement digests match frozen artifact hashes
- No entry for `20261004120000` / `explore_play_system`
- No unexpected extra entries

### B. Failed migration state

Probed mig-44-only relations/types/functions/columns/enum labels: **all false**. Combined with missing ledger row and executor rollback-on-SQL-error path → rollback **confirmed**, not commit-uncertain.

### C. Cron

| Field | Value |
|---|---|
| jobname | `clash-maintenance` |
| schedule | `* * * * *` |
| command | `select public.run_maintenance(500)` |
| username | `postgres` |
| active | **true** |
| runs (1h) | 25 succeeded, 0 failed |

**Operational risk:** Job is executing against the **partial** schema (first 43). It is bounded/idempotent maintenance, not a wipe; auth/storage remain empty of users/objects per prior preflight lineage. Risk is incomplete-product behavior, not secret exposure. **Do not** unschedule without separate write authorization.

### D. Failure classification

| Item | Status |
|---|---|
| Original SQLSTATE from 6K migrate | **Unavailable** by design |
| Live `artifact_assert_would_pass` | **false** |
| Live pgcrypto owner | **postgres** (not `supabase_admin`) |
| Classification | **Confirmed root cause:** compatibility artifact assert requires `supabase_admin`; hosted owner is `postgres` |

## Recovery analysis (offline only — not authorized)

1. **First 43 intact:** Yes (ledger + hashes).
2. **Migration 44 rolled back:** Yes (`confirmed_absent`).
3. **Required change:** Align the **compatibility transform** (and thus artifact 44 + manifest hash) with the 6F hosted owner allowlist (`postgres` \| `supabase_admin`), **or** a separately reviewed hosted ownership change (not recommended as first path). Do **not** silently edit frozen source seal SQL without a new freeze review.
4. **Integrity implication:** Any assert rewrite produces a **new** `artifact_sha256` for file 44 and a new compatibility manifest SHA; operators must pin the new hashes.
5. **Continuation strategy (proposal only):** After reviewed artifact regen + offline tests, authorize a **resume-from-ledger-prefix-43** migrate capability **or** a new sterile project + full 106 — never blind re-run of current binary against this DB (preflight refuses nonempty ledger; migrate has no resume).
6. **Cron:** Leave active under quarantine unless a separate auth pauses it before further DDL; document behavior in recovery auth.
7. **Exact next write authorization needed:** (a) reviewed compatibility-artifact fix + hash update PR; then (b) explicit `migrate`/`resume` authorization naming new manifest hashes and quarantine exit criteria. Optional prior: read-only or write auth to pause cron.

## Executor change in this step

Added **`investigate`** mode only: fixed parameterized SELECTs, read-only transaction, evidence `investigate.json`, separate `investigate:<ref>` authorization. No migrate-path weakening. Offline tests cover auth isolation, read-only contract, and ledger stop condition.

## Recommended next authorization

1. **FILE-ONLY:** Fix `assert-managed-pgcrypto` to accept approved hosted owners (`postgres`/`supabase_admin`), regenerate compatibility artifacts, update pinned manifest hashes, offline verify.
2. **Then separately:** Authorize either resume-from-43 on clash-staging (new reviewed executor resume path) **or** rebuild on a new sterile project.
3. Until then: **staging remains QUARANTINED**.

## Evidence

[docs/evidence/phase-11-6l/](evidence/phase-11-6l/)
