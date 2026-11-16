#Requires -Version 5.1
<#
  deploy.ps1 - CLASH cloud deployment runner (adapter edition).

  Round 2 audit corrections implemented here:

    F2 (critical)  No PowerShell-native invocation anywhere. Every child process
                   goes through Invoke-NativeProcess: ProcessStartInfo with
                   UseShellExecute = $false, stdout/stderr drained in memory,
                   exit code read from Process.ExitCode. No '&', no '2>', no
                   '$LASTEXITCODE', no reliance on $ErrorActionPreference.
                   stderr content never decides success or failure.
    F4             Nonzero exits are classified, not narrated. Outcomes are
                   COMMITTED, ROLLED_BACK_PROVEN, LEDGER_MISMATCH or UNKNOWN.
                   Round 8 (R3): ROLLED_BACK_PROVEN requires psql exit 3 (script
                   error under ON_ERROR_STOP, so the wrapper's COMMIT was never
                   reached) AND a successful fresh read-back showing the row
                   absent. Absence after a connection loss, a timeout or an
                   unreadable probe is UNKNOWN - never a proven rollback.
    F5             Every wrapper's expected digest is read from the manifest and
                   compared with the bytes on disk BEFORE execution; the whole
                   package is verified against checksums.sha256 before the first
                   database write; the ledger read-back must equal the expected
                   token, not merely some token.
    F7             All child output is captured in memory and sanitised before
                   any file is created; every artefact is created exclusively
                   (FileMode::CreateNew) and sealed by hash chain; STOP messages
                   are sanitised before being printed as well as stored.
    F8             No retry, no repair, no resume. Round 8 (R2): this runner is
                   FRESH-ONLY. It requires an empty ledger and stops on anything
                   else. The advertised resume path could never be reached - the
                   fresh-baseline preflight rejects a non-empty project before the
                   prefix proof runs - so it was removed instead of guessed at.
                   A partially applied database needs a reviewed recovery plan.
    Round 8        R4: every required receipt must be persisted. If a receipt
                   cannot be written to the run directory or to the fallback
                   directory, Add-Receipt throws and the run stops; an empty
                   hash chain can no longer be mistaken for success.
    Round 8        Exclusive writer: before the first wrapper the runner claims
                   supabase_migrations.clash_deploy_claim with a plain INSERT.
                   A second concurrent runner collides on the primary key and
                   stops. The claim is released only after postflight passes; a
                   stale claim therefore blocks the next run until a human looks
                   at it (ROLLBACK.md T1).
    Round 2        Project identity and TLS are enforced: -ProjectRef is
                   mandatory, the host must belong to that project, port and
                   user must match the connection mode, PGSSLMODE is forced to
                   verify-full, and a CA certificate is required. PGHOSTADDR /
                   PGSERVICE / PGOPTIONS are refused because they can redirect
                   the connection behind the approved name.
    Round 2        The native adapter must be certified on this runtime by
                   tools\test-native-capture.ps1 first; deploy refuses otherwise.

  Usage:
    $env:PGPASSWORD = '<postgres password>'      # or set PGPASSFILE
    .\test-native-capture.ps1                    # once per machine / adapter hash
    .\check-manifest.ps1
    .\check-ledger.ps1 -ProjectRef kgaqejgubjemdecifzew -CaCert C:\certs\prod-ca-2021.crt
    .\deploy.ps1 -ProjectRef kgaqejgubjemdecifzew -CaCert C:\certs\prod-ca-2021.crt `
                 -AdapterSelfTestReceipt ..\evidence-adapter\<stamp>-adapter-selftest.json `
                 -ConfirmDeployment

  Exit codes: 0 complete, 1 STOPped, 2 refused before any work.
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
  [string]$Psql = 'psql',
  [int]$PreflightTimeoutSeconds = 300,
  [int]$MigrationTimeoutSeconds = 3600,
  [int]$VerifyTimeoutSeconds = 900,
  [switch]$ConfirmDeployment
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'   # governs cmdlet/IO errors only; never child exit codes

$cloudRoot  = Split-Path -Parent $PSScriptRoot
$repoRoot   = Split-Path -Parent (Split-Path -Parent $cloudRoot)
$genDir     = Join-Path $cloudRoot 'generated'
$manifestPath = Join-Path $cloudRoot 'manifest.json'
$sumPath    = Join-Path $cloudRoot 'checksums.sha256'
$adapterPath = Join-Path (Join-Path $PSScriptRoot 'lib') 'clash-native.ps1'

if (-not (Test-Path -LiteralPath $adapterPath)) {
  Write-Host "REFUSED: native adapter missing: $adapterPath" -ForegroundColor Red
  exit 2
}
. $adapterPath

# ------------------------------------------- runner exception (last resort) --
# Every phase writes its own receipt, but a PowerShell exception outside those
# paths (an IO failure while writing an artefact, for instance) must still leave
# an accounted-for trace instead of a bare stack trace.
$script:chain = ''
$run = ''
trap {
  $m = Protect-Text $_.Exception.Message
  Write-Host ("RUNNER EXCEPTION: {0}" -f $m) -ForegroundColor Red
  if ($run -and (Test-Path -LiteralPath $run)) {
    try {
      if (Get-Command New-PhaseReceipt -ErrorAction SilentlyContinue) {
        New-PhaseReceipt '99-runner-exception.json' @{ status = 'EXCEPTION'; message = $m }
      }
      else {
        [void](Write-EvidenceOrFallback -Path (Join-Path $run '99-runner-exception.json') -Label '99-runner-exception.json' -Text (([ordered]@{
                status = 'EXCEPTION'; message = $m; utc = (Get-Date).ToUniversalTime().ToString('o') }) | ConvertTo-Json -Depth 6))
      }
      [void](Seal-Evidence -Root $run)
    }
    catch { }
    Write-Host ("Evidence: {0}" -f $run)
  }
  Write-Host 'This exception does NOT imply that no database write happened: it can occur after a'
  Write-Host 'COMMIT, while evidence is being written, or during a later phase. Treat the outcome as'
  Write-Host 'UNKNOWN. Inspect the evidence and check-ledger.ps1 (read-only) before any retry.' -ForegroundColor Red
  exit 1
}

# ------------------------------------------------------- refusal (pre-run) --
function Stop-Refused([string]$Reason) {
  $safe = Protect-Text $Reason
  Write-Host ("REFUSED: {0}" -f $safe) -ForegroundColor Red
  Write-Host 'No database connection was opened and no file was created.'
  exit 2
}

