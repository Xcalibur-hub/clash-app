# E3.2.6 — Validation blocker recovery

Date: 2026-10-22. Branch: `arena-ui-review`.
Starting HEAD: `9eee8e9d45fccb0b9fe5019386ae4bcf1058c14c` (expected E3.2 commit).
Read `.clinerules`, Section 38 of `CLASH_SPEC.md`, and the E3.2.5 report.

**Automated gate: PASS. Database validation: BLOCKED / NOT EXECUTED.
Deployment: NO-GO.** The harness is repaired; no PostgreSQL safety claim is made.

## 1. Root causes and evidence

### Arena lifecycle failures are independent of E3.2

Before editing, an in-memory source substitution loaded the harness and its
three tested components from pre-E3.2 commit
`58c031655a2ba717e371eb860a5fca208f8f449d`. No checkout/worktree was created.
All four files were also verified identical to their pre-E3.2 versions.

That baseline reproduced **0/10 passing, 10/10 failing**, exit 1:

- Entrance cases 1–4 and 8: unsupported `react-native-safe-area-context` import.
- Verdict cases 5–7: unsupported `../../utils/verdictPresentation` import.
- Crowd cases 9–10: unsupported `../../utils/duelStageMotion` import.

After admitting these imports, the complete dependency chain also needs
`challengePresentation` / `arenaChallengePayload` and `spectatorPresentation`.
The fixture's narrow import allowlist had not kept pace with product imports.
The product behavior was not the cause of these ten load-time failures.

The repair adds the existing render-smoke convention of zero safe-area insets
and loads the five named presentation helpers from their **actual production
source**, including the challenge helper's transitive dependency. Unrecognized
dependencies still throw. No lifecycle assertion, timer expectation, test body,
component, hook or Arena product behavior was changed. An explicit comparison
verified that the entire test-body section remains identical.

### Docker Desktop frontend is running without its backend

Read-only diagnostics established:

| Observation | Result |
|---|---|
| Installed Desktop / CLI | Docker Desktop `4.45.0.203075`; CLI `28.3.3` |
| Selected context | `desktop-linux`, endpoint `npipe:////./pipe/dockerDesktopLinuxEngine` |
| Desktop processes | Frontend processes and `com.docker.build` exist; `com.docker.backend` is absent |
| Engine connection | Named pipe does not exist, including with elevated read-only discovery |
| Frontend logs | Repeated `ENOENT` for `\\.\pipe\dockerBackendApiServer` |
| WSL | Version `2.6.1.0`, kernel `6.6.87.2-1`; registered `Ubuntu` and `docker-desktop` are both **Stopped**, version 2 |
| Host services | `WslService` and `vmcompute` Running; `com.docker.service` Manual/Stopped |
| Hypervisor | `HypervisorPresent=true` |
| Backend log history | Stop/proxy-close sequence around `03:38 UTC`, subsequent engine activity through approximately `03:39 UTC`; later frontend logs still cannot reach backend |

The immediate root cause is an unavailable Desktop backend/WSL engine, with a
still-running frontend. This is not a wrong Docker context, missing WSL distro
registration, or demonstrated client permission failure. The inspected crash
events/log excerpts do **not** establish what terminated the backend; a crash,
external termination or other exit must not be asserted as proven.

