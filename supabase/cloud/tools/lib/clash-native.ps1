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
$script:ClashAdapterVersion = '4.2.0'

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

# True only when the child definitely ran, definitely finished, returned 0 and
# both streams were captured in full. Everything else - launch failure, timeout,
# missing exit code, incomplete capture - is UNKNOWN.
#
# Round 8: incomplete capture used to be recorded in captureNote and then
# ignored, so a truncated stdout could be parsed as a complete ledger listing.
function Test-NativeSuccess {
  param($Result)
  if ($null -eq $Result) { return $false }
  if ($Result.launchError) { return $false }
  if ($Result.timedOut) { return $false }
  if ($null -eq $Result.exitCode) { return $false }
  if (-not [string]::IsNullOrWhiteSpace([string]$Result.captureNote)) { return $false }
  return ([int]$Result.exitCode -eq 0)
}

# True only when the child ran to completion and both streams were fully
# captured. Callers that interpret captured TEXT require this, not just success.
function Test-NativeCaptureComplete {
  param($Result)
  if ($null -eq $Result) { return $false }
  if ($Result.launchError) { return $false }
  if ($Result.timedOut) { return $false }
  if ($null -eq $Result.exitCode) { return $false }
  return [string]::IsNullOrWhiteSpace([string]$Result.captureNote)
}

function Get-NativeOutcomeLabel {
  param($Result)
  if ($null -eq $Result) { return 'UNKNOWN' }
  if ($Result.launchError) { return 'UNKNOWN-NOT-RUN' }
  if ($Result.timedOut) { return 'UNKNOWN-TIMEOUT' }
  if ($null -eq $Result.exitCode) { return 'UNKNOWN-NO-EXIT-CODE' }
  if (-not [string]::IsNullOrWhiteSpace([string]$Result.captureNote)) { return 'UNKNOWN-CAPTURE-INCOMPLETE' }
  if ([int]$Result.exitCode -eq 0) { return 'SUCCEEDED' }
  return 'FAILED-EXIT'
}

# psql exit classes. 0 = the script completed; 2 = the connection was lost;
# 3 = script error with ON_ERROR_STOP; 1 and anything unexplained are not
# interpreted by this package. No message text is consulted.
function Get-PsqlExitClass {
  param($Result)
  if ($null -eq $Result) { return 'UNKNOWN' }
  if ($Result.launchError -or $Result.timedOut -or $null -eq $Result.exitCode) { return 'UNKNOWN' }
  if (-not [string]::IsNullOrWhiteSpace([string]$Result.captureNote)) { return 'UNKNOWN' }
  switch ([int]$Result.exitCode) {
    0 { return 'COMPLETED' }
    1 { return 'PSQL_FATAL' }
    2 { return 'CONNECTION_LOST' }
    3 { return 'SCRIPT_ERROR' }
    default { return 'OTHER_EXIT' }
  }
}

# A rollback is PROVEN only when psql reported a script error under
# ON_ERROR_STOP, so the COMMIT that ends the wrapper was never reached, and a
# fresh session then shows no row. Absence after a connection loss, a timeout or
# an unreadable probe proves nothing: the original backend may still commit.
function Test-RollbackProvable {
  param($Result, [bool]$ReadBackOk = $false, [bool]$RowAbsent = $false)
  if (-not $ReadBackOk) { return $false }
  if (-not $RowAbsent) { return $false }
  return ((Get-PsqlExitClass $Result) -eq 'SCRIPT_ERROR')
}

# SQLSTATE from a verbose psql error: 'ERROR:  42P01: ...' or 'SQLSTATE: 42P01'.
# Round 8: error text is never used to classify a database error.
function Get-PgSqlState {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return '' }
  $m = [regex]::Match($Text, 'ERROR:\s+([0-9A-Z]{5}):')
  if ($m.Success) { return $m.Groups[1].Value }
  $m = [regex]::Match($Text, 'SQLSTATE:\s*([0-9A-Z]{5})')
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

