# Phase 11 Step 6A: Supavisor backend TLS resolution

## Recommendation

Use the reviewed executor's **existing direct mode from an approved IPv6-capable operator/network**, preferably the same Windows owner account on an approved IPv6-capable connection. This preserves the existing Windows credential in place, removes the second TLS boundary and avoids a paid IPv4 add-on. Do not relax `backend_ssl_required`. This is a proposed route, **not a completed resolution or authorization to connect**.

Baseline: PR #50, `6ce87015a6d23e5c1f5547dfe9faed3100fa97f4`. Investigation is documentation-only in isolated `C:/p11tls`. No database/SQL, credential access, settings changes, project management calls, Docker or runtime retry occurred.

## Confirmed evidence and source versions

Step 5Z's preserved evidence reports database/current role/session role matches true, PostgreSQL-17 match true, **backend SSL false**, exit 1 `backend_ssl_required`. Client-to-pooler verification succeeded under the explicit CA/hostname-verifying pgx configuration; this is distinct from the backend connection. Nothing in this investigation changes or repeats that observation.

Official Supavisor source reviewed on 2026-10-12:

- Release **v2.9.13**, commit **5a51fbfadaa6d6286c1fee0a95d4c629e81a2750**, release published 2026-09-10.
- Main commit **5df5caf10694bb68ddd3eca14ac005832de40427**, dated 2026-10-08. **Neither is proven to be deployed on the Tokyo shared endpoint.**

