#Requires -Version 5.1
<#
  run-tests.ps1 - run the offline test suite through the native adapter.

  Round 2 observed "0 assertion results" when the suite was invoked with the
  failed pattern: '$ErrorActionPreference = Stop' plus native stderr redirection
  raised NativeCommandError before node's exit code existed. The suite itself was
  fine; the harness was not.

  This wrapper is the supported way to run it from PowerShell on Windows: the
  child goes through the adapter, stdout and stderr are captured in memory, and
  node's exit code is what decides PASS/FAIL.

  It writes nothing to the database. Offline only.

  Usage:
    .\run-tests.ps1
    .\run-tests.ps1 -Node 'C:\Program Files\nodejs\node.exe'

  Exit codes: 0 all assertions passed, 1 failures or the suite did not run.
#>
[CmdletBinding()]
param(
  [string]$Node = 'node',
  [int]$TimeoutSeconds = 600
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$cloudRoot   = Split-Path -Parent $PSScriptRoot
$adapterPath = Join-Path (Join-Path $PSScriptRoot 'lib') 'clash-native.ps1'
if (-not (Test-Path -LiteralPath $adapterPath)) { Write-Host "REFUSED: adapter missing: $adapterPath" -ForegroundColor Red; exit 2 }
. $adapterPath

try {
  $nodeCmd = Get-Command $Node -ErrorAction Stop
  $nodePath = [string]$nodeCmd.Path
  if ([string]::IsNullOrWhiteSpace($nodePath)) { $nodePath = [string]$nodeCmd.Source }
}
catch { Write-Host ("REFUSED: '{0}' not found on PATH." -f $Node) -ForegroundColor Red; exit 2 }

$testScript = Join-Path $cloudRoot 'tests\verify-package.mjs'
if (-not (Test-Path -LiteralPath $testScript)) { Write-Host "REFUSED: $testScript missing" -ForegroundColor Red; exit 2 }

$r = Invoke-NativeProcess -FilePath $nodePath -Arguments @($testScript) -TimeoutSeconds $TimeoutSeconds

# Round 3: the launcher must not have to infer the result from prose, and a
# truncated run must not be readable as a pass. The suite publishes one
# machine-readable line; the counts on that line must agree with the PASS/FAIL
# lines actually printed, or the run is a failure.
$passLines = ([regex]::Matches($r.stdOut, '(?m)^  PASS  ')).Count
$failLines = ([regex]::Matches($r.stdOut, '(?m)^  FAIL  ')).Count
$summary   = ($r.stdOut -split "`r?`n" | Where-Object { $_ -match '^\d+ passed, \d+ failed$' } | Select-Object -Last 1)

# RC09: the machine-readable summary is AUTHORITATIVE evidence, so it is parsed by
# the adapter's typed reader rather than by [int] casts here. The old code cast
# untrusted text ({passed:1.4} became 1, "12" became 12), took the LAST summary line
# (so a second summary could mask an earlier failure) and accepted a summary whose
# own total disagreed with passed+failed.
$machine = Test-ClashSuiteSummary -StdOut $r.stdOut -PassLines $passLines -FailLines $failLines
$countsAgree = $machine.ok -and ($machine.failed -eq 0) -and ($machine.passed -gt 0)

Write-Host ''
if (-not [string]::IsNullOrWhiteSpace($r.stdErr)) {
  Write-Host 'stderr from the suite:' -ForegroundColor Yellow
  Write-Host $r.stdErr.TrimEnd()
}

$ok = (Test-NativeSuccess $r) -and $failLines -eq 0 -and $passLines -gt 0 -and $countsAgree
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$receipt = [ordered]@{
  receipt      = 'test-run.json'
  utc          = (Get-Date).ToUniversalTime().ToString('o')
  adapter      = (Get-ClashAdapterIdentity)
  adapterSha256 = (Get-NormalizedSha256 -Path $adapterPath)
  node         = $nodePath
  testScript   = 'supabase/cloud/tests/verify-package.mjs'
  outcome      = (Get-NativeOutcomeLabel $r)
  exitCode     = $r.exitCode
  timedOut     = $r.timedOut
  durationMs   = $r.durationMs
  passLines    = $passLines
  failLines    = $failLines
  summary      = $(if ($summary) { [string]$summary } else { '<no summary line>' })
  machineReadable = $countsAgree
  machineProblems = @($machine.problems)
  machineSummary  = [ordered]@{ passed = [int]$machine.passed; failed = [int]$machine.failed; total = [int]$machine.total }
  assertionsExecuted = ($passLines + $failLines)
  status       = $(if ($ok) { 'PASS' } else { 'FAIL' })
  stderrExcerpt = (Get-NativeErrorExcerpt $r 600)
}
$receiptPath = Join-Path $cloudRoot ("evidence\{0}-test-run.json" -f $stamp)
$sha = Write-EvidenceJson -Path $receiptPath -Object $receipt

Write-Host ("assertions executed: {0} ({1} passed, {2} failed)" -f ($passLines + $failLines), $passLines, $failLines)
Write-Host ("summary line agrees with counts: {0}" -f $countsAgree)
Write-Host ("summary   : {0}" -f $receipt.summary)
Write-Host ("outcome   : {0} (exit {1}, {2} ms)" -f $receipt.outcome, $receipt.exitCode, $r.durationMs)
Write-Host ("Receipt   : {0}" -f $receiptPath)
Write-Host ("TERMINAL RECEIPT: {0} sha256={1}" -f $receipt.status, $sha)

if (-not $ok) {
  if ($passLines -eq 0 -and $failLines -eq 0) {
    Write-Host 'The suite produced no assertion output at all: treat as FAIL, not as unknown.' -ForegroundColor Red
  }
  elseif (-not $countsAgree) {
    Write-Host 'The suite output does not agree with its own summary line: the run was truncated or interleaved. Treat as FAIL.' -ForegroundColor Red
    foreach ($problem in @($machine.problems)) { Write-Host ('  summary problem: {0}' -f $problem) -ForegroundColor Red }
  }
  Write-Host 'OFFLINE TESTS FAILED' -ForegroundColor Red
  exit 1
}
Write-Host 'OFFLINE TESTS PASSED' -ForegroundColor Green
exit 0
