# Phase 11 Step 11 — Hosted Service Inventory

**Baseline:** `7495a69` (Step 10). **Worktree:** `C:/p117` (`feat/phase-11-backend-security-7`).
**Target:** `clash-staging` / `zrutlrhhvfcsmssjiijl`.
**Evidence:** `docs/evidence/phase-11-11/`.

## Verdict

**HOSTED PORTION STOPPED AT TASK 1.** No approved staging-scoped read-only Management API credential
exists on this host, so — as instructed — no credential was sought, created or reused, and no
Management API request was attempted. Tasks 2, 3, 6 and 7 are therefore **UNVERIFIED**; tasks 4 and 5
are **PARTIAL** (database-side facts only, refreshed read-only); task 8 is complete.

An exact, zero-credential **Dashboard evidence checklist** was produced to close OPS-1, OPS-2 and
OPS-10 without granting any API access.

**Staging remains QUARANTINED. No hosted write, fixture, deployment, configuration change or cron
change was performed.**

---

## Task 1 — Credential determination (the stop decision)

Determined by inspection only; no value was read or printed.

| Probe | Result |
|---|---|
| Windows Credential Manager targets matching `CLASH` | **only** `CLASH/staging/zrutlrhhvfcsmssjiijl/postgres` (the database password the approved verifier already uses) |
| A `…/management` (or any API-token) credential entry | **absent** |
| Supabase CLI token file `~/.supabase/access-token` | **absent** (`~/.supabase` holds only `traces/`, `telemetry.json`) |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `SUPABASE_URL`, `SB_ACCESS_TOKEN` | **all absent** |
| `gh auth status` | **not logged into any GitHub host** |

**Decision: no Management API access is authorised or possible.** Per task 1 the hosted portion stops
here; the Dashboard evidence checklist (`docs/evidence/phase-11-11/dashboard-evidence-checklist.md`)
is the substitute. Nothing was bypassed and no broader credential was considered.

## Tasks 2–8 — Classification

| # | Task | Result | Basis / why |
|---|---|---|---|
| 2 | Hosted Auth settings (signup, email provider, redirect URLs, JWT settings) | **UNVERIFIED** | not readable from SQL; no Management API. Repository `supabase/config.toml [auth]` is *local* config and is explicitly **not** treated as hosted state |
| 3 | Deployed Edge Function inventory, versions, JWT requirements vs the six repository functions | **UNVERIFIED** | deployment list/versions cannot be read. Repository side fully inventoried (below) |
| 4 | PostgREST exposed schemas and service configuration | **PARTIAL** | database-side authorization contract re-verified read-only (reviewed RPCs, revoked `profiles` table SELECT, definer `search_path=''`); exposed-schema list and service status **UNVERIFIED** |
| 5 | Realtime configuration and expected publication | **PARTIAL** | `supabase_realtime` publication **re-verified present on hosted** read-only; settings/keys and delivery **UNVERIFIED** |
| 6 | Staging/production project separation | **UNVERIFIED** | repository isolation policy re-confirmed (distinct ref, per-env `.env*`, no service key in the bundle); organization/plan separation needs Dashboard metadata |
| 7 | Required secret presence by name/status (values never read) | **UNVERIFIED** | no secret-list endpoint without Management API; **no value was read at any point in this step** |
| 8 | Classify every result PASS/FAIL/UNVERIFIED | **COMPLETE** | this table |

## Fresh read-only database verification (approved mechanism, `verify-complete`)

One read-only run against `zrutlrhhvfcsmssjiijl` returned **exit 0 / VERIFIED**, confirming the
database-side facts that *are* reachable without Management API access:

| Fact | Value |
|---|---|
| Ledger | **106** rows, names/versions/order/hashes verified |
| Cron | exactly one `clash-maintenance` job, `active=false`, **quiescent** |
| Realtime publication | `managed.publication = true` (publication exists) |
| Storage | exactly 2 buckets, correct visibility, 0 auth users, 0 objects |
| Extensions | installed: `pgcrypto`, `pg_cron`, `postgis`; all five reviewed available |
| Schema drift | `unexpected_schema_names` empty |
| Expected objects | all present (H1/H2/H3 + final-migration objects) |

