# Phase 11 Step 10 — Operational Blocker Closure

**Baseline:** `6bdefcb` (Step 9). **Worktree:** `C:/p117` (`feat/phase-11-backend-security-7`).
**Target:** `clash-staging` / `zrutlrhhvfcsmssjiijl`.
**Hosted access:** none in this step beyond the Step 9 read-only inventory artefact; **no** hosted SQL,
write, fixture, install, configuration change, function deployment or cron change.
**Evidence:** `docs/evidence/phase-11-10/`.

## Verdict

**3 blockers closed (OPS-3, OPS-4, OPS-5), 2 partially closed (OPS-6, OPS-7), 4 remain blocked on
authorization or hosting-side evidence (OPS-1, OPS-2, OPS-10) or are by-design (OPS-8, OPS-9).**
Staging stays **QUARANTINED**; `clash-maintenance` stays **inactive**.

The headline result: **maintenance concurrency is now proven, not assumed** — overlapping
`run_maintenance` calls are explicitly rejected by a non-blocking transaction advisory lock, and
settlement effects remain exactly-once under genuine concurrent load.

---

## Part A — Hosted service inventory

Management-API access is **not authorized**, so no credential was sought and no Management API call
was made. A minimal, exact authorization request is filed at
`docs/evidence/phase-11-10/management-api-authorization-request.md` (read-only token, staging project
only, revocation after one session, or equivalent redacted Dashboard evidence).

| # | Item | Result | Basis |
|---|---|---|---|
| 1 | Auth settings, signup config, email provider, callback/redirect allowlists | **UNVERIFIED** | not readable read-only from SQL; repository `supabase/config.toml` is a *local* config, not hosted state. `OPS-1` |
| 2 | PostgREST exposed schemas and service status | **PARTIAL PASS** | database-side authorization contract verified (Step 8/9): reviewed RPCs executable by `authenticated`, `profiles` table SELECT revoked, 413 definer functions with `search_path=''`. Exposed-schema/max-rows/service status **UNVERIFIED** |
| 3 | Realtime settings and publication configuration | **PARTIAL PASS** | `supabase_realtime` publication **exists on hosted** (read-only verified); local publication contains exactly 5 tables; hosted subscription runtime **UNVERIFIED** |
| 4 | Deployed Edge Function names, versions, JWT enforcement | **UNVERIFIED** | 6 repository functions with `verify_jwt=true` except `arena-editorial`; deployment state unreadable. `OPS-2` |
| 5 | Expected functions missing / unexpectedly deployed | **UNVERIFIED** | cannot diff repository against deployment without the function list |
| 6 | Staging/production project separation | **PARTIAL PASS** | distinct 20-char staging ref, per-environment `.env*` policy, service key forbidden in the bundle; hosting-plan separation **UNVERIFIED**. `OPS-10` |
| 7 | Required server-side secrets by presence/status only | **UNVERIFIED (no values read)** | names catalogued in `.env.example`; presence/version needs the function-secret list endpoint. No value was read at any point |
| 8 | Staging app configuration and allowed backend origins | **PASS (static)** | `eas.json` `staging` profile (`internal`, `preview`, channel `clash-staging`, `APP_VARIANT=staging`, Android `apk`); origins come only from `EXPO_PUBLIC_SUPABASE_URL`; no runtime staging build produced |

No repository configuration was equated with hosted deployment configuration.

## Part B — Maintenance concurrency (OPS-4) — CLOSED

`scripts/phase11_maintenance_concurrency.sql` (new, local-only, fail-closed on non-loopback) commits
**600 expired Clashes** (each with one juror ballot), then fires `run_maintenance(500)` from
**3 independent dblink sessions** in 6 back-to-back rounds, collects every payload/duration/error,
asserts exactly-once effects, and removes every fixture.

Executed **3 times**; results were identical each run:

| Check | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| concurrency errors (deadlock/timeout/exception) | PASS (none) | PASS (none) | PASS (none) |
| `partial_failure` reported by any call | PASS (0) | PASS (0) | PASS (0) |
| overlap rejected or serialized | PASS — **skipped 6 of 9 calls**, max 2266 ms | PASS — **skipped 6 of 9**, max 1999 ms | PASS — **skipped 6 of 9**, max 2345 ms |
| exactly-once verdicts | PASS (600) | PASS (600) | PASS (600) |
| no duplicate verdict per clash | PASS (max 1) | PASS (max 1) | PASS (max 1) |
| reputation events uniform | PASS (1200) | PASS (1200) | PASS (1200) |
| reported settlements match work | PASS (Σ=600) | PASS (Σ=600) | PASS (Σ=600) |

