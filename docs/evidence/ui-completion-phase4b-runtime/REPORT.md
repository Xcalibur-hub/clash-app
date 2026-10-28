# Phase 4B — isolated QA APIs and authenticated workflows

**PASS: Auth, REST, Storage and localhost routing. PASS: basic authenticated Realtime Broadcast and reconnect. PARTIAL: private-channel runtime/error handling. CONDITIONAL GO for separately authorized device integration; no native or production acceptance.**

Branch: `arena-ui-review`. Unchanged HEAD: `9bad8b0b51ffd1bab5975ceb72f7c75a487d798f`. Original checkout only. Final verification: 2026-10-26T13:56:47.851Z.

## Running QA endpoints

Project: `clash-ui-qa-phase4a`. App-compatible gateway: **http://127.0.0.1:55481**. It forwards Auth, REST, Storage and Realtime WebSockets to fixed QA-only localhost targets. API keys are checked; the gateway never injects a service-role token, logs requests, or dynamically selects upstream hosts. Credentials remain in the existing private QA configuration, never this report. This is a local QA reverse proxy, not a production gateway implementation.

| Endpoint | Actual acceptance |
|---|---|
| 127.0.0.1:55481/auth/v1 | Auth signup, password login, identity, refresh; final health HTTP 200 |
| 127.0.0.1:55481/rest/v1 | Real anon/authenticated/service-role data requests and access boundaries |
| 127.0.0.1:55481/storage/v1 | Bucket discovery, PNG uploads/downloads, permission failures and cleanup |
| 127.0.0.1:55481/realtime/v1/websocket | Actual authenticated subscriptions, Broadcast receipt and reconnect |
| 127.0.0.1:55482 | Existing durable PostgreSQL 17.11; same system identifier |
| 127.0.0.1:55483 / 55484 / 55485 / 55486 | REST / Auth / Realtime / Storage; final service checks HTTP 200 |

All six Windows listeners and effective Docker publications are **IPv4 127.0.0.1 only**. No wildcard or IPv6 publication. [Final identities, bindings, ledgers and checks](verification.json), [gateway](gateway.json).

## Runtime configuration corrections

The three old API containers were recreated within this QA project; the healthy database, completed managed init containers and original named volumes were not recreated. Final full IDs and mount/network records are in verification.json.

| Service | Version | Final container ID |
|---|---|---|
| PostgreSQL | 17.11.0.004 | 78bb03b124cf722628d2a57a5261bdaebaff604744ee26c38e0bd8d55a1bfcc3 |
| Auth | v2.197.0 | 456ca046e5b681b2e8dca66859517c3b642efa6822246207d8369bc4a118d360 |
| REST | v16.4 | 6c2209e87c11824d85a0e655ba2eff831e5e83c40604255e9023408d464f5f5b |
| Storage | v1.79.36 | 0b4aba6ac316bf7a539902be4992a34d2a034c1972c766f2ba468f4b400bfb48 |
| Realtime | v2.140.10 | 5c0b583b24e6da95dfb4301b1dd2353380f1013e10829e2a6bcf8c7b4d8e28b9 |

Every image was locally verified against its frozen SHA-256 pin; complete image IDs are recorded, not inferred from tags. Auth/REST/Storage stopped configurations were inspected before launch. Realtime was separately created/inspected with a read-only root, UID:GID 100:101, no added capabilities, no foreign mounts and explicit localhost publication.

Two confirmed runtime defects were corrected only in ignored QA tooling/configuration:

1. Docker resolved `db` to the publication-network IP, where inter-container communication is deliberately disabled. A bounded TCP probe from Auth succeeded on backend 172.26.0.2 and failed on publication 172.28.0.2. The QA override pins `db` to its verified internal address using extra_hosts. Storage uses REST's distinct backend alias `qa-rest-internal`. No network security setting or database permission was weakened.
2. Auth's default JWT group was unset, producing an empty role and REST's real `22023: role "" does not exist` rejection. The QA override supplies `GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated`, matching the successful E3.5.7 contract. Email signup/autoconfirm is explicitly enabled for fictional local testing; email delivery, OAuth and production Auth policy were not tested.

Existing runtime starts and configuration failures remain documented in [runtime-starts](runtime-starts.json), [Auth correction](auth-role-correction.json), [initial workflow](workflow-initial.json), [role failure](workflow-role-failure.json), and [final workflow](workflow-results.json).