Do not infer a BIOS failure solely from CPU CIM flags: the host reports a loaded
hypervisor and the backend log shows earlier engine activity. Likewise, a stopped
privileged helper service is not sufficient evidence of a WSL-engine fault;
[Docker distinguishes WSL from helper-dependent operations](https://docs.docker.com/desktop/setup/install/windows-permission-requirements/).

## 2. Safe, specific Docker recovery instructions — not executed

**Keep the current restriction in force:** this task does not quit/relaunch
Desktop, start its backend/service/distro, or change container restart policies.
Existing container activity is visible in historical logs. Restarting an engine
can automatically start containers under their existing
[restart policies](https://docs.docker.com/engine/containers/start-containers-automatically/).
Their current policies cannot be inspected while the engine is unavailable.

1. If existing containers must remain completely untouched, provision a separate
   disposable VM/host/daemon for database validation. This is the safe path under
   the present boundary; repairing this shared daemon is an operator task.
2. Only during an operator-authorized maintenance window that permits automatic
   starts of existing containers: quit the orphaned Desktop UI using its tray
   menu and launch **Docker Desktop** once from Start. Do not reset/reinstall it,
   remove its data, force-kill WSL, or change its context. Docker documents
   [starting Desktop and selecting the WSL engine](https://docs.docker.com/desktop/features/wsl/).
   WSL is already installed above Docker's documented minimum, so a blind WSL
   reinstall/update is not supported by this diagnosis.
3. Check recovery using read-only commands:

   ```powershell
   Get-Process com.docker.backend -ErrorAction SilentlyContinue
   wsl.exe --list --verbose
   docker --context desktop-linux version
   ```

   Recovery requires a responding **Server** section, not just a CLI version or
   an open Desktop window. Do not proceed if the backend/engine pipe is absent.
4. If relaunch fails, inspect the new backend startup log and local Windows
   Application errors before selecting another remedy. Record the actual startup
   error. Do not upload diagnostics containing machine/project details without
   separate authorization.

Do not use factory reset, `wsl --unregister`, `wsl --shutdown`, Docker prune,
`docker compose down`, Supabase start/reset/stop, or volume deletion as recovery
shortcuts. No such operation was performed here.

## 3. Preserved SQL and execution boundary

The 101 authored assertions, the E3.2.5 evidence and its static checker remain
**byte-for-byte unchanged**. SHA-256 before and after the harness change:

| File | SHA-256 |
|---|---|
| `supabase/tests/097_meet_safety_and_lifecycle.sql` | `003F244769762A63285BB7DC437FDB568B69EE0DB7F8E3F10B5895CA32B88F86` |
| `docs/evidence/explore-e325/REPORT.md` | `787B3B976B21DF76F3CEF3331856F4B183885272FC358A8B1355EEFF92989F56` |
| `scripts/meet-safety-static-check.cjs` | `5DA43760D248A8DE5C437F3905D25CCE1AEE5F69F09B81C95665283C5BA4E836` |

These previously untracked validation assets are included unchanged in the local
recovery commit so their provenance is preserved. This does not change the old
report's historical FAIL/BLOCKED results into PASS results.

**pgTAP: NOT EXECUTED — 0/101 assertions executed.** The Docker engine remained
unavailable at the final read-only check. No isolated database became available.
No local/hosted database connection, migration replay, seed, reset, SQL write or
type generation against a live database occurred.

To execute later, first satisfy and record the full E3.2.5 isolation boundary:
fresh instance and private ephemeral storage; no shared credentials, existing
volumes or host data mounts; no exposed ports; no route to existing databases;
real Supabase schema bootstrap plus complete migration replay, without seed data
or active scheduled jobs; pgTAP/dblink installed; only the instance's own Unix
socket. Keep the existing database name guard `clash_e325_<unique suffix>` and
the explicit `test.e325_disposable=on` flag.

For a newly created container, inspect **that exact container only** before SQL:

```text
docker inspect <new-disposable-container> --format '{{.Name}} {{.HostConfig.NetworkMode}} {{json .HostConfig.Binds}} {{json .Mounts}} {{json .HostConfig.PortBindings}}'
```

Require network mode `none`, no host bind mounts or published ports, and only
new private/ephemeral database storage. Record container ID, image digest,
database name, role and schema versions. Copy inputs into this instance rather
than binding the user's workspace or mounting a Docker socket.

Then, **inside that verified disposable Linux instance only**, a TAP-aware runner
can execute the preserved suite (replace the name with the recorded database):

```sh
PGOPTIONS='-c test.e325_disposable=on' pg_prove --norc --verbose \
  --host /var/run/postgresql --username postgres \
  --dbname clash_e325_UNIQUE supabase/tests/097_meet_safety_and_lifecycle.sql
```

These are preparation instructions, not commands run in this task.
[pg_prove processes TAP failures and script errors](https://pgtap.org/pg_prove.html);
psql exit 0 alone is insufficient. Save complete output and require all 101
assertions, without skips or cancellation, before reporting PASS. dblink commits
namespaced concurrency fixtures; an aborted run requires destruction of only
that newly provisioned instance/private storage, never blanket cleanup.

## 4. Migration audit and type completeness — separate required changes

No migration or generated-type modification was made in this recovery task.

| Item | Static finding | Required follow-up |
|---|---|---|
| Session deletion | `meet_moderation_reads.session_id` has no FK; session deletion therefore has no direct audit cascade | Execute existing assertion in isolated PostgreSQL; do not claim retention implementation E3.7 is verified |
| Staff/profile deletion | `moderator_id` references `profiles(id) ON DELETE CASCADE` (`migration:966`) | Decide audit-retention policy before permitting staff hard deletion. Restrict/soft-delete staff profiles, or separately design a retained actor identity with nullable FK / SET NULL. Current audit rows can otherwise be erased; do not silently change this policy in a harness fix |
| Session lease types | `meet_sessions.expires_at` absent from generated Row/Insert/Update | Regenerate from the validated isolated schema |
| Heartbeat types | `meet_participants.last_heartbeat_at` absent | Include regenerated nullable heartbeat column |
| Audit table types | `meet_moderation_reads` absent | Include Row/Insert/Update/Relationships from schema introspection |
| Server functions | New maintenance/helpers such as `expire_stale_meet_sessions`, `meet_session_is_live`, `meet_session_under_review` are absent | Review regenerated public function surface while retaining revoked execution rights; never grant them merely to generate types |

The two client RPCs and `child_safety` enum were manually added previously, which
is why current TypeScript can pass despite schema/type drift. No claim is made
that the type file has been regenerated. Audit writes are transactional: an RPC
whose transaction rolls back does not durably record a read. The suite checks
that a successful read's audit row survives session deletion within its test
transaction. It does not prove separate-commit or crash durability; the outer
test transaction is rolled back.

## 5. Changed files and actual automated results

Recovery commit parent: `9eee8e9d45fccb0b9fe5019386ae4bcf1058c14c`.
Commit message: `test: recover Arena lifecycle harness and preserve Meet validation`.

| File | Change |
|---|---|
| `scripts/arena-correctness-lifecycle.test.cjs` | Safe-area bridge and exact allowlist for real presentation helpers; assertions unchanged |
| `supabase/tests/097_meet_safety_and_lifecycle.sql` | Track existing file unchanged; retain 101 assertions |
| `scripts/meet-safety-static-check.cjs` | Track existing checker unchanged |
| `docs/evidence/explore-e325/REPORT.md` | Track existing evidence unchanged |
| `docs/evidence/explore-e326/REPORT.md` | This root-cause/recovery report |

| Check | Actual result |
|---|---|
| Pre-E3.2 in-memory baseline reproduction | **FAIL as expected: 0/10**, identical fixture/product sources |
| Repaired lifecycle file | **PASS 10/10**, original assertions unchanged |
| Complete `npm test` — unit stage | **PASS 806/806**, 194 suites |
| Complete `npm test` — lifecycle/mounted stage | **PASS 109/109**, 0 cancelled; full command exit 0 |
| `tsc --noEmit --incremental false` | **PASS**, exit 0, no diagnostics |
| Meet subset | **PASS 51/51**, 15 suites |
| Duel subset | **PASS 29/29** |
| Render smoke | **PASS 22/22**; bridged native behavior, no device evidence |
| Static Meet SQL/security checker | **PASS 81 checks**; PostgreSQL syntax/semantics NOT VERIFIED |
| SQL/evidence hash and assertion preservation | **PASS**, three hashes above and count 101 |
| PostgreSQL runtime safety / pgTAP | **BLOCKED / NOT EXECUTED** |

Subset counts overlap the unit run. No product change or weakened assertion was
used to restore the gate. No new component/screen was added, so Metro/native
startup is unnecessary for this file-only change and was not performed.

## 6. Decision and remaining blockers

**GO for the validated local file-only recovery commit. Deployment: NO-GO.**

The automated gate blocker is closed. The database blocker is not: obtain a
verified separate disposable instance, replay the actual schema, execute all
101 assertions and record destruction. Resolve the audit-retention decision and
generated schema/type drift as separately scoped changes. Only database execution
can settle trigger/index ordering, concurrency, RLS and audit persistence.

Existing containers/volumes, Supabase databases and unrelated workspace files
were preserved. No push, merge, reset, stash, clean or branch creation occurred.
Stopped after the local commit and report; database verification is not claimed.
