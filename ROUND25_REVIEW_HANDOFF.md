# Round 25 — Connection Policy Correction (Phase 2D) — Review Handoff

**Status:** corrections applied, committed, pushed, and **green on Windows PowerShell 5.1**.
**Not** a deployment-readiness claim: `deploy.ps1` has still never run against a live project, and the
phase boundary in force is "repository-only corrections" — no credentials, no connections, no
deployments, no merges, no protected-checkout changes.

| | |
|---|---|
| Base code SHA | `d76e0f1bda4b8a1043ad0afeb9c731d0ac42b71b` (Round 24 code, on top of `9eb7b8b` handoff) |
| Correction SHA (code) | **`4ffc9e0ab19f56ceeb5c196234bab42e495f940a`** |
| Round 25 initial SHA | `44290a06ee9577f9fefc084545499ce0d455d267` (superseded by `4ffc9e0`; see §6) |
| Branch | `arena/6a50cae6-clash-app` |
| CI (green, this code) | **https://github.com/Xcalibur-hub/clash-app/actions/runs/44316507586** |
| CI (red, superseded) | https://github.com/Xcalibur-hub/clash-app/actions/runs/44315567425 — see §6 |
| Adapter | `clash-native-adapter 5.7.0` (was 5.6.0) |
| Native self-test | **175 / 175** cases on PowerShell 5.1 (was 162) |
| Offline assertions | **540 / 540** in 29 sections (was 531) |
| Assertion inventory | 539 stable identifiers (was 530) |
| Checksums | **241** files (unchanged count; 111 originals, 112 generated artifacts) |
| Migration bodies | **111 originals and 112 generated artifacts byte-identical** |

---

## 1. What was wrong (from Phase 2C)

`Resolve-ExecutionPolicy` accepted only pooler port **6543** and the README called it *"the session
pooler"*. Supabase removed session mode from 6543 on 2025-02-28; session mode is **5432**, transaction
mode is **6543**. So the policy refused the one pooler endpoint with session semantics and mandated
the one endpoint the package's own rationale warned about.

Two further defects surfaced while fixing it, both pre-existing and both invisible until the new tests
were executed:

| # | Defect | Effect |
|---|---|---|
| **D1** | 6543 called "the session pooler"; 5432 refused | Contract inverted; the documented IPv4 fallback could not be selected |
| **D2** | Pooler host pattern allowed exactly **two** labels after the index (`aws-0-A-B.pooler…`) while every Supabase region is **three** (`ap-south-1`, `us-east-1`) | **The pooler branch was unreachable.** No real pooler hostname could ever pass, so the "IPv4 fallback" documented since Round 24 had never been exercisable — and nothing tested it |
| **D3** | `caCertSha256` was a normalised UTF-8 **text** digest of the CA file | Not a file digest and not a fingerprint; unmatched by `Get-FileHash` / `openssl x509 -fingerprint`, and lossy for a DER file |

D2 is the important one for any future review: the branch existed, was documented, and was dead.

---

## 2. Corrections applied (exact)

### 2.1 `tools/lib/clash-native.ps1`

- `Resolve-ExecutionPolicy` parameters: `+[string]$ConfirmedPoolerHost`, `+[switch]$AllowTransactionMode`.
- Mode selection, now per Supabase's ports:

| Input | Result |
|---|---|
| `db.<ref>.supabase.co` | `mode = 'direct'`, port must be 5432 |
| pooler host, port **5432** | `mode = 'pooler-session'` (accepted) |
| pooler host, port **6543**, no switch | **refused** — "TRANSACTION mode, not session mode … choose it explicitly with `-AllowTransactionMode`" |
| pooler host, port **6543**, `-AllowTransactionMode` | `mode = 'pooler-transaction'`, `transactionMode = $true` |
| pooler host, any other port | refused, message names **both** valid ports |
| pooler host without `-ConfirmedPoolerHost` (or with a different host) | **refused** — "is not confirmed … copy it from this project's Supabase Connect dialog" |
| any other host | refused, unchanged message |

- Pooler host pattern: `^aws-[0-9]+-[a-z0-9]+(-[a-z0-9]+){1,3}\.pooler\.supabase\.com$`
  (2–4 labels; zone still anchored to `.pooler.supabase.com`).