The first create command used an unsupported Compose `--no-deps` option and made no resource changes. Its replacement uses a stdin-only runtime model omitting DB/init services and referencing existing QA networks/Storage volume. A pre-start assertion was also corrected because unstarted Docker network IDs are empty; actual attached IDs were verified after starts. Neither issue justified starting an uninspected container.

## Executed authenticated and Storage checks

**36/36 final API workflow assertions passed**, command `node .expo/phase4a-local-tools/runtime4b-workflows.cjs`, exit 0. These executed the installed Supabase SDK against real QA APIs, using a direct Windows HTTP fetch adapter; no mocked backend or native execution is implied.

- Three fictional A/B/C accounts: signup with real Auth sessions, password login, identity and profile RPC; incorrect password denied; refresh succeeded.
- Service-role reads found exactly these three profiles. Anon public-profile reading succeeded. A could update its own profile; B and anon could not update A. A remained unchanged after the denied attempts.
- Anon and authenticated direct Meet-message reads were refused by the existing RPC-only table contract, rather than treated as empty results.
- Service-role bucket discovery found both existing buckets. Ordinary authenticated bucket listing succeeded with **zero visible buckets** under current policies; the client must use its established bucket contracts, not infer that buckets are missing.
- A uploaded a nonpersonal one-pixel PNG to its own namespace in each existing public/private bucket. Both owner retrievals matched the uploaded bytes exactly.
- Private download by B/anon, B upload into A's namespace and anon upload were refused. B could not remove A's object. Anonymous retrieval from the public bucket succeeded as intended.
- Authorized owner deletion and final object/file counts verified cleanup. No buckets, RLS policies or grants were created/changed for tests.

An early QA HTTP adapter omitted Content-Length on DELETE requests. This invalidated its initial deletion/negative-deletion observations, including an Auth empty-JSON response. The adapter was corrected and **the full workflow rerun**; earlier results are retained in [pre-fix run](workflow-before-delete-transport-fix.json). This was a QA transport defect, not evidence of an application SDK or server security defect.

The phase created ten fictional accounts across the diagnosed probes, final API run and WebSocket run. All accounts, sessions, profiles and uploaded objects were removed using exact IDs/names and verified QA ownership. Auth deletion intentionally sets profile ownership null, so those specific orphan profiles were separately deleted after audit attribution. No broad prefix deletion or unrelated cleanup occurred. Fictional Auth audit history and the managed Realtime runtime tenant remain as expected operational records. [Initial probe cleanup](initial-probe-cleanup.json), [transport-probe cleanup](transport-probe-cleanup.json), [final API cleanup](artifact-cleanup.json), [WebSocket cleanup](websocket-cleanup.json).

## Realtime: actual results and limits

The pinned vendor source is v2.140.10, commit `6b03e7efeb0e0c841ab2d9e528ff71a8f8e912fe`. The restricted one-shot partition job invoked **Realtime.Tenants.create_messages_partitions/1**, using the accepted Unix socket and existing managed role. No handwritten partition DDL or replacement send function was used. All five vendor date partitions, including the current UTC date, were verified with expected bounds/owner. [Partition result](partition-job-result.json).

The vendor initializer can return :ok despite internally logged failures, so success required both the job marker and catalog assertions. The job exited 0. Its first host postcheck had a transient psql exit 2; a subsequent read-only diagnostic succeeded. The connection failure's exact cause was not established. The job was **not rerun**, and subsequent identity/ledger/API checks passed.

The separate QA runtime used the proven vendor `Realtime.Release.migrate()` and `Realtime.Release.seeds(Realtime.Repo)` central bootstrap. These initialize the managed _realtime runtime control plane, not CLASH application migrations; the 111 application and 88 managed tenant versions remained exact. Vendor Janitor is disabled for this bounded QA run. Partitions cover only the vendor-generated date window; readiness must be checked again on later test dates.