# Parses the ledger listing produced by:
#   select version || '|' || coalesce(statements[1],'<null>') from ... order by version;
#
# Round 9 (B1): the callers used to do `if ($parts.Count -ge 2) { $ledger[$k]=$v }`
# in a loop. Every other nonblank row was dropped without a trace - so a child that
# printed garbage, an extra field or a repeated version produced an empty or
# silently-shortened hashtable that the verdict then called EMPTY/PASS. This
# function is the only parser; it either returns a complete, unique, validated
# hashtable or it reports problems, and every caller must STOP on problems.
#
# Strictness contract:
#   * nonblank rows must have exactly two '|' fields
#   * the version must be 14 digits and must exist in the manifest
#   * the identity must be sha256:<64 lowercase hex>; '<null>' is a missing identity
#   * a repeated version is recorded, never overwritten
#   * blank lines (and the trailing newline psql always emits) are ignored
#   * when the table was reported absent, the listing must be empty
function ConvertFrom-ClashLedgerOutput {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text,
    [Parameter(Mandatory = $true)]$Entries,
    [bool]$TableAbsent = $false
  )

  $expected = @{}
  foreach ($e in @($Entries)) { $expected[[string]$e.version] = 'sha256:' + [string]$e.normalizedSha256 }

  $ledger     = @{}
  $problems   = New-Object System.Collections.Generic.List[string]
  $badFields  = New-Object System.Collections.Generic.List[string]
  $badVersions = New-Object System.Collections.Generic.List[string]
  $unknownVersions = New-Object System.Collections.Generic.List[string]
  $badTokens  = New-Object System.Collections.Generic.List[string]
  $duplicates = New-Object System.Collections.Generic.List[string]
  $rows = 0
  $lineNo = 0

  foreach ($raw in ($Text -split "`r?`n")) {
    $lineNo++
    if ([string]::IsNullOrWhiteSpace($raw)) { continue }
    $line = $raw.TrimEnd()
    $parts = $line.Split('|')
    if ($parts.Count -ne 2) {
      $problems.Add(('row {0}: expected 2 fields, found {1}: {2}' -f $lineNo, $parts.Count, (Protect-Text $line)))
      $badFields.Add($lineNo)
      continue
    }
    $version = $parts[0]
    $token   = $parts[1]
    if ($version -notmatch '^\d{14}$') {
      $problems.Add(('row {0}: version is not a 14-digit timestamp: {1}' -f $lineNo, (Protect-Text $version)))
      $badVersions.Add($lineNo)
      continue
    }
    if (-not $expected.ContainsKey($version)) {
      $problems.Add(('row {0}: version {1} is not in the manifest' -f $lineNo, $version))
      $unknownVersions.Add($version)
      continue
    }
    if ($token -eq '<null>' -or $token -notmatch '^sha256:[0-9a-f]{64}$') {
      $problems.Add(('row {0}: identity for {1} is missing or malformed' -f $lineNo, $version))
      $badTokens.Add($version)
      continue
    }
    if ($ledger.ContainsKey($version)) {
      $problems.Add(('row {0}: version {1} appears more than once' -f $lineNo, $version))
      $duplicates.Add($version)
      continue
    }
    $ledger[$version] = $token
    $rows++
  }

  if ($TableAbsent -and -not [string]::IsNullOrWhiteSpace($Text)) {
    $problems.Add('the ledger table was reported absent but the listing was not empty')
  }

  return [ordered]@{
    ok              = ($problems.Count -eq 0)
    rows            = $rows
    ledger          = $ledger
    problems        = @($problems)
    badFields       = @($badFields)
    badVersions     = @($badVersions)
    unknownVersions = @($unknownVersions)
    badTokens       = @($badTokens)
    duplicates      = @($duplicates)
    tableAbsent     = $TableAbsent
  }
}

# Receipt fields for check-ledger.ps1. Round 9 (B2): the ABSENT branch never
# assigned the ledger-query result, and the receipt then read it under StrictMode
# and crashed. The actual presence result is recorded instead, and the ledger
# query is explicitly marked 'not issued' rather than being invented.
function New-LedgerAuditFields {
  param(
    $PresenceResult = $null,
    $LedgerResult = $null,
    [string]$PresenceText = '',
    [bool]$TableAbsent = $false,
    $Parse = $null,
    $Check = $null
  )
  $native = $PresenceResult
  if ($null -ne $LedgerResult) { $native = $LedgerResult }
  return [ordered]@{
    presenceText  = [string]$PresenceText
    tableAbsent   = $TableAbsent
    ledgerQuery   = $(if ($null -ne $LedgerResult) { 'issued' } else { 'not issued: table absent' })
    nativeOutcome = (Get-NativeOutcomeLabel $native)
    exitCode      = $(if ($null -ne $native) { $native.exitCode } else { $null })
    presenceOutcome = (Get-NativeOutcomeLabel $PresenceResult)
    rowsParsed    = $(if ($null -ne $Parse) { $Parse.rows } else { 0 })
    parseOk       = $(if ($null -ne $Parse) { $Parse.ok } else { $false })
    parseProblems = $(if ($null -ne $Parse) { @($Parse.problems) } else { @() })
    verdict       = $(if ($null -ne $Check) { [string]$Check.verdict } else { 'UNREADABLE' })
    verdictDetail = $(if ($null -ne $Check) { [string]$Check.why } else { '' })
  }
}

