# CLASH Round 24 — review handoff

**Scope:** F1 (bare-CR SQL injection) and F2 (ineffective behavioural tests), plus the
P2 review items F3–F6. Round 21–23 corrections are preserved; no approved SQL body,
generated artifact or checksum content changed; no deployment, database, credentials
or infrastructure work.

> **Provenance note.** `audit-round23/ROUND23_INDEPENDENT_AUDIT_REPORT.md` is **not
> present in this checkout** (`ls audit-round23` → no such directory, and the path has
> never existed in this branch's history). F1 and F2 were fixed from the task
> description and reproduced independently (the reproduction is in §1). F3–F6 were
> reconstructed from the summary — *"especially missing-status handling and
> failure-receipt semantics; preserve valid STOPPED evidence"* — and each is resolved
> against a specific, executable check so Codex can map its own finding numbers onto
> the matrix in §4.

| | |
|---|---|
| Branch | `arena/6a50cae6-clash-app` (isolated; nothing else touched) |
| Base | Round 23 code `8af1b0973bb9282425d2bfa31392efb23dadef4a` |
| Code SHA | **`d76e0f1bda4b8a1043ad0afeb9c731d0ac42b71b`** |
| Windows CI | run [44097215787](https://github.com/Xcalibur-hub/clash-app/actions/runs/44097215787) — **17/17 steps success, windows-2022 / powershell.exe 5.1** |
| Adapter | `clash-native-adapter 5.6.0` (was 5.5.0) |
| Native cases | **162/162** (was 161) |
| Offline assertions | **531/531 in 29 sections** (was 529) — 530 identified + the count tripwire |
| Package | 111 manifest entries, 112 generated artifacts, 241 checksum lines — **0 files changed** (`git diff --name-only 8af1b09..d76e0f1 -- supabase/migrations supabase/cloud/generated` is empty) |

**Status: green locally and on the Windows runner. Nothing here is accepted, and no
offline acceptance or deployment readiness is claimed.**

---

## 1. F1 — the bare-CR injection, reproduced and closed

**Reproduction (before the fix, committed Round 23 code, Node validator):**

```
input:  "-- audit note\rselect 1;\n" + <wrapper 001>
verdict: []            ← admitted
line 0:  "-- audit note\rselect 1;"   ← one line to an LF splitter
```

PostgreSQL's lexer ends a `--` comment at **CR as well as LF** (`non_newline` is
`[^\n\r]`). The server therefore reads `-- audit note`, then executes `select 1;`,
then `begin;`. The Round 23 envelope split on LF *after* normalising CRLF, so the CR
stayed inside one line that began with `--`: the prefix rule saw a comment, the body
and tail were untouched, and only the digests needed rebinding. This is the same
class as C22-H1 and defeats it through a different character.

**The correction — one contract, five enforcement points.**

`Get-ClashCanonicalTextProblem` (adapter) / `canonicalTextProblem` (Node) states it
once:

* a CR is admissible **only** as the first half of a CRLF pair;
* the Unicode line separators **NEL (U+0085), LS (U+2028), PS (U+2029)** are
  unsupported and refused rather than guessed at;
* the check runs **before** normalisation, hashing and admission.

| enforcement point | what it holds to the contract |
|---|---|
| `Test-ClashPackageIntegrity` (the planner the runner, `check-manifest.ps1`, `run-tests.ps1` and CI all consume) | the wrapper, the **approved original** and the **executed source** |
| `Get-ClashWrapperEnvelopeProblem` | first rule, before any line-oriented reasoning |
| `Write-Evidence` (the single writer) | refuses bare-CR text and writes **nothing**; never emits evidence two readers could split differently |
| `Test-ClashReceiptInventory` (producer **and** consumer) | every receipt file in the run |
| `tests/verify-package.mjs` | every committed wrapper **and** every approved original, plus the validator's own controls |

**Controls executed on Windows PowerShell 5.1** — case
`wrapperEnvelopeRejectsBareCarriageControls`, all with coherently rebound digests
(wrapper digest, manifest entry, all 241 checksums):

| control | input | required verdict |
|---|---|---|
| `bare-cr-comment-injection` | `-- audit note<CR>select 1;<LF>` + wrapper (the F1 reproduction) | refused — *"bare carriage return"* |
| `bare-cr-inside-body` | `select 0;<CR>-- tail` inside the body | refused — *"bare carriage return"* |
| `bare-cr-after-commit` | `<CR>select 2;` after `commit;` | refused — *"bare carriage return"* |
| `exotic-line-separator` | `-- note<U+2028>select 1;` | refused — *"unsupported line separator"* |
| `lf-control` | pristine wrapper (LF) | **accepted** |
| `crlf-control` | the same wrapper with every line ending converted to CRLF | **accepted** |
| writer, bare CR | `Write-Evidence` with `"ok<CR>bad<LF>"` | refused, **no file created** |
| writer, LF | `Write-Evidence` with `"ok<LF>bad<LF>"` | accepted, file created |

The two accepting controls matter: the contract rejects *bare* CR and unsupported
separators, not CRLF checkouts — a Windows checkout still verifies.

**Node controls (executable, same function the package check uses):** bare CR behind
a comment rejected; bare CR in the body rejected; CRLF form accepted; U+2028 rejected;
plus a package-wide assertion that all 111 wrappers and all 111 approved originals
are canonical LF text.

## 2. F2 — behaviour instead of source text

**Removed.** The four Round 23 assertions that asserted *strings* existed in the
adapter (`Round 23: the planner verifies the wrapper envelope…`, `…a receipt the
protocol does not declare is refused`, `…every receipt must carry the status its type
allows`, `…applied and claim-ownership receipts are validated…`). They could pass
while the behaviour was gone.

**Added — executable positive/negative tests against the real validators:**

* Node: the five checks in §1 (real `wrapperEnvelopeProblems`, real package files).
* PowerShell 5.1: `wrapperEnvelopeRejectsBareCarriageControls` (8 controls, §1) and
  `completionRejectsUnapprovedAndContradictoryEvidence` (six invalid runs plus its
  positive control, §4).

**Added — behaviour mutations that preserve every source literal.** Each mutant keeps
the message strings exactly as shipped and changes only the guard, so any test that
merely looked for the text would still pass:

| mutant | literal preserved | guard changed | the harness must find |
|---|---|---|---|
| `r24-cr-guard` | the bare-CR message | `if ($canonicalProblem.Length -gt 0) { return … }` → `if ($false) { … }` | the F1 injection becomes admissible |
| `r24-prefix-guard` | the executable-prefix message | `if ($line -match '^[ \t]*--') { continue }` → `if ($true) { continue }` | a `select 1;` prefix becomes admissible |
| `r24-inventory-guard` | the undeclared-receipt message | `if ($declared -ccontains $rel) { continue }` → `if ($true) { continue }` | an undeclared `04-unexpected.json` becomes admissible |
| `r24-applied-status` | the applied-status message | `if (($appliedStatus.Length -gt 0) -and ($appliedStatus -cne 'PASS'))` → `if ($false)` | a FAIL applied receipt becomes admissible |

The mutation harness now runs **ten** mutants (six RC01–RC11 guards + four Round 24
admission guards) and requires every one to be *accepted only after its guard is
removed*; the case asserts `$rcMutants.Count -eq 10` and `$rcMutantResults.Count -eq
10`. The suite's `Round 24` assertion checks the four literals are present in the
harness, that the count is ten, and that the mutant names never appear in the shipped
adapter.

## 3. F3/F4 — missing status and failure-receipt semantics

**F3 (missing status).** `Test-ClashReceiptSemantics` skipped any receipt without a
`status` field — so "no status" meant "nothing to contradict". It is now a refusal:
*"{receipt} declares no status; a run receipt must state the outcome it records, and
an absent status is not a success"*. Exercised by the new attack
`declared-receipt-without-status` in `completionRejectsUnapprovedAndContradictoryEvidence`
(a declared `03b-schema.json` with an `observed` field and no status, coherently
linked): refused by the producer and, had it been published, by the consumer.

**F4 (failure receipts; preserve valid STOPPED evidence).** A failure receipt may not
coexist with an accepted COMPLETE: `FAIL`, `STOP`, `STOPPED`, `EXCEPTION`, `UNKNOWN`,
`UNPROVEN` are all refused by the semantic rule, and the terminal-failure names
(`*-failed.json`, `99-runner-exception.json`, `06-finalize-fail.json`,
`06-complete-unverified.json`, `STOP.json/.txt`) are additionally refused by the
existing terminal-evidence scan. **Valid STOPPED evidence is preserved, not cleaned
up:** a refused finalization still writes `06-finalize-fail.json` with
`status = STOPPED`, `claimReleased = true`, `rollbackImplied = false`,
`completionMarkerWritten = false`, no marker, and a consumer rejection — asserted by
case `completionTailDoesNotAnnounceOnSealFailure`, which still passes. Nothing in
this round deletes or rewrites a receipt.

## 4. F1–F6 resolution matrix

| # | finding (as given) | resolution | executable evidence |
|---|---|---|---|
| **F1** | bare-CR SQL injection passes both envelope validators (HIGH) | one canonical text contract, enforced by planner, envelope, writer, inventory and Node validator, before normalisation/hashing/admission | case `wrapperEnvelopeRejectsBareCarriageControls` (8 controls) + 5 Node checks + mutant `r24-cr-guard` |
| **F2** | Round 23 tests assert source text, not behaviour | four source probes deleted; executable Node controls, two real-validator PS cases, four literal-preserving behaviour mutants (10 mutants total) | suite §"Round 24 (F2)" assertion; `rcMutants.Count -eq 10`; each mutant detected |
| **F3** | missing-status handling | absent `status` is refused | attack `declared-receipt-without-status` |
| **F4** | failure-receipt semantics | failure statuses refused beside COMPLETE; STOPPED evidence preserved and consumed as a refusal | case `completionTailDoesNotAnnounceOnSealFailure` (unchanged, passing); `06-finalize-fail` handling |
| **F5** | *(report not available; mapped to the demonstrated admission risks)* duplicated guard on one field made a mutation control inconclusive | one guard per rule: the generic status rule skips the seven types a dedicated validator owns | `rc02-phase-status` mutant is conclusive again (10/10 detected) |
| **F6** | *(report not available; mapped to the same class)* an admission decision rested only on a filename pattern | closed inventory (path) **and** semantic contract (content) **and** canonical text (encoding) are independent, and each has its own failing control | attacks 1–6 of `completionRejectsUnapprovedAndContradictoryEvidence`; inventory/semantics messages in the CI annotations |

**Explicitly not claimed:** I could not read the audit report, so F5 and F6 above are
my mapping of the two remaining demonstrable admission-risk classes named in the task
("missing-status handling and failure-receipt semantics" being F3/F4). If Codex's F5
or F6 is something else, it is not addressed here and should be re-reported.

## 5. Regression results (all executed on windows-2022 / powershell.exe 5.1)

| control | result |
|---|---|
| Round 23 C22-H1 controls (statement before `begin;`, after `commit;`, second `begin;`; comment prefix and pristine copy accepted) | PASS |
| Round 23 C22-M1 five invalid runs + missing-status sixth | PASS — producer refuses each; consumer too when a marker could exist |
| Round 21/22 C21-01/02/03 controls (hash round-trip, chain attacks, body/tail fidelity) | PASS |
| RC01–RC11 (fifteen cases) | PASS |
| Ten mutation controls (6 × RC + 4 × r24) | PASS — 10/10 detected |
| Assertion inventory (530 ids) and count tripwire | PASS — 531/531 |
| 111 originals, 112 generated artifacts, 241 checksums | **unchanged** (0 files differ from the Round 23 SHA) |

## 6. Residual risks

1. **The canonical contract is per-reader.** It is enforced wherever text is
   admitted; a future reader that normalises before validating would reintroduce the
   class. The contract is one function in each runtime, and the planner/writer/
   inventory all call it.
2. **Block comments (`/* */`) are not part of the envelope.** A `/* … */` before
   `begin;` is refused today because only blank and `--` lines are permitted, but a
   future relaxation would need a SQL-aware lexer, not a line rule.
3. **`Write-Evidence` now refuses bare-CR text outright.** A psql capture that
   contained a lone CR would stop the run instead of being written. That is
   deliberate (fail closed) and is new behaviour for a real deployment.
4. **Closed vocabulary maintenance** (Round 23) and **receipts owned elsewhere** must
   be kept in step with the runner; both fail closed.
5. Unchanged: no signatures; duplicate JSON keys collapse; the chain assumes runner
   order; no hosted execution.

## 7. NOT ASSESSED

Live database execution of any kind (`psql`, Supabase CLI, DNS, TLS, IPv4/IPv6,
connection policy, hosted RLS/Storage, migration application), live-schema equality,
rollback, power-loss durability, concurrency beyond the two probed races, and
authenticity (hashes are not signatures). **No offline acceptance and no deployment
readiness is claimed.**

## 8. Reproduction

```
# canonical contract, both runtimes
node supabase/cloud/tests/verify-package.mjs            # 531/531, exit 0, empty stderr
powershell.exe -NoProfile -File supabase/cloud/tools/test-native-capture.ps1 \
    -OutFile <dir>\adapter-selftest.json                 # 162/162, adapter 5.6.0

# the F1 injection, by hand
python - <<'PY'
data = open('supabase/cloud/generated/001_20260926120000.sql','rb').read()
open('/tmp/f1.sql','wb').write(b"-- audit note\rselect 1;\n" + data)
PY
# planner: refused with "bare carriage return"; replace \r by \r\n: accepted
```

## 9. Non-claims

This round does not claim the release is deployable, that the migrations are correct
against a live database, that the evidence format covers every future runner change,
or that a green Windows run is an independent acceptance. It claims that the
demonstrated bare-CR injection is closed in both runtimes at five enforcement points
with executable controls on each side, that the Round 23 source-text checks are
replaced by behaviour with four literal-preserving mutants, that a receipt without a
status is now refused, and that every previously passing control still executes.
