#Requires -Version 5.1
<#
  Reconciles supabase_migrations.schema_migrations with the 111 file versions
  WITHOUT executing any migration SQL.

  This is what stops a future `supabase db push` from replaying the originals —
  in particular the original file 13, which would install pg_cron and schedule
  clash-maintenance at '* * * * *'. See ../README.md section 2.

  Why the annotation step at the end is mandatory
  -----------------------------------------------
  `supabase migration repair --status applied <version>` is documented to write
  the ledger row from the LOCAL FILE: name and statements are taken from
  supabase/migrations/<version>_<name>.sql. For version 20260927030000 that file
  is the ORIGINAL scheduler, whose SQL never ran here — the variant ran instead.
  Left alone, the ledger would claim the original executed. So this script
  always rewrites that one row to name = 'clash_scheduler__cloud_nocron' and
  statements = null (the normal backfill shape), leaving the variant's exact
  text and sha256 in DIVERGENCES.md D-1 and in the run's evidence folder.

  Interruption safety
  -------------------
  A backfill interrupted halfway leaves the DATABASE fully migrated but the
  LEDGER PARTIAL. In that state a `db push` would treat the missing versions as
  pending and replay the originals ("already exists" failures, and pg_cron for
  file 13). Recovery is simply to re-run this script: inserts use
  ON CONFLICT DO NOTHING and CLI repair skips versions already recorded, so a
  partly repaired ledger completes. The final parity check refuses to report
  success unless the ledger is exactly the manifest's 111 versions.

  Usage:
    .\backfill-ledger.ps1 -DbUrl "<db-url>"                 # CLI repair (preferred)
    .\backfill-ledger.ps1 -DbUrl "<db-url>" -UseSqlFallback # no CLI on this host
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$DbUrl,
  [string]$Psql = 'psql',
  [switch]$UseSqlFallback,
  [int]$ChunkSize = 20
)

$ErrorActionPreference = 'Stop'

$cloudRoot    = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $cloudRoot 'manifest.json'
$manifest     = Get-Content -Raw $manifestPath | ConvertFrom-Json
$versions     = @($manifest.entries | ForEach-Object { $_.version })
$divVersion   = '20260927030000'
$divName      = ($manifest.entries | Where-Object { $_.version -eq $divVersion }).ledgerName

if ($versions.Count -ne 111) {
  Write-Host "REFUSED: expected 111 versions, manifest has $($versions.Count)." -ForegroundColor Red
  exit 2
}
if (-not (Get-Command $Psql -ErrorAction SilentlyContinue)) {
  Write-Host "REFUSED: '$Psql' not found on PATH." -ForegroundColor Red
  exit 2
}

Write-Host "Ledger reconciliation for $($versions.Count) versions."
Write-Host 'This script executes NO migration SQL. Use a DIRECT connection (port 5432), not the pooler.'
Write-Host ''

# --- 1. record the ledger before touching it ---------------------------------
$before = @(& $Psql $DbUrl -X -q -t -A -c "select version from supabase_migrations.schema_migrations order by version;" 2>&1 |
            Where-Object { $_ -and $_.Trim() })
if ($LASTEXITCODE -ne 0) {
  Write-Host 'NOTE: ledger absent or unreadable before backfill (expected on a fresh project).' -ForegroundColor Yellow
  $before = @()
}
Write-Host "Ledger rows before: $($before.Count)"

# --- 2. insert the versions ---------------------------------------------------
if (-not $UseSqlFallback) {
  $cli = Get-Command supabase -ErrorAction SilentlyContinue
  if ($null -eq $cli) {
    Write-Host 'Supabase CLI not found on PATH.' -ForegroundColor Yellow
    Write-Host 'Install it, or re-run with -UseSqlFallback (read the header first).' -ForegroundColor Yellow
    exit 2
  }
  for ($i = 0; $i -lt $versions.Count; $i += $ChunkSize) {
    $chunk = $versions[$i..([Math]::Min($i + $ChunkSize - 1, $versions.Count - 1))]
    Write-Host ("  repair --status applied  {0}..{1}" -f $chunk[0], $chunk[-1])
    & supabase migration repair --status applied @chunk --db-url $DbUrl
    if ($LASTEXITCODE -ne 0) {
      Write-Host "STOP: migration repair failed at chunk starting $($chunk[0]). No retry." -ForegroundColor Red
      Write-Host 'A partial ledger is a DANGEROUS state: no db push until this script completes.' -ForegroundColor Red
      exit 1
    }
  }
}
else {
  $bootstrap = @'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version    text not null primary key,
  statements text[],
  name       text
);
'@
  $bootstrap | & $Psql $DbUrl -X -q -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { Write-Host 'STOP: could not create ledger table.' -ForegroundColor Red; exit 1 }

  foreach ($v in $versions) {
    $name = ($manifest.entries | Where-Object { $_.version -eq $v }).ledgerName
    $sql = "insert into supabase_migrations.schema_migrations (version, name, statements) " +
           "values ('$v', '$name', null) on conflict (version) do nothing;"
    $sql | & $Psql $DbUrl -X -q -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
      Write-Host "STOP: ledger insert failed for $v. No retry." -ForegroundColor Red
      exit 1
    }
  }
}

# --- 3. mandatory divergence annotation --------------------------------------
# Records WHAT actually ran for 20260927030000, overwriting whatever the CLI
# copied out of the original file. DIVERGENCES.md D-1 is the full record.
$annotate = @"
update supabase_migrations.schema_migrations
   set name = '$divName',
       statements = null
 where version = '$divVersion';
"@
$annotate | & $Psql $DbUrl -X -q -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
  Write-Host 'STOP: divergence annotation failed — ledger would misattribute file 13.' -ForegroundColor Red
  exit 1
}
Write-Host "Annotated version $divVersion as '$divName' (statements null by design)."

# --- 4. strict parity gate ----------------------------------------------------
$rows = @(& $Psql $DbUrl -X -q -t -A -c "select version from supabase_migrations.schema_migrations order by version;")
if ($LASTEXITCODE -ne 0) { Write-Host 'STOP: parity query failed.' -ForegroundColor Red; exit 1 }
$ledger = @($rows | Where-Object { $_ -and $_.Trim() })

$missing = @($versions | Where-Object { $ledger -notcontains $_ })
$extra   = @($ledger   | Where-Object { $versions -notcontains $_ })

Write-Host ''
Write-Host "Ledger rows after : $($ledger.Count)  (expected 111)"
Write-Host "Missing versions  : $($missing.Count)"
if ($missing.Count -gt 0) { $missing | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red } }
Write-Host "Unexpected versions: $($extra.Count)"
if ($extra.Count -gt 0) { $extra | ForEach-Object { Write-Host "   + $_" -ForegroundColor Yellow } }

if ($missing.Count -gt 0 -or $extra.Count -gt 0 -or $ledger.Count -ne 111) {
  Write-Host 'PARITY FAIL — do NOT run supabase db push. Re-run this script to complete the ledger.' -ForegroundColor Red
  exit 1
}

Write-Host 'PARITY OK: ledger == manifest (111/111), file 13 recorded as the cloud variant.' -ForegroundColor Green
Write-Host 'Never run: supabase migration repair --status reverted 20260927030000' -ForegroundColor Yellow
exit 0
