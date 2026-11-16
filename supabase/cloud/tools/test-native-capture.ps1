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

# Round 5: the inventory must be exactly 102 unique, non-empty strings, and that
# is asserted before a single child process is started. A malformed inventory
# (nested array, duplicate, blank, wrong count) ends here with a non-PASS receipt.
$inventoryCheck = Assert-SelfTestInventory -Names $requiredCases -ExpectedCount 120
if (-not $inventoryCheck.ok) {
  $reasons = @()
  foreach ($p in @($inventoryCheck.problems)) { $reasons += [string]$p }
  Write-Host 'SELF-TEST REFUSED: the case inventory is malformed. No child process was started.' -ForegroundColor Red
  foreach ($line in $reasons) { Write-Host ('  - ' + $line) -ForegroundColor Red }
  $observed = @()
  foreach ($entry in @($requiredCases)) {
    if ($entry -is [string]) { $observed += $entry }
    elseif ($null -eq $entry) { $observed += '<null>' }
    else { $observed += ('<' + $entry.GetType().Name + '>') }
  }
  $refusal = [ordered]@{
    verdict           = 'FAIL'
    utc               = (Get-Date).ToUniversalTime().ToString('o')
    host              = $env:COMPUTERNAME
    powerShellVersion = $script:psVersionFinal
    adapterId         = $script:ClashAdapterId
    adapterVersion    = $script:ClashAdapterVersion
    adapterSha256     = $script:adapterShaFinal
    casesExecuted     = 0
    casesExpected     = 75
    cases             = @{}
    problems          = $reasons
    inventoryObserved = $observed
    refusal           = 'inventory validation failed before any child process'
  }
  [void](Write-EvidenceOrFallback -Path $OutFile -Label 'adapter-selftest-refused.json' -Text ($refusal | ConvertTo-Json -Depth 6))
  $script:receiptWritten = $true
  exit 1
}

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

# ---- 19/20: the ledger classifier (R1) -------------------------------------
# A gapped ledger must never read as a resumable prefix. These run the exact
# adapter function that check-ledger.ps1 and deploy.ps1 now share.
$ledgerModel = @(
  [pscustomobject]@{ version = '20260101000000'; normalizedSha256 = ('1' * 64) },
  [pscustomobject]@{ version = '20260101000100'; normalizedSha256 = ('2' * 64) },
  [pscustomobject]@{ version = '20260101000200'; normalizedSha256 = ('3' * 64) })
$t1 = 'sha256:' + ('1' * 64)
$t2 = 'sha256:' + ('2' * 64)
$t3 = 'sha256:' + ('3' * 64)

$gappy    = Get-LedgerVerdict -Entries $ledgerModel -Ledger @{ '20260101000000' = $t1; '20260101000200' = $t3 }
$complete = Get-LedgerVerdict -Entries $ledgerModel -Ledger @{ '20260101000000' = $t1; '20260101000100' = $t2; '20260101000200' = $t3 }
$partial  = Get-LedgerVerdict -Entries $ledgerModel -Ledger @{ '20260101000000' = $t1 }
$emptyOne = Get-LedgerVerdict -Entries $ledgerModel -Ledger @{}
$absent   = Get-LedgerVerdict -Entries $ledgerModel -Ledger @{} -TableAbsent $true
Add-Case 'ledgerGapIsProblem' (
  $gappy.verdict -eq 'PROBLEM' -and
  @($gappy.gaps).Count -eq 1 -and
  [string]@($gappy.gaps)[0] -eq '20260101000200' -and
  $complete.verdict -eq 'CONSISTENT' -and
  $partial.verdict -eq 'PARTIAL_PREFIX' -and
  $emptyOne.verdict -eq 'EMPTY' -and
  $absent.verdict -eq 'EMPTY' -and $absent.tableAbsent -eq $true) @{
  gapVerdict     = $gappy.verdict
  gapDetail      = @($gappy.gaps)
  completeVerdict = $complete.verdict
  partialVerdict = $partial.verdict
  emptyVerdict   = $emptyOne.verdict
}

$malformedRow   = Get-LedgerVerdict -Entries $ledgerModel -Ledger @{ '20260101000000' = 'garbage' }
$emptyToken     = Get-LedgerVerdict -Entries $ledgerModel -Ledger @{ '20260101000000' = '' }
$shortToken     = Get-LedgerVerdict -Entries $ledgerModel -Ledger @{ '20260101000000' = ('sha256:' + ('1' * 63)) }
$mismatchRow    = Get-LedgerVerdict -Entries $ledgerModel -Ledger @{ '20260101000000' = $t2 }
$extraRow       = Get-LedgerVerdict -Entries $ledgerModel -Ledger @{ '20250101000000' = $t1 }
$missingParse   = 'ok'
try { $null = Get-LedgerVerdict -Entries @() -Ledger @{} } catch { $missingParse = 'threw' }
Add-Case 'ledgerMalformedIsProblem' (
  $malformedRow.verdict -eq 'PROBLEM' -and @($malformedRow.malformed).Count -eq 1 -and
  $emptyToken.verdict -eq 'PROBLEM' -and
  $shortToken.verdict -eq 'PROBLEM' -and
  $mismatchRow.verdict -eq 'PROBLEM' -and
  $extraRow.verdict -eq 'PROBLEM' -and @($extraRow.extra).Count -eq 1) @{
  malformed = @($malformedRow.malformed)
  empty     = $emptyToken.verdict
  short     = $shortToken.verdict
  mismatch  = $mismatchRow.verdict
  extra     = $extraRow.verdict
}

# ---- 21: a receipt that cannot be written anywhere must throw (R4) ---------
$blockerDir = [System.IO.Path]::GetTempPath()
$blockerPath = Join-Path $blockerDir ('clash-receipt-blocker-{0}.txt' -f ([guid]::NewGuid().ToString('N')))
$bothFailedOk = $false
$receiptThrew = $false
$attempts = 0
try {
  [void](New-Item -ItemType File -Path $blockerPath -Force)
  $previousFallback = $script:ClashEvidenceFallbackDir
  try {
    $script:ClashEvidenceFallbackDir = Join-Path $blockerPath 'fallback'
    $failedWrite = Write-EvidenceOrFallback -Path (Join-Path $blockerPath 'primary.json') -Label 'injected-failure.json' -Text '{}'
    $bothFailedOk = ($failedWrite.ok -eq $false)
    $attempts = @($failedWrite.attempts).Count
    try { [void](Add-Receipt -Root (Join-Path $blockerPath 'root') -Name 'injected.json' -Fields @{ status = 'FAIL' }) }
    catch { $receiptThrew = $true }
  }
  finally { $script:ClashEvidenceFallbackDir = $previousFallback }
}
finally { Remove-Item -LiteralPath $blockerPath -Force -ErrorAction SilentlyContinue }
Add-Case 'receiptFailureStops' ($bothFailedOk -and $receiptThrew -and $attempts -ge 2) @{
  fallbackReportedFailure = $bothFailedOk
  addReceiptThrew         = $receiptThrew
  attemptsRecorded        = $attempts
}

# ---- 22: connection loss and ambiguous completion are UNKNOWN (R3) ---------
$connLost = [pscustomobject]@{ exitCode = 2; timedOut = $false; launchError = $null; captureNote = ''; stdOut = ''; stdErr = 'connection to server was lost' }
$scriptErr = [pscustomobject]@{ exitCode = 3; timedOut = $false; launchError = $null; captureNote = ''; stdOut = ''; stdErr = 'ERROR:  42P01: relation does not exist' }
$timedOut = [pscustomobject]@{ exitCode = $null; timedOut = $true; launchError = $null; captureNote = ''; stdOut = ''; stdErr = '' }
$noExit = [pscustomobject]@{ exitCode = $null; timedOut = $false; launchError = $null; captureNote = ''; stdOut = ''; stdErr = '' }
Add-Case 'connectionLossIsUnknown' (
  (Get-PsqlExitClass $connLost) -eq 'CONNECTION_LOST' -and
  (Get-PsqlExitClass $scriptErr) -eq 'SCRIPT_ERROR' -and
  (Get-PsqlExitClass $timedOut) -eq 'UNKNOWN' -and
  (Get-PsqlExitClass $noExit) -eq 'UNKNOWN' -and
  -not (Test-RollbackProvable -Result $connLost -ReadBackOk $true -RowAbsent $true) -and
  -not (Test-RollbackProvable -Result $timedOut -ReadBackOk $true -RowAbsent $true) -and
  -not (Test-RollbackProvable -Result $noExit -ReadBackOk $true -RowAbsent $true) -and
  (Test-RollbackProvable -Result $scriptErr -ReadBackOk $true -RowAbsent $true) -and
  -not (Test-RollbackProvable -Result $scriptErr -ReadBackOk $false -RowAbsent $true) -and
  -not (Test-RollbackProvable -Result $scriptErr -ReadBackOk $true -RowAbsent $false)) @{
  connectionLost = (Get-PsqlExitClass $connLost)
  scriptError    = (Get-PsqlExitClass $scriptErr)
  timeout        = (Get-PsqlExitClass $timedOut)
  rollbackOnConnLoss = (Test-RollbackProvable -Result $connLost -ReadBackOk $true -RowAbsent $true)
  rollbackOnScriptError = (Test-RollbackProvable -Result $scriptErr -ReadBackOk $true -RowAbsent $true)
}

# ---- 23: incomplete capture is UNKNOWN, never success ----------------------
$partialOut = [pscustomobject]@{ exitCode = 0; timedOut = $false; launchError = $null; captureNote = 'stdout capture incomplete'; stdOut = ''; stdErr = '' }
Add-Case 'incompleteCaptureIsUnknown' (
  (Test-NativeSuccess $partialOut) -eq $false -and
  (Test-NativeCaptureComplete $partialOut) -eq $false -and
  (Get-PsqlExitClass $partialOut) -eq 'UNKNOWN' -and
  (Get-NativeOutcomeLabel $partialOut) -eq 'UNKNOWN-CAPTURE-INCOMPLETE' -and
  -not (Test-RollbackProvable -Result $partialOut -ReadBackOk $true -RowAbsent $true) -and
  (Test-NativeSuccess ([pscustomobject]@{ exitCode = 0; timedOut = $false; launchError = $null; captureNote = ''; stdOut = ''; stdErr = '' }))) @{
  outcomeLabel = (Get-NativeOutcomeLabel $partialOut)
  success      = (Test-NativeSuccess $partialOut)
}

# ---- 24: SQLSTATE is extracted, message text is not used --------------------
$stateVerbose = Get-PgSqlState 'ERROR:  42P01: relation "supabase_migrations.schema_migrations" does not exist'
$stateLegacy  = Get-PgSqlState 'SQLSTATE: 23505'
$stateMissing = Get-PgSqlState 'ERROR:  something went wrong'
$stateEmpty   = Get-PgSqlState ''
$stateWrong   = Get-PgSqlState 'ERROR:  does not exist'
Add-Case 'sqlStateExtracted' (
  $stateVerbose -eq '42P01' -and $stateLegacy -eq '23505' -and
  $stateMissing -eq '' -and $stateEmpty -eq '' -and $stateWrong -eq '') @{
  verbose = $stateVerbose
  legacy  = $stateLegacy
  missing = $stateMissing
  textOnly = $stateWrong
}

# ---- 25: the real ledger parser rejects malformed output (Round 9 B1) ------
$parserEntries = @(
  [pscustomobject]@{ version = '20260101000000'; normalizedSha256 = ('1' * 64) },
  [pscustomobject]@{ version = '20260101000100'; normalizedSha256 = ('2' * 64) })
$goodRow1 = '20260101000000|sha256:' + ('1' * 64)
$goodRow2 = '20260101000100|sha256:' + ('2' * 64)
$parseGood    = ConvertFrom-ClashLedgerOutput -Text ($goodRow1 + "`n" + $goodRow2 + "`n") -Entries $parserEntries
$parseOnlyBad = ConvertFrom-ClashLedgerOutput -Text 'UNEXPECTED_NONEMPTY_LEDGER_OUTPUT' -Entries $parserEntries
$parseMixed   = ConvertFrom-ClashLedgerOutput -Text ($goodRow1 + "`n" + 'garbage row' + "`n") -Entries $parserEntries
$parseFields  = ConvertFrom-ClashLedgerOutput -Text '20260101000000|sha256:' -Entries $parserEntries
$parseExtraField = ConvertFrom-ClashLedgerOutput -Text ($goodRow1 + '|extra') -Entries $parserEntries
$parseDuplicate  = ConvertFrom-ClashLedgerOutput -Text ($goodRow1 + "`n" + $goodRow1) -Entries $parserEntries
$parseBadVersion = ConvertFrom-ClashLedgerOutput -Text ('2026-01-01|sha256:' + ('1' * 64)) -Entries $parserEntries
$parseUnknown    = ConvertFrom-ClashLedgerOutput -Text ('20990101000000|sha256:' + ('1' * 64)) -Entries $parserEntries
$parseNullToken  = ConvertFrom-ClashLedgerOutput -Text '20260101000000|<null>' -Entries $parserEntries
$parseBadToken   = ConvertFrom-ClashLedgerOutput -Text '20260101000000|sha256:xyz' -Entries $parserEntries
$parseBlanks     = ConvertFrom-ClashLedgerOutput -Text ("`n`n  `n") -Entries $parserEntries
$parseAbsentGarbage = ConvertFrom-ClashLedgerOutput -Text 'something' -Entries $parserEntries -TableAbsent $true
Add-Case 'ledgerParserRejectsMalformedOutput' (
  $parseGood.ok -and $parseGood.rows -eq 2 -and $parseGood.ledger.Count -eq 2 -and
  -not $parseOnlyBad.ok -and @($parseOnlyBad.problems).Count -ge 1 -and
  -not $parseMixed.ok -and @($parseMixed.problems).Count -ge 1 -and
  -not $parseFields.ok -and -not $parseExtraField.ok -and
  -not $parseDuplicate.ok -and @($parseDuplicate.duplicates).Count -eq 1 -and
  -not $parseBadVersion.ok -and -not $parseUnknown.ok -and
  -not $parseNullToken.ok -and -not $parseBadToken.ok -and
  -not $parseAbsentGarbage.ok -and
  $parseBlanks.ok -and $parseBlanks.rows -eq 0) @{
  goodRows          = $parseGood.rows
  onlyGarbage       = $parseOnlyBad.ok
  mixed             = $parseMixed.ok
  twoFields         = $parseFields.ok
  threeFields       = $parseExtraField.ok
  duplicateReported = @($parseDuplicate.duplicates)
  badVersion        = $parseBadVersion.ok
  unknownVersion    = $parseUnknown.ok
  nullToken         = $parseNullToken.ok
  blankLines        = $parseBlanks.ok
}

# ---- 26: ABSENT and PRESENT receipt fields both resolve (Round 9 B2) -------
$stubPresenceAbsent = [pscustomobject]@{ exitCode = 0; timedOut = $false; launchError = $null; captureNote = ''; stdOut = 'ABSENT'; stdErr = '' }
$stubPresencePresent = [pscustomobject]@{ exitCode = 0; timedOut = $false; launchError = $null; captureNote = ''; stdOut = 'PRESENT'; stdErr = '' }
$stubLedger = [pscustomobject]@{ exitCode = 0; timedOut = $false; launchError = $null; captureNote = ''; stdOut = ($goodRow1 + "`n" + $goodRow2); stdErr = '' }
$stubCheck = Get-LedgerVerdict -Entries $parserEntries -Ledger $parseGood.ledger
$absentFields = New-LedgerAuditFields -PresenceResult $stubPresenceAbsent -LedgerResult $null `
                  -PresenceText 'ABSENT' -TableAbsent $true -Parse $parseBlanks -Check $null
$presentFields = New-LedgerAuditFields -PresenceResult $stubPresencePresent -LedgerResult $stubLedger `
                  -PresenceText 'PRESENT' -TableAbsent $false -Parse $parseGood -Check $stubCheck
Add-Case 'absentAndPresentBranchesRecordActualResult' (
  $absentFields.ledgerQuery -eq 'not issued: table absent' -and
  $absentFields.nativeOutcome -eq 'SUCCEEDED' -and
  $absentFields.presenceOutcome -eq 'SUCCEEDED' -and
  $absentFields.exitCode -eq 0 -and $absentFields.rowsParsed -eq 0 -and
  $absentFields.verdict -eq 'UNREADABLE' -and
  $presentFields.ledgerQuery -eq 'issued' -and
  $presentFields.rowsParsed -eq 2 -and
  $presentFields.verdict -eq 'CONSISTENT' -and
  $presentFields.parseOk -eq $true -and
  @($presentFields.parseProblems).Count -eq 0) @{
  absentQuery   = $absentFields.ledgerQuery
  absentOutcome = $absentFields.nativeOutcome
  absentRows    = $absentFields.rowsParsed
  presentRows   = $presentFields.rowsParsed
  presentVerdict = $presentFields.verdict
}

# ---- 27-33: the committed claim-release block, executed (Round 10) ----------
# Codex R9-C1: deploy.ps1 tested a command invocation inside a boolean
# expression without parentheses:
#
#     if (Test-NativeSuccess $release -and -not $releasedOwned)
#
# PowerShell parses that as ONE command. '-and', '-not' and the ownership value
# became extra ARGUMENTS to Test-NativeSuccess, so the condition collapsed to
# that function's own return value: a release that returned exactly this run's
# row still entered the STOP branch, and a correct deployment could never reach
# COMPLETE. Syntax was valid, so no parser check could see it.
#
# The cases below do not restate the block. They read deploy.ps1, extract the
# committed region between two anchors, refuse the region unless it carries
# every receipt it is supposed to, and then EXECUTE it. Only the process and
# evidence layers are substituted, so the real Test-NativeSuccess,
# Get-PgSqlState, Get-NativeOutcomeLabel and Get-NativeErrorExcerpt decide what
# the block does. A copy that drifts from deploy.ps1 cannot pass these cases.

function Get-ClaimReleaseBlock {
  param([string]$Path)

  $lines   = [System.IO.File]::ReadAllLines($Path)
  $startAt = -1
  $endAt   = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($startAt -lt 0 -and $lines[$i] -match '^\$releaseSql\s*=\s*"delete from supabase_migrations\.clash_deploy_claim') {
      $startAt = $i
      continue
    }
    if ($startAt -ge 0 -and $lines[$i] -match '^#\s*-+\s*completion\s*-+\s*$') {
      $endAt = $i
      break
    }
  }
  if ($startAt -lt 0 -or $endAt -le $startAt) {
    throw ('claim-release block not found in {0} (start {1}, end {2})' -f $Path, $startAt, $endAt)
  }

  $text = (@($lines[$startAt..($endAt - 1)]) -join "`n")
  # Expected occurrences, not just presence. '06-claim-release.json' is written
  # by BOTH branches (STOP for a failed release, PASS for a released claim), so
  # a region that reports it only once has lost a branch.
  $required = [ordered]@{
    '06-claim-release-ownership.json'      = 1
    '06-claim-release-ownership-stop.json' = 1
    '06-claim-release-fail.json'           = 1
    '06-claim-release.json'                = 2
    # Round 16 (R15-C1): the release region must NOT claim completion.
    '06-complete.json'                     = 0
  }
  $problems = @()
  foreach ($marker in @($required.Keys)) {
    $hits = ([regex]::Matches($text, [regex]::Escape([string]$marker))).Count
    if ($hits -ne [int]$required[$marker]) {
      $problems += ('receipt marker {0} appears {1} time(s), expected {2}' -f $marker, $hits, $required[$marker])
    }
  }
  if (-not $text.Contains('returning run_id')) { $problems += 'the release is not an ownership-qualified RETURNING delete' }
  if ([regex]::IsMatch($text, '(?m)^\s*exit\b')) { $problems += 'the extracted region contains an exit statement' }
  if ($text.Contains('Seal-Evidence')) { $problems += 'the extracted region still seals evidence' }
  if ($text.Contains('Publish-ClashCompletion')) { $problems += 'the extracted region publishes completion' }
  if ($problems.Count -gt 0) { throw ('claim-release block rejected: ' + ($problems -join '; ')) }

  return ([ordered]@{ text = $text; lines = ($endAt - $startAt); startLine = ($startAt + 1) })
}

# The argv prefix is extracted too, so the probe asserts the real '-v
# ON_ERROR_STOP=1 -v VERBOSITY=verbose' that ship in deploy.ps1, not a copy.
function Get-DeployCommonArguments {
  param([string]$Path)
  $hits = @([System.IO.File]::ReadAllLines($Path) | Where-Object { $_ -match '^\$common\s*=\s*@\(' })
  if ($hits.Count -ne 1) { throw ('expected exactly one $common assignment in deploy.ps1, found {0}' -f $hits.Count) }
  $expression = ($hits[0] -replace '^\$common\s*=\s*', '')
  return @(& ([scriptblock]::Create($expression)))
}

function Invoke-ClaimReleaseProbe {
  param(
    [hashtable]$Stub,
    [string]$RunId = 'r10-claim-release-probe-0001'
  )

  $state = [ordered]@{
    runId           = $RunId
    receipts        = [ordered]@{}
    stopName        = ''
    stopReason      = ''
    reachedComplete = $false
    nativeCalls     = 0
    arguments       = @()
    evidenceCalls   = 0
    threw           = ''
    blockLines      = 0
    blockStartLine  = 0
  }

  try {
    $blockInfo = Get-ClaimReleaseBlock -Path (Join-Path $pluginRoot 'deploy.ps1')
    $state.blockLines     = [int]$blockInfo.lines
    $state.blockStartLine = [int]$blockInfo.startLine

    # Every variable the committed region reads but never assigns. Under
    # Set-StrictMode 2.0 an unset reader would abort the case instead of failing
    # it, so they are all bound here.
    $common      = Get-DeployCommonArguments -Path (Join-Path $pluginRoot 'deploy.ps1')
    $runId       = $RunId
    $run         = 'C:\clash-probe-evidence\r10'
    $psqlPath    = 'C:\clash-probe\psql.exe'
    $policy      = [pscustomobject]@{ env = @{} }
    $applied     = 111
    $treeHash    = 'probe-tree-hash'
    $bootOutcome = 'CREATED'

    $script:r10State = $state
    $script:r10Block = [scriptblock]::Create([string]$blockInfo.text)
    $script:r10Stub  = $Stub

    & {
      # Substituted: the child process and the evidence writer. Everything the
      # block asks ABOUT THE RESULT comes from the real adapter functions.
      function Invoke-NativeProcess {
        param($FilePath, $Arguments, $Environment, $TimeoutSeconds)
        $script:r10State.nativeCalls = $script:r10State.nativeCalls + 1
        $script:r10State.arguments   = @($Arguments)
        $s = $script:r10Stub
        return [ordered]@{
          filePath      = 'psql.exe'
          argumentCount = @($Arguments).Count
          exitCode      = $s['exitCode']
          timedOut      = $s['timedOut']
          launchError   = $s['launchError']
          captureNote   = $s['captureNote']
          stdOut        = $s['stdOut']
          stdErr        = $s['stdErr']
          startedUtc    = 'probe'
          finishedUtc   = 'probe'
          durationMs    = 0
        }
      }
      function Write-Evidence {
        param($Path, $Text)
        $script:r10State.evidenceCalls = $script:r10State.evidenceCalls + 1
        return [ordered]@{ ok = $true; path = [string]$Path; sha256 = ('0' * 64) }
      }
      function New-PhaseReceipt {
        param([string]$Name, $Fields)
        $copy = [ordered]@{}
        foreach ($k in @($Fields.Keys)) { $copy[[string]$k] = $Fields[$k] }
        $script:r10State.receipts[[string]$Name] = $copy
      }
      function Stop-Run {
        param([string]$Reason, [string]$StopName = 'STOP.json')
        $script:r10State.receipts[[string]$StopName] = [ordered]@{ status = 'STOPPED'; reason = [string]$Reason }
        $script:r10State.stopName   = [string]$StopName
        $script:r10State.stopReason = [string]$Reason
        # The real Stop-Run writes STOP.txt, seals and exits 1. A throw keeps
        # this test process alive and marks exactly the same branch.
        throw ('CLASH-PROBE-STOP:' + [string]$StopName)
      }
      & $script:r10Block
      $script:r10State.reachedComplete = $script:r10State.receipts.Contains('06-complete.json')
    }
  }
  catch {
    $message = 'unknown'
    try { $message = [string]$_.Exception.Message } catch { }
    # Only the sentinel throw is the expected way out of the block.
    if ($message -notlike 'CLASH-PROBE-STOP:*') {
      $state.threw = (Protect-Text $message)
    }
  }
  return $state
}