if (-not $ConfirmDeployment) {
  Stop-Refused 'pass -ConfirmDeployment after reading README.md section 5 (run order and stop conditions).'
}
if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $genDir)) {
  Stop-Refused 'manifest.json or generated/ missing. Run: node supabase/cloud/tools/build-package.mjs'
}
if ([string]::IsNullOrWhiteSpace($AdapterSelfTestReceipt)) {
  Stop-Refused 'pass -AdapterSelfTestReceipt from tools\test-native-capture.ps1. The native adapter is unproven until that receipt exists.'
}
try {
  $psqlCmd = Get-Command $Psql -ErrorAction Stop
  $psqlPath = [string]$psqlCmd.Path
  if ([string]::IsNullOrWhiteSpace($psqlPath)) { $psqlPath = [string]$psqlCmd.Source }
}
catch { Stop-Refused ("'{0}' not found on PATH." -f $Psql) }
if ([string]::IsNullOrWhiteSpace($psqlPath)) { Stop-Refused ("could not resolve the full path of '{0}'." -f $Psql) }

$manifest = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
$entries  = @($manifest.entries)
if ($entries.Count -ne 111) { Stop-Refused ("manifest has {0} entries, expected 111. Rebuild the package." -f $entries.Count) }
if ($manifest.project_ref -ne $ProjectRef) {
  Stop-Refused ("manifest is bound to project '{0}', not '{1}'." -f $manifest.project_ref, $ProjectRef)
}
$staleEntries = @($entries | Where-Object { -not $_.PSObject.Properties['wrapperSha256'] -or [string]::IsNullOrWhiteSpace($_.wrapperSha256) })
if ($staleEntries.Count -gt 0) {
  Stop-Refused 'manifest entries carry no wrapperSha256 (stale manifest). Rebuild: node supabase/cloud/tools/build-package.mjs'
}