**Mechanism confirmed from the deployed definition** (`run_maintenance-definition.sql`, line 23):

```sql
if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('arena-maintenance-batch',0)) then
  return jsonb_build_object('skipped',true,'reason','maintenance_in_progress');
```

The design is **reject, not queue and not divide**: an overlapping sweep does no work and says so, the
winner sweeps up to `p_limit`, and because settlements are row-locked and idempotent the effect is
exactly-once. No race, deadlock, timeout or partial failure was observed. **No fix is required and no
new migration is proposed.**

## Part C — Cron reactivation safety (OPS-3) — CLOSED (procedure)

### C.1 Complete mutation audit of `run_maintenance(500)`

Every mutation, in order (source: `run_maintenance-definition.sql`):

| # | Mutation | Class | Reversible? |
|---|---|---|---|
| 1 | `delete from arena_maintenance_failures where last_failed_at < now() - 7 days` | bounded retention prune | no (aged diagnostics only) |
| 2 | `update arena_maintenance_failures set retry_status='resolved'` where the clash/room is already terminal | bookkeeping | yes (status column) |
| 3 | `settle_due_clashes(p_limit)` → verdicts, `reputation_events`, notifications, profile reputation/coins/streak | **business-state change** | **no — ledger is append-only by design** |
| 4 | `expire_stale_takes`, `expire_vault_drops`, `expire_vault_subscriptions`, `expire_world_drops`, `expire_arena_backup_invites` | status transitions | only by manual correction |
| 5 | `close_prediction_games`, `transition_due_arena_rooms`, `award_arena_fun_moments` | status / points | no automatic reverse |
| 6 | `cleanup_stale_media`, `cleanup_rate_limits(7 days)`, `cleanup_meet_signals` | bounded deletes | no |
| 7 | `refresh_arena_trend_snapshots(10,36)` — only when the newest bucket is > 9 min old | additive, idempotent per bucket | re-runnable |

No unbounded delete exists and nothing destroys `profiles`/`takes`/`clashes` rows.
`partial_failure` and `pending_retry_items` are returned in the payload, and failures are recorded in
`arena_maintenance_failures` (allowlisted `operation`, `sqlstate` pattern, `pending`/`resolved`).


### C.2 Corrected reactivation runbook (four distinct recovery layers)

**Layer 0 — one-time authorization + exact identity (read-only; all must hold).** Execution must be
separately authorized and single-use. Preconditions: hosted `verify-complete` returns
`verified_complete=true`; `ledger_count=106`; `unexpected_schema_names` empty; exactly **one**
`clash-maintenance` row with `jobid='1'`, `jobname='clash-maintenance'`, `schedule='* * * * *'`,
`command='select public.run_maintenance(500)'`, `username='postgres'`, `active=false`;
`clash_maintenance_quiescence` all zero; role `postgres`, PostgreSQL 17, TLS with the pinned CA.
**Abort if any precondition differs — never "fix" the job to make it match.**

**Layer 1 — disabling future scheduled executions (the only in-place knob).**
`select cron.alter_job(1, null, null, null, null, false);` deactivates the *existing* job. Never
`cron.unschedule` and never recreate: that changes job identity and breaks the verified contract.

**Layer 2 — reversing or compensating already-committed changes.**
Committed settlements are **not reversible**: `verdicts` and `reputation_events` are append-only, and
settlement is idempotent by row lock. Correctness therefore does not rely on compensation; it relies
on Layers 0/1. If a settlement is ever *business-wrong*, compensation is a **new, separately reviewed
migration** that adds a compensating ledger entry — never an UPDATE/DELETE of history.

**Layer 3 — restoring from a verified recovery point.**
A logical restore must target a database **named `postgres`** (Part E: extensions such as pg_cron are
pinned to that database name). Sequence: deactivate the job (Layer 1) → dump → restore into a
same-named database → re-run `verify-complete` → if the cron job is absent, re-create it only through
the reviewed migration → re-run `verify-complete`. A restore that changes the ledger count or object
inventory fails the gate and must be discarded.

**Layer 4 — interrupted or partially successful sweep.**
`run_maintenance` commits per helper, so an interruption leaves *valid* partial progress and is
resumable (every helper is idempotent; the overlap lock is released at transaction end). Do **not**
retry blindly: first read `run_maintenance(500)->>'partial_failure'` and `->>'pending_retry_items'`
and inspect `arena_maintenance_failures`. If `partial_failure=true`, stop, capture the failure rows and
report. If `false`, one bounded re-run is safe and will report `clashes_settled=0` for completed work.

