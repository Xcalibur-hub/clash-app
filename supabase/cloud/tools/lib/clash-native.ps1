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
$script:ClashAdapterVersion = '4.0.0'

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

# Guarantees a receipt exists even when the run's evidence directory is not
# writable. Order: the run directory, then a per-machine fallback directory under
# TEMP, then console-only. The outcome is returned and always announced on the
# terminal, so "the receipt failed" can never be mistaken for "nothing happened".
function Write-EvidenceOrFallback {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Text = '',
    [string]$Label = 'receipt'
  )
  $attempts = @()
  try {
    $sha = Write-Evidence -Path $Path -Text $Text
    return [ordered]@{ ok = $true; path = $Path; sha256 = $sha; fallback = $false; attempts = @() }
  }
  catch { $attempts += ('{0} : {1}' -f $Path, (Protect-Text $_.Exception.Message)) }

  $fbDir = Join-Path $env:TEMP 'clash-evidence-fallback'
  try {
    if (-not (Test-Path -LiteralPath $fbDir)) { New-Item -ItemType Directory -Path $fbDir -Force | Out-Null }
    $fb = Join-Path $fbDir ('{0}-{1}.json' -f (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ'), $Label)
    $shaFb = Write-Evidence -Path $fb -Text $Text
    Write-Host ('RECEIPT FALLBACK {0} -> {1}' -f $Label, $fb) -ForegroundColor Yellow
    return [ordered]@{ ok = $true; path = $fb; sha256 = $shaFb; fallback = $true; attempts = @($attempts) }
  }
  catch { $attempts += ('fallback : {0}' -f (Protect-Text $_.Exception.Message)) }

  Write-Host ('NO RECEIPT POSSIBLE for {0}: {1}' -f $Label, ($attempts -join ' | ')) -ForegroundColor Red
  return [ordered]@{ ok = $false; path = $null; sha256 = $null; fallback = $false; attempts = @($attempts) }
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
  $res  = Write-EvidenceOrFallback -Path $path -Text ($obj | ConvertTo-Json -Depth 8) -Label $Name
  $status = $(if ($Fields.ContainsKey('status')) { $Fields.status } else { '-' })
  $line = ('TERMINAL RECEIPT {0} status={1} sha256={2} path={3} fallback={4}' -f `
      $Name, $status, $(if ($res.sha256) { $res.sha256 } else { '<none>' }), $(if ($res.path) { $res.path } else { '<none>' }), $res.fallback)
  Write-Host $line
  if ($res.sha256) { return $res.sha256 }
  return ''
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

# ------------------------------------------------------ self-test inventory ---
# The complete set of cases tools/test-native-capture.ps1 must execute. The
# harness checks that it ran exactly these, and the gate checks that the receipt
# records exactly these. A dropped case can therefore never look like a pass.
$script:ClashSelfTestRequiredCases = @(
  'zeroExitWithStderr',
  'nonZeroExit',
  'silentSuccess',
  'stderrIsDataNotFailure',
  'launchFailureIsUnknown',
  'timeoutIsUnknown',
  'refusesCredentialArguments',
  'sanitiserRedacts',
  'evidenceNeverOverwrites',
  'receiptFallsBackWhenPathUnwritable',
  'legacyPatternRaisesNativeCommandError',
  'legacyPatternLosesExitCode',
  'adapterSurvivesSameChild',
  'differentialProven',
  'unexpectedExceptionCannotPass',
  'droppedCaseFailsInventory',
  'nullDetailIsRecordedNotCrashed',
  'validatorRejectsTamperedReceipt'
)

function Get-ClashSelfTestInventory {
  return ,@($script:ClashSelfTestRequiredCases)
}

# StrictMode 2.0 turns a missing property into a terminating error, and a
# receipt is untrusted input, so every read goes through this.
function Get-DocumentProperty {
  param($Object, [string]$Name, $Default = $null)
  if ($null -eq $Object) { return $Default }
  if ($Object -is [System.Collections.IDictionary]) {
    if ($Object.Contains($Name)) { return $Object[$Name] }
    return $Default
  }
  $p = $Object.PSObject.Properties[$Name]
  if ($null -eq $p) { return $Default }
  return $p.Value
}

function Get-CaseNames {
  param($Cases)
  if ($null -eq $Cases) { return @() }
  if ($Cases -is [System.Collections.IDictionary]) { return @($Cases.Keys) }
  return @($Cases.PSObject.Properties | ForEach-Object { $_.Name })
}

function Get-CaseEntry {
  param($Cases, [string]$Name)
  if ($null -eq $Cases) { return $null }
  if ($Cases -is [System.Collections.IDictionary]) {
    if ($Cases.Contains($Name)) { return $Cases[$Name] }
    return $null
  }
  $p = $Cases.PSObject.Properties[$Name]
  if ($null -eq $p) { return $null }
  return $p.Value
}

# ------------------------------------------------------ adapter self-test ---
# The adapter's own runtime behaviour cannot be proven by static analysis; it is
# proven by tools/test-native-capture.ps1 on the declared runtime, whose receipt
# is bound to this file's hash. deploy.ps1 refuses without a matching receipt.
# Validates a self-test receipt against the inventory and the adapter identity.
# Returns every problem it finds: the caller decides whether to throw. Used both
# by the gate (deploy.ps1, check-ledger.ps1) and, in memory, by the harness, so
# the acceptance rule has exactly one implementation.
function Test-SelfTestReceipt {
  param(
    $Document,
    [Parameter(Mandatory = $true)][string]$AdapterSha256
  )
  $problems = @()
  $required = @($script:ClashSelfTestRequiredCases)

  if ($null -eq $Document) {
    return [ordered]@{ ok = $false; problems = @('receipt is empty') }
  }

  $adapterId  = [string](Get-DocumentProperty -Object $Document -Name 'adapterId' -Default '')
  $adapterVer = [string](Get-DocumentProperty -Object $Document -Name 'adapterVersion' -Default '')
  $receiptSha = [string](Get-DocumentProperty -Object $Document -Name 'adapterSha256' -Default '')
  $verdict    = [string](Get-DocumentProperty -Object $Document -Name 'verdict' -Default '')
  $psv        = [string](Get-DocumentProperty -Object $Document -Name 'powerShellVersion' -Default '')
  $problemsRaw = Get-DocumentProperty -Object $Document -Name 'problems' -Default @()
  $executed   = Get-DocumentProperty -Object $Document -Name 'casesExecuted' -Default $null
  $cases      = Get-DocumentProperty -Object $Document -Name 'cases' -Default $null

  if ($adapterId -ne $script:ClashAdapterId) {
    $problems += ("adapterId '{0}' is not '{1}'" -f $adapterId, $script:ClashAdapterId)
  }
  if ($adapterVer -ne $script:ClashAdapterVersion) {
    $problems += ("adapterVersion '{0}' is not '{1}'" -f $adapterVer, $script:ClashAdapterVersion)
  }
  if ($receiptSha -ne $AdapterSha256) {
    $problems += ('receipt is bound to adapter sha256 {0}, this adapter is {1}' -f $receiptSha, $AdapterSha256)
  }
  if ($psv -notmatch '^5\.1\.') {
    $problems += ("receipt was produced on PowerShell '{0}'; the declared runtime is 5.1" -f $psv)
  }
  if ($verdict -ne 'PASS') {
    $problems += ("verdict is '{0}', not PASS" -f $verdict)
  }
  $problemsList = @()
  if ($null -ne $problemsRaw) { $problemsList = @($problemsRaw | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }) }
  if ($problemsList.Count -gt 0) {
    $problems += ('receipt lists {0} problem(s): {1}' -f $problemsList.Count, ($problemsList -join '; '))
  }

  $names = @(Get-CaseNames -Cases $cases)
  if ($names.Count -eq 0) {
    $problems += 'receipt records no cases'
  }
  else {
    $missing = @($required | Where-Object { $names -notcontains $_ })
    if ($missing.Count -gt 0) {
      $problems += ('receipt is missing {0} case(s): {1}' -f $missing.Count, ($missing -join ', '))
    }
    $unexpected = @($names | Where-Object { $required -notcontains $_ })
    if ($unexpected.Count -gt 0) {
      $problems += ('receipt records case(s) outside the inventory: {0}' -f ($unexpected -join ', '))
    }
    foreach ($name in $required) {
      $entry = Get-CaseEntry -Cases $cases -Name $name
      if ($null -eq $entry) { continue }
      $passed = Get-DocumentProperty -Object $entry -Name 'passed' -Default $null
      if ($passed -ne $true) { $problems += ("case '{0}' is not recorded as passed" -f $name) }
    }
    if ($names.Count -ne $required.Count) {
      $problems += ('receipt records {0} case(s), the inventory requires {1}' -f $names.Count, $required.Count)
    }
  }

  $executedInt = -1
  if ($null -eq $executed -or -not [int]::TryParse([string]$executed, [ref]$executedInt)) {
    $problems += 'receipt does not state how many cases were executed'
  }
  else {
    if ($executedInt -ne $required.Count) {
      $problems += ('receipt states {0} case(s) executed, the inventory requires {1}' -f $executedInt, $required.Count)
    }
    if ($executedInt -ne $names.Count) {
      $problems += ('receipt states {0} case(s) executed but records {1}' -f $executedInt, $names.Count)
    }
  }

  return [ordered]@{ ok = ($problems.Count -eq 0); problems = $problems }
}

function Assert-AdapterSelfTest {
  param(
    [Parameter(Mandatory = $true)][string]$ReceiptPath,
    [Parameter(Mandatory = $true)][string]$AdapterPath
  )
  if (-not (Test-Path -LiteralPath $ReceiptPath)) {
    throw ("Adapter self-test receipt not found: {0}. Run tools\test-native-capture.ps1 first." -f $ReceiptPath)
  }
  $raw = [System.IO.File]::ReadAllText($ReceiptPath)
  try { $doc = $raw | ConvertFrom-Json }
  catch { throw ("Adapter self-test receipt is not valid JSON: {0}" -f $ReceiptPath) }

  $expect = Get-NormalizedSha256 -Path $AdapterPath
  $verdict = Test-SelfTestReceipt -Document $doc -AdapterSha256 $expect
  if (-not $verdict.ok) {
    throw ('Adapter self-test receipt rejected: ' + (@($verdict.problems) -join ' | '))
  }
  return [ordered]@{
    receiptPath    = (Resolve-Path -LiteralPath $ReceiptPath).Path
    receiptSha256  = Get-NormalizedSha256 -Path $ReceiptPath
    adapterSha256  = $expect
    powerShell     = [string](Get-DocumentProperty -Object $doc -Name 'powerShellVersion' -Default '')
    casesExecuted  = [int](Get-DocumentProperty -Object $doc -Name 'casesExecuted' -Default 0)
    ranUtc         = [string](Get-DocumentProperty -Object $doc -Name 'utc' -Default '')
  }
}

function Get-ClashAdapterIdentity {
  return [ordered]@{ id = $script:ClashAdapterId; version = $script:ClashAdapterVersion }
}
