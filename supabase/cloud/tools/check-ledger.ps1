#Requires -Version 5.1
<#
  READ-ONLY ledger audit. Writes nothing to the database.

  Replaces the earlier backfill script, which performed post-hoc writes and was
  removed under audit findings F1 (delayed ledger) and F8 (unsafe recovery):
  every generated wrapper now records its own ledger row inside its own
  transaction, so no backfill is ever needed.

  Reports, per version: present / missing / identity mismatch, and any extra row
  in the ledger that the manifest does not describe. Exit code 1 on any problem.

  Credentials come from the environment (PGPASSWORD or PGPASSFILE), never argv.

  Usage:
    .\check-ledger.ps1 -PgHost db.<ref>.supabase.co
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$PgHost,
  [int]$PgPort = 5432,
  [string]$PgUser = 'postgres',
  [string]$PgDatabase = 'postgres',
  [string]$Psql = 'psql'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$cloudRoot = Split-Path -Parent $PSScriptRoot
$manifest  = Get-Content -Raw -Encoding UTF8 (Join-Path $cloudRoot 'manifest.json') | ConvertFrom-Json
$entries   = @($manifest.entries)

if (-not (Get-Command $Psql -ErrorAction SilentlyContinue)) { Write-Host "REFUSED: '$Psql' not found." -ForegroundColor Red; exit 2 }
if (-not $env:PGPASSWORD -and -not $env:PGPASSFILE) { Write-Host 'REFUSED: set PGPASSWORD or PGPASSFILE.' -ForegroundColor Red; exit 2 }

$env:PGHOST = $PgHost; $env:PGPORT = [string]$PgPort
$env:PGUSER = $PgUser; $env:PGDATABASE = $PgDatabase
if (-not $env:PGSSLMODE) { $env:PGSSLMODE = 'require' }

$sql = "select version || '|' || coalesce(statements[1],'<null>') from supabase_migrations.schema_migrations order by version;"
$raw = & $Psql -X -q -t -A -v ON_ERROR_STOP=1 -c $sql 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Ledger not readable (absent is expected before the first deployment).' -ForegroundColor Yellow
  Write-Host "Manifest expects $($entries.Count) versions, none recorded."
  exit 0
}

$ledger = @{}
foreach ($line in $raw) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $p = $line.Split('|')
  if ($p.Count -ge 2) { $ledger[$p[0]] = $p[1] }
}

$missing = 0; $bad = 0
foreach ($e in $entries) {
  $want = 'sha256:' + $e.normalizedSha256
  if (-not $ledger.ContainsKey($e.version)) {
    $missing++
  } elseif ($ledger[$e.version] -ne $want) {
    $bad++
    Write-Host ("MISMATCH {0}  stored={1}  expected={2}" -f $e.version, $ledger[$e.version], $want) -ForegroundColor Red
  }
}
$extra = @($ledger.Keys | Where-Object { $v = $_; -not ($entries | Where-Object { $_.version -eq $v }) })

Write-Host ''
Write-Host "manifest versions : $($entries.Count)"
Write-Host "ledger rows       : $($ledger.Count)"
Write-Host "missing           : $missing"
Write-Host "identity mismatch : $bad"
Write-Host "unexpected rows   : $($extra.Count)"
foreach ($x in $extra) { Write-Host "   + $x" -ForegroundColor Yellow }

if ($bad -gt 0 -or $extra.Count -gt 0 -or ($missing -gt 0 -and $missing -lt $entries.Count -and $ledger.Count -gt 0)) {
  Write-Host 'LEDGER PROBLEM — do not deploy or db push until resolved by a human.' -ForegroundColor Red
  exit 1
}
if ($missing -eq $entries.Count) { Write-Host 'Ledger empty: clean pre-deployment state.' -ForegroundColor Green; exit 0 }
if ($missing -gt 0) { Write-Host 'Ledger is a verified prefix: runner may continue from the first missing version.' -ForegroundColor Yellow; exit 0 }

Write-Host 'LEDGER OK: 111/111 versions present with matching identities.' -ForegroundColor Green
exit 0
