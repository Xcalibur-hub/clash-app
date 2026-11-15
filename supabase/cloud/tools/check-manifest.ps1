#Requires -Version 5.1
<#
  Proves the 111 originals are byte-identical to the manifest, and that the
  executed file for each entry (variant for index 13) also matches.

  Run this FIRST. A mismatch is STOP condition S9: the package no longer
  describes what would be deployed.

  Usage:
    .\check-manifest.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$cloudRoot    = Split-Path -Parent $PSScriptRoot
$repoRoot     = Split-Path -Parent (Split-Path -Parent $cloudRoot)
$manifestPath = Join-Path $cloudRoot 'manifest.json'
$manifest     = Get-Content -Raw $manifestPath | ConvertFrom-Json

$fail = 0
$checked = 0

if ($manifest.total -ne 111 -or @($manifest.entries).Count -ne 111) {
  Write-Host "FAIL: manifest declares total=$($manifest.total), entries=$(@($manifest.entries).Count); expected 111." -ForegroundColor Red
  $fail++
}

foreach ($e in $manifest.entries) {
  $origAbs = Join-Path $repoRoot $e.file
  if (-not (Test-Path $origAbs)) {
    Write-Host "FAIL [{0,3}] original missing: {1}" -f $e.index, $e.file -ForegroundColor Red
    $fail++; continue
  }
  $origSha = (Get-FileHash -Algorithm SHA256 -Path $origAbs).Hash.ToLower()
  if ($origSha -ne $e.sha256) {
    Write-Host "FAIL [{0,3}] original CHANGED: {1}" -f $e.index, $e.file -ForegroundColor Red
    Write-Host "           expected $($e.sha256)" -ForegroundColor Red
    Write-Host "           actual   $origSha" -ForegroundColor Red
    $fail++
  }

  $execAbs = Join-Path $repoRoot $e.sqlPath
  if (-not (Test-Path $execAbs)) {
    Write-Host "FAIL [{0,3}] executed file missing: {1}" -f $e.index, $e.sqlPath -ForegroundColor Red
    $fail++; continue
  }
  $execSha = (Get-FileHash -Algorithm SHA256 -Path $execAbs).Hash.ToLower()
  if ($execSha -ne $e.executedSha256) {
    Write-Host "FAIL [{0,3}] executed file CHANGED: {1}" -f $e.index, $e.sqlPath -ForegroundColor Red
    $fail++
  }

  if ($e.version -ne (Split-Path -Leaf $e.file).Substring(0, 14)) {
    Write-Host "FAIL [{0,3}] version/filename mismatch: {1}" -f $e.index, $e.file -ForegroundColor Red
    $fail++
  }
  $checked++
}

# Originals must be untouched in git terms too.
$dirty = git -C $repoRoot status --porcelain -- supabase/migrations 2>&1
if ($dirty) {
  Write-Host "FAIL: supabase/migrations is dirty:`n$dirty" -ForegroundColor Red
  $fail++
}

Write-Host ''
if ($fail -gt 0) {
  Write-Host "FAIL: $fail problem(s) across $checked entries. Deployment must not proceed (S9)." -ForegroundColor Red
  exit 1
}
Write-Host "PASS: 111/111 originals and executed files match the manifest; supabase/migrations clean." -ForegroundColor Green
Write-Host "repo HEAD: $(git -C $repoRoot rev-parse HEAD)"
exit 0