**Monitoring the first executions.** For the first 3 scheduled runs: `status='succeeded'`,
`partial_failure=false`, `clashes_settled` consistent with the pending queue, entity counts unchanged,
`arena_maintenance_failures` ≤ 1000. **Evidence capture:** sanitized `cron.job_run_details`
(`status`, `return_message`), the job row, and the quiescence probe.

**Stop procedure.** On any deviation: `cron.alter_job(1,null,null,null,null,false)` immediately, keep
staging quarantined, re-run `verify-complete`, report. **Incident recovery:** a `failed` run follows
Layer 4; incorrect data follows Layer 2 (new migration) or Layer 3 (restore, same-name rule).


## Part D — Service and application integration matrix

| Path | Result | Where it was exercised | Caveat |
|---|---|---|---|
| Auth session handling | **PASS (local)** | `local-staging-smoke.mjs`: sign-up, sign-in, session refresh | local GoTrue only; hosted Auth config UNVERIFIED (`OPS-1`) |
| PostgREST calls | **PASS (local)** | anon read; authenticated `get_my_arena_interests`; `get_my_profile`; direct `profiles` select denied | hosted PostgREST service settings UNVERIFIED |
| Realtime subscriptions and event delivery | **PARTIAL (local)** | channel reached `SUBSCRIBED`; publication holds exactly 5 tables (`arena_crowd_messages`, `arena_room_messages`, `creator_live_events`, `creator_live_interactions`, `creator_live_sessions`) | `SUBSCRIBED` is a handshake, **not** proof of broadcast delivery to a second client; no event-delivery assertion was made |
| Storage upload / read / denial | **PASS (local)** | own-namespace upload + authenticated read; disallowed MIME denied; cross-namespace upload denied; bucket policy uses the `my_profile_id()` prefix | hosted Storage API runtime UNVERIFIED (bucket config *is* read-only verified) |
| Edge Function JWT enforcement | **UNVERIFIED** | — | Edge runtime is excluded from the disposable stack; no function was invoked locally or on hosted |
| Arena / Clash journey | **PASS (local)** | `phase11_arena_e2e_validation.sql` 32/32 (settlement, verdict, reputation, notifications) | transactional, rolled back |
| Vault creator and subscription access | **PASS (local)** | suite 087 (entitlement card/media, expired + revoked subscribers) inside the 89/89 pgTAP run | hosted execution not performed |
| World discovery | **PASS (local)** | suites 032/033/034/040/083 in the 89/89 run | hosted execution not performed |
| Notifications | **PASS (local)** | 087/106 suites + E2E block / self-notification / comment assertions | hosted execution not performed |

Static and simulated checks above are explicitly **not** evidence of hosted runtime behaviour.

## Part E — Observability and recovery (OPS-6, OPS-7)

### E.1 Minimum staging monitoring (defined, not yet configured)

| Signal | Threshold / trigger | First response |
|---|---|---|
| API failures (PostgREST/RPC 5xx) | > 1 % of requests over 5 min, or any sustained 5xx | inspect recent migration/RLS changes; check pool saturation |
| Auth failures | sign-in error rate > 5 % over 15 min | verify redirect allowlist + provider status (`OPS-1`) |
| Edge Function errors | any function error rate > 0 for 10 min | check function logs; verify secret *presence* (never values) |
| Maintenance failures | any `cron.job_run_details.status='failed'`, or `partial_failure=true`, or `pending_retry_items > 50` | stop the job (Layer 1); inspect `arena_maintenance_failures` |
| DB resource exhaustion | connections > 80 % of limit, or any statement > 30 s, or disk > 80 % | find long transactions; check `statement_timeout`/`lock_timeout` |
| Storage failures | upload/download 5xx, or bucket/object-count change | verify bucket config and MIME limits |
| Privilege / RLS errors | any `42501`/`42P01` outside expected denial tests | treat as possible regression; re-run `verify-complete` |

### E.2 Incident / restore rehearsal (executed in a disposable database)

`scripts/local-restore-rehearsal.sh` dumped the 106-migration database (`pg_dump -Fc`,
2,371,277 bytes) and restored it into a fresh database with `pg_restore --no-owner --no-acl`.

| Comparison | Source | Restored | Verdict |
|---|---|---|---|
| ledger rows | 106 | 106 | ✅ |
| `public` tables | 121 | 121 | ✅ |
| `public` routines | 447 | 447 | ✅ |
| `public` policies | 118 | 118 | ✅ |
| `storage` policies | 5 | 5 | ✅ |
| `realtime` policies | 1 | 1 | ✅ |
| **`cron` policies** | **2** | **0** | ❌ |
| storage buckets | 2 | 2 | ✅ |
| restore errors | — | 6 (`pg_cron`: *can only create extension in database postgres*; missing `cron` schema/sequences) | ⚠️ |