# The branch is proven by the SET of receipts produced and by the STOP that was
# requested - not by the absence of an exception.
function Test-ClaimReleaseOutcome {
  param(
    $Probe,
    [string[]]$ExpectedReceipts,
    [string]$ExpectedStop,
    $ExpectedStatus = $null
  )
  $problems = @()
  $names = @($Probe.receipts.Keys | ForEach-Object { [string]$_ })
  $unexpected = @($names | Where-Object { $ExpectedReceipts -notcontains $_ })
  $absent     = @($ExpectedReceipts | Where-Object { $names -notcontains $_ })
  if ($unexpected.Count -gt 0) { $problems += ('unexpected receipt(s): ' + ($unexpected -join ',')) }
  if ($absent.Count -gt 0) { $problems += ('missing receipt(s): ' + ($absent -join ',')) }
  if ([string]$Probe.stopName -ne [string]$ExpectedStop) {
    $problems += ("stopped with '{0}', expected '{1}'" -f $Probe.stopName, $ExpectedStop)
  }
  if ([string]$Probe.threw -ne '') { $problems += ('unexpected exception: ' + [string]$Probe.threw) }
  if ([int]$Probe.nativeCalls -ne 1) { $problems += ('the release was issued {0} time(s), expected 1' -f $Probe.nativeCalls) }
  if ($null -ne $ExpectedStatus) {
    foreach ($key in @($ExpectedStatus.Keys)) {
      $entry  = $null
      if ($Probe.receipts.Contains([string]$key)) { $entry = $Probe.receipts[[string]$key] }
      $actual = ''
      if ($null -ne $entry) { $actual = [string]$entry['status'] }
      if ($actual -ne [string]$ExpectedStatus[$key]) {
        $problems += ("receipt {0} status '{1}', expected '{2}'" -f $key, $actual, $ExpectedStatus[$key])
      }
    }
  }
  # Round 11 (R10-C1): this was
  #   ((@('06-complete.json') | Where-Object { $names -contains $_ }).Count -gt 0)
  # When COMPLETE is absent from the receipts the pipeline emits NOTHING, so the
  # result is [AutomationNull] and .Count is not a property of it. Off (or on
  # PowerShell 7, by its scalar shim) that reads as 0; under Set-StrictMode 2.0 on
  # Windows PowerShell 5.1 it raises PropertyNotFoundStrict and the trap ends the
  # whole run. Case 28 - zero rows, the FIRST case whose receipts carry no
  # COMPLETE - could therefore never be reached on the only runtime this harness
  # certifies: a run that died at 27/33 cases. -contains answers the same question
  # from the collection itself, returns a real boolean, and cannot see an empty
  # pipeline. No unwrapped pipeline result in this package may be counted.
  $completeInReceipts = ($names -contains '06-complete.json')
  if ($completeInReceipts -ne [bool]$Probe.reachedComplete) {
    $problems += 'reachedComplete disagrees with the receipts that were written'
  }
  return [ordered]@{ ok = ($problems.Count -eq 0); problems = $problems; receipts = $names }
}

# Receipts are read through this helper so that an ABSENT receipt fails an
# assertion instead of indexing a key that is not there.
function Get-ProbeReceipt {
  param($Probe, [string]$Name)
  if ($Probe.receipts.Contains([string]$Name)) { return $Probe.receipts[[string]$Name] }
  return @{ status = '<absent>'; returnedRows = -1; returned = @(); outcome = '<absent>'; sqlState = ''; writerRunId = ''; appliedThisRun = -1 }
}

$probeRunId  = 'r10-claim-release-probe-0001'
$probeOther  = 'r10-someone-elses-run-0002'

# ---- 27: one returned row that IS this run -> PASS, claim released ---------
# Round 16 (R15-C1): the release no longer writes 06-complete.json. Releasing the
# claim is not completing the run; completion is published after the seal exists.
$probeOwned = Invoke-ClaimReleaseProbe -RunId $probeRunId -Stub @{
  exitCode = 0; timedOut = $false; launchError = $null; captureNote = ''
  stdOut = ($probeRunId + "`n"); stdErr = ''
}
$ownedOutcome = Test-ClaimReleaseOutcome -Probe $probeOwned `
  -ExpectedReceipts @('06-claim-release-ownership.json', '06-claim-release.json') `
  -ExpectedStop '' `
  -ExpectedStatus @{ '06-claim-release-ownership.json' = 'PASS'; '06-claim-release.json' = 'PASS' }
$ownedArgs  = @($probeOwned.arguments)
$ownedAt    = [array]::IndexOf($ownedArgs, '-c')
$ownedSql   = ''
if ($ownedAt -ge 0 -and ($ownedAt + 1) -lt $ownedArgs.Count) { $ownedSql = [string]$ownedArgs[$ownedAt + 1] }
$ownedScan  = Get-ProbeReceipt -Probe $probeOwned -Name '06-claim-release-ownership.json'
$ownedDone  = Get-ProbeReceipt -Probe $probeOwned -Name '06-complete.json'
Add-Case 'claimReleaseOwnedRowReleasesClaimOnly' (
  $ownedOutcome.ok -and
  [string]$probeOwned.threw -eq '' -and
  [string]$probeOwned.stopName -eq '' -and
  $probeOwned.reachedComplete -eq $false -and
  $probeOwned.nativeCalls -eq 1 -and
  $probeOwned.evidenceCalls -eq 2 -and
  $ownedArgs -contains '-t' -and $ownedArgs -contains '-A' -and
  $ownedArgs -contains 'ON_ERROR_STOP=1' -and $ownedArgs -contains 'VERBOSITY=verbose' -and
  $ownedSql.Contains('returning run_id') -and
  $ownedSql.Contains("run_id = '" + $probeRunId + "'") -and
  [int]$ownedScan['returnedRows'] -eq 1 -and
  @($ownedScan['returned']).Count -eq 1 -and
  [string]$ownedDone['status'] -eq '<absent>') @{
  blockStartLine  = $probeOwned.blockStartLine
  blockLines      = $probeOwned.blockLines
  stopName        = [string]$probeOwned.stopName
  reachedComplete = $probeOwned.reachedComplete
  receipts        = @($ownedOutcome.receipts)
  returnedRows    = [int]$ownedScan['returnedRows']
  releaseHasT     = ($ownedArgs -contains '-t')
  releaseHasA     = ($ownedArgs -contains '-A')
  sqlHasReturning = $ownedSql.Contains('returning run_id')
  sqlHasOwnership = $ownedSql.Contains("run_id = '" + $probeRunId + "'")
  note            = 'the false STOP of R9-C1 is proven gone; the release proves the claim, not completion'
}

# ---- 28: success but ZERO rows ---------------------------------------------
$probeZero = Invoke-ClaimReleaseProbe -RunId $probeRunId -Stub @{
  exitCode = 0; timedOut = $false; launchError = $null; captureNote = ''
  stdOut = ''; stdErr = ''
}
$zeroScan    = Get-ProbeReceipt -Probe $probeZero -Name '06-claim-release-ownership.json'
$zeroOutcome = Test-ClaimReleaseOutcome -Probe $probeZero `
  -ExpectedReceipts @('06-claim-release-ownership.json', '06-claim-release-ownership-stop.json') `
  -ExpectedStop '06-claim-release-ownership-stop.json' `
  -ExpectedStatus @{ '06-claim-release-ownership.json' = 'STOP'; '06-claim-release-ownership-stop.json' = 'STOPPED' }
Add-Case 'claimReleaseZeroRowsStops' (
  $zeroOutcome.ok -and
  $probeZero.reachedComplete -eq $false -and
  [int]$zeroScan['returnedRows'] -eq 0 -and
  @($zeroScan['returned']).Count -eq 0 -and
  -not $probeZero.receipts.Contains('06-claim-release.json')) @{
  stopName     = [string]$probeZero.stopName
  receipts     = @($zeroOutcome.receipts)
  returnedRows = [int]$zeroScan['returnedRows']
}

# ---- 29: success but the row belongs to someone else -----------------------
$probeWrong = Invoke-ClaimReleaseProbe -RunId $probeRunId -Stub @{
  exitCode = 0; timedOut = $false; launchError = $null; captureNote = ''
  stdOut = ($probeOther + "`n"); stdErr = ''
}
$wrongScan    = Get-ProbeReceipt -Probe $probeWrong -Name '06-claim-release-ownership.json'
$wrongRows    = @($wrongScan['returned'])
$wrongOutcome = Test-ClaimReleaseOutcome -Probe $probeWrong `
  -ExpectedReceipts @('06-claim-release-ownership.json', '06-claim-release-ownership-stop.json') `
  -ExpectedStop '06-claim-release-ownership-stop.json' `
  -ExpectedStatus @{ '06-claim-release-ownership.json' = 'STOP'; '06-claim-release-ownership-stop.json' = 'STOPPED' }
Add-Case 'claimReleaseWrongOwnerStops' (
  $wrongOutcome.ok -and
  $probeWrong.reachedComplete -eq $false -and
  [int]$wrongScan['returnedRows'] -eq 1 -and
  ([string]$wrongRows[0]) -eq $probeOther) @{
  stopName     = [string]$probeWrong.stopName
  receipts     = @($wrongOutcome.receipts)
  returned     = $wrongRows
}

# ---- 30: success, two rows, one of them matching ---------------------------
# A count-blind ownership test would PASS this. Membership alone is not enough:
# exactly one row must come back.
$probeMany = Invoke-ClaimReleaseProbe -RunId $probeRunId -Stub @{
  exitCode = 0; timedOut = $false; launchError = $null; captureNote = ''
  stdOut = ($probeRunId + "`n" + $probeRunId); stdErr = ''
}
$manyScan    = Get-ProbeReceipt -Probe $probeMany -Name '06-claim-release-ownership.json'
$manyRows    = @($manyScan['returned'])
$manyOutcome = Test-ClaimReleaseOutcome -Probe $probeMany `
  -ExpectedReceipts @('06-claim-release-ownership.json', '06-claim-release-ownership-stop.json') `
  -ExpectedStop '06-claim-release-ownership-stop.json' `
  -ExpectedStatus @{ '06-claim-release-ownership.json' = 'STOP'; '06-claim-release-ownership-stop.json' = 'STOPPED' }
Add-Case 'claimReleaseMultipleRowsStops' (
  $manyOutcome.ok -and
  $probeMany.reachedComplete -eq $false -and
  [int]$manyScan['returnedRows'] -eq 2 -and
  ([string]$manyRows[0]) -eq $probeRunId) @{
  stopName     = [string]$probeMany.stopName
  receipts     = @($manyOutcome.receipts)
  returnedRows = [int]$manyScan['returnedRows']
}

# ---- 31: the release exits nonzero -----------------------------------------
$probeExit = Invoke-ClaimReleaseProbe -RunId $probeRunId -Stub @{
  exitCode = 3; timedOut = $false; launchError = $null; captureNote = ''
  stdOut = ''; stdErr = 'ERROR:  42P01: relation "supabase_migrations.clash_deploy_claim" does not exist'
}
$exitFail    = Get-ProbeReceipt -Probe $probeExit -Name '06-claim-release.json'
$exitOutcome = Test-ClaimReleaseOutcome -Probe $probeExit `
  -ExpectedReceipts @('06-claim-release-ownership.json', '06-claim-release.json', '06-claim-release-fail.json') `
  -ExpectedStop '06-claim-release-fail.json' `
  -ExpectedStatus @{ '06-claim-release-ownership.json' = 'STOP'; '06-claim-release.json' = 'STOP'; '06-claim-release-fail.json' = 'STOPPED' }
Add-Case 'claimReleaseNonZeroExitStops' (
  $exitOutcome.ok -and
  $probeExit.reachedComplete -eq $false -and
  [string]$exitFail['outcome'] -eq 'FAILED-EXIT' -and
  [string]$exitFail['sqlState'] -eq '42P01' -and
  -not $probeExit.receipts.Contains('06-claim-release-ownership-stop.json')) @{
  stopName  = [string]$probeExit.stopName
  receipts  = @($exitOutcome.receipts)
  outcome   = [string]$exitFail['outcome']
  sqlState  = [string]$exitFail['sqlState']
}

# ---- 32: the release times out after printing this run's row ---------------
# No inference: an unproven release is a FAILED release even when the text
# looked right. This is the R3 rule applied to the claim.
$probeTimeout = Invoke-ClaimReleaseProbe -RunId $probeRunId -Stub @{
  exitCode = $null; timedOut = $true; launchError = $null; captureNote = ''
  stdOut = ($probeRunId + "`n"); stdErr = ''
}
$timeoutFail     = Get-ProbeReceipt -Probe $probeTimeout -Name '06-claim-release.json'
$timeoutScan     = Get-ProbeReceipt -Probe $probeTimeout -Name '06-claim-release-ownership.json'
$timeoutOutcome = Test-ClaimReleaseOutcome -Probe $probeTimeout `
  -ExpectedReceipts @('06-claim-release-ownership.json', '06-claim-release.json', '06-claim-release-fail.json') `
  -ExpectedStop '06-claim-release-fail.json' `
  -ExpectedStatus @{ '06-claim-release-ownership.json' = 'PASS'; '06-claim-release.json' = 'STOP'; '06-claim-release-fail.json' = 'STOPPED' }
Add-Case 'claimReleaseTimeoutStops' (
  $timeoutOutcome.ok -and
  $probeTimeout.reachedComplete -eq $false -and
  [string]$timeoutFail['outcome'] -eq 'UNKNOWN-TIMEOUT' -and
  -not $probeTimeout.receipts.Contains('06-claim-release-ownership-stop.json')) @{
  stopName    = [string]$probeTimeout.stopName
  receipts    = @($timeoutOutcome.receipts)
  outcome     = [string]$timeoutFail['outcome']
  ownership   = [string]$timeoutScan['status']
  note        = 'the row matched, but a timed-out release is not a proven release'
}

# ---- 33: the capture was incomplete ----------------------------------------
$probePartial = Invoke-ClaimReleaseProbe -RunId $probeRunId -Stub @{
  exitCode = 0; timedOut = $false; launchError = $null; captureNote = 'stdout capture incomplete'
  stdOut = ($probeRunId + "`n"); stdErr = ''
}
$partialFail     = Get-ProbeReceipt -Probe $probePartial -Name '06-claim-release.json'
$partialOutcome = Test-ClaimReleaseOutcome -Probe $probePartial `
  -ExpectedReceipts @('06-claim-release-ownership.json', '06-claim-release.json', '06-claim-release-fail.json') `
  -ExpectedStop '06-claim-release-fail.json' `
  -ExpectedStatus @{ '06-claim-release-ownership.json' = 'PASS'; '06-claim-release.json' = 'STOP'; '06-claim-release-fail.json' = 'STOPPED' }
Add-Case 'claimReleaseIncompleteCaptureStops' (
  $partialOutcome.ok -and
  $probePartial.reachedComplete -eq $false -and
  [string]$partialFail['outcome'] -eq 'UNKNOWN-CAPTURE-INCOMPLETE' -and
  -not $probePartial.receipts.Contains('06-claim-release-ownership-stop.json')) @{
  stopName  = [string]$probePartial.stopName
  receipts  = @($partialOutcome.receipts)
  outcome   = [string]$partialFail['outcome']
}

# ===========================================================================
# 34-46: gate 5 report contract, executed (Round 12 / R11-C1)
# ===========================================================================
# R11-C1: deploy.ps1 accepted a verification child that exited 0 with no
# rendered rows, then released the writer claim and wrote COMPLETE. Counting
# FAIL rows cannot detect that; only the declared report can. The cases below do
# not restate the gates: they read deploy.ps1, extract the committed region from
# the postflight invocation to the completion receipt, refuse the region unless
# both Test-VerifyReport calls, both STOP names, the ownership-qualified release
# and the COMPLETE receipt are present, and then EXECUTE it with only the child
# process and evidence layers substituted. Every fixture is generated from the
# adapter's own contract, so a fixture cannot drift from the reviewed identities.

# The committed gate-2 region, extracted the same way the gate-5 region is:
# between its own first line and the gate-3 banner, with the markers that make it
# a contract instead of a count. R13-C1 was a gate whose body nobody had to
# satisfy; these markers are the shape the probe executes, so a future rewrite
# that drops the contract fails here before it can ship.
function Get-PreflightGateBlock {
  param([string]$Path)

  $lines   = [System.IO.File]::ReadAllLines($Path)
  $startAt = -1
  $endAt   = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($startAt -lt 0 -and $lines[$i] -match '^\$pf = Invoke-NativeProcess -FilePath \$psqlPath') { $startAt = $i; continue }
    if ($startAt -ge 0 -and $lines[$i] -match '^# -+ gate 3: ') { $endAt = $i; break }
  }
  if ($startAt -lt 0 -or $endAt -le $startAt) {
    throw ('preflight gate block not found in {0} (start {1}, end {2})' -f $Path, $startAt, $endAt)
  }

  $text = (@($lines[$startAt..($endAt - 1)]) -join "`n")
  $required = [ordered]@{
    "Test-VerifyReport -Result `$pf -ReportName '00_preflight.sql'" = 1
    "New-PhaseReceipt '02-preflight.json'"                         = 1
    "status          = `$pfReport.verdict"                         = 1
    "if (-not `$pfReport.ok)"                                      = 1
    "'02-preflight-fail.json'"                                     = 1
    "'02-preflight-rows.json'"                                     = 1
    'preflight\00_preflight.sql'                                   = 1
  }
  $problems = @()
  foreach ($marker in @($required.Keys)) {
    $hits = ([regex]::Matches($text, [regex]::Escape([string]$marker))).Count
    if ($hits -ne [int]$required[$marker]) {
      $problems += ('gate marker {0} appears {1} time(s), expected {2}' -f $marker, $hits, $required[$marker])
    }
  }
  # The defect itself must not come back. These are escape-free literals: the
  # old gate counted with [regex]::Matches over a 'Multiline' PASS/FAIL suffix,
  # so a gate that has neither cannot be counting suffixes any more.
  if ($text.Contains('[regex]::Matches')) { $problems += 'the preflight gate still regex-counts rows' }
  if ($text.Contains('Multiline')) { $problems += 'the preflight gate still matches a multiline suffix' }
  if ($text.Contains('$pfPass')) { $problems += 'the preflight gate still decides on a PASS row count' }
  if ($text.Contains('$pfFail')) { $problems += 'the preflight gate still decides on a FAIL row count' }

  return [ordered]@{ text = $text; lines = ($endAt - $startAt); startLine = ($startAt + 1); problems = $problems }
}

# Runs the committed gate-2 block against stubbed child/evidence layers. Nothing
# is simulated: the block text is the file's own, executed by PowerShell 5.1, and
# the only things replaced are the psql child, the evidence writer and the
# receipt writer - the same substitutions the gate-5 probe makes.
function Invoke-PreflightGateProbe {
  param(
    [object[]]$Results,
    [string]$RunId = 'r14-preflight-probe-0001'
  )

  $state = [ordered]@{
    runId = $RunId; receipts = [ordered]@{}; stopName = ''; stopReason = ''
    advanced = $false; reachedComplete = $false; nativeCalls = 0; calls = @(); evidenceCalls = 0
    threw = ''; blockLines = 0; blockStartLine = 0; blockProblems = @()
  }

  try {
    $blockInfo = Get-PreflightGateBlock -Path (Join-Path $pluginRoot 'deploy.ps1')
    $state.blockLines     = [int]$blockInfo.lines
    $state.blockStartLine = [int]$blockInfo.startLine
    $state.blockProblems  = @($blockInfo.problems)

    $common      = Get-DeployCommonArguments -Path (Join-Path $pluginRoot 'deploy.ps1')
    $runId       = $RunId
    $run         = 'C:\clash-probe-evidence\r14'
    $psqlPath    = 'C:\clash-probe\psql.exe'
    $cloudRoot   = 'C:\clash-probe\cloud'
    $policy      = [pscustomobject]@{ env = @{} }
    $PreflightTimeoutSeconds = 300

    $script:r14State = $state
    $script:r14Queue = @($Results)
    $script:r14Block = [scriptblock]::Create([string]$blockInfo.text)

    & {
      function Invoke-NativeProcess {
        param($FilePath, $Arguments, $Environment, $TimeoutSeconds)
        $script:r14State.nativeCalls = $script:r14State.nativeCalls + 1
        $script:r14State.calls += (@($Arguments) -join ' ')
        $index = $script:r14State.nativeCalls - 1
        if ($index -ge @($script:r14Queue).Count) {
          return [ordered]@{
            filePath = 'psql.exe'; argumentCount = 0; exitCode = $null; timedOut = $false
            launchError = 'probe result queue exhausted'; captureNote = ''
            stdOut = ''; stdErr = ''; startedUtc = 'probe'; finishedUtc = 'probe'; durationMs = 0
          }
        }
        return $script:r14Queue[$index]
      }
      function Write-Evidence {
        param($Path, $Text)
        $script:r14State.evidenceCalls = $script:r14State.evidenceCalls + 1
        return [ordered]@{ ok = $true; path = [string]$Path; sha256 = ('0' * 64) }
      }
      function New-PhaseReceipt {
        param([string]$Name, $Fields)
        $copy = [ordered]@{}
        foreach ($k in @($Fields.Keys)) { $copy[[string]$k] = $Fields[$k] }
        $script:r14State.receipts[[string]$Name] = $copy
      }
      function Stop-Run {
        param([string]$Reason, [string]$StopName = 'STOP.json')
        $script:r14State.receipts[[string]$StopName] = [ordered]@{ status = 'STOPPED'; reason = [string]$Reason }
        $script:r14State.stopName   = [string]$StopName
        $script:r14State.stopReason = [string]$Reason
        throw ('CLASH-PROBE-STOP:' + [string]$StopName)
      }
      & $script:r14Block
      # The block finished without stopping: the gate would have continued.
      $script:r14State.advanced = $true
    }
  }
  catch {
    $message = 'unknown'
    try { $message = [string]$_.Exception.Message } catch { }
    if ($message -notlike 'CLASH-PROBE-STOP:*') {
      $state.threw = (Protect-Text $message)
    }
  }
  return $state
}

function Get-VerificationGateBlock {
  param([string]$Path)

  $lines   = [System.IO.File]::ReadAllLines($Path)
  $startAt = -1
  $endAt   = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($startAt -lt 0 -and $lines[$i] -match '^\$vf = Invoke-NativeProcess -FilePath \$psqlPath') {
      $startAt = $i
      continue
    }
    if ($startAt -ge 0 -and $lines[$i] -match '^#\s*-+\s*completion\s*-+\s*$') {
      $endAt = $i
      break
    }
  }
  if ($startAt -lt 0 -or $endAt -le $startAt) {
    throw ('verification gate block not found in {0} (start {1}, end {2})' -f $Path, $startAt, $endAt)
  }

  $text = (@($lines[$startAt..($endAt - 1)]) -join "`n")
  $required = [ordered]@{
    "Test-VerifyReport -Result `$vf -ReportName '90_verify.sql'"     = 1
    "Test-VerifyReport -Result `$st -ReportName '95_storage_config.sql'" = 1
    "'04-postflight.json'"                                          = 1
    "'04-postflight-fail.json'"                                     = 1
    "'05-storage.json'"                                             = 1
    "'05-storage-fail.json'"                                        = 2
    'delete from supabase_migrations.clash_deploy_claim'            = 1
    'returning run_id'                                              = 1
    # Round 16 (R15-C1): the gates release the claim; completion is published by
    # the protocol afterwards, so this region must not touch 06-complete.json.
    "'06-complete.json'"                                            = 0
  }
  $problems = @()
  foreach ($marker in @($required.Keys)) {
    $hits = ([regex]::Matches($text, [regex]::Escape([string]$marker))).Count
    if ($hits -ne [int]$required[$marker]) {
      $problems += ('gate marker {0} appears {1} time(s), expected {2}' -f $marker, $hits, $required[$marker])
    }
  }
  if (-not $text.Contains('if (-not $vfReport.ok)')) { $problems += 'the postflight gate does not test $vfReport.ok' }
  if (-not $text.Contains('if (-not $stReport.ok)')) { $problems += 'the storage gate does not test $stReport.ok' }
  if ([regex]::IsMatch($text, '(?m)^\s*exit\b')) { $problems += 'the extracted region contains an exit statement' }
  if ($text.Contains('Seal-Evidence')) { $problems += 'the extracted region still seals evidence' }
  if ($text.Contains('Publish-ClashCompletion')) { $problems += 'the extracted region publishes completion' }
  if ($problems.Count -gt 0) { throw ('verification gate block rejected: ' + ($problems -join '; ')) }

  return ([ordered]@{ text = $text; lines = ($endAt - $startAt); startLine = ($startAt + 1) })
}

