# CLASH — Phase 3G independent review and clean-source certification

2026-11-19. **Overall: BLOCKED. Material independent-review finding; STOP applied.**
No package Git repository or commit was created. No database connection,
migration, deployment, cutover, credential loading/rotation, real environment
change or remote Git operation occurred. The proposed session-pooler correction
is incomplete and deliberately unsealed; this candidate is not certified.

## Scope and independence

All writes were confined to
`C:/Users/91962/Desktop/Clash-phase3e-preparation-20261119`, branch
`phase3e/cutover-preparation-20261119`, outer HEAD
`2b898748a48e317ac5737da62c7a964f50aca2a8`; inherited dirty tree, empty index.
The primary checkout and `C:/clash-r24` were preserved. Target
`kgaqejgubjemdecifzew` remains a future target only; the original getzippin
project was untouched.

Two fresh agents, supplied no implementation history, reviewed read only:
`/root/independent_package_review` and `/root/independent_app_review`.
Their findings are recorded in
[package review](preparation/phase3g/independent-package-review.md),
[app review](preparation/phase3g/independent-app-review.md), and the subsequent
[material-defect confirmation](preparation/phase3g/material-defect-review.md).
The earlier package integrity PASS was explicitly superseded for certification
by the later runtime-policy finding; it was not a release approval.

## Material finding: session-pooler host allowlist

**FAIL.** `preparation/phase3f/package/supabase/cloud/tools/lib/clash-native.ps1:3758`
contains:

```powershell
^aws-[0-9]+-[a-z0-9]+-[a-z0-9]+\.pooler\.supabase\.com$
```

This accepts only two region segments. With correct `postgres.<ref>`, a
synthetic CA file, process-only synthetic password and port 5432, the independent
reviewer reproduced:

| Resolver argument | Observed |
|---|---|
| `aws-0-ap-south-1.pooler.supabase.com` | Rejected as unpermitted host |
| `aws-0-ap-southeast-1.pooler.supabase.com` | Rejected as unpermitted host |
| `aws-0-ap-south.pooler.supabase.com` | Accepted as pooler |

These were synthetic resolver arguments, not discovered project endpoints.
The intended session route fails before port validation. This is a material
functional defect, separate from the 6543/5432 discrepancy; it fails closed.
No authorization bypass or secret disclosure was demonstrated.

The new pure-resolver Windows test returned **6 PASS / 13 FAIL / 19 total,
exit 1**, not an acceptable certification result. Later negative cases cascade
through the host rejection before their intended checks; this does not establish
13 distinct product defects. Evidence:
[test](preparation/phase3g/test-execution-policy.ps1),
[receipt](preparation/phase3g/policy-tests.json),
[log](preparation/phase3g/policy-tests.log).
No psql or deploy script was invoked by this test.

