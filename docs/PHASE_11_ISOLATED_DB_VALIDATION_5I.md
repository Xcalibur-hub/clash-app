# Phase 11 Step 5I: Isolated database validation

**Result: FAIL - localhost-only startup binding check.** The one authorized startup attempt was stopped as soon as PostgreSQL was observed published on all interfaces. No application migrations, extension provisioning or SQL tests ran. Integrated database validation is BLOCKED, not passed. No automatic retry occurred or will occur.

## Preconditions and artifact

Fresh worktree: `C:/p11dbi`; branch `test/phase-11-isolated-db-validation-5i`. Frozen candidate `a92a550527f810913b01f6e6411dc78996c71a06`; PR #31 generator `8c0b4e9c7d49a330e7e549f91c48070b0d1dfd15`.

- Verified **245/245 frozen source hashes** (106 migrations, 89 SQL suites, 50 implementation artifacts), implementation tree and exact generator/test Git blobs.
- **27 offline tests passed**, 0 failed/skipped, exit 0.
- Generated and verified **106/106** compatibility artifacts against source, BOM-only and final hashes. Exactly three BOM removals and one migration 44 assertion replacement, affecting three files. Original migrations and frozen manifest unchanged.
- New project `clash_p11v5i_20261011`; dedicated configuration `.expo/attempt5i/stack/supabase/config.toml`. Ports **57620-57639** bind-checked free; intended API **57621**, database **57622**. Resource inventories confirmed project names absent before creation.
- Used explicitly authorized CLI development-only DB/Storage defaults exclusively in this disposable stack, a fresh random JWT secret and derived API keys. No hosted/production credentials or application data loaded.
- Child environment excluded inherited SUPABASE_, PG, DATABASE_, JWT_, GOTRUE_ and S3_ overrides; set SUPABASE_ENV=test and DO_NOT_TRACK=1. Startup ran inside the new unlinked stack directory, with no environment files there. Application migration directory was empty during managed bootstrap; seeds disabled.

## Loopback configuration and actual failure

CLI **2.40.7** omits HostIp in its [database port bindings](https://github.com/supabase/cli/blob/v2.40.7/internal/db/start/start.go) and [gateway bindings](https://github.com/supabase/cli/blob/v2.40.7/internal/start/start.go). [Docker documents a per-network default binding](https://docs.docker.com/engine/network/port-publishing/) using `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`. CLI supports `--network-id`, including its internal network endpoint ID selection. Docker server version was **28.3.3**.

Created ONE dedicated bridge network, `supabase_network_clash_p11v5i_20261011`, with that loopback option and project labels. Network inspection confirmed the option, IPv6 disabled, and unique ID `a9a68bbd72edcb45b42409af1ab4f21f3c972d782d00f7dc3760b19151411d17`. No daemon/global or pre-existing network setting was changed.

One startup command ran:

```text
supabase start --network-id supabase_network_clash_p11v5i_20261011 --workdir C:/p11dbi/.expo/attempt5i/stack --exclude studio,postgres-meta,edge-runtime,logflare,vector,supavisor,mailpit,imgproxy
```

During startup, actual `docker ps` output showed:

```text
supabase_db_clash_p11v5i_20261011 running 0.0.0.0:57622->5432/tcp, [::]:57622->5432/tcp
```

This violated the explicit localhost-only requirement. Only attempt-specific CLI startup processes were terminated; owned containers were stopped immediately. Bootstrap exited **4294967295** after termination, not success. Managed schema/role initialization had started; no manual database connection, application migration, extension provisioning or test transaction followed. The failure is a real observed all-interface publication despite the configured bridge option. Its underlying Docker/Windows forwarding cause is **not established**. No external reachability test occurred, so external access is neither verified nor ruled out. This transient broad binding is not described as a successful isolation check.

Retained stopped-container metadata confirms the intended network was selected and database/gateway HostIp fields were empty. The network retained its loopback option. No configuration repair, restart, alternate network, source patch or second startup was attempted.

## Actual images observed

| Component | Image tag | Captured image ID |
|---|---|---|
| Database | public.ecr.aws/supabase/postgres:17.6.1.002 | sha256:3f5e3b691d5887161e1b977302b66122eb6cfdf2a6358bdad493454efb75f8a6 |
| Auth | public.ecr.aws/supabase/gotrue:v2.179.0 | sha256:658cf69f57d48e10cbe508a79874e6067348b82a4d216a0bb446c067d7a246f9 |
| Realtime | public.ecr.aws/supabase/realtime:v2.47.0 | sha256:6b26b3679de63aec6b4849c02140d8f55b65ce2eecadcd5e5b712f596d0249a2 |
| Gateway | public.ecr.aws/supabase/kong:2.8.1 | sha256:1b53405d8680a09d6f44494b7990bf7da2ea43f84a258c59717d4539abf09f6d |

Storage v1.26.5 and REST v13.0.6 were expected pins, but their containers were not reached. Realtime was created but not running when captured. No managed-service health success or server SQL version check is claimed.

## Database results

| Area | Actual result |
|---|---|
| Application migrations | 0 attempted/applied; **106 blocked** |
| SQL suites | 0 executed; **89 blocked** |
| TAP assertions | **0 executed**; no passing/failing/skipped assertion claims |
| Concurrency suites | 0 executed; **9 blocked**, included in the 89 |
| pgcrypto 1.3 / extensions / supabase_admin check | Not executed |
| Migration identity and pg_read_file restrictions | Not queried |
| H1/H2/H3/M1, profile statistics Room gate, role contexts | BLOCKED |
| Effective grants, RLS, function ownership, Storage/Realtime/cron | BLOCKED |
| Settlement/rewards/notifications exactly once, fixture isolation | BLOCKED |
| Publication-error/extension-hook interaction | Not reproduced; earlier hypothesis remains unconfirmed |

The single infrastructure attempt is consumed. The compatibility artifact has not been validated against PostgreSQL by this checkpoint.

## Cleanup and preservation

After capturing sanitized metadata, removed **four stopped/created managed containers, two new volumes and one new network**, all verified against project labels, exact IDs/names, mounts and the preflight baseline. Any transient CLI bootstrap helper was no longer present at cleanup. Remaining resources for the project: **zero**.

Before/after inventory comparison confirmed all pre-existing container IDs/names/states/published ports, volume names and network IDs/names unchanged. Primary checkout still has the same unrelated modified and untracked Crew/development files. No existing local/hosted database connection, existing resource restart/removal, source migration/ledger change, privilege broadening, hook disabling, merge, deployment or Android action occurred.

Removed only this attempt's secret-bearing config and private bootstrap log at verified paths under its scratch directory. Sanitized startup logs, offline test TAP, source/artifact hash manifest, resource/network metadata, failure observation and exact cleanup commands/results are under [docs/evidence/phase-11-5i](evidence/phase-11-5i/validation-results.json). No credential is committed.

A future attempt needs separate authorization and a reviewed way to guarantee actual loopback binding on this Docker/CLI combination before database use. Do not rerun this attempt or infer permission to alter global Docker configuration. Step 4C remains BLOCKED against existing databases; Android Step 2F remains DEFERRED.
