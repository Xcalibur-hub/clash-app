# Phase 11 Step 6G: Direct staging compatibility preflight

## Result: BLOCKED — unexpected schema `pgbouncer`

Exactly **one** authorized direct-mode preflight ran against `clash-staging` / `zrutlrhhvfcsmssjiijl` using the reviewed Step 6F executor (`5ce5641`). Exit **1**, failure `unexpected application objects; review required`. The allowlisted diagnostic recorded unexpected schema name **`pgbouncer`**. No automatic allowlist, drop, retry, pooler fallback, migration, or repair was performed.

**Staging is NOT eligible for migration deployment. Application security remains unverified.**

## Exact failing prerequisite

| Gate | Result |
|---|---|
| Unexpected application objects | **FAIL** — `unexpected_schemas=1`, name=`pgbouncer` |

Stop condition matches authorization: record the name and stop; do not allowlist or remove.

## What passed before the stop

| Check | Result |
|---|---|
| Direct TLS ≥1.2, pinned CA, hostname `db.zrutlrhhvfcsmssjiijl.supabase.co` | PASS |
| Identity: database/current/session `postgres` | PASS |
| `backend_ssl_observed` | **true** |
| PostgreSQL 17 | PASS |
| `pgcrypto` 1.3 / `extensions` / owner **`postgres`** | **PASS** (Step 6F allowlist) |
| Available extension catalog (pgcrypto/postgis/pg_cron/pgtap/dblink) | Reached / recorded |
| Managed Auth/Storage/Realtime + publication | PASS |
| Restricted role/files; cron preloaded | PASS |
| Public relations/routines/types counts | 0 / 0 / 0 |
| Existing auth users / storage objects / buckets | false |
| Application ledger | **Not reached** after schema refusal |

## Preconditions verified

- Worktree `C:/p116g`, branch `validate/phase-11-direct-compat-preflight-6g`, exact PR #53 commit `5ce5641708b49fac2270ee008b4a298a0a62f199`.
- Step 6F vs parent `0330ef1` reviewed: pgcrypto owner allowlist + unexpected schema name inventory + regressions.
- Rebuilt executable SHA-256 `baf063e20aebdf1180bd68652166460ecb65ca24d5d7b303f1a7c47f148a52fe` (differs from Step 5Y binary as expected after 6F code change).
- `go test ./...` PASS; frozen **245** hashes / **106** artifacts; manifests `8f50541d…` / `12cac2a2…`.
- CA `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`; private NTFS ACL owner/SYSTEM/Administrators.
- IPv6 global + default route; AAAA; TCP `:5432` CONNECTED before launch.
- Windows Credential Manager entry reused internally; no disclosure/re-enrollment.
- Fresh single-use `preflight-attempt-1` evidence directory.

## Migration eligibility

**Not eligible.** Do not deploy the 106 migrations.

## Remaining blockers / next authorization

1. Decide whether `pgbouncer` is a documented managed schema to allowlist (file-only review + separate approval) **or** unexpected application state requiring owner investigation.
2. Separately authorize another single preflight only after that decision is implemented (or the schema is otherwise resolved without unauthorized mutation).
3. Application security still UNVERIFIED. Step 4C BLOCKED; Step 2F DEFERRED.

## Evidence

[docs/evidence/phase-11-6g/](evidence/phase-11-6g/) — sanitized `preflight.json`, `outcome.json`, process/endpoint/offline summaries. Private config, CA path, binary, and credentials excluded.
