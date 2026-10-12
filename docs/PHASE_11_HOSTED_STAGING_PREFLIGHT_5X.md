# Phase 11 Step 5X: Hosted staging read-only preflight

## Result: BLOCKED

On 2026-10-12, the single authorized preflight exited **1** with `unexpected database identity or TLS`. The executor stopped at its first database identity check. No retry, alternate endpoint, migration, SQL suite, extension installation, privilege change or database repair was performed. Application security has **not** passed. Separately authorized migration deployment **cannot proceed** while this gate remains unresolved.

## Reviewed target and provenance

- Owner-created `clash-staging`, reference `zrutlrhhvfcsmssjiijl`, Tokyo `ap-northeast-1`; owner explicitly approved Tokyo.
- Authenticated management metadata confirmed `ACTIVE_HEALTHY`, creation timestamp `2026-10-12T11:30:10.599833Z`, approved organization `dninpemahklihtxcjrnz` / Xcalibur-hub-2's Org, Free tier, managed PostgreSQL `17.11.0.003`. This is management evidence, not a successful SQL version check.
- Owner supplied exact Dashboard session pooler `aws-0-ap-northeast-1.pooler.supabase.com:5432`, database `postgres`, routing username `postgres.zrutlrhhvfcsmssjiijl`. Management metadata independently binds the project/organization; it does not independently return this pooler endpoint.
- Isolated branch `validate/phase-11-hosted-preflight-5x`, worktree `C:/p11prex`, reviewed Step 5W PR #47 implementation `5d32eba96c0483ed5f771c2973b42471c513b9c3`, stacked on PR #45 lineage.
- Frozen implementation `9c71d72a15095047821789386ca9d395961bab4f`; manifest seal `a92a550527f810913b01f6e6411dc78996c71a06`.
- Frozen manifest SHA-256 `a9b30736c87a7fac05c9764404dfd58a876f64db6a3e072e9a348cac8b162b4e`.
- Verified all **245** frozen source blobs and **106** generated compatibility migrations. Artifact manifest SHA-256 `8f50541d3eed55bd905117a217bc8118a6b5483d1ffec2e5d0477b2be71b8c8a`; suite manifest SHA-256 `12cac2a2b0119cb99110061800e14ea167f0928919da4bbd4e464dc0fbead7fe`. The 89 suites and ten hosted derivatives were prepared offline, not executed.

## Credential and local safeguards

The reviewed `store-credential` command exited 0. Its implementation writes a per-user Windows Generic Credential, reads it back and compares it internally before success. Target: `CLASH/staging/zrutlrhhvfcsmssjiijl/postgres`. This verifies enrollment without printing or independently extracting the password. The subsequent preflight retrieved it inside the reviewed executable and established a database connection. No password was placed in arguments, URLs, plaintext files, reports or logs. The native secure dialog was the only enrollment input path.

Private configuration, CA and evidence directories have NTFS access restricted to the owner, SYSTEM and Administrators. The private root disables inherited access; child files and the newly created attempt directory inherit only those entries. A sandbox identity was denied access, consistent with the ACL; owner-context verification succeeded. No ACL was broadened. Only allowlisted nonsecret Windows platform variables were forwarded to the executable; inherited backend overrides were excluded.

Windows trusted roots are not used by the reviewed implementation: it constructs an explicit root pool. The explicit CA requirement was retained without transport changes.

## Independently verified CA

The owner's downloaded `prod-ca-2021.crt` matched the authoritative HTTPS download byte-for-byte:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

The download template is independently traceable to Supabase's official repository at commit `d303c248d352308b0a233d2ba0d07cf1c31cb544`, `apps/studio/hooks/custom-content/custom-content.json`, key `ssl:certificate_url`; the Dashboard SSL configuration uses that template.

