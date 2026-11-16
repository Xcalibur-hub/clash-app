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
$script:ClashAdapterVersion = '4.8.0'

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

# StrictMode 2.0 raises on a reference to a property that does not exist, so a
# truncated or hand-edited receipt would turn an inspection into an exception.
# Every read of parsed evidence goes through this accessor instead.
function Get-ClashProperty {
  param($Object, [Parameter(Mandatory = $true)][string]$Name, $Default = $null)
  if ($null -eq $Object) { return $Default }
  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop) { return $Default }
  if ($null -eq $prop.Value) { return $Default }
  return $prop.Value
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
#
# Round 16 (R15-C1): the seal is now published atomically (temp file, then a
# move that cannot overwrite) and the temporary name and the completion
# artefacts are excluded from the sealed set. The completion marker is NOT part
# of the seal - it binds the seal's hash instead, which is what keeps the two
# from depending on each other.
function Get-ClashSealExclusions {
  return @('EVIDENCE-MANIFEST.json', '06-complete.json', '06-complete-unverified.json')
}

function Seal-Evidence {
  param([Parameter(Mandatory = $true)][string]$Root, [string]$SealName = 'EVIDENCE-MANIFEST.json')

  $excluded = @(Get-ClashSealExclusions)
  $files = @(Get-ChildItem -LiteralPath $Root -Recurse -File |
      Where-Object { ($excluded -notcontains $_.Name) -and (-not $_.Name.EndsWith('.tmp')) } |
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
  # Publish atomically: the temp file is created exclusively, then moved onto the
  # final name with a move that fails if the final name already exists. A half
  # written manifest can therefore never appear under the sealed name, and an
  # existing manifest is never replaced.
  $target = Join-Path $Root $SealName
  $temp   = '{0}.{1}.tmp' -f $target, ([guid]::NewGuid().ToString('N').Substring(0, 12))
  [void](Write-EvidenceJson -Path $temp -Object $seal)
  [System.IO.File]::Move($temp, $target)
  # The reported hash is the one an independent verifier recomputes from disk,
  # not the hash of the in-memory string that produced the file.
  $sha = Get-NormalizedSha256 -Path $target
  Write-Host ("SEAL {0} files={1} sha256={2}" -f $SealName, $rows.Count, $sha)
  return [ordered]@{ sha256 = $sha; fileCount = $rows.Count; chainHead = $chain; path = $target }
}

# Re-derives a seal from the files on disk and compares it with the manifest that
# was published. This is the independent half of the finalization contract: the
# seal is only trusted when it still describes what is actually there.
function Test-EvidenceSeal {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$SealName = 'EVIDENCE-MANIFEST.json',
    [string[]]$Require = @()
  )

  $problems = New-Object System.Collections.Generic.List[string]
  $target = Join-Path $Root $SealName
  if (-not (Test-Path -LiteralPath $target)) {
    return [ordered]@{ ok = $false; problems = @("the seal $SealName is missing"); fileCount = 0; chainHead = ''; sha256 = '' }
  }
  if (Test-Path -LiteralPath $target -PathType Container) {
    return [ordered]@{ ok = $false; problems = @("the seal path $SealName is a directory, so no seal was published"); fileCount = 0; chainHead = ''; sha256 = '' }
  }
  $sha = ''
  try { $sha = Get-NormalizedSha256 -Path $target }
  catch {
    $problems.Add(('the seal {0} could not be read: {1}' -f $SealName, (Protect-Text $_.Exception.Message)))
    return [ordered]@{ ok = $false; problems = @($problems); fileCount = 0; chainHead = ''; sha256 = '' }
  }
  $seal = $null
  try { $seal = [System.IO.File]::ReadAllText($target) | ConvertFrom-Json }
  catch { $problems.Add(('the seal {0} is not readable JSON: {1}' -f $SealName, (Protect-Text $_.Exception.Message))) }
  if ($null -eq $seal) {
    return [ordered]@{ ok = $false; problems = @($problems); fileCount = 0; chainHead = ''; sha256 = $sha }
  }
  $sealFiles = Get-ClashProperty -Object $seal -Name 'files' -Default $null
  if ($null -eq $sealFiles) { $problems.Add('the seal lists no files') }
  $entries = @($sealFiles)
  $chain = 'GENESIS'
  $seen = @{}
  foreach ($entry in $entries) {
    $rel = [string](Get-ClashProperty -Object $entry -Name 'path' -Default '')
    if ([string]::IsNullOrWhiteSpace($rel)) { $problems.Add('the seal contains an entry with no path'); continue }
    if ($seen.ContainsKey($rel)) { $problems.Add(('the seal lists {0} twice' -f $rel)) }
    $seen[$rel] = $true
    $full = Join-Path $Root $rel
    if (-not (Test-Path -LiteralPath $full)) { $problems.Add(('{0} is sealed but missing from disk' -f $rel)); continue }
    if (Test-Path -LiteralPath $full -PathType Container) { $problems.Add(('{0} is sealed but is a directory' -f $rel)); continue }
    $claim = [string](Get-ClashProperty -Object $entry -Name 'sha256' -Default '')
    $actual = ''
    try { $actual = Get-NormalizedSha256 -Path $full }
    catch { $problems.Add(('{0} could not be read: {1}' -f $rel, (Protect-Text $_.Exception.Message))); continue }
    if ($actual -ne $claim) { $problems.Add(('{0} hash is {1}, the seal says {2}' -f $rel, $actual, $claim)) }
    $chain = Get-TextSha256 -Text ($chain + '|' + $rel + '|' + $claim)
    if ($chain -ne [string](Get-ClashProperty -Object $entry -Name 'chain' -Default '')) {
      $problems.Add(('{0} chain link does not re-derive' -f $rel))
    }
  }
  if ([string](Get-ClashProperty -Object $seal -Name 'chainHead' -Default '') -ne $chain) {
    $problems.Add('the seal chain head does not re-derive from its entries')
  }
  $claimedCount = Get-ClashProperty -Object $seal -Name 'fileCount' -Default -1
  if ([int]$claimedCount -ne $entries.Count) {
    $problems.Add(('the seal says {0} file(s) but lists {1}' -f $claimedCount, $entries.Count))
  }
  foreach ($required in @($Require)) {
    if ([string]::IsNullOrWhiteSpace($required)) { continue }
    $hit = @($entries | Where-Object { [string](Get-ClashProperty -Object $_ -Name 'path' -Default '') -eq $required }).Count
    if ($hit -ne 1) { $problems.Add(('required evidence {0} appears {1} time(s) in the seal' -f $required, $hit)) }
  }
  # Anything present but unsealed means evidence was written after the seal - the
  # exact shape of R15-C1 - so it is reported rather than ignored.
  $excluded = @(Get-ClashSealExclusions)
  foreach ($file in @(Get-ChildItem -LiteralPath $Root -Recurse -File)) {
    if ($excluded -contains $file.Name) { continue }
    if ($file.Name.EndsWith('.tmp')) { continue }
    $rel = $file.FullName.Substring($Root.Length).TrimStart('\', '/')
    if (-not $seen.ContainsKey($rel)) { $problems.Add(('{0} exists in the run but is not sealed' -f $rel)) }
  }
  return [ordered]@{ ok = ($problems.Count -eq 0); problems = @($problems); fileCount = $entries.Count; chainHead = $chain; sha256 = $sha }
}

# ------------------------------------------------------- completion protocol --
# Round 16 (R15-C1). The runner used to write a COMPLETE receipt and announce it
# BEFORE sealing the evidence, so a failed seal left a durable, announced
# COMPLETE next to an EXCEPTION and an exit code of 1. Completion is now a small
# commit protocol with one commit point:
#
#   1. 06-finalization-intent.json   - provisional; says finalization started
#   2. EVIDENCE-MANIFEST.json        - the seal, published atomically
#   3. seal verified against disk    - every hash and every chain link re-derived
#   4. 06-complete.json.<guid>.tmp   - the marker, written exclusively
#   5. 06-complete.json              - THE COMMIT POINT: an atomic rename
#   6. marker re-read and re-verified
#
# The marker is not part of the seal (the seal excludes it); the marker binds the
# seal's sha256. That is what keeps the two from depending on each other.
#
# Failure between any two steps leaves the run finalization-incomplete: there is
# no 06-complete.json, so no supported consumer can read the run as complete, and
# the exception path reports UNKNOWN. Nothing is ever deleted or rewritten, and a
# second finalization attempt refuses rather than repairs.
function Publish-ClashCompletion {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [hashtable]$Fields = @{},
    [string[]]$RequiredEvidence = @(),
    [string]$PrevSha = ''
  )

  $marker = Join-Path $Root '06-complete.json'
  $doubt  = Join-Path $Root '06-complete-unverified.json'

  # Refusals come first: an existing marker means this run was already finalised
  # (or someone else wrote one), and a doubt marker means a previous attempt
  # could not verify what it published. Neither is repaired here.
  if (Test-Path -LiteralPath $marker) {
    throw ('completion refused: {0} already exists. A finalised run is never re-finalised; inspect the evidence instead of repairing it.' -f $marker)
  }
  if (Test-Path -LiteralPath $doubt) {
    throw ('completion refused: {0} exists, which means a previous finalization could not verify what it published. This run is not acceptably complete.' -f $doubt)
  }

  $protocol = 'clash-completion/2'
  # Provisional receipt: it says finalization started, never that it succeeded.
  # It joins the hash chain so the run's receipts remain one ordered sequence.
  $intentSha = Add-Receipt -Root $Root -Name '06-finalization-intent.json' -PrevSha $PrevSha -Fields @{
    protocol         = $protocol
    status           = 'FINALIZING'
    requiredEvidence = @($RequiredEvidence)
    guidance         = 'Provisional. A run is complete only when 06-complete.json exists and Test-ClashRunCompletion accepts it.'
  }

  $seal = Seal-Evidence -Root $Root
  $check = Test-EvidenceSeal -Root $Root -Require $RequiredEvidence
  if (-not $check.ok) {
    $sample = @($check.problems)
    if ($sample.Count -gt 4) { $sample = @($sample[0..3]) }
    throw ('completion refused: the evidence seal does not verify: {0}' -f ($sample -join '; '))
  }

  $object = [ordered]@{
    protocol       = $protocol
    status         = 'COMPLETE'
    utc            = (Get-Date).ToUniversalTime().ToString('o')
    adapter        = ("{0}/{1}" -f $script:ClashAdapterId, $script:ClashAdapterVersion)
    finalized      = $true
    prevReceiptSha = $intentSha
    seal        = [ordered]@{
      name      = 'EVIDENCE-MANIFEST.json'
      sha256    = [string]$check.sha256
      fileCount = [int]$check.fileCount
      chainHead = [string]$check.chainHead
    }
  }
  foreach ($k in @($Fields.Keys)) { $object[[string]$k] = $Fields[$k] }

  $temp = '{0}.{1}.tmp' -f $marker, ([guid]::NewGuid().ToString('N').Substring(0, 12))
  $markerSha = Write-EvidenceJson -Path $temp -Object $object
  # Verify the candidate BEFORE it becomes authoritative: same bytes, but read
  # back from disk rather than trusted from memory.
  $candidate = [System.IO.File]::ReadAllText($temp) | ConvertFrom-Json
  if ([string](Get-ClashProperty -Object $candidate -Name 'status' -Default '') -ne 'COMPLETE' -or
      [string](Get-ClashProperty -Object $candidate -Name 'protocol' -Default '') -ne $protocol) {
    throw 'completion refused: the candidate marker did not read back as a COMPLETE marker for this protocol'
  }
  if ([string](Get-ClashProperty -Object (Get-ClashProperty -Object $candidate -Name 'seal' -Default $null) -Name 'sha256' -Default '') -ne [string]$check.sha256) {
    throw 'completion refused: the candidate marker does not bind the seal that was verified'
  }
  # THE COMMIT POINT. Move fails if the marker appeared meanwhile, so the
  # authoritative name is created exactly once and only with verified content.
  [System.IO.File]::Move($temp, $marker)

  $published = $null
  try { $published = [System.IO.File]::ReadAllText($marker) | ConvertFrom-Json }
  catch { $published = $null }
  # Re-verification is part of the protocol, so it must not be able to throw its
  # way out: an unreadable seal here is exactly the doubt this step exists to
  # record.
  $publishedOk = $false
  try {
    $publishedOk = ($null -ne $published -and
      [string](Get-ClashProperty -Object $published -Name 'status' -Default '') -eq 'COMPLETE' -and
      [string](Get-ClashProperty -Object $published -Name 'protocol' -Default '') -eq $protocol -and
      [string](Get-ClashProperty -Object (Get-ClashProperty -Object $published -Name 'seal' -Default $null) -Name 'sha256' -Default '') -eq (Get-NormalizedSha256 -Path (Join-Path $Root 'EVIDENCE-MANIFEST.json')))
  }
  catch { $publishedOk = $false }
  if (-not $publishedOk) {
    # The marker exists but could not be re-verified. It is not withdrawn (that
    # would rewrite evidence); a doubt marker is added so that any consumer using
    # Test-ClashRunCompletion rejects the run, and the caller must not announce
    # success.
    try {
      [void](Add-Receipt -Root $Root -Name '06-complete-unverified.json' -PrevSha $markerSha -Fields @{
          protocol = $protocol
          status   = 'UNVERIFIED'
          reason   = 'the published completion marker could not be re-read and re-verified against the seal'
          marker   = '06-complete.json'
        })
    }
    catch { Write-Host ('REPORT LOST: the doubt receipt could not be persisted: {0}' -f (Protect-Text $_.Exception.Message)) -ForegroundColor Red }
    throw 'completion refused: the published marker could not be re-verified; 06-complete-unverified.json records the doubt'
  }

  return [ordered]@{
    ok           = $true
    protocol     = $protocol
    markerPath   = $marker
    markerSha256 = $markerSha
    intentSha256 = $intentSha
    sealSha256   = [string]$check.sha256
    sealEntries  = [int]$check.fileCount
  }
}

