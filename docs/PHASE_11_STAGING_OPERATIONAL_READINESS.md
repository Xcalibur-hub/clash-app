# Phase 11 Step 9 — Staging Operational Readiness

**Baseline:** `579349b` (Step 8). **Worktree:** `C:/p117` (`feat/phase-11-backend-security-7`).
**Target:** `clash-staging` / `zrutlrhhvfcsmssjiijl`.
**Hosted access used:** read-only `verify-complete:zrutlrhhvfcsmssjiijl` only.
**Evidence:** `docs/evidence/phase-11-9/`.

## Verdict

**Staging is DATABASE-READY and structurally verified; STAGING-FUNCTIONAL-READY is close but
gated on service-level verification; PRODUCTION READINESS is not claimed.**
Staging stays **QUARANTINED**, `clash-maintenance` stays **inactive**, and no hosted write,
fixture, install, or deployment was performed.

A fresh read-only hosted run re-confirmed the Step 8 state with **no drift**: `verified_complete=true`,
ledger **106**, cron inactive **and quiescent**, 2 correctly configured buckets, no unexpected
schemas, all expected objects present.

---

## Part A — Hosted service readiness (read-only)

| # | Item | Result | Basis |
|---|---|---|---|
| 1 | Supabase Auth configuration and callback URLs | **UNVERIFIED** | not readable through the approved read-only mechanism; repository config (`supabase/config.toml` `[auth]`) is consistent (`enable_signup`, `jwt_expiry=3600`, no anonymous sign-ins) but that is *local* config, not hosted runtime |
| 2 | PostgREST schema exposure and RPC accessibility | **PARTIAL** | exposed-schema/role contract **VERIFIED in the database**: `authenticated` may execute the reviewed RPCs (`get_my_profile`, `my_profile_id`, `get_my_arena_interests`), table-wide `profiles` SELECT is revoked, and 413 `SECURITY DEFINER` functions all carry `search_path=''`. Hosted PostgREST *runtime* (db-schemas, max-rows, OpenAPI) is **UNVERIFIED** |
| 3 | Storage service and bucket configuration | **PASS (read-only)** | exactly `public-media` (public) + `private-media` (private), both `file_size_limit=104857600` with the reviewed MIME allowlist; 0 objects; 5 `storage.objects` policies; the 5 policies and the `my_profile_id()` upload-namespace rule are enforced (proven locally) |
| 4 | Realtime publication and subscriptions | **PARTIAL** | publication `supabase_realtime` **exists on hosted** (verified) and locally publishes 5 tables; a local `SUBSCRIBED` round-trip succeeded. Hosted subscription runtime is **UNVERIFIED** |
| 5 | Edge Function deployment inventory and JWT config | **UNVERIFIED** | 6 functions in the repository (`arena-editorial`, `arena-gifs`, `course-lesson-media-access`, `creator-ai`, `digital-creator`, `vault-media-access`) with `verify_jwt=true` except `arena-editorial`; deployed inventory/versions/JWT enforcement cannot be read read-only |
| 6 | Staging-versus-production isolation | **PARTIALLY VERIFIED** | repository policy is explicit (separate project ref, per-environment `.env*`, service key forbidden in the bundle — `.env.example`), and the target is a distinct 20-char project ref; hosting-plan isolation is not provable from read-only DB access |
| 7 | Expo staging build configuration and backend origins | **PASS (static)** | `eas.json` defines a `staging` profile: `distribution=internal`, `environment=preview`, `channel=clash-staging`, `APP_VARIANT=staging`, Android `apk`, Node 22.13.0; origins come from `EXPO_PUBLIC_SUPABASE_URL` (never a hard-coded host). No **runtime** staging build was produced |
| 8 | Required secrets by name and configuration status | **PARTIAL** | names documented, values never read: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (public, RLS-scoped), optional `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_API_KEY`/`_HOST`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, `EXPO_PUBLIC_ARENA_GIFS_ENABLED`; server-only (never in the bundle): `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`, `TENOR_API_KEY`, `CREATOR_AI_API_KEY`, `DIGITAL_CREATOR_API_KEY`, `x-editorial-secret`. Configuration status: all optional integrations appear **unset** |

