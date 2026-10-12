# Phase 11 Step 5J: Docker localhost binding proposal

## Outcome

**Prepared, not runtime-validated.** No Supabase/Docker command, resource operation, SQL, credential change or database attempt occurred in this step. Source and retained Step 5I evidence were inspected offline; public upstream source/docs were read over HTTP. Primary Crew work and historical migrations remain untouched. Fresh worktree C:/p11bind, branch audit/phase-11-localhost-binding, based on PR #31.

## Confirmed versus unresolved

PR #33 / f107ae999a7cb9a6857e2550658ae790008a3715 records actual PostgreSQL publication on `0.0.0.0:57622` and `[::]:57622`. Its retained HostConfig requested an empty HostIp for database and gateway. The dedicated bridge's loopback option was present and the containers selected that network. Gateway all-interface reachability was not measured. The retained network snapshot was taken after containers stopped, so its empty Containers map does not prove the network was unused while running.

[CLI 2.40.7 database creation](https://github.com/supabase/cli/blob/v2.40.7/internal/db/start/start.go) supplies only HostPort. [Gateway creation](https://github.com/supabase/cli/blob/v2.40.7/internal/start/start.go) does the same. [Start flags](https://github.com/supabase/cli/blob/v2.40.7/cmd/start.go) provide exclusions and health-check controls; global network-id selects a network but does not set HostIp. [DB config](https://github.com/supabase/cli/blob/v2.40.7/pkg/config/db.go) and [API config](https://github.com/supabase/cli/blob/v2.40.7/pkg/config/api.go) use numeric uint16 ports with no bind-address field. An IP-prefixed port is not a supported TOML value. Health-check bypass is not a binding fix.

[Docker Desktop networking](https://docs.docker.com/desktop/features/networking/) describes separate host port forwarding by com.docker.backend on Windows, defaulting unspecified publication to all interfaces. The bridge setting is an Engine-network default, not an explicit host publication request. The confirmed proximate defect is **missing explicit HostIp plus ineffective network default on the observed stack**. Exactly why the Desktop/Engine path did not honor that default is unresolved: no packet capture, live listener snapshot or request trace was retained. Do not claim a particular API-version bug, firewall cause or Docker regression. CLI go.mod pins Docker SDK 28.4.0, while the reported server was 28.3.3; this difference alone is not proof of causality. The server version is not the Docker Desktop application version.

Binding inspection and reachability are separate evidence. Docker ps showed unsafe publication, sufficient to fail the policy, but no external peer tested access. HostConfig is the requested mapping; NetworkSettings.Ports is the Engine's actual mapping; Windows listeners/forwarding and peer connectivity are additional runtime checks. Firewall denial alone cannot establish localhost-only publication.

## Recommended minimal solution

Use a **separately reviewed disposable Compose configuration**, with explicit long-syntax `host_ip: 127.0.0.1` for both database and gateway at creation. [Compose ports](https://docs.docker.com/reference/compose-file/services/#ports) supports this directly; it translates to HostConfig.PortBindings HostIp. Retain the reviewed PG17.6 managed image and Auth/Storage/Realtime initialization requirements instead of substituting plain PostgreSQL. No CLI upgrade is required for binding when Compose owns creation, but CLI-managed startup must not subsequently recreate those containers.

The review-only fragment at `docs/proposals/phase-11-loopback.override.yaml` specifies DB 127.0.0.1:57722 -> 5432 and gateway 127.0.0.1:57721 -> 8000. These are proposed ports, NOT checked free in this step. `ports: !override` (Compose >=2.24.4) is intentional: [normal merges use IP as part of port uniqueness](https://docs.docker.com/reference/compose-file/merge/#replace-value), so adding a localhost entry may retain a broad original entry. The fragment is **not a complete launchable managed stack** and was not rendered by Compose. The complete base, initialization, image digests, roles, resource namespace, credentials, mounts and migration runner still need separate review before any startup authorization. All other services must have no published ports; the checker rejects accidental inherited Studio/REST/mail ports.

Do not apply this overlay to existing resources or the production app. Do not reuse CLI local mode against a Compose stack without verifying its identity discovery and bootstrap contract. A new execution wrapper must not silently initialize extensions, mark migrations or start containers during a preflight.

Alternatives:

| Option | Assessment |
|---|---|
| Same CLI plus bridge default | Already failed actual inspection; not recommended |
| CLI upgrade | Not certified as a fix. Even v2.120.0's Go DB helper still omits HostIp; the full new startup path was not audited or tested |
| Patched CLI / Docker API proxy | Adds custom build or interception complexity; not selected |
| No published DB port | Valid Compose alternative: remove all DB ports and use container-local psql/test execution. CLI 2.40.7 unconditionally publishes DB; db.port=0 is not a verified disable switch and may allocate a random host port. Existing dblink concurrency tests connect to 127.0.0.1:5432 INSIDE PostgreSQL, so do not inherently require a host DB port. Migration runner compatibility needs separate review |
| Global daemon/Desktop/firewall setting | Not permitted and not a substitute for explicit bindings |

## Fail-closed verification proposal

`scripts/loopback-binding-check.cjs` reads JSON only and never invokes Docker, Supabase, subprocesses or networking. Three independent modes:

```text
node scripts/loopback-binding-check.cjs compose resolved-compose.json clash_p11bind_review
node scripts/loopback-binding-check.cjs created created-inspect.json clash_p11bind_review
node scripts/loopback-binding-check.cjs running running-inspect.json clash_p11bind_review
```

These are file checks; inputs shown are future filenames, not newly captured runtime evidence. The compose mode requires the COMPLETE resolved Compose JSON, not this fragment alone. It verifies explicit loopback, exact target/published ports/protocol, both expected services, no other published service, no network_mode override and the expected project. Created/running modes require full Docker inspect-shaped arrays scoped by Compose project/service labels; reject missing/duplicate required services, PublishAllPorts and wildcard/empty HostIp. Running mode separately checks actual non-null NetworkSettings.Ports and running state. Exposed-but-unpublished ports (null bindings) are allowed. Extra/null/wrong actual publication for required services fails.

The checker is narrowly a binding policy, **not certification of full stack isolation, mounts, secrets, RLS, networking routes or managed bootstrap**. It does not establish Windows socket or peer reachability and always returns reachability_verified=false. A no-published-DB variant would require a separately reviewed explicit policy update; this checker currently requires two loopback mappings.

For a future separately authorized run: review full resolved model and free resource names/ports; create WITHOUT starting and verify HostConfig before any listener can open; refuse start on mismatch. After starting, verify actual mappings and Windows listening addresses (including IPv6) before any SQL/migration connection. Stop owned resources on mismatch. Confirm positive loopback connectivity and negative non-loopback/peer connectivity with an approved empty probe before database validation; do not infer isolation from blocked firewall traffic. None of these infrastructure/runtime steps ran here.

## Actual offline results

`node --test scripts/loopback-binding-check.test.cjs`: **15 passed, 0 failed, 0 skipped**, exit 0. Coverage includes empty/missing/wildcard/IPv6/LAN addresses, merged extra bindings, wrong project/port, missing/duplicate services, host networking, publish-all, stopped/missing actual mappings, and safe exposed-only ports. Inputs are synthetic JSON fixtures, not physical networking verification. YAML rendering, Docker API creation, Windows listeners, reachability and Supabase compatibility remain unverified. No application code changed; app/database test suites were not run.

Next prerequisite is review of the complete disposable managed Compose base and execution/inspection procedure. No new database attempt, merge, deployment or Android action is authorized. Step 4C remains BLOCKED against existing databases; Step 2F remains DEFERRED.