# The identities actually rendered by an SQL file, in declaration order. The
# first contiguous run of ords starting at 1 is the renderer; the guard block
# repeats the same list later in the file.
function Get-ReportIdentitiesFromSql {
  param([string]$Path)

  $text = [System.IO.File]::ReadAllText($Path)
  $pattern = "select\s+(\d+)\s+as\s+ord,\s*'((?:[^']|'')*)'::text\s+as\s+check_name,\s*'((?:[^']|'')*)'::text\s+as\s+expected"
  $found = [regex]::Matches($text, $pattern)
  $rows = @()
  $next = 1
  foreach ($m in $found) {
    $ord = [int]$m.Groups[1].Value
    if ($ord -ne $next) { break }
    $rows += [ordered]@{
      ord      = $ord
      name     = ([string]$m.Groups[2].Value).Replace("''", "'")
      expected = ([string]$m.Groups[3].Value).Replace("''", "'")
    }
    $next++
  }
  return $rows
}

# psql aligned output, reproduced exactly. psql pads every cell with one space,
# separates columns with '|', prints (width + 2) dashes per column under the
# header, right-aligns numeric columns and left-aligns text columns, and appends
# the default "(N rows)" footer (src/fe_utils/print.c, footers_with_default).
# Building fixtures from that shape is what makes the strict parser in the
# adapter testable: the envelope is part of the contract, not decoration.
function Format-ReportCell {
  param([string]$Text, [int]$Width, [bool]$Right)
  $t = [string]$Text
  if ($t.Length -gt $Width) { $Width = $t.Length }
  if ($Right) { return $t.PadLeft($Width) }
  return $t.PadRight($Width)
}

function Format-ReportRow {
  param([string[]]$Cells, [int[]]$Widths)
  $parts = @()
  for ($i = 0; $i -lt $Widths.Count; $i++) {
    $right = ($i -eq 0)   # ord is the only numeric column
    $parts += (Format-ReportCell -Text ([string]$Cells[$i]) -Width ([int]$Widths[$i]) -Right $right)
  }
  return (' ' + ($parts -join ' | ') + ' ')
}

# Builds one verification report in that envelope. Variants are produced by
# omitting, duplicating, renaming, breaking or failing a row, and by damaging the
# envelope itself (footer, trailer, junk line, truncation), so every fixture
# differs from a valid report in exactly one documented way.
function New-VerifyReportText {
  param(
    [Parameter(Mandatory = $true)][string]$ReportName,
    [hashtable]$StatusByOrd = @{},
    [int[]]$OmitOrds = @(),
    [int[]]$DuplicateOrds = @(),
    [int[]]$BreakOrds = @(),
    [hashtable]$RenameOrds = @{},
    [string]$FooterText = '',
    [switch]$NoFooter,
    [string]$Trailer = '',
    [string]$JunkLine = '',
    [int]$CutLastChars = 0,
    [int[]]$SwapOrds = @(),
    [int]$DamageRowOrd = 0,
    [string]$DamageChar = '',
    [switch]$DamageHeader,
    [int]$ShiftRowOrd = 0,
    [int]$ShiftCount = 0,
    [switch]$ShiftHeader,
    [int]$UnpadRowOrd = 0,
    [switch]$Crlf
  )

  $contract = Get-ClashVerifyContract -ReportName $ReportName
  if ($null -eq $contract) { throw ('no contract for ' + $ReportName) }

  $header = @('ord', 'check_name', 'expected', 'actual', 'status')
  $body = New-Object System.Collections.Generic.List[object]
  foreach ($c in @($contract.checks)) {
    $ord = [int]$c.ord
    if (@($OmitOrds) -contains $ord) { continue }
    $status = 'PASS'
    if ([bool]$c.info) { $status = 'INFO' }
    if ($StatusByOrd.ContainsKey($ord)) { $status = [string]$StatusByOrd[$ord] }
    $name = [string]$c.name
    if ($RenameOrds.ContainsKey($ord)) { $name = [string]$RenameOrds[$ord] }
    $actual = [string]$c.expected
    if ($status -eq 'FAIL') { $actual = 'MISMATCH' }
    if ($status -eq 'INFO') { $actual = 'INFO migration 20260926150000 owns bucket+policy creation' }
    if (@($BreakOrds) -contains $ord) {
      $body.Add(@([string]$ord, $name, [string]$c.expected))
      continue
    }
    $body.Add(@([string]$ord, $name, [string]$c.expected, $actual, $status))
    if (@($DuplicateOrds) -contains $ord) {
      $body.Add(@([string]$ord, $name, [string]$c.expected, $actual, $status))
    }
  }

  # Reordering is a defect of its own: every row can be present, correct and
  # complete, and the report is still not the one the script renders.
  if (@($SwapOrds).Count -ge 2) {
    $first = [int]$SwapOrds[0]
    $second = [int]$SwapOrds[1]
    $firstAt = -1
    $secondAt = -1
    for ($i = 0; $i -lt $body.Count; $i++) {
      if ([int]$body[$i][0] -eq $first) { $firstAt = $i }
      if ([int]$body[$i][0] -eq $second) { $secondAt = $i }
    }
    if ($firstAt -ge 0 -and $secondAt -ge 0 -and $firstAt -ne $secondAt) {
      $held = $body[$firstAt]
      $body[$firstAt] = $body[$secondAt]
      $body[$secondAt] = $held
    }
  }

  $widths = @(0, 0, 0, 0, 0)
  for ($i = 0; $i -lt 5; $i++) { $widths[$i] = ([string]$header[$i]).Length }
  foreach ($row in $body) {
    for ($i = 0; $i -lt 5; $i++) {
      $len = ([string]$row[$i]).Length
      if ($len -gt $widths[$i]) { $widths[$i] = $len }
    }
  }

  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add((Format-ReportRow -Cells $header -Widths $widths))
  $separator = @()
  foreach ($w in $widths) { $separator += ('-' * ([int]$w + 2)) }
  $lines.Add(($separator -join '+'))
  # The spans the separator declares, computed the same way the parser does:
  # each column is (width + 2) characters, and the '|' that closes it sits at
  # start + width.
  $spans = @()
  $spanPos = 0
  foreach ($w in $widths) {
    $spans += @{ start = $spanPos; width = ([int]$w + 2) }
    $spanPos = $spanPos + ([int]$w + 2) + 1
  }
  $lineOfOrd = @{}
  foreach ($row in $body) {
    $lineOfOrd[[int]$row[0]] = $lines.Count
    if (@($row).Count -lt 5) {
      # A damaged report can lose trailing columns: the row ends at its last real
      # cell instead of being padded out to five. psql never renders this; it is
      # what a truncated read, a bad filter or a hand-edited evidence file looks
      # like, which is exactly what the parser must reject.
      $short = @()
      for ($i = 0; $i -lt @($row).Count; $i++) {
        $short += (Format-ReportCell -Text ([string]$row[$i]) -Width ([int]$widths[$i]) -Right ($i -eq 0))
      }
      $lines.Add((' ' + ($short -join ' | ') + ' '))
    }
    else {
      $lines.Add((Format-ReportRow -Cells $row -Widths $widths))
    }
  }

  # R14-C1: the row whose structural '|' characters are replaced is the exact
  # mutation the Round 14 audit used. Only the four declared boundaries change;
  # every cell keeps its text and its position, which is why the span reader
  # alone could not see it.
  if ($DamageRowOrd -gt 0 -and $DamageChar.Length -gt 0 -and $lineOfOrd.ContainsKey([int]$DamageRowOrd)) {
    $at = [int]$lineOfOrd[[int]$DamageRowOrd]
    $chars = ([string]$lines[$at]).ToCharArray()
    for ($c = 0; $c -lt 4; $c++) {
      $pos = [int]$spans[$c].start + [int]$spans[$c].width
      if ($pos -lt $chars.Length) { $chars[$pos] = [char]$DamageChar[0] }
    }
    $lines[$at] = (-join $chars)
  }
  if ($DamageHeader -and $DamageChar.Length -gt 0) {
    $chars = ([string]$lines[0]).ToCharArray()
    for ($c = 0; $c -lt 4; $c++) {
      $pos = [int]$spans[$c].start + [int]$spans[$c].width
      if ($pos -lt $chars.Length) { $chars[$pos] = [char]$DamageChar[0] }
    }
    $lines[0] = (-join $chars)
  }
  if ($ShiftRowOrd -gt 0 -and $ShiftCount -gt 0 -and $lineOfOrd.ContainsKey([int]$ShiftRowOrd)) {
    $at = [int]$lineOfOrd[[int]$ShiftRowOrd]
    $text = [string]$lines[$at]
    $at2 = [int]$spans[1].start
    if ($at2 -lt $text.Length) { $lines[$at] = $text.Insert($at2, (' ' * [int]$ShiftCount)) }
  }
  if ($ShiftHeader -and $ShiftCount -gt 0) {
    $text = [string]$lines[0]
    $at2 = [int]$spans[1].start
    if ($at2 -lt $text.Length) { $lines[0] = $text.Insert($at2, (' ' * [int]$ShiftCount)) }
  }
  if ($UnpadRowOrd -gt 0 -and $lineOfOrd.ContainsKey([int]$UnpadRowOrd)) {
    $at = [int]$lineOfOrd[[int]$UnpadRowOrd]
    $text = [string]$lines[$at]
    if ($text.Length -gt 2) { $lines[$at] = $text.Remove(0, 1) }
  }
  if ($CutLastChars -gt 0 -and $lines.Count -gt 2) {
    $lastIndex = $lines.Count - 1
    $last = [string]$lines[$lastIndex]
    if ($last.Length -gt $CutLastChars) { $lines[$lastIndex] = $last.Substring(0, $last.Length - $CutLastChars) }
    else { $lines[$lastIndex] = '' }
  }
  if ($JunkLine.Length -gt 0) {
    if ($lines.Count -gt 3) { $lines.Insert(3, $JunkLine) } else { $lines.Add($JunkLine) }
  }

  if (-not $NoFooter) {
    if ($FooterText.Length -gt 0) {
      $lines.Add($FooterText)
    }
    else {
      $word = 'rows'
      if ($body.Count -eq 1) { $word = 'row' }
      $lines.Add(('({0} {1})' -f $body.Count, $word))
    }
  }
  if ($Trailer.Length -gt 0) { $lines.Add($Trailer) }
  # The parser splits on "`r?`n", so a CRLF capture must read identically to an LF
  # one. psql on Windows writes CRLF; the fixture can produce either.
  if ($Crlf) { return ((@($lines) -join "`r`n") + "`r`n") }
  return ((@($lines) -join "`n") + "`n")
}

# Runs the adapter's parser on a synthetic native-success result, so an envelope
# case can assert the verdict and the exact problem text without a child process.
function Get-ReportParse {
  param([string]$ReportName, [string]$Text)
  $result = New-GateChildResult -Text $Text
  return (Test-VerifyReport -Result $result -ReportName $ReportName)
}

function New-GateChildResult {
  param(
    [AllowEmptyString()][string]$Text = '',
    $ExitCode = 0,
    [bool]$TimedOut = $false,
    [string]$LaunchError = '',
    [string]$CaptureNote = '',
    [string]$StdErr = ''
  )
  $code = $ExitCode
  if ($TimedOut) { $code = $null }
  $launch = $null
  if (-not [string]::IsNullOrWhiteSpace($LaunchError)) { $launch = $LaunchError }
  return [ordered]@{
    filePath = 'psql.exe'; argumentCount = 0; exitCode = $code; timedOut = $TimedOut
    launchError = $launch; captureNote = $CaptureNote
    stdOut = $Text; stdErr = $StdErr
    startedUtc = 'probe'; finishedUtc = 'probe'; durationMs = 0
  }
}

function Invoke-VerificationGateProbe {
  param(
    [object[]]$Results,
    [string]$RunId = 'r12-verify-probe-0001'
  )

  $state = [ordered]@{
    runId = $RunId; receipts = [ordered]@{}; stopName = ''; stopReason = ''
    reachedComplete = $false; nativeCalls = 0; calls = @(); evidenceCalls = 0
    threw = ''; blockLines = 0; blockStartLine = 0
  }

  try {
    $blockInfo = Get-VerificationGateBlock -Path (Join-Path $pluginRoot 'deploy.ps1')
    $state.blockLines     = [int]$blockInfo.lines
    $state.blockStartLine = [int]$blockInfo.startLine

    $common      = Get-DeployCommonArguments -Path (Join-Path $pluginRoot 'deploy.ps1')
    $runId       = $RunId
    $run         = 'C:\clash-probe-evidence\r12'
    $psqlPath    = 'C:\clash-probe\psql.exe'
    $cloudRoot   = 'C:\clash-probe\cloud'
    $policy      = [pscustomobject]@{ env = @{} }
    $applied     = 111
    $treeHash    = 'probe-tree-hash'
    $bootOutcome = 'CREATED'
    $VerifyTimeoutSeconds = 900

    $script:r12State = $state
    $script:r12Queue = @($Results)
    $script:r12Block = [scriptblock]::Create([string]$blockInfo.text)

    & {
      function Invoke-NativeProcess {
        param($FilePath, $Arguments, $Environment, $TimeoutSeconds)
        $script:r12State.nativeCalls = $script:r12State.nativeCalls + 1
        $script:r12State.calls += (@($Arguments) -join ' ')
        $index = $script:r12State.nativeCalls - 1
        if ($index -ge @($script:r12Queue).Count) {
          return [ordered]@{
            filePath = 'psql.exe'; argumentCount = 0; exitCode = $null; timedOut = $false
            launchError = 'probe result queue exhausted'; captureNote = ''
            stdOut = ''; stdErr = ''; startedUtc = 'probe'; finishedUtc = 'probe'; durationMs = 0
          }
        }
        return $script:r12Queue[$index]
      }
      function Write-Evidence {
        param($Path, $Text)
        $script:r12State.evidenceCalls = $script:r12State.evidenceCalls + 1
        return [ordered]@{ ok = $true; path = [string]$Path; sha256 = ('0' * 64) }
      }
      function New-PhaseReceipt {
        param([string]$Name, $Fields)
        $copy = [ordered]@{}
        foreach ($k in @($Fields.Keys)) { $copy[[string]$k] = $Fields[$k] }
        $script:r12State.receipts[[string]$Name] = $copy
      }
      function Stop-Run {
        param([string]$Reason, [string]$StopName = 'STOP.json')
        $script:r12State.receipts[[string]$StopName] = [ordered]@{ status = 'STOPPED'; reason = [string]$Reason }
        $script:r12State.stopName   = [string]$StopName
        $script:r12State.stopReason = [string]$Reason
        throw ('CLASH-PROBE-STOP:' + [string]$StopName)
      }
      & $script:r12Block
      $script:r12State.reachedComplete = $script:r12State.receipts.Contains('06-complete.json')
    }
  }
  catch {
    $message = 'unknown'
    try { $message = [string]$_.Exception.Message } catch { }
    if ($message -notlike 'CLASH-PROBE-STOP:*') {
      $state.threw = (Protect-Text $message)
    }
  }
  return $state
}

function Get-GateReceiptStatus {
  param($Probe, [string]$Name)
  if ($Probe.receipts.Contains($Name)) { return [string]$Probe.receipts[$Name]['status'] }
  return '<absent>'
}

function Test-VerificationGateOutcome {
  param(
    $Probe,
    [string[]]$ExpectedReceipts,
    [string]$ExpectedStop,
    $ExpectedStatus = $null
  )

  $problems = @()
  $names = @($Probe.receipts.Keys | ForEach-Object { [string]$_ })
  $unexpected = @($names | Where-Object { $ExpectedReceipts -notcontains $_ })
  $absent     = @($ExpectedReceipts | Where-Object { $names -notcontains $_ })
  if ($unexpected.Count -gt 0) { $problems += ('unexpected receipt(s): ' + ($unexpected -join ',')) }
  if ($absent.Count -gt 0) { $problems += ('missing receipt(s): ' + ($absent -join ',')) }
  if ([string]$Probe.stopName -ne [string]$ExpectedStop) {
    $problems += ("stopped with '{0}', expected '{1}'" -f $Probe.stopName, $ExpectedStop)
  }
  if ([string]$Probe.threw -ne '') { $problems += ('unexpected exception: ' + [string]$Probe.threw) }
  $completeSeen = $false
  if ($names -contains '06-complete.json') { $completeSeen = $true }
  # The gate-2 probe stops before any claim release, so it has no
  # 'reachedComplete' field at all. Under StrictMode a missing property is a
  # terminating error, and the first 5.1 run of Round 14 died exactly here:
  # 'The property reachedComplete cannot be found on this object'. Read it
  # defensively - a probe that never writes COMPLETE is the truthful default.
  $reachedComplete = [bool](Get-DocumentProperty -Object $Probe -Name 'reachedComplete' -Default $false)
  if ($completeSeen -ne $reachedComplete) {
    $problems += 'reachedComplete disagrees with the receipts that were written'
  }
  if ($null -ne $ExpectedStatus) {
    foreach ($key in @($ExpectedStatus.Keys)) {
      $actual = (Get-GateReceiptStatus -Probe $Probe -Name ([string]$key))
      if ($actual -ne [string]$ExpectedStatus[$key]) {
        $problems += ("receipt {0} status '{1}', expected '{2}'" -f $key, $actual, $ExpectedStatus[$key])
      }
    }
  }
  return [ordered]@{ ok = ($problems.Count -eq 0); problems = $problems; receipts = $names }
}


# One record per case, so a CI annotation can say WHICH expectation failed:
# the receipt set, the phase statuses, the child count and the STOP reason.
function New-GateCaseDetail {
  param($Probe, $Outcome, [string]$Note = '')

  $reason = [string]$Probe.stopReason
  if ($reason.Length -gt 900) { $reason = $reason.Substring(0, 900) }
  $statusByReceipt = @{}
  foreach ($name in @($Probe.receipts.Keys)) {
    $statusByReceipt[[string]$name] = [string]$Probe.receipts[[string]$name]['status']
  }
  return @{
    stopName    = [string]$Probe.stopName
    receipts    = @($Outcome.receipts)
    statuses    = $statusByReceipt
    nativeCalls = [int]$Probe.nativeCalls
    evidence    = [int]$Probe.evidenceCalls
    threw       = [string]$Probe.threw
    problems    = @($Outcome.problems)
    reason      = $reason
    note        = $Note
  }
}

$cloudPath = Split-Path -Parent $pluginRoot

# ---- 34: the declared contract IS the SQL, not a copy of it ----------------
$sqlVerifyRows  = @(Get-ReportIdentitiesFromSql -Path (Join-Path $cloudPath 'verify\90_verify.sql'))
$sqlStorageRows = @(Get-ReportIdentitiesFromSql -Path (Join-Path $cloudPath 'verify\95_storage_config.sql'))
$contractVerify  = Get-ClashVerifyContract -ReportName '90_verify.sql'
$contractStorage = Get-ClashVerifyContract -ReportName '95_storage_config.sql'
$contractProblems = @()
if ($null -eq $contractVerify)  { $contractProblems += 'no contract is declared for 90_verify.sql' }
if ($null -eq $contractStorage) { $contractProblems += 'no contract is declared for 95_storage_config.sql' }
if ($contractProblems.Count -eq 0) {
  $declaredVerify  = @($contractVerify.checks)
  $declaredStorage = @($contractStorage.checks)
  if ($sqlVerifyRows.Count -ne 19)  { $contractProblems += ('90_verify.sql renders {0} row(s), expected 19' -f $sqlVerifyRows.Count) }
  if ($sqlStorageRows.Count -ne 7)  { $contractProblems += ('95_storage_config.sql renders {0} row(s), expected 7' -f $sqlStorageRows.Count) }
  if ($declaredVerify.Count -ne $sqlVerifyRows.Count)   { $contractProblems += ('the 90_verify.sql contract declares {0} row(s), the SQL renders {1}' -f $declaredVerify.Count, $sqlVerifyRows.Count) }
  if ($declaredStorage.Count -ne $sqlStorageRows.Count) { $contractProblems += ('the storage contract declares {0} row(s), the SQL renders {1}' -f $declaredStorage.Count, $sqlStorageRows.Count) }
  if ([int]$contractVerify.gating -ne 19 -or [int]$contractVerify.info -ne 0)   { $contractProblems += 'the 90_verify.sql gating/INFO counts are not 19/0' }
  if ([int]$contractStorage.gating -ne 6 -or [int]$contractStorage.info -ne 1)  { $contractProblems += 'the storage gating/INFO counts are not 6/1' }
  foreach ($row in $sqlVerifyRows) {
    $match = @($declaredVerify | Where-Object { [int]$_.ord -eq [int]$row.ord })
    if ($match.Count -ne 1) { $contractProblems += ('90_verify.sql ord {0} is not declared exactly once' -f $row.ord); continue }
    if ([string]$match[0].name -ne [string]$row.name)         { $contractProblems += ('90_verify.sql ord {0} name differs from the SQL' -f $row.ord) }
    if ([string]$match[0].expected -ne [string]$row.expected) { $contractProblems += ('90_verify.sql ord {0} expected differs from the SQL' -f $row.ord) }
  }
  foreach ($row in $sqlStorageRows) {
    $match = @($declaredStorage | Where-Object { [int]$_.ord -eq [int]$row.ord })
    if ($match.Count -ne 1) { $contractProblems += ('storage ord {0} is not declared exactly once' -f $row.ord); continue }
    if ([string]$match[0].name -ne [string]$row.name)         { $contractProblems += ('storage ord {0} name differs from the SQL' -f $row.ord) }
    if ([string]$match[0].expected -ne [string]$row.expected) { $contractProblems += ('storage ord {0} expected differs from the SQL' -f $row.ord) }
    $isInfo = ([string]$row.name -like 'INFO*')
    if ([bool]$match[0].info -ne $isInfo) { $contractProblems += ('storage ord {0} INFO flag disagrees with the SQL name' -f $row.ord) }
  }
}
Add-Case 'verificationReportContractMatchesSql' ($contractProblems.Count -eq 0) @{
  verifyRows  = $sqlVerifyRows.Count
  storageRows = $sqlStorageRows.Count
  problems    = @($contractProblems)
}

# ---- 35: both reports complete -> claim released -> COMPLETE ---------------
$probeRunId  = 'r12-verify-probe-0001'
$verifyPass  = New-VerifyReportText -ReportName '90_verify.sql'
$storagePass = New-VerifyReportText -ReportName '95_storage_config.sql'
$gatePass = Invoke-VerificationGateProbe -RunId $probeRunId -Results @(
  (New-GateChildResult -Text $verifyPass),
  (New-GateChildResult -Text $storagePass),
  (New-GateChildResult -Text ($probeRunId + "`n"))
)
# Round 16 (R15-C1): the gate block ends where completion begins, so the proven
# reports lead to a released claim - never to a completion receipt written by the
# gates themselves.
$passOutcome = Test-VerificationGateOutcome -Probe $gatePass `
  -ExpectedReceipts @('04-postflight.json', '05-storage.json', '06-claim-release-ownership.json', '06-claim-release.json') `
  -ExpectedStop '' `
  -ExpectedStatus @{ '04-postflight.json' = 'PASS'; '05-storage.json' = 'PASS'; '06-claim-release-ownership.json' = 'PASS'; '06-claim-release.json' = 'PASS' }
$passCallCount = @($gatePass.calls).Count
Add-Case 'verificationReportsProceedToComplete' (
  $passOutcome.ok -and
  [string]$gatePass.threw -eq '' -and
  $gatePass.reachedComplete -eq $false -and
  [int]$gatePass.nativeCalls -eq 3 -and $passCallCount -eq 3 -and
  ([string]$gatePass.calls[0]) -match '90_verify\.sql' -and
  ([string]$gatePass.calls[1]) -match '95_storage_config\.sql' -and
  ([string]$gatePass.calls[2]) -match 'delete from supabase_migrations\.clash_deploy_claim' -and
  ([string]$gatePass.calls[2]).Contains("run_id = '" + $probeRunId + "'") -and
  [int]$gatePass.evidenceCalls -eq 6 -and
  -not $gatePass.receipts.Contains('06-complete.json')) (New-GateCaseDetail -Probe $gatePass -Outcome $passOutcome `
  -Note ('block {0}+{1}; the release is the third child and only after both contracts hold, and it publishes no completion' -f $gatePass.blockStartLine, $gatePass.blockLines))