The [pinned tenant configuration documentation](https://github.com/supabase/supavisor/blob/5df5caf10694bb68ddd3eca14ac005832de40427/docs/configuration/tenants.md) separates `upstream_ssl`, `upstream_verify` and `upstream_tls_ca` from incoming `enforce_ssl`. The [v2.9.13 tenant schema](https://github.com/supabase/supavisor/blob/5a51fbfadaa6d6286c1fee0a95d4c629e81a2750/lib/supavisor/tenants/tenant.ex#L22) defaults upstream SSL to false; this is a software default, **not evidence of this project's actual tenant configuration**.

The [v2.9.13 database handler](https://github.com/supabase/supavisor/blob/5a51fbfadaa6d6286c1fee0a95d4c629e81a2750/lib/supavisor/db_handler.ex#L672) sends the PostgreSQL SSL request only when upstream SSL is true; the other branch retains the TCP socket. An upstream server refusing requested TLS returns an error. Its TLS branch offers peer certificate verification with the tenant CA or no verification. Importantly, peer mode installs a hostname-match callback that always returns true: it must **not** be described as equivalent to strict hostname verification. The inspected main handler retains that behavior. This is a source-level limitation, not a new claim about deployed hosted security.

The [release client handler](https://github.com/supabase/supavisor/blob/5a51fbfadaa6d6286c1fee0a95d4c629e81a2750/lib/supavisor/client_handler.ex#L1013) obtains upstream TLS from tenant configuration in the ordinary path; the JIT tenant path derives it from effective client TLS. Connection parameters carry the CA and verify mode separately. Session mode retains its checked-out backend. Hosted tenant/JIT status is unknown; no client flag or JIT/role change is proposed as a workaround.

## What hosted controls establish

[Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement) documents incoming SSL enforcement and says changing it causes a database reboot. The [public SSL-management API](https://supabase.com/docs/reference/api/v1-update-ssl-enforcement-config) describes a database enforcement configuration, not explicit upstream verification/CA controls. The [pooler configuration API](https://supabase.com/docs/reference/api/v1-update-pooler-config) exposes pool size and pool mode, not the upstream TLS fields.

**No supported customer-facing control guaranteeing shared-pooler upstream TLS and strict certificate/hostname verification was established from the reviewed public contract.** This does not prove Supabase lacks internal/operator controls. It does mean toggling project SSL enforcement is not an evidence-backed fix here. It might reject plaintext connections or affect provider-managed behavior; whether it enables upstream TLS requires provider confirmation. We did not read current enforcement settings or change them.

Supabase's [security statement](https://supabase.com/security) describes encryption and managed infrastructure security generally. That statement does not identify the deployed pooler tenant settings, network topology or a project-specific exception. Private/internal network isolation, access controls or a separately encrypted transport are different assurances from PostgreSQL TLS. They cannot satisfy this executor's explicit backend SSL requirement by inference. Step 5Z shows PostgreSQL TLS false for that observed backend; it does not establish that every underlying transport layer is unencrypted.

A community discussion on this topic was inspected but is **not provider confirmation** and is not used to establish a hosted guarantee. No message or support ticket was sent.

## Alternatives

| Path | Security and 106-migration compatibility | Cost / effort / status |
|---|---|---|
| **Direct PostgreSQL over existing approved IPv6** | Single CA/hostname-verified TLS channel; backend SSL describes that same connection. Native sessions support migration transactions/locks. All 106 artifacts remain unchanged; extension/owner/ledger compatibility still requires preflight and later validation. | No Supabase IPv4 add-on; low effort if owner Windows has an approved IPv6 route. Preferred, not network-tested. |
| Supabase-supported upstream TLS correction | Must establish hosted upstream encryption, verification and existing gate success; session semantics remain suitable in principle. | Cost/support availability and operational impact unknown. Requires written supported procedure and separate mutation approval if needed; no undocumented tenant edits. |
| Approved alternate IPv6-capable operator | Same direct TLS properties; no migration rewrite. | Operator/host trust and protected credential provisioning require separate review. Windows credentials cannot be exported under current restrictions; non-Windows native store is unsupported. Do not assume a free CI runner supplies IPv6 or safe secrets. |
| Paid direct IPv4 add-on | Direct verified TLS avoids shared-pooler upstream dependence; native session semantics. | Recurring paid service and endpoint change; excluded by this task. Not enabled. |
| Transaction/dedicated pooler or blanket internal-network exception | Does not establish backend SSL; transaction pooling adds session limitations. | Not a supported resolution to the current gate. No mode switch or exception proposed. |

Supabase [connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) recommends direct connections for migrations and documents IPv6 direct access versus shared IPv4 session pooling. [IPv4 add-on documentation](https://supabase.com/docs/guides/platform/ipv4-address) describes the paid alternative. Prices were not relied upon; no purchase or new infrastructure was initiated.

## Approval boundary and remaining risks

Next preferred operation requires **new authorization for an exact direct endpoint and one read-only preflight**, not an SSL-setting change. First the owner must approve an IPv6-capable operator/network and confirm the Dashboard direct endpoint/port/database/username. The previously authorized pooler endpoint must not silently be replaced. The existing executor derives `db.<approved-ref>.supabase.co:5432`, username `postgres`, in direct mode and checks the pinned CA/hostname; its nonsecret configuration must be reviewed explicitly with empty pooler_host and a fresh private single-use evidence directory.

If the same Windows owner can use an already approved IPv6 route, retain the existing native credential without export/reset/re-enrollment. No network reconfiguration is authorized here. If another host is needed, stop for a separately reviewed secret-store/operator plan; do not move the credential or put passwords in URLs, files, CI variables or logs as an implied step.

The future one-shot preflight must preserve all identity/TLS/PID/read-only checks and stop on failure. Even if it passes, deployment of 106 migrations and execution of 89 suites require separate authorization. Remaining blockers include actual IPv6 reachability, certificate suitability on the approved direct host, exact SQL version, extensions and owners, privileges, managed bootstrap, ledger and empty-project checks. All remain unverified. Application security has not passed.

If IPv6 operation is unavailable, ask the owner to obtain written Supabase clarification of the exact hosted endpoint's upstream TLS/verification contract, whether incoming SSL enforcement changes upstream behavior, and any supported remedy/reboot impact. No support contact or provider mutation is authorized or performed by this report.

## File-only verification

- All **245 frozen source hashes**, **106 generated compatibility artifacts**, both unchanged manifest hashes and **four vendor template hashes** verified offline.
- Five static assertions confirmed the retained CA/hostname configuration, no fallback, correct backend PID predicate and both false/unknown SSL refusal codes.
- Executor, scripts, SQL migrations/tests and package files unchanged against the baseline. Primary git status and all six dirty tracked-file hashes matched the preservation baseline.
- No code changed; Node/Go regressions were not rerun. Step 5Z's 81 Node / 123 Go leaf passes are **prior evidence**, not new results.
- Public source provenance is recorded in [source-review.json](evidence/phase-11-6a/source-review.json). The downloaded source is inspection-only scratch data, not a vendored deployment or proof of hosted version.

Step 4C remains BLOCKED, Android Step 2F DEFERRED. Stop after the documentation-only draft PR; no merge, paid service, TLS exception or live action is authorized.
