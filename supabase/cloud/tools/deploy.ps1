#Requires -Version 5.1
<#
  CLASH cloud deployment runner — STOP on first failure, no retries.
  Project: kgaqejgubjemdecifzew

  Applies the 111 steps from manifest.json in order. Index 13 executes the
  cloud variant, not the original (see ../DIVERGENCES.md).

  Guarantees:
    * verifies each file's sha256 against the manifest BEFORE executing it
    * one transaction per file (-1) unless the manifest says otherwise
    * stops at the first non-zero exit; never continues, never retries
    * writes an append-only receipt per file into a fresh attempt folder
    * does NOT run the storage bootstrap, the ledger backfill or the verifier
      (those are separate, deliberate steps — see ../README.md section 4)

  Usage:
    .\deploy.ps1 -DbUrl "postgresql://postgres:<pw>@db.kgaqejgubjemdecifzew.supabase.co:5432/postgres" -ConfirmDeployment
    .\deploy.ps1 -DbUrl $env:CLASH_DB_URL -ConfirmDeployment
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$DbUrl,
  [string]$Psql = 'psql',
  [int]$StartAt = 1,
  [switch]$ConfirmDeployment
)

$ErrorActionPreference = 'Stop'

$cloudRoot  = Split-Path -Parent $PSScriptRoot
$repoRoot   = Split-Path -Parent (Split-Path -Parent $cloudRoot)
$manifestPath = Join-Path $cloudRoot 'manifest.json'

if (-not $ConfirmDeployment) {
  Write-Host 'REFUSED: pass -ConfirmDeployment after reading ../README.md section 5 (STOP conditions).' -ForegroundColor Yellow
  exit 2
}
if (-not (Test-Path $manifestPath)) {
  Write-Host "REFUSED: manifest.json not found at $manifestPath" -ForegroundColor Red
  exit 2
}
if (-not (Get-Command $Psql -ErrorAction SilentlyContinue)) {
  Write-Host "REFUSED: '$Psql' not found on PATH." -ForegroundColor Red
  exit 2
}

# ---- attempt folder (append-only) ------------------------------------------
$stamp  = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$evRoot = Join-Path $cloudRoot 'evidence'
if (-not (Test-Path $evRoot)) { New-Item -ItemType Directory -Path $evRoot | Out-Null }
$n = 1
while (Test-Path (Join-Path $evRoot "$stamp-attempt-$n")) { $n++ }
$run    = Join-Path $evRoot "$stamp-attempt-$n"
$migDir = Join-Path $run '02-migrations'
foreach ($d in @('00-baseline','01-preexec','02-migrations','03-divergence','04-storage','05-postverify')) {
  New-Item -ItemType Directory -Path (Join-Path $run $d) -Force | Out-Null
}

# ---- baseline record -------------------------------------------------------
$baseline = @(
  "utc=$((Get-Date).ToUniversalTime().ToString('o'))"
  "psql=$(& $Psql --version 2>&1)"
  "repoHead=$(git -C $repoRoot rev-parse HEAD 2>&1)"
  "migrationsDirty=$(git -C $repoRoot status --porcelain -- supabase/migrations 2>&1)"
  "startAt=$StartAt"
) -join "`n"
$baseline | Out-File -FilePath (Join-Path $run '00-baseline\run.txt') -Encoding utf8
Copy-Item $manifestPath (Join-Path $run '00-baseline\manifest.json')
Copy-Item (Join-Path $cloudRoot 'DIVERGENCES.md') (Join-Path $run '03-divergence\DIVERGENCES.md')

$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
if ($manifest.total -ne 111) {
  Write-Host "REFUSED: manifest declares $($manifest.total) entries, expected 111." -ForegroundColor Red
  exit 2
}

if ($StartAt -gt 1) {
  Write-Host "NOTE: resuming at index $StartAt — earlier receipts are NOT in this attempt folder." -ForegroundColor Yellow
}

