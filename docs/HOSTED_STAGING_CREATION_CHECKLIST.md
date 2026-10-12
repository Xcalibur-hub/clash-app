# First hosted staging creation checklist

Preparation only. See [Step 5U](PHASE_11_HOSTED_EXECUTOR_PREPARATION_5U.md) and [Step 5T](PHASE_11_HOSTED_STAGING_READINESS_5T.md). No project creation, credential generation or connection is authorized by these documents.

## Decisions requiring the owner

1. Which Supabase organization owns the new, disposable-to-start **CLASH staging** project, and which person owns billing/security recovery?
2. Which region meets tester latency/data-location needs, and what monthly budget/plan limit is approved? The reviewed executor uses the direct database endpoint; use an IPv6-capable operator network before considering a paid IPv4 option.
3. Who is the named deployment operator/security reviewer, and which private secret store/access window is approved? Give agents task-scoped staging access only; no production keys or credentials in chat/GitHub.
4. Approve creating **one new project** and **one read-only preflight** against its exact Dashboard-confirmed reference, with stop-on-first-failure and no repair. This is distinct from later migration/extension/fixture authorization.

## Engineering prerequisites ? no extra product decisions needed now

- Reverify frozen seal/hashes, reviewed artifact and offline tests; build the pinned separate executor. Confirm the new project has no real users, data, external app origin or production redirect.
- Record project/region/owner and approved CA fingerprint outside Git; secret password stays in the approved secret store. Verify private Windows ACLs. No linked-project defaults or inherited backend credentials.
- The first probe must use verified TLS and the exact direct hostname/role/database. Missing connectivity, certificate, managed identity or required capability stops the attempt; never use plaintext or another existing project.
- Keep testers, SMTP delivery, outbound hooks and app builds disabled until backend validation. SMTP credentials, redirects, Storage/Realtime publication review, secrets/Edge key compatibility, backups and staging app allowlists can be finalized after preflight, before any relevant flow is enabled.
- Request separate approval for managed extension prerequisites and migration execution after reviewing preflight; separate approval again for scheduler pause, fixture-producing/concurrency tests and bounded cleanup. Empty-project attestation is not sufficient permission to execute them.
- Do not merge source PRs, reset databases or treat the existing-local Step 4C block as lifted. Android Step 2F remains deferred.
