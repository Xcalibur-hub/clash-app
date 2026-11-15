#Requires -Version 5.1
<#
  test-native-capture.ps1 - prove the native adapter works on THIS machine's
  PowerShell 5.1 before anything reaches a database.

  Round 2 audit requirement: "Verify the adapter on PowerShell 5.1 with harmless
  stderr-producing commands, both zero and nonzero exits."

  The adapter cannot be exercised in the package's own CI (no Windows host), so
  this script is the gate: it runs the adapter against harmless children that
  write to stderr and exit 0 or nonzero, and it also reproduces the FAILED
  legacy pattern (native call under $ErrorActionPreference='Stop') so the
  difference is recorded rather than asserted.

  deploy.ps1 refuses to run without a PASS receipt bound to the adapter's hash.

  Usage:
    .\test-native-capture.ps1                       # writes ./evidence-adapter/<utc>.json
    .\test-native-capture.ps1 -OutFile C:\tmp\adapter-selftest.json

  Exit codes: 0 PASS, 1 FAIL, 2 refused (wrong runtime / prerequisites).
#>
[CmdletBinding()]
param(
  [string]$OutFile
)

Set-StrictMode -Version 2.0
# Deliberately left at 'Continue' at the top: the point of the test is that the
# adapter does not need 'Stop' to work. Each case sets what it needs explicitly.
$ErrorActionPreference = 'Continue'

$adapterPath = Join-Path (Join-Path $PSScriptRoot 'lib') 'clash-native.ps1'
if (-not (Test-Path -LiteralPath $adapterPath)) {
  Write-Host "REFUSED: adapter not found at $adapterPath" -ForegroundColor Red
  exit 2
}
. $adapterPath

$psv = $PSVersionTable.PSVersion.ToString()
if ($psv -notmatch '^5\.1\.') {
  Write-Host ("REFUSED: this self-test certifies PowerShell 5.1; running '{0}'." -f $psv) -ForegroundColor Red
  exit 2
}
$cmdexe = Join-Path $env:SystemRoot 'System32\cmd.exe'
if (-not (Test-Path -LiteralPath $cmdexe)) {
  Write-Host "REFUSED: cmd.exe not found; cannot run harmless stderr-producing children." -ForegroundColor Red
  exit 2
}

$adapterSha = Get-NormalizedSha256 -Path $adapterPath
$stamp      = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
if ([string]::IsNullOrWhiteSpace($OutFile)) {
  $OutFile = Join-Path $PSScriptRoot ("..\evidence-adapter\{0}-adapter-selftest.json" -f $stamp)
}
if (Test-Path -LiteralPath $OutFile) {
  Write-Host "REFUSED: $OutFile already exists. Receipts are never overwritten." -ForegroundColor Red
  exit 2
}

$cases = [ordered]@{}
$problems = @()

function Add-Case {
  param([string]$Name, [bool]$Passed, [hashtable]$Detail)
  $obj = [ordered]@{ passed = $Passed }
  foreach ($k in @($Detail.Keys)) { $obj[$k] = $Detail[$k] }
  $script:cases[$Name] = $obj
  $colour = if ($Passed) { 'Green' } else { 'Red' }
  Write-Host ("  {0}  {1}" -f $(if ($Passed) { 'PASS' } else { 'FAIL' }), $Name) -ForegroundColor $colour
  if (-not $Passed) { $script:problems += $Name }
}

Write-Host ''
Write-Host "Adapter self-test on PowerShell $psv" -ForegroundColor Cyan
Write-Host "adapter sha256 = $adapterSha"
Write-Host ''

# ---- 1: exit 0, but the child writes to stderr ------------------------------
$ErrorActionPreference = 'Stop'          # the policy that broke the old runner
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
$ErrorActionPreference = 'Continue'
Add-Case 'zeroExitWithStderr' (-not $threw -and (Test-NativeSuccess $r) -and
    $r.stdOut -match 'stdout-line' -and $r.stdErr -match 'stderr-line') @{
  threwUnderStop  = $threw
  exitCode        = $(if ($null -eq $r) { $null } else { $r.exitCode })
  stdoutHasLine   = $(if ($null -eq $r) { $false } else { [bool]($r.stdOut -match 'stdout-line') })
  stderrHasLine   = $(if ($null -eq $r) { $false } else { [bool]($r.stdErr -match 'stderr-line') })
  note            = 'stderr text must not turn exit 0 into a failure'
}

# ---- 2: nonzero exit -------------------------------------------------------
$ErrorActionPreference = 'Stop'
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
$ErrorActionPreference = 'Continue'
Add-Case 'nonZeroExit' (-not $threw2 -and $null -ne $r2 -and $r2.exitCode -eq 17) @{
  threwUnderStop = $threw2
  exitCode       = $(if ($null -eq $r2) { $null } else { $r2.exitCode })
  expected       = 17
  stderrCaptured = $(if ($null -eq $r2) { $false } else { [bool]($r2.stdErr -match 'pre-failure') })
}

