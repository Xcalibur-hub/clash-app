# Phase 11 Step 13 — Final Deployment Hardening

**Baseline:** `4567905`. **Worktree:** `C:/p117` (`feat/phase-11-backend-security-7`).
**Target:** `clash-staging` / `zrutlrhhvfcsmssjiijl`.
**Mode:** **PREPARATION ONLY.** No hosted deployment, secret change, Auth change, cron change, fixture
or quarantine change was made.

## Verdict

The deployment workflow is now hardened and offline-tested (**14/14 checks pass**), the first
deployment is scoped to **exactly four functions**, and **no secret is required** for that set. The
pin, the exact command and the recovery procedure are below.

**Commit to pin: `ea8d128d21799a9f689c5cb137a87d32cf2264de`**
**Staging remains QUARANTINED. Edge Functions remain 0 deployed of 6 expected.**

---

## 1. Deployment verification fixes

| # | Requirement | Implementation | Test |
|---|---|---|---|
| 1 | Require the exact approved commit, not merely a clean tree | `--commit <sha>` is mandatory for `--execute`; `checkCommitPin` requires HEAD **equal** to it *and* a clean tree | `commit pinning…` |
| 2 | Fail closed when `verify_jwt` is absent, null, ambiguous or different | `checkJwtEquals` requires `typeof === 'boolean'`; `null`, `undefined`, `"true"` and a bare mismatch all FAIL | `JWT enforcement fails closed…` |
| 3 | Reject unexpected deployed functions unless explicitly allowlisted | `checkInventory` compares the deployed list to the manifest and fails on anything not in `REVIEWED_DEPLOYED_ALLOWLIST` (empty by design) | `inventory verification fails on null verify_jwt and on unexpected functions` |
| 4 | Confirm the target project identity before any mutation | `--confirm-project` must repeat the pinned ref (`checkProjectRef`), and the remote inventory is read back **before** the first deploy | `project-reference enforcement…` |
| 5 | Use a fixed, reviewed CLI version, not an unpinned `npx` download | `CLI_SPEC = supabase@2.40.7`; `checkCliVersion` asserts the running CLI reports the pinned version before any mutation (execute path only) | `pinned CLI version mismatch is refused` |
| 6 | Ensure CLI errors cannot expose tokens/secrets in logs or evidence | `cli()` captures both streams and pipes them through `redact()`; `writeEvidence()` refuses to write if `evidenceIsSanitized` is false; the token only ever travels in the child **environment** | `evidence is sanitized…` |
| 7 | Automated tests for every failure condition | `scripts/staging-functions-deploy.test.mjs` — **14 tests, 0 failures** | whole file |

`redact()` scrubs Supabase personal access tokens (`sbp_…`), JWTs (`eyJ…`), `Bearer …` headers and
`apikey/password/secret/token` assignments. `evidenceIsSanitized()` recursively re-checks the whole
payload before anything is written.

## 2. Secret-handling fix

`requiredSecretsForSet(selected)` computes required secrets from the **selected set only** — the plan
no longer demands anything for functions that do not need it:

| Selected set | Required secrets |
|---|---|
| the four approved functions | **none** |
| `+ arena-editorial` | `ARENA_EDITORIAL_RUN_SECRET` |
| `arena-gifs` alone | none (its key is optional) |

In plan mode no secret API is touched at all. In execute mode only the **names** of already-configured
secrets are listed. No value is read, printed, generated or uploaded, and evidence records
`secrets_read: false`, `secret_values_present: false`.

## 3. Deployment scope (first deployment)

| Function | In scope | Note |
|---|---|---|
| `vault-media-access` | ✅ | no secret; private Vault media |
| `course-lesson-media-access` | ✅ | no secret; private lesson media |
| `creator-ai` | ✅ | no secret required; AI degrades to "not configured" |
| `digital-creator` | ✅ | no secret required; degrades to "not connected" |
| `arena-editorial` | ⏸ pending | needs `ARENA_EDITORIAL_RUN_SECRET`; **not** in the approved set |
| `arena-gifs` | ⏸ pending | needs the optional GIF integration decision; **not** in the approved set |

Existing JWT settings are preserved: the workflow never passes `--no-verify-jwt`, reads policy only
from `supabase/config.toml`, and refuses at start-up if the manifest and `config.toml` disagree.

## 4. Credentials

**A Supabase personal access token is account-scoped, not project-scoped** unless the organization
offers restricted tokens. Residual risk is therefore documented rather than assumed away:

- The operator supplies the credential through a **secure local mechanism** (shell environment
  variable `SUPABASE_ACCESS_TOKEN`, or a Windows Credential Manager entry read into the environment).
- It is **never** placed in Git, a prompt, an issue, a report, a screenshot, a file, a command argument
  or a log line.
- **Project restrictions enforced by the tool:** the ref is hard-pinned to
  `zrutlrhhvfcsmssjiijl`; `--confirm-project` must repeat it; every CLI call passes
  `--project-ref zrutlrhhvfcsmssjiijl`; the deployed inventory is read back and any unexpected function
  fails the run. The tool therefore cannot act on another project even if the token could.
- **Residual account-level access (documented, not mitigated):** the token stays valid for every
  project the account can reach until the operator revokes it. Recommended: revoke immediately after
  the run, or issue a token from a dedicated staging-only account if the organisation supports it.
  For future automation, prefer a short-lived token in the CI secret store, scoped to the staging
  account, rotated after each use.

## 5. Verification performed (offline — no network, no CLI, no hosted access)