- Policy object gains `transactionMode`, `poolerHostConfirmed`, `caCertDigestKind = 'file-bytes'`.
- `caCertSha256` now `Get-FileSha256` (new helper: SHA-256 of the file's **bytes**).
- New helper `Get-ClashPsqlMajorVersion` — one parser for the psql banner, used by both entry points
  (`psql\s*\(PostgreSQL\)\s*(\d+)`, `-1` when the banner is not a psql banner).
- Adapter version `5.6.0` → `5.7.0`.

### 2.2 `tools/deploy.ps1` and `tools/check-ledger.ps1`

- Both accept `-ConfirmedPoolerHost` and `-AllowTransactionMode` and pass them to the policy.
- **PostgreSQL 17 client gate** in both: `psql --version` must parse to major **17**, refused
  (exit 2) otherwise, **before any evidence directory exists** in `deploy.ps1`. `-Psql` still accepts a
  full path; the refusal message names `-Psql 'C:\Program Files\PostgreSQL\17\bin\psql.exe'`.
- Baseline/ledger receipts add `psqlMajor`, `transactionMode`, `poolerHostConfirmed`.
- `deploy.ps1` no longer probes `psql --version` twice; the refusal-stage probe feeds the baseline.

### 2.3 Documentation

- `README.md` §4.2 **Connection modes** (new): the four endpoints, the port→mode mapping, the
  2025-02-28 removal, why the host cannot be derived and must be copied from Connect, the explicit
  consent rule, and *why the set is transaction-mode compatible* (single transaction per wrapper, no
  session state, `pg_advisory_xact_lock` only, row-based claim) without making it the default.
- `README.md` §4: PG 17 client requirement + `-Psql` full path; CA guidance — `verify-full` is the
  only server authentication, `caCertSha256` is the **file** digest, how to print the certificate's
  own fingerprint, and the explicit rule **"do not compare the CA's fingerprint with the server's leaf
  certificate"**.
- `README.md` F7 row and S14 stop row updated; `DIVERGENCES.md` D-5b rewritten.

### 2.4 Tests

- **11 new native cases** (real `Resolve-ExecutionPolicy` calls on 5.1, not text assertions) +
  **2 shape cases** added after the red run (`policyRefusesForeignHost`,
  `policyRefusesLookalikePoolerZone`) = **13 new**, 162 → 175.
- **9 new offline assertions** (static invariants + a README mapping check), 531 → 540.
- Workflow counts and adapter version updated (`175`, `540`, `5.7.0`).

### 2.5 Package regeneration

`node tools/build-package.mjs` — never a hand edit of `checksums.sha256`. The builder is
deterministic: the regenerated wrappers, bootstrap, preflight and verify SQL are **byte-identical**, so
the diff is the edited sources plus their checksum lines. Checksum count stays **241**.

---

## 3. Positive / negative connection-policy tests (executed on Windows 5.1)

All thirteen call the real validators. "Pass" means the case asserted both the accept/refuse outcome
and the expected mode or message.

| Case | Kind | Asserts |
|---|---|---|
| `policyAcceptsDirectConnection` | positive | direct host/5432 → `mode=direct`, neither flag set |
| `policyRefusesDirectOnTransactionPort` | negative | direct host + 6543 → refused, "requires port 5432" |
| `policyAcceptsSessionPooler` | positive | real pooler host + 5432 + confirmation → `mode=pooler-session` |
| `policyRefusesUnconfirmedPoolerHost` | negative | pooler + 5432, no confirmation → refused, "is not confirmed" |
| `policyRefusesMismatchedPoolerConfirmation` | negative | confirmation for a *different* host → refused |
| `policyRefusesTransactionModeByDefault` | negative | pooler + 6543, confirmation, no switch → refused, names `-AllowTransactionMode` |
| `policyAcceptsTransactionModeWhenChosen` | positive | pooler + 6543 + confirmation + switch → `mode=pooler-transaction`, `transactionMode=true` |
| `policyRefusesUnknownPoolerPort` | negative | pooler + 5433 → refused, names **both** valid ports |
| `policyRefusesForeignPoolerUser` | negative | pooler host + user `postgres` → refused |
| `policyRefusesForeignHost` | negative | `evil.example.com` → refused, "is not permitted for project" |
| `policyRefusesLookalikePoolerZone` | negative | `aws-0-ap-south-1.pooler.evil.com` → refused (zone anchored) |
| `psqlMajorVersionIsParsedOrRefused` | positive + negative | 17.2 / 17.2 (Debian) / 17.0 → 17; 16.9 → 16; 9.6.24 → 9; mismatch warning / error text / empty → `-1` |
| `caCertificateDigestIsAFileDigest` | positive + negative | `Get-FileSha256` equals the raw SHA-256, **differs** from the normalised text digest (CRLF fixture), and the policy records the file digest |

Offline (Node) additions pin the same contract textually so a doc/code drift fails on Linux too:
session=5432 and transaction=6543 in lib and README, the one-port message is gone, the confirmation is
wired into both entry points, the psql gate precedes the evidence directory, the CA digest is the file
digest, and no thumbprint/`X509Certificate`/`GetCertHash` substitution exists anywhere.

---

## 4. CI evidence (run 44316507586, commit `4ffc9e0`)

Windows 2022 · Windows PowerShell 5.1 Desktop · offline · 14 of 14 steps green:

```
5  Assert the runtime is Windows PowerShell 5.1 (never pwsh)          PASS
7  Parse every package script with the 5.1 parser (negative control)   PASS
8  Native adapter self-test - 175 cases on this runtime                PASS
9  Adapter receipt via the package's own gate (175/175, 5.7.0)         PASS
10 Offline manifest verification (111 originals, checksums, git)      PASS
11 Offline Node package suite through the adapter (540 assertions)    PASS
12 Manifest receipt (status PASS, 111 entries)                        PASS
13 Suite receipt (540/540, machine summary agreed, adapter 5.7.0)     PASS
```

Local (Linux) before pushing: `node tests/verify-package.mjs` → `540 passed, 0 failed`, 29 sections,
inventory digest `0ee5f4f6…` reconciled against `tests/assertion-inventory.txt`.

---

## 5. Changed files (11, none of them SQL)

```
.github/workflows/windows-offline-validation.yml   22 +-   counts + adapter version
supabase/cloud/DIVERGENCES.md                      20 +-   D-5b rewritten
supabase/cloud/README.md                          105 +-   §4.2, §4 CA/psql, F7, S14, counts
supabase/cloud/checksums.sha256                    18 +-   regenerated by the builder
supabase/cloud/manifest.json                        2 +-   built_at_utc only
supabase/cloud/tests/assertion-inventory.txt       13 +-   530 -> 539 identifiers
supabase/cloud/tests/verify-package.mjs            36 +-   9 assertions, counts
supabase/cloud/tools/check-ledger.ps1              20 +-   flags, psql 17 gate, receipt fields
supabase/cloud/tools/deploy.ps1                    30 +-   flags, psql 17 gate, baseline fields
supabase/cloud/tools/lib/clash-native.ps1          97 +-   policy, pattern, helpers, 13 cases
supabase/cloud/tools/test-native-capture.ps1      135 +-   13 policy/psql/CA cases
```

`supabase/migrations/` (111 originals), `supabase/cloud/generated/` (112 artifacts),
`preflight/`, `verify/` — **unchanged**.

---

## 6. The red run, kept on the record

`44315567425` (commit `44290a0`) failed at step 8: **8 of 11** new native cases reported
`Host 'aws-0-ap-south-1.pooler.supabase.com' is not permitted`. That was the pattern defect **D2**
above, exposed by tests that actually executed the policy. It is recorded rather than rewritten away:
the first attempt shipped a correct *contract* on top of an unreachable host pattern, and only a
native run could tell. Fix `4ffc9e0` narrows the pattern (2–4 labels), adds the two shape cases, and
is the SHA the green run certifies.

---

## 7. What is still NOT assessed

- **No database was contacted.** `deploy.ps1` and `check-ledger.ps1` have never run against a live
  project; every gate beyond the offline ones is unexercised.
- **The real pooler hostname is still unknown.** It must be copied from the project's Connect dialog;
  nothing in this round can confirm it, and confirming it needs dashboard access (Phase 3).
- **The project's plan/add-on state is unknown** — if the IPv4 add-on is enabled, the direct endpoint
  becomes IPv4 and the pooler is unnecessary; the add-on *replaces* the AAAA record rather than adding
  one.
- **A `psql` 17 client is still not installed anywhere** we can see; the gate now refuses anything
  else, which is the intended behaviour but also means the next phase must provision it first.
- **Pooler TLS** (`verify-full` against `*.pooler.supabase.com`) is untested — no network path from
  the audit sandbox.
- **Transaction-mode behaviour end to end** is a static conclusion (§2.3 of the README). The set is
  compatible on paper; it has not been run through Supavisor.
- **No independent review of this round has happened yet.** A green Windows run is not acceptance.

---

## 8. Next actions (each needs its own authorization)

1. **Review this handoff** (independent reviewer) — start with §6 (the superseded red run) and D2.
2. **On the Windows host, read-only:** `psql --version` (must be 17), `Resolve-DnsName` for
   `db.<ref>.supabase.co` (A vs AAAA), IPv6 route presence, `Test-NetConnection` on 5432/6543.
3. **From the dashboard's Connect dialog:** the exact pooler hostname (if a pooler is needed at all).
4. **Only then**, and separately: credentials via `PGPASSWORD`/`PGPASSFILE`, `-CaCert`, and one
   authenticated **read-only** `check-ledger.ps1` run.
5. Deployment remains out of scope until 1–4 are satisfied and separately approved.

---

## 9. Scope statement

Repository-only changes on the isolated Arena branch. No credentials requested, read or printed; no
installations; no database connections; no deployments; no merges; no changes to the protected
checkout. `docs/ai/HANDOFF.md` deliberately unchanged. The package is green on Windows PowerShell 5.1
in CI; that is a statement about the package, not about this machine, this network or this project.
