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

  Round 8 corrections (audit R1):
    * the table-presence test is a catalog probe (to_regclass), so no error
      message and no SQLSTATE is used to decide whether the ledger exists; a
      failed probe is UNREADABLE, never 'absent'
    * the ledger must be an exact chronological prefix. A version recorded after
      a missing one is a GAP and is a PROBLEM, not a resumable prefix. Malformed
      rows, identity mismatches and unexpected versions are PROBLEM too
    * the verdict comes from the same Get-LedgerVerdict used by deploy.ps1, so
      the helper and the runner cannot disagree
    * there is no resume advice here: deploy.ps1 is fresh-only

  Exit codes: 0 consistent or cleanly empty, 1 any other state, 2 refused.
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

# C18-C1: validate the manifest root before reading fields out of it.
$manifestRoot = Get-ClashJsonRoot -Path (Join-Path $cloudRoot 'manifest.json') -Label 'package manifest' -Kind @('object')
if (-not $manifestRoot['ok']) { Stop-Refused $manifestRoot['problem'] }
$manifest = $manifestRoot['value']
$entriesField = Get-ClashJsonField -Object $manifest -Name 'entries'
$entries  = @()
if ($entriesField['kind'] -ceq 'array') { $entries = @($entriesField['value']) }
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

# Round 9 (B3): verbose diagnostics so a failed probe carries its SQLSTATE.
$common = @('-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose')

# Presence is a catalog read, not an error to be interpreted. to_regclass returns
# NULL for a missing relation, so a successful probe always answers the question.
$probeSql = "select case when to_regclass('supabase_migrations.schema_migrations') is null then 'ABSENT' else 'PRESENT' end;"
$probe = Invoke-NativeProcess -FilePath $psqlPath -Arguments ($common + @('-c', $probeSql)) `
           -Environment $policy.env -TimeoutSeconds 300
if (-not (Test-NativeSuccess $probe)) {
  Write-Host ("LEDGER UNREADABLE: presence probe did not complete ({0})." -f (Get-NativeOutcomeLabel $probe)) -ForegroundColor Red
  Write-Host ("sqlstate: {0}" -f (Get-PgSqlState $probe.stdErr)) -ForegroundColor Red
  Write-Host ("Detail: {0}" -f (Get-NativeErrorExcerpt $probe)) -ForegroundColor Red
  Write-Host 'A failed probe is not an empty ledger. Resolve connectivity/TLS first.' -ForegroundColor Red
  exit 1
}
$presence = $probe.stdOut.Trim()
if ($presence -ne 'ABSENT' -and $presence -ne 'PRESENT') {
  Write-Host ("LEDGER UNREADABLE: the presence probe returned '{0}' instead of ABSENT/PRESENT." -f $presence) -ForegroundColor Red
  exit 1
}
$tableAbsent = ($presence -eq 'ABSENT')

$ledger = @{}
$ledgerParse = $null
$r = $null
if ($presence -eq 'PRESENT') {
  $sql = "select version || '|' || coalesce(statements[1],'<null>') from supabase_migrations.schema_migrations order by version;"
  $r = Invoke-NativeProcess -FilePath $psqlPath -Arguments ($common + @('-c', $sql)) `
         -Environment $policy.env -TimeoutSeconds 300
  if (-not (Test-NativeSuccess $r)) {
    Write-Host ("LEDGER UNREADABLE: {0}." -f (Get-NativeOutcomeLabel $r)) -ForegroundColor Red
    Write-Host ("sqlstate: {0}" -f (Get-PgSqlState $r.stdErr)) -ForegroundColor Red
    Write-Host ("Detail: {0}" -f (Get-NativeErrorExcerpt $r)) -ForegroundColor Red
    Write-Host 'This is not an empty ledger. Resolve connectivity/TLS before drawing conclusions.' -ForegroundColor Red
    exit 1
  }
  # Round 9 (B1): the same strict parser the runner uses. A malformed row is not
  # skipped, it makes the listing unreadable.
  $ledgerParse = ConvertFrom-ClashLedgerOutput -Text $r.stdOut -Entries $entries
  if (-not $ledgerParse.ok) {
    Write-Host ("LEDGER UNREADABLE: {0} problem(s) in the listing." -f @($ledgerParse.problems).Count) -ForegroundColor Red
    foreach ($problem in @($ledgerParse.problems)) { Write-Host ("   ! {0}" -f $problem) -ForegroundColor Red }
    exit 1
  }
  $ledger = $ledgerParse.ledger
}
else {
  # B2: the ABSENT branch records its own result; it never pretends a ledger
  # query ran, and it no longer leaves a variable unset for the receipt.
  $ledgerParse = ConvertFrom-ClashLedgerOutput -Text '' -Entries $entries -TableAbsent $true
  if (-not $ledgerParse.ok) {
    Write-Host ("LEDGER UNREADABLE: the absent path is inconsistent: {0}" -f ((@($ledgerParse.problems)) -join '; ')) -ForegroundColor Red
    exit 1
  }
}