No runtime claim is made from static configuration alone.

## Part B — Functional smoke testing (disposable local, all deterministic and cleaned up)

Disposable stack `clash_p11_pgtap` (PostgreSQL 17.6.1.002, 106 migrations). Three suites, all raw
logs in `docs/evidence/phase-11-9/`.

| Suite | Result | What was actually exercised |
|---|---|---|
| `scripts/phase11_arena_e2e_validation.sql` (pre-existing, fail-closed, transactional) | **PASS 32/32** | take creation → challenge → accept → duel → judgement → settlement → verdict → reputation ledger → `profile_clash_stats` → comment/reply notifications; blocks suppress notifications; self-notifications blocked; repeat settlement awards nothing extra |
| `scripts/local-staging-smoke.mjs` (new, loopback-only) | **PASS 14/14** | sign-up, sign-in, session refresh; profile via `get_my_profile()` **and** direct `profiles` select denied; `my_profile_id`; anon PostgREST read; authenticated RPC; Storage own-namespace upload + authenticated read; disallowed-MIME denied; cross-namespace upload denied; Realtime `SUBSCRIBED`; disposable user removed |
| `scripts/phase11_maintenance_safety.sql` (new, fail-closed) | **PASS 12 / UNVERIFIED 1 / FAIL 0** | see Part C |

Additional paths already covered by the 89-suite pgTAP run (Step 8, 3444 assertions): vault
entitlements/previews, creator + advertiser isolation, world discovery/privacy, crowd/typing,
scheduled-job contracts, moderation and relationship authorization.

**Not exercised locally (honest gaps):** Edge Function invocation (the disposable stack excludes
`edge-runtime`), device UI paths, and hosted runtime behaviour. Everything created in the local
database was inside transactions or explicitly deleted; the only durable local artefacts are
Docker volumes of the disposable project.

## Part C — Maintenance cron safety (`public.run_maintenance`)

`run_maintenance(500)` returns a stable **16-key** payload (`media`, `arena_trends`, `takes_expired`,
`clashes_settled`, `partial_failure`, `rate_limits_pruned`, `meet_signals_pruned`,
`pending_retry_items`, `vault_drops_expired`, `world_drops_expired`, `prediction_games_closed`,
`arena_rooms_transitioned`, `arena_fun_moments_awarded`, `maintenance_item_failures`,
`vault_subscriptions_expired`, `arena_backup_invites_expired`).

| Property | Result | Evidence |
|---|---|---|
| Privilege boundary | **PASS** | `anon` and `authenticated` cannot execute `run_maintenance`; `service_role` can; the failure-logging helper `record_arena_maintenance_failure(text,text,text)` is owner/service-only (`auth_exec=false`) |
| Idempotency | **PASS** | two consecutive runs: `partial_failure=false` both times, identical 16-key payload, second run settles **0** clashes and expires **0** takes/vault/world drops |
| Unexpected data deletion | **PASS** | profiles, takes, clashes, comments, notifications, reputation_events, arena_rooms counts identical before/after |
| Expiry and retention | **PASS** | failure ledger capped at **1000** after 1005 logged failures (cap enforced on *log*); an 8-day-old row is pruned by the maintenance run; `sqlstate`/`operation` allowlists enforced (`clash_settlement`/`room_transition`) |
| Queue processing | **PASS** (contract) | 16 queue/report keys present and stable; second run is a clean no-op |
| Runtime and batching | **PASS** | 13.9 ms and 3.5 ms for `p_limit=500` on an idle database; `p_limit` is the batch bound |
| Concurrency | **UNVERIFIED** | an overlapping call could not be reproduced on an idle queue: the held call takes no work, so no overlap lock is held and the second call returns a normal payload (not `skipped`). Re-test with queued work before relying on it |
| Security boundaries | **PASS** | definer + `search_path=''`, owner `postgres`, no client EXECUTE; see Step 7/8 matrix |

