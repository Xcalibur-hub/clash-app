#Requires -Version 5.1
<#
  CLASH cloud deployment runner — PowerShell 5.1 safe, credential-free argv,
  stop on first failure, no automatic retry.

  Audit findings addressed here:
    F1  every generated wrapper is one transaction containing BOTH the migration
        and its ledger row, so there is no schema-applied/ledger-missing window.
    F5  UTF-8 without BOM for all written artefacts; stderr captured to a file
        (never merged with stdout); $LASTEXITCODE checked explicitly, including
        the null case; every step writes a receipt inside try/finally.
    F7  no connection string or password in argv. Connection comes from
        PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD or PGPASSFILE. All logs are
        redacted before they are written.
    F8  no blind resume. The runner proves the ledger is an exact prefix of the
        manifest — same versions, same stored sha256 — before skipping anything,
        and refuses on any gap, mismatch or extra row.

  Usage:
    $env:PGPASSWORD = '<password>'      # or set PGPASSFILE
    .\deploy.ps1 -PgHost db.<ref>.supabase.co -ConfirmDeployment
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$PgHost,
  [int]$PgPort = 5432,
  [string]$PgUser = 'postgres',
  [string]$PgDatabase = 'postgres',
  [string]$Psql = 'psql',
  [switch]$ConfirmDeployment
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

# ---------------------------------------------------------------- helpers ---
function Write-Utf8NoBom {
  param([string]$Path, [string]$Text)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function Get-NormalizedSha256 {
  param([string]$Path)
  $text = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($Path))
  if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
  $text = $text.Replace("`r`n", "`n")
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $h = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($text)) }
  finally { $sha.Dispose() }
  return (-join ($h | ForEach-Object { $_.ToString('x2') }))
}

function Protect-Text {
  param([string]$Text)
  if ($null -eq $Text) { return '' }
  $t = $Text
  $t = [regex]::Replace($t, 'postgres(ql)?://[^\s"'']+', 'postgresql://[REDACTED]')
  $t = [regex]::Replace($t, '(?i)(password|pgpassword)\s*=\s*\S+', '$1=[REDACTED]')
  $t = [regex]::Replace($t, ':[^:@\s/]+@', ':[REDACTED]@')
  return $t
}

$script:PsqlOk = $false

function Invoke-Psql {
  param([string[]]$Arguments, [string]$StdOutPath, [string]$StdErrPath)
  $errFile = $StdErrPath
  $out = & $Psql @Arguments 2>$errFile
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 900 }              # command not run / not found
  $text = if ($null -eq $out) { '' } else { ($out | Out-String) }
  Write-Utf8NoBom -Path $StdOutPath -Text (Protect-Text $text)
  if (Test-Path $errFile) {
    Write-Utf8NoBom -Path $errFile -Text (Protect-Text ([System.IO.File]::ReadAllText($errFile)))
  }
  return $code
}

# --------------------------------------------------------------- preflight --
$cloudRoot = Split-Path -Parent $PSScriptRoot
$repoRoot  = Split-Path -Parent (Split-Path -Parent $cloudRoot)
$manifestPath = Join-Path $cloudRoot 'manifest.json'
$genDir       = Join-Path $cloudRoot 'generated'

if (-not $ConfirmDeployment) {
  Write-Host 'REFUSED: pass -ConfirmDeployment after reading README.md section 5.' -ForegroundColor Yellow
  exit 2
}
if (-not (Get-Command $Psql -ErrorAction SilentlyContinue)) {
  Write-Host "REFUSED: '$Psql' not found on PATH." -ForegroundColor Red
  exit 2
}
if (-not (Test-Path $manifestPath) -or -not (Test-Path $genDir)) {
  Write-Host 'REFUSED: manifest.json or generated/ missing. Run: node tools/build-package.mjs' -ForegroundColor Red
  exit 2
}
if (-not $env:PGPASSWORD -and -not $env:PGPASSFILE) {
  Write-Host 'REFUSED: set PGPASSWORD or PGPASSFILE. Credentials are never passed as arguments.' -ForegroundColor Red
  exit 2
}

$env:PGHOST = $PgHost
$env:PGPORT = [string]$PgPort
$env:PGUSER = $PgUser
$env:PGDATABASE = $PgDatabase
if (-not $env:PGSSLMODE) { $env:PGSSLMODE = 'require' }

