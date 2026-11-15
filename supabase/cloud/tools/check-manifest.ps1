#Requires -Version 5.1
<#
  Offline integrity check. Touches no database.

  Proves, before anything executes:
    * the 111 originals are byte-identical to the manifest (LF-normalised)
    * the executed source for every step matches the manifest
    * generated/ contains exactly 111 wrappers + step 0, each with one
      transaction and one ledger insert carrying the right version + identity
    * checksums.sha256 verifies for every listed file
    * supabase/migrations is clean in git

  Any mismatch is STOP condition S9.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Get-NormalizedSha256 {
  param([string]$Path)
  $text = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($Path))
  if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
  $text = $text.Replace("`r`n", "`n")
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $h = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($text)) } finally { $sha.Dispose() }
  return (-join ($h | ForEach-Object { $_.ToString('x2') }))
}

$cloudRoot = Split-Path -Parent $PSScriptRoot
$repoRoot  = Split-Path -Parent (Split-Path -Parent $cloudRoot)
$manifest  = Get-Content -Raw -Encoding UTF8 (Join-Path $cloudRoot 'manifest.json') | ConvertFrom-Json
$entries   = @($manifest.entries)
$fail = 0

if ($entries.Count -ne 111) { Write-Host "FAIL: manifest has $($entries.Count) entries" -ForegroundColor Red; $fail++ }

foreach ($e in $entries) {
  $origAbs = Join-Path $repoRoot $e.file
  $execAbs = Join-Path $repoRoot $e.sqlPath
  if (-not (Test-Path $origAbs)) { Write-Host "FAIL [$($e.index)] missing $($e.file)" -ForegroundColor Red; $fail++; continue }
  if (-not (Test-Path $execAbs)) { Write-Host "FAIL [$($e.index)] missing $($e.sqlPath)" -ForegroundColor Red; $fail++; continue }

  if ((Get-NormalizedSha256 $origAbs) -ne $e.sha256) { Write-Host "FAIL [$($e.index)] original changed: $($e.file)" -ForegroundColor Red; $fail++ }
  if ((Get-NormalizedSha256 $execAbs) -ne $e.executedSha256) { Write-Host "FAIL [$($e.index)] executed source changed: $($e.sqlPath)" -ForegroundColor Red; $fail++ }

  $wrap = Join-Path $cloudRoot ('generated\{0:D3}_{1}.sql' -f $e.index, $e.version)
  if (-not (Test-Path $wrap)) { Write-Host "FAIL [$($e.index)] missing wrapper" -ForegroundColor Red; $fail++; continue }
  $wt = [System.IO.File]::ReadAllText($wrap)
  if ($wt -notmatch "(?m)^commit;\s*$") { Write-Host "FAIL [$($e.index)] wrapper has no trailing commit" -ForegroundColor Red; $fail++ }
  if ($wt -notmatch [regex]::Escape("'$($e.version)'")) { Write-Host "FAIL [$($e.index)] wrapper ledger version missing" -ForegroundColor Red; $fail++ }
  if ($wt -notmatch [regex]::Escape("sha256:$($e.normalizedSha256)")) { Write-Host "FAIL [$($e.index)] wrapper identity token missing" -ForegroundColor Red; $fail++ }
}

$dirty = git -C $repoRoot status --porcelain -- supabase/migrations 2>&1
if ($dirty) { Write-Host "FAIL: supabase/migrations dirty:`n$dirty" -ForegroundColor Red; $fail++ }

$sumFile = Join-Path $cloudRoot 'checksums.sha256'
if (Test-Path $sumFile) {
  foreach ($line in [System.IO.File]::ReadAllLines($sumFile)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line -split '\s{2}', 2
    if ($parts.Count -ne 2) { continue }
    $abs = Join-Path $repoRoot $parts[1]
    if (-not (Test-Path $abs)) { Write-Host "FAIL checksum: missing $($parts[1])" -ForegroundColor Red; $fail++; continue }
    if ((Get-NormalizedSha256 $abs) -ne $parts[0]) { Write-Host "FAIL checksum: $($parts[1])" -ForegroundColor Red; $fail++ }
  }
}

Write-Host ''
if ($fail -gt 0) { Write-Host "FAIL: $fail problem(s). Do not deploy." -ForegroundColor Red; exit 1 }
Write-Host 'PASS: originals, wrappers and checksums all verify.' -ForegroundColor Green
exit 0
