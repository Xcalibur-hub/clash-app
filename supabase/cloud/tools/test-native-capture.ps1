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

# Round 5: the inventory must be exactly 46 unique, non-empty strings, and that
# is asserted before a single child process is started. A malformed inventory
# (nested array, duplicate, blank, wrong count) ends here with a non-PASS receipt.
$inventoryCheck = Assert-SelfTestInventory -Names $requiredCases -ExpectedCount 46
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
    casesExpected     = 46
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
    if ($startAt -ge 0 -and $lines[$i] -match '^\$seal\s*=\s*Seal-Evidence\s+-Root\s+\$run\s*$') {
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
    '06-complete.json'                     = 1
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

# ---- 27: one returned row that IS this run -> PASS -> COMPLETE -------------
$probeOwned = Invoke-ClaimReleaseProbe -RunId $probeRunId -Stub @{
  exitCode = 0; timedOut = $false; launchError = $null; captureNote = ''
  stdOut = ($probeRunId + "`n"); stdErr = ''
}
$ownedOutcome = Test-ClaimReleaseOutcome -Probe $probeOwned `
  -ExpectedReceipts @('06-claim-release-ownership.json', '06-claim-release.json', '06-complete.json') `
  -ExpectedStop '' `
  -ExpectedStatus @{ '06-claim-release-ownership.json' = 'PASS'; '06-claim-release.json' = 'PASS'; '06-complete.json' = 'COMPLETE' }
$ownedArgs  = @($probeOwned.arguments)
$ownedAt    = [array]::IndexOf($ownedArgs, '-c')
$ownedSql   = ''
if ($ownedAt -ge 0 -and ($ownedAt + 1) -lt $ownedArgs.Count) { $ownedSql = [string]$ownedArgs[$ownedAt + 1] }
$ownedScan  = Get-ProbeReceipt -Probe $probeOwned -Name '06-claim-release-ownership.json'
$ownedDone  = Get-ProbeReceipt -Probe $probeOwned -Name '06-complete.json'
Add-Case 'claimReleaseOwnedRowProceedsToComplete' (
  $ownedOutcome.ok -and
  [string]$probeOwned.threw -eq '' -and
  [string]$probeOwned.stopName -eq '' -and
  $probeOwned.reachedComplete -eq $true -and
  $probeOwned.nativeCalls -eq 1 -and
  $probeOwned.evidenceCalls -eq 2 -and
  $ownedArgs -contains '-t' -and $ownedArgs -contains '-A' -and
  $ownedArgs -contains 'ON_ERROR_STOP=1' -and $ownedArgs -contains 'VERBOSITY=verbose' -and
  $ownedSql.Contains('returning run_id') -and
  $ownedSql.Contains("run_id = '" + $probeRunId + "'") -and
  [int]$ownedScan['returnedRows'] -eq 1 -and
  @($ownedScan['returned']).Count -eq 1 -and
  [string]$ownedDone['status'] -eq 'COMPLETE' -and
  [string]$ownedDone['writerRunId'] -eq $probeRunId -and
  [int]$ownedDone['appliedThisRun'] -eq 111) @{
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
  note            = 'the false STOP of R9-C1 is proven gone: this branch reaches COMPLETE'
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
    if ($startAt -ge 0 -and $lines[$i] -match '^\$seal\s*=\s*Seal-Evidence\s+-Root\s+\$run\s*$') {
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
    "'06-complete.json'"                                            = 1
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

# Builds a report that looks exactly like psql's aligned output for that script.
# Variants are produced by omitting, duplicating, renaming, breaking or failing
# individual rows, so every fixture differs from the contract in exactly one way.
function New-VerifyReportText {
  param(
    [Parameter(Mandatory = $true)][string]$ReportName,
    [hashtable]$StatusByOrd = @{},
    [int[]]$OmitOrds = @(),
    [int[]]$DuplicateOrds = @(),
    [int[]]$BreakOrds = @(),
    [hashtable]$RenameOrds = @{}
  )

  $contract = Get-ClashVerifyContract -ReportName $ReportName
  if ($null -eq $contract) { throw ('no contract for ' + $ReportName) }

  $lines = @()
  $lines += ' ord |              check_name              |   expected   |   actual   | status'
  $lines += '-----+--------------------------------------+--------------+------------+--------'
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
      $lines += ('{0,4} | {1} | {2}' -f $ord, $name, $c.expected)
      continue
    }
    $lines += ('{0,4} | {1} | {2} | {3} | {4}' -f $ord, $name, $c.expected, $actual, $status)
    if (@($DuplicateOrds) -contains $ord) {
      $lines += ('{0,4} | {1} | {2} | {3} | {4}' -f $ord, $name, $c.expected, $actual, $status)
    }
  }
  return ((@($lines) -join "`n") + "`n")
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
  if ($completeSeen -ne [bool]$Probe.reachedComplete) {
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
  if ($reason.Length -gt 240) { $reason = $reason.Substring(0, 240) }
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
$passOutcome = Test-VerificationGateOutcome -Probe $gatePass `
  -ExpectedReceipts @('04-postflight.json', '05-storage.json', '06-claim-release-ownership.json', '06-claim-release.json', '06-complete.json') `
  -ExpectedStop '' `
  -ExpectedStatus @{ '04-postflight.json' = 'PASS'; '05-storage.json' = 'PASS'; '06-claim-release-ownership.json' = 'PASS'; '06-claim-release.json' = 'PASS'; '06-complete.json' = 'COMPLETE' }
$passCallCount = @($gatePass.calls).Count
Add-Case 'verificationReportsProceedToComplete' (
  $passOutcome.ok -and
  [string]$gatePass.threw -eq '' -and
  $gatePass.reachedComplete -eq $true -and
  [int]$gatePass.nativeCalls -eq 3 -and $passCallCount -eq 3 -and
  ([string]$gatePass.calls[0]) -match '90_verify\.sql' -and
  ([string]$gatePass.calls[1]) -match '95_storage_config\.sql' -and
  ([string]$gatePass.calls[2]) -match 'delete from supabase_migrations\.clash_deploy_claim' -and
  ([string]$gatePass.calls[2]).Contains("run_id = '" + $probeRunId + "'") -and
  [int]$gatePass.evidenceCalls -eq 6) (New-GateCaseDetail -Probe $gatePass -Outcome $passOutcome `
  -Note ('block {0}+{1}; the release is the third child and only after both contracts hold' -f $gatePass.blockStartLine, $gatePass.blockLines))

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
  [string]$gateMalformed.stopReason -match 'malformed row') (New-GateCaseDetail -Probe $gateMalformed -Outcome $malformedOutcome)

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