# The consumer half of the contract. A run counts as complete only when the
# marker exists, the seal exists, the marker binds THAT seal, the seal still
# describes the files on disk, and nothing in the run records an exception or an
# unverified publication. Anything else is not acceptance, whatever the marker
# says on its own.
function Test-ClashRunCompletion {
  param([Parameter(Mandatory = $true)][string]$RunPath)

  $problems = New-Object System.Collections.Generic.List[string]
  $marker = Join-Path $RunPath '06-complete.json'
  $doubt  = Join-Path $RunPath '06-complete-unverified.json'
  $exception = Join-Path $RunPath '99-runner-exception.json'

  if (-not (Test-Path -LiteralPath $marker)) { $problems.Add('no 06-complete.json: the run is not finalised') }
  if (Test-Path -LiteralPath $doubt) { $problems.Add('06-complete-unverified.json is present: the run published a marker it could not verify') }
  if (Test-Path -LiteralPath $exception) { $problems.Add('99-runner-exception.json is present: the run ended in an exception') }

  $document = $null
  if (Test-Path -LiteralPath $marker) {
    try { $document = [System.IO.File]::ReadAllText($marker) | ConvertFrom-Json }
    catch { $problems.Add(('06-complete.json is not readable JSON: {0}' -f (Protect-Text $_.Exception.Message))) }
  }
  if ($null -ne $document) {
    $status = [string](Get-ClashProperty -Object $document -Name 'status' -Default '')
    $proto  = [string](Get-ClashProperty -Object $document -Name 'protocol' -Default '')
    if ($status -ne 'COMPLETE') { $problems.Add(('the marker status is "{0}", not COMPLETE' -f $status)) }
    if ($proto -ne 'clash-completion/2') { $problems.Add(('the marker protocol is "{0}"' -f $proto)) }
    if ((Get-ClashProperty -Object $document -Name 'finalized' -Default $false) -ne $true) { $problems.Add('the marker does not record a completed finalization') }
  }

  $check = Test-EvidenceSeal -Root $RunPath
  if (-not $check.ok) {
    foreach ($p in @($check.problems)) { $problems.Add(('seal: {0}' -f $p)) }
  }
  $markerSeal = Get-ClashProperty -Object $document -Name 'seal' -Default $null
  if ($null -ne $document) {
    $boundSha = [string](Get-ClashProperty -Object $markerSeal -Name 'sha256' -Default '')
    $boundN   = Get-ClashProperty -Object $markerSeal -Name 'fileCount' -Default -1
    if ($boundSha -ne [string]$check.sha256) {
      $problems.Add(('the marker binds seal {0} but the seal on disk is {1}' -f $boundSha, $check.sha256))
    }
    if ([int]$boundN -ne [int]$check.fileCount) {
      $problems.Add(('the marker says the seal covers {0} file(s), the seal lists {1}' -f $boundN, $check.fileCount))
    }
  }

  return [ordered]@{
    ok         = ($problems.Count -eq 0)
    problems   = @($problems)
    protocol   = $(if ($null -ne $document) { [string](Get-ClashProperty -Object $document -Name 'protocol' -Default '') } else { '' })
    sealSha256 = [string]$check.sha256
    sealFiles  = [int]$check.fileCount
  }
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
    # Round 13: Test-VerifyReport now requires the exact psql envelope, and the
    # row-count footer is built with ngettext("(%lu row)", "(%lu rows)", n) in
    # src/fe_utils/print.c - it is TRANSLATED. On a host whose message catalog is
    # not English, a perfectly good report would end in "(19 Zeilen)", the strict
    # parser would report "no row-count footer: the output is truncated", and the
    # gate would STOP a correct deployment. The parser's environment is part of
    # the contract, so the catalog is pinned for every psql child.
    LC_ALL            = 'C'
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

# ------------------------------------------- verification report contract ---
# Round 12 (R11-C1): a psql exit code of 0 is NOT evidence that a verification
# report was rendered. An invocation that produced no rows at all, half a report,
# a duplicated check, a renamed check or a malformed row still exits 0 whenever
# the child never reached the RAISE at the end of the file - and the runner used
# to count only FAIL rows. Zero rows therefore read as success: the postflight
# gate passed with no evidence, the writer claim was released and the receipt
# said COMPLETE.
#
# The contract below is the exact set of checks the two committed scripts render,
# in the order they render them, with the expected value each row must show. It
# is DECLARED here, never inferred at run time, and two independent mirrors prove
# it has not been invented or allowed to drift:
#   * tests/verify-package.mjs extracts the identities from the SQL on Linux and
#     fails when the declaration differs (offline, every run)
#   * tools/test-native-capture.ps1 does the same on the Windows host and also
#     executes deployed gates against complete and deliberately broken reports
# ord, name and expected are transcribed from verify/90_verify.sql and
# verify/95_storage_config.sql; 'info = $true' marks the row the script renders
# as INFO (it is not a gating check).
function Get-ClashVerifyContract {
  param([Parameter(Mandatory = $true)][string]$ReportName)

  # Gate 2's report, declared check by check. Round 14 (R13-C1): the deployment
  # runner used to count lines ending in '| PASS' here, so any text at all was
  # accepted as a preflight. The 21 rows below are the rows 00_preflight.sql
  # renders, in the order it renders them: 19 gating checks (1-19) and two INFO
  # checks (20-21, whose check_name starts with 'INFO' and whose status the SQL
  # sets to INFO). The expected values are the literals in the script, including
  # the pipe in 'postgis|extensions' - which is a VALUE, not a column separator.
  if ($ReportName -eq '00_preflight.sql') {
    return [ordered]@{
      report = '00_preflight.sql'
      path   = 'preflight\00_preflight.sql'
      gating = 19
      info   = 2
      checks = @(
        [ordered]@{ ord = 1;  name = 'postgres major version 17';                         expected = '17';                info = $false }
        [ordered]@{ ord = 2;  name = 'wal_level';                                         expected = 'logical';           info = $false }
        [ordered]@{ ord = 3;  name = 'replication slots';                                 expected = '0';                 info = $false }
        [ordered]@{ ord = 4;  name = 'baseline public relations';                         expected = '0';                 info = $false }
        [ordered]@{ ord = 5;  name = 'baseline public functions';                         expected = '0';                 info = $false }
        [ordered]@{ ord = 6;  name = 'baseline auth.users rows';                          expected = '0';                 info = $false }
        [ordered]@{ ord = 7;  name = 'baseline storage.buckets rows';                     expected = '0';                 info = $false }
        [ordered]@{ ord = 8;  name = 'postgis installed in extensions';                   expected = 'postgis|extensions'; info = $false }
        [ordered]@{ ord = 9;  name = 'pgcrypto schema';                                   expected = 'extensions';        info = $false }
        [ordered]@{ ord = 10; name = 'pg_cron extension absent';                          expected = 'ABSENT';            info = $false }
        [ordered]@{ ord = 11; name = 'cron.schedule() absent';                            expected = 'ABSENT';            info = $false }
        [ordered]@{ ord = 12; name = 'schema cron absent';                                expected = 'ABSENT';            info = $false }
        [ordered]@{ ord = 13; name = 'publication supabase_realtime owner';               expected = 'postgres';          info = $false }
        [ordered]@{ ord = 14; name = 'publication supabase_realtime tables';              expected = '0';                 info = $false }
        [ordered]@{ ord = 15; name = 'realtime.messages RLS';                             expected = 'true';              info = $false }
        [ordered]@{ ord = 16; name = 'API roles present';                                 expected = '4';                 info = $false }
        [ordered]@{ ord = 17; name = 'storage.objects.owner type';                        expected = 'uuid';              info = $false }
        [ordered]@{ ord = 18; name = 'supautils delegates storage.objects policy DDL';    expected = 'delegated';         info = $false }
        [ordered]@{ ord = 19; name = 'supautils delegates realtime.messages policy DDL';  expected = 'delegated';         info = $false }
        [ordered]@{ ord = 20; name = 'INFO supautils privileged_extensions has pg_cron';  expected = 'INFO';              info = $true }
        [ordered]@{ ord = 21; name = 'INFO expected step count';                          expected = 'INFO';              info = $true }
      )
    }
  }
  if ($ReportName -eq '90_verify.sql') {
    return [ordered]@{
      report = '90_verify.sql'
      path   = 'verify\90_verify.sql'
      gating = 19
      info   = 0
      checks = @(
        [ordered]@{ ord = 1;  name = 'ledger rows';                                        expected = '111';        info = $false }
        [ordered]@{ ord = 2;  name = 'ledger versions match manifest exactly';             expected = '111';        info = $false }
        [ordered]@{ ord = 3;  name = 'ledger has no extra versions';                       expected = '0';          info = $false }
        [ordered]@{ ord = 4;  name = 'every ledger row stores a sha256';                   expected = '0';          info = $false }
        [ordered]@{ ord = 5;  name = 'executed-text sha256 matches manifest for all';      expected = '0';          info = $false }
        [ordered]@{ ord = 6;  name = 'file 13 recorded as the cloud variant';              expected = 'clash_scheduler__cloud_nocron'; info = $false }
        [ordered]@{ ord = 7;  name = 'core tables present';                                expected = '8';          info = $false }
        [ordered]@{ ord = 8;  name = 'RPC signatures exact';                               expected = '0';          info = $false }
        [ordered]@{ ord = 9;  name = 'publication contains arena_room_messages';           expected = 'true';       info = $false }
        [ordered]@{ ord = 10; name = 'realtime.messages policies count';                   expected = '>=5';        info = $false }
        [ordered]@{ ord = 11; name = 'run_maintenance not executable by anon';             expected = 'false';      info = $false }
        [ordered]@{ ord = 12; name = 'run_maintenance not executable by authenticated';    expected = 'false';      info = $false }
        [ordered]@{ ord = 13; name = 'run_maintenance executable by service_role';         expected = 'true';       info = $false }
        [ordered]@{ ord = 14; name = 'TRIPWIRE pg_cron absent';                            expected = 'ABSENT';     info = $false }
        [ordered]@{ ord = 15; name = 'TRIPWIRE cron.schedule absent';                      expected = 'ABSENT';     info = $false }
        [ordered]@{ ord = 16; name = 'TRIPWIRE schema cron absent';                        expected = 'ABSENT';     info = $false }
        [ordered]@{ ord = 17; name = 'TRIPWIRE no cron job rows';                          expected = 'ABSENT';     info = $false }
        [ordered]@{ ord = 18; name = 'realtime.messages RLS still enabled';                expected = 'true';       info = $false }
        [ordered]@{ ord = 19; name = 'wal_level unchanged';                                expected = 'logical';    info = $false }
      )
    }
  }
  if ($ReportName -eq '95_storage_config.sql') {
    return [ordered]@{
      report = '95_storage_config.sql'
      path   = 'verify\95_storage_config.sql'
      gating = 6
      info   = 1
      checks = @(
        [ordered]@{ ord = 1; name = 'bucket count for media';                        expected = '2';         info = $false }
        [ordered]@{ ord = 2; name = 'public-media is public';                        expected = 'true';      info = $false }
        [ordered]@{ ord = 3; name = 'private-media is private';                      expected = 'false';     info = $false }
        [ordered]@{ ord = 4; name = 'file_size_limit';                               expected = '104857600'; info = $false }
        [ordered]@{ ord = 5; name = 'mime allowlist length';                         expected = '8';         info = $false }
        [ordered]@{ ord = 6; name = 'storage.objects policies';                      expected = '5';         info = $false }
        [ordered]@{ ord = 7; name = 'INFO created by migration 4, not by this package'; expected = 'INFO';   info = $true }
      )
    }
  }
  return $null
}

# ------------------------------------------------- verification report envelope --
# What a verifier's stdout actually contains. psql's aligned output for ONE
# result set is exactly:
#
#     <blank lines>
#      ord | check_name | expected | actual | status      <- column header
#     -----+------------+----------+--------+-------       <- dashed separator
#      <data rows, one per check, five '|'-separated fields>
#     (19 rows)                                            <- row-count footer
#     <blank lines>
#
# The footer comes from psql's default footer (src/fe_utils/print.c,
# footers_with_default: "(%lu rows)" / "(%lu row)"), which is emitted unless
# -t/--tuples-only or "\pset footer off" is used. -q does NOT suppress it, and an
# empty result set still prints "(0 rows)". verify/90_verify.sql and
# verify/95_storage_config.sql are each one SELECT plus a DO guard, and the DO
# block's NOTICE goes to stderr, so stdout is exactly this envelope.
#
# Round 13 (R12-C1): the parser used to skip every line it did not recognise, so
# one extra malformed row - or any other unexpected output - was invisible and
# the report could still be PASS. These helpers make the envelope explicit and
# make anything outside it a problem.
function Format-ReportLine {
  param([string]$Line)
  $t = [string](Protect-Text ([string]$Line).Trim())
  if ($t.Length -gt 120) { $t = $t.Substring(0, 120) + '...' }
  return $t
}

# ---------------------------------------------------------------------------
# The aligned table's dashed separator is the only trustworthy framing.
#
# psql builds it as (width + 2) dashes per column, joined by '+', so the dashes
# give the exact span of every column. Splitting a row on '|' instead reads the
# WRONG number of fields when a cell contains a pipe, and 00_preflight.sql does
# exactly that on purpose: ord 8 renders the literal 'postgis|extensions' in the
# expected column and 'postgis|<schema>' (or 'ABSENT') in the actual column. A
# pipe splitter sees seven fields there and calls a good preflight report
# malformed. Round 13's report on gate 2 (R13-C1) is why this exists.
function Get-ReportColumnBounds {
  param([Parameter(Mandatory = $true)][string]$SeparatorLine)

  $t = ([string]$SeparatorLine).Trim()
  if ($t -notmatch '^-+(\+-+)+$') { return $null }
  $bounds = @()
  $start  = 0
  foreach ($segment in @($t.Split('+'))) {
    $len    = ([string]$segment).Length
    # A plain Hashtable, not [ordered]@{}: Round 12's R11-C1 was an
    # OrderedDictionary indexer binding an int to a POSITION. Nothing here needs
    # order, so keep the type that cannot surprise anyone.
    $bounds += @{ start = $start; width = $len }
    $start  = $start + $len + 1
  }
  return $bounds
}

# One cell = the text inside its column's span, trimmed. psql pads every column
# to the separator width, so the span is exact; the last column is not padded on
# the right in real psql output, so it runs to the end of the line. Nothing here
# guesses: a span that starts past the end of the line is an empty cell, and the
# caller reports whatever that makes of the row.
function Get-ReportCellsFromBounds {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Line,
    [Parameter(Mandatory = $true)]$Bounds
  )

  $cells = @()
  $text  = [string]$Line
  $count = @($Bounds).Count
  for ($i = 0; $i -lt $count; $i++) {
    $bound = $Bounds[$i]
    $start = [int]$bound.start
    if ($start -ge $text.Length) { $cells += ''; continue }
    if ($i -eq ($count - 1)) {
      $cells += ($text.Substring($start)).Trim()
      continue
    }
    $width = [int]$bound.width
    if (($start + $width) -gt $text.Length) { $width = $text.Length - $start }
    $cells += ($text.Substring($start, $width)).Trim()
  }
  return $cells
}