$applied = 0
foreach ($e in $manifest.entries) {
  if ($e.index -lt $StartAt) { continue }

  $sqlAbs = Join-Path $repoRoot $e.sqlPath
  if (-not (Test-Path $sqlAbs)) {
    Write-Host "STOP: missing file for index $($e.index): $($e.sqlPath)" -ForegroundColor Red
    "STOP: missing $($e.sqlPath)" | Out-File -FilePath (Join-Path $run 'STOP.txt') -Encoding utf8
    exit 1
  }

  $sha = (Get-FileHash -Algorithm SHA256 -Path $sqlAbs).Hash.ToLower()
  if ($sha -ne $e.executedSha256) {
    $msg = "STOP: hash mismatch (S9) at index $($e.index)`nexpected=$($e.executedSha256)`nactual=$sha`nfile=$($e.sqlPath)"
    $msg | Out-File -FilePath (Join-Path $run 'STOP.txt') -Encoding utf8
    Write-Host $msg -ForegroundColor Red
    exit 1
  }

  $label = '{0:D3}-{1}' -f $e.index, $e.version
  Write-Host ("[{0:D3}/111] {1}  ({2})" -f $e.index, $e.version, $e.mode)

  $psqlArgs = @($DbUrl, '-X', '-q', '-v', 'ON_ERROR_STOP=1')
  if ($e.transaction) { $psqlArgs += '-1' }
  $psqlArgs += @('-f', $sqlAbs)

  $t0 = (Get-Date).ToUniversalTime()
  $out = & $Psql @psqlArgs 2>&1
  $code = $LASTEXITCODE
  $t1 = (Get-Date).ToUniversalTime()

  if ($null -ne $out) {
    $out | Out-File -FilePath (Join-Path $migDir "$label.log") -Encoding utf8
  } else {
    '(no output)' | Out-File -FilePath (Join-Path $migDir "$label.log") -Encoding utf8
  }

  $receipt = [ordered]@{
    index       = $e.index
    version     = $e.version
    mode        = $e.mode
    sqlPath     = $e.sqlPath
    sha256      = $sha
    bytes       = (Get-Item $sqlAbs).Length
    startedUtc  = $t0.ToString('o')
    finishedUtc = $t1.ToString('o')
    exitCode    = $code
    status      = $(if ($code -eq 0) { 'PASS' } else { 'FAIL' })
  }
  $receipt | ConvertTo-Json | Out-File -FilePath (Join-Path $migDir "$label.json") -Encoding utf8

  if ($code -ne 0) {
    $firstErr = ($out | Select-Object -First 6 | Out-String)
    $stop = @"
STOP — first failure, no retry, no repair (README.md section 5)
index      : $($e.index)
version    : $($e.version)
file       : $($e.sqlPath)
exitCode   : $code
log        : $migDir\$label.log
--- first output ---
$firstErr
"@
    $stop | Out-File -FilePath (Join-Path $run 'STOP.txt') -Encoding utf8
    Write-Host "STOP: failed at index $($e.index). See $run\STOP.txt" -ForegroundColor Red
    exit 1
  }
  $applied++
}

Write-Host ''
Write-Host "MIGRATIONS COMPLETE: $applied step(s) exited 0 in this run." -ForegroundColor Green
Write-Host 'NEXT (deliberate, one at a time — README.md section 4):'
Write-Host "  3) psql `"<db-url>`" -X -v ON_ERROR_STOP=1 -1 -f `"$repoRoot\supabase\cloud\storage\10_storage_bootstrap.sql`""
Write-Host '  4) .\backfill-ledger.ps1 -DbUrl "<db-url>"     (writes the 111 ledger versions)'
Write-Host "  5) psql `"<db-url>`" -X -f `"$repoRoot\supabase\cloud\verify\90_verify.sql`""
Write-Host "Evidence: $run"
exit 0
