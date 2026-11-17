# CLASH Round 21 — review handoff

**Scope:** close the Round 20 review findings in one bounded correction. No new
validation architecture, no generalized state machine, no runner rewrite. The 111
original migrations, the 112 generated SQL artifacts and their bodies, and every
previous evidence directory are untouched.

| | |
|---|---|
| Branch | `arena/6a50cae6-clash-app` |
| Base | Round 20 handoff `71b1a1b8251fec60d3c5df42914457663c5e82cc` (reviewed code `72f89bd`) |
| Code state | commit on this branch, see `git log` (the handoff file itself is the last commit) |
| Windows CI | run [44059800181](https://github.com/Xcalibur-hub/clash-app/actions/runs/44059800181) — **17/17 steps, windows-2022 / powershell.exe 5.1** |
| Adapter | `clash-native-adapter 5.3.0` (was 5.2.0) |
| Native cases | **156/156** (was 150) |
| Offline assertions | **514/514 in 29 sections** (was 496) — 513 identified + the count tripwire |
| Package | 111 manifest entries, 241 checksummed files (111 originals + 130 package files) |

**Status: green locally and on the GitHub Windows runner. Nothing here is
accepted.** This is a submission for independent audit, not an acceptance, and it
makes no claim that the release is cloud-ready. `deploy.ps1` has never been run
against a live database in this round.

---

## 1. Approved-inventory trust model (R20-H1 / RC02)

The Round 20 defect: the producer and the consumer each decided "does this run look
complete?" from the run's own receipts. A 111-migration set that was internally
consistent — every digest correct, every seal intact, every chain link valid — was
accepted even when it did not describe the approved package. Self-consistency was
the whole requirement.

The contract is now:

- **One source of truth.** `supabase/cloud/manifest.json` (111 entries, 15 fields
  each) is read once, by `Get-ClashApprovedInventory`, and turned into the expected
  inventory: ordinal, version, name, mode, normalisation, ledger name, wrapper path,
  original/executed/normalised/wrapper digests, declared byte length, expected ledger
  token, and the receipt name `03-migrations/<NNN>-<version>.json` derived from the
  ordinal and version.
- **The manifest is validated as an input**, not trusted blindly: `project_ref`
  (20 chars), `source_commit` (40 hex), `total` == entries, ordered and gapless
  indices, 14-digit versions, `mode ∈ {direct, diverged}`,
  `normalisation ∈ {none, strip-begin-commit}`, `wrapperPath == <NNN>_<version>.sql`,
  four 64-hex digests per entry, positive integer `bytes`, unique versions, unique
  ledger names, and — for a **direct** migration — the ledger name equals the
  migration name (the one diverged migration legitimately differs).
- **The evidence directory is never an input to the expectation.** It is only ever
  the thing being judged. A receipt may not name itself into the expected set.
- **Producer.** `deploy.ps1` reads the inventory *after* the integrity gate, refuses
  to start when it is invalid or when its count disagrees with the gate's entry count
  (`01-approved-inventory.json`), records it as `01b-approved.json`, and passes the
  same object to `Publish-ClashCompletion`. `wrappersChecked` in `01-integrity.json`
  must equal the approved count.
- **Consumer.** `Test-ClashDeploymentEvidence -Approved|-ManifestPath` (and therefore
  `Test-ClashRunCompletion`) requires, against that inventory: baseline
  `projectRef` == approved project, 40-hex `repoHead`, full adapter certification
  (`casesExecuted` == the declared self-test inventory, `adapterVersion` == the
  running adapter), one receipt per approved ordinal at the derived name carrying the
  approved version/mode/ledger name/normalisation/executed digest/wrapper digest/
  wrapper path/ledger token/original digest, leaf name and ordinal agreement, no
  duplicate index or version, an unbroken predecessor chain over the *previous
  approved receipt's* on-disk digest (`-applied` variant accepted), no receipt the
  inventory does not name, no forbidden terminal evidence (`STOP.json`, `STOP.txt`,
  `*-failed.json`, `*-unproven.json`, `*-mismatch.json`, `*-digest*.json`,
  `06-finalize-fail.json`, `99-runner-exception.json`, `06-complete-unverified.json`),
  and receipt count == approved count == declared count.
- **Fail closed.** A receipt that cannot be evaluated is a recorded refusal, not an
  exception that escapes into a caller that only asked "may this run be considered
  complete?".

### Before / after (sanitised reproductions)

| Attack on a self-consistent 111-migration set | Round 20 | Round 21 |
|---|---|---|
| Add a sealed `03-migrations/999-stop.json` | accepted | refused: receipt is not in the approved inventory |
| Swap an interior receipt's `prevReceiptSha` for another valid-looking digest | accepted | refused: chains from a digest that is neither the receipt nor the applied receipt of the previous approved migration |
| Rebind `wrapperSha256` and every digest so the set stays consistent | accepted | refused: wrapperSha256 is not the approved value |
| Replace the version of one receipt | accepted | refused: version is not the approved value |
| Rename a receipt so the set still has 111 files | accepted | refused: no receipt for that ordinal + extra receipt |
| Point the run at a different project | accepted | refused: baseline projectRef is not the approved project ref |
| Declare 110 wrappers checked while shipping 111 receipts | accepted | refused: wrappersChecked is not the approved count |
| Drop the adapter's certification from the baseline | accepted | refused: adapter is not the object the contract requires |

---

## 2. Findings matrix

| Finding | Fix | Proof (executed, not prose) |
|---|---|---|
| **R20-H1 / RC02** self-consistent evidence accepted | approved-inventory contract, producer + consumer (§1) | native `approvedInventoryIsTheOnlySourceOfExpectedMigrations` (5 mutated manifests, 4 attacks on the real inventory, ordering/receipt-name/`manifestSha256` shape), `completionRejectsSelfConsistentButUnapprovedEvidence` (7 field attacks + 1 extra sealed STOPPED receipt), `deploymentEvidenceRequiresEveryMigration`, `deploymentEvidenceRejectsContradictoryCounters`, `completionSuccessPublishesVerifiedMarker` |
| **RC08 / M1** hash-then-execute race on SQL inputs | `New-VerifiedSqlSnapshot` opens the denying-share handle **first** and hashes through it (`Get-NormalizedSha256FromStream`); `Invoke-LockedSqlInput` executes the snapshot and refuses any SQL file without an approved checksum entry | native `sqlSnapshotIsLockedBeforeItIsHashed`: a real `powershell.exe` child is DENIED a write and DENIED a replace while the handle is held, the digest read through the handle still equals the approved digest, and the same child write SUCCEEDS after release (positive control). Probes `preflightValidReportAdvancesToLedgerGate`, `verificationReportsProceedToComplete` prove the gate still executes the approved source. |
| **RC06 / M2** reparse-point escape | `Test-ClashReparseFreePath` / `Get-ClashReparsePointFindings`: containment is decided by walking real file objects, not by string prefixes; the sealer refuses to seal a tree that holds a redirect, and the verifier reports one | native `reparsePointsCannotRedirectEvidence`: a real junction inside the evidence root really does read an outside file, `Resolve-ClashContainedPath` refuses with "reparse point", `Seal-Evidence` throws, and the same tree seals cleanly once the junction is removed |
| **RC09 / M3** a count is not an inventory | every assertion has a stable slug identifier; the expected set lives in `tests/assertion-inventory.txt` (513 ids); the suite compares ids (missing / duplicated / unlisted / anonymous) and `tools/run-tests.ps1` recomputes the file's digest independently and refuses a run whose announced digest or counts differ | native: none needed (suite-side). Suite: 6 hand-built equal-total controls (deletion, deletion+duplication, substitution, invention, anonymous), plus a **real child process** that renames one assertion in a throwaway package copy, rebinds that copy's own checksums, and must still fail — `package integrity: PASS`, `assertion inventory: FAIL (missing + unlisted)` |
| **RC03 / M4** wrapper body fidelity | `Test-ClashPackageIntegrity` re-derives each wrapper's normalised body, compares it with the declared byte length, `normalizedSha256`, `executedSha256` (when `normalisation == none`), requires the wrapper text to *contain* that body, and requires the approved ledger name as a literal. Deploy gate and package checker share this planner | native `packageFidelityBindsEveryWrapperToItsOriginal`: wrapper body mutated, ledger identity mutated, declared length mutated — each with every digest rebound — all three refused; positive control accepts the untouched copy. Native `mutatedValidatorIsDetectedByTheSuite` proves the check is not decorative: 6 mutants, 6 detected. |
| **RC01 residual** nested `problems` | receipt `problems` must be a JSON array of non-empty strings; `[[]]`, `[[],[]]`, `[{}]`, `[1]`, `["   "]`, `"none"` refused | native `certificationProblemsMustBePlainStrings` (8 shapes, 6 refusals + 2 accepts) |
| **Protocol doc** marker = commit point | README states that publishing `06-complete.json` is the application-level commit point, that process exit, evidence completion and filesystem durability are three different things, and that the marker is not part of the seal | suite section 18 documentation claims; native `completionTailAnnouncesOnlyAfterMarker` |

---

## 3. What the Windows runner changed (this round's real value)

The first Windows runs were not green, and every failure was a real defect in the
new code or in a fixture that had stopped being faithful to the producer:

1. `Test-ClashDeploymentEvidence` returned `migrationCount` from `$names`, a variable
   that only exists in `Get-ClashMigrationReceiptNames`. Under the harness's
   StrictMode that was a terminating error which escaped `Test-ClashRunCompletion`
   and aborted the harness at case 92/156.
2. `Get-ClashApprovedInventory` derived the implicit manifest as
   `<cloud>/tools/manifest.json` — `$PSScriptRoot` of the adapter is `tools/lib`, so
   the manifest beside it is two levels up. Every implicit call therefore reported
   "the approved package manifest is missing" while the real manifest sat one
   directory higher.
3. `Publish-ClashCompletion` re-verified its own marker with
   `Test-ClashRunCompletion -RunPath $Root`, dropping the `-Approved` inventory the
   caller supplied — the producer certified its output against a different contract
   than the one it was invoked with.
4. The inventory derived `ledgerName` as `version_name`, but the manifest records the
   ledger's `name` column value (`initial_arena_schema`). The rule rejected the real
   package and accepted a fabricated one.
5. The fidelity planner compared a declared byte length (LF-normalised, as
   `build-package.mjs` computes it) with the raw on-disk length, so a CRLF checkout
   made all 111 originals look tampered — and hid the mutant the mutation test exists
   to catch.
6. Fixtures that had stopped being faithful: the first migration receipt in the
   finalization fixture had no `prevReceiptSha` (the runner's `Add-Receipt` always
   writes one, `GENESIS` when there is nothing to chain from); two fixtures rewrote
   files with `Write-Evidence`, which is an **exclusive create** by design; a race
   child printed `MOVED` after a *non-terminating* `Move-Item` failure; two gate-2
   expectations still used the pre-Round-21 filter wording, and one expected
   `wrappersChecked is 5` where the verdict renders `number 5`.

All six were caught by execution on PowerShell 5.1, not by reading the diff.

---

## 4. New native cases (151–156)

| # | Case | Controls |
|---|---|---|
| 151 | `approvedInventoryIsTheOnlySourceOfExpectedMigrations` | 5 mutated manifests (duplicate version, foreign wrapper, total mismatch, foreign ledger, missing executed digest) + the real manifest must be accepted with 111 ordered entries and derived receipt names |
| 152 | `completionRejectsSelfConsistentButUnapprovedEvidence` | 7 attacks (wrapper digest, executed digest, ledger token, foreign version, broken predecessor, foreign project, reduced adapter proof) + an extra sealed `03-migrations/999-stop.json`; positive control before the attacks |
| 153 | `sqlSnapshotIsLockedBeforeItIsHashed` | real child process denied write **and** replace while the handle lives; digest read through the handle unchanged; the same child write succeeds after release |
| 154 | `reparsePointsCannotRedirectEvidence` | real junction reads an outside file; resolution refuses; sealing throws; the clean tree seals |
| 155 | `certificationProblemsMustBePlainStrings` | 8 `problems` shapes, 6 must be refused, `[]` and `["a real problem"]` in the validator's hands |
| 156 | `packageFidelityBindsEveryWrapperToItsOriginal` | wrapper body, ledger identity and declared length mutated with every digest rebound; positive control on the untouched copy |

Mutation results (`mutatedValidatorIsDetectedByTheSuite`): `rc01-loose-boolean`,
`rc01-array-comparison`, `rc02-phase-status`, `rc03-membership`, `rc05-actual-cell`,
`rc06-parent-segment` — 6/6 detected.

Assertion-inventory controls (suite): deletion, deletion + duplication at equal
totals, substitution at equal totals, invention, anonymous — 5/5 refused, faithful
set accepted; plus the child-process equal-total substitution described above.

---

## 5. Residual risks and limitations (unchanged and new)

- **No signatures.** Every proof is a digest chain; an attacker with write access to
  the whole evidence directory and the manifest can still forge a consistent set.
- **Duplicate JSON keys collapse** before validation (PowerShell and `JSON.parse`
  both keep the last one).
- **Crash/concurrency:** two child-process races are exercised (snapshot write and
  replace). A crash between `Seal-Evidence` and the marker commit is argued from the
  protocol order, not injected.
- **The seal is LF-normalised**, as is the declared byte length; a checkout that
  rewrites line endings is not treated as tampering. That is deliberate and now
  consistent, but it means "bytes on disk" means "normalised bytes".
- **`deploy.ps1` has never run against a live database.** psql behaviour, CLI
  compatibility, DNS, TLS and IPv4/IPv6 fallback are **NOT ASSESSED**.
- The strict report framing rejects any psql output it does not model; that is
  intended, but it has only been exercised against fixtures, not a real server.
- **Syntax evidence** is the package's own lexer plus a tree-sitter parse of every
  script, and a real 5.1 parser pass in CI — not a `powershell -File` execution of
  `deploy.ps1`.
- The reparse and race cases only mean something on Windows, in disposable
  audit-owned directories; they are skipped nowhere, they simply cannot run on POSIX.
- The assertion inventory does not include the count tripwire itself (it runs after
  the inventory block); a separate inventoried source assertion
  ("the assertion-count tripwire is present and counts itself") fails if the tripwire
  is deleted, so the tripwire is guarded by an assertion that *is* in the inventory.
- The harness fixtures are now faithful to the producer's own helpers
  (`Add-Receipt` chain, exclusive evidence writes). A fixture that stops matching the
  producer is a fixture bug that the runner will surface as a refusal — as it did
  five times in this round.

---

## 6. What an independent auditor should attack next

1. Forge a receipt set that satisfies every approved field but is produced against a
   *different but approved-looking* manifest — the trust anchor is still the checked-in
   manifest file, not a signature.
2. Replay: take the Round 19/20 evidence from `evidence/` and ask both halves to judge
   it against the approved inventory. (Append-only evidence; do not rewrite it.)
3. Concurrency beyond the two probed races: replace the snapshot between `Flush` and
   the lock, and between the lock and `psql`'s open.
4. `problems` schema: any shape that a receipt can carry and both halves still ignore.
5. The mutation list: add mutants for R20-M4's body-contains rule and R20-H1's
   predecessor link, and confirm each is detected.

---

## 7. Non-claims

- No acceptance is claimed by this document or by the code.
- No claim that the deployment protocol is cloud-ready, or that any hosted database,
  CLI, DNS, TLS or network path behaves as modelled.
- No claim that the test suite is complete; it is a refutation record with the
  limitations listed in §5.