$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$entries  = @($manifest.entries)
if ($entries.Count -ne 111) {
  Write-Host "REFUSED: manifest has $($entries.Count) entries, expected 111." -ForegroundColor Red
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
foreach ($d in @('00-baseline','01-gates','02-migrations','03-divergence','05-postverify')) {
  New-Item -ItemType Directory -Path (Join-Path $run $d) -Force | Out-Null
}

function Write-Stop([string]$Reason) {
  Write-Utf8NoBom -Path (Join-Path $run 'STOP.txt') -Text (Protect-Text $Reason)
  Write-Host "STOP: $Reason" -ForegroundColor Red
  Write-Host "Evidence: $run"
  exit 1
}

Write-Utf8NoBom -Path (Join-Path $run '00-baseline\run.txt') -Text (@(
  "utc=$((Get-Date).ToUniversalTime().ToString('o'))"
  "psql=$(& $Psql --version 2>$null | Out-String)"
  "repoHead=$(git -C $repoRoot rev-parse HEAD 2>$null)"
  "migrationsDirty=$(git -C $repoRoot status --porcelain -- supabase/migrations 2>$null)"
  "host=$PgHost port=$PgPort user=$PgUser db=$PgDatabase"
  "psqlmode=$env:PGSSLMODE"
) -join "`n")

$common = @('-X', '-q', '-v', 'ON_ERROR_STOP=1')

# ---- gate 1: preflight -----------------------------------------------------
$pfOut = Join-Path $run '01-gates\preflight.out'
$pfErr = Join-Path $run '01-gates\preflight.err'
$pfCode = Invoke-Psql -Arguments ($common + @('-f', (Join-Path $cloudRoot 'preflight\00_preflight.sql'))) -StdOutPath $pfOut -StdErrPath $pfErr
if ($pfCode -ne 0) { Write-Stop "preflight failed (exit $pfCode). See 01-gates\preflight.err" }

# ---- gate 2: prove the ledger is a valid prefix ---------------------------
$ledOut = Join-Path $run '01-gates\ledger.out'
$ledErr = Join-Path $run '01-gates\ledger.err'
$ledSql = "select version || '|' || coalesce(statements[1],'<null>') from supabase_migrations.schema_migrations order by version;"
$ledCode = Invoke-Psql -Arguments ($common + @('-t', '-A', '-c', $ledSql)) -StdOutPath $ledOut -StdErrPath $ledErr

$ledger = @{}
if ($ledCode -eq 0) {
  foreach ($line in ([System.IO.File]::ReadAllText($ledOut) -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line.Split('|')
    if ($parts.Count -ge 2) { $ledger[$parts[0]] = $parts[1] }
  }
} elseif ((Get-ChildItem $ledErr -ErrorAction SilentlyContinue) -and
          ([System.IO.File]::ReadAllText($ledErr) -notmatch 'does not exist')) {
  Write-Stop "could not read the migration ledger (exit $ledCode). See 01-gates\ledger.err"
}

$startIndex  = 1
$missingSeen = $false
foreach ($e in $entries) {
  if ($ledger.ContainsKey($e.version)) {
    if ($missingSeen) {
      Write-Stop ("ledger gap: {0} is recorded but an earlier version is missing. No resume." -f $e.version)
    }
    $want = 'sha256:' + $e.normalizedSha256
    if ($ledger[$e.version] -ne $want) {
      Write-Stop ("ledger identity mismatch for {0}: stored '{1}', manifest expects '{2}'. No resume." -f $e.version, $ledger[$e.version], $want)
    }
    $startIndex = $e.index + 1
  } else {
    $missingSeen = $true
  }
}
$applied = 0
foreach ($v in $ledger.Keys) {
  if (-not ($entries | Where-Object { $_.version -eq $v })) {
    Write-Stop "ledger contains unexpected version $v. No resume."
  }
}
if ($startIndex -gt 1) {
  Write-Host "Ledger verified as a prefix: resuming at index $startIndex (proof-based, not assumed)." -ForegroundColor Yellow
}

# ---- gate 3: execute -------------------------------------------------------
foreach ($e in $entries) {
  if ($e.index -lt $startIndex) { continue }

  $label  = '{0:D3}-{1}' -f $e.index, $e.version
  $sqlAbs = Join-Path $genDir ('{0:D3}_{1}.sql' -f $e.index, $e.version)
  $out    = Join-Path $migDir "$label.out"
  $err    = Join-Path $migDir "$label.err"
  $receiptPath = Join-Path $migDir "$label.json"

  $receipt = [ordered]@{
    index = $e.index; version = $e.version; mode = $e.mode
    sqlPath = $e.sqlPath; wrapper = ('generated/{0:D3}_{1}.sql' -f $e.index, $e.version)
    normalizedSha256 = $e.normalizedSha256; normalisation = $e.normalisation
    startedUtc = (Get-Date).ToUniversalTime().ToString('o')
    exitCode = $null; status = 'STARTED'; readback = 'NOT CHECKED'
  }

  try {
    if (-not (Test-Path $sqlAbs)) {
      $receipt.status = 'FAIL'; $receipt.exitCode = 901
      Write-Utf8NoBom -Path $receiptPath -Text ($receipt | ConvertTo-Json)
      Write-Stop "missing wrapper for index $($e.index)"
    }

    $actualSha = Get-NormalizedSha256 -Path $sqlAbs
    Write-Host ("[{0:D3}/111] {1} ({2})" -f $e.index, $e.version, $e.mode)
    $code = Invoke-Psql -Arguments ($common + @('-f', $sqlAbs)) -StdOutPath $out -StdErrPath $err
    $receipt.exitCode = $code

    if ($code -ne 0) {
      $receipt.status = 'FAIL'
      Write-Utf8NoBom -Path $receiptPath -Text ($receipt | ConvertTo-Json)
      Write-Stop ("migration {0} failed (exit {1}). Wrapper transaction rolled back; ledger unchanged." -f $e.version, $code)
    }

    # read-back: identity must be present in the ledger, exactly
    $rbOut = Join-Path $migDir "$label.readback.out"
    $rbErr = Join-Path $migDir "$label.readback.err"
    $rbSql = "select coalesce(statements[1],'<null>') from supabase_migrations.schema_migrations where version = '$($e.version)';"
    $rbCode = Invoke-Psql -Arguments ($common + @('-t', '-A', '-c', $rbSql)) -StdOutPath $rbOut -StdErrPath $rbErr
    $rbVal = if (Test-Path $rbOut) { ([System.IO.File]::ReadAllText($rbOut)).Trim() } else { '' }
    $want = 'sha256:' + $e.normalizedSha256
    if ($rbCode -ne 0 -or $rbVal -ne $want) {
      $receipt.status = 'FAIL'; $receipt.readback = "expected $want got '$rbVal'"
      Write-Utf8NoBom -Path $receiptPath -Text ($receipt | ConvertTo-Json)
      Write-Stop ("ledger read-back failed for {0}: expected {1}, got '{2}'" -f $e.version, $want, $rbVal)
    }
    $receipt.readback = 'MATCH'
    $receipt.status = 'PASS'
    $receipt.finishedUtc = (Get-Date).ToUniversalTime().ToString('o')
    Write-Utf8NoBom -Path $receiptPath -Text ($receipt | ConvertTo-Json)
    $applied++
  }
  catch {
    $receipt.status = 'FAIL'
    $receipt.error = Protect-Text ($_.Exception.Message)
    Write-Utf8NoBom -Path $receiptPath -Text ($receipt | ConvertTo-Json)
    Write-Stop ("runner exception at index {0}: {1}" -f $e.index, $_.Exception.Message)
  }
}

# ---- gate 4: postflight ----------------------------------------------------
$vfOut = Join-Path $run '05-postverify\verify.out'
$vfErr = Join-Path $run '05-postverify\verify.err'
$vfCode = Invoke-Psql -Arguments ($common + @('-f', (Join-Path $cloudRoot 'verify\90_verify.sql'))) -StdOutPath $vfOut -StdErrPath $vfErr
if ($vfCode -ne 0) { Write-Stop "postflight verification failed (exit $vfCode). See 05-postverify\verify.err" }

$stOut = Join-Path $run '05-postverify\storage.out'
$stErr = Join-Path $run '05-postverify\storage.err'
$stCode = Invoke-Psql -Arguments ($common + @('-f', (Join-Path $cloudRoot 'verify\95_storage_config.sql'))) -StdOutPath $stOut -StdErrPath $stErr
if ($stCode -ne 0) { Write-Stop "storage verification failed (exit $stCode). See 05-postverify\storage.err" }

Write-Host ''
Write-Host "COMPLETE: $applied wrapper(s) applied this run; postflight and storage gates passed." -ForegroundColor Green
Write-Host "Evidence: $run"
exit 0