# ------------------------------------------------- enforcement: TLS + project
try { $policy = Resolve-ExecutionPolicy -ProjectRef $ProjectRef -PgHost $PgHost -PgPort $PgPort `
        -PgUser $PgUser -PgDatabase $PgDatabase -CaCert $CaCert }
catch { Stop-Refused $_.Exception.Message }

try { $adapterProof = Assert-AdapterSelfTest -ReceiptPath $AdapterSelfTestReceipt -AdapterPath $adapterPath }
catch { Stop-Refused $_.Exception.Message }

# -------------------------------------------------------------- run folder --
$stamp  = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$evRoot = Join-Path $cloudRoot 'evidence'
if (-not (Test-Path -LiteralPath $evRoot)) { New-Item -ItemType Directory -Path $evRoot -Force | Out-Null }
$run = Join-Path $evRoot ("{0}-attempt-1" -f $stamp)
$n = 1
while (Test-Path -LiteralPath $run) { $n++; $run = Join-Path $evRoot ("{0}-attempt-{1}" -f $stamp, $n) }
foreach ($d in @('00-baseline', '01-gates', '02-ledger', '03-migrations', '04-postflight')) {
  New-Item -ItemType Directory -Path (Join-Path $run $d) -Force | Out-Null
}

function New-PhaseReceipt([string]$Name, [hashtable]$Fields) {
  $script:chain = Add-Receipt -Root $run -Name $Name -Fields $Fields -PrevSha $script:chain
}

# Round 8 (R4): a receipt that must exist. Write-EvidenceOrFallback already tries
# the run directory and the per-machine fallback; when both fail this throws, the
# trap fires, and the process exits 1. An empty hash is never returned.
function Write-RequiredReceipt([string]$Path, [string]$Label, [string]$Text) {
  $res = Write-EvidenceOrFallback -Path $Path -Label $Label -Text $Text
  if (-not $res.ok) {
    throw ('required receipt could not be persisted: {0} (attempts: {1})' -f $Label, (@($res.attempts) -join ' | '))
  }
  return [string]$res.sha256
}

function Stop-Run([string]$Reason, [string]$StopName = 'STOP.json') {
  $safe = Protect-Text $Reason
  New-PhaseReceipt $StopName @{
    status = 'STOPPED'
    reason = $safe
    guidance = 'Do not retry, repair or re-run blindly. Resolve by inspection: check-ledger.ps1 is read-only.'
  }
  [void](Write-RequiredReceipt -Path (Join-Path $run 'STOP.txt') -Label 'STOP.txt' -Text ("{0}`n{1}`n" -f (Get-Date).ToUniversalTime().ToString('o'), $safe))
  [void](Seal-Evidence -Root $run)
  Write-Host ''
  Write-Host ("STOP: {0}" -f $safe) -ForegroundColor Red
  Write-Host ("Evidence: {0}" -f $run)
  exit 1
}

# ------------------------------------------------------ gate 0: baseline ----
$gitPath = $null
try {
  $gitCmd = Get-Command 'git' -ErrorAction Stop
  $gitPath = [string]$gitCmd.Path
  if ([string]::IsNullOrWhiteSpace($gitPath)) { $gitPath = [string]$gitCmd.Source }
}
catch { $gitPath = $null }

$psqlVersion = Invoke-NativeProcess -FilePath $psqlPath -Arguments @('--version') -TimeoutSeconds 30
$gitHead = New-NotRunResult 'git not found on PATH'
if ($gitPath) { $gitHead = Invoke-NativeProcess -FilePath $gitPath -Arguments @('-C', $repoRoot, 'rev-parse', 'HEAD') -TimeoutSeconds 30 }
$gitDirty = New-NotRunResult 'git not found on PATH'
if ($gitPath) { $gitDirty = Invoke-NativeProcess -FilePath $gitPath -Arguments @('-C', $repoRoot, 'status', '--porcelain', '--', 'supabase/migrations') -TimeoutSeconds 60 }
if (-not (Test-NativeSuccess $psqlVersion)) {
  Stop-Run ("psql --version did not succeed ({0}); {1}" -f (Get-NativeOutcomeLabel $psqlVersion), (Get-NativeErrorExcerpt $psqlVersion)) '00-baseline-fail.json'
}

New-PhaseReceipt '00-baseline.json' @{
  status            = 'BASELINE'
  psqlPath          = $psqlPath
  psqlVersion       = $psqlVersion.stdOut.Trim()
  repoHead          = $gitHead.stdOut.Trim()
  migrationsDirty   = $gitDirty.stdOut.Trim()
  projectRef        = $policy.projectRef
  connectionMode    = $policy.mode
  host              = $policy.host
  port              = $policy.port
  user              = $policy.user
  database          = $policy.database
  sslMode           = $policy.sslMode
  sslModeOverrode   = $policy.sslModeOverrode
  caCertSha256      = $policy.caCertSha256
  adapter           = $adapterProof
  gitHeadOutcome    = (Get-NativeOutcomeLabel $gitHead)
  gitDirtyOutcome   = (Get-NativeOutcomeLabel $gitDirty)
  manifestBuilder   = $manifest.builder
  manifestBuiltUtc  = $manifest.built_at_utc
}
if (-not [string]::IsNullOrWhiteSpace($gitDirty.stdOut)) {
  Stop-Run ("supabase/migrations is dirty: {0}" -f $gitDirty.stdOut.Trim()) '00-baseline-dirty.json'
}

# ------------------------------------- gate 1: full package integrity (offline)
# Nothing touches the database until every byte the runner will execute has been
# compared with the digest the manifest/checksums declare.
$expected = @{}
foreach ($line in [System.IO.File]::ReadAllLines($sumPath)) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $parts = $line -split '\s{2}', 2
  if ($parts.Count -ne 2) { continue }
  $expected[$parts[1].Replace('\', '/')] = $parts[0]
}
if ($expected.Count -lt 200) {
  Stop-Run ("checksums.sha256 lists {0} files; the package should list far more. Rebuild." -f $expected.Count) '01-integrity-fail.json'
}

$integrityProblems = @()
$verifiedFiles = 0
$treeRows = @()
foreach ($rel in @($expected.Keys | Sort-Object)) {
  $abs = Join-Path $repoRoot ($rel.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
  if (-not (Test-Path -LiteralPath $abs)) { $integrityProblems += "missing $rel"; continue }
  $h = Get-NormalizedSha256 -Path $abs
  if ($h -ne $expected[$rel]) { $integrityProblems += "digest mismatch $rel" }
  else { $verifiedFiles++ }
  $treeRows += ($h + '  ' + $rel)
}

# manifest cross-check: originals, executed sources, wrapper digests
foreach ($e in $entries) {
  $orig = Join-Path $repoRoot $e.file
  $exec = Join-Path $repoRoot $e.sqlPath
  $wrap = Join-Path $genDir $e.wrapperPath
  if (-not (Test-Path -LiteralPath $orig)) { $integrityProblems += "missing original $($e.file)"; continue }
  if (-not (Test-Path -LiteralPath $exec)) { $integrityProblems += "missing executed source $($e.sqlPath)"; continue }
  if (-not (Test-Path -LiteralPath $wrap)) { $integrityProblems += "missing wrapper $($e.wrapperPath)"; continue }
  if ((Get-NormalizedSha256 -Path $orig) -ne $e.sha256)         { $integrityProblems += "original changed $($e.file)" }
  if ((Get-NormalizedSha256 -Path $exec) -ne $e.executedSha256) { $integrityProblems += "executed source changed $($e.sqlPath)" }
  if ((Get-NormalizedSha256 -Path $wrap) -ne $e.wrapperSha256)  { $integrityProblems += "wrapper changed $($e.wrapperPath)" }
  $relSum = 'supabase/cloud/generated/' + $e.wrapperPath
  if (-not $expected.ContainsKey($relSum)) { $integrityProblems += "wrapper absent from checksums $relSum" }
  elseif ($expected[$relSum] -ne $e.wrapperSha256) { $integrityProblems += "wrapper digest disagrees with checksums $relSum" }
}
$treeHash = Get-TextSha256 -Text ($treeRows -join "`n")

New-PhaseReceipt '01-integrity.json' @{
  status          = $(if ($integrityProblems.Count -eq 0) { 'PASS' } else { 'FAIL' })
  filesVerified   = $verifiedFiles
  checksumEntries = $expected.Count
  packageTreeHash = $treeHash
  wrappersChecked = $entries.Count
  problems        = @($integrityProblems)
}
if ($integrityProblems.Count -gt 0) {
  Stop-Run ("package integrity failed ({0} problem(s)): {1}" -f $integrityProblems.Count, (($integrityProblems | Select-Object -First 6) -join '; ')) '01-integrity-fail.json'
}

# Round 9 (B3): VERBOSITY=verbose makes psql put the SQLSTATE into every ERROR
# line, so Get-PgSqlState has something real to extract for claim collisions and
# probe failures. It changes error text only, never successful query output.
$common = @('-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose')

# --------------------------------------------------- gate 2: preflight SQL ---
# Round 14 (R13-C1): this gate counted lines ending in '| PASS' and '| FAIL' and
# refused only when FAIL > 0 or PASS < 1. Any text ending in '| PASS' therefore
# passed it: the independent audit fed the gate
#     THIS IS NOT A PREFLIGHT REPORT | PASS
# with exit 0 and complete capture, and the receipt said PASS, no STOP was taken
# and the run advanced to the ledger gate. A report the runner cannot read is not
# evidence, whatever its suffix says.
#
# Gate 2 now asks the same question gate 5 asks: is this EXACTLY the report that
# preflight\00_preflight.sql renders? Test-VerifyReport holds the declared
# contract for '00_preflight.sql' - 21 checks (19 gating, 2 INFO), each with its
# ordinal, name, expected text and status, arriving in order, framed by the
# header, the dashed separator and the '(21 rows)' footer. Anything else is a
# problem, and the phase receipt takes its status from that verdict rather than
# from the exit code alone (a rendered-FAIL or INFO-only report can no longer
# leave a PASS receipt behind).
$pf = Invoke-NativeProcess -FilePath $psqlPath `
        -Arguments ($common + @('-f', (Join-Path $cloudRoot 'preflight\00_preflight.sql'))) `
        -Environment $policy.env -TimeoutSeconds $PreflightTimeoutSeconds
[void](Write-Evidence -Path (Join-Path $run '01-gates\preflight.out') -Text $pf.stdOut)
[void](Write-Evidence -Path (Join-Path $run '01-gates\preflight.err') -Text $pf.stdErr)
$pfReport = Test-VerifyReport -Result $pf -ReportName '00_preflight.sql'
New-PhaseReceipt '02-preflight.json' @{
  status          = $pfReport.verdict
  outcome         = $pfReport.outcome
  exitCode        = $pf.exitCode
  timedOut        = $pf.timedOut
  durationMs      = $pf.durationMs
  rows            = $pfReport.rows
  passRows        = $pfReport.passRows
  failRows        = $pfReport.failRows
  infoRows        = $pfReport.infoRows
  gatingExpected  = $pfReport.gatingExpected
  infoExpected    = $pfReport.infoExpected
  captureComplete = $pfReport.captureComplete
  headerSeen      = $pfReport.headerSeen
  separatorSeen   = $pfReport.separatorSeen
  footerSeen      = $pfReport.footerSeen
  footerRows      = $pfReport.footerRows
  reportContract  = '00_preflight.sql'
  problems        = @($pfReport.problems)
  stderrChars     = $pf.stdErr.Length
  summary         = (Format-NativeSummary $pf)
}
if (-not (Test-NativeSuccess $pf)) {
  Stop-Run ("preflight failed: {0}; {1}" -f (Format-NativeSummary $pf), (Get-NativeErrorExcerpt $pf)) '02-preflight-fail.json'
}
if (-not $pfReport.ok) {
  # Sliced, not piped through Select-Object: this runs under 'Stop'.
  $pfProblems = @($pfReport.problems)
  if ($pfProblems.Count -gt 6) { $pfProblems = @($pfProblems[0..5]) }
  Stop-Run ("preflight verification did not satisfy the report contract: verdict={0}; rows={1} ({2} PASS / {3} FAIL / {4} INFO; contract {5} gating + {6} INFO); problems: {7}. Nothing has been applied yet and no database write has happened, so there is no transaction state to interpret." -f `
      $pfReport.verdict, $pfReport.rows, $pfReport.passRows, $pfReport.failRows, $pfReport.infoRows, $pfReport.gatingExpected, $pfReport.infoExpected, `
      ($pfProblems -join '; ')) '02-preflight-rows.json'
}

# ------------------------------------- gate 3: ledger must be empty (R2) -----
# Round 8: this runner is fresh-only. The earlier "prefix proof" advertised a
# resume that the fresh-baseline preflight made unreachable, and a gapped ledger
# could be read as resumable. The gate now asks one question - is the ledger
# empty? - and stops on every other state.
$ledgerPresentSql = "select case when to_regclass('supabase_migrations.schema_migrations') is null then 'ABSENT' else 'PRESENT' end;"
$presence = Invoke-NativeProcess -FilePath $psqlPath -Arguments ($common + @('-t', '-A', '-c', $ledgerPresentSql)) `
              -Environment $policy.env -TimeoutSeconds 300
[void](Write-Evidence -Path (Join-Path $run '02-ledger\presence.out') -Text $presence.stdOut)
[void](Write-Evidence -Path (Join-Path $run '02-ledger\presence.err') -Text $presence.stdErr)
if (-not (Test-NativeSuccess $presence)) {
  New-PhaseReceipt '03-ledger-probe.json' @{
    status = 'FAIL'; outcome = (Get-NativeOutcomeLabel $presence)
    sqlState = (Get-PgSqlState $presence.stdErr); summary = (Format-NativeSummary $presence)
  }
  Stop-Run ("the ledger presence probe did not complete ({0}, sqlstate '{1}'): {2}. A failed probe is not an empty ledger." -f `
      (Get-NativeOutcomeLabel $presence), (Get-PgSqlState $presence.stdErr), (Get-NativeErrorExcerpt $presence)) '03-ledger-probe-fail.json'
}
$presenceText = $presence.stdOut.Trim()
if ($presenceText -ne 'ABSENT' -and $presenceText -ne 'PRESENT') {
  Stop-Run ("the ledger presence probe returned '{0}' instead of ABSENT/PRESENT." -f $presenceText) '03-ledger-probe-weird.json'
}
$ledgerAbsent = ($presenceText -eq 'ABSENT')

