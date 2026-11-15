#Requires -Version 5.1
<#
  check-ledger.ps1 - READ-ONLY ledger audit. Issues SELECT statements only.

  It replaces the deleted backfill script. Every wrapper records its own ledger
  row inside its own transaction, so no post-hoc write is ever needed; this tool
  only reports what the ledger claims and whether the claim matches the package.

  Round 2 corrections:
    * all child processes go through the shared native adapter (no '&', no '2>',
      no $LASTEXITCODE, stderr never treated as failure)
    * project identity and verify-full TLS are enforced by the same policy as
      deploy.ps1 (no default-to-require, no arbitrary host)
    * the receipt is created exclusively and is bound to the adapter self-test

  Exit codes: 0 ledger consistent (or cleanly empty), 1 problem, 2 refused.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  [string]$PgHost,
  [int]$PgPort = 5432,
  [string]$PgUser = 'postgres',
  [string]$PgDatabase = 'postgres',
  [string]$CaCert,
  [string]$AdapterSelfTestReceipt,
  [string]$Psql = 'psql'
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$cloudRoot   = Split-Path -Parent $PSScriptRoot
$adapterPath = Join-Path (Join-Path $PSScriptRoot 'lib') 'clash-native.ps1'
if (-not (Test-Path -LiteralPath $adapterPath)) { Write-Host "REFUSED: adapter missing: $adapterPath" -ForegroundColor Red; exit 2 }
. $adapterPath

function Stop-Refused([string]$Reason) {
  Write-Host ("REFUSED: {0}" -f (Protect-Text $Reason)) -ForegroundColor Red
  Write-Host 'No database connection was opened.'
  exit 2
}

$manifest = [System.IO.File]::ReadAllText((Join-Path $cloudRoot 'manifest.json')) | ConvertFrom-Json
$entries  = @($manifest.entries)
if ($entries.Count -ne 111) { Stop-Refused ("manifest has {0} entries, expected 111." -f $entries.Count) }
if ($manifest.project_ref -ne $ProjectRef) { Stop-Refused ("manifest is bound to project '{0}', not '{1}'." -f $manifest.project_ref, $ProjectRef) }

