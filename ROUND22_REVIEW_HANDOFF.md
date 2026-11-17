# CLASH Round 22 — review handoff

**Scope:** close the four root causes named in the Round 21 independent acceptance
report (`ROUND21_INDEPENDENT_ACCEPTANCE_REPORT.md`, findings C21-01, C21-02,
C21-03), plus a real positive/negative Windows PowerShell 5.1 test for every
demonstrated failure. Bounded correction: no new validation architecture, no runner
rewrite, no change to any approved SQL body, no cloud access, no credentials.

| | |
|---|---|
| Branch | `arena/6a50cae6-clash-app` (isolated; nothing else touched) |
| Base | Round 21 handoff `a7994d1008e5cc070fc941c0358b62ce23374001` |
| Code state | **`e830b8c792e085e4266829a24e0db15807a0bd27`** (this file is committed after it) |
| Windows CI | run [44069143611](https://github.com/Xcalibur-hub/clash-app/actions/runs/44069143611) — **all steps green, windows-2022 / powershell.exe 5.1** |
| Adapter | `clash-native-adapter 5.4.0` (was 5.3.0) |
| Native cases | **159/159** (was 156) |
| Offline assertions | **519/519 in 29 sections** (was 514) — 518 identified + the count tripwire |
| Package | 111 manifest entries, 241 checksummed files (111 originals + 130 package files), unchanged |

**Status: green locally and on the GitHub Windows runner. Nothing here is
accepted.** This is a submission for independent audit. It makes no claim that the
release is cloud-ready: `deploy.ps1` has never been executed against a live
database in this round, and every hosted surface is explicitly NOT ASSESSED (§8).

---

## 1. C21-01 — one hashing contract (writer and verifier)

**The defect.** `Add-Receipt` hashed the *raw* text it handed to
`Write-EvidenceOrFallback`. On Windows, `ConvertTo-Json` emits CRLF, so the value
returned to the caller (and chained into the next receipt as `prevReceiptSha`) was
the digest of CRLF bytes, while every verifier recomputed the digest of the file
after normalising CRLF to LF (`Get-NormalizedSha256`). A writer-produced chain could
therefore never verify. The applied receipt made it worse: `deploy.ps1` wrote
`<NNN>-<version>-applied.json` at the run root, and the verifier looked for it inside
`03-migrations/`, so the migration chain was broken at every step even after the
hashing was corrected.

**The correction (single source each).**

- `Write-Evidence` normalises `\r\n` → `\n` *before* encoding and returns
  `Get-TextSha256` of exactly those bytes. The digest the writer returns is now the
  digest `Get-NormalizedSha256` recomputes from the file, byte for byte.
- `Get-ClashAppliedReceiptRelative -Index -Version` is the only place the applied
  receipt is named or located. `deploy.ps1`'s success branch, the verifier's
  predecessor candidates and its `$receiptShaByName` map (which now also hashes
  root-level applied receipts) all call it. The hard-coded
  `("{0}-applied.json" -f $label)` is gone; `deploy.ps1` contains no
  `"-applied.json"` literal.
- The self-test fixture's `Get-FinalizationReleaseSha` uses `Get-NormalizedSha256`,
  so the test harness cannot paper over a producer/consumer disagreement.

**How it is verified (Windows 5.1, not a text assertion).** Case
`writerReceiptStreamRoundTripsThroughProducerAndConsumer` builds a run with the
**real `Add-Receipt` writer**, in the runner's order and topology, then requires:

1. the real verifier `Test-ClashDeploymentEvidence` to accept it;
2. every link in `Get-ClashReceiptChain` to equal `Get-NormalizedSha256` of the
   preceding receipt file (the contract itself, not a proxy);
3. the applied receipt to exist at the run root, under the name
   `Get-ClashAppliedReceiptRelative` returns, and **not** under `03-migrations/`;
4. the real publisher `Publish-ClashCompletion` and the real consumer
   `Test-ClashRunCompletion` to accept the sealed run.

## 2. C21-02 — one receipt chain over every receipt

**The defect.** The Round 21 verifier compared a migration receipt with the receipt
before it and nothing else. An unrelated `04-postflight.json` predecessor — the
exact Round 20 reproduction — was still accepted, and `GENESIS` acted as an
exemption from the link rule anywhere in the sequence.

**The correction.** `Get-ClashReceiptChain -Root -Exclude` builds **one ordered path
over every receipt in the run** and reports `{ok, problems, order, count}`:
exactly one `GENESIS` (a second one, or an interior one, is a problem — never an
exemption), every other receipt chained to the actual digest of the receipt before
it, fork detection, loop detection, unreachable-receipt detection, duplicate-content
detection (two receipts with the same bytes cannot be told apart), and phase-rank
monotonicity (`Get-ClashReceiptPhaseRank`). `Test-ClashDeploymentEvidence` calls it
(excluding the seal and `06-complete-unverified.json`) and additionally refuses a
protocol phase receipt that exists but is not in the verified chain.

`Get-ClashReceiptPhaseRank` maps the runner's **whole** receipt vocabulary, not only
the happy path: `00-*`, `01-integrity*`, `01-approved*`, `01-gates/*`, `01b-*`,
`02-*`, `03-ledger*`, `03b-*`, `03c-*`, `03-migrations/*`, `*-applied.json`,
`*-digest-detail.json`, `04-*`, `05-*`, `06-claim-release*`,
`06-finalization-intent`, `06-finalize-fail`, `06-complete`, `99-runner-exception`.
A name the map does not know is refused (fail closed) rather than silently ranked —
the cost of that choice is recorded in §8.

**How it is verified.** Case `receiptChainRejectsBrokenAndExemptedLinks` keeps a
positive control (an untouched writer-built run must be accepted) and then applies
four attacks, each of which rewrites one receipt and **re-chains everything after
it** (`Repair-ReceiptChain`), so stale successor digests cannot mask the intended
defect — the reviewer's own reproduction method:

| attack | mutation | must be refused with |
|---|---|---|
| `postflight-unrelated-predecessor` | `04-postflight.json` chains from `dddd…` (no receipt in the run) | "chains from a digest that is no receipt" / "not reachable" |
| `interior-genesis` | `03-migrations/002-…json` declares `GENESIS` | the exactly-one-GENESIS rule |
| `duplicate-genesis` | `05-storage.json` declares a second `GENESIS` | the exactly-one-GENESIS rule |
| `missing-applied-receipt` | the root applied receipt the next migration chains from is deleted | "chains from" / unreachable / no per-migration receipt |

## 3. C21-03 — the wrapper must BE the approved body

**The defect.** The planner asked `$wrapperText.Contains($bodyText)`. A comment
inserted at the start of the body — or any line added before/inside it — passed,
because containment is not equality.

**The correction.** The planner now:

1. normalises the wrapper, requires a standalone `\nbegin;\n` boundary and a
   `\ninsert into supabase_migrations.schema_migrations` boundary after it, and
   refuses a wrapper where either boundary cannot be established;
2. **extracts** the text between them and compares its digest with the digest of the
   approved original's body, whole (`the executable body of wrapper … is …, but the
   approved body of … is …`);
3. squashes whitespace and compares the ledger insert + `commit;` tail against the
   exact approved template for that ordinal — `version`, `ledgerName`,
   `array['sha256:<normalised>']`, `'clash-cloud-wrapper-v1'`, `commit;`
   (`… are not the approved template …`).

**Independent cross-check (outside PowerShell).** A Node script compared all 111
manifest entries' committed wrappers against their approved originals with the same
extraction: **0 body mismatches, 0 tail mismatches** — the committed package is not
merely accepted, it is exactly the approved text.

**How it is verified.** Case `wrapperBodyIsTheApprovedBodyExactly` holds a positive
control (a pristine package copy must be accepted) and three attacks, each with every
digest rebound (checksums, `wrapperSha256`) so only the fidelity rule can catch them:

| attack | mutation | must be refused with |
|---|---|---|
| `comment-before-body` | `-- harmless extra comment` right after `begin;` (the Round 20 reproduction) | "the executable body of wrapper" |
| `ledger-token-rewrite` | the ledger token's `sha256:` digest replaced | "not the approved template" |
| `transaction-close` | a comment appended after `commit;` | "not the approved template" |

## 4. Two Round 21 fixtures recalibrated (not weakened)

The stricter rules changed two existing cases' premises. Both were fixed so they
still fail for the **right** reason, and neither loses an attack:

1. `packageFidelityBindsEveryWrapperToItsOriginal` matched the substring-era wording
   `does not contain the approved body`. The rule is now the extracted-body digest,
   so the fixture expects `the executable body of wrapper`. The attack
   (`create table` → `create unlogged table`, every digest rebound) must still be
   refused — it is.
2. `mutatedValidatorIsDetectedByTheSuite` drops the phase-status check from a copy of
   the adapter and rewrites `02-preflight.json` to `status = "FAIL"`. The receipt
   chain now detects that rewrite, which would have given the mutant an unrelated
   second reason to refuse. The fixture re-chains every receipt after the rewritten
   one, so the dropped status check is the only thing the mutant is judged on — and
   it is still detected (`rc02-phase-status` now passes inside a full green run).

The self-test case inventory grew from 156 to 159; the suite's case pins, the
workflow's 159/159 and 519/519 pins, `README.md`, `EXPECTED_CASES`,
`EXPECTED_ASSERTIONS`, `$script:ClashSelfTestRequiredCases`, the assertion inventory
(518 ids, `40ae9853…`) and `checksums.sha256` were all updated together.

## 5. Findings matrix

| finding | status | the rule that now enforces it | evidence |
|---|---|---|---|
| C21-01(a) writer/verifier hash disagreement | closed | `Write-Evidence` normalises then hashes the bytes it writes; `Add-Receipt` returns that digest | case `writerReceiptStreamRoundTripsThroughProducerAndConsumer`; assertions `round-22-write-evidence-hashes-exactly-the-bytes-it-writes-crlf-normalis`, `round-22-add-receipt-chains-the-digest-the-writer-returned-never-a-recom` |
| C21-01(b) applied receipt in two locations | closed | `Get-ClashAppliedReceiptRelative` used by writer, verifier and fixture | same case (root yes / `03-migrations` no); assertion `round-22-the-applied-receipt-has-one-location-shared-by-writer-and-verif` |
| C21-02 broken predecessor chains outside migrations | closed | `Get-ClashReceiptChain` + phase ranks inside `Test-ClashDeploymentEvidence` | case `receiptChainRejectsBrokenAndExemptedLinks`; assertion `round-22-the-chain-covers-every-receipt-and-genesis-is-never-an-interior` |
| C21-02 GENESIS as an interior exemption | closed | exactly one `GENESIS`; no exemption path | same case (`interior-genesis`, `duplicate-genesis`) |
| C21-03 substring "fidelity" | closed | extracted body digest + exact ledger tail template | case `wrapperBodyIsTheApprovedBodyExactly`; assertion `round-22-the-wrapper-body-is-extracted-and-compared-whole-not-searched-f` |
| C21-03 committed wrappers vs approved bodies | verified externally | Node cross-check over all 111 entries: 0 body / 0 tail mismatches | §3, reproducible with the documented extraction |
| "real positive and negative PS 5.1 tests" | closed | all three new cases run on windows-2022 / 5.1, each with its own positive control | CI run 44069143611 |
| "recheck all previously passing Round 21 cases" | closed | all 159 cases green on 5.1, including the six-mutant harness and the RC01-RC11 controls | CI run 44069143611 |
| "finish the timed-out native mutation test" | closed in-suite | the six-mutant harness (`rc01…rc06`) ran to completion inside this job; no timeout, no skipped mutant | CI step "Native adapter self-test - 159 cases" |

## 6. Reproduction matrix (how to re-run each claim)

Every row is executed by the suite on Windows PowerShell 5.1; none is a text
assertion about the adapter.

| # | reproduction | fixture | expected verdict |
|---|---|---|---|
| R1 | writer-produced run, verified by the real consumer | `New-FinalizationRun` (real `Add-Receipt`) | accepted end to end |
| R2 | `04-postflight.json` chains from an unrelated digest, successors re-chained | `Set-ReceiptPredecessor` | refused: unreachable/not reachable |
| R3 | interior `GENESIS` on migration 002, successors re-chained | `Set-ReceiptPredecessor` | refused: exactly-one-GENESIS |
| R4 | second `GENESIS` on `05-storage.json` | `Set-ReceiptPredecessor` | refused: exactly-one-GENESIS |
| R5 | applied receipt deleted | `Remove-Item` | refused: broken link |
| R6 | comment inserted at the start of a wrapper body, all digests rebound | `Set-PackageFileAndRebind` | refused: executable body digest |
| R7 | ledger token rewritten, all digests rebound | `Set-PackageFileAndRebind` | refused: not the approved template |
| R8 | text appended after `commit;`, all digests rebound | `Set-PackageFileAndRebind` | refused: not the approved template |
| R9 | pristine package copy | `Test-ClashPackageIntegrity` | accepted (positive control) |
| R10 | phase-status check dropped from a copy of the adapter | `rc02-phase-status` mutant | mutant accepts ⇒ the check is load-bearing |

## 7. Limitations that are unchanged

No signatures (digests are not authenticity). Duplicate JSON keys collapse under
`ConvertFrom-Json`. Crash/concurrency is exercised only through the two probed races
(snapshot race, junction escape). The seal is LF-normalised and carries the declared
byte length. The chain assumes the runner's phase order — it is a check on the
runner's protocol, not a substitute for it. Syntax evidence is the 5.1 parser
(lexer + tree-sitter locally + the CI parse step), not a `powershell -File` run of
`deploy.ps1` against a database. Reparse-point and race cases are only meaningful on
Windows.

## 8. Residual risks introduced or exposed by this round

1. **The phase-rank map is a closed vocabulary.** A receipt name the map does not
   know is refused (fail closed). Adding a new receipt name to the runner therefore
   requires adding a band; the failure mode is a loud refusal, never a silent pass.
2. **Every `*.json` under the run root is treated as a receipt.** Dropping an
   unrelated JSON file into a run directory makes the chain refuse the run. This is
   deliberate (an unexplained file in an evidence directory is not evidence) but it
   is a behaviour change for anyone who parks JSON there.
3. **The chain does not authenticate.** It proves internal consistency and ordering
   of the run's receipts; it cannot prove the receipts were written by the runner.
4. **`deploy.ps1` is still unexecuted.** The hashing contract, the applied-receipt
   location and the chain rules are enforced in code shared with the runner, and the
   runner's call sites were updated and parsed, but the end-to-end deployment path
   has only been exercised by the self-test fixture that now uses the real writer.

## 9. NOT ASSESSED

- Live database execution of any kind: `psql`, Supabase CLI, DNS, TLS, IPv4/IPv6,
  connection policy, hosted RLS, hosted Storage, migration application to a project.
- Whether the hosted project's actual schema matches the approved bodies (offline
  comparison only).
- Rollback/restore behaviour on a real failure.
- Any behaviour of the hosted platform, its quotas, or its logs.

## 10. What an independent auditor should attack next

1. Build a run with the real writer on 5.1 and try to make `Test-ClashDeploymentEvidence`
   accept a chain whose *content* is wrong but whose links are perfect — the chain is
   ordering, not truth.
2. Try to make `Get-ClashReceiptChain` accept two receipts with the same bytes in
   different directories (duplicate-content detection is digest-based).
3. Re-point the phase-rank map: write a `06-complete.json` before `03-migrations/*`
   and confirm the monotonicity rule refuses it, then confirm a *new* receipt name
   (not in the map) fails closed rather than being ranked last.
4. Attack the body extraction boundaries: a wrapper with two `\nbegin;\n` lines, a
   `\nbegin;\n` inside a string literal in the body, or a ledger insert marker inside
   the body text.
5. Re-run the whole thing on a runtime where `ConvertTo-Json` indentation differs and
   confirm nothing depends on formatting rather than bytes.

## 11. Non-claims

This round does not claim: that the release is deployable; that the 111 migrations
are correct against the live database; that the evidence format is complete; that a
green Windows run is an independent acceptance. It claims only that the four named
root causes now have a single implementation each, a fail-closed rule, and a
positive/negative test that executes on the shipped runtime — and that the previous
controls still pass.