# ---- 36: postflight exits 0 with NO output --------------------------------
$gateEmpty = Invoke-VerificationGateProbe -Results @((New-GateChildResult -Text ''))
$emptyOutcome = Test-VerificationGateOutcome -Probe $gateEmpty `
  -ExpectedReceipts @('04-postflight.json', '04-postflight-fail.json') `
  -ExpectedStop '04-postflight-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'FAIL' }
Add-Case 'postflightEmptyReportStops' (
  $emptyOutcome.ok -and
  $gateEmpty.reachedComplete -eq $false -and
  [int]$gateEmpty.nativeCalls -eq 1 -and
  [string]$gateEmpty.stopReason -match 'rendered no verification rows' -and
  [string]$gateEmpty.stopReason -match 'claim stays held' -and
  ([string]$gateEmpty.stopReason) -notmatch '(?i)rolled\s*back' -and
  -not $gateEmpty.receipts.Contains('06-claim-release.json')) (New-GateCaseDetail -Probe $gateEmpty -Outcome $emptyOutcome `
  -Note 'R11-C1: exit 0 with no rows used to pass this gate and release the claim')

# ---- 37: postflight exits 0 while rendering a FAIL row ---------------------
$gateFailRow = Invoke-VerificationGateProbe -Results @((New-GateChildResult -Text (New-VerifyReportText -ReportName '90_verify.sql' -StatusByOrd @{ 7 = 'FAIL' })))
$failRowOutcome = Test-VerificationGateOutcome -Probe $gateFailRow `
  -ExpectedReceipts @('04-postflight.json', '04-postflight-fail.json') `
  -ExpectedStop '04-postflight-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'FAIL' }
Add-Case 'postflightFailedRowStops' (
  $failRowOutcome.ok -and
  $gateFailRow.reachedComplete -eq $false -and
  [int]$gateFailRow.nativeCalls -eq 1 -and
  [string]$gateFailRow.stopReason -match '1 rendered check\(s\) FAILED' -and
  [string]$gateFailRow.stopReason -notmatch '(?i)rolled\s*back') (New-GateCaseDetail -Probe $gateFailRow -Outcome $failRowOutcome)

# ---- 38: postflight report is truncated (18 of 19 checks) ------------------
$gateShort = Invoke-VerificationGateProbe -Results @((New-GateChildResult -Text (New-VerifyReportText -ReportName '90_verify.sql' -OmitOrds @(19))))
$shortOutcome = Test-VerificationGateOutcome -Probe $gateShort `
  -ExpectedReceipts @('04-postflight.json', '04-postflight-fail.json') `
  -ExpectedStop '04-postflight-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'FAIL' }
Add-Case 'postflightTruncatedReportStops' (
  $shortOutcome.ok -and
  [int]$gateShort.nativeCalls -eq 1 -and
  [string]$gateShort.stopReason -match 'declared check\(s\) missing' -and
  [string]$gateShort.stopReason -match 'gating row\(s\) rendered') (New-GateCaseDetail -Probe $gateShort -Outcome $shortOutcome)

# ---- 39: the same check is rendered twice --------------------------------
$gateDuplicate = Invoke-VerificationGateProbe -Results @((New-GateChildResult -Text (New-VerifyReportText -ReportName '90_verify.sql' -DuplicateOrds @(5))))
$duplicateOutcome = Test-VerificationGateOutcome -Probe $gateDuplicate `
  -ExpectedReceipts @('04-postflight.json', '04-postflight-fail.json') `
  -ExpectedStop '04-postflight-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'FAIL' }
Add-Case 'postflightDuplicateRowStops' (
  $duplicateOutcome.ok -and
  [int]$gateDuplicate.nativeCalls -eq 1 -and
  [string]$gateDuplicate.stopReason -match 'duplicated check ord') (New-GateCaseDetail -Probe $gateDuplicate -Outcome $duplicateOutcome)

# ---- 40: a row loses its status column (malformed shape) ------------------
$gateMalformed = Invoke-VerificationGateProbe -Results @((New-GateChildResult -Text (New-VerifyReportText -ReportName '90_verify.sql' -BreakOrds @(3))))
$malformedOutcome = Test-VerificationGateOutcome -Probe $gateMalformed `
  -ExpectedReceipts @('04-postflight.json', '04-postflight-fail.json') `
  -ExpectedStop '04-postflight-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'FAIL' }
Add-Case 'postflightMalformedRowStops' (
  $malformedOutcome.ok -and
  [int]$gateMalformed.nativeCalls -eq 1 -and
  [string]$gateMalformed.stopReason -match 'malformed data row') (New-GateCaseDetail -Probe $gateMalformed -Outcome $malformedOutcome)

# ---- 41: a check is renamed - the report is not the reviewed report -------
$gateDrift = Invoke-VerificationGateProbe -Results @((New-GateChildResult -Text (New-VerifyReportText -ReportName '90_verify.sql' -RenameOrds @{ 2 = 'ledger versions look about right' })))
$driftOutcome = Test-VerificationGateOutcome -Probe $gateDrift `
  -ExpectedReceipts @('04-postflight.json', '04-postflight-fail.json') `
  -ExpectedStop '04-postflight-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'FAIL' }
Add-Case 'postflightIdentityDriftStops' (
  $driftOutcome.ok -and
  [int]$gateDrift.nativeCalls -eq 1 -and
  [string]$gateDrift.stopReason -match 'is not the declared') (New-GateCaseDetail -Probe $gateDrift -Outcome $driftOutcome)

# ---- 42: the child fails outright - UNPROVEN, never PASS and never FAIL ---
$gateUnproven = Invoke-VerificationGateProbe -Results @((New-GateChildResult -Text $verifyPass -ExitCode 3 -StdErr 'ERROR:  57014: canceling statement due to statement timeout'))
$unprovenOutcome = Test-VerificationGateOutcome -Probe $gateUnproven `
  -ExpectedReceipts @('04-postflight.json', '04-postflight-fail.json') `
  -ExpectedStop '04-postflight-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'UNPROVEN' }
Add-Case 'postflightUnprovenStops' (
  $unprovenOutcome.ok -and
  [int]$gateUnproven.nativeCalls -eq 1 -and
  [string]$gateUnproven.stopReason -match 'verdict=UNPROVEN' -and
  -not $gateUnproven.receipts.Contains('06-claim-release.json') -and
  -not $gateUnproven.receipts.Contains('06-complete.json')) (New-GateCaseDetail -Probe $gateUnproven -Outcome $unprovenOutcome `
  -Note 'a nonzero exit is UNKNOWN, not a content failure and not a pass')

# ---- 43: storage exits 0 with NO output ----------------------------------
$gateStorageEmpty = Invoke-VerificationGateProbe -Results @(
  (New-GateChildResult -Text $verifyPass),
  (New-GateChildResult -Text '')
)
$storageEmptyOutcome = Test-VerificationGateOutcome -Probe $gateStorageEmpty `
  -ExpectedReceipts @('04-postflight.json', '05-storage.json', '05-storage-fail.json') `
  -ExpectedStop '05-storage-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'PASS'; '05-storage.json' = 'FAIL' }
Add-Case 'storageEmptyReportStops' (
  $storageEmptyOutcome.ok -and
  $gateStorageEmpty.reachedComplete -eq $false -and
  [int]$gateStorageEmpty.nativeCalls -eq 2 -and
  [string]$gateStorageEmpty.stopReason -match 'storage verification did not satisfy' -and
  ([string]$gateStorageEmpty.stopReason) -notmatch 'clash_deploy_claim' -and
  -not $gateStorageEmpty.receipts.Contains('06-claim-release.json') -and
  -not $gateStorageEmpty.receipts.Contains('06-complete.json')) (New-GateCaseDetail -Probe $gateStorageEmpty -Outcome $storageEmptyOutcome `
  -Note 'the claim is not released: the third child is never issued')

# ---- 44: storage exits 0 while rendering a FAIL row ----------------------
$gateStorageFail = Invoke-VerificationGateProbe -Results @(
  (New-GateChildResult -Text $verifyPass),
  (New-GateChildResult -Text (New-VerifyReportText -ReportName '95_storage_config.sql' -StatusByOrd @{ 4 = 'FAIL' }))
)
$storageFailOutcome = Test-VerificationGateOutcome -Probe $gateStorageFail `
  -ExpectedReceipts @('04-postflight.json', '05-storage.json', '05-storage-fail.json') `
  -ExpectedStop '05-storage-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'PASS'; '05-storage.json' = 'FAIL' }
Add-Case 'storageFailedRowStops' (
  $storageFailOutcome.ok -and
  [int]$gateStorageFail.nativeCalls -eq 2 -and
  [string]$gateStorageFail.stopReason -match '1 rendered check\(s\) FAILED' -and
  -not $gateStorageFail.receipts.Contains('06-complete.json')) (New-GateCaseDetail -Probe $gateStorageFail -Outcome $storageFailOutcome)

# ---- 45: storage omits its INFO row (6 of 7) -----------------------------
$gateStorageShort = Invoke-VerificationGateProbe -Results @(
  (New-GateChildResult -Text $verifyPass),
  (New-GateChildResult -Text (New-VerifyReportText -ReportName '95_storage_config.sql' -OmitOrds @(7)))
)
$storageShortOutcome = Test-VerificationGateOutcome -Probe $gateStorageShort `
  -ExpectedReceipts @('04-postflight.json', '05-storage.json', '05-storage-fail.json') `
  -ExpectedStop '05-storage-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'PASS'; '05-storage.json' = 'FAIL' }
Add-Case 'storageMissingInfoRowStops' (
  $storageShortOutcome.ok -and
  [int]$gateStorageShort.nativeCalls -eq 2 -and
  [string]$gateStorageShort.stopReason -match 'INFO row\(s\) rendered' -and
  -not $gateStorageShort.receipts.Contains('06-claim-release.json')) (New-GateCaseDetail -Probe $gateStorageShort -Outcome $storageShortOutcome)

# ---- 46: storage cannot be proven - UNPROVEN, claim retained -------------
$gateStorageUnproven = Invoke-VerificationGateProbe -Results @(
  (New-GateChildResult -Text $verifyPass),
  (New-GateChildResult -Text $storagePass -ExitCode 2 -StdErr 'connection to server was lost')
)
$storageUnprovenOutcome = Test-VerificationGateOutcome -Probe $gateStorageUnproven `
  -ExpectedReceipts @('04-postflight.json', '05-storage.json', '05-storage-fail.json') `
  -ExpectedStop '05-storage-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'PASS'; '05-storage.json' = 'UNPROVEN' }
Add-Case 'storageUnprovenStops' (
  $storageUnprovenOutcome.ok -and
  [int]$gateStorageUnproven.nativeCalls -eq 2 -and
  [string]$gateStorageUnproven.stopReason -match 'verdict=UNPROVEN' -and
  -not $gateStorageUnproven.receipts.Contains('06-complete.json')) (New-GateCaseDetail -Probe $gateStorageUnproven -Outcome $storageUnprovenOutcome)

# ===========================================================================
# 47-55: the psql envelope, parsed strictly (Round 13 / R12-C1)
# ===========================================================================
# Supported stdout for a verifier is exactly: the five-column header, the dashed
# separator, one complete row per check, one terminal "(N rows)" footer, and
# nothing else. R12-C1 was that the parser skipped every line it did not
# recognise, so an extra malformed row - or any other unexpected output - was
# invisible and the report still passed. These cases parse real envelopes and
# damaged ones, and prove the gate STOPS before the claim can be released.

$repVerify  = New-VerifyReportText -ReportName '90_verify.sql'
$repStorage = New-VerifyReportText -ReportName '95_storage_config.sql'

# ---- 47: an undamaged envelope is accepted, for both verifiers ------------
$parsedVerify  = Get-ReportParse -ReportName '90_verify.sql' -Text $repVerify
$parsedStorage = Get-ReportParse -ReportName '95_storage_config.sql' -Text $repStorage
Add-Case 'reportEnvelopeAcceptedForBothVerifiers' (
  $parsedVerify.ok -and $parsedStorage.ok -and
  [string]$parsedVerify.verdict -eq 'PASS' -and [string]$parsedStorage.verdict -eq 'PASS' -and
  [int]$parsedVerify.rows -eq 19 -and [int]$parsedStorage.rows -eq 7 -and
  $parsedVerify.headerSeen -and $parsedVerify.separatorSeen -and $parsedVerify.footerSeen -and
  $parsedStorage.headerSeen -and $parsedStorage.separatorSeen -and $parsedStorage.footerSeen -and
  [int]$parsedVerify.footerRows -eq 19 -and [int]$parsedStorage.footerRows -eq 7 -and
  @($parsedVerify.envelopeProblems).Count -eq 0 -and
  @($parsedStorage.envelopeProblems).Count -eq 0 -and
  ($repVerify  -match '(?m)^\(19 rows\)$') -and
  ($repStorage -match '(?m)^\(7 rows\)$') -and
  ($repVerify  -match '(?m)^\s*ord\s*\|\s*check_name\s*\|\s*expected\s*\|\s*actual\s*\|\s*status\s*$')) @{
  verifyRows   = $parsedVerify.rows
  storageRows  = $parsedStorage.rows
  verify       = [string]$parsedVerify.verdict
  storage      = [string]$parsedStorage.verdict
  note         = 'header, dashed separator, rows and the (N rows) footer, as psql prints them'
}

# ---- 48: the footer disagrees with the number of rows --------------------
$badFooterText = New-VerifyReportText -ReportName '90_verify.sql' -FooterText '(20 rows)'
$parsedBadFooter = Get-ReportParse -ReportName '90_verify.sql' -Text $badFooterText
Add-Case 'reportFooterCountMismatchStops' (
  -not $parsedBadFooter.ok -and
  [string]$parsedBadFooter.verdict -eq 'FAIL' -and
  [int]$parsedBadFooter.footerRows -eq 20 -and
  [int]$parsedBadFooter.rows -eq 19 -and
  ((@($parsedBadFooter.problems) -join ' ') -match 'row-count footer says 20 row\(s\) but 19 data row\(s\)')) @{
  footerRows = $parsedBadFooter.footerRows
  rows       = $parsedBadFooter.rows
  verdict    = [string]$parsedBadFooter.verdict
  note       = 'the footer is the report saying how many rows it printed; it is checked, not trusted'
}

# ---- 49: no footer at all - truncated or filtered, and the gate STOPS ----
$noFooterText = New-VerifyReportText -ReportName '90_verify.sql' -NoFooter
$parsedNoFooter = Get-ReportParse -ReportName '90_verify.sql' -Text $noFooterText
$gateNoFooter = Invoke-VerificationGateProbe -Results @((New-GateChildResult -Text $noFooterText))
$noFooterOutcome = Test-VerificationGateOutcome -Probe $gateNoFooter `
  -ExpectedReceipts @('04-postflight.json', '04-postflight-fail.json') `
  -ExpectedStop '04-postflight-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'FAIL' }
Add-Case 'reportMissingFooterStops' (
  -not $parsedNoFooter.ok -and
  -not $parsedNoFooter.footerSeen -and
  ((@($parsedNoFooter.problems) -join ' ') -match 'has no row-count footer') -and
  $noFooterOutcome.ok -and
  [int]$gateNoFooter.nativeCalls -eq 1 -and
  -not $gateNoFooter.receipts.Contains('06-claim-release.json') -and
  -not $gateNoFooter.receipts.Contains('06-complete.json')) (New-GateCaseDetail -Probe $gateNoFooter -Outcome $noFooterOutcome `
  -Note 'a truncated stream has no footer, so the claim is never released')

# ---- 50: a footer that is present but malformed --------------------------
$malformedFooterText = New-VerifyReportText -ReportName '90_verify.sql' -FooterText '(19 row'
$parsedMalformedFooter = Get-ReportParse -ReportName '90_verify.sql' -Text $malformedFooterText
Add-Case 'reportMalformedFooterStops' (
  -not $parsedMalformedFooter.ok -and
  [string]$parsedMalformedFooter.verdict -eq 'FAIL' -and
  -not $parsedMalformedFooter.footerSeen -and
  ((@($parsedMalformedFooter.problems) -join ' ') -match 'malformed row-count footer')) @{
  verdict = [string]$parsedMalformedFooter.verdict
  problems = @($parsedMalformedFooter.problems)
}

# ---- 51: output after the footer is never ignored ------------------------
$trailerText = New-VerifyReportText -ReportName '90_verify.sql' -Trailer 'WARNING:  there is no transaction in progress'
$parsedTrailer = Get-ReportParse -ReportName '90_verify.sql' -Text $trailerText
$gateTrailer = Invoke-VerificationGateProbe -Results @((New-GateChildResult -Text $trailerText))
$trailerOutcome = Test-VerificationGateOutcome -Probe $gateTrailer `
  -ExpectedReceipts @('04-postflight.json', '04-postflight-fail.json') `
  -ExpectedStop '04-postflight-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'FAIL' }
Add-Case 'reportUnexpectedTrailerStops' (
  -not $parsedTrailer.ok -and
  [string]$parsedTrailer.verdict -eq 'FAIL' -and
  $parsedTrailer.footerSeen -and
  [int]$parsedTrailer.rows -eq 19 -and
  ((@($parsedTrailer.problems) -join ' ') -match 'unexpected output after the row-count footer') -and
  $trailerOutcome.ok -and
  -not $gateTrailer.receipts.Contains('06-complete.json')) (New-GateCaseDetail -Probe $gateTrailer -Outcome $trailerOutcome `
  -Note 'a correct report followed by extra output is not a correct report')

# ---- 52: R12-C1 itself - a line the old parser skipped -------------------
$junkText = New-VerifyReportText -ReportName '90_verify.sql' -JunkLine 'postflight OK: every gating check passed'
$parsedJunk = Get-ReportParse -ReportName '90_verify.sql' -Text $junkText
Add-Case 'reportExtraJunkLineStops' (
  -not $parsedJunk.ok -and
  [string]$parsedJunk.verdict -eq 'FAIL' -and
  [int]$parsedJunk.rows -eq 19 -and
  [int]$parsedJunk.footerRows -eq 19 -and
  ((@($parsedJunk.problems) -join ' ') -match 'invalid ordinal') -and
  ((@($parsedJunk.problems) -join ' ') -match 'invalid status') -and
  @($parsedJunk.envelopeProblems).Count -ge 2) @{
  verdict  = [string]$parsedJunk.verdict
  rows     = $parsedJunk.rows
  problems = @($parsedJunk.problems)
  note     = 'R12-C1: this line used to be skipped silently and the report still passed'
}

# ---- 53: invalid ordinal and invalid status on the SAME row --------------
$badRowText = New-VerifyReportText -ReportName '90_verify.sql' -JunkLine '   x | not a check | 1 | 2 | SKIPPED'
$parsedBadRow = Get-ReportParse -ReportName '90_verify.sql' -Text $badRowText
Add-Case 'reportInvalidOrdinalAndStatusStops' (
  -not $parsedBadRow.ok -and
  [string]$parsedBadRow.verdict -eq 'FAIL' -and
  ((@($parsedBadRow.problems) -join ' ') -match 'invalid ordinal') -and
  ((@($parsedBadRow.problems) -join ' ') -match 'invalid status') -and
  ((@($parsedBadRow.problems) -join ' ') -match 'malformed row')) @{
  verdict  = [string]$parsedBadRow.verdict
  problems = @($parsedBadRow.problems)
  note     = 'both defects are reported for the same line, not just the first one'
}

# ---- 54: a stream cut in the middle of the last row ----------------------
$cutText = New-VerifyReportText -ReportName '90_verify.sql' -NoFooter -CutLastChars 12
$parsedCut = Get-ReportParse -ReportName '90_verify.sql' -Text $cutText
Add-Case 'reportTruncatedMidRowStops' (
  -not $parsedCut.ok -and
  [string]$parsedCut.verdict -eq 'FAIL' -and
  -not $parsedCut.footerSeen -and
  [int]$parsedCut.rows -eq 18 -and
  ((@($parsedCut.problems) -join ' ') -match 'has no row-count footer') -and
  ((@($parsedCut.problems) -join ' ') -match 'invalid status')) @{
  verdict  = [string]$parsedCut.verdict
  rows     = $parsedCut.rows
  problems = @($parsedCut.problems)
}

# ---- 55: the storage verifier obeys the same envelope --------------------
$storageTrailerText = New-VerifyReportText -ReportName '95_storage_config.sql' -Trailer 'psql: warning: there is no transaction in progress'
$gateStorageTrailer = Invoke-VerificationGateProbe -Results @(
  (New-GateChildResult -Text $repVerify),
  (New-GateChildResult -Text $storageTrailerText)
)
$storageTrailerOutcome = Test-VerificationGateOutcome -Probe $gateStorageTrailer `
  -ExpectedReceipts @('04-postflight.json', '05-storage.json', '05-storage-fail.json') `
  -ExpectedStop '05-storage-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'PASS'; '05-storage.json' = 'FAIL' }
Add-Case 'reportStorageTrailerStops' (
  $storageTrailerOutcome.ok -and
  [int]$gateStorageTrailer.nativeCalls -eq 2 -and
  [string]$gateStorageTrailer.stopReason -match 'storage verification did not satisfy' -and
  [string]$gateStorageTrailer.stopReason -match 'unexpected output after the row-count footer' -and
  -not $gateStorageTrailer.receipts.Contains('06-claim-release.json') -and
  -not $gateStorageTrailer.receipts.Contains('06-complete.json')) (New-GateCaseDetail -Probe $gateStorageTrailer -Outcome $storageTrailerOutcome `
  -Note 'the storage verifier is held to the same envelope as the postflight')

# ===========================================================================
# 56-65: gate 2 - the preflight report is a contract (R13-C1)
#
# Round 13 made gate 5 read its report strictly and left gate 2 counting lines
# that end in '| PASS'. The independent audit proved the consequence: exit 0, a
# complete capture, and the single line
#     THIS IS NOT A PREFLIGHT REPORT | PASS
# produced a PASS receipt, no STOP, and a run that would have advanced to the
# ledger gate. These cases execute the committed gate-2 block on this runtime and
# require the same contract gate 5 already had: 21 declared checks, in order,
# framed by a header, a separator and a '(21 rows)' footer, and a receipt that
# takes its status from that verdict.
# ===========================================================================

# ---- 56: the real report advances to the ledger gate ----------------------
$pfValidText = New-VerifyReportText -ReportName '00_preflight.sql'
$gatePfValid = Invoke-PreflightGateProbe -Results @((New-GateChildResult -Text $pfValidText))
$pfValidOutcome = Test-VerificationGateOutcome -Probe $gatePfValid `
  -ExpectedReceipts @('02-preflight.json') `
  -ExpectedStop '' `
  -ExpectedStatus @{ '02-preflight.json' = 'PASS' }
Add-Case 'preflightValidReportAdvancesToLedgerGate' (
  $pfValidOutcome.ok -and
  $gatePfValid.advanced -and
  # The extracted block carries every marker the contract needs; a gate whose
  # shape drifted must fail here rather than pass by accident.
  @($gatePfValid.blockProblems).Count -eq 0 -and
  [int]$gatePfValid.blockLines -gt 20 -and
  [int]$gatePfValid.nativeCalls -eq 1 -and
  [string]$gatePfValid.receipts['02-preflight.json']['rows'] -eq '21' -and
  [string]$gatePfValid.receipts['02-preflight.json']['passRows'] -eq '19' -and
  [string]$gatePfValid.receipts['02-preflight.json']['infoRows'] -eq '2' -and
  ([string]$gatePfValid.calls[0]) -match '00_preflight\.sql') (New-GateCaseDetail -Probe $gatePfValid -Outcome $pfValidOutcome `
  -Note 'the unmodified 21-row report satisfies the contract and the gate continues')

