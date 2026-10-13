# Phase 11 Step 6P: Authorized live cron pause

**Authorization:** `pause-cron:zrutlrhhvfcsmssjiijl` (one narrowly scoped write).  
**Baseline:** PR #62 / `80b6db468e9f6f97b0391f3b04fb07054dc6329f`.  
**Worktree:** `C:/p116p`, branch `feat/phase-11-cron-pause-6p`.

## Verdict: BLOCKED (pause not executed)

Pre-connect **direct IPv6** gate failed on this operator host. **No** `pause-cron` process was started. **No** `cron.alter_job` was issued. Staging remains **QUARANTINED**. Job inactive/quiescent status was **not** re-verified in this step (last hosted inventory: Step 6L — `clash-maintenance` **active**).

| Gate | Result |
|---|---|
| Executor revision | **PASS** — `80b6db468e9f6f97b0391f3b04fb07054dc6329f` |
| Binary SHA-256 | `e6265e381dee81b88dba706358aff32bd23df623d36e20b0d71681b272a68f56` |
| CA pin | **PASS** — `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7` |
| Credential target | **PASS** — `CLASH/staging/zrutlrhhvfcsmssjiijl/postgres`, user `postgres` (blob length checked; secret not disclosed) |
| Artifact manifest | **PASS** — `5c39f97c62559b1f5ed175be409480fb3515fded61a16f0b1b33cc3e22768110` (prepare.cjs, file-only) |
| Concurrent executor | **PASS** — none |
| Direct IPv6 AAAA | **PASS** — `2406:da14:1772:ea01:905e:38ac:2bd2:bfe6` |
| Host global IPv6 / default route | **FAIL** — none |
| TCP `:5432` over IPv6 | **FAIL** — unreachable network |
| `pause-cron` invocation | **NOT RUN** |

## Why stop

Approved transport is **direct IPv6 only** for this write. The host currently has no global IPv6 address and no `::/0` route. Session-pooler / alternate transports were **not** used (not in this authorization). Per fail-closed rules: **STOP**, no retry from this blocked network state.

## Intended (not executed) operation

```text
hosted-staging --mode pause-cron --authorize pause-cron:zrutlrhhvfcsmssjiijl --config <private-nonsecret-config>
```

Mechanism (unchanged): `cron.alter_job(job_id, null, null, null, null, false)` on exactly one `clash-maintenance` job (`* * * * *` / `select public.run_maintenance(500)` / `postgres`), then history + `pg_stat_activity` quiescence.

Private materials (not committed): `C:/p116p/.expo/6p-private/` — CA, binary, config, network-precheck.

## Observed result

| Item | Status |
|---|---|
| Job verified inactive | **No** (not reached) |
| Job verified quiescent | **No** (not reached) |
| Recovery path | **Still blocked** on (1) operator IPv6 connectivity, then (2) successful live pause, then separately authorized investigate/resume |

## Next authorization (when IPv6 restored)

Re-authorize **one** live `pause-cron:zrutlrhhvfcsmssjiijl` from this executor revision (or a newly reviewed head), fresh private `run_dir`, same CA/credential/direct gates. Do **not** combine with resume.

## Evidence

[docs/evidence/phase-11-6p/](evidence/phase-11-6p/)