### Cron-reactivation runbook (prepared, NOT executed)

One-time, separately authorized procedure. Target: exactly one inactive job.

1. **Preconditions (all must hold, read-only):** hosted `verify-complete` returns
   `verified_complete=true`; `clash_maintenance_jobs` = exactly one row, `jobid='1'`,
   `jobname='clash-maintenance'`, `schedule='* * * * *'`, `command='select public.run_maintenance(500)'`,
   `username='postgres'`, `active=false`; `clash_maintenance_quiescence` all zero.
2. **Identity gate:** re-confirm project ref `zrutlrhhvfcsmssjiijl`, role `postgres`, PostgreSQL 17,
   TLS with the pinned CA — the same gates the reviewed executor already enforces.
3. **Action (single statement, idempotent):**
   `select cron.alter_job(1, null, null, null, null, true);` — re-activates the *existing* job; it does
   **not** unschedule or recreate it, and does not change schedule or command.
4. **Post-activation verification (within 3 minutes):** the job is still unique and `active=true`;
   `cron.job_run_details` shows a `succeeded` run with `return_message` containing no
   `partial_failure:true`; `pg_stat_activity` shows no long-running maintenance backend; entity counts
   unchanged; `arena_maintenance_failures` still ≤1000.
5. **Failure handling:** if the job is missing/duplicated, if any run reports `failed`, or if counts
   change outside the expected sweep, immediately
   `select cron.alter_job(1, null, null, null, null, false);` (deactivate), keep staging quarantined,
   and report; never `cron.unschedule` or recreate the job.
6. **Rollback:** setting `active=false` restores the verified state; no data rollback is required
   because maintenance is designed to be idempotent.


## Part D — Release gate

Three distinct levels. **DB readiness = READY. Staging functional readiness = CONDITIONAL.
Production readiness = NOT CLAIMED.**

| Gate | DB ready | Staging functional | Production | Basis |
|---|---|---|---|---|
| Database integrity | ✅ | ✅ | ⛔ | 106/106 hosted ledger + hashes; no drift (Step 8 + Step 9 re-run) |
| Security (RLS/H1-H3/settlement) | ✅ | ✅ | ⚠️ | 89/89 pgTAP locally; hosted H1/H2/H3 verified read-only; no hosted RLS *execution* yet |
| Auth | ⚠️ | ⚠️ | ⛔ | local sign-up/sign-in/refresh PASS; hosted Auth config UNVERIFIED (`OPS-1`) |
| Storage | ✅ | ✅ | ⚠️ | buckets/policies/MIME/namespace rules verified hosted read-only + locally enforced |
| Realtime | ⚠️ | ⚠️ | ⛔ | publication verified; local subscribe PASS; hosted subscriptions UNVERIFIED |
| Edge Functions | ⚠️ | ⛔ | ⛔ | repository inventory only; deployment + JWT runtime UNVERIFIED (`OPS-2`) |
| App/backend contracts | ✅ | ✅ | ⚠️ | typecheck, 539 unit, 24 editorial, Expo Doctor 18/18, Android export, integration-static (Step 7/8) |
| Maintenance | ✅ | ✅ | ⚠️ | Part C: idempotent, retention-correct, privilege-safe; concurrency UNVERIFIED; cron still inactive (`OPS-3`) |
| Staging isolation | ⚠️ | ⚠️ | ⛔ | distinct project ref + per-env config policy; hosting-plan isolation unprovable read-only (`OPS-10`) |
| Observability | ⛔ | ⛔ | ⛔ | Sentry/PostHog unset and unverified (`OPS-6`) |
| Rollback / incident response | ⚠️ | ⚠️ | ⛔ | forward-only migrations; restore-point + incident runbook not yet rehearsed (`OPS-7`) |