# Ledger classification. A ledger is only meaningful as an exact chronological
# prefix: every recorded version carries the manifest identity, no version is
# recorded after a missing one, no unexpected version exists and no row is
# malformed.
#
# Round 8 (R1): the previous check-ledger.ps1 counted missing rows and could
# label a gapped ledger 'PREFIX', which reads like a resumable state.
function Get-LedgerVerdict {
  param(
    [Parameter(Mandatory = $true)]$Entries,
    [hashtable]$Ledger = @{},
    [bool]$TableAbsent = $false
  )
  $missing   = New-Object System.Collections.Generic.List[string]
  $mismatch  = New-Object System.Collections.Generic.List[string]
  $gaps      = New-Object System.Collections.Generic.List[string]
  $malformed = New-Object System.Collections.Generic.List[string]
  $seenMissing = $false
  $prefix = 0
  $total = 0
  foreach ($e in @($Entries)) {
    $total++
    $version = [string]$e.version
    $want = 'sha256:' + [string]$e.normalizedSha256
    if (-not $Ledger.ContainsKey($version)) {
      $seenMissing = $true
      [void]$missing.Add($version)
      continue
    }
    $stored = [string]$Ledger[$version]
    if ($stored -notmatch '^sha256:[0-9a-f]{64}$') { [void]$malformed.Add($version) }
    if ($stored -ne $want) { [void]$mismatch.Add($version) }
    if ($seenMissing) { [void]$gaps.Add($version) } else { $prefix++ }
  }
  $known = @{}
  foreach ($e in @($Entries)) { $known[[string]$e.version] = $true }
  $extra = New-Object System.Collections.Generic.List[string]
  foreach ($k in @($Ledger.Keys)) { if (-not $known.ContainsKey([string]$k)) { [void]$extra.Add([string]$k) } }

  $verdict = 'PROBLEM'
  $why = ''
  if ($malformed.Count -gt 0)     { $why = 'malformed ledger rows: ' + ($malformed -join ',') }
  elseif ($extra.Count -gt 0)     { $why = 'unexpected ledger versions: ' + ($extra -join ',') }
  elseif ($mismatch.Count -gt 0)  { $why = 'identity mismatch: ' + ($mismatch -join ',') }
  elseif ($gaps.Count -gt 0)      { $why = 'chronological gap: recorded after a missing version: ' + ($gaps -join ',') }
  elseif ($missing.Count -eq $total) {
    $verdict = 'EMPTY'
    $why = $(if ($TableAbsent) { 'ledger table absent; clean pre-deployment state' } else { 'no versions recorded; clean pre-deployment state' })
  }
  elseif ($missing.Count -eq 0) {
    $verdict = 'CONSISTENT'
    $why = 'all versions present with matching identities'
  }
  else {
    $verdict = 'PARTIAL_PREFIX'
    $why = ('{0} of {1} versions recorded as a strict prefix; this runner is fresh-only and will not resume' -f $prefix, $total)
  }

  return [ordered]@{
    verdict     = $verdict
    why         = $why
    rows        = $Ledger.Count
    prefix      = $prefix
    total       = $total
    missing     = @($missing)
    mismatch    = @($mismatch)
    gaps        = @($gaps)
    malformed   = @($malformed)
    extra       = @($extra)
    tableAbsent = $TableAbsent
  }
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
# Round 8 (R4): the fallback directory is injectable so the self-test can prove
# the both-destinations-failed path without touching the machine's TEMP root.
$script:ClashEvidenceFallbackDir = $null

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

  $fbDir = $script:ClashEvidenceFallbackDir
  if ([string]::IsNullOrWhiteSpace($fbDir)) { $fbDir = Join-Path $env:TEMP 'clash-evidence-fallback' }
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
  # Round 8 (R4): a receipt that cannot be written anywhere is a terminal
  # condition, not an empty hash. Returning '' let a caller chain a run whose
  # evidence does not exist and still print a success line.
  if (-not $res.ok) {
    throw ('receipt persistence failed for {0}: primary and fallback are both unwritable ({1}). The run must STOP.' -f `
        $Name, (@($res.attempts) -join ' | '))
  }
  return [string]$res.sha256
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
  'validatorRejectsTamperedReceipt',
  'ledgerGapIsProblem',
  'ledgerMalformedIsProblem',
  'receiptFailureStops',
  'connectionLossIsUnknown',
  'incompleteCaptureIsUnknown',
  'sqlStateExtracted',
  'ledgerParserRejectsMalformedOutput',
  'absentAndPresentBranchesRecordActualResult'
)

# Returns a FLAT sequence of case-name strings.
#
# Round 5 defect: this used to be 'return ,@(...)'. The unary comma emits a
# one-element wrapper whose element is the array, so a caller that captures the
# result a second time (another @(), a pipeline, a JSON round-trip) can end up
# holding a nested array: the harness then sees 1 inventory item instead of 18,
# rejects every legitimate case name, and can fail later while serialising.
# A flat array is the only shape this function may produce.
function Get-ClashSelfTestInventory {
  $flat = New-Object System.Collections.Generic.List[string]
  foreach ($name in $script:ClashSelfTestRequiredCases) { [void]$flat.Add([string]$name) }
  return $flat.ToArray()
}

# Validates an inventory: non-empty strings only, no nested collections, no
# duplicates, exact count, and nothing outside the declared list. Used by the
# harness before it spawns any child process, by the receipt validator, and by
# the offline tests.
function Assert-SelfTestInventory {
  param(
    $Names,
    [int]$ExpectedCount = 0
  )
  $problems = @()
  $declared = @($script:ClashSelfTestRequiredCases)
  if ($ExpectedCount -le 0) { $ExpectedCount = $declared.Count }

  $items = @($Names)
  if ($items.Count -eq 0) {
    return [ordered]@{ ok = $false; problems = @('inventory is empty'); count = 0; expected = $ExpectedCount }
  }

  for ($i = 0; $i -lt $items.Count; $i++) {
    $item = $items[$i]
    if ($null -eq $item) { $problems += ('entry {0} is null' -f $i); continue }
    if ($item -isnot [string] -and $item -is [System.Collections.IEnumerable]) {
      $problems += ('entry {0} is a nested {1}, not a case name' -f $i, $item.GetType().Name)
      continue
    }
    if ($item -is [System.Collections.IDictionary]) {
      $problems += ('entry {0} is a dictionary, not a case name' -f $i)
      continue
    }
    $text = [string]$item
    if ([string]::IsNullOrWhiteSpace($text)) { $problems += ('entry {0} is empty' -f $i); continue }
    if ($text -ne $text.Trim()) { $problems += ('entry {0} has surrounding whitespace' -f $i) }
  }

  $strings = @($items | Where-Object { $_ -is [string] } | ForEach-Object { [string]$_ })
  $dupes = @($strings | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
  if ($dupes.Count -gt 0) { $problems += ('duplicate case names: ' + ($dupes -join ', ')) }
  if ($strings.Count -ne $ExpectedCount) {
    $problems += ('inventory holds {0} usable name(s), expected {1}' -f $strings.Count, $ExpectedCount)
  }
  $unknown = @($strings | Where-Object { $declared -notcontains $_ })
  if ($unknown.Count -gt 0) { $problems += ('names outside the declared inventory: ' + ($unknown -join ', ')) }
  $missing = @($declared | Where-Object { $strings -notcontains $_ })
  if ($missing.Count -gt 0) { $problems += ('declared names absent from the inventory: ' + ($missing -join ', ')) }

  return [ordered]@{ ok = ($problems.Count -eq 0); problems = $problems; count = $strings.Count; expected = $ExpectedCount }
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

  # the declared inventory itself must be valid before it is used to judge a receipt
  $declaredCheck = Assert-SelfTestInventory -Names (Get-ClashSelfTestInventory)
  if (-not $declaredCheck.ok) {
    foreach ($p in @($declaredCheck.problems)) { $problems += ('declared inventory invalid: ' + $p) }
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
    $nameCheck = Assert-SelfTestInventory -Names $names -ExpectedCount $required.Count
    if (-not $nameCheck.ok) {
      foreach ($p in @($nameCheck.problems)) { $problems += ('receipt case names: ' + $p) }
    }
    foreach ($name in $required) {
      $entry = Get-CaseEntry -Cases $cases -Name $name
      if ($null -eq $entry) { continue }
      if ($entry -is [string] -or ($entry -is [System.Collections.IEnumerable] -and $entry -isnot [System.Collections.IDictionary])) {
        $problems += ("case '{0}' is not a record" -f $name)
      }
    }
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
