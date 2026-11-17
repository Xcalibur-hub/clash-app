#Requires -Version 5.1
<#
  check-manifest.ps1 - offline integrity proof. Touches no database.

  Proves, before anything executes:
    * the 111 originals are byte-identical to the manifest (LF-normalised)
    * the executed source for every step matches the manifest
    * every generated wrapper matches the digest the manifest declares
      (the same digest deploy.ps1 compares immediately before execution)
    * each wrapper carries one transaction, a trailing commit, and a ledger
      insert with the right version literal and identity token
    * checksums.sha256 verifies for every listed file
    * supabase/migrations is clean in git

  Round 2 corrections: git is invoked through the native adapter (no '&', no
  '2>&1'), and the receipt is created exclusively with FileMode::CreateNew and
  sealed by hash chain, instead of overwriting a file.

  Any mismatch is STOP condition S9.
  Exit codes: 0 PASS, 1 FAIL, 2 refused.
#>
[CmdletBinding()]
param(
  [string]$OutFile
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$cloudRoot   = Split-Path -Parent $PSScriptRoot
$repoRoot    = Split-Path -Parent (Split-Path -Parent $cloudRoot)
$adapterPath = Join-Path (Join-Path $PSScriptRoot 'lib') 'clash-native.ps1'
if (-not (Test-Path -LiteralPath $adapterPath)) { Write-Host "REFUSED: adapter missing: $adapterPath" -ForegroundColor Red; exit 2 }
. $adapterPath

$fail     = 0
$notes    = @()
function Fail([string]$Message) { Write-Host ("FAIL  {0}" -f $Message) -ForegroundColor Red; $script:fail++; $script:notes += $Message }

# RC03: this file used to be a SECOND integrity implementation - its own checksum
# reader, its own manifest loop, its own idea of what "PASS" means - and the runner
# carried a third. The proof now lives once, in the adapter, and this tool is a
# consumer of it: whatever the runner refuses, the checker refuses, for the same
# reasons, in the same words.
$integrity = Test-ClashPackageIntegrity -RepoRoot $repoRoot -CloudRoot $cloudRoot
foreach ($problem in @($integrity.problems)) { Fail ([string]$problem) }

# The manifest is read a second time here only for the receipt's provenance fields.
# Nothing in this file decides integrity from it.
$manifestRoot = Get-ClashJsonRoot -Path (Join-Path $cloudRoot 'manifest.json') -Label 'package manifest' -Kind @('object')
$manifest = $manifestRoot['value']

# git is a native program: run it through the adapter, never through '&'
$gitPath = $null
try {
  $gitCmd = Get-Command 'git' -ErrorAction Stop
  $gitPath = [string]$gitCmd.Path
  if ([string]::IsNullOrWhiteSpace($gitPath)) { $gitPath = [string]$gitCmd.Source }
}
catch { $gitPath = $null }
$gitHead = New-NotRunResult 'git not found on PATH'
if ($gitPath) { $gitHead = Invoke-NativeProcess -FilePath $gitPath -Arguments @('-C', $repoRoot, 'rev-parse', 'HEAD') -TimeoutSeconds 30 }
$gitDirty = New-NotRunResult 'git not found on PATH'
if ($gitPath) { $gitDirty = Invoke-NativeProcess -FilePath $gitPath -Arguments @('-C', $repoRoot, 'status', '--porcelain', '--', 'supabase/migrations') -TimeoutSeconds 60 }
# RC04: a capture that did not happen is not a capture that said "clean".
if (-not (Test-NativeSuccess $gitHead)) { Fail ("git rev-parse HEAD did not succeed: {0}" -f (Get-NativeErrorExcerpt $gitHead 200)) }
$gitHeadText = ''
if (Test-NativeSuccess $gitHead) { $gitHeadText = ([string]$gitHead.stdOut).Trim() }
if ($gitHeadText -notmatch '^[0-9a-f]{40}$') { Fail ("git rev-parse HEAD returned '{0}', which is not a commit object name" -f $gitHeadText) }
if (-not (Test-NativeSuccess $gitDirty)) { Fail ("git status did not succeed: {0}" -f (Get-NativeErrorExcerpt $gitDirty 200)) }
if (-not [string]::IsNullOrWhiteSpace($gitDirty.stdOut)) { Fail ("supabase/migrations is dirty: {0}" -f $gitDirty.stdOut.Trim()) }

# ---------------------------------------------------------------- receipt ---
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
if ([string]::IsNullOrWhiteSpace($OutFile)) {
  $OutFile = Join-Path $cloudRoot ("evidence\{0}-manifest-check.json" -f $stamp)
}
if (Test-Path -LiteralPath $OutFile) {
  Write-Host ("REFUSED: {0} already exists; receipts are never overwritten." -f $OutFile) -ForegroundColor Red
  exit 2
}
$doc = [ordered]@{
  receipt          = 'manifest-check.json'
  utc              = (Get-Date).ToUniversalTime().ToString('o')
  adapter          = (Get-ClashAdapterIdentity)
  adapterSha256    = (Get-NormalizedSha256 -Path $adapterPath)
  repoHead         = $gitHeadText
  manifestBuilder  = [string](Get-ClashJsonField -Object $manifest -Name 'builder')['value']
  manifestBuiltUtc = [string](Get-ClashJsonField -Object $manifest -Name 'built_at_utc')['value']
  projectRef       = [string](Get-ClashJsonField -Object $manifest -Name 'project_ref')['value']
  entries          = [int]$integrity.entryCount
  checksumFiles    = [int]$integrity.checksumEntries
  packageMembers   = [int]$integrity.memberCount
  filesVerified    = [int]$integrity.verifiedFiles
  problems         = @($notes)
  status           = $(if ($fail -eq 0) { 'PASS' } else { 'FAIL' })
  verdict          = $(if ($fail -eq 0) { 'every package member, original, executed source, wrapper and checksum verifies' } else { 'integrity failure' })
}
$sha = Write-EvidenceJson -Path $OutFile -Object $doc

Write-Host ''
Write-Host ("entries={0} checksumFiles={1} members={2} verified={3}" -f $integrity.entryCount, $integrity.checksumEntries, $integrity.memberCount, $integrity.verifiedFiles)
if ($fail -gt 0) {
  Write-Host ("FAIL: {0} problem(s). Do not deploy." -f $fail) -ForegroundColor Red
  Write-Host ("Receipt: {0} sha256={1}" -f (Resolve-Path -LiteralPath $OutFile).Path, $sha)
  exit 1
}
Write-Host 'PASS: originals, wrappers, manifests and checksums all verify.' -ForegroundColor Green
Write-Host ("Receipt: {0}" -f (Resolve-Path -LiteralPath $OutFile).Path)
Write-Host ("TERMINAL RECEIPT: manifest-check PASS sha256={0}" -f $sha)
exit 0