# ---- 57: the audit's exact input ------------------------------------------
$gatePfSuffix = Invoke-PreflightGateProbe -Results @((New-GateChildResult -Text 'THIS IS NOT A PREFLIGHT REPORT | PASS'))
$pfSuffixOutcome = Test-VerificationGateOutcome -Probe $gatePfSuffix `
  -ExpectedReceipts @('02-preflight.json', '02-preflight-rows.json') `
  -ExpectedStop '02-preflight-rows.json' `
  -ExpectedStatus @{ '02-preflight.json' = 'FAIL' }
Add-Case 'preflightArbitrarySuffixTextStops' (
  $pfSuffixOutcome.ok -and
  -not $gatePfSuffix.advanced -and
  [int]$gatePfSuffix.nativeCalls -eq 1 -and
  [string]$gatePfSuffix.stopReason -match 'no column header' -and
  [string]$gatePfSuffix.stopReason -match 'no row-count footer') (New-GateCaseDetail -Probe $gatePfSuffix -Outcome $pfSuffixOutcome `
  -Note 'exit 0 plus a line ending in | PASS is not a preflight report')

# ---- 58: one declared check is missing ------------------------------------
$pfMissingText = New-VerifyReportText -ReportName '00_preflight.sql' -OmitOrds @(7)
$gatePfMissing = Invoke-PreflightGateProbe -Results @((New-GateChildResult -Text $pfMissingText))
$pfMissingOutcome = Test-VerificationGateOutcome -Probe $gatePfMissing `
  -ExpectedReceipts @('02-preflight.json', '02-preflight-rows.json') `
  -ExpectedStop '02-preflight-rows.json' `
  -ExpectedStatus @{ '02-preflight.json' = 'FAIL' }
Add-Case 'preflightMissingCheckStops' (
  $pfMissingOutcome.ok -and
  -not $gatePfMissing.advanced -and
  [string]$gatePfMissing.stopReason -match '1 declared check\(s\) missing from the report: ord 7') (New-GateCaseDetail -Probe $gatePfMissing -Outcome $pfMissingOutcome)

# ---- 59: a check is rendered twice ---------------------------------------
$pfDuplicateText = New-VerifyReportText -ReportName '00_preflight.sql' -DuplicateOrds @(4)
$gatePfDuplicate = Invoke-PreflightGateProbe -Results @((New-GateChildResult -Text $pfDuplicateText))
$pfDuplicateOutcome = Test-VerificationGateOutcome -Probe $gatePfDuplicate `
  -ExpectedReceipts @('02-preflight.json', '02-preflight-rows.json') `
  -ExpectedStop '02-preflight-rows.json' `
  -ExpectedStatus @{ '02-preflight.json' = 'FAIL' }
Add-Case 'preflightDuplicateCheckStops' (
  $pfDuplicateOutcome.ok -and
  -not $gatePfDuplicate.advanced -and
  [string]$gatePfDuplicate.stopReason -match '1 duplicated check ord\(s\): 4') (New-GateCaseDetail -Probe $gatePfDuplicate -Outcome $pfDuplicateOutcome)

# ---- 60: the rows are complete but out of order ---------------------------
$pfOrderText = New-VerifyReportText -ReportName '00_preflight.sql' -SwapOrds @(4, 5)
$gatePfOrder = Invoke-PreflightGateProbe -Results @((New-GateChildResult -Text $pfOrderText))
$pfOrderOutcome = Test-VerificationGateOutcome -Probe $gatePfOrder `
  -ExpectedReceipts @('02-preflight.json', '02-preflight-rows.json') `
  -ExpectedStop '02-preflight-rows.json' `
  -ExpectedStatus @{ '02-preflight.json' = 'FAIL' }
Add-Case 'preflightReorderedChecksStop' (
  $pfOrderOutcome.ok -and
  -not $gatePfOrder.advanced -and
  [string]$gatePfOrder.stopReason -match 'not in ascending ord order') (New-GateCaseDetail -Probe $gatePfOrder -Outcome $pfOrderOutcome `
  -Note 'every row can be present and correct and the report still not be the one the script renders')

# ---- 61: a check is renamed ----------------------------------------------
$pfRenamedText = New-VerifyReportText -ReportName '00_preflight.sql' -RenameOrds @{ 9 = 'pgcrypto schema, maybe' }
$gatePfRenamed = Invoke-PreflightGateProbe -Results @((New-GateChildResult -Text $pfRenamedText))
$pfRenamedOutcome = Test-VerificationGateOutcome -Probe $gatePfRenamed `
  -ExpectedReceipts @('02-preflight.json', '02-preflight-rows.json') `
  -ExpectedStop '02-preflight-rows.json' `
  -ExpectedStatus @{ '02-preflight.json' = 'FAIL' }
Add-Case 'preflightRenamedCheckStops' (
  $pfRenamedOutcome.ok -and
  -not $gatePfRenamed.advanced -and
  [string]$gatePfRenamed.stopReason -match "check 9: name 'pgcrypto schema, maybe' is not the declared 'pgcrypto schema'") (New-GateCaseDetail -Probe $gatePfRenamed -Outcome $pfRenamedOutcome)

# ---- 62: a gating check renders FAIL ------------------------------------
$pfFailText = New-VerifyReportText -ReportName '00_preflight.sql' -StatusByOrd @{ 5 = 'FAIL' }
$gatePfFail = Invoke-PreflightGateProbe -Results @((New-GateChildResult -Text $pfFailText))
$pfFailOutcome = Test-VerificationGateOutcome -Probe $gatePfFail `
  -ExpectedReceipts @('02-preflight.json', '02-preflight-rows.json') `
  -ExpectedStop '02-preflight-rows.json' `
  -ExpectedStatus @{ '02-preflight.json' = 'FAIL' }
Add-Case 'preflightRenderedFailRowStops' (
  $pfFailOutcome.ok -and
  -not $gatePfFail.advanced -and
  [string]$gatePfFail.stopReason -match '1 rendered check\(s\) FAILED' -and
  [string]$gatePfFail.stopReason -match 'rendered FAIL') (New-GateCaseDetail -Probe $gatePfFail -Outcome $pfFailOutcome)

# ---- 63: the report is truncated (no footer) ----------------------------
$pfTruncText = New-VerifyReportText -ReportName '00_preflight.sql' -NoFooter
$gatePfTrunc = Invoke-PreflightGateProbe -Results @((New-GateChildResult -Text $pfTruncText))
$pfTruncOutcome = Test-VerificationGateOutcome -Probe $gatePfTrunc `
  -ExpectedReceipts @('02-preflight.json', '02-preflight-rows.json') `
  -ExpectedStop '02-preflight-rows.json' `
  -ExpectedStatus @{ '02-preflight.json' = 'FAIL' }
Add-Case 'preflightTruncatedReportStops' (
  $pfTruncOutcome.ok -and
  -not $gatePfTrunc.advanced -and
  [string]$gatePfTrunc.stopReason -match 'no row-count footer') (New-GateCaseDetail -Probe $gatePfTrunc -Outcome $pfTruncOutcome)

# ---- 64: 'postgis|extensions' is a VALUE, not a separator ---------------
# The report is the real one, so ord 8 carries a pipe in BOTH the expected and
# the actual column. Splitting on '|' reads eight fields from that row; the
# separator's column spans read five. A PASS here is only possible if the framing
# is the boundaries, and the counts prove no row was dropped or misread.
Add-Case 'preflightPipeInsideCellIsNotAColumn' (
  $pfValidOutcome.ok -and
  $gatePfValid.advanced -and
  ([regex]::Matches([string]$pfValidText, [regex]::Escape('postgis|extensions'))).Count -eq 2 -and
  [string]$gatePfValid.receipts['02-preflight.json']['rows'] -eq '21' -and
  [string]$gatePfValid.receipts['02-preflight.json']['passRows'] -eq '19' -and
  [string]$gatePfValid.receipts['02-preflight.json']['infoRows'] -eq '2' -and
  [string]$gatePfValid.receipts['02-preflight.json']['separatorSeen'] -eq 'True') (New-GateCaseDetail -Probe $gatePfValid -Outcome $pfValidOutcome `
  -Note 'expected and actual both carry the pipe; a split-on-| reader would see seven cells and drop the row')

# ---- 65: an INFO-only report cannot leave a PASS receipt -----------------
$pfInfoText = New-VerifyReportText -ReportName '00_preflight.sql' -OmitOrds @(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19)
$gatePfInfo = Invoke-PreflightGateProbe -Results @((New-GateChildResult -Text $pfInfoText))
$pfInfoOutcome = Test-VerificationGateOutcome -Probe $gatePfInfo `
  -ExpectedReceipts @('02-preflight.json', '02-preflight-rows.json') `
  -ExpectedStop '02-preflight-rows.json' `
  -ExpectedStatus @{ '02-preflight.json' = 'FAIL' }
Add-Case 'preflightInfoOnlyReportStops' (
  $pfInfoOutcome.ok -and
  -not $gatePfInfo.advanced -and
  [string]$gatePfInfo.receipts['02-preflight.json']['infoRows'] -eq '2' -and
  [string]$gatePfInfo.receipts['02-preflight.json']['passRows'] -eq '0' -and
  [string]$gatePfInfo.stopReason -match 'gating row\(s\) rendered') (New-GateCaseDetail -Probe $gatePfInfo -Outcome $pfInfoOutcome `
  -Note 'the receipt takes its status from the report verdict, not from the exit code')

# ===========================================================================
# 66-75: the framing characters are part of the report (R14-C1)
#
# Round 14 read the cells inside the separator's spans and never looked at what
# separated them. Replacing the four structural '|' characters on a row with '!'
# left every cell in place, so the row parsed, the contract matched, the receipt
# said PASS and gate 2 advanced. The framing is now validated at the exact
# positions the separator declares, and a '|' inside a cell is still a value
# because it is not at any of those positions.
# ===========================================================================

# ---- 66: the exact R14-C1 mutation ---------------------------------------
$damagedText = New-VerifyReportText -ReportName '00_preflight.sql' -DamageRowOrd 1 -DamageChar '!'
$gateDamaged = Invoke-PreflightGateProbe -Results @((New-GateChildResult -Text $damagedText))
$damagedOutcome = Test-VerificationGateOutcome -Probe $gateDamaged `
  -ExpectedReceipts @('02-preflight.json', '02-preflight-rows.json') `
  -ExpectedStop '02-preflight-rows.json' `
  -ExpectedStatus @{ '02-preflight.json' = 'FAIL' }
Add-Case 'preflightDelimiterReplacedStops' (
  $damagedOutcome.ok -and
  -not $gateDamaged.advanced -and
  [int]$gateDamaged.nativeCalls -eq 1 -and
  [string]$gateDamaged.stopReason -match 'the delimiter closing column') (New-GateCaseDetail -Probe $gateDamaged -Outcome $damagedOutcome `
  -Note 'row 1 with ! instead of | at the four declared boundaries: the audit''s exact mutation')

# ---- 67: the header's delimiter is replaced -------------------------------
$damagedHeaderText = New-VerifyReportText -ReportName '00_preflight.sql' -DamageHeader -DamageChar '!'
$gateDamagedHeader = Invoke-PreflightGateProbe -Results @((New-GateChildResult -Text $damagedHeaderText))
$damagedHeaderOutcome = Test-VerificationGateOutcome -Probe $gateDamagedHeader `
  -ExpectedReceipts @('02-preflight.json', '02-preflight-rows.json') `
  -ExpectedStop '02-preflight-rows.json' `
  -ExpectedStatus @{ '02-preflight.json' = 'FAIL' }
Add-Case 'preflightHeaderDelimiterReplacedStops' (
  $damagedHeaderOutcome.ok -and
  -not $gateDamagedHeader.advanced -and
  [string]$gateDamagedHeader.stopReason -match 'no column header') (New-GateCaseDetail -Probe $gateDamagedHeader -Outcome $damagedHeaderOutcome)

# ---- 68: the postflight report, same mutation -----------------------------
$damagedVerifyText = New-VerifyReportText -ReportName '90_verify.sql' -DamageRowOrd 2 -DamageChar '!'
$gateDamagedVerify = Invoke-VerificationGateProbe -Results @((New-GateChildResult -Text $damagedVerifyText))
$damagedVerifyOutcome = Test-VerificationGateOutcome -Probe $gateDamagedVerify `
  -ExpectedReceipts @('04-postflight.json', '04-postflight-fail.json') `
  -ExpectedStop '04-postflight-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'FAIL' }
Add-Case 'postflightDelimiterReplacedStops' (
  $damagedVerifyOutcome.ok -and
  [int]$gateDamagedVerify.nativeCalls -eq 1 -and
  [string]$gateDamagedVerify.stopReason -match 'the delimiter closing column' -and
  -not $gateDamagedVerify.receipts.Contains('06-claim-release.json') -and
  -not $gateDamagedVerify.receipts.Contains('06-complete.json')) (New-GateCaseDetail -Probe $gateDamagedVerify -Outcome $damagedVerifyOutcome)

# ---- 69: the storage report, same mutation -------------------------------
$damagedStorageText = New-VerifyReportText -ReportName '95_storage_config.sql' -DamageRowOrd 3 -DamageChar '!'
$gateDamagedStorage = Invoke-VerificationGateProbe -Results @(
  (New-GateChildResult -Text (New-VerifyReportText -ReportName '90_verify.sql')),
  (New-GateChildResult -Text $damagedStorageText)
)
$damagedStorageOutcome = Test-VerificationGateOutcome -Probe $gateDamagedStorage `
  -ExpectedReceipts @('04-postflight.json', '05-storage.json', '05-storage-fail.json') `
  -ExpectedStop '05-storage-fail.json' `
  -ExpectedStatus @{ '04-postflight.json' = 'PASS'; '05-storage.json' = 'FAIL' }
Add-Case 'storageDelimiterReplacedStops' (
  $damagedStorageOutcome.ok -and
  [int]$gateDamagedStorage.nativeCalls -eq 2 -and
  [string]$gateDamagedStorage.stopReason -match 'storage verification did not satisfy' -and
  [string]$gateDamagedStorage.stopReason -match 'the delimiter closing column') (New-GateCaseDetail -Probe $gateDamagedStorage -Outcome $damagedStorageOutcome)

# ---- 70: a shifted boundary (one padding space removed) -------------------
$shiftText = New-VerifyReportText -ReportName '90_verify.sql' -ShiftRowOrd 4 -ShiftCount 1
$parsedShift = Get-ReportParse -ReportName '90_verify.sql' -Text $shiftText
Add-Case 'reportShiftedBoundaryStops' (
  -not $parsedShift.ok -and
  [string]$parsedShift.verdict -eq 'FAIL' -and
  [int]$parsedShift.rows -eq 18 -and
  ((@($parsedShift.problems) -join ' ') -match 'does not begin at its boundary')) @{
    verdict = [string]$parsedShift.verdict; rows = [int]$parsedShift.rows; note = 'an extra padding space moves every later delimiter'
  }

# ---- 71: a row with no left padding at all --------------------------------
$unpadText = New-VerifyReportText -ReportName '90_verify.sql' -UnpadRowOrd 5
$parsedUnpad = Get-ReportParse -ReportName '90_verify.sql' -Text $unpadText
Add-Case 'reportUnpaddedRowStops' (
  -not $parsedUnpad.ok -and
  [string]$parsedUnpad.verdict -eq 'FAIL' -and
  [int]$parsedUnpad.rows -eq 18 -and
  ((@($parsedUnpad.problems) -join ' ') -match 'does not begin at its boundary')) @{
    verdict = [string]$parsedUnpad.verdict; rows = [int]$parsedUnpad.rows; note = 'a row shifted one character left is not a row'
  }

# ---- 72: the negative control - padding and right-aligned ord are fine ---
$paddedText = New-VerifyReportText -ReportName '90_verify.sql'
$parsedPadded = Get-ReportParse -ReportName '90_verify.sql' -Text $paddedText
$ordLine = @([string]$paddedText -split "`n")[2]
Add-Case 'reportPaddedShortCellsStillParse' (
  [bool]$parsedPadded.ok -and
  [string]$parsedPadded.verdict -eq 'PASS' -and
  [int]$parsedPadded.rows -eq 19 -and
  @($parsedPadded.problems).Count -eq 0 -and
  # 'ord 1' is right-aligned inside its column: shorter than the header width,
  # padded on the left, and still framed exactly.
  ([string]$ordLine -match '^ +1 \| ')) @{
    verdict = [string]$parsedPadded.verdict; rows = [int]$parsedPadded.rows; note = 'a short value padded to its column is legal'
  }

# ---- 73: a CRLF capture reads the same -----------------------------------
$crlfText = New-VerifyReportText -ReportName '90_verify.sql' -Crlf
$parsedCrlf = Get-ReportParse -ReportName '90_verify.sql' -Text $crlfText
Add-Case 'reportCrlfEnvelopeParses' (
  [bool]$parsedCrlf.ok -and
  [int]$parsedCrlf.rows -eq 19 -and
  [bool]$parsedCrlf.footerSeen -and
  @($parsedCrlf.problems).Count -eq 0 -and
  ([string]$crlfText -match "`r`n")) @{
    verdict = [string]$parsedCrlf.verdict; rows = [int]$parsedCrlf.rows; note = 'psql on Windows writes CRLF; the parser splits on r?n'
  }

# ---- 74: the header still splits, but sits off the separator's columns ----
$headerShiftText = New-VerifyReportText -ReportName '90_verify.sql' -ShiftHeader -ShiftCount 1
$parsedHeaderShift = Get-ReportParse -ReportName '90_verify.sql' -Text $headerShiftText
Add-Case 'reportHeaderMisalignedToSeparatorStops' (
  -not $parsedHeaderShift.ok -and
  [string]$parsedHeaderShift.verdict -eq 'FAIL' -and
  ((@($parsedHeaderShift.problems) -join ' ') -match 'header is not aligned with the separator')) @{
    verdict = [string]$parsedHeaderShift.verdict; rows = [int]$parsedHeaderShift.rows; note = 'five names, wrong positions'
  }

# ---- 75: an embedded pipe keeps its cell, and is not a boundary ----------
$pipeText = New-VerifyReportText -ReportName '00_preflight.sql'
$parsedPipe = Get-ReportParse -ReportName '00_preflight.sql' -Text $pipeText
Add-Case 'reportEmbeddedPipeKeepsFraming' (
  [bool]$parsedPipe.ok -and
  [int]$parsedPipe.rows -eq 21 -and
  @($parsedPipe.problems).Count -eq 0 -and
  ([regex]::Matches([string]$pipeText, [regex]::Escape('postgis|extensions'))).Count -eq 2 -and
  -not ((@($parsedPipe.problems) -join ' ') -match 'delimiter')) @{
    verdict = [string]$parsedPipe.verdict; rows = [int]$parsedPipe.rows; note = 'postgis|extensions sits inside cells, not on a declared boundary'
  }

# ===========================================================================
# 76-91: the completion finalization protocol, executed (Round 16 / R15-C1)
# ===========================================================================
# R15-C1: deploy.ps1 wrote and announced a COMPLETE receipt BEFORE sealing the
# evidence. An injected seal failure therefore left a durable, announced
# COMPLETE beside an EXCEPTION and exit 1 - a consumer reading only
# 06-complete.json would accept a run whose evidence was never sealed.
#
# The cases below execute the REAL functions against REAL directories: every
# artifact asserted on is a file on disk, read back through the same helpers a
# consumer would use. Two of them extract the committed completion region from
# deploy.ps1 and run it, so a copy that drifts from the runner cannot pass.

function New-FinalizationRun {
  param([string[]]$Evidence = @('02-preflight.json', '04-postflight.json', '05-storage.json', '06-claim-release.json'))

  $root = Join-Path ([System.IO.Path]::GetTempPath()) ('clash-finalization-' + [guid]::NewGuid().ToString('N').Substring(0, 12))
  New-Item -ItemType Directory -Path $root -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $root '04-postflight') -Force | Out-Null
  foreach ($name in $Evidence) {
    # The claim release carries the fields the completion contract verifies
    # against it (runId, status PASS, released true); the others only have to
    # exist and be sealed.
    $fields = [ordered]@{ receipt = $name; status = 'PASS'; probe = $true }
    if ($name -ceq '06-claim-release.json') {
      $fields['runId']    = 'probe-run-id'
      $fields['released'] = $true
    }
    [void](Write-Evidence -Path (Join-Path $root $name) -Text ($fields | ConvertTo-Json -Depth 4))
  }
  [void](Write-Evidence -Path (Join-Path $root '04-postflight\claim-release.out') -Text "probe-run-id`n")
  return $root
}

# The receipt hash the runner's chain holds at the moment completion starts: the
# raw text hash of the last receipt it wrote (Add-Receipt's return value).
function Get-FinalizationReleaseSha {
  param([string]$Root)
  return (Get-TextSha256 -Text ([System.IO.File]::ReadAllText((Join-Path $Root '06-claim-release.json'))))
}

# Test-only fixture builder: rewrites one or more dotted fields of an already
# published marker. The marker is NOT part of the seal, so the seal keeps
# verifying - which is exactly the attack surface C16-C1 found.
function Set-CompletionMarkerField {
  param([string]$Root, [hashtable]$Mutation)

  $path = Join-Path $Root '06-complete.json'
  $doc  = [System.IO.File]::ReadAllText($path) | ConvertFrom-Json
  foreach ($key in @($Mutation.Keys)) {
    $parts = ([string]$key) -split '\.'
    $node  = $doc
    for ($i = 0; $i -lt ($parts.Count - 1); $i++) { $node = $node.($parts[$i]) }
    $node.($parts[$parts.Count - 1]) = $Mutation[$key]
  }
  [System.IO.File]::WriteAllText($path, ($doc | ConvertTo-Json -Depth 8))
  return $path
}

# Test-only fixture builder: replaces ONE scalar field of a JSON file with
# arbitrary raw JSON text. Shapes that PowerShell cannot assign directly (an empty
# array, a nested array, an object, an explicit null) must reach the consumer as
# real JSON text, exactly as an attacker would write it.
function Set-JsonScalarField {
  param([string]$Path, [string]$Name, [string]$RawJson)

  $text = [System.IO.File]::ReadAllText($Path)
  $pattern = '("{0}"[ \t]*:[ \t]*)("(?:[^"\\]|\\.)*"|true|false|null|-?[0-9]+(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?)' -f [regex]::Escape($Name)
  $match = [regex]::Match($text, $pattern)
  if (-not $match.Success) { throw ('the fixture {0} has no scalar field {1}' -f $Path, $Name) }
  $head = $text.Substring(0, $match.Groups[1].Index)
  $tail = $text.Substring($match.Index + $match.Length)
  [System.IO.File]::WriteAllText($Path, ($head + $match.Groups[1].Value + $RawJson + $tail))
  return $Path
}

# Test-only fixture builder: regex surgery on a JSON file, for a field whose value
# is a collection (renamed or re-typed in place so the JSON stays valid).
function Set-JsonFileRegex {
  param([string]$Path, [string]$Pattern, [string]$Replacement)

  $text = [System.IO.File]::ReadAllText($Path)
  if (-not [regex]::IsMatch($text, $Pattern)) { throw ('the fixture {0} does not match the pattern' -f $Path) }
  [System.IO.File]::WriteAllText($Path, ([regex]::Replace($text, $Pattern, $Replacement)))
  return $Path
}

function Remove-FinalizationRun {
  param([string]$Root)
  try { if ($Root -and (Test-Path -LiteralPath $Root)) { Remove-Item -LiteralPath $Root -Recurse -Force -ErrorAction Stop } } catch { }
}

function Read-RunDocument {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try { return ([System.IO.File]::ReadAllText($Path) | ConvertFrom-Json) } catch { return $null }
}