function Format-ReportChar {
  param([char]$Char)
  $code = [int]$Char
  if ($code -lt 32 -or $code -eq 127) { return ('U+{0:X4}' -f $code) }
  return ("'{0}'" -f [string]$Char)
}

# The spans say WHERE a cell is; they say nothing about what separates it from
# the next one. Reading only the spans means a row whose structural '|' has been
# replaced - by '!', by nothing, by anything - still yields the same five cells
# and the same PASS. Round 14's audit (R14-C1) mutated the four delimiters on
# row 1 to '!' and the gate advanced to gate 3.
#
# So the framing is checked in its own right, at the exact positions the
# separator declares:
#   * a space at the first character of every column (psql's left padding),
#   * a '|' at start_i + width_i for every column but the last.
# A '|' INSIDE a cell is not at any of those positions, which is why
# 'postgis|extensions' stays a value: only the declared boundaries are delimiters.
function Test-ReportRowFraming {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Line,
    [Parameter(Mandatory = $true)]$Bounds
  )

  $problems = @()
  $text  = [string]$Line
  $count = @($Bounds).Count
  for ($i = 0; $i -lt $count; $i++) {
    $start = [int]$Bounds[$i].start
    $width = [int]$Bounds[$i].width
    if ($start -ge $text.Length) { break }   # a short row is reported by the caller
    if ($text[$start] -ne ' ') {
      $problems += ('column {0} does not begin at its boundary (position {1}): found {2}, expected a space' -f ($i + 1), $start, (Format-ReportChar $text[$start]))
    }
    if ($i -lt ($count - 1)) {
      $pos = $start + $width
      if ($pos -ge $text.Length) {
        $problems += ('the row ends before the delimiter that closes column {0} (position {1})' -f ($i + 1), $pos)
        break
      }
      if ($text[$pos] -ne '|') {
        $problems += ('the delimiter closing column {0} is {1} at position {2}, expected "|"' -f ($i + 1), (Format-ReportChar $text[$pos]), $pos)
      }
    }
  }
  return $problems
}