$ledger = @{}
$ledgerParse = $null
if (-not $ledgerAbsent) {
  $ledSql = "select version || '|' || coalesce(statements[1],'<null>') from supabase_migrations.schema_migrations order by version;"
  $led = Invoke-NativeProcess -FilePath $psqlPath -Arguments ($common + @('-t', '-A', '-c', $ledSql)) `
           -Environment $policy.env -TimeoutSeconds 300
  [void](Write-Evidence -Path (Join-Path $run '02-ledger\ledger.out') -Text $led.stdOut)
  [void](Write-Evidence -Path (Join-Path $run '02-ledger\ledger.err') -Text $led.stdErr)
  if (-not (Test-NativeSuccess $led)) {
    New-PhaseReceipt '03-ledger.json' @{
      status = 'FAIL'; outcome = (Get-NativeOutcomeLabel $led)
      sqlState = (Get-PgSqlState $led.stdErr); summary = (Format-NativeSummary $led); detail = (Get-NativeErrorExcerpt $led)
    }
    Stop-Run ("could not read the migration ledger ({0}, sqlstate '{1}'): {2}" -f `
        (Get-NativeOutcomeLabel $led), (Get-PgSqlState $led.stdErr), (Get-NativeErrorExcerpt $led)) '03-ledger-fail.json'
  }
  # Round 9 (B1): one strict parser for both tools. Nothing is discarded: a row
  # with the wrong field count, an invalid or unknown version, a malformed
  # identity or a repeated version is a parse failure, and a parse failure stops
  # here - before step 0 creates anything.
  $ledgerParse = ConvertFrom-ClashLedgerOutput -Text $led.stdOut -Entries $entries
  if (-not $ledgerParse.ok) {
    New-PhaseReceipt '03-ledger-parse.json' @{
      status   = 'STOP'
      rows     = $ledgerParse.rows
      problems = @($ledgerParse.problems)
      rule     = 'every nonblank ledger row must be a complete, unique, manifest-known record'
    }
    Stop-Run ("the ledger listing could not be parsed ({0} problem(s)): {1}. Nothing was executed and no table was created." -f `
        @($ledgerParse.problems).Count, ((@($ledgerParse.problems) | Select-Object -First 6) -join '; ')) '03-ledger-parse-stop.json'
  }
  $ledger = $ledgerParse.ledger
}
else {
  $ledgerParse = ConvertFrom-ClashLedgerOutput -Text '' -Entries $entries -TableAbsent $true
  if (-not $ledgerParse.ok) {
    Stop-Run ("the absent-ledger path produced an inconsistent result: {0}" -f ((@($ledgerParse.problems)) -join '; ')) '03-ledger-parse-stop.json'
  }
}

$ledgerVerdict = Get-LedgerVerdict -Entries $entries -Ledger $ledger -TableAbsent $ledgerAbsent
New-PhaseReceipt '03-ledger.json' @{
  status      = $(if ($ledgerVerdict.verdict -eq 'EMPTY') { 'PASS' } else { 'STOP' })
  verdict     = $ledgerVerdict.verdict
  detail      = $ledgerVerdict.why
  ledgerRows  = $ledgerVerdict.rows
  rowsParsed  = $(if ($null -ne $ledgerParse) { $ledgerParse.rows } else { 0 })
  tableAbsent = $ledgerAbsent
  gaps        = @($ledgerVerdict.gaps)
  policy      = 'fresh-only: an empty ledger is required; there is no resume path'
}
if ($ledgerVerdict.verdict -ne 'EMPTY') {
  Stop-Run ("the ledger is not empty (verdict {0}: {1}; {2} row(s)). This runner is fresh-only: it initialises an empty project and has no resume path, no backfill and no retry. A partially applied database requires a separately reviewed recovery plan." -f `
      $ledgerVerdict.verdict, $ledgerVerdict.why, $ledgerVerdict.rows) '03-ledger-not-empty.json'
}