$check = Get-LedgerVerdict -Entries $entries -Ledger $ledger -TableAbsent $tableAbsent
$verdict = [string]$check.verdict
$why     = [string]$check.why

Write-Host ''
Write-Host ("manifest versions : {0}" -f $entries.Count)
Write-Host ("ledger rows       : {0}" -f $check.rows)
Write-Host ("missing           : {0}" -f @($check.missing).Count)
Write-Host ("identity mismatch : {0}" -f @($check.mismatch).Count)
Write-Host ("unexpected rows   : {0}" -f @($check.extra).Count)
Write-Host ("gaps              : {0}" -f @($check.gaps).Count)
Write-Host ("malformed rows    : {0}" -f @($check.malformed).Count)
foreach ($x in @($check.extra))     { Write-Host ("   + unexpected {0}" -f $x) -ForegroundColor Yellow }
foreach ($x in @($check.gaps))      { Write-Host ("   ! gap after missing: {0}" -f $x) -ForegroundColor Red }
foreach ($x in @($check.mismatch))  { Write-Host ("   ! identity mismatch: {0}" -f $x) -ForegroundColor Red }
foreach ($x in @($check.malformed)) { Write-Host ("   ! malformed row: {0}" -f $x) -ForegroundColor Red }

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
  ledgerRows         = $check.rows
  failingTrace       = 'fresh-only: a non-empty ledger is never a resume instruction'
  missing            = @($check.missing).Count
  missingVersions    = @($check.missing)
  identityMismatch   = @($check.mismatch).Count
  mismatchVersions   = @($check.mismatch)
  unexpectedRows     = @($check.extra)
  gaps               = @($check.gaps)
  malformedRows      = @($check.malformed)
  prefixLength       = $check.prefix
  verdict            = $verdict
  verdictDetail      = $why
}
# Round 9 (B2): the branch-dependent fields come from one shared builder, so an
# ABSENT run records the presence probe that actually ran and never touches an
# unset ledger-query result.
$auditFields = New-LedgerAuditFields -PresenceResult $probe -LedgerResult $r -PresenceText $presence `
                 -TableAbsent $tableAbsent -Parse $ledgerParse -Check $check
foreach ($auditKey in @($auditFields.Keys)) { $doc[$auditKey] = $auditFields[$auditKey] }

$receiptPath = Join-Path $evDir ("{0}-ledger-audit.json" -f $stamp)
$sha = Write-EvidenceJson -Path $receiptPath -Object $doc

Write-Host ''
$colour = 'Green'
if ($verdict -eq 'PARTIAL_PREFIX') { $colour = 'Yellow' }
if ($verdict -eq 'PROBLEM')        { $colour = 'Red' }
Write-Host ("VERDICT {0}: {1}" -f $verdict, $why) -ForegroundColor $colour
Write-Host ("Receipt: {0}" -f $receiptPath)
Write-Host ("sha256 : {0}" -f $sha)

if ($verdict -eq 'PARTIAL_PREFIX') {
  Write-Host 'PARTIAL LEDGER - this is a state a human must resolve. deploy.ps1 is fresh-only and will refuse it; there is no resume path, no backfill and no retry.' -ForegroundColor Yellow
  exit 1
}
if ($verdict -eq 'PROBLEM') {
  Write-Host 'LEDGER PROBLEM - do not deploy and do not run db push. A human must resolve this.' -ForegroundColor Red
  exit 1
}
exit 0