Supabase documents shared session mode on **5432**, transaction mode on **6543**,
and the `aws-[INDEX]-[REGION]` hostname form. Its actual host must be copied from
Connect, not inferred. [Official connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres).
The [public changelog](https://supabase.com/changelog.md) was also consulted;
neither public-document request accessed a project or database.

## Review results and exact evidence

| Scope | Grade and evidence |
|---|---|
| Original/source fidelity | PASS before candidate edits: independent 119/119 raw-byte comparisons against isolated originals and snapshot; originals remain untouched. See independent package review and final preservation evidence. |
| Atomic SQL/ledger | PASS static: independently reconstructed 119 wrapper bodies/tails; eight BEGIN/COMMIT normalizations match. Ledger insert remains inside each wrapper transaction, with executed no-cron variant identity. No SQL was executed. |
| Checksums/security controls | PASS at initial review: 258/258 checksums; no active cron commands in generated SQL; fail-closed no-cron/RLS/admission/Auth/Storage checks retained. Runtime effectiveness NOT TESTED. |
| Offline package suite | PASS before policy edits: `node preparation/phase3f/package/supabase/cloud/tests/verify-package.mjs`, exit 0, 531/531 across 29 sections. `preparation/phase3g/package-verification-review.log` and `package-verification-review-result.json`. |
| App isolation/header regression review | PASS in offline scope, no material defect found. Independent reviewer reran 12 session/cache/account-boundary tests plus 8 origin/header unit tests, all exit 0. Parent also captured 12/12 in `preparation/phase3g/app-isolation-review.log` and `app-isolation-review-result.json`. |
| Windows pure execution-policy behavior | FAIL, 6/19, exit 1; material hostname defect independently confirmed. `preparation/phase3g/policy-tests.json`. |
| Fresh full Windows adapter / integrity / clean-source checker / final suite | NOT TESTED after STOP. No prior 162-case receipt was reused for the changed adapter. No clean-source PASS claimed. |
| SQL/Auth/Storage/Realtime/native integration | NOT TESTED; no DB or Auth operation authorized or attempted. |
| Protected state | PASS, `node preparation/phase3g/final-preservation.cjs`, exit 0. All nine preservation checks true in `preparation/phase3g/final-preservation.json`: Git/index and file hashes match captured `baseline.json`, with only four expected candidate input changes. |

App review covered canonical-origin Auth storage with no legacy fallback,
project/account remounts and persistent cache namespaces, async account guards,
and `apikey` without Bearer for opaque publishable image keys. Installed SDK,
mocked transports/storage and React reconciliation do not establish real Auth
refresh, hosted media delivery, native headers or device lifecycle acceptance.

Additional limitations: managed `storage.objects` trigger DDL authority remains
UNKNOWN, distinct from policy-DDL delegation. Native integrity checksums the
snapshot as an opaque file; the builder and independent review verify current
raw-byte binding, but native snapshot-field validation is incomplete. Neither
limitation is represented as hosted acceptance.

## Candidate state at STOP

Before the new material finding, the authorized port correction changed the
pooler branch to require 5432 and explicitly refuse transaction pooling on 6543
(`clash-native.ps1:3768`). README/DIVERGENCES were corrected, and the existing
static pooler assertion was strengthened. TLS `verify-full`, mandatory CA,
project/user checks, environment redirection refusals and confirmation gates
were not relaxed. These checks are not certified as passing by the failed run.

Two package-root preparation files were added: `.gitattributes` preserves original
migration bytes with `-text` and pins other text to LF; `.gitignore` excludes local
evidence/scratch/environment/key/certificate files. No files were staged.

The package builder was **not** run after STOP. Existing manifest/checksum files
were **not** resealed to hide the failing policy. Four checksummed inputs now
differ: `supabase/cloud/README.md`, `DIVERGENCES.md`,
`tools/lib/clash-native.ps1`, `tests/verify-package.mjs`. Consequently the current
candidate intentionally has a stale seal and must be refused. Original SQL,
generated wrappers, source snapshot and historical receipts remain unchanged.
Phase 3F's historical report describes its prior sealed state, not this candidate.

**Package commit SHA: NONE.** `preparation/phase3f/package/.git` does not exist.
Conditional authorization to commit was not exercised because review failed.
Outer HEAD above is a baseline identifier, not a clean-source package commit.

| Artifact | Raw SHA-256 at STOP |
|---|---|
| Unchanged `supabase/cloud/manifest.json` | `0a271cc4efebad1108e4c01e2c24217e8831936d10e4131c56066852e1999e56` |
| Unchanged `supabase/cloud/checksums.sha256` | `f84bc919d0d55324be9a92495212e9850119755ce99d7648612630a0ccbe1a34` |
| Unchanged `supabase/cloud/source-snapshot.json` | `d571d30655258bba9e88b18ec5d7e0616d884dc66cdc2a0970d3782caf128d95` |
| Modified adapter, raw bytes | `6c6b19038e9a46667b618f52c6e2fba979c2268c1b011c7099f35b8eabf3c81b` |
| Modified adapter, LF-normalized | `0a54dfbfcbd76bc5b1d14a1f3d633cd598fb2f18fa8a3ebe66e483658b15d8f6` |
| Failed Windows policy receipt | `c50392308ca69cedb28aa66b5024a84c050a967e87fab1e092f3df3d7abeb6cc` |

## Minimum next authorization

Authorize **offline repair of the newly identified pooler-host validation defect
in this isolated candidate, expanded positive/refusal tests, independent delta
review, and resumption of clean-source certification**. Retain TLS/CA, exact
project/user, confirmation and environment-redirection gates; retain 6543 refusal.
Do not widen the host policy to arbitrary domains. Then reseal reviewed inputs,
rerun package/Windows checks, and only after review passes create the separate
local package repository/commit. No database permission is needed for that step.

Disposable database integration remains blocked until that certification passes.
Afterward, the smallest integration authorization is a bounded replay/security
test on one explicitly identified **new throwaway local Supabase-compatible
instance**, using the certified package SHA and synthetic fixtures, with no
access to either hosted project or existing accepted disposable instances.
It must cover all 119 ledger identities/atomic failures, no-cron, RLS/Auth,
Storage trigger privileges and upload/signed/TUS denial paths. This authorization
has not been granted; no instance was created or started in Phase 3G.