# --------------------------------- gate 3b: step 0 - the ledger table itself --
# Round 8 (R2): step 0 runs on every fresh deployment, not only when the ledger
# table is missing. It is create-only, so an existing table is a no-op, and it
# also guarantees that the exclusive-writer claim table exists before gate 3c.
$bootstrapRel = 'supabase/cloud/generated/000_ledger_bootstrap.sql'
$bootstrapAbs = Join-Path $genDir '000_ledger_bootstrap.sql'
if (-not (Test-Path -LiteralPath $bootstrapAbs)) {
  Stop-Run 'step 0 missing: generated/000_ledger_bootstrap.sql' '03b-bootstrap-missing.json'
}
$bootSha = Get-NormalizedSha256 -Path $bootstrapAbs
if ($expected[$bootstrapRel] -ne $bootSha) {
  New-PhaseReceipt '03b-bootstrap-digest.json' @{
    status = 'STOP'; expected = $expected[$bootstrapRel]; actual = $bootSha
    rule = 'step 0 bytes changed after review'
  }
  Stop-Run ("step 0 digest mismatch: expected {0}, found {1}. Nothing was executed." -f $expected[$bootstrapRel], $bootSha) '03b-bootstrap-digest-stop.json'
}

$boot = Invoke-NativeProcess -FilePath $psqlPath -Arguments ($common + @('-f', $bootstrapAbs)) `
          -Environment $policy.env -TimeoutSeconds $PreflightTimeoutSeconds
[void](Write-Evidence -Path (Join-Path $run '02-ledger\bootstrap.out') -Text $boot.stdOut)
[void](Write-Evidence -Path (Join-Path $run '02-ledger\bootstrap.err') -Text $boot.stdErr)
if (-not (Test-NativeSuccess $boot)) {
  New-PhaseReceipt '03b-bootstrap.json' @{
    status = 'FAIL'; outcome = (Get-NativeOutcomeLabel $boot); exitCode = $boot.exitCode
    sqlState = (Get-PgSqlState $boot.stdErr)
    summary = (Format-NativeSummary $boot); detail = (Get-NativeErrorExcerpt $boot)
  }
  Stop-Run ("step 0 (ledger bootstrap) did not succeed: {0}; {1}" -f (Format-NativeSummary $boot), (Get-NativeErrorExcerpt $boot)) '03b-bootstrap-fail.json'
}

$recheck = Invoke-NativeProcess -FilePath $psqlPath `
             -Arguments ($common + @('-t', '-A', '-c', 'select count(*) from supabase_migrations.schema_migrations;')) `
             -Environment $policy.env -TimeoutSeconds 300
[void](Write-Evidence -Path (Join-Path $run '02-ledger\bootstrap-recheck.out') -Text $recheck.stdOut)
[void](Write-Evidence -Path (Join-Path $run '02-ledger\bootstrap-recheck.err') -Text $recheck.stdErr)
$bootRows = -1
if (-not (Test-NativeSuccess $recheck) -or -not [int]::TryParse($recheck.stdOut.Trim(), [ref]$bootRows)) {
  Stop-Run ("step 0 ran but the ledger table cannot be read back: {0}; {1}" -f (Format-NativeSummary $recheck), (Get-NativeErrorExcerpt $recheck)) '03b-bootstrap-unproven.json'
}
if ($bootRows -ne 0) {
  Stop-Run ("step 0 created a ledger that is not empty ({0} rows). A bootstrap must never adopt existing rows silently." -f $bootRows) '03b-bootstrap-nonempty.json'
}
# Round 9: step 0 uses IF NOT EXISTS, which says nothing about a table that
# already existed. The uniqueness and single-writer arguments depend on the
# primary keys, so they are read back from the catalog instead of assumed.
$structureSql = @"
select 'ledger=' || coalesce((select string_agg(a.attname, ',' order by a.attname)
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
   where c.contype = 'p' and c.conrelid = 'supabase_migrations.schema_migrations'::regclass), '<none>')
    || ';claim=' || coalesce((select string_agg(a.attname, ',' order by a.attname)
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
   where c.contype = 'p' and c.conrelid = 'supabase_migrations.clash_deploy_claim'::regclass), '<none>');
"@
$structure = Invoke-NativeProcess -FilePath $psqlPath -Arguments ($common + @('-t', '-A', '-c', $structureSql)) `
               -Environment $policy.env -TimeoutSeconds 300