# ---- 3: silent success -----------------------------------------------------
$r3 = Invoke-NativeProcess -FilePath $cmdexe -Arguments @('/c', 'exit /b 0') -TimeoutSeconds 30
Add-Case 'silentSuccess' ((Test-NativeSuccess $r3) -and $r3.stdErr.Length -eq 0 -and $r3.stdOut.Length -eq 0) @{
  exitCode       = $r3.exitCode
  stderrChars    = $r3.stdErr.Length
  stdoutChars    = $r3.stdOut.Length
}

# ---- 4: stderr is data, not a failure signal -------------------------------
# A NOTICE-like warning on stderr with exit 0 must classify as SUCCEEDED.
$r4 = Invoke-NativeProcess -FilePath $cmdexe `
        -Arguments @('/c', 'echo NOTICE:  relation already exists, skipping 1>&2 & exit /b 0') `
        -TimeoutSeconds 30
Add-Case 'stderrIsDataNotFailure' ((Get-NativeOutcomeLabel $r4) -eq 'SUCCEEDED' -and $r4.stdErr -match 'NOTICE') @{
  outcomeLabel = (Get-NativeOutcomeLabel $r4)
  exitCode     = $r4.exitCode
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
$first  = Write-Evidence -Path (Join-Path $tmpDir 'x.txt') -Text 'one'
$second = $false
try { Write-Evidence -Path (Join-Path $tmpDir 'x.txt') -Text 'two' | Out-Null }
catch { $second = $true }
$kept = [System.IO.File]::ReadAllText((Join-Path $tmpDir 'x.txt'))
Add-Case 'evidenceNeverOverwrites' $second -and ($kept -eq 'one') -and ($first.Length -eq 64) @{
  secondWriteRejected = $second
  contentPreserved    = ($kept -eq 'one')
}
Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

# ---- NEGATIVE CONTROL: the failed legacy pattern --------------------------
# Recorded for evidence, not used as a pass condition: behaviour here varies
# with host configuration, which is exactly why the package no longer uses it.
$legacyThrew = $false
$legacyCode  = $null
$legacyStderrChars = -1
$tmpErr = Join-Path $env:TEMP ('clash-legacy-' + [guid]::NewGuid().ToString('N') + '.err')
$ErrorActionPreference = 'Stop'
try {
  $legacyOut = & $cmdexe /c 'echo legacy-stderr 1>&2 & exit /b 5' 2>$tmpErr
  $legacyCode = $LASTEXITCODE
}
catch { $legacyThrew = $true }
$ErrorActionPreference = 'Continue'
if (Test-Path -LiteralPath $tmpErr) {
  $legacyStderrChars = ([System.IO.File]::ReadAllText($tmpErr)).Length
  Remove-Item -LiteralPath $tmpErr -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------- verdict ---
$verdict = if ($problems.Count -eq 0) { 'PASS' } else { 'FAIL' }
$doc = [ordered]@{
  verdict            = $verdict
  utc                = (Get-Date).ToUniversalTime().ToString('o')
  host               = $env:COMPUTERNAME
  powerShellVersion  = $psv
  powerShellEdition  = $PSVersionTable.PSEdition
  adapterId          = $script:ClashAdapterId
  adapterVersion     = $script:ClashAdapterVersion
  adapterSha256      = $adapterSha
  adapterPath        = (Resolve-Path -LiteralPath $adapterPath).Path
  cases              = $cases
  problems           = @($problems)
  legacyPatternControl = [ordered]@{
    note            = 'Informational only: the construct the Round 2 audit found failing.'
    threwUnderStop  = $legacyThrew
    lastNameExitCode = $legacyCode
    stderrFileChars = $legacyStderrChars
  }
}

$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$sha = Write-EvidenceJson -Path $OutFile -Object $doc

Write-Host ''
Write-Host ("VERDICT {0}" -f $verdict) -ForegroundColor $(if ($verdict -eq 'PASS') { 'Green' } else { 'Red' })
Write-Host ("Receipt : {0}" -f (Resolve-Path -LiteralPath $OutFile).Path)
Write-Host ("sha256  : {0}" -f $sha)
Write-Host ("Legacy pattern under Stop threw: {0} (informational)" -f $legacyThrew)
if ($verdict -ne 'PASS') {
  Write-Host ("Problems: {0}" -f ($problems -join ', ')) -ForegroundColor Red
  Write-Host 'Do not deploy: the adapter is not proven on this runtime.' -ForegroundColor Red
  exit 1
}
Write-Host 'Pass this receipt to deploy.ps1 -AdapterSelfTestReceipt.' -ForegroundColor Green
exit 0