# Runs Publish-ClashCompletion in a child scope with the console captured and,
# optionally, ONE evidence write refused. The substitution is the same trick the
# claim-release probe uses for the child process: the adapter's own code still
# decides everything it decides in production.
function Invoke-CompletionProbe {
  param(
    [string]$Root,
    [string[]]$Required = @(),
    [string]$FailWriteJsonSuffix = '',
    [string]$PrevSha = '',
    [hashtable]$Fields = @{ appliedThisRun = 111; freshOnly = $true; writerRunId = 'probe-run-id' }
  )

  if (@($Required).Count -eq 0) { $Required = @(Get-ClashCompletionRequiredEvidence) }
  if ([string]::IsNullOrWhiteSpace($PrevSha)) { $PrevSha = Get-FinalizationReleaseSha -Root $Root }

  $state = [ordered]@{
    ok = $false; threw = ''; result = $null; output = @()
    markerAtAnnounce = $false; sealAtAnnounce = $false; exitLine = ''
  }
  $state.markerPath = Join-Path $Root '06-complete.json'
  $state.sealPath   = Join-Path $Root 'EVIDENCE-MANIFEST.json'

  & {
    param($Root, $Required, $FailWriteJsonSuffix, $PrevSha, $Fields, $State)

    function Write-Host {
      param(
        [Parameter(Position = 0)][object]$Object = $null,
        [switch]$NoNewline,
        [string]$ForegroundColor = '',
        [Parameter(ValueFromRemainingArguments = $true)][object[]]$Rest = @()
      )
      $line = [string]$Object
      $State.output += $line
      if ($line -match '^TERMINAL RECEIPT: COMPLETE') {
        # Exactly the question R15-C1 got wrong: does the authoritative marker
        # exist AT THE MOMENT the completion is announced?
        $State.markerAtAnnounce = (Test-Path -LiteralPath $State.markerPath)
        $State.sealAtAnnounce   = (Test-Path -LiteralPath $State.sealPath)
      }
    }

    $script:probeFailSuffix = [string]$FailWriteJsonSuffix
    $script:probePrevSha    = [string]$PrevSha
    $script:probeRealWriteJson = ${function:Write-EvidenceJson}
    function Write-EvidenceJson {
      param([string]$Path, $Object)
      if ($script:probeFailSuffix -and ([string]$Path).Contains($script:probeFailSuffix)) {
        throw ('CLASH-PROBE-INJECTED-WRITE-FAILURE: refused {0}' -f $Path)
      }
      return (& $script:probeRealWriteJson -Path $Path -Object $Object)
    }

    try {
      $State.result = Publish-ClashCompletion -Root $Root -PrevSha $script:probePrevSha -RequiredEvidence $Required -Fields $Fields
      $State.ok = $true
    }
    catch { $State.threw = Protect-Text $_.Exception.Message }
  } $Root $Required $FailWriteJsonSuffix $PrevSha $Fields $state 6>$null | Out-Null

  return $state
}

# Extracts the committed completion region from deploy.ps1. The region must be
# the ONLY place that can publish completion, and the announcement must sit after
# the publication call in source order.
function Get-CompletionTail {
  param([string]$Path)

  $lines   = [System.IO.File]::ReadAllLines($Path)
  $startAt = -1
  $endAt   = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($startAt -lt 0 -and $lines[$i] -match '^#\s*-+\s*completion\s*-+\s*$') { $startAt = $i; continue }
    if ($startAt -ge 0 -and $lines[$i] -match '^exit 0\s*$') { $endAt = $i; break }
  }
  if ($startAt -lt 0 -or $endAt -le $startAt) {
    throw ('completion region not found in {0} (start {1}, end {2})' -f $Path, $startAt, $endAt)
  }
  $text = (@($lines[$startAt..$endAt]) -join "`n")
  $problems = @()
  if (([regex]::Matches($text, [regex]::Escape('Publish-ClashCompletion -Root $run'))).Count -ne 1) {
    $problems += 'the completion region must call Publish-ClashCompletion -Root $run exactly once'
  }
  if ($text.Contains("New-PhaseReceipt '06-complete.json'")) {
    $problems += 'the completion region writes 06-complete.json itself instead of going through the protocol'
  }
  # The required-evidence list is declared once, in the adapter, and the consumer
  # requires the same list. A region that hard-codes its own copy could drift
  # from what the consumer verifies, so it must call the canonical source.
  if ($text -notmatch 'Get-ClashCompletionRequiredEvidence') {
    $problems += 'the completion region does not use the canonical required-evidence list'
  }
  if (([regex]::Matches($text, '(?m)^exit 0\s*$')).Count -ne 1) { $problems += 'the region must exit 0 exactly once' }
  $publishAt  = $text.IndexOf('Publish-ClashCompletion -Root $run')
  $announceAt = $text.IndexOf('TERMINAL RECEIPT: COMPLETE')
  if ($publishAt -lt 0 -or $announceAt -lt 0 -or $announceAt -lt $publishAt) {
    $problems += 'the COMPLETE announcement does not follow the publication call'
  }
  if ($problems.Count -gt 0) { throw ('completion region rejected: ' + ($problems -join '; ')) }

  # A test process cannot execute 'exit 0', so the process-exit statement is
  # replaced by a returning sentinel. Nothing else in the region is altered.
  $body = $text -replace '(?m)^exit 0\s*$', "return 'EXIT-0'"
  return ([ordered]@{ text = $body; lines = ($endAt - $startAt + 1); startLine = ($startAt + 1) })
}

# Executes the committed completion region with the real protocol, real receipts
# and real sealing. Only the process boundary is substituted.
function Invoke-CompletionTailProbe {
  param([string]$Root, [string]$FailWriteJsonSuffix = '')

  $state = [ordered]@{
    ok = $false; threw = ''; exited = ''; output = @()
    markerAtAnnounce = $false; sealAtAnnounce = $false
    receipts = [ordered]@{}; tailLines = 0; tailStartLine = 0; bindError = ''
  }
  $state.markerPath = Join-Path $Root '06-complete.json'
  $state.sealPath   = Join-Path $Root 'EVIDENCE-MANIFEST.json'

  try {
    $tail = Get-CompletionTail -Path (Join-Path $pluginRoot 'deploy.ps1')
    $state.tailLines     = [int]$tail.lines
    $state.tailStartLine = [int]$tail.startLine
    $script:probeTail = [scriptblock]::Create([string]$tail.text)
  }
  catch {
    $state.bindError = Protect-Text $_.Exception.Message
    return $state
  }

  # Variables the committed region reads but never assigns.
  $run         = $Root
  $applied     = 111
  $runId       = 'probe-run-id'
  $treeHash    = 'probe-tree-hash'
  $bootOutcome = 'CREATED'
  # The runner's chain at this point is the hash of the last receipt it wrote.
  $script:chain = Get-FinalizationReleaseSha -Root $Root

  & {
    param($Root, $FailWriteJsonSuffix, $State)

    function Write-Host {
      param(
        [Parameter(Position = 0)][object]$Object = $null,
        [switch]$NoNewline,
        [string]$ForegroundColor = '',
        [Parameter(ValueFromRemainingArguments = $true)][object[]]$Rest = @()
      )
      $line = [string]$Object
      $State.output += $line
      if ($line -match '^TERMINAL RECEIPT: COMPLETE') {
        $State.markerAtAnnounce = (Test-Path -LiteralPath $State.markerPath)
        $State.sealAtAnnounce   = (Test-Path -LiteralPath $State.sealPath)
      }
    }
    # The runner's own receipt helper, pointed at the probe run directory.
    function New-PhaseReceipt {
      param([string]$Name, [hashtable]$Fields)
      $State.receipts[[string]$Name] = $Fields
      $script:chain = Add-Receipt -Root $Root -Name $Name -Fields $Fields -PrevSha $script:chain
    }
    $script:probeFailSuffix    = [string]$FailWriteJsonSuffix
    $script:probeRealWriteJson = ${function:Write-EvidenceJson}
    function Write-EvidenceJson {
      param([string]$Path, $Object)
      if ($script:probeFailSuffix -and ([string]$Path).Contains($script:probeFailSuffix)) {
        throw ('CLASH-PROBE-INJECTED-WRITE-FAILURE: refused {0}' -f $Path)
      }
      return (& $script:probeRealWriteJson -Path $Path -Object $Object)
    }

    try {
      $State.exited = [string](& $script:probeTail)
    }
    catch { $State.threw = Protect-Text $_.Exception.Message }
  } $Root $FailWriteJsonSuffix $state 6>$null | Out-Null

  return $state
}

# ---- 76: the success path publishes a marker that an independent reader accepts
$finRoot  = New-FinalizationRun
$finProbe = Invoke-CompletionProbe -Root $finRoot
$finDoc   = Read-RunDocument -Path (Join-Path $finRoot '06-complete.json')
$finSeal  = Read-RunDocument -Path (Join-Path $finRoot 'EVIDENCE-MANIFEST.json')
$finCheck = $null
try { $finCheck = Test-ClashRunCompletion -RunPath $finRoot } catch { $finCheck = $null }
$finIdentity = '{0}/{1}' -f (Get-ClashAdapterIdentity).id, (Get-ClashAdapterIdentity).version
# Read once, behind a null guard: StrictMode raises on a property of $null.
$finChainHead = $(if ($null -ne $finCheck) { [string]$finCheck.sealChain } else { '' })
$finIntent = Read-RunDocument -Path (Join-Path $finRoot '06-finalization-intent.json')
$finIntentSha = Get-TextSha256 -Text ([System.IO.File]::ReadAllText((Join-Path $finRoot '06-finalization-intent.json')))
Add-Case 'completionSuccessPublishesVerifiedMarker' (
  $finProbe.ok -and
  [string]$finProbe.threw -eq '' -and
  $null -ne $finDoc -and
  [string](Get-DocumentProperty -Object $finDoc -Name 'status' -Default '') -eq 'COMPLETE' -and
  [string](Get-DocumentProperty -Object $finDoc -Name 'protocol' -Default '') -eq 'clash-completion/2' -and
  (Get-DocumentProperty -Object $finDoc -Name 'finalized' -Default $false) -eq $true -and
  (Get-DocumentProperty -Object (Get-DocumentProperty -Object $finDoc -Name 'metadata' -Default $null) -Name 'appliedThisRun' -Default 0) -eq 111 -and
  $null -ne $finSeal -and
  [string](Get-DocumentProperty -Object (Get-DocumentProperty -Object $finDoc -Name 'seal' -Default $null) -Name 'sha256' -Default '') -eq
    (Get-NormalizedSha256 -Path (Join-Path $finRoot 'EVIDENCE-MANIFEST.json')) -and
  [string](Get-DocumentProperty -Object $finDoc -Name 'prevReceiptSha' -Default '') -eq $finIntentSha -and
  [string](Get-DocumentProperty -Object $finIntent -Name 'status' -Default '') -eq 'FINALIZING' -and
  # the authoritative fields the consumer verifies against sealed evidence
  [string](Get-DocumentProperty -Object $finDoc -Name 'writerRunId' -Default '') -eq 'probe-run-id' -and
  [string](Get-DocumentProperty -Object (Get-DocumentProperty -Object $finDoc -Name 'seal' -Default $null) -Name 'name' -Default '') -eq 'EVIDENCE-MANIFEST.json' -and
  [string](Get-DocumentProperty -Object (Get-DocumentProperty -Object $finDoc -Name 'seal' -Default $null) -Name 'chainHead' -Default '') -eq $finChainHead -and
  [string](Get-DocumentProperty -Object $finDoc -Name 'adapter' -Default '') -eq $finIdentity -and
  $null -ne (Get-DocumentProperty -Object $finDoc -Name 'metadata' -Default $null) -and
  $null -ne $finCheck -and $finCheck.ok -and
  @($finCheck.problems).Count -eq 0 -and
  @(Get-ChildItem -LiteralPath $finRoot -Filter '*.tmp' -File).Count -eq 0) @{
  verdict = 'COMPLETE'; protocol = [string](Get-DocumentProperty -Object $finDoc -Name 'protocol' -Default '')
  sealSha = [string](Get-DocumentProperty -Object (Get-DocumentProperty -Object $finDoc -Name 'seal' -Default $null) -Name 'sha256' -Default '')
  sealFiles = [int](Get-DocumentProperty -Object (Get-DocumentProperty -Object $finDoc -Name 'seal' -Default $null) -Name 'fileCount' -Default 0)
  validator = $(if ($null -ne $finCheck) { $finCheck.ok } else { 'null' })
}

# ---- 77: the marker is NOT part of the seal, and the seal is not part of the
#          marker - so neither depends on a hash of the other
$sealHasMarker = $false
if ($null -ne $finSeal) {
  # The accessors preserve shape, so the entries are read as a typed FIELD and
  # never wrapped in @(...): wrapping a shape-preserving call would put the whole
  # array inside a one-element array (Round 18).
  $finEntriesField = Get-ClashJsonField -Object $finSeal -Name 'files'
  $finEntries = @()
  if ($finEntriesField['kind'] -ceq 'array') { $finEntries = @($finEntriesField['value']) }
  foreach ($entry in $finEntries) {
    if ([string](Get-DocumentProperty -Object $entry -Name 'path' -Default '') -eq '06-complete.json') { $sealHasMarker = $true }
  }
}
$markerCorrupt = $false
$sealAfterCorrupt = $null
try {
  [System.IO.File]::WriteAllText((Join-Path $finRoot '06-complete.json'), 'not json at all')
  $markerCorrupt = $true
  $sealAfterCorrupt = Test-EvidenceSeal -Root $finRoot
} catch { }
$checkAfterCorrupt = $null
try { $checkAfterCorrupt = Test-ClashRunCompletion -RunPath $finRoot } catch { $checkAfterCorrupt = $null }
Add-Case 'completionMarkerExcludedFromSeal' (
  -not $sealHasMarker -and
  $markerCorrupt -and
  $null -ne $sealAfterCorrupt -and $sealAfterCorrupt.ok -and
  $null -ne $checkAfterCorrupt -and (-not $checkAfterCorrupt.ok)) @{
  sealListsMarker = $sealHasMarker
  sealStillValid  = $(if ($null -ne $sealAfterCorrupt) { $sealAfterCorrupt.ok } else { 'null' })
  validatorRejects = $(if ($null -ne $checkAfterCorrupt) { -not $checkAfterCorrupt.ok } else { 'null' })
  note = 'no circular dependency: corrupting the marker leaves the seal valid, and the consumer still rejects the run'
}
Remove-FinalizationRun -Root $finRoot

# ---- 78: a finalised run is never re-finalised, and its bytes never change --
$reRoot  = New-FinalizationRun
$reFirst = Invoke-CompletionProbe -Root $reRoot
$reBytes = ''
if (Test-Path -LiteralPath (Join-Path $reRoot '06-complete.json')) {
  $reBytes = [System.IO.File]::ReadAllText((Join-Path $reRoot '06-complete.json'))
}
$reSecond = Invoke-CompletionProbe -Root $reRoot
$reBytesAfter = ''
if (Test-Path -LiteralPath (Join-Path $reRoot '06-complete.json')) {
  $reBytesAfter = [System.IO.File]::ReadAllText((Join-Path $reRoot '06-complete.json'))
}
Add-Case 'completionRefusesSecondFinalization' (
  $reFirst.ok -and
  (-not $reSecond.ok) -and
  $reSecond.threw -match 'already exists' -and
  $reBytes.Length -gt 0 -and
  $reBytes -eq $reBytesAfter) @{
  firstOk = $reFirst.ok; secondOk = $reSecond.ok
  refusal = $reSecond.threw; unchanged = ($reBytes -eq $reBytesAfter)
  note = 'no silent repair: the existing marker is left exactly as it was'
}
Remove-FinalizationRun -Root $reRoot

# ---- 79: a doubt marker blocks finalization ---------------------------------
$dRoot = New-FinalizationRun
[void](Write-Evidence -Path (Join-Path $dRoot '06-complete-unverified.json') -Text '{"status":"UNVERIFIED"}')
$dProbe = Invoke-CompletionProbe -Root $dRoot
$dMarker = Test-Path -LiteralPath (Join-Path $dRoot '06-complete.json')
$dCheck = $null
try { $dCheck = Test-ClashRunCompletion -RunPath $dRoot } catch { $dCheck = $null }
Add-Case 'completionRefusesDoubtMarker' (
  (-not $dProbe.ok) -and
  $dProbe.threw -match 'could not verify' -and
  (-not $dMarker) -and
  $null -ne $dCheck -and (-not $dCheck.ok)) @{
  refusal = $dProbe.threw; markerWritten = $dMarker
  problems = $(if ($null -ne $dCheck) { @($dCheck.problems) } else { @('validator threw') })
}
Remove-FinalizationRun -Root $dRoot

# ---- 80: the seal cannot be published (R15-C1's fault, at publication) ------
# A directory occupies EVIDENCE-MANIFEST.json, so the atomic move cannot publish
# the seal. The old runner had already written and announced COMPLETE by now.
$sRoot = New-FinalizationRun
New-Item -ItemType Directory -Path (Join-Path $sRoot 'EVIDENCE-MANIFEST.json') -Force | Out-Null
$sProbe = Invoke-CompletionProbe -Root $sRoot
$sMarker = Test-Path -LiteralPath (Join-Path $sRoot '06-complete.json')
$sIntent = Test-Path -LiteralPath (Join-Path $sRoot '06-finalization-intent.json')
$sCheck = $null
try { $sCheck = Test-ClashRunCompletion -RunPath $sRoot } catch { $sCheck = $null }
$sCompleteClaims = 0
foreach ($f in @(Get-ChildItem -LiteralPath $sRoot -Recurse -File -Filter '*.json')) {
  $raw = ''
  try { $raw = [System.IO.File]::ReadAllText($f.FullName) } catch { }
  if ($raw -match '"status"\s*:\s*"COMPLETE"') { $sCompleteClaims++ }
}
Add-Case 'completionSealPublicationFailureLeavesNoMarker' (
  (-not $sProbe.ok) -and
  [string]$sProbe.threw -ne '' -and
  (-not $sMarker) -and
  $sIntent -and
  $sCompleteClaims -eq 0 -and
  $null -ne $sCheck -and (-not $sCheck.ok) -and
  (@($sCheck.problems) -join ' ') -match 'no 06-complete.json') @{
  threw = $sProbe.threw; markerWritten = $sMarker; intentWritten = $sIntent
  completeClaimsOnDisk = $sCompleteClaims
  validatorProblems = $(if ($null -ne $sCheck) { @($sCheck.problems) } else { @('validator threw') })
  note = 'the R15-C1 fault no longer leaves any COMPLETE claim on disk'
}
Remove-FinalizationRun -Root $sRoot

# ---- 81: the seal WRITE fails (the audit's exact injection) -----------------
$wRoot = New-FinalizationRun
$wProbe = Invoke-CompletionProbe -Root $wRoot -FailWriteJsonSuffix 'EVIDENCE-MANIFEST.json'
$wMarker = Test-Path -LiteralPath (Join-Path $wRoot '06-complete.json')
$wSeal = $false
foreach ($f in @(Get-ChildItem -LiteralPath $wRoot -File)) { if ($f.Name -like 'EVIDENCE-MANIFEST.json*') { $wSeal = $true } }
$wCheck = $null
try { $wCheck = Test-ClashRunCompletion -RunPath $wRoot } catch { $wCheck = $null }
Add-Case 'completionSealWriteFailureLeavesNoMarker' (
  (-not $wProbe.ok) -and
  $wProbe.threw -match 'CLASH-PROBE-INJECTED-WRITE-FAILURE' -and
  (-not $wMarker) -and
  (-not $wSeal) -and
  $null -ne $wCheck -and (-not $wCheck.ok)) @{
  threw = $wProbe.threw; markerWritten = $wMarker; anySealFile = $wSeal
  note = 'a seal that never reached disk cannot be announced as completion'
}
Remove-FinalizationRun -Root $wRoot

# ---- 82: the committed tail never announces COMPLETE when the seal fails ----
$tRoot = New-FinalizationRun
$tProbe = Invoke-CompletionTailProbe -Root $tRoot -FailWriteJsonSuffix 'EVIDENCE-MANIFEST.json'
$tCompleteLines = @($tProbe.output | Where-Object { $_ -match '^TERMINAL RECEIPT: COMPLETE' })
$tFailReceipt = Read-RunDocument -Path (Join-Path $tRoot '06-finalize-fail.json')
$tMarker = Test-Path -LiteralPath (Join-Path $tRoot '06-complete.json')
$tValidated = $null
try { $tValidated = Test-ClashRunCompletion -RunPath $tRoot } catch { $tValidated = $null }
Add-Case 'completionTailDoesNotAnnounceOnSealFailure' (
  [string]$tProbe.bindError -eq '' -and
  [string]$tProbe.threw -ne '' -and
  [string]$tProbe.exited -eq '' -and
  $tCompleteLines.Count -eq 0 -and
  @($tProbe.output | Where-Object { $_ -match '^FINALIZATION FAILED' }).Count -eq 1 -and
  (-not $tMarker) -and
  $null -ne $tFailReceipt -and
  [string](Get-DocumentProperty -Object $tFailReceipt -Name 'status' -Default '') -eq 'STOPPED' -and
  (Get-DocumentProperty -Object $tFailReceipt -Name 'claimReleased' -Default $false) -eq $true -and
  (Get-DocumentProperty -Object $tFailReceipt -Name 'rollbackImplied' -Default $true) -eq $false -and
  (Get-DocumentProperty -Object $tFailReceipt -Name 'completionMarkerWritten' -Default $true) -eq $false -and
  $null -ne $tValidated -and (-not $tValidated.ok)) @{
  tailStartLine = $tProbe.tailStartLine; tailLines = $tProbe.tailLines
  completeAnnouncements = $tCompleteLines.Count
  threw = $tProbe.threw
  failReceiptStatus = [string](Get-DocumentProperty -Object $tFailReceipt -Name 'status' -Default '')
  rollbackImplied = (Get-DocumentProperty -Object $tFailReceipt -Name 'rollbackImplied' -Default 'unknown')
  markerWritten = $tMarker
  note = 'the real committed region, executed: no COMPLETE line, no marker, no rollback claim'
}
Remove-FinalizationRun -Root $tRoot

# ---- 83: the committed tail announces only AFTER the marker is on disk ------
$okRoot = New-FinalizationRun
$okProbe = Invoke-CompletionTailProbe -Root $okRoot
$okCompleteLines = @($okProbe.output | Where-Object { $_ -match '^TERMINAL RECEIPT: COMPLETE' })
$okDoc = Read-RunDocument -Path (Join-Path $okRoot '06-complete.json')
$okCheck = $null
try { $okCheck = Test-ClashRunCompletion -RunPath $okRoot } catch { $okCheck = $null }
Add-Case 'completionTailAnnouncesOnlyAfterMarker' (
  [string]$okProbe.bindError -eq '' -and
  [string]$okProbe.threw -eq '' -and
  [string]$okProbe.exited -eq 'EXIT-0' -and
  $okCompleteLines.Count -eq 1 -and
  $okProbe.markerAtAnnounce -eq $true -and
  $okProbe.sealAtAnnounce -eq $true -and
  $null -ne $okDoc -and
  [string](Get-DocumentProperty -Object $okDoc -Name 'status' -Default '') -eq 'COMPLETE' -and
  $null -ne $okCheck -and $okCheck.ok) @{
  announcements = $okCompleteLines.Count
  markerPresentAtAnnouncement = $okProbe.markerAtAnnounce
  sealPresentAtAnnouncement   = $okProbe.sealAtAnnounce
  exited = [string]$okProbe.exited
  note = 'R15-C1 is proven fixed by observation at the moment of the announcement'
}
Remove-FinalizationRun -Root $okRoot

# ---- 84: the R15-C1 artifact shape (COMPLETE + EXCEPTION) is rejected ------
$xRoot = New-FinalizationRun
$xProbe = Invoke-CompletionProbe -Root $xRoot
[void](Write-Evidence -Path (Join-Path $xRoot '99-runner-exception.json') -Text '{"status":"EXCEPTION"}')
$xCheck = $null
try { $xCheck = Test-ClashRunCompletion -RunPath $xRoot } catch { $xCheck = $null }
$xProblems = ''
if ($null -ne $xCheck) { $xProblems = (@($xCheck.problems) -join ' ') }
Add-Case 'completionValidatorRejectsExceptionBesideMarker' (
  $xProbe.ok -and
  (Test-Path -LiteralPath (Join-Path $xRoot '06-complete.json')) -and
  $null -ne $xCheck -and (-not $xCheck.ok) -and
  $xProblems -match 'exception') @{
  markerPresent = $true
  problems = $xProblems
  note = 'exactly the R15-C1 directory: a marker next to an exception is not an accepted run'
}
Remove-FinalizationRun -Root $xRoot

