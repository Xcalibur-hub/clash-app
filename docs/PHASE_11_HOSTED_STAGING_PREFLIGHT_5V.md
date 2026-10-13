# Phase 11 Step 5V: Hosted staging creation and read-only preflight

12 October 2026. **BLOCKED before project creation.** No database connection or read-only preflight was attempted. Application security is not verified. This branch contains documentation and sanitized offline evidence only, stacked against PR #45.

## Actual outcome

| Required answer | Result |
|---|---|
| Was CLASH staging actually created? | **NO.** Zero creation calls; no resources or hosted credentials generated. |
| Were project identity, plan and region verified? | **NOT EXECUTED for a new project.** The existing organization and its Free plan were verified; a new project was quoted at $0/month. Mumbai is publicly listed, but target allocation/capacity was not verified. |
| Did the read-only preflight pass? | **NOT EXECUTED.** Zero database connections, SQL statements, migrations or SQL suites. |
| Is the frozen candidate eligible for a separately authorized migration deployment? | **NO / BLOCKED.** Connectivity, approved credential handling and target-specific prerequisites remain unresolved. |

## Organization and authorized target

The authenticated Supabase connector returned one organization: **Xcalibur-hub-2's Org**, identifier **dninpemahklihtxcjrnz**, plan `free` / `tier_free`. The new-project cost quote was **$0/month**. Listing showed one pre-existing inactive project and no `clash-staging`; the existing database was never accessed. A quote does not establish final quota eligibility or region capacity. The intended new name remains `clash-staging`, region `ap-south-1`, Free only. There is no new project reference, hostname, region allocation or provisioning result to report. No charge or paid add-on was requested.

Only management metadata calls ran: `list_organizations`, `get_organization`, `get_cost(type=project)` and `list_projects`. No creation, linking, key retrieval or deletion call ran.

## Stop condition and remaining prerequisites