try { $policy = Resolve-ExecutionPolicy -ProjectRef $ProjectRef -PgHost $PgHost -PgPort $PgPort `
        -PgUser $PgUser -PgDatabase $PgDatabase -CaCert $CaCert }
catch { Stop-Refused $_.Exception.Message }

if ([string]::IsNullOrWhiteSpace($AdapterSelfTestReceipt)) {
  Stop-Refused 'pass -AdapterSelfTestReceipt from tools\test-native-capture.ps1; an uncertified adapter must not interpret ledger evidence.'
}
try { $adapterProof = Assert-AdapterSelfTest -ReceiptPath $AdapterSelfTestReceipt -AdapterPath $adapterPath }
catch { Stop-Refused $_.Exception.Message }

try {
  $psqlCmd  = Get-Command $Psql -ErrorAction Stop
  $psqlPath = [string]$psqlCmd.Path
  if ([string]::IsNullOrWhiteSpace($psqlPath)) { $psqlPath = [string]$psqlCmd.Source }
}
catch { Stop-Refused ("'{0}' not found on PATH." -f $Psql) }

$common = @('-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1')
$sql = "select version || '|' || coalesce(statements[1],'<null>') from supabase_migrations.schema_migrations order by version;"
$r = Invoke-NativeProcess -FilePath $psqlPath -Arguments ($common + @('-c', $sql)) `
       -Environment $policy.env -TimeoutSeconds 300

$ledger = @{}
$tableAbsent = $false
if (Test-NativeSuccess $r) {
  foreach ($line in ($r.stdOut -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $p = $line.Split('|')
    if ($p.Count -ge 2) { $ledger[$p[0]] = $p[1] }
  }
}
elseif ($r.stdErr -match "does not exist") {
  $tableAbsent = $true
}
else {
  Write-Host ("LEDGER UNREADABLE: {0}" -f (Format-NativeSummary $r)) -ForegroundColor Red
  Write-Host ("Detail: {0}" -f (Get-NativeErrorExcerpt $r)) -ForegroundColor Red
  Write-Host 'This is not an empty ledger. Resolve connectivity/TLS before drawing conclusions.' -ForegroundColor Red
  exit 1
}

$missing = 0; $bad = 0; $missingList = @()
foreach ($e in $entries) {
  $want = 'sha256:' + $e.normalizedSha256
  if (-not $ledger.ContainsKey($e.version)) { $missing++; $missingList += $e.version; continue }
  if ($ledger[$e.version] -ne $want) {
    $bad++
    Write-Host ("MISMATCH {0}  stored={1}  expected={2}" -f $e.version, $ledger[$e.version], $want) -ForegroundColor Red
  }
}
$known = @{}
foreach ($e in $entries) { $known[$e.version] = $true }
$extra = @($ledger.Keys | Where-Object { -not $known.ContainsKey($_) })

Write-Host ''
Write-Host ("manifest versions : {0}" -f $entries.Count)
Write-Host ("ledger rows       : {0}" -f $ledger.Count)
Write-Host ("missing           : {0}" -f $missing)
Write-Host ("identity mismatch : {0}" -f $bad)
Write-Host ("unexpected rows   : {0}" -f $extra.Count)
foreach ($x in $extra) { Write-Host ("   + {0}" -f $x) -ForegroundColor Yellow }

$verdict = 'CONSISTENT'
$why = '111/111 versions present with matching identities'
if ($bad -gt 0 -or $extra.Count -gt 0) { $verdict = 'PROBLEM'; $why = 'identity mismatch or unexpected rows' }
elseif ($missing -eq $entries.Count) { $verdict = 'EMPTY'; $why = 'no versions recorded; clean pre-deployment state' }
elseif ($missing -gt 0) { $verdict = 'PREFIX'; $why = 'recorded versions form a prefix; the runner may continue from the first missing one' }

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$evDir = Join-Path $cloudRoot 'evidence'
$doc = [ordered]@{
  receipt            = 'ledger-audit.json'
  utc                = (Get-Date).ToUniversalTime().ToString('o')
  adapter            = (Get-ClashAdapterIdentity)
  adapterProof       = $adapterProof
  projectRef         = $policy.projectRef
  host               = $policy.host
  port               = $policy.port
  sslMode            = $policy.sslMode
  caCertSha256       = $policy.caCertSha256
  mode               = $policy.mode
  readOnly           = $true
  statementsIssued   = 'select only'
  tableAbsent        = $tableAbsent
  nativeOutcome      = (Get-NativeOutcomeLabel $r)
  exitCode           = $r.exitCode
  ledgerRows         = $ledger.Count
  missing            = $missing
  missingVersions    = @($missingList)
  identityMismatch   = $bad
  unexpectedRows     = @($extra)
  verdict            = $verdict
  verdictDetail      = $why
}
$receiptPath = Join-Path $evDir ("{0}-ledger-audit.json" -f $stamp)
$sha = Write-EvidenceJson -Path $receiptPath -Object $doc

Write-Host ''
Write-Host ("VERDICT {0}: {1}" -f $verdict, $why) -ForegroundColor $(if ($verdict -eq 'PROBLEM') { 'Red' } elseif ($verdict -eq 'PREFIX') { 'Yellow' } else { 'Green' })
Write-Host ("Receipt: {0}" -f $receiptPath)
Write-Host ("sha256 : {0}" -f $sha)

if ($verdict -eq 'PROBLEM') {
  Write-Host 'LEDGER PROBLEM - do not deploy and do not run db push. A human must resolve this.' -ForegroundColor Red
  exit 1
}
exit 0
