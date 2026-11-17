# Round 20 - GitHub Review Handoff

**This is a review package, not an acceptance.** Nothing here is offered as an
independent verdict: the checks below were designed and run by the author of the
change, and they prove properties of *files on disk*, not of a deployed database.
External review is requested and expected to be adversarial.

| | |
|---|---|
| Repository | `Xcalibur-hub/clash-app` |
| Branch | `arena/6a50cae6-clash-app` |
| Code under review | `72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8` |
| Base (Round 19, previously green) | `c265eae81a504f249239dd3fbb1c5e07319488ee` |
| CI run (14/14 steps) | [44037376058](https://github.com/Xcalibur-hub/clash-app/actions/runs/44037376058) |
| Runtime | Windows PowerShell `5.1.20348.5773` (never `pwsh`), Node as a native child |
| Adapter | `clash-native-adapter 5.2.0` |
| Executed native cases | **150 / 150** |
| Offline assertions | **496 / 496** in 29 sections |
| Manifest | `status=PASS`, 111 entries, 240 checksummed files |
| Database touched | **no** (no connection, no credential, no hosted SQL) |

---

## 1. Verify it yourself (no credentials, no network, no database)

```bash
git fetch origin
git checkout 72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8
cd supabase/cloud
node tests/verify-package.mjs          # 496 assertions, 29 sections
```

On Windows PowerShell 5.1 (the declared runtime):

```
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
  -File supabase/cloud/tools/test-native-capture.ps1 -OutFile <dir>\adapter-selftest.json
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
  -File supabase/cloud/tools/check-manifest.ps1
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
  -File supabase/cloud/tools/run-tests.ps1
```

These are the same three commands the workflow runs (steps 8, 10, 11). Every
fixture the cases build is created under the system temp directory at run time
and removed afterwards; receipts go to `supabase/cloud/evidence/` and
`supabase/cloud/evidence-adapter/`, both git-ignored, both refusing to overwrite.

**Sanitisation.** This document and the fixtures contain no credentials, no
project references, no hostnames, no local user paths and no customer data. Run
directories are referenced as `<run-dir>`; the only absolute paths in the
executed output are temp directories that the harness itself creates and deletes.

---

## 2. Changed-file inventory

Compare: [`c265eae` ... `72f89bd`](https://github.com/Xcalibur-hub/clash-app/compare/c265eae81a504f249239dd3fbb1c5e07319488ee...72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8)
(9 files, +2490 / -264, 18 commits)

| File | Delta | What changed | Link |
|---|---|---|---|
| .github/workflows/windows-offline-validation.yml | +15 / -15 | pins 150 native cases, 496 assertions, adapter 5.2.0; step 8-13 verify receipts with the package's own gates | [view](https://github.com/Xcalibur-hub/clash-app/blob/72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8/.github/workflows/windows-offline-validation.yml) |
| supabase/cloud/README.md | +102 / -4 | RC01-RC11 matrix (section 1r) and the verification record + residual risks (section 1r-bis) | [view](https://github.com/Xcalibur-hub/clash-app/blob/72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8/supabase/cloud/README.md) |
| supabase/cloud/checksums.sha256 | 7 lines | rebound digests; the file list itself is unchanged (240 entries) | [view](https://github.com/Xcalibur-hub/clash-app/blob/72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8/supabase/cloud/checksums.sha256) |
| supabase/cloud/tests/verify-package.mjs | +223 / -21 | section 29 (RC01-RC11 assertions) plus two structural scans: a command used as a bare `-and` operand, and a root verdict assigned to a typed `$Root` | [view](https://github.com/Xcalibur-hub/clash-app/blob/72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8/supabase/cloud/tests/verify-package.mjs) |
| supabase/cloud/tools/check-manifest.ps1 | +26 / -69 | delegates the whole verdict to `Test-ClashPackageIntegrity`; its own loop is gone | [view](https://github.com/Xcalibur-hub/clash-app/blob/72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8/supabase/cloud/tools/check-manifest.ps1) |
| supabase/cloud/tools/deploy.ps1 | +94 / -89 | gate 0 requires a proven capture; package integrity is one call; completion is one call to `Publish-ClashCompletion`; the RC04 block is delimited so the executed case runs the real code | [view](https://github.com/Xcalibur-hub/clash-app/blob/72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8/supabase/cloud/tools/deploy.ps1) |
| supabase/cloud/tools/lib/clash-native.ps1 | +1186 / -29 | the single implementations: typed JSON boundary, contained paths, seal enumeration, deployment evidence, package integrity, completion producer/consumer, suite summary | [view](https://github.com/Xcalibur-hub/clash-app/blob/72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8/supabase/cloud/tools/lib/clash-native.ps1) |
| supabase/cloud/tools/run-tests.ps1 | +11 / -12 | the suite summary is parsed by `Test-ClashSuiteSummary`, not by string surgery | [view](https://github.com/Xcalibur-hub/clash-app/blob/72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8/supabase/cloud/tools/run-tests.ps1) |
| supabase/cloud/tools/test-native-capture.ps1 | +826 / -18 | cases 135-150 (the audit reproductions), the mutation harness, and stack capture for every probe refusal | [view](https://github.com/Xcalibur-hub/clash-app/blob/72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8/supabase/cloud/tools/test-native-capture.ps1) |

Untouched on purpose: `supabase/migrations/` (111 originals, byte-identical to
the manifest), `supabase/cloud/manifest.json`, `preflight/`, `verify/`,
`generated/`. No protected file was modified and no earlier evidence was
rewritten - evidence directories are append-only and refuse overwrite.

### 2.1 Commits

| Commit | Subject |
|---|---|
| `7c39e4b` | systemic validation (RC01-RC11) |
| `0e4f55a` | a refused finalization is a recorded failure, not a crash |
| `49607f0` | an EXCEPTION receipt carries what was already discovered |
| `20ab50e` | a refusal names each problem and its length |
| `8480213` | every evidence problem names the document it came from |
| `b075042` | the root verdict is reported with its state and kind |
| `d1cfc01` | a root verdict is never assigned to a typed `$Root` parameter |
| `1b3c488` | a refused publish reports the call that refused |
| `e968ee2` | the `timedOut` check must not hand `-and` to a command |
| `640c8a6` | seal entry paths use the package's forward-slash form |
| `9e12701` | the finalization intent declares what the RUN requires |
| `67b5a77` | a declared evidence entry is a relative path, not a leaf name |
| `266515f` | the tail probe defines every variable the committed region reads |
| `3bffd16` | every RC01 rejection is asserted by REASON, not by field order |
| `0dfe28a` | the verification record, and what a green run does not mean |
| `80e5c73` | cite the green run of the document too, not only of the code |
| `f104145` | the new prose is pure ASCII, like every script in the package |
| `72f89bd` | the record states how it is verified, not only that it was |

The first commit is the repair. The other seventeen are what the **runtime**
found in the repair: each is a defect class re-appearing in the new code, and
they are listed in section 5 because they are the strongest available evidence
that the classes - not just the reproductions - were addressed.

---

## 3. RC01-RC11: before and after

Every row names one implementation. "Before" is the behaviour the audit
demonstrated on `c265eae`; "After" is the single place the question is now
answered, and the executed case that pins it.

| ID | Class | Before | After (one implementation) | Where | Executed proof |
|---|---|---|---|---|---|
| RC01 | a case record was read by truthiness, `-ne`, casts | `[false,true]` certified because `-ne` on an array *filters*; `"true"`, `1`, `1.0` and a missing key all survived | present -> kind must be JSON `boolean` -> value must be `$true`; the receipt validator and the harness inventory call the same reader | `lib:3631` `Get-ClashCasePassedProblem`, consumer `lib:3766`, harness `harness:243` | `casePassedRequiresJsonBooleanTrue` (14 spellings, 4 distinct refusal reasons) |
| RC02 | completion authorised by counting files; deployment evidence never a contract | a `status: FAIL` phase, a rolled-back migration receipt, or an absent receipt still completed | `Test-ClashDeploymentEvidence` names six phase receipts plus every migration receipt; the producer runs it **before** writing the intent, the consumer runs it again on the published directory | `lib:1392`, producer `lib:2066` (evidence check at 2095-2130), consumer `lib:2306`, runner `deploy.ps1:855` | `deploymentEvidenceRejectsFailedPhase`, `...RejectsContradictoryCounters`, `...RequiresEveryMigration` (12 phase/receipt attacks + 6 counter attacks) |
| RC03 | three implementations of "is the package intact" | a tree consistent with itself but not with `manifest.json`, or with a checksum line deleted, satisfied all three | one planner consumed by runner, checker and tests; exact membership both ways; strict record grammar; manifest order/identity/wrappers | `lib:1735`, callers `check-manifest.ps1:45`, `deploy.ps1:296` | `packageIntegrityRejectsTamperedTree`, `...RejectsUnreadableChecksumLine`, `...RejectsManifestDrift` |
| RC04 | gate 0 trusted a capture that never ran | failed `git` and empty HEAD produced the same stop message; the job-level check read only the manifest | gate 0 requires a successful capture **and** `^[0-9a-f]{40}$`; the block is delimited so the case executes the real code | `deploy.ps1:248-266`, `lib:467` `Test-NativeSuccess` | `gateBaselineRequiresProvenGitCapture` (runs the delimited block) |
| RC05 | the psql report's `actual` cell was never checked | `POST /x -> 200` rendering `500` passed: only `expected` was compared with the SQL constant | the actual cell must equal the declared expectation, be an integer when the expectation is numeric, and be non-empty for `INFO` rows | `lib:2986` `Get-ClashReportActualProblem` | `reportActualCellMustSatisfyExpected` |
| RC06 | evidence paths were joined, not contained | `03-migrations/../../../x.json` and absolute paths wrote outside the run | every evidence path goes through one resolver: rejects `..`, absolute/UNC, `.`/empty segments, drive-relative and alternate streams; empty input is a **verdict**, not a binding error | `lib:865` `Resolve-ClashContainedPath` (`[AllowEmptyString()]` at 870) | `containedPathRejectsEscape` (11 spellings, incl. `..\escape.txt`, `C:\windows\x.txt`, `\\server\share\x`, `sub\ok.txt:stream`, `''`) |
| RC07 | exclusions compared base names | `-notcontains $_.Name` excluded every file called `02-preflight.json`, so a forged receipt planted in `03-migrations/` was invisible; hidden files were never enumerated | one candidate enumerator (`-File -Force`) shared by sealer and verifier with exact **relative-path** comparisons; the consumer compares declared evidence against the same enumeration | `lib:929`, used by `lib:945` and `lib:986`; consumer `lib:2510-2521` | `hiddenEvidenceIsSealedAndUnsealedDetected` |
| RC08 | the executed SQL was re-opened by pathname (TOCTOU) | gate 4 hashed a wrapper, then psql opened the same path | the bytes are copied to a `FileShare]::Read` snapshot inside the run, hashed there, executed from there; no hashed pathname is executed | `lib:1980`, `lib:2006` | `packageIntegrityRejectsTamperedTree` covers the copy source; suite assertion "the executed SQL is a locked snapshot" |
| RC09 | the suite summary was parsed by string surgery | `passed=467` in a header and `passed=1` on the summary line both "agreed"; `1.4` truncated to `1` | exactly one summary line, typed integers, `passed+failed=total`, agreement with the printed counts, and the launcher fails with the numbers it saw | `lib:1577` `Test-ClashSuiteSummary`, `run-tests.ps1:61` | `suiteSummaryRequiresTypedIntegers` |
| RC10 | seal metadata was compared as strings | `"bytes": "1234"` and `"sealedUtc": "yesterday"` passed depending on the path taken | seal entries carry typed `bytes` (JSON integer, compared with the real length) and a parseable `sealedUtc`; both sides are reported on mismatch | `lib:945` / `lib:986` | `sealEntriesAreContainedAndSized` (positive control + escaping entry + byte-delta entry) |
| RC11 | an object was read by one representation only | `Get-ClashProperty` handled `PSCustomObject` but not `IDictionary`, so a harness-built record could read as "missing" | one field reader returns `present`/`kind`/`value` explicitly and handles both representations; authority-reading code uses it, never `.PSObject.Properties` | `lib:154` `Get-ClashJsonField`, `lib:202` `Test-ClashJsonKind`, `lib:221` `Get-ClashJsonRoot` | `jsonFieldReadsBothObjectRepresentations`, `jsonFieldReportsExactJsonKinds`, `jsonFieldSeparatesMissingFromNull` |

Line numbers refer to `supabase/cloud/tools/lib/clash-native.ps1` (`lib`),
`supabase/cloud/tools/test-native-capture.ps1` (`harness`) and
`supabase/cloud/tools/deploy.ps1` at `72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8`.

---

## 4. Machine-readable test summary

```json
{
  "package": "supabase/cloud",
  "branch": "arena/6a50cae6-clash-app",
  "sha": "72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8",
  "base_sha": "c265eae81a504f249239dd3fbb1c5e07319488ee",
  "ci_run": 44037376058,
  "ci_url": "https://github.com/Xcalibur-hub/clash-app/actions/runs/44037376058",
  "runtime": "Windows PowerShell 5.1.20348.5773",
  "adapter": {"id": "clash-native-adapter", "version": "5.2.0"},
  "native_cases": {"executed": 150, "required": 150, "failed": 0, "verdict": "PASS"},
  "offline_suite": {"assertions": 496, "passed": 496, "failed": 0, "sections": 29, "machine_summary_agreed": true},
  "manifest": {"status": "PASS", "entries": 111, "checksum_files": 240, "problems": 0},
  "mutants": {"total": 6, "detected": 6, "missed": 0},
  "database_touched": false,
  "independent_review": "PENDING"
}
```

---

## 5. Evidence that the audit reproductions now fail safely

Two independent kinds of evidence.

**(a) The reproductions are executed, not asserted in prose.** Cases 135-150
drive the real validators with real artefacts: 14 non-boolean case records, 12
phase/receipt attacks, 6 counter attacks, 11 containment spellings, a hand-built
seal with an escaping entry and a false byte count, a tampered package tree, a
deleted checksum line, a drifted manifest, a summary line that disagrees with its
own counts, and both object representations of the same JSON document. Each case
requires the validator to refuse **and to say why** - a refusal with no reason
fails the case.

**(b) The runtime found nine more instances in the repair itself.** These are
listed because they are the argument that the classes were addressed, and because
they show the harness is strong enough to catch its own author:

| # | Found by | Class | What it was | Fix |
|---|---|---|---|---|
| 1 | case 144, bind error | RC11 | `$root = Get-ClashJsonRoot ...` assigned a *record* to a typed `[string]$Root`; the record stringified to `System.Collections.Hashtable` and every field read empty | the record keeps its own name (`$docRoot`, `$migRoot`); a suite assertion now fails on any `$root = Get-ClashJsonRoot` assignment |
| 2 | case 91, bind error | RC01/RC10 | `if (Test-ClashJsonKind ... -and $timedOut ...)` handed `-and` to the command as a parameter, so the check never ran | both operands parenthesised; a suite assertion fails on any command used as a bare `-and`/`-or` operand |
| 3 | case 76, seal miss | RC07 | seal entries kept the platform separator (`03-migrations\001-...`), so the required evidence `03-migrations/001-...` matched nothing | seal entry paths normalised to `/`, the form every other name in the package uses |
| 4 | case 76, bind error | RC06 | `Resolve-ClashContainedPath -Relative ''` raised a *binding* error: an empty path is a verdict to be reported, not a call to be refused | `[AllowEmptyString()]`; the empty path returns its problem like every other |
| 5 | case 76 | RC02 | the intent recorded the **caller's** required-evidence list, so a caller with six names and a run with three migration receipts published an intent the consumer had to reject - no run could ever be finalized | the declared set is derived from the run; a caller's names widen the check and are included, never substituted (`lib:2101`) |
| 6 | case 76 | RC07 | the consumer compared each declared evidence name with `$_.Name`, so every migration receipt looked absent | the same relative-path enumeration as the seal (`lib:2510-2521`) |
| 7 | case 83 | RC10 | the tail probe did not define `$entries`, which the committed region reads; under StrictMode the region aborted before announcing anything | the probe defines every variable the region reads |
| 8 | case 150 | - | the rc06 mutant was judged on `..\escape.txt`, which the containment check refuses as well, so deleting the parent-segment rule went **undetected** - a decorative mutation test | the fixture is `sub\..\ok.txt`, which resolves *inside* the root and is refused only by the `..` rule |
| 9 | case 135 | RC01 | the assertion pinned the wording of a branch that does not fire for a null record | the case asserts the four distinct reasons a record is refused, read from the union of the problem texts |

Item 8 deserves emphasis for the reviewer: the mutation test was green for a
check it did not actually test. It is fixed, but it is exactly the kind of
failure a human reviewer should look for in the remaining five mutants.

---

## 6. Executed tests

### 6.1 Native adapter cases - 150 / 150 on Windows PowerShell 5.1

Run by `tools/test-native-capture.ps1`, validated by `Assert-AdapterSelfTest`
(in the adapter library) and by the workflow's step 9. The inventory is checked
for flatness, uniqueness and exactness before any case runs, so a dropped or
extra case cannot pass.

- `zeroExitWithStderr`
- `nonZeroExit`
- `silentSuccess`
- `stderrIsDataNotFailure`
- `launchFailureIsUnknown`
- `timeoutIsUnknown`
- `refusesCredentialArguments`
- `sanitiserRedacts`
- `evidenceNeverOverwrites`
- `receiptFallsBackWhenPathUnwritable`
- `legacyPatternRaisesNativeCommandError`
- `legacyPatternLosesExitCode`
- `adapterSurvivesSameChild`
- `differentialProven`
- `unexpectedExceptionCannotPass`
- `droppedCaseFailsInventory`
- `nullDetailIsRecordedNotCrashed`
- `validatorRejectsTamperedReceipt`
- `ledgerGapIsProblem`
- `ledgerMalformedIsProblem`
- `receiptFailureStops`
- `connectionLossIsUnknown`
- `incompleteCaptureIsUnknown`
- `sqlStateExtracted`
- `ledgerParserRejectsMalformedOutput`
- `absentAndPresentBranchesRecordActualResult`
- `claimReleaseOwnedRowReleasesClaimOnly`
- `claimReleaseZeroRowsStops`
- `claimReleaseWrongOwnerStops`
- `claimReleaseMultipleRowsStops`
- `claimReleaseNonZeroExitStops`
- `claimReleaseTimeoutStops`
- `claimReleaseIncompleteCaptureStops`
- `verificationReportContractMatchesSql`
- `verificationReportsProceedToComplete`
- `postflightEmptyReportStops`
- `postflightFailedRowStops`
- `postflightTruncatedReportStops`
- `postflightDuplicateRowStops`
- `postflightMalformedRowStops`
- `postflightIdentityDriftStops`
- `postflightUnprovenStops`
- `storageEmptyReportStops`
- `storageFailedRowStops`
- `storageMissingInfoRowStops`
- `storageUnprovenStops`
- `reportEnvelopeAcceptedForBothVerifiers`
- `reportFooterCountMismatchStops`
- `reportMissingFooterStops`
- `reportMalformedFooterStops`
- `reportUnexpectedTrailerStops`
- `reportExtraJunkLineStops`
- `reportInvalidOrdinalAndStatusStops`
- `reportTruncatedMidRowStops`
- `reportStorageTrailerStops`
- `preflightValidReportAdvancesToLedgerGate`
- `preflightArbitrarySuffixTextStops`
- `preflightMissingCheckStops`
- `preflightDuplicateCheckStops`
- `preflightReorderedChecksStop`
- `preflightRenamedCheckStops`
- `preflightRenderedFailRowStops`
- `preflightTruncatedReportStops`
- `preflightPipeInsideCellIsNotAColumn`
- `preflightInfoOnlyReportStops`
- `preflightDelimiterReplacedStops`
- `preflightHeaderDelimiterReplacedStops`
- `postflightDelimiterReplacedStops`
- `storageDelimiterReplacedStops`
- `reportShiftedBoundaryStops`
- `reportUnpaddedRowStops`
- `reportPaddedShortCellsStillParse`
- `reportCrlfEnvelopeParses`
- `reportHeaderMisalignedToSeparatorStops`
- `reportEmbeddedPipeKeepsFraming`
- `completionSuccessPublishesVerifiedMarker`
- `completionMarkerExcludedFromSeal`
- `completionRefusesSecondFinalization`
- `completionRefusesDoubtMarker`
- `completionSealPublicationFailureLeavesNoMarker`
- `completionSealWriteFailureLeavesNoMarker`
- `completionTailDoesNotAnnounceOnSealFailure`
- `completionTailAnnouncesOnlyAfterMarker`
- `completionValidatorRejectsExceptionBesideMarker`
- `completionValidatorRejectsTamperedEvidence`
- `completionValidatorRejectsTruncatedSeal`
- `completionValidatorReportsUnreadableSeal`
- `completionValidatorRejectsUnsealedEvidence`
- `completionRefusesMissingRequiredEvidence`
- `completionIntentNeverClaimsComplete`
- `deployTailIsTheOnlyCompletionPath`
- `completionRejectsCodexChainMutation`
- `completionRejectsWrongPrevReceiptShaOnly`
- `completionRejectsWrongSealChainHeadOnly`
- `completionRejectsMissingIntent`
- `completionRejectsMisTypedMarker`
- `completionRejectsMalformedHashFields`
- `completionRejectsIntentChainBreak`
- `completionRejectsPostSealEvidenceLoss`
- `completionRejectsContradictoryWriterRunId`
- `completionRejectsUnknownSealName`
- `completionRejectsForeignAdapter`
- `jsonAccessorPreservesCollectionShape`
- `jsonFieldReportsExactJsonKinds`
- `jsonFieldSeparatesMissingFromNull`
- `completionRejectsProtocolSingletonArray`
- `completionRejectsProtocolEmptyArray`
- `completionRejectsProtocolMultiValueArray`
- `completionRejectsProtocolNestedArray`
- `completionRejectsProtocolObject`
- `completionRejectsProtocolNull`
- `completionRejectsArrayTypedMarkerFields`
- `completionRejectsArrayTypedSealBlockFields`
- `completionRejectsCollectionRootMarker`
- `evidenceSealRejectsNonArrayFiles`
- `evidenceSealRejectsStringFileCount`
- `evidenceSealRejectsArrayChainHead`
- `completionRejectsCollectionValuedIntent`
- `completionRejectsCollectionValuedClaimRelease`
- `selfTestReceiptRejectsCollectionValuedMetadata`
- `completionRejectsNullRootMarker`
- `completionRejectsEmptyRootMarker`
- `completionRejectsWhitespaceRootMarker`
- `completionRejectsArrayRootMarker`
- `completionRejectsScalarRootMarker`
- `completionRejectsMalformedRootMarker`
- `completionRejectsMissingRootMarker`
- `casePassedRequiresJsonBooleanTrue`
- `deploymentEvidenceRejectsFailedPhase`
- `deploymentEvidenceRejectsContradictoryCounters`
- `deploymentEvidenceRequiresEveryMigration`
- `packageIntegrityRejectsTamperedTree`
- `packageIntegrityRejectsUnreadableChecksumLine`
- `packageIntegrityRejectsManifestDrift`
- `gateBaselineRequiresProvenGitCapture`
- `reportActualCellMustSatisfyExpected`
- `containedPathRejectsEscape`
- `sealEntriesAreContainedAndSized`
- `hiddenEvidenceIsSealedAndUnsealedDetected`
- `jsonFieldReadsBothObjectRepresentations`
- `suiteSummaryRequiresTypedIntegers`
- `mutatedValidatorIsDetectedByTheSuite`
- `jsonRootStatesAreValidated`
- `completionAcceptsValidObjectRoot`
- `evidenceSealRejectsNullRoot`
- `evidenceSealRejectsEmptyRoot`
- `completionRejectsNullRootIntent`
- `completionRejectsNullRootClaimRelease`
- `selfTestReceiptRejectsInvalidRoot`
- `adapterSelfTestRejectsNullRootReceipt`

### 6.2 Offline package suite - 496 assertions in 29 sections

Run by `tools/run-tests.ps1`, which invokes Node as a native child through the
adapter (never `& node`), parses the machine summary with
`Test-ClashSuiteSummary`, and writes a receipt.

| # | Section |
|---|---|
| 1 | originals |
| 2 | file 13 divergence (F3) |
| 3 | wrappers (F1 atomicity, F2 begin/commit) |
| 4 | no Storage writes in the package (F4) |
| 5 | fail-closed gates (F6) |
| 6 | PowerShell hygiene - Round 2 (F2, F4, F5, F7) |
| 7 | checksums |
| 8 | failure injection - detectors must fire on corruption |
| 9 | structural checks (scaffolding lint + byte-level body fidelity) |
| 10 | PowerShell structural lint (lexer, not quote counting) |
| 11 | failure injection - Round 2 detectors must fire |
| 12 | cross-file function resolution |
| 13 | parameter-name resolution |
| 14 | package-test invocation contract (Round 3) |
| 15 | self-test integrity (Round 4) |
| 16 | inventory integrity (Round 5) |
| 17 | platform path handling (Round 6) |
| 18 | documentation claims match the package (Round 7) |
| 19 | deployment recovery safety - R1-R4 (Round 8) |
| 20 | fail-closed ledger parsing, branch safety, SQLSTATE (Round 9) |
| 21 | claim release: the committed block, executed (Round 10) |
| 22 | verification report contract (Round 12 / R11-C1) |
| 23 | report envelope - strict psql parsing (Round 13 / R12-C1) |
| 24 | gate 2 is a contract too (R13-C1) |
| 25 | the framing characters are part of the report (R14-C1) |
| 26 | completion finalization - one commit point (Round 16 / R15-C1) |
| 27 | the JSON type boundary (Round 18 / C17-C1) |
| 28 | document roots are validated, never assumed (Round 19 / C18-C1) |
| 29 | systemic validation boundary: RC01-RC11 (Round 20) |

Two of the 496 assertions were added this round as structural scans, because the
two worst runtime failures were *shapes*, not values:

- `no command invocation is used as a bare operand of -and/-or`
- `no validator shadows a typed parameter with a record (case-insensitive names)`

---

## 7. Mutation testing

Case 150 (`mutatedValidatorIsDetectedByTheSuite`) copies the adapter to a
temporary directory six times, deletes one real check per copy, and requires the
suite to **reject every mutant**. A check whose removal nothing notices is
decorative, and this is the only automated defence against that.

| Mutant | Check removed | Asked the question | Must be accepted by the mutant |
|---|---|---|---|
| `rc01-loose-boolean` | the `kind -cne 'boolean'` branch | 14 receipt spellings | yes (that is the point) |
| `rc01-array-comparison` | the `value -cne $true` branch | as above | yes |
| `rc02-phase-status` | `status -cne 'PASS'` | a phase receipt with `status: FAIL` | yes |
| `rc03-membership` | `-not $sumMap.ContainsKey($member)` | a package tree with one checksum line removed | yes |
| `rc05-actual-cell` | `$Actual -cne $Expected` | a report row whose actual cell is `X` | yes |
| `rc06-parent-segment` | `$segment -ceq '..'` | `sub\..\ok.txt` (resolves inside, refused only by `..`) | yes |

**Limitations, stated plainly.**

- Six mutants cover six checks, not the adapter. Coverage is by *class*, and
  there is no mutation score: 6/6 means these six removals are detected, not
  that the suite would detect an arbitrary weakening.
- Mutations are textual substitutions on a copy; a mutation that fails to apply
  is reported as "missed" rather than silently skipped, but a mutation that
  applies in the wrong place is not detected.
- The mutated adapter is executed by the harness in-process (`[scriptblock]`),
  so the mutation case proves the *validator*, not the shipped file; the shipped
  file is protected by the checksum and manifest gates instead.
- No mutants exist for the file-system commit protocol (RC08, seal atomicity):
  removing that check would require rewriting the runner, not deleting a branch.

---

## 8. Remaining security and deployment risks

Carried forward unchanged; none of them is closed by this round.

1. **No signatures.** The seal proves that a directory is *self-consistent*; it
   cannot prove authorship. A privileged writer can replace a complete,
   consistent artifact set - marker, seal, intent, receipts - and every check
   here will accept it.
2. **Duplicate JSON keys collapse.** `ConvertFrom-Json` keeps the last value, so
   a document that names a field twice is indistinguishable from one that names
   it once. A hostile document can therefore hide a value from a human reader.
3. **Crash and concurrency consistency are not exercised.** The commit protocol
   is exclusive-create plus atomic rename, proven against one process on one
   host. Power loss between rename and re-verification is reasoned about, not
   tested.
4. **Text normalisation.** The seal hashes LF-normalised content, so line-ending
   changes are invisible; a byte-exact seal is not implemented.
5. **`deploy.ps1` has never run against a database.** `psql` behaviour, the
   Supabase CLI, DNS/TLS, IPv4/IPv6 reachability and pooler behaviour are
   **NOT ASSESSED**. Everything proven here is proven against files.
6. **Strict framing rejects unmodelled psql output.** A client version that
   changes the aligned envelope stops the run. That is the intended trade, and
   it is also a deployment risk: a routine client upgrade requires a code change.
7. **Adapter syntax evidence** is the package lexer plus a tree-sitter parse,
   not `powershell -File` on every construct. The 150 runtime cases close that
   gap only for the paths they execute.

---

## 9. Unverified claims and required independent checks

Explicitly **not** claimed: that this package is correct, complete, secure, or
audit-clean. The following are the claims a reviewer should try to break.

| Claim | How it is asserted here | Independent check requested |
|---|---|---|
| exactly one implementation per question | function references and structural scans | grep for a second implementation of integrity / evidence / containment / seal enumeration / summary parsing, including inside `deploy.ps1` and `check-manifest.ps1` |
| the validity checks cannot be silently removed | 6 mutants, 6/6 detected | add a seventh mutant of your choice; a mutant that survives is a decorative check |
| the seal enumerates what the verifier enumerates | one enumerator, used twice | plant a file the enumerator excludes by base name and confirm both sealer and verifier see it (or neither) |
| every receipt joins the hash chain | `Add-Receipt` is the only writer | attempt to write a receipt outside `Add-Receipt` and confirm the seal and the marker reject the run |
| the completion protocol has one commit point | marker written exclusively, then renamed, then re-read | interrupt the run (kill the process) between rename and re-verification on a scratch directory; the outcome must be UNKNOWN, never COMPLETE |
| counts are real | suite prints its own counts; the launcher refuses a disagreement | run the suite with one assertion deliberately deleted and confirm the launcher fails |
| nothing sensitive is in the package | ASCII/credential scans in CI steps 3-4 and the suite | run your own secret scanner over the diff |

Also required, and impossible here: **a live deployment exercise against a
disposable project** (schema application, ledger verification, failure injection
at each gate) and **an independent reproduction of the Round 20 mutation corpus**
(the 704 inputs behind RC01-RC11 are the auditor's; this repository contains the
subset that was turned into executed cases).

---

## 10. Where the evidence lives

| Evidence | Location |
|---|---|
| This handoff | `ROUND20_REVIEW_HANDOFF.md` on branch `arena/6a50cae6-clash-app` |
| CI run, 14 steps, all logs | https://github.com/Xcalibur-hub/clash-app/actions/runs/44037376058 |
| Per-receipt annotations (adapter, manifest, suite) | same run, job annotations |
| Changed files | https://github.com/Xcalibur-hub/clash-app/compare/c265eae81a504f249239dd3fbb1c5e07319488ee...72f89bdae3f32c71b1a0d3dba5a242ed9d5790e8 |
| RC matrix | `supabase/cloud/README.md` section 1r |
| Verification record and residual risks | `supabase/cloud/README.md` section 1r-bis |
| Executed cases | `supabase/cloud/tools/test-native-capture.ps1` (inventory in `tools/lib/clash-native.ps1:3360`) |
| Offline assertions | `supabase/cloud/tests/verify-package.mjs` section 29 |
| Workflow that runs it | `.github/workflows/windows-offline-validation.yml` |

---

**Status: awaiting independent review.** No deployment, no merge, no hosted SQL,
no infrastructure change was performed for this round. Sign-off is explicitly not
claimed.