**Finding (OPS-7):** the application schema restores **completely and identically**; the only gap is
**pg_cron**, because extensions are pinned to a database named `postgres`. The incident runbook must
restore into a database named `postgres`, re-establish `cron` through the reviewed scheduler
migration, and then re-run `verify-complete`. No hosted backup was validated and no backup-validation
success is claimed — this is a **local rehearsal only**.


## Part F — Final answers

| # | Question | Answer |
|---|---|---|
| 1 | Which operational blockers were closed? | **OPS-4** (maintenance concurrency proven: overlap rejected, exactly-once, 3 runs), **OPS-3** (four-layer reactivation runbook + complete mutation audit), **OPS-5** (local harness fully documented/automated). **OPS-7** partially closed with a precise, actionable finding. |
| 2 | Which remain unresolved? | **OPS-1** (hosted Auth config), **OPS-2** (Edge Function deployment/JWT), **OPS-10** (hosting-plan isolation) — all blocked on authorization; **OPS-6** (monitoring defined, not configured); **OPS-7** residual (same-name restore rule; no staging restore point identified). **OPS-8/OPS-9** are by design. |
| 3 | Is hosted Auth correctly configured? | **UNKNOWN — UNVERIFIED.** Not readable through the approved read-only mechanism. A minimal read-only Management-API authorization request is filed. No claim is made. |
| 4 | Are the expected Edge Functions deployed? | **UNKNOWN — UNVERIFIED.** Six functions exist in the repository with the intended `verify_jwt` policy; deployment, versions and JWT enforcement cannot be read. |
| 5 | Is hosted Realtime confirmed operational? | **PARTIALLY.** The `supabase_realtime` publication exists on hosted, the expected table set is present locally, and a local client reached `SUBSCRIBED`. Hosted broadcast delivery is **not** confirmed. |
| 6 | Is maintenance safe under actual concurrent load? | **YES.** Three independent sessions genuinely overlapped three times; every run was deterministic: overlapping sweeps are rejected via `pg_try_advisory_xact_lock` (`skipped=6/9`), with no deadlock, timeout or partial failure, and exactly-once effects (600 verdicts / 1200 reputation events / Σ=600 settlements per run). |
| 7 | Is the cron reactivation procedure safe and reviewable? | **YES.** Layered (disable vs compensate vs restore vs interrupted sweep), exact one-time preconditions, job-identity and uniqueness checks, first-execution monitoring, evidence capture, stop procedure and incident recovery; it never unschedules or recreates the job. |
| 8 | Are backups, monitoring and incident handling sufficient for staging testing? | **NOT YET.** Monitoring is defined but unconfigured; the restore path is rehearsed locally but not proven against a real staging backup, and it must target a database named `postgres`. Sufficient for *controlled testing* only after the monitoring signals are wired and a staging restore point is identified. |
| 9 | What exact authorization is required next? | (a) **read-only Management-API token** (or redacted Dashboard evidence) per `management-api-authorization-request.md`, to close OPS-1/OPS-2/OPS-10; (b) optional bounded **fixture** authorization for hosted smoke accounts; (c) one-time **cron reactivation** through the Layer 0 gate; (d) **quarantine lift**. |
| 10 | Can staging quarantine be lifted? | **NO.** Hosted service verification, monitoring configuration and a staged restore point remain outstanding, and maintenance has never run on hosted. Quarantine remains. |

## Deliverables

- `docs/PHASE_11_STAGING_OPERATIONAL_CLOSURE_STEP_10.md` (this report, Parts A–F).
- `docs/evidence/phase-11-10/operational-issue-register.json` (OPS-1…OPS-10 updated).
- `docs/evidence/phase-11-10/hosted-service-inventory.json` + `hosted-verify-outcome.json`.
- `docs/evidence/phase-11-10/management-api-authorization-request.md` (minimal exact request).
- `docs/evidence/phase-11-10/local-maintenance-concurrency.tap.log` + `run_maintenance-definition.sql`.
- `docs/evidence/phase-11-10/local-restore-rehearsal.log` + `local-restore-policy-comparison.txt`.
- New reviewable tooling: `scripts/phase11_maintenance_concurrency.sql`, `scripts/local-restore-rehearsal.sh`.

## Handoff

Branch `feat/phase-11-backend-security-7`. Draft PR:
`https://github.com/Xcalibur-hub/clash-app/pull/new/feat/phase-11-backend-security-7`.

Staging remains **QUARANTINED**; `clash-maintenance` remains **inactive**. No hosted SQL write, fixture,
account, extension install, configuration change, Edge Function deployment, cron change or production
deployment occurred in this step. The disposable local stack was stopped after testing.

