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

# C18-C1: the manifest ROOT is validated before anything is read out of it, so a
# null, empty, array or malformed manifest is an explicit failure rather than an
# empty entry list that HAPPENS to fail the count.
$manifestRoot = Get-ClashJsonRoot -Path (Join-Path $cloudRoot 'manifest.json') -Label 'package manifest' -Kind @('object')
if (-not $manifestRoot['ok']) { Fail $manifestRoot['problem'] }
$manifest = $manifestRoot['value']
$entriesField = Get-ClashJsonField -Object $manifest -Name 'entries'
$entries  = @()
if ($entriesField['kind'] -ceq 'array') { $entries = @($entriesField['value']) }

if ($entries.Count -ne 111) { Fail ("manifest has {0} entries, expected 111" -f $entries.Count) }

foreach ($e in $entries) {
  $origAbs = Join-Path $repoRoot $e.file
  $execAbs = Join-Path $repoRoot $e.sqlPath
  if (-not (Test-Path -LiteralPath $origAbs)) { Fail ("[{0}] missing {1}" -f $e.index, $e.file); continue }
  if (-not (Test-Path -LiteralPath $execAbs)) { Fail ("[{0}] missing {1}" -f $e.index, $e.sqlPath); continue }

  if ((Get-NormalizedSha256 -Path $origAbs) -ne $e.sha256) { Fail ("[{0}] original changed: {1}" -f $e.index, $e.file) }
  if ((Get-NormalizedSha256 -Path $execAbs) -ne $e.executedSha256) { Fail ("[{0}] executed source changed: {1}" -f $e.index, $e.sqlPath) }

  if (-not $e.PSObject.Properties['wrapperSha256'] -or [string]::IsNullOrWhiteSpace($e.wrapperSha256)) {
    Fail ("[{0}] manifest carries no wrapperSha256 (stale manifest - rebuild)" -f $e.index); continue
  }
  $wrapAbs = Join-Path $cloudRoot ('generated\{0}' -f $e.wrapperPath)
  if (-not (Test-Path -LiteralPath $wrapAbs)) { Fail ("[{0}] missing wrapper {1}" -f $e.index, $e.wrapperPath); continue }
  if ((Get-NormalizedSha256 -Path $wrapAbs) -ne $e.wrapperSha256) { Fail ("[{0}] wrapper digest mismatch: {1}" -f $e.index, $e.wrapperPath) }

  $wt = [System.IO.File]::ReadAllText($wrapAbs)
  if (([regex]::Matches($wt, '(?m)^begin;\s*$')).Count -ne 1) { Fail ("[{0}] wrapper must contain exactly one top-level begin;" -f $e.index) }
  if ($wt -notmatch '(?m)^commit;\s*$') { Fail ("[{0}] wrapper has no trailing commit" -f $e.index) }
  $insAt = $wt.IndexOf('insert into supabase_migrations.schema_migrations')
  if ($insAt -lt 0) { Fail ("[{0}] wrapper has no ledger insert" -f $e.index) }
  elseif ($insAt -gt $wt.LastIndexOf('commit;')) { Fail ("[{0}] ledger insert does not precede commit" -f $e.index) }
  if ($wt -notmatch [regex]::Escape("'$($e.version)'")) { Fail ("[{0}] wrapper ledger version missing" -f $e.index) }
  if ($wt -notmatch [regex]::Escape("sha256:$($e.normalizedSha256)")) { Fail ("[{0}] wrapper identity token missing" -f $e.index) }
}

$sumFile = Join-Path $cloudRoot 'checksums.sha256'
$sumCount = 0
if (-not (Test-Path -LiteralPath $sumFile)) { Fail 'checksums.sha256 missing' }
else {
  $sumLineNo = 0
  foreach ($line in [System.IO.File]::ReadAllLines($sumFile)) {
    $sumLineNo++
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line -split '\s{2}', 2
    # Round 13 (R12-C1 class): a line this parser cannot read used to be skipped,
    # so a truncated or hand-edited list still passed as long as 200 well-formed
    # lines survived. An unreadable line is a FAIL, never a skip.
    if ($parts.Count -ne 2 -or $parts[0] -notmatch '^[0-9a-f]{64}$') {
      Fail ("checksums.sha256 line {0} is not '<sha256>  <path>': {1}" -f $sumLineNo, $line.Trim())
      continue
    }
    $sumCount++
    $abs = Join-Path $repoRoot ($parts[1].Replace('/', [System.IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $abs)) { Fail ("checksum: missing {0}" -f $parts[1]); continue }
    if ((Get-NormalizedSha256 -Path $abs) -ne $parts[0]) { Fail ("checksum: {0}" -f $parts[1]) }
  }
  if ($sumCount -lt 200) { Fail ("checksums.sha256 lists only {0} files" -f $sumCount) }
}

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
if (-not (Test-NativeSuccess $gitHead)) { Fail ("git rev-parse HEAD failed: {0}" -f (Get-NativeErrorExcerpt $gitHead 200)) }
if (-not (Test-NativeSuccess $gitDirty)) { Fail ("git status failed: {0}" -f (Get-NativeErrorExcerpt $gitDirty 200)) }
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
  repoHead         = $gitHead.stdOut.Trim()
  manifestBuilder  = $manifest.builder
  manifestBuiltUtc = $manifest.built_at_utc
  projectRef       = $manifest.project_ref
  entries          = $entries.Count
  checksumFiles    = $sumCount
  problems         = @($notes)
  status           = $(if ($fail -eq 0) { 'PASS' } else { 'FAIL' })
  verdict          = $(if ($fail -eq 0) { 'originals, wrappers and checksums all verify' } else { 'integrity failure' })
}
$sha = Write-EvidenceJson -Path $OutFile -Object $doc

Write-Host ''
Write-Host ("entries={0} checksumFiles={1}" -f $entries.Count, $sumCount)
if ($fail -gt 0) {
  Write-Host ("FAIL: {0} problem(s). Do not deploy." -f $fail) -ForegroundColor Red
  Write-Host ("Receipt: {0} sha256={1}" -f (Resolve-Path -LiteralPath $OutFile).Path, $sha)
  exit 1
}
Write-Host 'PASS: originals, wrappers, manifests and checksums all verify.' -ForegroundColor Green
Write-Host ("Receipt: {0}" -f (Resolve-Path -LiteralPath $OutFile).Path)
Write-Host ("TERMINAL RECEIPT: manifest-check PASS sha256={0}" -f $sha)
exit 0
