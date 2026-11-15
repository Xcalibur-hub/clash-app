#Requires -Version 5.1
<#
  clash-native.ps1 - native-process adapter + evidence writer for the CLASH
  cloud deployment package. Dot-source it; do not run it.

  WHY THIS FILE EXISTS (Round 2 audit, critical finding F2)
  --------------------------------------------------------
  PowerShell 5.1 turns a native command's stderr into a terminating error
  record when $ErrorActionPreference = 'Stop'. The construct

      $out = & $Psql @Arguments 2>$errFile
      $code = $LASTEXITCODE

  therefore raises NativeCommandError *before* the exit code is captured, and
  the captured logs can stay empty. It also conflates two different things:
  PostgreSQL NOTICE/WARNING text arrives on stderr while the command succeeds.

  This adapter never lets PowerShell interpret a child process:

    * the child is started through System.Diagnostics.Process directly
    * stdout and stderr are drained asynchronously into MEMORY
    * the exit code is read from Process.ExitCode after the process exits
    * stderr content is data, never a failure signal
    * nothing is written to disk until the text has been sanitised
    * $LASTEXITCODE is neither used nor depended on anywhere in this package

  PowerShell CAN still throw around the adapter (Process.Start, IO). Those
  exceptions are converted into a result record with exitCode = $null and a
  launchError string, so a caller never mistakes "did not run" for "succeeded".

  Consumers must treat exitCode = $null, timedOut = $true, or a non-empty
  launchError as UNKNOWN, never as success and never as rollback.
#>

Set-StrictMode -Version 2.0

$script:ClashAdapterId      = 'clash-native-adapter'
$script:ClashAdapterVersion = '3.0.0'

# --------------------------------------------------------------- hashing ----
function Get-TextSha256 {
  param([string]$Text)
  if ($null -eq $Text) { $Text = '' }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $h = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text)) }
  finally { if ($sha) { $sha.Dispose() } }
  return (-join ($h | ForEach-Object { $_.ToString('x2') }))
}

function Get-NormalizedSha256 {
  param([string]$Path)
  $text = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($Path))
  if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
  $text = $text.Replace("`r`n", "`n")
  return (Get-TextSha256 -Text $text)
}

# ----------------------------------------------------------- sanitisation ---
# Applied at the single boundary where text becomes an artefact. Never write
# first and redact afterwards: the raw bytes would already be on disk.
function Protect-Text {
  param([string]$Text)
  if ($null -eq $Text) { return '' }
  $t = $Text
  if ($env:PGPASSWORD) { $t = $t.Replace($env:PGPASSWORD, '[REDACTED]') }
  $t = [regex]::Replace($t, 'postgres(ql)?://[^\s"''<>]+', 'postgresql://[REDACTED]')
  $t = [regex]::Replace($t, '(?i)\b(password|pgpassword|passwd|pwd)\b\s*[:=]\s*\S+', '$1=[REDACTED]')
  $t = [regex]::Replace($t, ':[^:@\s/]+@[A-Za-z0-9\.\-]', ':[REDACTED]@$1')
  $t = [regex]::Replace($t, 'eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-\.]{8,}', '[REDACTED-JWT]')
  $t = [regex]::Replace($t, '\bsbp_[A-Za-z0-9]{16,}', '[REDACTED-TOKEN]')
  $t = [regex]::Replace($t, '\bsb_secret_[A-Za-z0-9_\-]{8,}', '[REDACTED-TOKEN]')
  return $t
}