### Staging smoke-test plan (for the next authorized phase)

1. Authorize a bounded read-only hosted inventory (Auth settings, PostgREST config, Edge Function
   versions, Realtime keys) to close `OPS-1`, `OPS-2`.
2. If test accounts are wanted, request **fixture authorization** explicitly: named test users, no
   production data, deterministic prefixes, and a documented teardown.
3. Run the hosted smoke set in this order: Auth sign-in → `get_my_profile` → one public read →
   one authenticated RPC → Realtime subscribe → Storage own-namespace upload/delete.
4. Only then execute the cron-reactivation runbook; then re-run `verify-complete`.
5. Lift quarantine only after 1-4 pass and the operational register is closed or accepted.

## Final verdict

| # | Question | Answer |
|---|---|---|
| 1 | Is the hosted database structurally ready? | **YES.** Fresh read-only verification passed with no drift: 106/106, expected objects, correct buckets, managed inventory, quiescent inactive cron. |
| 2 | Are hosted services configured correctly? | **PARTIALLY VERIFIED.** Storage and the PostgREST/DB authorization contract verified; Auth, Realtime runtime, Edge Functions and hosting-plan isolation are **UNVERIFIED** from read-only access (`OPS-1`, `OPS-2`, `OPS-10`). |
| 3 | Which functional paths have actually been exercised? | Locally: full Arena/Clash journey (32/32), auth/session/PostgREST/Storage/Realtime (14/14), maintenance safety (12/1/0), plus 89/89 pgTAP (3444 assertions) covering vault entitlements, creator/advertiser isolation, world discovery, crowd/typing, moderation. Hosted: catalog/ledger/storage/cron only. |
| 4 | Is maintenance safe to reactivate? | **Structurally yes, operationally gated.** Idempotent, no unexpected deletion, retention correct, privileges tight; tests ran on an **empty** database, concurrency is UNVERIFIED, and no hosted maintenance has ever run. The runbook is prepared; execution needs separate authorization. |
| 5 | What remains unverified? | Hosted Auth config; hosted Realtime/PostgREST/Edge runtime; hosted maintenance *execution*; overlap rejection under load; observability; rollback/incident rehearsal; device UI. |
| 6 | What exact separate authorization is needed? | (a) read-only hosted service inventory (Management API or Dashboard evidence) to close `OPS-1`/`OPS-2`; (b) optional bounded fixture authorization for hosted smoke accounts; (c) one-time cron-reactivation authorization (runbook above); (d) quarantine-lift authorization. |
| 7 | Can staging quarantine be lifted? | **NO.** Database readiness is complete, but hosted service verification, maintenance execution and the operational register are open. Quarantine stays in place. |

## Deliverables produced

- This report: `docs/PHASE_11_STAGING_OPERATIONAL_READINESS.md` (service readiness, functional smoke,
  maintenance safety, cron runbook, smoke plan, release gate).
- Operational issue register: `docs/evidence/phase-11-9/operational-issue-register.json`.
- Hosted read-only service inventory: `docs/evidence/phase-11-9/hosted-service-inventory.json`
  (+ `hosted-verify-outcome.json`).
- Local functional evidence: `local-arena-e2e.tap.log`, `local-functional-smoke.json`,
  `local-maintenance-safety.tap.log`, `local-functional-summary.json`.
- New reviewable tooling: `scripts/local-staging-smoke.mjs`, `scripts/phase11_maintenance_safety.sql`.

## Handoff

Branch `feat/phase-11-backend-security-7` (commit follows). Draft PR:
`https://github.com/Xcalibur-hub/clash-app/pull/new/feat/phase-11-backend-security-7`.
Staging remains **QUARANTINED**; `clash-maintenance` remains **inactive**; no hosted writes, fixtures,
installs, cron changes or deployments were performed in this step. The disposable local stack was
stopped after testing.

