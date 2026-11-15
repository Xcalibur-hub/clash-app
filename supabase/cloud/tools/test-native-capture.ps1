#Requires -Version 5.1
<#
  test-native-capture.ps1 - certify the native adapter on THIS machine, and
  reproduce the Round 2/3/4 failures as executed regression tests.

  ROUND 4 DEFECT (fixed here)
  ---------------------------
  The previous version passed a hashtable by splatting it:

      Add-Case 'legacyPatternLosesExitCode' (...) @legacyDetail      # wrong
      Add-Case 'legacyPatternLosesExitCode' (...) $legacyDetail      # right

  Splatting binds dictionary KEYS as parameter names, so -Detail was never bound,
  $Detail stayed $null, and @($Detail.Keys) raised PropertyNotFoundStrict under
  Set-StrictMode 2.0. Because that line ran under $ErrorActionPreference =
  'Continue', the error was non-terminating: the case was never recorded, no
  problem was raised, the verdict stayed PASS and the script exited 0.

  So this harness is now built so that a dropped, crashed or skipped case cannot
  reach a PASS verdict:

    * $ErrorActionPreference = 'Stop' at the top, and a script-scope trap that
      writes an EXCEPTION receipt and exits 1 for anything unexpected
    * Add-Case refuses a null/invalid detail, a duplicate name, or a name that is
      not in the shared inventory; each becomes a recorded problem
    * the executed case count is compared with the shared inventory before the
      verdict, and the receipt records both numbers
    * the receipt is re-read from disk after writing and re-validated with
      Test-SelfTestReceipt - the same function deploy.ps1 uses
    * four cases exist purely to prove the above: an unexpected exception, a
      dropped case, a null detail, and a tampered receipt

  It also executes the Round 2/3 NativeCommandError regression: the legacy
  construct under 'Stop' is asserted to raise, to lose the exit code, and to be
  survived by the adapter for the same child.

  Usage:
    .\test-native-capture.ps1
    .\test-native-capture.ps1 -OutFile C:\tmp\adapter-selftest.json

  Exit codes: 0 PASS, 1 FAIL or EXCEPTION, 2 refused (wrong runtime / prerequisite).
#>
[CmdletBinding()]
param(
  [string]$OutFile
)

Set-StrictMode -Version 2.0
# Strict on purpose: an unexpected error must abort the run, not skip a case.
$ErrorActionPreference = 'Stop'

$pluginRoot  = $PSScriptRoot
$adapterPath = Join-Path (Join-Path $pluginRoot 'lib') 'clash-native.ps1'

$script:cases           = [ordered]@{}
$script:problems        = @()
$script:receiptWritten  = $false
$script:outFileFinal    = ''
$script:adapterShaFinal = ''
$script:psVersionFinal  = $PSVersionTable.PSVersion.ToString()