Evidence: `docs/evidence/phase-11-11/hosted-db-inventory.json` (+ `hosted-verify-outcome.json`).
An inventory of configuration is **not** proof of runtime behaviour; nothing here is claimed as such.

## Repository function inventory (explicitly NOT hosted deployment state)

Source: `supabase/config.toml` + `supabase/functions/` — full detail in
`docs/evidence/phase-11-11/repository-function-inventory.json`.

| Function | `verify_jwt` | Files | In-code authorization |
|---|---|---|---|
| `vault-media-access` | true | `index.ts` | `Authorization` header → `asCaller.auth.getUser()` → 401; signs the object server-side so the service key never leaves the runtime |
| `course-lesson-media-access` | true | `index.ts` | same JWT → entitlement → service-sign pattern with an explicit 401 path |
| `creator-ai` | true | `index.ts`, `instructions.ts`, `provider.ts` | authenticated; provider credentials live only in the function environment |
| `digital-creator` | true | `index.ts`, `provider.ts` | authenticated; renders only an already-authorized Creator AI reply |
| `arena-editorial` | **false** | `adapters.ts`, `core.ts`, `index.ts`, `provider.ts`, `worker.ts` | server-only worker; mandatory `x-editorial-secret` header compared in code → 401 |
| `arena-gifs` | true | `handler.ts`, `index.ts` | authenticated GIF proxy; `TENOR_API_KEY` stays server-side |

**Expected count: 6.** Whether exactly these are deployed, at current versions, with these JWT
requirements, is **UNVERIFIED** until the Dashboard list is returned.

## Sanitized evidence

| File | Content |
|---|---|
| `management-api-availability.json` | the credential determination and its consequences |
| `dashboard-evidence-checklist.md` | exact zero-credential Dashboard evidence request (7 sections) |
| `repository-function-inventory.json` | the six functions, `verify_jwt`, files, in-code auth |
| `hosted-db-inventory.json` + `hosted-verify-outcome.json` | refreshed read-only database inventory |
| `operational-issue-register.json` | OPS-1…OPS-10 with Step 11 statuses |

## Remaining blockers and next operational action

| Blocker | Type | Closes with |
|---|---|---|
| Hosted Auth settings unknown (`OPS-1`) | evidence | Dashboard checklist §1–§2 (or a read-only Management API token) |
| Edge Function deployment/JWT unverified (`OPS-2`) | evidence | Dashboard checklist §3 |
| Staging/production isolation unproven (`OPS-10`) | evidence | Dashboard checklist §6 |
| Secret presence unknown (task 7) | evidence | Dashboard checklist §3 secrets (names only) |
| Hosted PostgREST/Realtime *service* config (`task 4/5`) | evidence | Dashboard checklist §4–§5 |
| Monitoring not configured (`OPS-6`) | operational | wire the 7 signals defined in Step 10 Part E.1 |
| Cron reactivation (`OPS-3`) | authorization | Step 10 Layer 0 gate + one-time authorization |
| Staging restore point (`OPS-7`) | operational | identify a staging restore point; restore must target a database named `postgres` |

**Next operational action (single, smallest step):** the operator completes
`docs/evidence/phase-11-11/dashboard-evidence-checklist.md` (sections 1, 2, 3 and 6) and returns it as
redacted evidence. That one action closes `OPS-1`, `OPS-2` and `OPS-10` and unblocks the staging
functional phase — without granting any API access and without any hosted change.

## Deliverables

- `docs/PHASE_11_HOSTED_SERVICE_INVENTORY_STEP_11.md` (this report).
- `docs/evidence/phase-11-11/` (five files, listed above).
- Updated operational register: `docs/evidence/phase-11-11/operational-issue-register.json`.

## Handoff

Branch `feat/phase-11-backend-security-7`. Draft PR:
`https://github.com/Xcalibur-hub/clash-app/pull/new/feat/phase-11-backend-security-7`.

No hosted SQL write, fixture, account, extension install, Edge Function deployment, configuration
change, cron reactivation or quarantine removal occurred. Only one read-only `verify-complete` run was
performed, through the already-approved mechanism. **Staging remains QUARANTINED** and
`clash-maintenance` remains **inactive**.