| Realtime check | Result |
|---|---|
| Real Auth sessions for two fictional clients | PASS |
| Two authenticated public-channel subscriptions | PASS |
| A-to-B actual Broadcast receipt | PASS, exactly one matching receipt |
| Reconnect then subsequent receipt | PASS, total matching receipts two |
| Unauthorized private Arena topic | PASS server-side rejection; SDK state TIMED_OUT |
| Anonymous private Meet topic | PASS server-side rejection; SDK state TIMED_OUT |
| Successful canonical Room/Meet private subscription and delivery | BLOCKED / NOT EXECUTED: no authorized canonical Room/Meet fixtures created |
| Clean client-side authorization-error classification/disposal | NOT ACCEPTED: SDK reported timeout and retained retry timers |

[Actual WebSocket observations](websocket-results.json), [explicit server Unauthorized evidence](private-join-denial-evidence.json). A timeout alone was not accepted as proof of authorization denial: the server log was independently matched to the exact fictional test topics. No private content was observed or forged.

The WebSocket script recorded six assertions and completed artifact cleanup but did not exit naturally because SDK retry timers remained. Its exact task-owned Node PID 30652 was verified and stopped, yielding process exit 1. **This is not a clean exit-0 WebSocket-suite pass.** No Metro, gateway or service process was killed. The runtime also logged an OTP trusted-CA loading warning with fallback authorities; outbound/TLS behavior was not tested and is not accepted on this evidence.

## Preservation and remaining device gates

Final system identifier **7700622043081482277**, same postmaster start **2026-10-26T12:37:54.605865+00:00**, original durable volumes and both accepted backup volumes preserved. Storage/Auth/Realtime ledgers **74/82/88** match exact approved contents. Application **111** versions, names and every parsed-statement hash match Phase 4A.7. All 111 source/copy hashes remain frozen.

Cron launch remains **off**; run history zero. The maintenance job row remains defined/active but cannot launch under the global setting. Final users, auth sessions, profiles, Takes, Clashes, Rooms, Meet sessions/messages, Realtime messages and Storage objects/files are zero. No canonical workflow fixture or unexpected public activity was created.

Protected **21 containers, 3 networks and 4 volumes** retain IDs/images/mounts/membership/volume metadata. Only the pre-existing shared Vector restart loop advanced independently; it was not controlled. All **1885** pre-existing untracked file hashes remain unchanged. Tracked/staged tree remains clean at the expected HEAD. Only QA-local ignored configuration/tooling and this phase's sanitized evidence/report were added. No reviewed base Compose, frozen application SQL or application source was edited.

The app SDK expects one base URL plus an anon JWT, with /auth/v1, /rest/v1, /storage/v1 and /realtime/v1 paths. **Do not launch using dotenv defaults:** read-only inspection found .env points at a hosted project and .env.local at shared 55321, with neither key matching this QA stack. Neither target was contacted. Existing Metro/phone runtime routing was not revalidated or changed here, so these files are not proof of the currently executing phone bundle's destination.

Next device integration needs separately authorized, explicitly isolated Metro public configuration (QA gateway 55481 plus its matching anon key), fresh-bundle verification, scoped USB routing and secure fictional-account entry. All test logins were cleaned up; none was installed on the phone. Canonical Arena, private assists, Meet matching/typing, media processing/playback, Edge Functions and complete application RLS remain unverified by this representative API run. Private WebSocket error/disposal behavior needs a focused follow-up before claiming runtime acceptance.

No TypeScript/full unit/pgTAP rerun was required or claimed: application code and SQL did not change. Executed acceptance comprises the real API workflow, actual WebSocket observations, vendor partition/central bootstrap and final preservation checks. `git diff --check` passed. Sanitized evidence was scanned for the exact private QA credential values/JWT patterns; no values were written to the report.

Version-specific references reviewed: [Auth v2.197.0 configuration](https://github.com/supabase/auth/blob/v2.197.0/README.md), [Realtime pinned partition initializer](https://github.com/supabase/realtime/blob/6b03e7efeb0e0c841ab2d9e528ff71a8f8e912fe/lib/realtime/tenants.ex), and [Realtime pinned release bootstrap](https://github.com/supabase/realtime/blob/6b03e7efeb0e0c841ab2d9e528ff71a8f8e912fe/lib/realtime/release.ex). The Supabase changelog markdown fetch failed with unsupported content type; runtime decisions used pinned source and actual installed-service results.

**STOP after Phase 4B. APIs remain running for the next authorized QA step. No Samsung/Metro repointing, shared/hosted/E3.5.7 operation, commit, push, merge or deployment occurred.**