[void](Write-Evidence -Path (Join-Path $run '02-ledger\structure.out') -Text $structure.stdOut)
[void](Write-Evidence -Path (Join-Path $run '02-ledger\structure.err') -Text $structure.stdErr)
$structureText = $structure.stdOut.Trim()
if (-not (Test-NativeSuccess $structure) -or $structureText -ne 'ledger=version;claim=claim_key') {
  New-PhaseReceipt '03b-schema.json' @{
    status = 'STOP'; observed = $structureText; expected = 'ledger=version;claim=claim_key'
    outcome = (Get-NativeOutcomeLabel $structure); sqlState = (Get-PgSqlState $structure.stdErr)
    rule = 'the ledger version key and the single-row claim key must be primary keys'
  }
  Stop-Run ("the ledger or claim table does not carry the expected primary key (observed '{0}', expected 'ledger=version;claim=claim_key'; outcome {1}, sqlstate '{2}'). A pre-existing table is never trusted on its name alone." -f `
      $structureText, (Get-NativeOutcomeLabel $structure), (Get-PgSqlState $structure.stdErr)) '03b-schema-stop.json'
}
New-PhaseReceipt '03b-schema.json' @{ status = 'PASS'; observed = $structureText }

$bootOutcome = $(if ($ledgerAbsent) { 'CREATED' } else { 'NO-OP-ALREADY-CREATED' })
New-PhaseReceipt '03b-bootstrap.json' @{
  status = 'PASS'; outcome = $bootOutcome; rowsAfterCreate = $bootRows
  bootstrapSha256 = $bootSha; exitCode = $boot.exitCode; durationMs = $boot.durationMs
}

# --------------------------------- gate 3c: exclusive writer claim (Round 8) --
# A plain INSERT into a single-row claim table. Two runners started together
# collide on the primary key (SQLSTATE 23505 -> exit 3) and the loser stops
# before it can touch a single migration.
$runId = [guid]::NewGuid().ToString()
$claimSql = "insert into supabase_migrations.clash_deploy_claim (claim_key, run_id, started_utc) values ('clash-cloud-deploy', '$runId', now());"
$claim = Invoke-NativeProcess -FilePath $psqlPath -Arguments ($common + @('-c', $claimSql)) `
           -Environment $policy.env -TimeoutSeconds 300
[void](Write-Evidence -Path (Join-Path $run '03-writer\claim.out') -Text $claim.stdOut)
[void](Write-Evidence -Path (Join-Path $run '03-writer\claim.err') -Text $claim.stdErr)
$claimState = Get-PgSqlState $claim.stdErr
if (-not (Test-NativeSuccess $claim)) {
  New-PhaseReceipt '03c-writer-claim.json' @{
    status = 'STOP'; outcome = (Get-NativeOutcomeLabel $claim); sqlState = $claimState
    runId = $runId; exitCode = $claim.exitCode
    rule = 'exclusive writer: one runner at a time; a stale claim needs human review (ROLLBACK.md T1)'
  }
  Stop-Run ("the exclusive-writer claim could not be taken (outcome {0}, sqlstate '{1}'): {2}. Another runner may be active, or an earlier run left a stale claim. Nothing was executed." -f `
      (Get-NativeOutcomeLabel $claim), $claimState, (Get-NativeErrorExcerpt $claim)) '03c-writer-claim-stop.json'
}
New-PhaseReceipt '03c-writer-claim.json' @{
  status = 'PASS'; runId = $runId; sqlState = $claimState
  rule = 'plain INSERT on a primary key: a concurrent runner collides here and stops'
}

# ------------------------------------------------------- gate 4: execute ----
$applied = 0
foreach ($e in $entries) {
  # Fresh-only: gate 3 proved the ledger empty, so every entry executes. There is
  # no start index and no skipped prefix.

  $label       = '{0:D3}-{1}' -f $e.index, $e.version
  $wrapperRel  = $e.wrapperPath
  $wrapperAbs  = Join-Path $genDir $wrapperRel
  $expectedTok = 'sha256:' + $e.normalizedSha256

  if (-not (Test-Path -LiteralPath $wrapperAbs)) {
    Stop-Run ("wrapper missing for index {0}: {1}" -f $e.index, $wrapperRel) ("{0}-missing.json" -f $label)
  }

  # F5: the digest that will execute must equal the digest that was reviewed,
  # immediately before execution - and it must equal the checksum entry too.
  $actualWrapperSha = Get-NormalizedSha256 -Path $wrapperAbs
  if ($actualWrapperSha -ne $e.wrapperSha256) {
    New-PhaseReceipt ("{0}-digest-detail.json" -f $label) @{
      status = 'STOP'; version = $e.version; expected = $e.wrapperSha256; actual = $actualWrapperSha
      rule = 'wrapper bytes changed after review; refusing to execute'
    }
    Stop-Run ("wrapper digest mismatch for {0}: expected {1}, found {2}. Nothing was executed." -f $e.version, $e.wrapperSha256, $actualWrapperSha) ("{0}-digest.json" -f $label)
  }
  $sumRel = 'supabase/cloud/generated/' + $wrapperRel
  if ($expected[$sumRel] -ne $actualWrapperSha) {
    Stop-Run ("wrapper digest disagrees with checksums.sha256 for {0}." -f $wrapperRel) ("{0}-checksum.json" -f $label)
  }

  Write-Host ("[{0:D3}/111] {1} ({2})  wrapper={3}" -f $e.index, $e.version, $e.mode, $actualWrapperSha.Substring(0, 12))

  $mig = Invoke-NativeProcess -FilePath $psqlPath -Arguments ($common + @('-f', $wrapperAbs)) `
           -Environment $policy.env -TimeoutSeconds $MigrationTimeoutSeconds
  [void](Write-Evidence -Path (Join-Path $run ("03-migrations\{0}.out" -f $label)) -Text $mig.stdOut)
  [void](Write-Evidence -Path (Join-Path $run ("03-migrations\{0}.err" -f $label)) -Text $mig.stdErr)

  $receipt = [ordered]@{
    status           = 'STARTED'
    index            = $e.index
    version          = $e.version
    mode             = $e.mode
    ledgerName       = $e.ledgerName
    executedSha256   = $e.executedSha256
    expectedToken    = $expectedTok
    wrapperPath      = $wrapperRel
    wrapperSha256    = $actualWrapperSha
    normalisation    = $e.normalisation
    outcome          = 'UNKNOWN'
    exitCode         = $mig.exitCode
    timedOut         = $mig.timedOut
    launchError      = $mig.launchError
    durationMs       = $mig.durationMs
    startedUtc       = $mig.startedUtc
    finishedUtc      = $mig.finishedUtc
    stderrChars      = $mig.stdErr.Length
    stderrExcerpt    = (Get-NativeErrorExcerpt $mig 400)
    ledgerReadBack   = 'NOT CHECKED'
  }

  # Never assume the transaction state. Ask the ledger, and believe only that.
  $probeSql = "select coalesce(statements[1],'<null>') from supabase_migrations.schema_migrations where version = '$($e.version)';"
  $probe = $null
  if ($null -ne $mig.exitCode -and -not $mig.timedOut) {
    $probe = Invoke-NativeProcess -FilePath $psqlPath -Arguments ($common + @('-t', '-A', '-c', $probeSql)) `
               -Environment $policy.env -TimeoutSeconds 300
    [void](Write-Evidence -Path (Join-Path $run ("03-migrations\{0}.readback.out" -f $label)) -Text $probe.stdOut)
    [void](Write-Evidence -Path (Join-Path $run ("03-migrations\{0}.readback.err" -f $label)) -Text $probe.stdErr)
  }

  $probeOk    = ($null -ne $probe -and (Test-NativeSuccess $probe))
  $probeVal   = if ($probeOk) { $probe.stdOut.Trim() } else { '' }
  $rowPresent = ($probeOk -and -not [string]::IsNullOrWhiteSpace($probeVal))

  if ((Test-NativeSuccess $mig)) {
    if (-not $probeOk) {
      $receipt.outcome = 'UNKNOWN'
      $receipt.status  = 'UNPROVEN'
      $receipt.ledgerReadBack = 'PROBE FAILED'
      [void](Write-RequiredReceipt -Path (Join-Path $run ("03-migrations\{0}.json" -f $label)) -Label ("{0}.json" -f $label) -Text ($receipt | ConvertTo-Json -Depth 8))
      Stop-Run ("migration {0} exited 0 but the ledger read-back could not be performed ({1}). Outcome UNKNOWN; do not assume the row is present." -f $e.version, (Get-NativeOutcomeLabel $probe)) ("{0}-unproven.json" -f $label)
    }
    if (-not $rowPresent -or $probeVal -ne $expectedTok) {
      $receipt.outcome = 'LEDGER_MISMATCH'
      $receipt.status  = 'FAIL'
      $receipt.ledgerReadBack = ("expected {0} got '{1}'" -f $expectedTok, $probeVal)
      [void](Write-RequiredReceipt -Path (Join-Path $run ("03-migrations\{0}.json" -f $label)) -Label ("{0}.json" -f $label) -Text ($receipt | ConvertTo-Json -Depth 8))
      Stop-Run ("migration {0} exited 0 but the ledger row does not match: expected {1}, found '{2}'." -f $e.version, $expectedTok, $probeVal) ("{0}-ledger-mismatch.json" -f $label)
    }
    $receipt.outcome = 'COMMITTED'
    $receipt.ledgerReadBack = 'MATCH'
    $receipt.status = 'PASS'
    [void](Write-RequiredReceipt -Path (Join-Path $run ("03-migrations\{0}.json" -f $label)) -Label ("{0}.json" -f $label) -Text ($receipt | ConvertTo-Json -Depth 8))
    New-PhaseReceipt ("{0}-applied.json" -f $label) @{
      status = 'PASS'; version = $e.version; outcome = 'COMMITTED'
      wrapperSha256 = $actualWrapperSha; ledgerReadBack = 'MATCH'; exitCode = 0
    }
    $applied++
    continue
  }

  # Nonzero / timeout / launch failure: classify, never narrate.
  # Round 8 (R3): an absent row after a connection loss, a timeout or an
  # unreadable probe proves nothing - the original backend may still commit - so
  # only a script error under ON_ERROR_STOP (exit 3, COMMIT never reached) with a
  # successful fresh read-back is accepted as a proven rollback.
  $exitClass = Get-PsqlExitClass $mig
  $captureOk = Test-NativeCaptureComplete $mig
  $receipt.exitClass      = $exitClass
  $receipt.captureComplete = $captureOk
  $receipt.sqlState       = (Get-PgSqlState $mig.stdErr)

  if ($rowPresent -and $probeVal -eq $expectedTok) { $receipt.outcome = 'COMMITTED' }
  elseif ($rowPresent)                              { $receipt.outcome = 'LEDGER_MISMATCH' }
  elseif (Test-RollbackProvable -Result $mig -ReadBackOk $probeOk -RowAbsent $true) { $receipt.outcome = 'ROLLED_BACK_PROVEN' }
  else                                              { $receipt.outcome = 'UNKNOWN' }

  $explain = switch ($receipt.outcome) {
    'ROLLED_BACK_PROVEN' { 'psql exited 3 (script error under ON_ERROR_STOP), so the COMMIT that ends the wrapper was never reached, and a fresh session shows no row: the transaction did not commit.' }
    'COMMITTED'          { 'the ledger row IS present with the expected identity: the wrapper committed, whatever the exit code said afterwards. Do not re-run it.' }
    'LEDGER_MISMATCH'    { 'a ledger row exists with an identity the manifest does not describe. Human decision required.' }
    default              { 'the transaction outcome is NOT established: a connection loss, a timeout or an unreadable probe cannot prove that the original backend will not still commit. Treat this version as UNKNOWN and require human review.' }
  }
  $receipt.status = 'FAIL'
  [void](Write-RequiredReceipt -Path (Join-Path $run ("03-migrations\{0}.json" -f $label)) -Label ("{0}.json" -f $label) -Text ($receipt | ConvertTo-Json -Depth 8))
  New-PhaseReceipt ("{0}-failed.json" -f $label) @{
    status = 'FAIL'; version = $e.version; outcome = $receipt.outcome
    exitCode = $mig.exitCode; timedOut = $mig.timedOut
    summary = (Format-NativeSummary $mig)
  }
  Stop-Run ("migration {0} did not succeed: outcome={1} ({2}). {3} Detail: {4}" -f `
      $e.version, $receipt.outcome, (Format-NativeSummary $mig), $explain, (Get-NativeErrorExcerpt $mig 500)) `
    ("{0}-failed-stop.json" -f $label)
}

# --------------------------------------------------- gate 5: postflight -----
$vf = Invoke-NativeProcess -FilePath $psqlPath `
        -Arguments ($common + @('-f', (Join-Path $cloudRoot 'verify\90_verify.sql'))) `
        -Environment $policy.env -TimeoutSeconds $VerifyTimeoutSeconds
[void](Write-Evidence -Path (Join-Path $run '04-postflight\verify.out') -Text $vf.stdOut)
[void](Write-Evidence -Path (Join-Path $run '04-postflight\verify.err') -Text $vf.stdErr)
# Round 12 (R11-C1): counting FAIL rows was not a contract. Exit 0 with zero
# rendered rows passed this gate, released the writer claim and wrote COMPLETE.
# Test-VerifyReport requires native success AND the exact declared report: every
# ord, name, expected text, status and count, with no missing, duplicate,
# malformed or undeclared row. status is PASS only when that contract holds.
$vfReport = Test-VerifyReport -Result $vf -ReportName '90_verify.sql'
New-PhaseReceipt '04-postflight.json' @{
  status          = $vfReport.verdict
  outcome         = $vfReport.outcome
  exitCode        = $vf.exitCode
  timedOut        = $vf.timedOut
  rows            = $vfReport.rows
  passRows        = $vfReport.passRows
  failRows        = $vfReport.failRows
  infoRows        = $vfReport.infoRows
  gatingExpected  = $vfReport.gatingExpected
  infoExpected    = $vfReport.infoExpected
  captureComplete = $vfReport.captureComplete
  headerSeen      = $vfReport.headerSeen
  separatorSeen   = $vfReport.separatorSeen
  footerSeen      = $vfReport.footerSeen
  footerRows      = $vfReport.footerRows
  reportContract  = '90_verify.sql'
  problems        = @($vfReport.problems)
  summary         = (Format-NativeSummary $vf)
}
if (-not $vfReport.ok) {
  # Requirement: an incomplete or unproven report must not imply rollback. The
  # 111 wrappers already reported COMMITTED; what is missing is the proof that
  # the schema is complete, so completion is withheld and the claim stays held.
  # Sliced, not piped through Select-Object: this runs under 'Stop'.
  $vfProblems = @($vfReport.problems)
  if ($vfProblems.Count -gt 6) { $vfProblems = @($vfProblems[0..5]) }
  Stop-Run ("postflight verification did not satisfy the report contract: verdict={0}; rows={1} ({2} PASS / {3} FAIL / {4} INFO; contract {5} gating + {6} INFO); problems: {7}. No rollback is implied - every wrapper reported COMMITTED, so the schema state is NOT assumed reverted; completion is withheld and the exclusive-writer claim stays held for human review (ROLLBACK.md T1). Detail: {8}" -f `
      $vfReport.verdict, $vfReport.rows, $vfReport.passRows, $vfReport.failRows, $vfReport.infoRows, $vfReport.gatingExpected, $vfReport.infoExpected, `
      ($vfProblems -join '; '), (Get-NativeErrorExcerpt $vf 400)) '04-postflight-fail.json'
}

$st = Invoke-NativeProcess -FilePath $psqlPath `
        -Arguments ($common + @('-f', (Join-Path $cloudRoot 'verify\95_storage_config.sql'))) `
        -Environment $policy.env -TimeoutSeconds $VerifyTimeoutSeconds
[void](Write-Evidence -Path (Join-Path $run '04-postflight\storage.out') -Text $st.stdOut)
[void](Write-Evidence -Path (Join-Path $run '04-postflight\storage.err') -Text $st.stdErr)
# Round 12 (R11-C1): storage verification had no PASS/INFO contract at all - it
# only counted FAIL rows, so exit 0 with no output was a pass. Same rule as the
# postflight gate: the declared 6 gating checks must render PASS and the declared
# INFO row must render INFO, or this gate does not open.
$stReport = Test-VerifyReport -Result $st -ReportName '95_storage_config.sql'
New-PhaseReceipt '05-storage.json' @{
  status          = $stReport.verdict
  outcome         = $stReport.outcome
  exitCode        = $st.exitCode
  timedOut        = $st.timedOut
  rows            = $stReport.rows
  passRows        = $stReport.passRows
  failRows        = $stReport.failRows
  infoRows        = $stReport.infoRows
  gatingExpected  = $stReport.gatingExpected
  infoExpected    = $stReport.infoExpected
  captureComplete = $stReport.captureComplete
  headerSeen      = $stReport.headerSeen
  separatorSeen   = $stReport.separatorSeen
  footerSeen      = $stReport.footerSeen
  footerRows      = $stReport.footerRows
  reportContract  = '95_storage_config.sql'
  problems        = @($stReport.problems)
  summary         = (Format-NativeSummary $st)
}
if (-not $stReport.ok) {
  $stProblems = @($stReport.problems)
  if ($stProblems.Count -gt 6) { $stProblems = @($stProblems[0..5]) }
  Stop-Run ("storage verification did not satisfy the report contract: verdict={0}; rows={1} ({2} PASS / {3} FAIL / {4} INFO; contract {5} gating + {6} INFO); problems: {7}. The schema and its postflight report are proven, but the storage configuration is not, so completion is withheld and the exclusive-writer claim stays held for human review (ROLLBACK.md T1). Detail: {8}" -f `
      $stReport.verdict, $stReport.rows, $stReport.passRows, $stReport.failRows, $stReport.infoRows, $stReport.gatingExpected, $stReport.infoExpected, `
      ($stProblems -join '; '), (Get-NativeErrorExcerpt $st 400)) '05-storage-fail.json'
}

# Both verification contracts must hold before the claim is touched. The two STOPs
# above already guarantee it; this restates the invariant where it matters, so a
# future edit that reorders the gates fails here instead of releasing a claim on
# unproven evidence.
if (-not $vfReport.ok -or -not $stReport.ok) {
  Stop-Run 'REFUSED: the claim release was reached without two proven verification reports. No claim was released and no completion receipt was written.' '05-storage-fail.json'
}

# ---------------------------------------- release the exclusive-writer claim --
# Postflight passed, so the deployment is complete; the claim is released so the
# next fresh run can start. A failed release is a STOP: the database would keep
# asserting "a writer is active" while the evidence says otherwise.
# Round 9: RETURNING proves ownership - the delete must remove exactly the row
# this run created, and nothing else. Exit 0 alone would accept a delete that
# matched zero rows because another writer's claim is sitting there.
$releaseSql = "delete from supabase_migrations.clash_deploy_claim where claim_key = 'clash-cloud-deploy' and run_id = '$runId' returning run_id;"
$release = Invoke-NativeProcess -FilePath $psqlPath -Arguments ($common + @('-t', '-A', '-c', $releaseSql)) `
             -Environment $policy.env -TimeoutSeconds 300
[void](Write-Evidence -Path (Join-Path $run '04-postflight\claim-release.out') -Text $release.stdOut)
[void](Write-Evidence -Path (Join-Path $run '04-postflight\claim-release.err') -Text $release.stdErr)
$releasedRows = @(($release.stdOut -split "`r?`n") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$releasedOwned = ($releasedRows.Count -eq 1 -and $releasedRows[0].Trim() -eq $runId)
New-PhaseReceipt '06-claim-release-ownership.json' @{
  status = $(if ($releasedOwned) { 'PASS' } else { 'STOP' })
  expectedRunId = $runId; returnedRows = $releasedRows.Count
  returned = @($releasedRows | ForEach-Object { $_.Trim() })
}
# Round 10 (R9-C1): the call MUST be parenthesised. Unparenthesised, PowerShell
# parses this as ONE command: '-and', '-not' and the ownership value become extra
# arguments to Test-NativeSuccess, so the condition collapsed to that function's
# own result and a successful release entered this STOP branch. The runner could
# therefore never reach COMPLETE on a correct deployment. Executed by
# test-native-capture.ps1 cases 27-33 (claim-release probe) and 34-46 (gate 5
# report-contract probe) against this committed block.
if ((Test-NativeSuccess $release) -and (-not $releasedOwned)) {
  Stop-Run ("the claim release did not remove exactly this run's row (returned {0} row(s), expected 1 matching {1}). All 111 migrations and postflight passed; the claim state needs human review (ROLLBACK.md T1.1)." -f `
      $releasedRows.Count, $runId) '06-claim-release-ownership-stop.json'
}
if (-not (Test-NativeSuccess $release)) {
  New-PhaseReceipt '06-claim-release.json' @{
    status = 'STOP'; outcome = (Get-NativeOutcomeLabel $release)
    sqlState = (Get-PgSqlState $release.stdErr); runId = $runId
    rule = 'the deployment completed but the exclusive-writer claim could not be released'
  }
  Stop-Run ("all 111 migrations and postflight passed, but the exclusive-writer claim could not be released ({0}, sqlstate '{1}'): {2}. The next run will stop on the stale claim until a human clears it (ROLLBACK.md T1)." -f `
      (Get-NativeOutcomeLabel $release), (Get-PgSqlState $release.stdErr), (Get-NativeErrorExcerpt $release)) '06-claim-release-fail.json'
}
New-PhaseReceipt '06-claim-release.json' @{ status = 'PASS'; runId = $runId; released = $true }

# ------------------------------------------------------------- completion ---
New-PhaseReceipt '06-complete.json' @{
  status = 'COMPLETE'
  appliedThisRun = $applied
  freshOnly = $true
  writerRunId = $runId
  packageTreeHash = $treeHash
  step0Bootstrap  = $bootOutcome
  ledgerReadBack = '111/111 verified by 90_verify.sql'
}
$seal = Seal-Evidence -Root $run
Write-Host ''
Write-Host ("TERMINAL RECEIPT: COMPLETE applied={0} freshOnly=true writerRunId={1} seal={2} files={3}" -f $applied, $runId, $seal.sha256, $seal.fileCount) -ForegroundColor Green
Write-Host ("Evidence: {0}" -f $run)
Write-Host 'Next: store the evidence directory as-is. Do not edit, re-run or repair.'
exit 0