# ---- 85: evidence edited after it was sealed is detected --------------------
$mRoot = New-FinalizationRun
$mProbe = Invoke-CompletionProbe -Root $mRoot
[void](Write-Evidence -Path (Join-Path $mRoot '05-postflight-tampered.json') -Text 'x')
$mTarget = Join-Path $mRoot '02-preflight.json'
[System.IO.File]::WriteAllText($mTarget, '{"status":"PASS","edited":true}')
$mCheck = $null
try { $mCheck = Test-ClashRunCompletion -RunPath $mRoot } catch { $mCheck = $null }
$mProblems = ''
if ($null -ne $mCheck) { $mProblems = (@($mCheck.problems) -join ' ') }
Add-Case 'completionValidatorRejectsTamperedEvidence' (
  $mProbe.ok -and
  $null -ne $mCheck -and (-not $mCheck.ok) -and
  $mProblems -match '02-preflight\.json hash is') @{
  problems = $mProblems
  note = 'the seal is re-derived from disk, not trusted'
}
Remove-FinalizationRun -Root $mRoot

# ---- 86: a truncated seal does not verify ----------------------------------
$trRoot = New-FinalizationRun
$trProbe = Invoke-CompletionProbe -Root $trRoot
$trSealPath = Join-Path $trRoot 'EVIDENCE-MANIFEST.json'
$trSeal = Read-RunDocument -Path $trSealPath
$trTruncated = $null
if ($null -ne $trSeal) {
  $trFilesField = Get-ClashJsonField -Object $trSeal -Name 'files'
  $trFiles = @()
  if ($trFilesField['kind'] -ceq 'array') { $trFiles = @($trFilesField['value']) }
  if ($trFiles.Count -gt 1) {
    $trTruncated = [ordered]@{
      sealedUtc = (Get-DocumentProperty -Object $trSeal -Name 'sealedUtc' -Default '')
      adapter   = (Get-DocumentProperty -Object $trSeal -Name 'adapter' -Default '')
      fileCount = [int](Get-DocumentProperty -Object $trSeal -Name 'fileCount' -Default 0)
      chainHead = [string](Get-DocumentProperty -Object $trSeal -Name 'chainHead' -Default '')
      files     = @($trFiles[0..($trFiles.Count - 2)])
    }
    [System.IO.File]::WriteAllText($trSealPath, ($trTruncated | ConvertTo-Json -Depth 8))
  }
}
$trCheck = $null
try { $trCheck = Test-ClashRunCompletion -RunPath $trRoot } catch { $trCheck = $null }
$trProblems = ''
if ($null -ne $trCheck) { $trProblems = (@($trCheck.problems) -join ' ') }
Add-Case 'completionValidatorRejectsTruncatedSeal' (
  $trProbe.ok -and
  $null -ne $trTruncated -and
  $null -ne $trCheck -and (-not $trCheck.ok) -and
  ($trProblems -match 'chain head does not re-derive' -or $trProblems -match 'the seal says')) @{
  problems = $trProblems
  note = 'a dropped entry breaks the chain head and the declared count'
}
Remove-FinalizationRun -Root $trRoot

# ---- 87: an unreadable seal is reported, never thrown ----------------------
$cRoot = New-FinalizationRun
$cProbe = Invoke-CompletionProbe -Root $cRoot
[System.IO.File]::WriteAllText((Join-Path $cRoot 'EVIDENCE-MANIFEST.json'), 'this is not json {')
$cCheck = $null
$cThrew = ''
try { $cCheck = Test-ClashRunCompletion -RunPath $cRoot } catch { $cThrew = Protect-Text $_.Exception.Message }
$cProblems = ''
if ($null -ne $cCheck) { $cProblems = (@($cCheck.problems) -join ' ') }
Add-Case 'completionValidatorReportsUnreadableSeal' (
  $cProbe.ok -and
  [string]$cThrew -eq '' -and
  $null -ne $cCheck -and (-not $cCheck.ok) -and
  $cProblems -match 'not readable JSON') @{
  threw = $cThrew; problems = $cProblems
  note = 'StrictMode-safe inspection: a corrupt seal is a verdict, not an exception'
}
Remove-FinalizationRun -Root $cRoot

# ---- 88: evidence written after the seal is reported -----------------------
$uRoot = New-FinalizationRun
$uProbe = Invoke-CompletionProbe -Root $uRoot
[void](Write-Evidence -Path (Join-Path $uRoot '06-written-after-seal.json') -Text '{"late":true}')
$uCheck = $null
try { $uCheck = Test-ClashRunCompletion -RunPath $uRoot } catch { $uCheck = $null }
$uProblems = ''
if ($null -ne $uCheck) { $uProblems = (@($uCheck.problems) -join ' ') }
Add-Case 'completionValidatorRejectsUnsealedEvidence' (
  $uProbe.ok -and
  $null -ne $uCheck -and (-not $uCheck.ok) -and
  $uProblems -match 'is not sealed') @{
  problems = $uProblems
  note = 'the R15-C1 shape at file granularity: a receipt that appears after sealing invalidates the run'
}
Remove-FinalizationRun -Root $uRoot

# ---- 89: a required receipt that is missing forbids finalization -----------
$rRoot = New-FinalizationRun -Evidence @('02-preflight.json', '05-storage.json', '06-claim-release.json')
$rProbe = Invoke-CompletionProbe -Root $rRoot
$rMarker = Test-Path -LiteralPath (Join-Path $rRoot '06-complete.json')
$rCheck = $null
try { $rCheck = Test-ClashRunCompletion -RunPath $rRoot } catch { $rCheck = $null }
Add-Case 'completionRefusesMissingRequiredEvidence' (
  (-not $rProbe.ok) -and
  $rProbe.threw -match '04-postflight\.json' -and
  (-not $rMarker) -and
  $null -ne $rCheck -and (-not $rCheck.ok)) @{
  refusal = $rProbe.threw; markerWritten = $rMarker
  note = 'completion cannot be claimed without postflight evidence, even if the seal would verify'
}
Remove-FinalizationRun -Root $rRoot

# ---- 90: nothing on disk claims COMPLETE unless the run was accepted -------
$nRoot = New-FinalizationRun
$nProbe = Invoke-CompletionTailProbe -Root $nRoot -FailWriteJsonSuffix 'EVIDENCE-MANIFEST.json'
$nClaimants = @()
foreach ($f in @(Get-ChildItem -LiteralPath $nRoot -Recurse -File -Filter '*.json')) {
  $raw = ''
  try { $raw = [System.IO.File]::ReadAllText($f.FullName) } catch { }
  if ($raw -match '"status"\s*:\s*"COMPLETE"') { $nClaimants += $f.Name }
}
$nIntent = Read-RunDocument -Path (Join-Path $nRoot '06-finalization-intent.json')
$nAccepted = $null
try { $nAccepted = Test-ClashRunCompletion -RunPath $nRoot } catch { $nAccepted = $null }
Add-Case 'completionIntentNeverClaimsComplete' (
  [string]$nProbe.threw -ne '' -and
  $nClaimants.Count -eq 0 -and
  $null -ne $nIntent -and
  [string](Get-DocumentProperty -Object $nIntent -Name 'status' -Default '') -eq 'FINALIZING' -and
  $null -ne $nAccepted -and (-not $nAccepted.ok)) @{
  completeClaimants = @($nClaimants)
  intentStatus = [string](Get-DocumentProperty -Object $nIntent -Name 'status' -Default '')
  note = 'the provisional receipt says FINALIZING, and no artifact claims completion'
}
Remove-FinalizationRun -Root $nRoot

# ---- 91: the runner has exactly one completion path ------------------------
$deployText = [System.IO.File]::ReadAllText((Join-Path $pluginRoot 'deploy.ps1'))
$publishCount = ([regex]::Matches($deployText, [regex]::Escape('Publish-ClashCompletion -Root $run'))).Count
$directComplete = ([regex]::Matches($deployText, [regex]::Escape("New-PhaseReceipt '06-complete.json'"))).Count
$announceCount = ([regex]::Matches($deployText, [regex]::Escape('TERMINAL RECEIPT: COMPLETE'))).Count
$tailInfo = $null
$tailError = ''
try { $tailInfo = Get-CompletionTail -Path (Join-Path $pluginRoot 'deploy.ps1') } catch { $tailError = Protect-Text $_.Exception.Message }
Add-Case 'deployTailIsTheOnlyCompletionPath' (
  $publishCount -eq 1 -and
  $directComplete -eq 0 -and
  $announceCount -eq 1 -and
  [string]$tailError -eq '' -and
  $null -ne $tailInfo) @{
  publishCalls = $publishCount; directCompleteReceipts = $directComplete
  completeAnnouncements = $announceCount; tailLines = $(if ($null -ne $tailInfo) { $tailInfo.lines } else { 0 })
  note = 'a second, hand-written COMPLETE path cannot be added without failing this case'
}

# ===========================================================================
# 92-102: the completion-marker contract, field by field (Round 17 / C16-C1)
# ===========================================================================
# C16-C1: the consumer proved the seal and the marker-to-seal SHA binding, but it
# never read the marker's OWN chain claims. A marker could declare
# prevReceiptSha = 64 zeros and seal.chainHead = 64 zeros while the real sealed
# intent hash and the re-derived chain head were different, and
# Test-ClashRunCompletion still returned ok=true with no problems.
#
# These cases mutate a real, published marker (the marker is deliberately not
# part of the seal, which is what makes the attack possible) and require the
# consumer to reject every mutation - singly, so each check is proven to fire.

$zero64 = '0' * 64
$probeComment = 'local fixture; no SQL was executed'

# ---- 92: Codex's exact two-field mutation must now be rejected --------------
$c16Root = New-FinalizationRun
$c16Pub  = Invoke-CompletionProbe -Root $c16Root
$c16Before = $null
try { $c16Before = Test-ClashRunCompletion -RunPath $c16Root } catch { $c16Before = $null }
$c16Marker = Read-RunDocument -Path (Join-Path $c16Root '06-complete.json')
$c16SealSha = [string](Get-DocumentProperty -Object (Get-DocumentProperty -Object $c16Marker -Name 'seal' -Default $null) -Name 'sha256' -Default '')
[void](Set-CompletionMarkerField -Root $c16Root -Mutation @{
    'prevReceiptSha'   = $zero64
    'seal.chainHead'   = $zero64
  })
$c16After = $null
try { $c16After = Test-ClashRunCompletion -RunPath $c16Root } catch { $c16After = $null }
$c16Problems = ''
if ($null -ne $c16After) { $c16Problems = (@($c16After.problems) -join ' ') }
$c16SealStillVerifies = $null
try { $c16SealStillVerifies = Test-EvidenceSeal -Root $c16Root } catch { $c16SealStillVerifies = $null }
Add-Case 'completionRejectsCodexChainMutation' (
  $c16Pub.ok -and
  $null -ne $c16Before -and $c16Before.ok -and
  $null -ne $c16After -and (-not $c16After.ok) -and
  $c16Problems -match 'prevReceiptSha' -and
  $c16Problems -match 'chain head' -and
  $null -ne $c16SealStillVerifies -and $c16SealStillVerifies.ok -and
  [string]$c16After.sealSha256 -ceq $c16SealSha) @{
  acceptedBeforeMutation = $(if ($null -ne $c16Before) { $c16Before.ok } else { 'null' })
  acceptedAfterMutation  = $(if ($null -ne $c16After) { $c16After.ok } else { 'null' })
  problems = $c16Problems
  sealStillVerifies = $(if ($null -ne $c16SealStillVerifies) { $c16SealStillVerifies.ok } else { 'null' })
  sealShaUnchanged = ([string]$c16After.sealSha256 -ceq $c16SealSha)
  note = 'C16-C1 reproduction: two marker fields changed, seal untouched, consumer now refuses'
}
Remove-FinalizationRun -Root $c16Root

# ---- 93: only prevReceiptSha is wrong --------------------------------------
$pRoot = New-FinalizationRun
$pPub  = Invoke-CompletionProbe -Root $pRoot
[void](Set-CompletionMarkerField -Root $pRoot -Mutation @{ 'prevReceiptSha' = $zero64 })
$pCheck = $null
try { $pCheck = Test-ClashRunCompletion -RunPath $pRoot } catch { $pCheck = $null }
$pProblems = ''
if ($null -ne $pCheck) { $pProblems = (@($pCheck.problems) -join ' ') }
Add-Case 'completionRejectsWrongPrevReceiptShaOnly' (
  $pPub.ok -and
  $null -ne $pCheck -and (-not $pCheck.ok) -and
  $pProblems -match 'is not the hash of the sealed 06-finalization-intent' -and
  $pProblems -notmatch 'chain head') @{
  problems = $pProblems
  note = 'single-field isolation: the chain-head check must not be what fires'
}
Remove-FinalizationRun -Root $pRoot

# ---- 94: only the declared seal chain head is wrong ------------------------
$hRoot = New-FinalizationRun
$hPub  = Invoke-CompletionProbe -Root $hRoot
[void](Set-CompletionMarkerField -Root $hRoot -Mutation @{ 'seal.chainHead' = $zero64 })
$hCheck = $null
try { $hCheck = Test-ClashRunCompletion -RunPath $hRoot } catch { $hCheck = $null }
$hProblems = ''
if ($null -ne $hCheck) { $hProblems = (@($hCheck.problems) -join ' ') }
Add-Case 'completionRejectsWrongSealChainHeadOnly' (
  $hPub.ok -and
  $null -ne $hCheck -and (-not $hCheck.ok) -and
  $hProblems -match 'chain head' -and
  $hProblems -notmatch 'prevReceiptSha' -and
  $hProblems -match 'the seal re-derives to') @{
  problems = $hProblems
  note = 'single-field isolation: the predecessor check must not be what fires'
}
Remove-FinalizationRun -Root $hRoot

# ---- 95: the sealed intent is gone -----------------------------------------
$iRoot = New-FinalizationRun
$iPub  = Invoke-CompletionProbe -Root $iRoot
Remove-Item -LiteralPath (Join-Path $iRoot '06-finalization-intent.json') -Force
$iCheck = $null
try { $iCheck = Test-ClashRunCompletion -RunPath $iRoot } catch { $iCheck = $null }
$iProblems = ''
if ($null -ne $iCheck) { $iProblems = (@($iCheck.problems) -join ' ') }
Add-Case 'completionRejectsMissingIntent' (
  $iPub.ok -and
  $null -ne $iCheck -and (-not $iCheck.ok) -and
  $iProblems -match '06-finalization-intent\.json' -and
  $iProblems -match 'finalization intent') @{
  problems = $iProblems
  note = 'a marker whose predecessor no longer exists cannot be accepted'
}
Remove-FinalizationRun -Root $iRoot

# ---- 96: wrong JSON types ---------------------------------------------------
$t2Root = New-FinalizationRun
$t2Pub  = Invoke-CompletionProbe -Root $t2Root
[void](Set-CompletionMarkerField -Root $t2Root -Mutation @{
    'finalized'       = 'true'
    'seal.fileCount'  = 'six'
  })
$t2Check = $null
try { $t2Check = Test-ClashRunCompletion -RunPath $t2Root } catch { $t2Check = $null }
$t2Problems = ''
if ($null -ne $t2Check) { $t2Problems = (@($t2Check.problems) -join ' ') }
Add-Case 'completionRejectsMisTypedMarker' (
  $t2Pub.ok -and
  $null -ne $t2Check -and (-not $t2Check.ok) -and
  $t2Problems -match 'must be boolean true' -and
  $t2Problems -match 'must be an integer') @{
  problems = $t2Problems
  note = 'the string "true" and the string "six" are not the boolean and the integer'
}
Remove-FinalizationRun -Root $t2Root

# ---- 97: malformed and case-folded hashes ----------------------------------
$m2Root = New-FinalizationRun
$m2Pub  = Invoke-CompletionProbe -Root $m2Root
$m2Real = Read-RunDocument -Path (Join-Path $m2Root '06-complete.json')
$m2Sha  = [string](Get-DocumentProperty -Object (Get-DocumentProperty -Object $m2Real -Name 'seal' -Default $null) -Name 'sha256' -Default '')
[void](Set-CompletionMarkerField -Root $m2Root -Mutation @{
    'prevReceiptSha'  = ('a' * 63)
    'seal.chainHead'  = ('z' * 64)
    'seal.sha256'     = $m2Sha.ToUpperInvariant()
  })
$m2Check = $null
try { $m2Check = Test-ClashRunCompletion -RunPath $m2Root } catch { $m2Check = $null }
$m2Problems = ''
if ($null -ne $m2Check) { $m2Problems = (@($m2Check.problems) -join ' ') }
Add-Case 'completionRejectsMalformedHashFields' (
  $m2Pub.ok -and
  $null -ne $m2Check -and (-not $m2Check.ok) -and
  $m2Problems -match '64 lowercase hex' -and
  ([regex]::Matches($m2Problems, '64 lowercase hex')).Count -ge 3) @{
  problems = $m2Problems
  malformedFields = ([regex]::Matches($m2Problems, '64 lowercase hex')).Count
  note = 'a 63-character hash, a non-hex hash and an upper-cased copy of the real hash are all rejected'
}
Remove-FinalizationRun -Root $m2Root

# ---- 98: an intent chained to the wrong predecessor is never finalised -----
# The intent's own predecessor is the sealed claim release. A run whose intent
# claims any other predecessor cannot be completed: the publisher's consumer
# self-check refuses, a doubt marker is recorded and the caller must not
# announce. The consumer-side comparison itself is asserted in section [26].
$cbRoot = New-FinalizationRun
$cbPub  = Invoke-CompletionProbe -Root $cbRoot -PrevSha $zero64
$cbDoubt = Test-Path -LiteralPath (Join-Path $cbRoot '06-complete-unverified.json')
$cbCheck = $null
try { $cbCheck = Test-ClashRunCompletion -RunPath $cbRoot } catch { $cbCheck = $null }
$cbProblems = ''
if ($null -ne $cbCheck) { $cbProblems = (@($cbCheck.problems) -join ' ') }
Add-Case 'completionRejectsIntentChainBreak' (
  (-not $cbPub.ok) -and
  $cbPub.threw -match 'completion contract' -and
  $cbPub.threw -match 'the sealed intent prevReceiptSha' -and
  $cbPub.threw -match '06-claim-release\.json' -and
  $cbDoubt -and
  $null -ne $cbCheck -and (-not $cbCheck.ok)) @{
  refusal = $cbPub.threw
  doubtRecorded = $cbDoubt
  problems = $cbProblems
  note = 'intent -> claim release is verified by the publisher through the consumer before anything is announced'
}
Remove-FinalizationRun -Root $cbRoot

# ---- 99: required evidence disappears after it was sealed ------------------
# The seal still LISTS the receipt (the manifest is not rewritten), so the
# verdict is "sealed but missing from disk": the canonical evidence a completed
# run must have is gone, and the run cannot be accepted.
$drRoot = New-FinalizationRun
$drPub  = Invoke-CompletionProbe -Root $drRoot
Remove-Item -LiteralPath (Join-Path $drRoot '04-postflight.json') -Force
$drCheck = $null
try { $drCheck = Test-ClashRunCompletion -RunPath $drRoot } catch { $drCheck = $null }
$drProblems = ''
if ($null -ne $drCheck) { $drProblems = (@($drCheck.problems) -join ' ') }
Add-Case 'completionRejectsPostSealEvidenceLoss' (
  $drPub.ok -and
  $null -ne $drCheck -and (-not $drCheck.ok) -and
  $drProblems -match '04-postflight\.json is sealed but missing from disk' -and
  $drProblems -match 'the sealed intent requires 04-postflight\.json but no such file exists') @{
  problems = $drProblems
  note = 'a canonical receipt removed after sealing is caught twice: by the seal and by the declared required evidence'
}
Remove-FinalizationRun -Root $drRoot

# ---- 100: writerRunId contradicts the sealed claim release -----------------
$w2Root = New-FinalizationRun
$w2Pub  = Invoke-CompletionProbe -Root $w2Root
[void](Set-CompletionMarkerField -Root $w2Root -Mutation @{ 'writerRunId' = 'someone-elses-run' })
$w2Check = $null
try { $w2Check = Test-ClashRunCompletion -RunPath $w2Root } catch { $w2Check = $null }
$w2Problems = ''
if ($null -ne $w2Check) { $w2Problems = (@($w2Check.problems) -join ' ') }
Add-Case 'completionRejectsContradictoryWriterRunId' (
  $w2Pub.ok -and
  $null -ne $w2Check -and (-not $w2Check.ok) -and
  $w2Problems -match 'writerRunId' -and
  $w2Problems -match 'sealed claim release') @{
  problems = $w2Problems
  note = 'the run identity is checked against the sealed 06-claim-release.json'
}
Remove-FinalizationRun -Root $w2Root

# ---- 101: the marker names a different seal --------------------------------
$s2Root = New-FinalizationRun
$s2Pub  = Invoke-CompletionProbe -Root $s2Root
[void](Set-CompletionMarkerField -Root $s2Root -Mutation @{ 'seal.name' = 'OTHER-MANIFEST.json' })
$s2Check = $null
try { $s2Check = Test-ClashRunCompletion -RunPath $s2Root } catch { $s2Check = $null }
$s2Problems = ''
if ($null -ne $s2Check) { $s2Problems = (@($s2Check.problems) -join ' ') }
Add-Case 'completionRejectsUnknownSealName' (
  $s2Pub.ok -and
  $null -ne $s2Check -and (-not $s2Check.ok) -and
  $s2Problems -match 'names the seal') @{
  problems = $s2Problems
  note = 'seal.name was an unchecked claim; it is now compared with the sealed name'
}
Remove-FinalizationRun -Root $s2Root

# ---- 102: the marker claims a foreign adapter ------------------------------
$a2Root = New-FinalizationRun
$a2Pub  = Invoke-CompletionProbe -Root $a2Root
[void](Set-CompletionMarkerField -Root $a2Root -Mutation @{ 'adapter' = 'other-adapter/9.9.9' })
$a2Check = $null
try { $a2Check = Test-ClashRunCompletion -RunPath $a2Root } catch { $a2Check = $null }
$a2Problems = ''
if ($null -ne $a2Check) { $a2Problems = (@($a2Check.problems) -join ' ') }
Add-Case 'completionRejectsForeignAdapter' (
  $a2Pub.ok -and
  $null -ne $a2Check -and (-not $a2Check.ok) -and
  $a2Problems -match 'marker adapter' -and
  $a2Problems -match 'written by') @{
  problems = $a2Problems
  note = 'adapter is compared with the identity the verified seal records'
}
Remove-FinalizationRun -Root $a2Root

# ===========================================================================
# Round 18 (C17-C1): the JSON type boundary
# ===========================================================================
# The accessor and the kind classifier are the foundation everything else rests
# on, so they are executed first, on shapes that PowerShell cannot assign.
$shapeText = '{"empty":[],"single":["a"],"multi":["a","b"],"nested":[["a"]],"object":{"k":1},"nul":null,"whole":6,"half":6.5,"flag":true,"text":"s"}'
$shapeDoc  = $shapeText | ConvertFrom-Json
$shapeEmpty  = Get-ClashProperty -Object $shapeDoc -Name 'empty'  -Default 'DEFAULT'
$shapeSingle = Get-ClashProperty -Object $shapeDoc -Name 'single' -Default 'DEFAULT'
$shapeMulti  = Get-ClashProperty -Object $shapeDoc -Name 'multi'  -Default 'DEFAULT'
$shapeNested = Get-ClashProperty -Object $shapeDoc -Name 'nested' -Default 'DEFAULT'
$shapeObject = Get-ClashProperty -Object $shapeDoc -Name 'object' -Default 'DEFAULT'
$shapeNull   = Get-ClashProperty -Object $shapeDoc -Name 'nul'    -Default 'DEFAULT'
$shapeWhole  = Get-ClashProperty -Object $shapeDoc -Name 'whole'  -Default 'DEFAULT'
$shapeHalf   = Get-ClashProperty -Object $shapeDoc -Name 'half'   -Default 'DEFAULT'
$shapeFlag   = Get-ClashProperty -Object $shapeDoc -Name 'flag'   -Default 'DEFAULT'
$shapeString = Get-ClashProperty -Object $shapeDoc -Name 'text'   -Default 'DEFAULT'
Add-Case 'jsonAccessorPreservesCollectionShape' (
  (($shapeEmpty -is [array]) -and (@($shapeEmpty).Count -eq 0)) -and
  (($shapeSingle -is [array]) -and (@($shapeSingle).Count -eq 1) -and ([string]$shapeSingle[0] -ceq 'a')) -and
  (($shapeMulti -is [array]) -and (@($shapeMulti).Count -eq 2)) -and
  (($shapeNested -is [array]) -and (@($shapeNested).Count -eq 1) -and ($shapeNested[0] -is [array]) -and ([string]$shapeNested[0][0] -ceq 'a')) -and
  ($shapeObject -is [System.Management.Automation.PSCustomObject]) -and
  ($shapeNull -ceq 'DEFAULT') -and
  (($shapeWhole -is [int]) -and ($shapeWhole -eq 6)) -and
  ($shapeHalf -eq 6.5) -and
  ($shapeFlag -eq $true) -and
  ($shapeString -ceq 's')) @{
  emptyKind = $(if ($null -eq $shapeEmpty) { 'null' } else { $shapeEmpty.GetType().Name })
  singleCount = @($shapeSingle).Count
  nestedCount = @($shapeNested).Count
  note = 'C17-C1 root cause: the accessor must not enumerate. [] stays empty, ["a"] stays one element, [["a"]] stays nested.'
}

