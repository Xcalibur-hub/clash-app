# Phase 11 Step 5Y: Identity gate diagnostics

## Outcome and boundaries

File-only implementation and offline checks PASS. **No live diagnostic was executed.** Step 5X remains BLOCKED; its consumed authorization was not reused. The exact failed Step 5X predicate remains unknowable from its saved evidence. No database, Docker, stored credential, application migration, historical manifest, role, grant, certificate configuration or Android state was accessed or changed.

Fresh isolated worktree `C:/p11diag`, branch `fix/phase-11-identity-gate-diagnostics`, exact baseline PR #48 / `2ff9b0eb0181b98769d878e1f8e69a8c7fba0d4f`. Primary-checkout dirty Crew work is preserved.

## Why Step 5X lost the results

`executor.go:identity()` queried `identitySQL`, then combined database, current-role, session-role and backend-SSL checks in one OR expression, returning `unexpected database identity or TLS` without the row. `preflight()` returned immediately on that error. Its raw identity report was populated only by a second query after the gate passed. Consequently the failure report contained only `database_security_passed:false`.

The old SQL also used `coalesce(...,false)`, collapsing NULL or a missing SSL row into false. This prevented distinguishing an observed non-SSL backend from an unavailable observation. Neither issue proves which predicate actually failed in Step 5X.

## Minimal implementation

`inspectIdentity()` evaluates all comparisons independently and returns a fixed diagnostic structure plus a strict error. The shared `identity()` wrapper preserves enforcement in inventory and concurrency callers. Preflight stores the sanitized `identity_gate` structure before checking the error; `Run()` uses its existing evidence writer even on refusal. The redundant second/raw identity query was removed.

Fields:

| Field | Representation |
|---|---|
| `database_match` | boolean; exact `postgres` only |
| `current_role_match` | boolean; exact `postgres` only |
| `session_role_match` | boolean; exact `postgres` only |
| `backend_ssl_observed` | true, false, or string `unknown` |
| `postgres_17_match` | boolean; decoded integer version in [170000,180000) |
| `failure_reason` | fixed code only |

Refusal codes: `identity_query_failed`, `identity_row_missing`, `identity_row_count_invalid`, `identity_values_malformed`, `database_mismatch`, `current_role_mismatch`, `session_role_mismatch`, `backend_ssl_unknown`, `backend_ssl_required`, `postgres_17_required`. A valid result uses `none`. Multiple failed conditions remain visible independently; the reason code selects the first applicable refusal in the documented implementation order. No-row/query-error cases have false match flags and unknown SSL; flags in these cases do not assert that a raw value was observed.

Raw database/role names, passwords, environment values, connection strings, unrestricted result columns and sensitive role attributes are never added to these diagnostics. A malformed payload cannot be copied into the evidence. Existing later catalog inventory is unchanged.

## Backend PID, NULL and TLS interpretation

The scalar subquery remains `select ssl from pg_stat_ssl where pid=pg_backend_pid()` in the same SQL statement as the identity fields. It addresses the backend executing that statement, not an arbitrary session. A missing row or NULL becomes SQL NULL, represented as `unknown`; a non-boolean decoded value also reports unknown and is rejected as malformed. Both unknown and false fail the existing mandatory backend-SSL gate. Multiple matching SSL rows would produce a query error and fail closed.

The existing session connector captures a backend PID and checks continuity before subsequent queries, including identity. A changed backend refuses execution; rollback is attempted before the continuity check to preserve safe cleanup of an aborted transaction. The PID guard and its cleanup semantics were not modified.

PostgreSQL documents `pg_stat_ssl` as per-backend connection SSL information. Through a pooler, this describes the pooler-to-PostgreSQL connection, not the caller-to-pooler TLS handshake. See [PostgreSQL 17 monitoring documentation](https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-SSL-VIEW).

Client-to-pooler verification still uses the explicit pinned CA root pool, TLS >=1.2, hostname verification and no plaintext fallback. Supabase documents the shared session pooler on port 5432 and project-suffixed routing username; session mode preserves session features. See [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres).