function Test-VerifyReportHeader {
  param([string]$Line)
  $fields = @(([string]$Line).Split('|'))
  if ($fields.Count -ne 5) { return $false }
  $names = @('ord', 'check_name', 'expected', 'actual', 'status')
  for ($i = 0; $i -lt 5; $i++) {
    if (([string]$fields[$i]).Trim() -ne $names[$i]) { return $false }
  }
  return $true
}

function Test-VerifyReportSeparator {
  param([string]$Line)
  $t = ([string]$Line).Trim()
  if ($t -notmatch '^-+(\+-+)+$') { return $false }
  $segments = @($t.Split('+'))
  if ($segments.Count -ne 5) { return $false }
  foreach ($segment in $segments) { if ($segment.Length -lt 3) { return $false } }
  return $true
}

# Validates one rendered verification report against its contract.
#
# Accepts a report only when ALL of the following hold. Each failure is recorded
# as its own problem string, so the STOP receipt says which one it was:
#   * the child definitely ran, finished, returned 0 and both streams were
#     captured in full (Test-NativeSuccess) - otherwise the verdict is UNPROVEN,
#     never PASS and never FAIL-on-content, because an ambiguous execution cannot
#     be used to classify the database either way
#   * stdout is the aligned psql envelope and NOTHING ELSE: the five-column
#     header, the dashed separator, complete data rows, then exactly one terminal
#     row-count footer whose number equals the parsed row count. Blank lines are
#     allowed before the header and after the footer only. Anything else - an
#     extra line, prose, a second footer, a filtered or truncated stream - is a
#     reported problem, never skipped (R12-C1)
#   * at least one row was rendered (an empty report is not a pass)
#   * every data row parses into exactly five fields with a numeric leading ord
#     and a status of PASS/FAIL/INFO (malformed rows are reported, never skipped)
#   * no ord appears twice (duplicate)
#   * the rendered ords are exactly the declared ords, with none missing and none
#     unexpected, in ascending order (truncated / extra / reordered reports)
#   * every row's check_name and expected text equal the declared identity
#     (a drifted report is not the report that was reviewed)
#   * every gating row is PASS (a rendered FAIL is a failure) and the single
#     declared INFO row renders INFO, with the declared PASS and INFO counts
# Returned fields: ok, verdict (PASS/FAIL/UNPROVEN), rows, passRows, failRows,
# infoRows, gatingExpected, infoExpected, missing, unexpected, duplicates,
# malformed, problems, outcome, nativeOk, captureComplete, headerSeen,
# separatorSeen, footerSeen, footerRows, envelopeProblems.
function Test-VerifyReport {
  param(
    [Parameter(Mandatory = $true)]$Result,
    [Parameter(Mandatory = $true)][string]$ReportName
  )

  $problems   = @()
  $malformed  = @()
  $duplicates = @()
  $order      = @()
  $passRows   = 0
  $failRows   = 0
  $infoRows   = 0
  $rowCount   = 0
  # Round 12 (found by the Windows gate): this must be a Hashtable, not
  # [ordered]@{}. An OrderedDictionary exposes TWO indexers - Item(object key)
  # and Item(int index) - and PowerShell binds the int one, so $byOrd[$ord] was
  # a POSITIONAL read: ord 7 returned the seventh row regardless of its ord, and
  # ord 19 with 19 rows in the map threw ArgumentOutOfRangeException('index').
  # Every non-empty report hit it, so every report was UNPROVEN by crash. A
  # Hashtable has one object-key indexer, so the lookup means what it says.
  $byOrd      = @{}

  $nativeOk = Test-NativeSuccess $Result
  $captureComplete = Test-NativeCaptureComplete $Result
  $outcome = 'UNKNOWN'
  if ($null -ne $Result) { $outcome = Get-NativeOutcomeLabel $Result }

  $contract = Get-ClashVerifyContract -ReportName $ReportName
  if ($null -eq $contract) {
    return [ordered]@{
      ok              = $false
      verdict         = 'FAIL'
      report          = $ReportName
      rows            = 0
      passRows        = 0
      failRows        = 0
      infoRows        = 0
      gatingExpected  = 0
      infoExpected    = 0
      missing         = @()
      unexpected      = @()
      duplicates      = @()
      malformed       = @()
      problems        = @(("no declared contract exists for '{0}'" -f $ReportName))
      outcome         = $outcome
      nativeOk        = $nativeOk
      captureComplete = $captureComplete
      headerSeen      = $false
      separatorSeen   = $false
      footerSeen      = $false
      footerRows      = -1
      envelopeProblems = @()
    }
  }

  $declared      = @($contract.checks)
  $gatingExpected = [int]$contract.gating
  $infoExpected   = [int]$contract.info

  $text = ''
  if ($null -ne $Result -and $null -ne (Get-DocumentProperty -Object $Result -Name 'stdOut' -Default $null)) {
    $text = [string](Get-DocumentProperty -Object $Result -Name 'stdOut' -Default '')
  }

  # Explicit envelope state machine. States advance strictly forward:
  #   preamble -> separator (header seen) -> body -> after-footer
  # A blank line is legal in the preamble and after the footer; inside the body it
  # is a problem. Every non-blank line is classified or reported - nothing is
  # skipped, which is the whole point of Round 13.
  $envelope    = New-Object System.Collections.Generic.List[string]
  $state       = 'preamble'
  $sawHeader   = $false
  $sawSep      = $false
  $sawFooter   = $false
  $footerRows  = -1
  $lineNo      = 0
  $blankInside = 0
  $bounds      = $null   # column spans, taken from the separator once it is seen
  $headerLine  = ''      # kept so the header can be checked against those spans

  foreach ($raw in ($text -split "`r?`n")) {
    $lineNo++
    $line    = [string]$raw
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0) {
      if ($state -eq 'preamble' -or $state -eq 'after-footer') { continue }
      $blankInside++
      if ($blankInside -le 3) {
        $envelope.Add(('line {0}: blank line inside the report body; the envelope is header, separator, data rows, row-count footer' -f $lineNo))
      }
      continue
    }
    if ($state -eq 'preamble') {
      if (Test-VerifyReportHeader -Line $line) { $sawHeader = $true; $headerLine = $line; $state = 'separator'; continue }
      $envelope.Add(('line {0}: expected the column header ord | check_name | expected | actual | status; found: {1}' -f $lineNo, (Format-ReportLine $line)))
      # keep going inside the body so one report can list every problem it has
      $state = 'body'
      continue
    }
    if ($state -eq 'separator') {
      if (Test-VerifyReportSeparator -Line $line) {
        $sawSep = $true
        $bounds = @(Get-ReportColumnBounds -SeparatorLine $line)
        # The header must sit on the columns the separator declares, with the same
        # names in the same places. A header that still splits into five cells but
        # is shifted relative to the separators would mis-frame every row read
        # under it, so the alignment is checked here rather than assumed.
        $headerProblems = @()
        if ($headerLine.Length -gt 0) { $headerProblems = @(Test-ReportRowFraming -Line $headerLine -Bounds $bounds) }
        foreach ($headerProblem in $headerProblems) {
          $envelope.Add(('line {0} (column header): {1}' -f ($lineNo - 1), $headerProblem))
        }
        $headerNames = @(Get-ReportCellsFromBounds -Line $headerLine -Bounds $bounds)
        $expectedNames = @('ord', 'check_name', 'expected', 'actual', 'status')
        if ($headerLine.Length -gt 0 -and $headerNames.Count -eq 5) {
          for ($h = 0; $h -lt 5; $h++) {
            if ([string]$headerNames[$h] -ne $expectedNames[$h]) {
              $envelope.Add(('the column header at position {0} reads "{1}", expected "{2}": the header is not aligned with the separator' -f ($h + 1), ([string]$headerNames[$h]), $expectedNames[$h]))
            }
          }
        }
        $state  = 'body'
        continue
      }
      $envelope.Add(('line {0}: expected the dashed separator under the header (five columns); found: {1}' -f $lineNo, (Format-ReportLine $line)))
      $state = 'body'
      continue
    }
    if ($state -eq 'body') {
      if ($trimmed -match '^\((\d+) rows?\)$') {
        $footerRows = [int]$Matches[1]
        $sawFooter  = $true
        $state      = 'after-footer'
        continue
      }
      if ($trimmed -match '^\(.*row') {
        $envelope.Add(('line {0}: malformed row-count footer, expected "(N rows)": {1}' -f $lineNo, (Format-ReportLine $line)))
        continue
      }
      # Sliced on the separator's column spans, NOT split on '|': a cell may
      # legitimately contain a pipe (preflight ord 8 renders 'postgis|extensions').
      # If the separator never appeared, $bounds is null and the report is already
      # a failure for that reason; the split keeps the rows readable in the
      # problems, and the envelope problem is what decides the verdict.
      $presentCells = 0
      if ($null -ne $bounds -and @($bounds).Count -eq 5) {
        $fields = @(Get-ReportCellsFromBounds -Line $line -Bounds $bounds)
        # How many columns the line actually reaches. A row that stopped early (a
        # damaged read, a hand-edited evidence file) is missing columns even
        # though the boundary reader still returns five cells: two of them are
        # simply past the end of the line.
        for ($b = 0; $b -lt 5; $b++) {
          if ($line.Length -gt [int]$bounds[$b].start) { $presentCells++ }
        }
        $lastBound = $bounds[4]
        $limit = [int]$lastBound.start + [int]$lastBound.width
        if ($line.Length -gt $limit) {
          $envelope.Add(('line {0}: unexpected text beyond the last column ({1} characters): {2}' -f $lineNo, ($line.Length - $limit), (Format-ReportLine $line)))
        }
      }
      else {
        $fields = @($line.Split('|'))
        $presentCells = $fields.Count
      }
      $first  = ''
      $status = ''
      if ($fields.Count -eq 5) {
        $first  = ([string]$fields[0]).Trim()
        $status = ([string]$fields[4]).Trim()
      }
      $ordinalOk = ($first -match '^\d+$')
      $statusOk  = ($status -eq 'PASS' -or $status -eq 'FAIL' -or $status -eq 'INFO')
      # The framing is a separate fact from the cell contents: same cells, wrong
      # separators, and the row is not this report's row.
      $framing = @()
      if ($null -ne $bounds -and @($bounds).Count -eq 5) {
        $framing = @(Test-ReportRowFraming -Line $line -Bounds $bounds)
      }
      if ($framing.Count -gt 0) {
        $framingSample = @($framing)
        if ($framingSample.Count -gt 3) { $framingSample = @($framingSample[0..2]) }
        foreach ($framingProblem in $framingSample) {
          $envelope.Add(('line {0}: {1}' -f $lineNo, $framingProblem))
        }
        if ($framing.Count -gt 3) {
          $envelope.Add(('line {0}: ... and {1} more framing problem(s)' -f $lineNo, ($framing.Count - 3)))
        }
      }
      if (-not $ordinalOk) {
        $envelope.Add(('line {0}: invalid ordinal in a data row (expected digits): {1}' -f $lineNo, (Format-ReportLine $line)))
      }
      if (-not $statusOk) {
        $envelope.Add(('line {0}: invalid status in a data row (expected PASS, FAIL or INFO): {1}' -f $lineNo, (Format-ReportLine $line)))
      }
      if ($framing.Count -gt 0 -or -not $ordinalOk -or -not $statusOk) {
        $malformed += (Format-ReportLine $line)
        if ($fields.Count -ne 5) {
          $envelope.Add(('line {0}: malformed data row: {1} field(s), expected 5: {2}' -f $lineNo, $fields.Count, (Format-ReportLine $line)))
        }
        elseif ($presentCells -lt 5) {
          $envelope.Add(('line {0}: malformed data row: {1} field(s) present, expected 5: {2}' -f $lineNo, $presentCells, (Format-ReportLine $line)))
        }
        continue
      }
      $rowCount++
      $ord      = [int]$first
      $name     = ([string]$fields[1]).Trim()
      $expected = ([string]$fields[2]).Trim()
      if ($byOrd.Contains($ord)) { $duplicates += $ord; continue }
      $byOrd[$ord] = [ordered]@{ ord = $ord; name = $name; expected = $expected; status = $status }
      $order += $ord
      if ($status -eq 'PASS') { $passRows++ }
      elseif ($status -eq 'FAIL') { $failRows++ }
      else { $infoRows++ }
      continue
    }
    # after the row-count footer only blank lines are legal
    $envelope.Add(('line {0}: unexpected output after the row-count footer: {1}' -f $lineNo, (Format-ReportLine $line)))
  }

  # Envelope completeness: reported in a fixed order so a STOP receipt leads with
  # the reason the report could not be trusted at all.
  $envelopeProblems = @()
  if (-not $sawHeader) {
    $envelopeProblems += ('the {0} report rendered no column header: an exit code without a rendered report is not a pass' -f $ReportName)
  }
  elseif (-not $sawSep) {
    $envelopeProblems += ('the {0} report has no dashed separator under its header' -f $ReportName)
  }
  if (-not $sawFooter) {
    $envelopeProblems += ('the {0} report has no row-count footer: the output is truncated or filtered and is not a pass' -f $ReportName)
  }
  elseif ($footerRows -ne $rowCount) {
    $envelopeProblems += ('the {0} row-count footer says {1} row(s) but {2} data row(s) were parsed' -f $ReportName, $footerRows, $rowCount)
  }
  $envelopeList = @($envelope)
  if ($envelopeList.Count -gt 12) {
    $envelopeList = @($envelopeList[0..11]) + @(('... and {0} more unexpected line(s)' -f ($envelopeList.Count - 12)))
  }
  $envelopeProblems = @($envelopeProblems) + @($envelopeList)

  $declaredOrds = @($declared | ForEach-Object { [int]$_.ord })
  $seenOrds     = @($order | ForEach-Object { [int]$_ })
  $missing      = @($declaredOrds | Where-Object { -not $byOrd.Contains([int]$_) })
  $unexpected   = @($seenOrds | Where-Object { $declaredOrds -notcontains [int]$_ })

  # Envelope problems lead: if the report is not even the expected shape, that is
  # the first thing the operator has to see.
  $problems = @($envelopeProblems)
  if ($rowCount -eq 0) {
    $problems += ('the {0} report rendered no verification rows at all; exit 0 without evidence is not a pass' -f $ReportName)
  }
  if (-not $nativeOk) {
    $problems += ('the {0} verification child did not run to a proven success (outcome {1}); its evidence cannot be classified as PASS or FAIL' -f $ReportName, $outcome)
  }
  if ($malformed.Count -gt 0) {
    # Sliced, not piped through Select-Object -First: under
    # $ErrorActionPreference = 'Stop' a stopped pipeline can surface as a
    # terminating error, and a diagnostic string must never abort the verdict.
    $malformedSample = @($malformed)
    if ($malformedSample.Count -gt 4) { $malformedSample = @($malformedSample[0..3]) }
    $problems += ('{0} malformed row(s): {1}' -f $malformed.Count, ($malformedSample -join ' ; '))
  }
  if ($duplicates.Count -gt 0) {
    $problems += ('{0} duplicated check ord(s): {1}' -f $duplicates.Count, (($duplicates | ForEach-Object { [string]$_ }) -join ','))
  }
  if ($missing.Count -gt 0) {
    $problems += ('{0} declared check(s) missing from the report: ord {1}' -f $missing.Count, (($missing | ForEach-Object { [string]$_ }) -join ','))
  }
  if ($unexpected.Count -gt 0) {
    $problems += ('{0} undeclared check(s) present in the report: ord {1}' -f $unexpected.Count, (($unexpected | ForEach-Object { [string]$_ }) -join ','))
  }
  for ($i = 1; $i -lt $order.Count; $i++) {
    if ([int]$order[$i] -le [int]$order[$i - 1]) { $problems += 'the rendered rows are not in ascending ord order'; break }
  }
  if ($failRows -gt 0) {
    $problems += ('{0} rendered check(s) FAILED' -f $failRows)
  }
  if (($passRows + $failRows) -ne $gatingExpected) {
    $problems += ('{0} gating row(s) rendered; the contract requires exactly {1}' -f ($passRows + $failRows), $gatingExpected)
  }
  if ($infoRows -ne $infoExpected) {
    $problems += ('{0} INFO row(s) rendered; the contract requires exactly {1}' -f $infoRows, $infoExpected)
  }

  foreach ($d in $declared) {
    $ord = [int]$d.ord
    if (-not $byOrd.Contains($ord)) { continue }
    $row = $byOrd[$ord]
    if ([string]$row.name -ne [string]$d.name) {
      $problems += ("check {0}: name '{1}' is not the declared '{2}'" -f $ord, $row.name, $d.name)
    }
    if ([string]$row.expected -ne [string]$d.expected) {
      $problems += ("check {0}: expected text '{1}' is not the declared '{2}'" -f $ord, $row.expected, $d.expected)
    }
    if ([bool]$d.info) {
      if ([string]$row.status -ne 'INFO') { $problems += ("check {0} ({1}) rendered {2}; the contract requires INFO" -f $ord, $d.name, $row.status) }
    }
    else {
      if ([string]$row.status -eq 'FAIL') { $problems += ("check {0} ({1}) rendered FAIL" -f $ord, $d.name) }
      elseif ([string]$row.status -ne 'PASS') { $problems += ("check {0} ({1}) rendered {2}; the contract requires PASS" -f $ord, $d.name, $row.status) }
    }
  }

  $verdict = 'PASS'
  if ($problems.Count -gt 0) { $verdict = 'FAIL' }
  if (-not $nativeOk) { $verdict = 'UNPROVEN' }

  return [ordered]@{
    ok              = ($verdict -eq 'PASS')
    verdict         = $verdict
    report          = $ReportName
    rows            = $rowCount
    passRows        = $passRows
    failRows        = $failRows
    infoRows        = $infoRows
    gatingExpected  = $gatingExpected
    infoExpected    = $infoExpected
    missing         = @($missing | ForEach-Object { [int]$_ })
    unexpected      = @($unexpected | ForEach-Object { [int]$_ })
    duplicates      = @($duplicates | ForEach-Object { [int]$_ })
    malformed       = @($malformed)
    problems        = @($problems)
    outcome         = $outcome
    nativeOk        = $nativeOk
    captureComplete = $captureComplete
    headerSeen      = $sawHeader
    separatorSeen   = $sawSep
    footerSeen      = $sawFooter
    footerRows      = $footerRows
    envelopeProblems = @($envelopeProblems)
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
  'absentAndPresentBranchesRecordActualResult',
  'claimReleaseOwnedRowReleasesClaimOnly',
  'claimReleaseZeroRowsStops',
  'claimReleaseWrongOwnerStops',
  'claimReleaseMultipleRowsStops',
  'claimReleaseNonZeroExitStops',
  'claimReleaseTimeoutStops',
  'claimReleaseIncompleteCaptureStops',
  'verificationReportContractMatchesSql',
  'verificationReportsProceedToComplete',
  'postflightEmptyReportStops',
  'postflightFailedRowStops',
  'postflightTruncatedReportStops',
  'postflightDuplicateRowStops',
  'postflightMalformedRowStops',
  'postflightIdentityDriftStops',
  'postflightUnprovenStops',
  'storageEmptyReportStops',
  'storageFailedRowStops',
  'storageMissingInfoRowStops',
  'storageUnprovenStops',
  'reportEnvelopeAcceptedForBothVerifiers',
  'reportFooterCountMismatchStops',
  'reportMissingFooterStops',
  'reportMalformedFooterStops',
  'reportUnexpectedTrailerStops',
  'reportExtraJunkLineStops',
  'reportInvalidOrdinalAndStatusStops',
  'reportTruncatedMidRowStops',
  'reportStorageTrailerStops',
  # Round 14 (R13-C1): gate 2 used to count '| PASS' suffixes.
  'preflightValidReportAdvancesToLedgerGate',
  'preflightArbitrarySuffixTextStops',
  'preflightMissingCheckStops',
  'preflightDuplicateCheckStops',
  'preflightReorderedChecksStop',
  'preflightRenamedCheckStops',
  'preflightRenderedFailRowStops',
  'preflightTruncatedReportStops',
  'preflightPipeInsideCellIsNotAColumn',
  'preflightInfoOnlyReportStops',
  # Round 15 (R14-C1): the framing characters are validated at every boundary.
  'preflightDelimiterReplacedStops',
  'preflightHeaderDelimiterReplacedStops',
  'postflightDelimiterReplacedStops',
  'storageDelimiterReplacedStops',
  'reportShiftedBoundaryStops',
  'reportUnpaddedRowStops',
  'reportPaddedShortCellsStillParse',
  'reportCrlfEnvelopeParses',
  'reportHeaderMisalignedToSeparatorStops',
  'reportEmbeddedPipeKeepsFraming',
  # Round 16 (R15-C1): the completion finalization protocol, executed on disk.
  'completionSuccessPublishesVerifiedMarker',
  'completionMarkerExcludedFromSeal',
  'completionRefusesSecondFinalization',
  'completionRefusesDoubtMarker',
  'completionSealPublicationFailureLeavesNoMarker',
  'completionSealWriteFailureLeavesNoMarker',
  'completionTailDoesNotAnnounceOnSealFailure',
  'completionTailAnnouncesOnlyAfterMarker',
  'completionValidatorRejectsExceptionBesideMarker',
  'completionValidatorRejectsTamperedEvidence',
  'completionValidatorRejectsTruncatedSeal',
  'completionValidatorReportsUnreadableSeal',
  'completionValidatorRejectsUnsealedEvidence',
  'completionRefusesMissingRequiredEvidence',
  'completionIntentNeverClaimsComplete',
  'deployTailIsTheOnlyCompletionPath'
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
      if ($null -eq $entry) {
        # Round 13 (R12-C1 class): a case recorded with no body was silently
        # skipped here, so "present but null" could satisfy the name and count
        # checks without ever being verified as passed. Absent cases are already
        # reported by the missing-case check below; this covers present-but-empty.
        if ($names -contains $name) { $problems += ("case '{0}' is present but has no body" -f $name) }
        continue
      }
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