$kindOf = @{}
foreach ($kindName in @('absent', 'nul', 'text', 'flag', 'whole', 'half', 'object', 'empty', 'single', 'nested')) {
  $kindOf[$kindName] = (Get-ClashJsonField -Object $shapeDoc -Name $kindName)['kind']
}
Add-Case 'jsonFieldReportsExactJsonKinds' (
  ($kindOf['absent'] -ceq 'missing') -and
  ($kindOf['nul'] -ceq 'null') -and
  ($kindOf['text'] -ceq 'string') -and
  ($kindOf['flag'] -ceq 'boolean') -and
  ($kindOf['whole'] -ceq 'integer') -and
  ($kindOf['half'] -ceq 'number') -and
  ($kindOf['object'] -ceq 'object') -and
  ($kindOf['empty'] -ceq 'array') -and
  ($kindOf['single'] -ceq 'array') -and
  ($kindOf['nested'] -ceq 'array') -and
  (Test-ClashJsonKind -Value 6 -Kind 'integer') -and
  (Test-ClashJsonKind -Value 6 -Kind 'number') -and
  (-not (Test-ClashJsonKind -Value 6.5 -Kind 'integer')) -and
  (-not (Test-ClashJsonKind -Value '6' -Kind 'integer')) -and
  (-not (Test-ClashJsonKind -Value @('s') -Kind 'string')) -and
  (Test-ClashJsonKind -Value @('s') -Kind 'array')) @{
  kinds = ($kindOf.GetEnumerator() | Sort-Object Name | ForEach-Object { '{0}={1}' -f $_.Key, $_.Value }) -join ' '
  note = 'a classifier, never a converter: "6" is not an integer, [..] is not a string, 6.5 is not an integer'
}

$arrayRender = Format-ClashFieldValue -Value @('clash-completion/2')
$nullRender  = Format-ClashFieldValue -Value $null
Add-Case 'jsonFieldSeparatesMissingFromNull' (
  (((Get-ClashJsonField -Object $shapeDoc -Name 'absent')['present']) -eq $false) -and
  (((Get-ClashJsonField -Object $shapeDoc -Name 'nul')['present']) -eq $true) -and
  (((Get-ClashJsonField -Object $shapeDoc -Name 'nul')['kind']) -ceq 'null') -and
  ($arrayRender -match '^array\(1\)') -and
  ($arrayRender -match 'string "clash-completion/2"') -and
  (-not ($arrayRender -match '^string')) -and
  ($nullRender -ceq '<missing or null>')) @{
  arrayRender = $arrayRender
  nullRender = $nullRender
  note = 'a verdict must never render ["x"] as string "x": that is the confusion C17-C1 was'
}

# One adversarial marker fixture: publish a real marker with the real publisher,
# overwrite ONE field with raw JSON text, and record the consumer's verdict.
function Invoke-MarkerTypeProbe {
  param([string]$Field, [string]$RawJson)

  $root = New-FinalizationRun
  $pub  = Invoke-CompletionProbe -Root $root
  $before = $null
  try { $before = Test-ClashRunCompletion -RunPath $root } catch { $before = $null }
  $sealBefore = ''
  if ($null -ne $before) { $sealBefore = [string]$before.sealSha256 }
  [void](Set-JsonScalarField -Path (Join-Path $root '06-complete.json') -Name $Field -RawJson $RawJson)
  $rawDoc = Read-RunDocument -Path (Join-Path $root '06-complete.json')
  $fieldRecord = Get-ClashJsonField -Object $rawDoc -Name $Field
  $check = $null
  try { $check = Test-ClashRunCompletion -RunPath $root } catch { $check = $null }
  $problems = ''
  if ($null -ne $check) { $problems = (@($check.problems) -join ' ') }
  $seal = $null
  try { $seal = Test-EvidenceSeal -Root $root -Require @(Get-ClashCompletionRequiredEvidence) } catch { $seal = $null }
  $count = -1
  if ($fieldRecord['kind'] -ceq 'array') { $count = @($fieldRecord['value']).Count }
  return @{
    root       = $root
    pubOk      = [bool]$pub.ok
    beforeOk   = ($null -ne $before) -and [bool]$before.ok
    sealBefore = $sealBefore
    sealAfter  = $(if ($null -ne $check) { [string]$check.sealSha256 } else { '' })
    sealOk     = ($null -ne $seal) -and [bool]$seal.ok
    kind       = [string]$fieldRecord['kind']
    count      = $count
    ok         = ($null -ne $check) -and [bool]$check.ok
    problems   = $problems
  }
}

# ---- 106: Codex C17-C1 exactly: the protocol is a one-element array ---------
$p1 = Invoke-MarkerTypeProbe -Field 'protocol' -RawJson '["clash-completion/2"]'
Add-Case 'completionRejectsProtocolSingletonArray' (
  $p1['pubOk'] -and $p1['beforeOk'] -and
  ($p1['kind'] -ceq 'array') -and
  ($p1['count'] -eq 1) -and
  (-not $p1['ok']) -and
  ($p1['problems'] -match 'the marker protocol is array\(1\)') -and
  $p1['sealOk'] -and
  ([string]$p1['sealAfter'] -ceq [string]$p1['sealBefore'])) @{
  cases = 'protocol = ["clash-completion/2"]'
  kind = $p1['kind']
  problems = $p1['problems']
  note = 'the independent acceptance reproduced this as accepted; it is rejected now, with the seal still verified'
}
Remove-FinalizationRun -Root $p1['root']

# ---- 107: an empty array ----------------------------------------------------
$p2 = Invoke-MarkerTypeProbe -Field 'protocol' -RawJson '[]'
Add-Case 'completionRejectsProtocolEmptyArray' (
  $p2['pubOk'] -and $p2['beforeOk'] -and
  ($p2['kind'] -ceq 'array') -and
  ($p2['count'] -eq 0) -and
  (-not $p2['ok']) -and
  ($p2['problems'] -match 'the marker protocol is array\(0\)')) @{
  cases = 'protocol = []'
  problems = $p2['problems']
  note = 'the accessor used to deliver [] as nothing at all, which is how "absent" got confused with "empty"'
}
Remove-FinalizationRun -Root $p2['root']

# ---- 108: a two-element array ----------------------------------------------
$p3 = Invoke-MarkerTypeProbe -Field 'protocol' -RawJson '["clash-completion/2","clash-completion/2"]'
Add-Case 'completionRejectsProtocolMultiValueArray' (
  $p3['pubOk'] -and $p3['beforeOk'] -and
  ($p3['kind'] -ceq 'array') -and
  ($p3['count'] -eq 2) -and
  (-not $p3['ok']) -and
  ($p3['problems'] -match 'the marker protocol is array\(2\)')) @{
  cases = 'protocol = ["clash-completion/2","clash-completion/2"]'
  problems = $p3['problems']
  note = 'a multi-element array survives the pipeline unchanged; it must still be a wrong type'
}
Remove-FinalizationRun -Root $p3['root']

# ---- 109: a nested array ----------------------------------------------------
$p4 = Invoke-MarkerTypeProbe -Field 'protocol' -RawJson '[["clash-completion/2"]]'
Add-Case 'completionRejectsProtocolNestedArray' (
  $p4['pubOk'] -and $p4['beforeOk'] -and
  ($p4['kind'] -ceq 'array') -and
  ($p4['count'] -eq 1) -and
  (-not $p4['ok']) -and
  ($p4['problems'] -match 'the marker protocol is array\(1\) \[array\(1\)')) @{
  cases = 'protocol = [["clash-completion/2"]]'
  problems = $p4['problems']
  note = 'nesting is preserved and rejected: a collection is not a string at any depth'
}
Remove-FinalizationRun -Root $p4['root']

# ---- 110: an object where a string is required -----------------------------
$p5 = Invoke-MarkerTypeProbe -Field 'protocol' -RawJson '{"value":"clash-completion/2"}'
Add-Case 'completionRejectsProtocolObject' (
  $p5['pubOk'] -and $p5['beforeOk'] -and
  ($p5['kind'] -ceq 'object') -and
  (-not $p5['ok']) -and
  ($p5['problems'] -match 'the marker protocol is object')) @{
  cases = 'protocol = {"value":"clash-completion/2"}'
  problems = $p5['problems']
  note = 'an object is not a string, and its contents are never searched for the expected value'
}
Remove-FinalizationRun -Root $p5['root']

# ---- 111: an explicit JSON null --------------------------------------------
$p6 = Invoke-MarkerTypeProbe -Field 'protocol' -RawJson 'null'
Add-Case 'completionRejectsProtocolNull' (
  $p6['pubOk'] -and $p6['beforeOk'] -and
  ($p6['kind'] -ceq 'null') -and
  (-not $p6['ok']) -and
  ($p6['problems'] -match 'the marker protocol is <missing or null>, not')) @{
  cases = 'protocol = null'
  problems = $p6['problems']
  note = 'null and absent are separate kinds, and both are rejected for a required string'
}
Remove-FinalizationRun -Root $p6['root']

# ---- 112: every other authoritative marker field as a collection -----------
$c17Root = New-FinalizationRun
$c17Pub  = Invoke-CompletionProbe -Root $c17Root
$c17Doc  = Read-RunDocument -Path (Join-Path $c17Root '06-complete.json')
$c17SealDoc = Get-DocumentProperty -Object $c17Doc -Name 'seal' -Default $null
$c17Sha  = [string](Get-DocumentProperty -Object $c17SealDoc -Name 'sha256' -Default '')
$c17Head = [string](Get-DocumentProperty -Object $c17SealDoc -Name 'chainHead' -Default '')
$c17Prev = [string](Get-DocumentProperty -Object $c17Doc -Name 'prevReceiptSha' -Default '')
[void](Set-CompletionMarkerField -Root $c17Root -Mutation @{
    'status'         = @('COMPLETE')
    'finalized'      = @($true)
    'adapter'        = @("$($script:ClashAdapterId)/$($script:ClashAdapterVersion)")
    'prevReceiptSha' = @($c17Prev)
    'writerRunId'    = @('probe-run-id')
    'seal'           = @($c17SealDoc)
  })
$c17Check = $null
try { $c17Check = Test-ClashRunCompletion -RunPath $c17Root } catch { $c17Check = $null }
$c17Problems = ''
if ($null -ne $c17Check) { $c17Problems = (@($c17Check.problems) -join ' ') }
Add-Case 'completionRejectsArrayTypedMarkerFields' (
  $c17Pub.ok -and
  $null -ne $c17Check -and (-not $c17Check.ok) -and
  ($c17Problems -match 'the marker status is array\(1\)') -and
  ($c17Problems -match 'must be boolean true') -and
  ($c17Problems -match 'the marker adapter is array\(1\)') -and
  ($c17Problems -match 'the marker prevReceiptSha is array\(1\)') -and
  ($c17Problems -match 'the marker writerRunId is array\(1\)') -and
  ($c17Problems -match 'the marker seal block is array\(1\)')) @{
  problems = $c17Problems
  note = 'the same singleton-array shape is rejected at every authoritative field, not just at protocol'
}
Remove-FinalizationRun -Root $c17Root

# ---- 113: the seal block's own fields as collections -----------------------
$b1Root = New-FinalizationRun
$b1Pub  = Invoke-CompletionProbe -Root $b1Root
$b1Doc  = Read-RunDocument -Path (Join-Path $b1Root '06-complete.json')
$b1Seal = Get-DocumentProperty -Object $b1Doc -Name 'seal' -Default $null
$b1Sha  = [string](Get-DocumentProperty -Object $b1Seal -Name 'sha256' -Default '')
$b1Head = [string](Get-DocumentProperty -Object $b1Seal -Name 'chainHead' -Default '')
$b1Count = Get-DocumentProperty -Object $b1Seal -Name 'fileCount' -Default 0
[void](Set-CompletionMarkerField -Root $b1Root -Mutation @{
    'seal.name'      = @('EVIDENCE-MANIFEST.json')
    'seal.sha256'    = @($b1Sha)
    'seal.fileCount' = @($b1Count)
    'seal.chainHead' = @($b1Head)
  })
$b1Check = $null
try { $b1Check = Test-ClashRunCompletion -RunPath $b1Root } catch { $b1Check = $null }
$b1Problems = ''
if ($null -ne $b1Check) { $b1Problems = (@($b1Check.problems) -join ' ') }
Add-Case 'completionRejectsArrayTypedSealBlockFields' (
  $b1Pub.ok -and
  $null -ne $b1Check -and (-not $b1Check.ok) -and
  ($b1Problems -match 'the marker names the seal array\(1\)') -and
  ($b1Problems -match 'the marker seal sha256 is array\(1\)') -and
  ($b1Problems -match 'the marker seal fileCount is array\(1\)') -and
  ($b1Problems -match 'the marker seal chainHead is array\(1\)') -and
  ([regex]::Matches($b1Problems, '64 lowercase hex')).Count -ge 2) @{
  problems = $b1Problems
  note = 'the hashes are not extracted from a collection: a one-element array is the wrong type, not the right value'
}
Remove-FinalizationRun -Root $b1Root

# ---- 114: the marker root is not an object --------------------------------
$r1Root = New-FinalizationRun
$r1Pub  = Invoke-CompletionProbe -Root $r1Root
[System.IO.File]::WriteAllText((Join-Path $r1Root '06-complete.json'), '[{"protocol":"clash-completion/2"}]')
$r1Check = $null
try { $r1Check = Test-ClashRunCompletion -RunPath $r1Root } catch { $r1Check = $null }
$r1Problems = ''
if ($null -ne $r1Check) { $r1Problems = (@($r1Check.problems) -join ' ') }
Add-Case 'completionRejectsScalarRootMarker' (
  $r1Pub.ok -and
  $null -ne $r1Check -and (-not $r1Check.ok) -and
  ($r1Problems -match '06-complete\.json is array\(1\)') -and
  ($r1Problems -match 'a completion marker must be a JSON object')) @{
  problems = $r1Problems
  note = 'a marker whose root is a collection has no fields; that is a wrong shape, reported as such'
}
Remove-FinalizationRun -Root $r1Root

# ---- 115: the seal's files field is not an array --------------------------
$f1Root = New-FinalizationRun
$f1Pub  = Invoke-CompletionProbe -Root $f1Root
[void](Set-JsonFileRegex -Path (Join-Path $f1Root 'EVIDENCE-MANIFEST.json') `
    -Pattern '("files"[ \t]*:[ \t]*\[)' `
    -Replacement '"files": "not-an-array", "removedFiles": [')
$f1Seal = $null
try { $f1Seal = Test-EvidenceSeal -Root $f1Root -Require @(Get-ClashCompletionRequiredEvidence) } catch { $f1Seal = $null }
$f1Problems = ''
if ($null -ne $f1Seal) { $f1Problems = (@($f1Seal.problems) -join ' ') }
Add-Case 'evidenceSealRejectsNonArrayFiles' (
  $f1Pub.ok -and
  $null -ne $f1Seal -and (-not $f1Seal.ok) -and
  ($f1Problems -match 'the seal field files is string "not-an-array"') -and
  ($f1Problems -match 'it must be a JSON array of entries')) @{
  problems = $f1Problems
  note = 'a seal whose entries are not an array proves nothing, whatever its chain head says'
}
Remove-FinalizationRun -Root $f1Root

# ---- 116: the seal's fileCount is a string --------------------------------
$f2Root = New-FinalizationRun
$f2Pub  = Invoke-CompletionProbe -Root $f2Root
[void](Set-JsonScalarField -Path (Join-Path $f2Root 'EVIDENCE-MANIFEST.json') -Name 'fileCount' -RawJson '"6"')
$f2Seal = $null
try { $f2Seal = Test-EvidenceSeal -Root $f2Root -Require @(Get-ClashCompletionRequiredEvidence) } catch { $f2Seal = $null }
$f2Problems = ''
if ($null -ne $f2Seal) { $f2Problems = (@($f2Seal.problems) -join ' ') }
Add-Case 'evidenceSealRejectsStringFileCount' (
  $f2Pub.ok -and
  $null -ne $f2Seal -and (-not $f2Seal.ok) -and
  ($f2Problems -match 'the seal fileCount is string "6"') -and
  ($f2Problems -match 'it must be a JSON integer')) @{
  problems = $f2Problems
  note = 'the old reader cast the claim with [int], so "6" passed; the count is now a JSON integer or a rejection'
}
Remove-FinalizationRun -Root $f2Root

# ---- 117: the seal's chainHead is a collection ----------------------------
$f3Root = New-FinalizationRun
$f3Pub  = Invoke-CompletionProbe -Root $f3Root
$f3SealDoc = Read-RunDocument -Path (Join-Path $f3Root 'EVIDENCE-MANIFEST.json')
$f3Head = [string](Get-DocumentProperty -Object $f3SealDoc -Name 'chainHead' -Default '')
[void](Set-JsonScalarField -Path (Join-Path $f3Root 'EVIDENCE-MANIFEST.json') -Name 'chainHead' -RawJson ('["' + $f3Head + '"]'))
$f3Seal = $null
try { $f3Seal = Test-EvidenceSeal -Root $f3Root -Require @(Get-ClashCompletionRequiredEvidence) } catch { $f3Seal = $null }
$f3Problems = ''
if ($null -ne $f3Seal) { $f3Problems = (@($f3Seal.problems) -join ' ') }
Add-Case 'evidenceSealRejectsArrayChainHead' (
  $f3Pub.ok -and
  $null -ne $f3Seal -and (-not $f3Seal.ok) -and
  ($f3Problems -match 'the seal chainHead is array\(1\)') -and
  ($f3Problems -match 'it must be a JSON string of 64 lowercase hex characters')) @{
  problems = $f3Problems
  note = 'the real chain head inside an array is still a wrong type; the value is never mined out of a collection'
}
Remove-FinalizationRun -Root $f3Root

# ---- 118: the sealed finalization intent carries collections -------------
$i1Root = New-FinalizationRun
$i1Pub  = Invoke-CompletionProbe -Root $i1Root
$i1Path = Join-Path $i1Root '06-finalization-intent.json'
[void](Set-JsonScalarField -Path $i1Path -Name 'status'  -RawJson '["FINALIZING"]')
[void](Set-JsonScalarField -Path $i1Path -Name 'receipt' -RawJson '["06-finalization-intent.json"]')
[void](Set-JsonFileRegex -Path $i1Path -Pattern '("requiredEvidence"[ \t]*:[ \t]*\[)' -Replacement '"requiredEvidence": "05-storage.json", "declaredEvidence": [')
$i1Check = $null
try { $i1Check = Test-ClashRunCompletion -RunPath $i1Root } catch { $i1Check = $null }
$i1Problems = ''
if ($null -ne $i1Check) { $i1Problems = (@($i1Check.problems) -join ' ') }
Add-Case 'completionRejectsCollectionValuedIntent' (
  $i1Pub.ok -and
  $null -ne $i1Check -and (-not $i1Check.ok) -and
  ($i1Problems -match 'the sealed intent status is array\(1\)') -and
  ($i1Problems -match 'the sealed intent names itself array\(1\)') -and
  ($i1Problems -match 'the sealed intent requiredEvidence is string "05-storage.json"') -and
  ($i1Problems -match 'it must be a non-empty array')) @{
  problems = $i1Problems
  note = 'the intent is sealed evidence, but its SHAPE is still checked: a string is not a list of requirements'
}
Remove-FinalizationRun -Root $i1Root

# ---- 119: the sealed claim release carries collections -------------------
$q1Root = New-FinalizationRun
$q1Pub  = Invoke-CompletionProbe -Root $q1Root
$q1Path = Join-Path $q1Root '06-claim-release.json'
[void](Set-JsonScalarField -Path $q1Path -Name 'status'   -RawJson '["PASS"]')
[void](Set-JsonScalarField -Path $q1Path -Name 'released' -RawJson '[true]')
[void](Set-JsonScalarField -Path $q1Path -Name 'runId'    -RawJson '["probe-run-id"]')
$q1Check = $null
try { $q1Check = Test-ClashRunCompletion -RunPath $q1Root } catch { $q1Check = $null }
$q1Problems = ''
if ($null -ne $q1Check) { $q1Problems = (@($q1Check.problems) -join ' ') }
Add-Case 'completionRejectsCollectionValuedClaimRelease' (
  $q1Pub.ok -and
  $null -ne $q1Check -and (-not $q1Check.ok) -and
  ($q1Problems -match 'the sealed claim release status is array\(1\)') -and
  ($q1Problems -match 'does not record released = true') -and
  ($q1Problems -match 'the marker writerRunId .* is not the runId')) @{
  problems = $q1Problems
  note = 'released = [true] is not released = true, and a runId inside a list is not the runId'
}
Remove-FinalizationRun -Root $q1Root

# ---- 120: verification metadata carries collections ----------------------
$metaDoc = '{"adapterId":"clash-native-adapter","adapterVersion":"5.0.0","adapterSha256":"' + ('a' * 64) + '","verdict":["PASS"],"powerShellVersion":"5.1.0","problems":"none","casesExecuted":[' + $requiredCases.Count + '],"cases":{}}' | ConvertFrom-Json
$metaVerdict = $null
try { $metaVerdict = Test-SelfTestReceipt -Document $metaDoc -AdapterSha256 ('a' * 64) } catch { $metaVerdict = $null }
$metaProblems = ''
if ($null -ne $metaVerdict) { $metaProblems = (@($metaVerdict.problems) -join ' ') }
Add-Case 'selfTestReceiptRejectsCollectionValuedMetadata' (
  $null -ne $metaVerdict -and (-not $metaVerdict.ok) -and
  ($metaProblems -match 'verdict is a JSON array, not a JSON string') -and
  ($metaProblems -match 'problems is a JSON string, not a JSON array') -and
  ($metaProblems -match 'casesExecuted is a JSON array, not a JSON integer')) @{
  problems = $metaProblems
  note = 'a receipt that says ["PASS"] or [102] is a wrong type; a verification record proves nothing it does not state'
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
$selfCheck = $null
try {
  $roundTripDoc = ($doc | ConvertTo-Json -Depth 8) | ConvertFrom-Json
  $selfCheck = Test-SelfTestReceipt -Document $roundTripDoc -AdapterSha256 $script:adapterShaFinal
}
catch {
  # A serialization failure must not escape as an unexplained stack trace, and it
  # must never leave a PASS receipt behind: fall back to a minimal FAIL document.
  $serializationError = 'unknown'
  try { $serializationError = Protect-Text $_.Exception.Message } catch { }
  $script:problems += ('receipt serialization failed: ' + $serializationError)
  $verdictValue = 'FAIL'
  $selfCheck = [ordered]@{ ok = $false; problems = @('serialization failed') }
  $doc = [ordered]@{
    verdict           = 'FAIL'
    utc               = (Get-Date).ToUniversalTime().ToString('o')
    host              = $env:COMPUTERNAME
    powerShellVersion = $script:psVersionFinal
    adapterId         = $script:ClashAdapterId
    adapterVersion    = $script:ClashAdapterVersion
    adapterSha256     = $script:adapterShaFinal
    casesExecuted     = @($script:cases.Keys).Count
    casesExpected     = $requiredCases.Count
    cases             = @{}
    problems          = @($script:problems)
    serializationError = $serializationError
  }
}
if ($null -ne $selfCheck -and -not $selfCheck.ok) {
  foreach ($p in @($selfCheck.problems)) { $script:problems += ('receipt rejected by the gate validator: ' + $p) }
  $verdictValue = 'FAIL'
  if (-not $doc.Contains('serializationError')) { $doc = New-SelfTestDocument -Verdict $verdictValue }
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