- PEM file SHA-256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
- DER certificate SHA-256 (different representation): `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.
- Certificate validity: 2021-04-28 through 2031-04-26.
- Reviewed executable SHA-256: `1700f196489a3268e7aa771efc72635c1d4f55a0e49c0142bb7f38b0d5b91597`.

## Actual runtime evidence and diagnostic boundary

The executable authenticated, bound a session backend, entered `BEGIN READ ONLY` and reached `identity()`. Its pgx configuration requires TLS >=1.2, the pinned explicit roots and hostname verification, with no plaintext fallback. Reaching the SQL identity check demonstrates that client-to-pooler TLS and authentication completed through that configuration. This is not proof of the pooler-to-database TLS hop or complete target identity acceptance.

The identity gate requires all four conditions: database `postgres`, current role `postgres`, session role `postgres`, and `pg_stat_ssl.ssl=true` for the current backend. At least one failed. The implementation returns a combined error before recording the identity row, so the saved evidence does **not** establish which condition failed. PostgreSQL major-version validation follows that gate and was not reached.

`pg_stat_ssl` observed through a pooler describes the database backend connection, not the client-to-pooler TLS connection. A backend-hop TLS mismatch is therefore a plausible hypothesis, **not a confirmed root cause**. No ad hoc follow-up query or second connection was made. The failure must not be relabeled as a certificate-chain failure or wrong project without evidence.

The deferred read-only ROLLBACK and connection-close paths did not replace the error with an unconfirmed-cleanup error. There were no application writes. The saved `completed_items=0` is the executor's item counter, not a SQL-query count or TAP total.

| Check | Actual result |
|---|---|
| Credential enrollment / internal read-back | PASS, exit 0 |
| CA authenticity, hash and private NTFS ACLs | PASS |
| Client-to-pooler verified TLS / credential authentication | Reached SQL identity gate |
| Combined database identity / backend SSL gate | FAIL, exit 1; failing field not retained |
| SQL PostgreSQL version | BLOCKED; management version recorded separately |
| Installed/available extensions and pgcrypto identity | BLOCKED |
| Role inheritance and restricted privileges | BLOCKED |
| Managed schemas, publication, cron prerequisites | BLOCKED |
| Application object/data emptiness and migration ledger | BLOCKED |
| Application migrations | 0 executed; 106 blocked |
| SQL suites / database TAP assertions | 0 executed; 89 blocked; 0 assertions |
| H1/H2/H3/M1 effective security | UNVERIFIED |

## Offline verification actually executed

- Node offline harness/artifact checks: **81 passed, 0 failed, 0 skipped**, exit 0.
- Go `go test -json ./...`: **46 top-level tests**, **68 subtests**, **105 leaf cases passed**, no failures/skips, exit 0. These are overlapping accounting levels, not additive totals.
- `go vet ./...`, `go mod verify`, Windows `go build -trimpath`, and `go version -m`: exit 0. Go 1.25.3, Windows amd64; pgx/v5 v5.7.6.
- Frozen hashes, artifact manifests and four managed vendor templates verified offline.

These are preparation/client tests, not database authorization tests. No Expo, Android, Docker or local database operation occurred.

## Remaining blockers and next step

Stop here. Recommend a separately reviewed **file-only** diagnostic improvement that records the allowlisted identity fields and identifies the failed predicate, with mocked regressions and an explicit distinction between verified frontend TLS and observed backend SSL. Do not remove the backend SSL gate or relax TLS to obtain a pass. Determine the supported pooler/backend security contract before proposing any gate change.

A further live read-only diagnostic or preflight requires **new explicit authorization**. This attempt is consumed. Migration deployment and fixture/concurrency execution require separate authorization after target identity, TLS, privileges, extensions, managed bootstrap, emptiness and ledger gates pass. No claim of production readiness or application security verification is made.

Step 4C remains BLOCKED against the existing local database; Android Step 2F remains DEFERRED. Primary-checkout Crew work and existing branches were preserved. This report branch changes documentation and sanitized evidence only; private runtime configuration, credentials and binaries are excluded.

Sanitized evidence: [directory](evidence/phase-11-5x/). The private attempt directory remains retained locally; the owner-created staging project and enrolled credential were not deleted or modified after enrollment.