`node --test scripts/staging-functions-deploy.test.mjs` → **tests 14, pass 14, fail 0**:

| Condition | Test |
|---|---|
| Commit pinning (missing, dirty, mismatch, exact) | `commit pinning: missing pin, dirty tree, mismatch all fail; exact match passes` |
| Clean-tree check reports offending paths | `clean-tree check reports the offending path count` |
| Project-reference enforcement | `project-reference enforcement rejects a wrong or unconfirmed ref` |
| Function allowlisting | `function allowlisting: unknown and unapproved names are refused` |
| JWT configuration enforcement | `JWT enforcement fails closed on null, undefined, string or mismatch` |
| Unexpected deployed functions / null `verify_jwt` | `inventory verification fails on null verify_jwt and on unexpected functions` |
| Secret prerequisites scoped to the set | `secret prerequisites are scoped to the selected set only` |
| Partial-deployment handling | `partial deployment is detected` |
| Negative-authentication verification | `negative-authentication verification requires 401 for every function` |
| Sanitized evidence generation | `evidence is sanitized: tokens, JWTs and Bearer headers are redacted` |
| Pinned CLI version | `pinned CLI version mismatch is refused` |
| Repository inputs / `config.toml` parity | `repository inputs match the manifest and every function file exists` |
| Plan mode never deploys; unapproved refused | `plan mode never deploys and refuses an unapproved function` |
| Execute without `--commit`/`--confirm-project` stops early | `an execute run without --commit or --confirm-project stops before any CLI call` |

A real clean-tree plan run then produced evidence
(`docs/evidence/phase-11-13/four-function-plan-evidence.json`) with all six checks green: project
identity, allowlist (4), commit pin, repository inputs, pinned CLI, and **0 required secrets for the
selected set**.


## 6. Execution plan, exact command and recovery

### Credential setup (one time, operator)

```powershell
# In the deployment shell ONLY. Never a file, transcript, issue or screenshot.
$env:SUPABASE_ACCESS_TOKEN = '<staging credential>'
```

### Exact one-time execution command (from the pinned commit)

```powershell
# Deploy from the pinned commit as a detached checkout, so HEAD == pin and the
# tree is clean (the pin check requires both):
git -C C:\p117 fetch origin
git -C C:\p117 checkout ea8d128d21799a9f689c5cb137a87d32cf2264de
git -C C:\p117 rev-parse HEAD   # must print ea8d128d21799a9f689c5cb137a87d32cf2264de

node C:\p117\scripts\staging-functions-deploy.mjs `
  --only vault-media-access,course-lesson-media-access,creator-ai,digital-creator `
  --execute `
  --commit ea8d128d21799a9f689c5cb137a87d32cf2264de `
  --confirm-project zrutlrhhvfcsmssjiijl `
  --evidence-dir C:\p117\.expo\staging-deploy\step13-execute
```

Independent read-only verification afterwards:

```powershell
node C:\p117\scripts\staging-functions-verify.mjs --evidence-dir C:\p117\.expo\staging-verify\step13
```

The run stops on: wrong/absent project confirmation, a name outside the approved set, a dirty tree or
commit mismatch, a `config.toml`/manifest disagreement, a failed CLI version assertion, a missing
required secret, a deploy error, partial deployment, an inventory/`verify_jwt` mismatch, or a non-401
unauthenticated response.

### Recovery procedure

1. **Stop point is always reported** — `result: "STOPPED"` plus the exact reason in
   `deploy-evidence.json`; nothing is retried automatically.
2. **Partial deployment** — re-run the same command; it is idempotent and touches only the named set.
   The app feature-detects each call, so a partial set is safe.
3. **Wrong JWT state** — fix the `config.toml`/manifest parity first; never use `--no-verify-jwt`.
4. **Restore a previous version** — `git checkout <last-good-commit> -- supabase/functions/<name>`,
   then re-run with `--commit <that-commit>` and `--only <name>`; record the restored commit.
5. **Roll everything back** — disable the four functions; the client degrades as documented (private
   media playback and Creator AI unavailable; nothing else changes).
6. **No database rollback** is required or appropriate: these deployments change no schema and can only
   fail a request.

## Deliverables

- Hardened tooling: `scripts/staging-functions.manifest.mjs`, `scripts/staging-functions.lib.mjs`,
  `scripts/staging-functions-deploy.mjs`, `scripts/staging-functions-verify.mjs`.
- Automated regression tests: `scripts/staging-functions-deploy.test.mjs` (14 tests, all passing).
- Four-function deployment plan + evidence: `docs/evidence/phase-11-13/`.
- Credential setup, exact command and recovery procedure: §6 above.
- **Commit to pin: `ea8d128d21799a9f689c5cb137a87d32cf2264de`.**

## Handoff and approval request

Branch `feat/phase-11-backend-security-7`. Draft PR:
`https://github.com/Xcalibur-hub/clash-app/pull/new/feat/phase-11-backend-security-7`.

> **Awaiting explicit operator approval** to execute the pinned four-function staging deployment:
> `vault-media-access`, `course-lesson-media-access`, `creator-ai`, `digital-creator`, from commit
> `ea8d128d21799a9f689c5cb137a87d32cf2264de`, with a staging credential supplied in the shell
> environment only. Scope excludes `arena-editorial` and `arena-gifs`, all hosted database writes,
> Auth changes, secret creation, cron changes, fixtures and quarantine lift.

Staging remains **QUARANTINED**; `clash-maintenance` remains **inactive**. Nothing was deployed.