# ------------------------------------------------- argument construction ----
# Windows command-line quoting (Microsoft C runtime rules), because .NET
# Framework has no ProcessStartInfo.ArgumentList.
function ConvertTo-ArgumentString {
  param([string[]]$Arguments)
  $sb = New-Object System.Text.StringBuilder
  foreach ($a in @($Arguments)) {
    $arg = if ($null -eq $a) { '' } else { [string]$a }
    if ($sb.Length -gt 0) { [void]$sb.Append(' ') }
    if ($arg.Length -gt 0 -and $arg -notmatch '[\s"]') { [void]$sb.Append($arg); continue }
    [void]$sb.Append('"')
    $i = 0
    while ($i -lt $arg.Length) {
      if ($arg[$i] -eq '\') {
        $n = 0
        while ($i -lt $arg.Length -and $arg[$i] -eq '\') { $n++; $i++ }
        if ($i -ge $arg.Length) { [void]$sb.Append(('\' * ($n * 2))) }
        elseif ($arg[$i] -eq '"') { [void]$sb.Append(('\' * ($n * 2 + 1))); [void]$sb.Append('"'); $i++ }
        else { [void]$sb.Append(('\' * $n)) }
      }
      elseif ($arg[$i] -eq '"') { [void]$sb.Append('\"'); $i++ }
      else { [void]$sb.Append($arg[$i]); $i++ }
    }
    [void]$sb.Append('"')
  }
  return $sb.ToString()
}

# Credentials must never reach a command line: argv is visible to every process
# on the host and is copied into crash reports and audit logs.
function Assert-NoCredentialInArguments {
  param([string[]]$Arguments)
  $joined = (@($Arguments) -join ' ')
  if ($env:PGPASSWORD -and $joined.Contains($env:PGPASSWORD)) {
    throw 'SECURITY: an argument contains the live PGPASSWORD value. Refusing to spawn.'
  }
  if ($joined -match '(?i)\b(pg)?password\s*=') {
    throw 'SECURITY: an argument carries a password assignment. Use the child environment.'
  }
  if ($joined -match 'postgres(ql)?://[^/\s]*:[^/\s@]+@') {
    throw 'SECURITY: an argument carries a connection URL with an embedded password.'
  }
}

# ---------------------------------------------------------------- adapter ---
function Invoke-NativeProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [hashtable]$Environment = @{},
    [int]$TimeoutSeconds = 0
  )

  Assert-NoCredentialInArguments -Arguments $Arguments

  $sw   = [System.Diagnostics.Stopwatch]::StartNew()
  $res  = [ordered]@{
    filePath     = (Split-Path -Leaf $FilePath)
    argumentCount = @($Arguments).Count
    exitCode     = $null
    timedOut     = $false
    launchError  = $null
    captureNote  = ''
    stdOut       = ''
    stdErr       = ''
    startedUtc   = (Get-Date).ToUniversalTime().ToString('o')
    finishedUtc  = $null
    durationMs   = 0
  }

  $proc = $null; $outTask = $null; $errTask = $null
  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName               = $FilePath
    $psi.Arguments              = (ConvertTo-ArgumentString -Arguments @($Arguments))
    $psi.UseShellExecute        = $false      # no shell: no PowerShell error records
    $psi.CreateNoWindow         = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.WorkingDirectory       = $env:TEMP
    foreach ($k in @($Environment.Keys)) {
      $psi.EnvironmentVariables[[string]$k] = [string]$Environment[$k]
    }

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    $sw.Start()
    if (-not $proc.Start()) {
      $res.launchError = 'Process.Start returned false'
    }
    else {
      $outTask = $proc.StandardOutput.ReadToEndAsync()
      $errTask = $proc.StandardError.ReadToEndAsync()

      if ($TimeoutSeconds -gt 0) {
        if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
          $res.timedOut = $true
          try { $proc.Kill() } catch { }
          [void]$proc.WaitForExit(10000)
        }
      }
      else {
        $proc.WaitForExit()
      }
      try { $proc.WaitForExit() } catch { }   # flush async stream handlers

      if ($null -ne $outTask -and $outTask.Wait(10000) -and $outTask.IsCompleted) { $res.stdOut = [string]$outTask.Result }
      else { $res.captureNote = 'stdout capture incomplete' }
      if ($null -ne $errTask -and $errTask.Wait(10000) -and $errTask.IsCompleted) { $res.stdErr = [string]$errTask.Result }
      else { $res.captureNote = ($res.captureNote + ' stderr capture incomplete').Trim() }

      if (-not $res.timedOut) {
        try { $res.exitCode = [int]$proc.ExitCode }
        catch { $res.launchError = 'ExitCode unavailable after exit: ' + (Protect-Text $_.Exception.Message) }
      }
    }
  }
  catch {
    if ($null -eq $res.exitCode) { $res.launchError = Protect-Text $_.Exception.Message }
  }
  finally {
    if ($null -ne $proc) { try { $proc.Dispose() } catch { } }
    $sw.Stop()
    $res.durationMs  = [int]$sw.ElapsedMilliseconds
    $res.finishedUtc = (Get-Date).ToUniversalTime().ToString('o')
  }

  # sanitise while still in memory; the caller may write these strings later
  $res.stdOut = Protect-Text $res.stdOut
  $res.stdErr = Protect-Text $res.stdErr
  return $res
}

# A result that says, unambiguously, that nothing ran. Used when an optional
# helper (git) is absent: the caller records NOT-RUN instead of crashing, and
# Test-NativeSuccess still returns false.
function New-NotRunResult {
  param([string]$Reason = 'not run')
  return [ordered]@{
    filePath      = '<none>'
    argumentCount = 0
    exitCode      = $null
    timedOut      = $false
    launchError   = (Protect-Text $Reason)
    captureNote   = ''
    stdOut        = ''
    stdErr        = ''
    startedUtc    = (Get-Date).ToUniversalTime().ToString('o')
    finishedUtc   = (Get-Date).ToUniversalTime().ToString('o')
    durationMs    = 0
  }
}

# True only when the child definitely ran, definitely finished, and returned 0.
# Everything else - launch failure, timeout, missing exit code - is UNKNOWN.
function Test-NativeSuccess {
  param($Result)
  if ($null -eq $Result) { return $false }
  if ($Result.launchError) { return $false }
  if ($Result.timedOut) { return $false }
  if ($null -eq $Result.exitCode) { return $false }
  return ([int]$Result.exitCode -eq 0)
}

function Get-NativeOutcomeLabel {
  param($Result)
  if ($null -eq $Result) { return 'UNKNOWN' }
  if ($Result.launchError) { return 'UNKNOWN-NOT-RUN' }
  if ($Result.timedOut) { return 'UNKNOWN-TIMEOUT' }
  if ($null -eq $Result.exitCode) { return 'UNKNOWN-NO-EXIT-CODE' }
  if ([int]$Result.exitCode -eq 0) { return 'SUCCEEDED' }
  return 'FAILED-EXIT'
}

function Format-NativeSummary {
  param($Result)
  if ($null -eq $Result) { return 'native=<null>' }
  return ('native exit={0} timedOut={1} durationMs={2} stderrChars={3}' -f `
      $(if ($null -eq $Result.exitCode) { '<null>' } else { $Result.exitCode }),
      $Result.timedOut, $Result.durationMs, $Result.stdErr.Length)
}

function Get-NativeErrorExcerpt {
  param($Result, [int]$MaxChars = 900)
  if ($null -eq $Result) { return '' }
  $t = $Result.stdErr
  if ([string]::IsNullOrWhiteSpace($t)) { $t = $Result.stdOut }
  $t = $t.Trim()
  if ($t.Length -gt $MaxChars) { $t = '...' + $t.Substring($t.Length - $MaxChars) }
  return (Protect-Text $t)
}

# ---------------------------------------------------------------- evidence --
# Exclusive, immutable creation. FileMode::CreateNew fails when the path exists,
# so no artefact is ever silently overwritten. Text is sanitised BEFORE it is
# encoded, so raw secrets never reach the disk.
function Write-Evidence {
  param([Parameter(Mandatory = $true)][string]$Path, [string]$Text = '')

  $clean = Protect-Text $Text
  $dir   = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $enc   = New-Object System.Text.UTF8Encoding($false)
  $bytes = $enc.GetBytes($clean)
  $fs    = $null
  try {
    $fs = New-Object System.IO.FileStream -ArgumentList @(
      $Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
    $fs.Write($bytes, 0, $bytes.Length)
    $fs.Flush()
  }
  finally { if ($null -ne $fs) { $fs.Dispose() } }
  return (Get-TextSha256 -Text $clean)
}

function Write-EvidenceJson {
  param([Parameter(Mandatory = $true)][string]$Path, $Object)
  return (Write-Evidence -Path $Path -Text ($Object | ConvertTo-Json -Depth 8))
}

# A receipt is one immutable JSON file plus one line on the terminal. Each
# receipt carries the hash of the previous one, so the chain is tamper-evident
# and a missing or reordered entry is visible.
function Add-Receipt {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Name,
    [hashtable]$Fields = @{},
    [string]$PrevSha = ''
  )
  $obj = [ordered]@{
    receipt          = $Name
    utc              = (Get-Date).ToUniversalTime().ToString('o')
    adapter          = "$($script:ClashAdapterId)/$($script:ClashAdapterVersion)"
    prevReceiptSha   = $(if ($PrevSha) { $PrevSha } else { 'GENESIS' })
  }
  foreach ($k in @($Fields.Keys)) { $obj[$k] = $Fields[$k] }

  $path = Join-Path $Root $Name
  $sha  = Write-EvidenceJson -Path $path -Object $obj
  $line = ('RECEIPT {0} sha256={1} status={2}' -f $Name, $sha, $(if ($Fields.ContainsKey('status')) { $Fields.status } else { '-' }))
  Write-Host $line
  return $sha
}

# Final seal over every artefact of the run, chain-hashed in path order.
function Seal-Evidence {
  param([Parameter(Mandatory = $true)][string]$Root, [string]$SealName = 'EVIDENCE-MANIFEST.json')

  $files = @(Get-ChildItem -LiteralPath $Root -Recurse -File |
      Where-Object { $_.Name -ne $SealName } |
      Sort-Object FullName)
  $rows = @()
  $chain = 'GENESIS'
  foreach ($f in $files) {
    $rel  = $f.FullName.Substring($Root.Length).TrimStart('\', '/')
    $h    = Get-NormalizedSha256 -Path $f.FullName
    $item = [ordered]@{ path = $rel; bytes = $f.Length; sha256 = $h; chain = (Get-TextSha256 -Text ($chain + '|' + $rel + '|' + $h)) }
    $chain = $item.chain
    $rows += $item
  }
  $seal = [ordered]@{
    sealedUtc      = (Get-Date).ToUniversalTime().ToString('o')
    adapter        = "$($script:ClashAdapterId)/$($script:ClashAdapterVersion)"
    fileCount      = $rows.Count
    chainHead      = $chain
    files          = $rows
  }
  $sha = Write-EvidenceJson -Path (Join-Path $Root $SealName) -Object $seal
  Write-Host ("SEAL {0} files={1} sha256={2}" -f $SealName, $rows.Count, $sha)
  return [ordered]@{ sha256 = $sha; fileCount = $rows.Count; chainHead = $chain }
}

# ------------------------------------------------------- connection policy --
# Project identity and transport security are enforced, not defaulted.
function Resolve-ExecutionPolicy {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRef,
    [string]$PgHost,
    [int]$PgPort = 5432,
    [string]$PgUser = 'postgres',
    [string]$PgDatabase = 'postgres',
    [string]$CaCert = ''
  )
  if ($ProjectRef -notmatch '^[a-z0-9]{20}$') {
    throw ("ProjectRef '{0}' is not a 20-character Supabase project ref." -f $ProjectRef)
  }
  $direct = ('db.{0}.supabase.co' -f $ProjectRef)
  $pooler = ('^aws-[0-9]+-[a-z0-9]+-[a-z0-9]+\.pooler\.supabase\.com$')

  $mode = ''
  if ([string]::IsNullOrWhiteSpace($PgHost)) { $PgHost = $direct }
  if ($PgHost -eq $direct) {
    $mode = 'direct'
    if ($PgPort -ne 5432) { throw ("Direct host {0} requires port 5432, not {1}." -f $PgHost, $PgPort) }
  }
  elseif ($PgHost -match $pooler) {
    $mode = 'pooler'
    if ($PgPort -ne 6543) { throw ("Pooler host {0} requires port 6543, not {1}." -f $PgHost, $PgPort) }
    $wantUser = 'postgres.' + $ProjectRef
    if ($PgUser -ne $wantUser) { throw ("Pooler user must be '{0}' for project '{1}', not '{2}'." -f $wantUser, $ProjectRef, $PgUser) }
  }
  else {
    throw ("Host '{0}' is not permitted for project '{1}'. Allowed: {2} or *.pooler.supabase.com." -f $PgHost, $ProjectRef, $direct)
  }
  if ($PgDatabase -ne 'postgres') { throw ("Database must be 'postgres', not '{0}'." -f $PgDatabase) }

  foreach ($v in @('PGHOSTADDR', 'PGSERVICE', 'PGOPTIONS')) {
    $val = [Environment]::GetEnvironmentVariable($v)
    if (-not [string]::IsNullOrWhiteSpace($val)) {
      throw ("{0} is set; it can redirect or alter the connection behind the approved host name. Clear it and retry." -f $v)
    }
  }

  $ca = $CaCert
  if ([string]::IsNullOrWhiteSpace($ca)) { $ca = $env:PGSSLROOTCERT }
  if ([string]::IsNullOrWhiteSpace($ca)) {
    throw 'A CA certificate is required for verify-full TLS. Pass -CaCert or set PGSSLROOTCERT (Supabase: prod-ca-2021.crt).'
  }
  if (-not (Test-Path -LiteralPath $ca)) { throw ("CA certificate not found: {0}" -f $ca) }
  $caSha = Get-NormalizedSha256 -Path $ca

  if (-not $env:PGPASSWORD -and -not $env:PGPASSFILE) {
    throw 'No credential available: set PGPASSWORD or PGPASSFILE. Credentials are never passed as arguments.'
  }

  $prevSsl = [Environment]::GetEnvironmentVariable('PGSSLMODE')
  $envMap = @{
    PGHOST            = $PgHost
    PGPORT            = [string]$PgPort
    PGUSER            = $PgUser
    PGDATABASE        = $PgDatabase
    PGSSLMODE         = 'verify-full'
    PGSSLROOTCERT     = (Resolve-Path -LiteralPath $ca).Path
    PGAPPNAME         = 'clash-cloud-deploy'
    PGCONNECT_TIMEOUT = '15'
    PGCLIENTENCODING  = 'UTF8'
  }
  if ($env:PGPASSWORD) { $envMap['PGPASSWORD'] = $env:PGPASSWORD }
  if ($env:PGPASSFILE) { $envMap['PGPASSFILE'] = $env:PGPASSFILE }

  return [ordered]@{
    projectRef     = $ProjectRef
    mode           = $mode
    host           = $PgHost
    port           = $PgPort
    user           = $PgUser
    database       = $PgDatabase
    sslMode        = 'verify-full'
    sslModeOverrode = $(if ($prevSsl -and $prevSsl -ne 'verify-full') { $prevSsl } else { '' })
    caCertSha256   = $caSha
    env            = $envMap
  }
}

# ------------------------------------------------------ adapter self-test ---
# The adapter's own runtime behaviour cannot be proven by static analysis; it is
# proven by tools/test-native-capture.ps1 on the declared runtime, whose receipt
# is bound to this file's hash. deploy.ps1 refuses without a matching receipt.
function Assert-AdapterSelfTest {
  param(
    [Parameter(Mandatory = $true)][string]$ReceiptPath,
    [Parameter(Mandatory = $true)][string]$AdapterPath
  )
  if (-not (Test-Path -LiteralPath $ReceiptPath)) {
    throw ("Adapter self-test receipt not found: {0}. Run tools\test-native-capture.ps1 first." -f $ReceiptPath)
  }
  $raw = [System.IO.File]::ReadAllText($ReceiptPath)
  $doc = $raw | ConvertFrom-Json
  $expect = Get-NormalizedSha256 -Path $AdapterPath

  if ($doc.adapterSha256 -ne $expect) {
    throw ("Adapter self-test receipt is bound to adapter sha256 {0} but this adapter is {1}. Re-run the self-test." -f $doc.adapterSha256, $expect)
  }
  if ([string]$doc.adapterVersion -ne "$($script:ClashAdapterVersion)") {
    throw ("Adapter self-test receipt is for adapter version '{0}', this is '{1}'." -f $doc.adapterVersion, $script:ClashAdapterVersion)
  }
  $psv = [string]$doc.powerShellVersion
  if ($psv -notmatch '^5\.1\.') {
    throw ("Adapter self-test ran on PowerShell '{0}'; the declared runtime is 5.1." -f $psv)
  }
  if ($doc.verdict -ne 'PASS') { throw ("Adapter self-test verdict is '{0}', not PASS." -f $doc.verdict) }
  if (-not $doc.PSObject.Properties['cases'] -or $null -eq $doc.cases) {
    throw 'Adapter self-test receipt carries no cases.'
  }
  foreach ($case in @('zeroExitWithStderr', 'nonZeroExit', 'silentSuccess', 'stderrIsDataNotFailure')) {
    if (-not $doc.cases.PSObject.Properties[$case]) { throw ("Adapter self-test receipt is missing case '{0}'." -f $case) }
    if ($doc.cases.$case.passed -ne $true) { throw ("Adapter self-test case '{0}' did not pass." -f $case) }
  }
  return [ordered]@{
    receiptPath    = (Resolve-Path -LiteralPath $ReceiptPath).Path
    receiptSha256  = Get-NormalizedSha256 -Path $ReceiptPath
    adapterSha256  = $expect
    powerShell     = $psv
    ranUtc         = [string]$doc.utc
  }
}

function Get-ClashAdapterIdentity {
  return [ordered]@{ id = $script:ClashAdapterId; version = $script:ClashAdapterVersion }
}