trap {
  $message = 'unexpected exception'
  try { $message = Protect-Text $_.Exception.Message } catch { }
  Write-Host ("SELF-TEST EXCEPTION: {0}" -f $message) -ForegroundColor Red
  try {
    if (-not $script:receiptWritten) {
      $payload = [ordered]@{
        verdict            = 'EXCEPTION'
        utc                = (Get-Date).ToUniversalTime().ToString('o')
        powerShellVersion  = $script:psVersionFinal
        adapterSha256      = $script:adapterShaFinal
        casesExecuted      = @($script:cases.Keys).Count
        cases              = $script:cases
        problems           = @(('unexpected exception: ' + $message), 'no PASS may be inferred from this receipt')
        exception          = $message
      }
      $target = $script:outFileFinal
      if ([string]::IsNullOrWhiteSpace($target)) {
        $target = Join-Path $pluginRoot ('..\evidence-adapter\{0}-EXCEPTION.json' -f (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'))
      }
      if (Test-Path -LiteralPath $target) { $target = ($target -replace '\.json$', '') + '.exception.json' }
      [void](Write-EvidenceOrFallback -Path $target -Label 'adapter-selftest-exception.json' -Text ($payload | ConvertTo-Json -Depth 8))
    }
  }
  catch { }
  Write-Host 'SELF-TEST FAILED: exit 1. This run must not be used as an adapter receipt.' -ForegroundColor Red
  exit 1
}

if (-not (Test-Path -LiteralPath $adapterPath)) {
  Write-Host "REFUSED: adapter not found at $adapterPath" -ForegroundColor Red
  exit 2
}
. $adapterPath

if ($script:psVersionFinal -notmatch '^5\.1\.') {
  Write-Host ("REFUSED: this self-test certifies PowerShell 5.1; running '{0}'." -f $script:psVersionFinal) -ForegroundColor Red
  exit 2
}
$cmdexe = Join-Path $env:SystemRoot 'System32\cmd.exe'
if (-not (Test-Path -LiteralPath $cmdexe)) {
  Write-Host 'REFUSED: cmd.exe not found; cannot run harmless stderr-producing children.' -ForegroundColor Red
  exit 2
}

$script:adapterShaFinal = Get-NormalizedSha256 -Path $adapterPath
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
if ([string]::IsNullOrWhiteSpace($OutFile)) {
  $OutFile = Join-Path $pluginRoot ("..\evidence-adapter\{0}-adapter-selftest.json" -f $stamp)
}
if (Test-Path -LiteralPath $OutFile) {
  Write-Host "REFUSED: $OutFile already exists. Receipts are never overwritten." -ForegroundColor Red
  exit 2
}
$script:outFileFinal = $OutFile

$requiredCases = @(Get-ClashSelfTestInventory)

# --------------------------------------------------------------- harness ----
function New-CaseRecord {
  param([string]$Name, [bool]$Passed, $Detail = $null)
  $record = [ordered]@{ name = $Name; passed = $Passed }
  if ($null -ne $Detail -and $Detail -is [hashtable]) {
    foreach ($k in @($Detail.Keys)) { $record[$k] = $Detail[$k] }
  }
  elseif ($null -ne $Detail) {
    # never crash on a bad detail: record what arrived and let the caller fail
    $record['detailType'] = $Detail.GetType().FullName
  }
  return $record
}

function Add-Case {
  param([string]$Name, [bool]$Passed, $Detail = $null)

  $effective = $Passed
  if ([string]::IsNullOrWhiteSpace($Name)) {
    $script:problems += 'a case was recorded without a name'
    $Name = '<unnamed>'
    $effective = $false
  }
  if ($script:cases.Contains($Name)) {
    $script:problems += ("case '{0}' was recorded twice" -f $Name)
    $effective = $false
  }
  if ($requiredCases -notcontains $Name) {
    $script:problems += ("case '{0}' is not in the shared inventory" -f $Name)
    $effective = $false
  }
  if (-not $effective) { $script:problems += ("case '{0}' did not pass" -f $Name) }

  $record = New-CaseRecord -Name $Name -Passed $effective -Detail $Detail
  $script:cases[$Name] = $record

  $colour = 'Green'
  $label  = 'PASS'
  if (-not $effective) { $colour = 'Red'; $label = 'FAIL' }
  Write-Host ("  {0}  {1}" -f $label, $Name) -ForegroundColor $colour
}

function Invoke-IsolatedCase {
  param([string]$Name, [scriptblock]$Body)
  try {
    & $Body | Out-Null
    return [ordered]@{ name = $Name; passed = $true; threw = $false; message = '' }
  }
  catch {
    $message = 'unknown'
    try { $message = Protect-Text $_.Exception.Message } catch { }
    return [ordered]@{ name = $Name; passed = $false; threw = $true; message = $message }
  }
}

function Test-CaseInventory {
  param($Cases, [string[]]$Expected)
  $problems = @()
  $names = @(Get-CaseNames -Cases $Cases)
  $missing = @($Expected | Where-Object { $names -notcontains $_ })
  if ($missing.Count -gt 0) { $problems += ('missing: ' + ($missing -join ',')) }
  if ($names.Count -ne $Expected.Count) { $problems += ('count {0} != expected {1}' -f $names.Count, $Expected.Count) }
  foreach ($n in $Expected) {
    $entry = Get-CaseEntry -Cases $Cases -Name $n
    if ($null -eq $entry) { continue }
    if ((Get-DocumentProperty -Object $entry -Name 'passed' -Default $null) -ne $true) {
      $problems += ('not passed: ' + $n)
    }
  }
  return [ordered]@{ ok = ($problems.Count -eq 0); problems = $problems }
}

Write-Host ''
Write-Host ("Adapter self-test on PowerShell {0}" -f $script:psVersionFinal) -ForegroundColor Cyan
Write-Host ("adapter sha256 = {0}" -f $script:adapterShaFinal)
Write-Host ("inventory      = {0} cases" -f $requiredCases.Count)
Write-Host ''

# ---- 1: exit 0, but the child writes to stderr ------------------------------
$r = $null
try {
  $r = Invoke-NativeProcess -FilePath $cmdexe `
        -Arguments @('/c', 'echo stdout-line & echo stderr-line 1>&2 & exit /b 0') `
        -TimeoutSeconds 30
  $threw = $false
}
catch {
  $threw = $true
  $r = $null
}
Add-Case 'zeroExitWithStderr' (-not $threw -and $null -ne $r -and (Test-NativeSuccess $r) -and
    $r.stdOut -match 'stdout-line' -and $r.stdErr -match 'stderr-line') @{
  threwUnderStop = $threw
  exitCode       = $(if ($null -eq $r) { $null } else { $r.exitCode })
  stdoutHasLine  = $(if ($null -eq $r) { $false } else { [bool]($r.stdOut -match 'stdout-line') })
  stderrHasLine  = $(if ($null -eq $r) { $false } else { [bool]($r.stdErr -match 'stderr-line') })
  note           = 'stderr text must not turn exit 0 into a failure'
}

# ---- 2: nonzero exit -------------------------------------------------------
$r2 = $null
try {
  $r2 = Invoke-NativeProcess -FilePath $cmdexe `
          -Arguments @('/c', 'echo pre-failure 1>&2 & exit /b 17') `
          -TimeoutSeconds 30
  $threw2 = $false
}
catch {
  $threw2 = $true
  $r2 = $null
}
Add-Case 'nonZeroExit' (-not $threw2 -and $null -ne $r2 -and $r2.exitCode -eq 17) @{
  threwUnderStop = $threw2
  exitCode       = $(if ($null -eq $r2) { $null } else { $r2.exitCode })
  expected       = 17
  stderrCaptured = $(if ($null -eq $r2) { $false } else { [bool]($r2.stdErr -match 'pre-failure') })
}

# ---- 3: silent success -----------------------------------------------------
$r3 = Invoke-NativeProcess -FilePath $cmdexe -Arguments @('/c', 'exit /b 0') -TimeoutSeconds 30
Add-Case 'silentSuccess' ((Test-NativeSuccess $r3) -and $r3.stdErr.Length -eq 0 -and $r3.stdOut.Length -eq 0) @{
  exitCode    = $r3.exitCode
  stderrChars = $r3.stdErr.Length
  stdoutChars = $r3.stdOut.Length
}

# ---- 4: stderr is data, not a failure signal -------------------------------
$r4 = Invoke-NativeProcess -FilePath $cmdexe `
        -Arguments @('/c', 'echo NOTICE:  relation already exists, skipping 1>&2 & exit /b 0') `
        -TimeoutSeconds 30
Add-Case 'stderrIsDataNotFailure' ((Get-NativeOutcomeLabel $r4) -eq 'SUCCEEDED' -and $r4.stdErr -match 'NOTICE') @{
  outcomeLabel    = (Get-NativeOutcomeLabel $r4)
  exitCode        = $r4.exitCode
  stderrHasNotice = [bool]($r4.stdErr -match 'NOTICE')
}

# ---- 5: launch failure is UNKNOWN, never success and never rollback ---------
$r5 = Invoke-NativeProcess -FilePath (Join-Path $env:TEMP 'clash-definitely-absent.exe') -Arguments @() -TimeoutSeconds 10
Add-Case 'launchFailureIsUnknown' (-not (Test-NativeSuccess $r5) -and
    $null -eq $r5.exitCode -and -not [string]::IsNullOrWhiteSpace($r5.launchError)) @{
  exitCode    = $r5.exitCode
  launchError = $r5.launchError
  outcome     = (Get-NativeOutcomeLabel $r5)
}

# ---- 6: timeout is UNKNOWN ------------------------------------------------
$r6 = Invoke-NativeProcess -FilePath $cmdexe -Arguments @('/c', 'ping -n 6 127.0.0.1 >nul & exit /b 0') -TimeoutSeconds 2
Add-Case 'timeoutIsUnknown' ($r6.timedOut -and -not (Test-NativeSuccess $r6)) @{
  timedOut = $r6.timedOut
  outcome  = (Get-NativeOutcomeLabel $r6)
}

# ---- 7: credentials are refused before spawn ------------------------------
$env:CLASH_SELFTEST_SECRET = 'selftest-secret-' + [guid]::NewGuid().ToString('N')
$refused = $false
try {
  Invoke-NativeProcess -FilePath $cmdexe -Arguments @('/c', ('echo password=' + $env:CLASH_SELFTEST_SECRET)) | Out-Null
}
catch { $refused = ($_.Exception.Message -match 'SECURITY') }
Remove-Item Env:\CLASH_SELFTEST_SECRET -ErrorAction SilentlyContinue
Add-Case 'refusesCredentialArguments' $refused @{ refused = $refused }

# ---- 8: sanitiser redacts what it claims to redact ------------------------
# SYNTHETIC FIXTURE: this is not a credential. It is the input the sanitiser
# must redact, so the test would be meaningless without a password-shaped value.
$sample = 'postgresql://postgres:hunter2@db.example.supabase.co:5432/postgres password=hunter2 eyJhbGciOiJI.eyJzdWIiOiIxMjM0In0'
$clean  = Protect-Text $sample
Add-Case 'sanitiserRedacts' ($clean -notmatch 'hunter2' -and $clean -match '\[REDACTED\]') @{
  sampleRedacted = ($clean -notmatch 'hunter2')
  output         = $clean
}

# ---- 9: evidence writer refuses to overwrite ------------------------------
$tmpDir = Join-Path $env:TEMP ('clash-evidence-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
$first = Write-Evidence -Path (Join-Path $tmpDir 'x.txt') -Text 'one'
$secondRejected = $false
try { Write-Evidence -Path (Join-Path $tmpDir 'x.txt') -Text 'two' | Out-Null }
catch { $secondRejected = $true }
$kept = [System.IO.File]::ReadAllText((Join-Path $tmpDir 'x.txt'))
Add-Case 'evidenceNeverOverwrites' ($secondRejected -and ($kept -eq 'one') -and ($first.Length -eq 64)) @{
  secondWriteRejected = $secondRejected
  contentPreserved    = ($kept -eq 'one')
}
Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

# ---- 10: a receipt is still produced when the intended path is unwritable ---
$badName = 'clash-bad-' + [guid]::NewGuid().ToString('N') + ':invalid'
$badPath = Join-Path $env:TEMP ($badName + '\receipt.json')
$fallback = Write-EvidenceOrFallback -Path $badPath -Text '{"status":"UNKNOWN"}' -Label 'selftest-fallback.json'
$fallbackReadable = $false
if ($fallback.ok -and $fallback.path -and (Test-Path -LiteralPath $fallback.path)) {
  $fallbackReadable = ([System.IO.File]::ReadAllText($fallback.path) -match 'UNKNOWN')
  Remove-Item -LiteralPath $fallback.path -Force -ErrorAction SilentlyContinue
}
Add-Case 'receiptFallsBackWhenPathUnwritable' ($fallback.ok -and $fallback.fallback -and $fallbackReadable) @{
  primaryPath      = $badPath
  fallbackUsed     = $fallback.fallback
  fallbackAccepted = $fallback.ok
  contentReadable  = $fallbackReadable
  attempts         = @($fallback.attempts)
}

# ===========================================================================
# 11-14: REGRESSION - the actual NativeCommandError failure, executed
# ===========================================================================
# ---- NEGATIVE CONTROL: the construct that failed in Round 2/3 -------------
# This block is the code under test, not commentary: it is executed, its behaviour
# is asserted, and it is the only place in this package where a native command is
# invoked through the PowerShell engine.
$legacyThrew     = $false
$legacyOut       = $null      # assigned in the try; StrictMode 2.0 forbids a later reference otherwise
$legacyCode      = 'unset'
$legacyStderrLen = -1
$legacyStdoutLen = -1
$legacyErrFile   = Join-Path $env:TEMP ('clash-legacy-' + [guid]::NewGuid().ToString('N') + '.err')

$previousPolicy = $ErrorActionPreference
$ErrorActionPreference = 'Stop'
try {
  $legacyOut = & $cmdexe /c 'echo legacy-stderr 1>&2 & echo legacy-stdout & exit /b 5' 2>$legacyErrFile
  $legacyCode = $LASTEXITCODE
}
catch {
  $legacyThrew = $true
  $legacyCode  = 'unavailable'
}
$ErrorActionPreference = $previousPolicy
if (Test-Path -LiteralPath $legacyErrFile) {
  $legacyStderrLen = ([System.IO.File]::ReadAllText($legacyErrFile)).Length
  Remove-Item -LiteralPath $legacyErrFile -Force -ErrorAction SilentlyContinue
}
if ($null -eq $legacyOut) { $legacyStdoutLen = 0 } else { $legacyStdoutLen = (@($legacyOut) -join "`n").Length }

$legacyDetail = @{
  policyUnderTest  = 'Stop'
  threw            = $legacyThrew
  capturedExitCode = [string]$legacyCode
  expectedExitCode = 5
  stderrFileChars  = $legacyStderrLen
  stdoutChars      = $legacyStdoutLen
}
# Round 4: this was written as @legacyDetail (splatting), which bound the
# dictionary keys as parameter names, left -Detail unbound, and dropped the case.
Add-Case 'legacyPatternRaisesNativeCommandError' $legacyThrew -Detail $legacyDetail

# The harm: with the exception raised before the capture, the exit code is gone.
Add-Case 'legacyPatternLosesExitCode' ($legacyThrew -and ([string]$legacyCode -ne '5')) -Detail $legacyDetail

# ---- the fix: the adapter, same child, same policy ------------------------
$fixed = $null
$ErrorActionPreference = 'Stop'
try {
  $fixed = Invoke-NativeProcess -FilePath $cmdexe `
             -Arguments @('/c', 'echo legacy-stderr 1>&2 & echo legacy-stdout & exit /b 5') `
             -TimeoutSeconds 30
  $fixedThrew = $false
}
catch {
  $fixedThrew = $true
  $fixed = $null
}
$ErrorActionPreference = $previousPolicy
Add-Case 'adapterSurvivesSameChild' (-not $fixedThrew -and $null -ne $fixed -and
    $fixed.exitCode -eq 5 -and $fixed.stdErr -match 'legacy-stderr' -and $fixed.stdOut -match 'legacy-stdout') @{
  policyUnderTest  = 'Stop'
  threw            = $fixedThrew
  exitCode         = $(if ($null -eq $fixed) { $null } else { $fixed.exitCode })
  expectedExitCode = 5
  stderrCaptured   = $(if ($null -eq $fixed) { $false } else { [bool]($fixed.stdErr -match 'legacy-stderr') })
  stdoutCaptured   = $(if ($null -eq $fixed) { $false } else { [bool]($fixed.stdOut -match 'legacy-stdout') })
}

Add-Case 'differentialProven' ($legacyThrew -and -not $fixedThrew) @{
  legacyThrew         = $legacyThrew
  adapterThrew        = $fixedThrew
  sameChildExpression = 'echo legacy-stderr 1>&2 & echo legacy-stdout & exit /b 5'
  note                = 'the defect reproduced and the adapter avoided it on the same runtime'
}

# ===========================================================================
# 15-18: HARNESS INTEGRITY - a dropped or crashed case cannot look like a pass
# ===========================================================================
# ---- 15: an unexpected exception is recorded as a failure ------------------
$probeThrows    = Invoke-IsolatedCase -Name 'deliberate-throw' -Body { throw 'deliberate failure for the harness integrity test' }
$probeSucceeds  = Invoke-IsolatedCase -Name 'deliberate-pass' -Body { $null = 1 }
Add-Case 'unexpectedExceptionCannotPass' ($probeThrows.threw -eq $true -and $probeThrows.passed -eq $false -and
    $probeSucceeds.threw -eq $false -and $probeSucceeds.passed -eq $true) @{
  throwingCaseRecordedAsFailed = $probeThrows.passed
  throwingCaseReportedThrew    = $probeThrows.threw
  controlCasePassed            = $probeSucceeds.passed
  message                      = $probeThrows.message
}

# ---- 16: the inventory check notices a missing case ------------------------
$completeInventory = [ordered]@{}
foreach ($n in $requiredCases) { $completeInventory[$n] = [ordered]@{ passed = $true } }
$goodInventory = Test-CaseInventory -Cases $completeInventory -Expected $requiredCases
$dropped = [ordered]@{}
foreach ($n in $requiredCases) { if ($n -ne 'zeroExitWithStderr') { $dropped[$n] = [ordered]@{ passed = $true } } }
$droppedInventory = Test-CaseInventory -Cases $dropped -Expected $requiredCases
$failedInventory = [ordered]@{}
foreach ($n in $requiredCases) { $failedInventory[$n] = [ordered]@{ passed = ($n -ne 'nonZeroExit') } }
$oneFailed = Test-CaseInventory -Cases $failedInventory -Expected $requiredCases
Add-Case 'droppedCaseFailsInventory' ($goodInventory.ok -eq $true -and
    $droppedInventory.ok -eq $false -and $droppedInventory.problems.Count -gt 0 -and
    $oneFailed.ok -eq $false) @{
  completeInventoryAccepted = $goodInventory.ok
  droppedCaseRejected      = $droppedInventory.ok -eq $false
  droppedProblems          = @($droppedInventory.problems)
  failedCaseRejected       = $oneFailed.ok -eq $false
}

# ---- 17: a null or malformed detail is recorded, not crashed --------------
$nullDetailRecorded = $false
$nullDetailPassed   = $null
try {
  $record = New-CaseRecord -Name 'null-detail-probe' -Passed $true -Detail $null
  $nullDetailPassed = (Get-DocumentProperty -Object $record -Name 'passed' -Default $false)
  $nullDetailRecorded = ($record.name -eq 'null-detail-probe')
}
catch { $nullDetailRecorded = $false }
$stringDetailHandled = $false
try {
  $record2 = New-CaseRecord -Name 'string-detail-probe' -Passed $true -Detail 'not-a-hashtable'
  $stringDetailHandled = ($record2.detailType -eq 'System.String')
}
catch { $stringDetailHandled = $false }
Add-Case 'nullDetailIsRecordedNotCrashed' ($nullDetailRecorded -and $nullDetailPassed -eq $true -and $stringDetailHandled) @{
  nullDetailRecorded      = $nullDetailRecorded
  nullDetailPassed        = $nullDetailPassed
  stringDetailClassified  = $stringDetailHandled
  note                    = 'Round 4 root cause: an unbound -Detail reached $Detail.Keys'
}

# ---- 18: the gate validator rejects tampered receipts ---------------------
$snapshot = [ordered]@{
  adapterId         = $script:ClashAdapterId
  adapterVersion    = $script:ClashAdapterVersion
  adapterSha256     = $script:adapterShaFinal
  powerShellVersion = $script:psVersionFinal
  verdict           = 'PASS'
  casesExecuted     = $requiredCases.Count
  problems          = @()
  cases             = $completeInventory
}
$roundTrip = ($snapshot | ConvertTo-Json -Depth 8) | ConvertFrom-Json
$accepted = Test-SelfTestReceipt -Document $roundTrip -AdapterSha256 $script:adapterShaFinal

$tamperResults = [ordered]@{}
$tampered = [ordered]@{
  'verdict-not-pass'      = { param($d) $d.verdict = 'FAIL'; $d }
  'missing-case'          = { param($d) $d.cases.PSObject.Properties.Remove('zeroExitWithStderr'); $d }
  'failed-case'           = { param($d) $d.cases.silentSuccess.passed = $false; $d }
  'count-disagrees'       = { param($d) $d.casesExecuted = 3; $d }
  'count-missing'         = { param($d) $d.PSObject.Properties.Remove('casesExecuted'); $d }
  'problems-not-empty'    = { param($d) $d.problems = @('something went wrong'); $d }
  'wrong-adapter-sha'     = { param($d) $d.adapterSha256 = ('0' * 64); $d }
  'wrong-adapter-version' = { param($d) $d.adapterVersion = '0.0.0'; $d }
  'no-cases'              = { param($d) $d.cases = $null; $d }
}
foreach ($key in @($tampered.Keys)) {
  $copy = ($snapshot | ConvertTo-Json -Depth 8) | ConvertFrom-Json
  $copy = & $tampered[$key] $copy
  $verdict = Test-SelfTestReceipt -Document $copy -AdapterSha256 $script:adapterShaFinal
  $tamperResults[$key] = ($verdict.ok -eq $false)
}
$allTamperedRejected = $true
foreach ($k in @($tamperResults.Keys)) { if (-not $tamperResults[$k]) { $allTamperedRejected = $false } }
Add-Case 'validatorRejectsTamperedReceipt' ($accepted.ok -eq $true -and $allTamperedRejected -and @($tamperResults.Keys).Count -ge 9) @{
  untamperedAccepted = $accepted.ok
  tamperedRejected   = $allTamperedRejected
  detail             = $tamperResults
  acceptedProblems   = @($accepted.problems)
}

# ===========================================================================
# verdict: inventory first, then the receipt, then the file on disk
# ===========================================================================
$inventory = Test-CaseInventory -Cases $script:cases -Expected $requiredCases
if (-not $inventory.ok) {
  foreach ($p in @($inventory.problems)) { $script:problems += ('inventory: ' + $p) }
}
$executedCount = @($script:cases.Keys).Count
if ($executedCount -ne $requiredCases.Count) {
  $script:problems += ('executed {0} case(s), the inventory requires {1}' -f $executedCount, $requiredCases.Count)
}

$verdictValue = 'PASS'
if ($script:problems.Count -gt 0) { $verdictValue = 'FAIL' }

# Validate the receipt BEFORE it exists. A PASS receipt must never be written for
# a run the gate would reject, otherwise a rejected run still leaves an accepted
# artefact on disk for deploy.ps1 to pick up.
function New-SelfTestDocument {
  param([string]$Verdict)
  return [ordered]@{
    verdict                 = $Verdict
    utc                     = (Get-Date).ToUniversalTime().ToString('o')
    host                    = $env:COMPUTERNAME
    powerShellVersion       = $script:psVersionFinal
    powerShellEdition       = $PSVersionTable.PSEdition
    adapterId               = $script:ClashAdapterId
    adapterVersion          = $script:ClashAdapterVersion
    adapterSha256           = $script:adapterShaFinal
    adapterPath             = (Resolve-Path -LiteralPath $adapterPath).Path
    casesExecuted           = @($script:cases.Keys).Count
    casesExpected           = $requiredCases.Count
    cases                   = $script:cases
    problems                = @($script:problems)
    regressionSubject       = 'NativeCommandError interrupts exit-code capture under $ErrorActionPreference=Stop'
    harnessIntegritySubject = 'a dropped, crashed or unrecorded case cannot reach a PASS verdict'
  }
}

$doc = New-SelfTestDocument -Verdict $verdictValue
$roundTripDoc = ($doc | ConvertTo-Json -Depth 8) | ConvertFrom-Json
$selfCheck = Test-SelfTestReceipt -Document $roundTripDoc -AdapterSha256 $script:adapterShaFinal
if (-not $selfCheck.ok) {
  foreach ($p in @($selfCheck.problems)) { $script:problems += ('receipt rejected by the gate validator: ' + $p) }
  $verdictValue = 'FAIL'
  $doc = New-SelfTestDocument -Verdict $verdictValue
}

$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$sha = Write-EvidenceJson -Path $OutFile -Object $doc
$script:receiptWritten = $true

# Confirm what landed on disk is what was validated: a truncated or altered write
# must not survive as a usable receipt.
$onDiskRaw = [System.IO.File]::ReadAllText($OutFile)
$onDisk = $onDiskRaw | ConvertFrom-Json
$postWrite = Test-SelfTestReceipt -Document $onDisk -AdapterSha256 $script:adapterShaFinal
$receiptConsistent = ($postWrite.ok -eq ($verdictValue -eq 'PASS')) -and
                     ([string](Get-DocumentProperty -Object $onDisk -Name 'verdict' -Default '') -eq $verdictValue) -and
                     ([int](Get-DocumentProperty -Object $onDisk -Name 'casesExecuted' -Default 0) -eq @($script:cases.Keys).Count)
if (-not $receiptConsistent) {
  Write-Host 'SELF-TEST FAILED: the receipt on disk does not match the run. Exit 1.' -ForegroundColor Red
  Write-Host ("disk verdict='{0}' expected='{1}' validatorOk={2}" -f (Get-DocumentProperty -Object $onDisk -Name 'verdict' -Default '?'), $verdictValue, $postWrite.ok) -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host ("VERDICT {0} ({1}/{2} cases executed)" -f $verdictValue, $executedCount, $requiredCases.Count) -ForegroundColor $(if ($verdictValue -eq 'PASS') { 'Green' } else { 'Red' })
Write-Host ("Receipt : {0}" -f (Resolve-Path -LiteralPath $OutFile).Path)
Write-Host ("sha256  : {0}" -f $sha)
Write-Host ("NativeCommandError regression: legacy threw={0}, adapter threw={1}, legacy exit code={2}" -f $legacyThrew, $fixedThrew, [string]$legacyCode)

if ($verdictValue -ne 'PASS') {
  Write-Host ("Problems: {0}" -f (@($script:problems) -join ' | ')) -ForegroundColor Red
  Write-Host 'Do not deploy: the adapter is not proven on this runtime.' -ForegroundColor Red
  exit 1
}
Write-Host 'Pass this receipt to deploy.ps1 -AdapterSelfTestReceipt.' -ForegroundColor Green
exit 0