1. **Direct endpoint network prerequisite is blocked.** Read-only Windows interface/routing inspection found **zero global IPv6 addresses and zero IPv6 default routes**. No network settings changed and no database endpoint was probed. The reviewed executor accepts only `db.<project-ref>.supabase.co:5432`; Supabase documents direct connections as IPv6 by default, with paid IPv4 as an alternative. The shared session pooler supports IPv4 but is outside this executor's accepted target contract. We stopped before creation under Phase A's instruction to stop when required configuration cannot safely be supplied. This is local configuration evidence, not a measured TLS failure against a new project. [Direct connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [IPv4 add-on](https://supabase.com/docs/guides/platform/ipv4-address).
2. **Private credential handling is unconfirmed.** The user was asked to name an approved private credential store, without sharing secrets. No store was approved during this execution. The exposed `create_project` interface accepts name, organization, region and cost confirmation, but no password/private-store handoff parameter. Public MCP source generates a password when none is supplied; that source is not proof of the deployed connector's return behavior or safe retrievability. A supported, reviewed way to supply/store the fresh database password must be established before creation; no password reset is authorized. [Public platform implementation](https://github.com/supabase/mcp/blob/main/packages/mcp-server-supabase/src/platform/api-platform.ts).
3. **Mumbai allocation and final Free eligibility remain unverified.** `ap-south-1` appears in public documentation and the tool's region enum. These do not prove current organization-specific capacity. No alternate region or plan was chosen. [Regions](https://supabase.com/docs/guides/platform/regions).
4. **Full requested preflight coverage needs review before execution.** The existing executor checks database/role/session SSL identity, installed pgcrypto/PostGIS/pg_cron/pgTAP, selected managed schemas/publication, selected restricted privileges, absence of `public.profiles`, and an absent/empty application ledger. It does not fully inventory available extension versions including dblink, detailed role inheritance, all unexpected application objects or existing user data, or persist detailed inventory rows in its outcome summary. These are offline coverage gaps, not observed vulnerabilities on a target. Do not claim all twelve Phase C checks would be covered unchanged.
5. **Hosted managed-version compatibility remains unknown.** The artifact requires pgcrypto 1.3 in `extensions`, owned by `supabase_admin`. Supabase's September 2026 announcement describes a managed PostgreSQL 17.11 rollout, whereas prior local evidence used 17.6. That announcement does not establish any future project's actual server/extension version. No target capabilities, grants, ownership, cron, Storage or Realtime settings have been inspected. [Managed PostgreSQL changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).

## Frozen provenance and offline verification

Fresh isolated worktree `C:/p11stagev`, branch `validate/phase-11-hosted-staging-5v`, starts at approved PR #45 commit **4b2aa0638cb3ee0d1866705bbe7f788aff54462d**. Frozen implementation: **9c71d72a15095047821789386ca9d395961bab4f**; seal: **a92a550527f810913b01f6e6411dc78996c71a06**. Historical migrations, frozen manifests, executor implementation and dependency locks are unchanged.

| Check actually run | Result |
|---|---|
| `node tools/hosted-staging/prepare.cjs` | PASS, exit 0; all 245 frozen Git-blob source hashes; 106 artifacts; 89 source SQL suites and ten dblink adapters bundled without execution |
| Managed vendor template check / full artifact verification | PASS; four vendor templates checked; 245 / 106 / 89 counts verified |
| Eight reviewed Node offline test files | PASS, exit 0; **81 tests, 81 passes, 0 failures, 0 skips** |
| `go mod verify` | PASS, exit 0; all modules verified |
| `go test -json ./...` in `tools/hosted-staging` | PASS, exit 0; **28 top-level tests, 23 subtests, 47 leaf cases**, no failures |
| `go vet ./...` | PASS, exit 0 |
| `go build -trimpath -o ../../.expo/hosted-staging-5v.exe .` | PASS, exit 0; binary built but never executed |
| `go version -m` build inspection | Go 1.25.3 windows/amd64, CGO disabled; pgx/v5 5.7.6; old pgconn 1.14.3. pgx/v4 4.18.3 is a test dependency, not linked into this binary |
| Primary checkout preservation | PASS; status and six tracked dirty Crew/development file hashes match the pre-existing baseline |

Artifact manifest SHA-256: `8f50541d3eed55bd905117a217bc8118a6b5483d1ffec2e5d0477b2be71b8c8a`.
Suite bundle manifest SHA-256: `12cac2a2b0119cb99110061800e14ea167f0928919da4bbd4e464dc0fbead7fe`.

Node command executed:

```text
node --test tools/isolated-supabase/offline.test.cjs tools/isolated-supabase/client-auth.test.cjs tools/isolated-supabase/client-environment.test.cjs tools/isolated-supabase/bootstrap-cli.test.cjs scripts/migration-compatibility-artifact.test.cjs scripts/loopback-binding-check.test.cjs scripts/migration-encoding-check.test.cjs scripts/extension-hook-preflight.test.cjs
```

These tests mock Docker/PostgreSQL subprocesses. No real Docker or SQL operation occurred. Mock fixtures and generated artifact/build outputs remain ignored scratch, not hosted secrets. [Node TAP](evidence/phase11-5v/node-tests.tap), [Go events](evidence/phase11-5v/go-tests.jsonl), [sanitized network inventory](evidence/phase11-5v/network.json), [machine-readable summary and build hash](evidence/phase11-5v/summary.json). Evidence copies were transcoded from PowerShell UTF-16 to UTF-8 with trailing line whitespace removed; test sources and assertions were not modified.

## TLS and operator method

The proposed operator is this Windows host using the authenticated Supabase project-management connector and the separate reviewed hosted Go executor. Source inspection confirms TLS minimum 1.2, hostname verification, an explicit trusted CA pool, no insecure verification flag, no fallback connection configurations, direct-host/port restrictions and a password supplied through `CLASH_STAGING_PASSWORD` rather than command arguments or URL credentials. The inherited backend credential rejection remains intact. **Actual certificate-chain verification is NOT EXECUTED**: there is no new target identity, target certificate bundle or database connection. Offline parser and mocked connection tests do not establish remote TLS success.

## Next action and safety status

Before any creation/preflight, resolve an IPv6-capable operator path, approve a private store and supported credential-supply method, review the missing read-only inventory coverage, and confirm Mumbai/Free availability. An IPv4 session-pooler executor would require separate implementation/review and exact identity/TLS safeguards; it was not substituted here. Paid IPv4 is outside approval. No database attempt was consumed; no automatic retry or alternate target is scheduled. Obtain explicit continuation authorization after prerequisites are resolved.

No existing local/hosted database, Docker resource, Android app, migration ledger, policy, grant, owner, production setting or environment file was changed. No application deployment or SQL suite execution occurred. Step 4C remains **BLOCKED** against the existing local database; Android Step 2F remains **DEFERRED**. No application-security pass or production-readiness claim is made.