Neither generic PostgreSQL database/role names nor SSL observations independently prove the target project. Independent authenticated management identity, approved exact endpoint/routing username and the per-project credential remain necessary. No target identity, endpoint or security requirement was relaxed. Public documentation inspection occurred; the changelog.md retrieval failed, so no changelog-based compatibility claim is made.

## Evidence and failure handling

A gate refusal returns the diagnostic structure to `preflight()` before its deferred rollback. `Run()` then records it in `preflight.json` and the command records a failure outcome. Evidence-write failure itself remains fatal. If the filesystem refuses writes, persistence cannot be guaranteed; the executor reports the safe evidence error and stops rather than claiming diagnostic success. No raw OS error or path is copied into that error. A connection/PID binding failure before the identity query still cannot provide observations that never occurred.

## Offline regression results

- **81 Node tests passed**, 0 failed/skipped.
- Go: **52 top-level tests, 82 subtests, 123 leaf cases passed**, 0 failed/skipped. These are overlapping reporting levels, not additive totals.
- Six new top-level identity test functions cover each of the four failures; SSL NULL/absent/malformed; malformed/null identity/version values; wrong major version; zero/two identity rows; simultaneous failures; redaction of injected extra fields; query failure; changed backend; successful gate; PID SQL contract; refusal before extension queries; rollback; saved failure evidence; callback and actual filesystem evidence-write failures.
- `go vet ./...`, `go mod verify`, Windows `go build -trimpath`: exit 0. The executable was built but **not run**.
- All **245** frozen source hashes, **106** compatibility artifacts and four vendor templates verified. Both artifact and suite manifest hashes match Step 5X unchanged.
- Initial Go run failed because the fresh worktree had not yet generated `hosted-suites.json`. File-only artifact preparation resolved the missing prerequisite; the complete final run passed. No assertion or test was weakened.
- `git diff --check` passed; no SQL suite was executed. Prepared 89-suite files are only offline inputs.

Machine-readable sanitized evidence: [offline-results.json](evidence/phase-11-5y/offline-results.json). It records exit codes, counts, artifact hashes, executable hash and passing new test names. No real credential or live result is included.

## Proposed live procedure -- NOT authorized or executed

Recommend separately authorizing **one** execution of the reviewed preflight with a fresh single-use evidence directory, under the same owner account and approved CA/session-pooler configuration. Reuse the enrolled credential internally; do not re-enroll or extract it. Rebuild/verify the approved revision and binary hash first, confirm private NTFS ACLs and exact target management metadata, and exclude inherited backend overrides.

Illustrative invocation only (configuration path and binary must first be reviewed):

```text
hosted-staging-5y.exe --mode preflight --authorize preflight:zrutlrhhvfcsmssjiijl --config <approved-private-nonsecret-config.json>
```

The existing preflight is the smallest available reviewed entrypoint; it is not an identity-only command. It uses one connection, backend continuity SELECTs, BEGIN READ ONLY, the fixed identity query and ROLLBACK. If identity fails, it saves the independent gate results and stops before later checks. If identity passes, it continues the existing bounded read-only catalog/emptiness/ledger checks; authorization must explicitly cover those as well. No new command, ad hoc SQL or alternative connection path was introduced.

Stop on the first failure, including evidence/cleanup failure. No retry, fallback endpoint, TLS weakening, migration, SQL suite, fixture, role change or repair is included. Review only sanitized evidence. A false/unknown backend SSL result remains a blocker requiring separate investigation; it must never be converted to a warning.

**Required next authorization:** one bounded read-only preflight against exactly `clash-staging` / `zrutlrhhvfcsmssjiijl`, Tokyo, approved shared session-pooler port 5432, including existing post-gate catalog checks if identity passes. No such authorization was sought or exercised in Step 5Y.

Application security, hosted migration compatibility and backend TLS remain unverified. Step 4C remains BLOCKED against the existing local database; Android Step 2F remains DEFERRED. Stop after the documentation/implementation draft PR; do not merge or deploy.
