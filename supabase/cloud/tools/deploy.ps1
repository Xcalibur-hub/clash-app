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
    F4             Nonzero exits are classified, not narrated. The runner never
                   claims a rollback. Outcomes are COMMITTED, ROLLED_BACK_PROVEN
                   (only when a read-only probe proves the row absent),
                   COMMITTED_WITH_ERROR, LEDGER_MISMATCH or UNKNOWN.
    F5             Every wrapper's expected digest is read from the manifest and
                   compared with the bytes on disk BEFORE execution; the whole
                   package is verified against checksums.sha256 before the first
                   database write; the ledger read-back must equal the expected
                   token, not merely some token.
    F7             All child output is captured in memory and sanitised before
                   any file is created; every artefact is created exclusively
                   (FileMode::CreateNew) and sealed by hash chain; STOP messages
                   are sanitised before being printed as well as stored.
    F8             No retry, no repair, no resume-by-assumption. Resume proceeds
                   only from a ledger proven to be an exact prefix.
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
  Write-Host 'This exception implies no database write. Inspect the evidence, then use check-ledger.ps1 (read-only).' -ForegroundColor Red
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

function Stop-Run([string]$Reason, [string]$StopName = 'STOP.json') {
  $safe = Protect-Text $Reason
  New-PhaseReceipt $StopName @{
    status = 'STOPPED'
    reason = $safe
    guidance = 'Do not retry, repair or re-run blindly. Resolve by inspection: check-ledger.ps1 is read-only.'
  }
  [void](Write-EvidenceOrFallback -Path (Join-Path $run 'STOP.txt') -Label 'STOP.txt' -Text ("{0}`n{1}`n" -f (Get-Date).ToUniversalTime().ToString('o'), $safe))
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

$common = @('-X', '-q', '-v', 'ON_ERROR_STOP=1')

# --------------------------------------------------- gate 2: preflight SQL ---
$pf = Invoke-NativeProcess -FilePath $psqlPath `
        -Arguments ($common + @('-f', (Join-Path $cloudRoot 'preflight\00_preflight.sql'))) `
        -Environment $policy.env -TimeoutSeconds $PreflightTimeoutSeconds
[void](Write-Evidence -Path (Join-Path $run '01-gates\preflight.out') -Text $pf.stdOut)
[void](Write-Evidence -Path (Join-Path $run '01-gates\preflight.err') -Text $pf.stdErr)
$pfPass = ([regex]::Matches($pf.stdOut, '\|\s*PASS\s*$', 'Multiline')).Count
$pfFail = ([regex]::Matches($pf.stdOut, '\|\s*FAIL\s*$', 'Multiline')).Count
New-PhaseReceipt '02-preflight.json' @{
  status    = $(if (Test-NativeSuccess $pf) { 'PASS' } else { 'FAIL' })
  outcome   = (Get-NativeOutcomeLabel $pf)
  exitCode  = $pf.exitCode
  timedOut  = $pf.timedOut
  durationMs = $pf.durationMs
  passRows  = $pfPass
  failRows  = $pfFail
  stderrChars = $pf.stdErr.Length
  summary   = (Format-NativeSummary $pf)
}
if (-not (Test-NativeSuccess $pf)) {
  Stop-Run ("preflight failed: {0}; {1}" -f (Format-NativeSummary $pf), (Get-NativeErrorExcerpt $pf)) '02-preflight-fail.json'
}
if ($pfFail -gt 0 -or $pfPass -lt 1) {
  Stop-Run ("preflight report shows {0} PASS / {1} FAIL rows although psql exited 0. Treating as failure." -f $pfPass, $pfFail) '02-preflight-rows.json'
}

# ------------------------------------------- gate 3: ledger prefix proof -----
$ledSql = "select version || '|' || coalesce(statements[1],'<null>') from supabase_migrations.schema_migrations order by version;"
$led = Invoke-NativeProcess -FilePath $psqlPath -Arguments ($common + @('-t', '-A', '-c', $ledSql)) `
         -Environment $policy.env -TimeoutSeconds 300
[void](Write-Evidence -Path (Join-Path $run '02-ledger\ledger.out') -Text $led.stdOut)
[void](Write-Evidence -Path (Join-Path $run '02-ledger\ledger.err') -Text $led.stdErr)

$ledger = @{}
$ledgerAbsent = $false
if (Test-NativeSuccess $led) {
  foreach ($line in ($led.stdOut -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $p = $line.Split('|')
    if ($p.Count -ge 2) { $ledger[$p[0]] = $p[1] }
  }
}
elseif ($led.stdErr -match "schema_migrations['""]*\s+does not exist|relation ""supabase_migrations\.schema_migrations"" does not exist") {
  # the ledger table genuinely does not exist yet: a clean pre-deployment state
  $ledgerAbsent = $true
}
else {
  New-PhaseReceipt '03-ledger.json' @{
    status = 'FAIL'; outcome = (Get-NativeOutcomeLabel $led); exitCode = $led.exitCode
    summary = (Format-NativeSummary $led); detail = (Get-NativeErrorExcerpt $led)
  }
  Stop-Run ("could not read the migration ledger: {0}; {1}" -f (Format-NativeSummary $led), (Get-NativeErrorExcerpt $led)) '03-ledger-fail.json'
}

$startIndex = 1
$missingSeen = $false
$resumeFrom = $null
for ($i = 0; $i -lt $entries.Count; $i++) {
  $e = $entries[$i]
  $want = 'sha256:' + $e.normalizedSha256
  if ($ledger.ContainsKey($e.version)) {
    if ($missingSeen) {
      New-PhaseReceipt '03-ledger-gap-detail.json' @{ status = 'STOP'; gapAt = $e.version; rule = 'ledger must be a prefix' }
      Stop-Run ("ledger gap: {0} is recorded but an earlier version is not. No resume." -f $e.version) '03-ledger-gap.json'
    }
    if ($ledger[$e.version] -ne $want) {
      New-PhaseReceipt '03-ledger-mismatch-detail.json' @{
        status = 'STOP'; version = $e.version; stored = $ledger[$e.version]; expected = $want
      }
      Stop-Run ("ledger identity mismatch for {0}: stored '{1}', manifest expects '{2}'. No resume." -f $e.version, $ledger[$e.version], $want) '03-ledger-mismatch.json'
    }
    $startIndex = $e.index + 1
    $resumeFrom = $e.version
  }
  else { $missingSeen = $true }
}
$known = @{}
foreach ($e in $entries) { $known[$e.version] = $true }
foreach ($v in @($ledger.Keys)) {
  if (-not $known.ContainsKey($v)) {
    New-PhaseReceipt '03-ledger-extra-detail.json' @{ status = 'STOP'; unexpectedVersion = $v }
    Stop-Run ("ledger contains version {0}, which the manifest does not describe. No resume." -f $v) '03-ledger-extra.json'
  }
}
New-PhaseReceipt '03-ledger.json' @{
  status        = 'PASS'
  ledgerRows    = $ledger.Count
  tableAbsent   = $ledgerAbsent
  resumeFromIndex = $startIndex
  lastAppliedVersion = $(if ($resumeFrom) { $resumeFrom } else { '<none>' })
  proof         = 'every recorded version matches the manifest identity and precedes every missing one'
}

# --------------------------------- gate 3b: step 0 - the ledger table itself --
# Round 2 listed "bootstrap invocation" as unvalidated. It is not left to the
# operator: when the ledger table is absent the runner creates it from the
# generated, digested step-0 file, then proves the table now exists and is empty.
$bootstrapRel = 'supabase/cloud/generated/000_ledger_bootstrap.sql'
$bootstrapAbs = Join-Path $genDir '000_ledger_bootstrap.sql'
$bootOutcome  = 'SKIPPED-LEDGER-PRESENT'
if ($ledgerAbsent) {
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
      summary = (Format-NativeSummary $boot); detail = (Get-NativeErrorExcerpt $boot)
    }
    Stop-Run ("step 0 (ledger bootstrap) did not succeed: {0}; {1}" -f (Format-NativeSummary $boot), (Get-NativeErrorExcerpt $boot)) '03b-bootstrap-fail.json'
  }

  $recheck = Invoke-NativeProcess -FilePath $psqlPath `
               -Arguments ($common + @('-t', '-A', '-c', 'select count(*) from supabase_migrations.schema_migrations;')) `
               -Environment $policy.env -TimeoutSeconds 300
  [void](Write-Evidence -Path (Join-Path $run '02-ledger\bootstrap-recheck.out') -Text $recheck.stdOut)
  [void](Write-Evidence -Path (Join-Path $run '02-ledger\bootstrap-recheck.err') -Text $recheck.stdErr)
  $bootRows = 0
  if (-not (Test-NativeSuccess $recheck) -or -not [int]::TryParse($recheck.stdOut.Trim(), [ref]$bootRows)) {
    Stop-Run ("step 0 ran but the ledger table cannot be read back: {0}; {1}" -f (Format-NativeSummary $recheck), (Get-NativeErrorExcerpt $recheck)) '03b-bootstrap-unproven.json'
  }
  if ($bootRows -ne 0) {
    Stop-Run ("step 0 created a ledger that is not empty ({0} rows). A bootstrap must never adopt existing rows silently." -f $bootRows) '03b-bootstrap-nonempty.json'
  }
  New-PhaseReceipt '03b-bootstrap.json' @{
    status = 'PASS'; outcome = 'CREATED'; rowsAfterCreate = $bootRows
    bootstrapSha256 = $bootSha; exitCode = $boot.exitCode; durationMs = $boot.durationMs
  }
  $bootOutcome = 'CREATED'
}
else {
  New-PhaseReceipt '03b-bootstrap.json' @{
    status = 'PASS'; outcome = 'SKIPPED-LEDGER-PRESENT'
    rule = 'step 0 is create-only; an existing ledger is never re-created'
  }
}

# ------------------------------------------------------- gate 4: execute ----
$applied = 0
foreach ($e in $entries) {
  if ($e.index -lt $startIndex) { continue }

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
      [void](Write-EvidenceOrFallback -Path (Join-Path $run ("03-migrations\{0}.json" -f $label)) -Label ("{0}.json" -f $label) -Text ($receipt | ConvertTo-Json -Depth 8))
      Stop-Run ("migration {0} exited 0 but the ledger read-back could not be performed ({1}). Outcome UNKNOWN; do not assume the row is present." -f $e.version, (Get-NativeOutcomeLabel $probe)) ("{0}-unproven.json" -f $label)
    }
    if (-not $rowPresent -or $probeVal -ne $expectedTok) {
      $receipt.outcome = 'LEDGER_MISMATCH'
      $receipt.status  = 'FAIL'
      $receipt.ledgerReadBack = ("expected {0} got '{1}'" -f $expectedTok, $probeVal)
      [void](Write-EvidenceOrFallback -Path (Join-Path $run ("03-migrations\{0}.json" -f $label)) -Label ("{0}.json" -f $label) -Text ($receipt | ConvertTo-Json -Depth 8))
      Stop-Run ("migration {0} exited 0 but the ledger row does not match: expected {1}, found '{2}'." -f $e.version, $expectedTok, $probeVal) ("{0}-ledger-mismatch.json" -f $label)
    }
    $receipt.outcome = 'COMMITTED'
    $receipt.ledgerReadBack = 'MATCH'
    $receipt.status = 'PASS'
    [void](Write-EvidenceOrFallback -Path (Join-Path $run ("03-migrations\{0}.json" -f $label)) -Label ("{0}.json" -f $label) -Text ($receipt | ConvertTo-Json -Depth 8))
    New-PhaseReceipt ("{0}-applied.json" -f $label) @{
      status = 'PASS'; version = $e.version; outcome = 'COMMITTED'
      wrapperSha256 = $actualWrapperSha; ledgerReadBack = 'MATCH'; exitCode = 0
    }
    $applied++
    continue
  }

  # Nonzero / timeout / launch failure: classify, never narrate.
  if ($mig.launchError -or $mig.timedOut -or $null -eq $mig.exitCode) { $receipt.outcome = 'UNKNOWN' }
  elseif (-not $probeOk)                                            { $receipt.outcome = 'UNKNOWN' }
  elseif (-not $rowPresent)                                         { $receipt.outcome = 'ROLLED_BACK_PROVEN' }
  elseif ($probeVal -eq $expectedTok)                               { $receipt.outcome = 'COMMITTED_WITH_ERROR' }
  else                                                              { $receipt.outcome = 'LEDGER_MISMATCH' }

  $explain = switch ($receipt.outcome) {
    'ROLLED_BACK_PROVEN'    { 'the wrapper inserted no ledger row, and the insert shares the wrapper transaction: the transaction did not commit.' }
    'COMMITTED_WITH_ERROR'  { 'the ledger row IS present with the expected identity: the wrapper committed and the error arrived afterwards. Do not re-run it.' }
    'LEDGER_MISMATCH'       { 'a ledger row exists with an identity the manifest does not describe. Human decision required.' }
    default                 { 'the commit outcome could not be established. Assume NOTHING: neither success nor rollback.' }
  }
  $receipt.status = 'FAIL'
  [void](Write-EvidenceOrFallback -Path (Join-Path $run ("03-migrations\{0}.json" -f $label)) -Label ("{0}.json" -f $label) -Text ($receipt | ConvertTo-Json -Depth 8))
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
$vfPassRows = ([regex]::Matches($vf.stdOut, '\|\s*PASS\s*$', 'Multiline')).Count
$vfFailRows = ([regex]::Matches($vf.stdOut, '\|\s*FAIL\s*$', 'Multiline')).Count
New-PhaseReceipt '04-postflight.json' @{
  status = $(if (Test-NativeSuccess $vf) { 'PASS' } else { 'FAIL' })
  outcome = (Get-NativeOutcomeLabel $vf); exitCode = $vf.exitCode; timedOut = $vf.timedOut
  passRows = $vfPassRows; failRows = $vfFailRows; summary = (Format-NativeSummary $vf)
}
if (-not (Test-NativeSuccess $vf) -or $vfFailRows -gt 0) {
  Stop-Run ("postflight verification failed: {0}; {1}" -f (Format-NativeSummary $vf), (Get-NativeErrorExcerpt $vf)) '04-postflight-fail.json'
}

$st = Invoke-NativeProcess -FilePath $psqlPath `
        -Arguments ($common + @('-f', (Join-Path $cloudRoot 'verify\95_storage_config.sql'))) `
        -Environment $policy.env -TimeoutSeconds $VerifyTimeoutSeconds
[void](Write-Evidence -Path (Join-Path $run '04-postflight\storage.out') -Text $st.stdOut)
[void](Write-Evidence -Path (Join-Path $run '04-postflight\storage.err') -Text $st.stdErr)
$stFailRows = ([regex]::Matches($st.stdOut, '\|\s*FAIL\s*$', 'Multiline')).Count
New-PhaseReceipt '05-storage.json' @{
  status = $(if (Test-NativeSuccess $st) { 'PASS' } else { 'FAIL' })
  outcome = (Get-NativeOutcomeLabel $st); exitCode = $st.exitCode; timedOut = $st.timedOut
  failRows = $stFailRows; summary = (Format-NativeSummary $st)
}
if (-not (Test-NativeSuccess $st) -or $stFailRows -gt 0) {
  Stop-Run ("storage configuration verification failed: {0}; {1}" -f (Format-NativeSummary $st), (Get-NativeErrorExcerpt $st)) '05-storage-fail.json'
}

# ------------------------------------------------------------- completion ---
New-PhaseReceipt '06-complete.json' @{
  status = 'COMPLETE'
  appliedThisRun = $applied
  resumedFromIndex = $startIndex
  packageTreeHash = $treeHash
  step0Bootstrap  = $bootOutcome
  ledgerReadBack = '111/111 verified by 90_verify.sql'
}
$seal = Seal-Evidence -Root $run
Write-Host ''
Write-Host ("TERMINAL RECEIPT: COMPLETE applied={0} resumedFrom={1} seal={2} files={3}" -f $applied, $startIndex, $seal.sha256, $seal.fileCount) -ForegroundColor Green
Write-Host ("Evidence: {0}" -f $run)
Write-Host 'Next: store the evidence directory as-is. Do not edit, re-run or repair.'
exit 0
