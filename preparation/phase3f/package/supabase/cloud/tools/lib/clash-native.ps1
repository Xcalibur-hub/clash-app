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
$script:ClashAdapterVersion = '5.6.0'

# Round 24 (F1). ONE canonical input contract for every text this package admits.
#
# PostgreSQL ends a -- comment at CR as well as at LF (its lexer's non_newline is
# [^\n\r]). Every checker in this package is line-oriented on LF, so a bare CR hides
# executable SQL inside what the checker reads as one comment line:
#
#     -- note<CR>select 1;
#
# is ONE line to a LF splitter and TWO to the server. Round 23 refused executable
# text before begin; and after commit;, but it normalised CRLF first and left any
# other CR in place, so the text after a bare CR was never inspected. The contract is
# therefore stated once, here, and every producer and consumer applies it BEFORE
# normalisation, hashing or admission:
#
#   * a CR is admissible only as the first half of a CRLF pair;
#   * the Unicode line separators NEL (U+0085), LS (U+2028) and PS (U+2029) are not
#     supported line endings and are refused rather than guessed at.
function Get-ClashCanonicalTextProblem {
  param([string]$Text, [string]$Label = 'text')

  $raw = [string]$Text
  if ($raw.Length -eq 0) { return '' }
  $cr = [regex]::Match($raw, '\r(?!\n)')
  if ($cr.Success) {
    $line = 1
    for ($i = 0; $i -lt $cr.Index; $i++) { if ($raw[$i] -eq [char]10) { $line++ } }
    return ('{0} contains a bare carriage return at line {1}, offset {2}: PostgreSQL ends a -- comment at CR as well as LF, so anything after it executes while an LF-oriented checker still reads one comment line. A CR is only admissible as part of a CRLF pair' -f $Label, $line, $cr.Index)
  }
  $exotic = [regex]::Match($raw, '[\u0085\u2028\u2029]')
  if ($exotic.Success) {
    return ('{0} contains the unsupported line separator U+{1:X4} at offset {2}; this package admits LF (and CRLF, normalised to LF) only' -f $Label, [int][char]$exotic.Value[0], $exotic.Index)
  }
  return ''
}

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

# Round 21 (R20-M1): the digest of the bytes read through an ALREADY HELD handle.
# Hashing by path after locking the file left a window in which the file could be
# replaced between the two opens; the bytes that are hashed here are the bytes the
# handle protects, and the handle stays open until the child process has exited.
function Get-NormalizedSha256FromStream {
  param([Parameter(Mandatory = $true)]$Stream)
  $Stream.Position = 0
  $buffer = New-Object byte[] 65536
  $all = New-Object System.IO.MemoryStream
  try {
    while ($true) {
      $read = $Stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) { break }
      $all.Write($buffer, 0, $read)
    }
    $bytes = $all.ToArray()
  }
  finally { $all.Dispose() }
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
  $text = $text.Replace("`r`n", "`n")
  return (Get-TextSha256 -Text $text)
}

# A SHA-256 claim is exactly 64 lowercase hex characters. PowerShell's -eq is
# case-insensitive for strings, so every hash comparison in the completion
# contract uses -ceq/-cne; a case-folded "match" is a different value.
function Test-ClashSha256Text {
  param($Value)
  if (-not ($Value -is [string])) { return $false }
  return ([bool]($Value -cmatch '^[0-9a-f]{64}$'))
}

# An integral JSON number, not the string "6" and not a boolean.
function Test-ClashIntegerValue {
  param($Value)
  return ($Value -is [int] -or $Value -is [long] -or $Value -is [int16] -or $Value -is [byte])
}

# How a field is rendered in a verdict, so "missing" and "wrong type" cannot be
# confused with an empty string.
function Format-ClashFieldValue {
  param($Value, [int]$Depth = 0)
  if ($null -eq $Value) { return '<missing or null>' }
  if ($Value -is [bool]) {
    if ($Value) { return 'boolean true' }
    return 'boolean false'
  }
  if ($Value -is [string]) {
    $shown = $Value
    if ($shown.Length -gt 80) { $shown = $shown.Substring(0, 80) + '...' }
    return ('string "' + $shown + '"')
  }
  # A collection must be rendered AS a collection. Reporting ["x"] as string "x"
  # in a verdict would repeat the very confusion C17-C1 was about.
  if ($Value -is [array] -or $Value -is [System.Collections.IList]) {
    $items = @($Value)
    $shown = @()
    $limit = [Math]::Min($items.Count, 3)
    for ($i = 0; $i -lt $limit; $i++) {
      if ($Depth -ge 2) { $shown += '...'; break }
      $shown += (Format-ClashFieldValue -Value $items[$i] -Depth ($Depth + 1))
    }
    if ($items.Count -gt $limit) { $shown += '...' }
    return ('array({0}) [{1}]' -f $items.Count, ($shown -join ', '))
  }
  if ($Value -is [ValueType]) { return ('number ' + [string]$Value) }
  if ($Value -is [System.Collections.IDictionary] -or $Value -is [System.Management.Automation.PSCustomObject]) { return 'object' }
  return $Value.GetType().Name
}

# Both hashes a verifier can derive from a file: the hash of the text as written
# (what Add-Receipt returns and chains) and the normalised hash (BOM stripped,
# CRLF->LF, what the seal records). A receipt hash matches if it is either, so
# the check is independent of line endings but still binds the exact bytes.
function Get-ClashFileHashes {
  param([Parameter(Mandatory = $true)][string]$Path)
  $hashes = @()
  try {
    $hashes += (Get-TextSha256 -Text ([System.IO.File]::ReadAllText($Path)))
    $hashes += (Get-NormalizedSha256 -Path $Path)
  }
  catch { return @() }
  return $hashes
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
  # C17-C1: a bare `return $prop.Value` writes the value into the OUTPUT PIPELINE,
  # and the pipeline enumerates an array. A JSON value of ["clash-completion/2"]
  # therefore reached the caller as the string "clash-completion/2", [] arrived as
  # nothing at all, and a singleton object array arrived as the object - so a type
  # test on the caller's local variable was testing the pipeline's output, not the
  # JSON field. The unary comma wraps the value so the pipeline emits exactly one
  # object, and the caller receives the value with its original type and shape.
  # This accessor is still the "convenient" reader: it reports a JSON null as the
  # default. Anything that makes a decision about a TYPE must use
  # Get-ClashJsonField instead, which keeps missing/null/kind separate.
  #
  # CALL-SITE CONTRACT: because the value comes back as ONE object, a caller must
  # not wrap the call in @(...) - @(Get-ClashProperty ...) would produce a
  # one-element array holding the array. Assign first, then wrap the VARIABLE
  # (@($value) is correct), or read the field record.
  return ,$prop.Value
}

# The type-and-shape-preserving reader. Returns a record, never the value through
# the pipeline, so no caller can accidentally enumerate it:
#   present  the property exists (a JSON null is present)
#   kind     missing | null | string | boolean | integer | number | object | array
#   value    the value exactly as ConvertFrom-Json produced it
# MISSING and NULL are different answers here on purpose: a contract that requires
# a string must reject both, and must be able to say which one it saw.
function Get-ClashJsonField {
  param($Object, [Parameter(Mandatory = $true)][string]$Name)
  $field = @{ present = $false; kind = 'missing'; value = $null }
  if ($null -eq $Object) { return $field }
  # RC11: there is ONE object representation in this package, not two. ConvertFrom-Json
  # produces a PSCustomObject, but a caller can also hand this reader a hashtable (a
  # fixture, a receipt assembled in memory, a record built by another function). A
  # hashtable's KEY is not a PSObject property, so the previous version answered
  # 'missing' for a field that Get-ClashJsonKind -Value on the very same container
  # classified as living in a JSON object. Two accessors that disagree about the same
  # document are a validation bypass waiting to happen, so dictionaries are read
  # through Contains/index exactly like PSCustomObjects are read through Properties.
  if ($Object -is [System.Collections.IDictionary]) {
    if (-not $Object.Contains($Name)) { return $field }
    $dictValue = $Object[$Name]
    $field['present'] = $true
    $field['kind']    = Get-ClashJsonKind -Value $dictValue
    $field['value']   = $dictValue
    return $field
  }
  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop) { return $field }
  $field['present'] = $true
  $field['kind']    = Get-ClashJsonKind -Value $prop.Value
  $field['value']   = $prop.Value
  return $field
}

# The JSON kind of a value that ConvertFrom-Json produced. Classification only:
# nothing here converts anything, because a conversion is exactly the defect this
# contract must not have.
function Get-ClashJsonKind {
  param($Value)
  if ($null -eq $Value) { return 'null' }
  if ($Value -is [string]) { return 'string' }
  if ($Value -is [bool]) { return 'boolean' }
  if ($Value -is [int] -or $Value -is [long] -or $Value -is [int16] -or $Value -is [byte] -or
      $Value -is [uint32] -or $Value -is [uint64]) { return 'integer' }
  if ($Value -is [double] -or $Value -is [single] -or $Value -is [decimal]) { return 'number' }
  if ($Value -is [System.Collections.IDictionary]) { return 'object' }
  if ($Value -is [System.Management.Automation.PSCustomObject]) { return 'object' }
  if ($Value -is [array] -or $Value -is [System.Collections.IList]) { return 'array' }
  return ('other:' + $Value.GetType().Name)
}

# Exact kind test. 'number' also matches an integer (both are JSON numbers), but
# 'integer' never matches 6.0 or "6", and 'string' never matches ["..."]. The
# caller passes the value; parameter binding does not enumerate an array.
function Test-ClashJsonKind {
  param($Value, [Parameter(Mandatory = $true)][string]$Kind)
  $actual = Get-ClashJsonKind -Value $Value
  if ($Kind -ceq 'number') { return ($actual -ceq 'number' -or $actual -ceq 'integer') }
  return ($actual -ceq $Kind)
}

# C18-C1: the ROOT of every JSON document the package reads is untrusted input,
# and it must be validated on its own. `ConvertFrom-Json` turns the four bytes
# `null` into $null WITHOUT throwing, and every validation block is guarded by
# "the document parsed", so a null root used to skip the whole authoritative
# block and leave the run accepted on its remaining evidence. A document that is
# missing, a directory, unreadable, empty, whitespace-only, the literal null, an
# array, a scalar or malformed must therefore produce its own explicit problem,
# independently of any field validation.
#
# Returns @{ ok; state; kind; value; problem }. `state` is the root STATE, which
# is what the tests assert on and what a verdict reports:
#   missing | directory | unreadable | empty | malformed | null | object | <kind>
function Get-ClashJsonRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label,
    [string[]]$Kind = @('object')
  )

  $leaf = Split-Path -Leaf $Path
  $root = @{ ok = $false; state = 'missing'; kind = 'missing'; value = $null; problem = '' }

  if (-not (Test-Path -LiteralPath $Path)) {
    $root['problem'] = ('the {0} {1} is missing' -f $Label, $leaf)
    return $root
  }
  if (Test-Path -LiteralPath $Path -PathType Container) {
    $root['state'] = 'directory'
    $root['kind'] = 'directory'
    $root['problem'] = ('the {0} {1} is a directory, not a document' -f $Label, $leaf)
    return $root
  }

  $text = ''
  try { $text = [System.IO.File]::ReadAllText($Path) }
  catch {
    $root['state'] = 'unreadable'
    $root['kind'] = 'unreadable'
    $root['problem'] = ('the {0} {1} could not be read: {2}' -f $Label, $leaf, (Protect-Text $_.Exception.Message))
    return $root
  }

  if ([string]::IsNullOrWhiteSpace($text)) {
    $root['state'] = 'empty'
    $root['kind'] = 'empty'
    $root['problem'] = ('the {0} {1} is empty or whitespace only ({2} byte(s)); it must be a JSON object' -f $Label, $leaf, $text.Length)
    return $root
  }

  $parsed = $null
  try { $parsed = $text | ConvertFrom-Json }
  catch {
    $root['state'] = 'malformed'
    $root['kind'] = 'malformed'
    $root['problem'] = ('the {0} {1} is not readable JSON: {2}' -f $Label, $leaf, (Protect-Text $_.Exception.Message))
    return $root
  }

  if ($null -eq $parsed) {
    # JSON null parses happily; it is the ONE root state that needs no exception
    # to be wrong, which is exactly why it was missed.
    $root['state'] = 'null'
    $root['kind'] = 'null'
    $root['problem'] = ('the {0} {1} is the JSON literal null; it must be a JSON object' -f $Label, $leaf)
    return $root
  }

  $kindName = Get-ClashJsonKind -Value $parsed
  $root['kind'] = $kindName
  $root['state'] = $kindName
  $root['value'] = $parsed
  $wanted = @($Kind)
  $accept = $false
  foreach ($want in $wanted) { if (Test-ClashJsonKind -Value $parsed -Kind $want) { $accept = $true; break } }
  if (-not $accept) {
    $root['problem'] = ('the {0} {1} is {2}; it must be a JSON {3}' -f $Label, $leaf, (Format-ClashFieldValue -Value $parsed), ($wanted -join ' or '))
    return $root
  }
  $root['ok'] = $true
  return $root
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
  # Round 24 (F1): the writer never produces evidence a reader could split differently
  # from PostgreSQL. A bare CR is refused here - before encoding and before the digest
  # is computed - exactly as the planner refuses it in a wrapper.
  $canonicalProblem = Get-ClashCanonicalTextProblem -Text $clean -Label 'the evidence text'
  if ($canonicalProblem.Length -gt 0) {
    throw ('evidence refused: {0}. Nothing was written to {1}.' -f $canonicalProblem, $Path)
  }
  $dir   = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  # Round 22 (C21-01): ONE hashing contract. Evidence is written LF-only and the
  # digest returned to the caller is the digest of exactly those bytes, so it is the
  # same value Get-NormalizedSha256 recomputes from the file. Before this, the writer
  # hashed raw text (ConvertTo-Json emits CRLF on Windows) while every verifier
  # normalised CRLF to LF, so an actual writer-produced chain could never be verified.
  $clean = $clean.Replace("`r`n", "`n")
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
    $Fields = @{},
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
  # .Contains works on a Hashtable and on an OrderedDictionary alike, so a caller may
  # pass either representation (RC11: one object representation, not two).
  $status = $(if ($Fields.Contains('status')) { $Fields['status'] } else { '-' })
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
# RC06: `Join-Path $Root $rel` is string concatenation, not containment. A relative
# path of '..\outside.txt' resolved to a file OUTSIDE the evidence root, an absolute
# path replaced the root entirely, and 'C:x' or a UNC path did the same. Every path
# that arrives from a JSON document is resolved here, and the result must be inside
# the root or the path is rejected with a reason.
function Resolve-ClashContainedPath {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    # AllowEmptyString: an empty path is untrusted input that must be REJECTED with
    # a reason, not a binding error (a binding failure is not a verdict).
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Relative,
    [string]$Label = 'path'
  )
  $record = @{ ok = $false; path = $null; relative = ''; problem = '' }
  if ($Relative.StartsWith('/') -or $Relative.StartsWith([string][char]92) -or ($Relative -match '^[A-Za-z]:')) {
    $record['problem'] = ('{0} "{1}" is an absolute or UNC path; evidence paths must be relative to the run root' -f $Label, $Relative)
    return $record
  }
  if ($Relative.Contains(':')) {
    $record['problem'] = ('{0} "{1}" carries a stream or drive separator; evidence paths must be relative to the run root' -f $Label, $Relative)
    return $record
  }
  # Segment by segment, so a parent reference cannot hide behind a separator that
  # the regex of a previous round did not model. An empty or '.' segment means the
  # path is not normalised, and '..' is refused outright.
  $segments = @($Relative -split '[/\\]')
  foreach ($segment in $segments) {
    if ($segment -ceq '..') {
      $record['problem'] = ('{0} "{1}" contains a parent-directory segment and can escape the evidence root' -f $Label, $Relative)
      return $record
    }
    if (($segment -ceq '.') -or ($segment.Length -eq 0)) {
      $record['problem'] = ('{0} "{1}" is not a normalised relative path' -f $Label, $Relative)
      return $record
    }
  }
  $sep = [System.IO.Path]::DirectorySeparatorChar
  $rootFull = [System.IO.Path]::GetFullPath($Root)
  while (($rootFull.Length -gt 3) -and ($rootFull.EndsWith('\') -or $rootFull.EndsWith('/'))) {
    $rootFull = $rootFull.Substring(0, $rootFull.Length - 1)
  }
  $candidate = ''
  try { $candidate = [System.IO.Path]::GetFullPath((Join-Path $rootFull $Relative)) }
  catch {
    $record['problem'] = ('{0} "{1}" is not a resolvable path: {2}' -f $Label, $Relative, (Protect-Text $_.Exception.Message))
    return $record
  }
  $prefix = $rootFull + [string]$sep
  if (-not $candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    $record['problem'] = ('{0} "{1}" resolves outside the evidence root' -f $Label, $Relative)
    return $record
  }
  # R20-M2: the prefix test above is a lexical proof. The file system gets the last
  # word: a junction inside the root satisfies it and still reads outside.
  $reparse = Test-ClashReparseFreePath -Root $rootFull -Relative $Relative -Label $Label
  if (-not $reparse.ok) {
    $record['problem'] = [string]$reparse.problem
    return $record
  }
  $record['ok'] = $true
  $record['path'] = $candidate
  $record['relative'] = $Relative
  return $record
}

# Round 21 (R20-M2). A string prefix is not containment when the file system can
# redirect a path: an NTFS junction planted inside the evidence root resolves,
# lexically, to a path inside the root - and to a file outside it in reality. The
# independent audit read an audit-owned file outside the root through exactly that.
#
# The policy is evaluated on the file system, component by component, from the root
# down to the leaf: any component that is a reparse point (junction, symlink, mount
# point) is refused, because this package never legitimately needs one. Components
# that do not exist cannot redirect anything, so they are not findings; a path that
# must exist is separately required to exist.
function Test-ClashReparseFreePath {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Relative,
    [string]$Label = 'path'
  )
  $record = @{ ok = $true; problem = ''; findings = @() }
  $findings = New-Object System.Collections.Generic.List[string]
  $sep = [System.IO.Path]::DirectorySeparatorChar
  $rootFull = [System.IO.Path]::GetFullPath($Root)
  while (($rootFull.Length -gt 3) -and ($rootFull.EndsWith('\') -or $rootFull.EndsWith('/'))) {
    $rootFull = $rootFull.Substring(0, $rootFull.Length - 1)
  }
  $candidates = @($rootFull)
  $segments = @($Relative -split '[/\\]' | Where-Object { $_.Length -gt 0 })
  $walk = $rootFull
  foreach ($segment in $segments) {
    $walk = Join-Path $walk $segment
    $candidates += $walk
  }
  foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    try {
      $item = Get-Item -LiteralPath $candidate -Force -ErrorAction Stop
    }
    catch {
      $findings.Add(('{0} could not be inspected for reparse points: {1}' -f $candidate, (Protect-Text $_.Exception.Message)))
      continue
    }
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      $target = ''
      try { $target = [string]$item.Target } catch { $target = '<unreadable>' }
      $findings.Add(('{0} is a reparse point (junction or symbolic link) that redirects to {1}; a path inside the evidence root must not traverse one' -f $candidate, $target))
    }
  }
  if ($findings.Count -gt 0) {
    $record['ok'] = $false
    $record['findings'] = @($findings)
    $record['problem'] = ('{0} "{1}" is not reparse-free: {2}' -f $Label, $Relative, (@($findings) -join '; '))
  }
  return $record
}

# Every reparse point inside a run directory, for the sealer and for the verifier.
# One enumeration, so the producer and the consumer cannot disagree about whether a
# redirect exists.
function Get-ClashReparsePointFindings {
  param([Parameter(Mandatory = $true)][string]$Root)
  $findings = @()
  if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return @() }
  $rootFull = [System.IO.Path]::GetFullPath($Root)
  foreach ($item in @(Get-ChildItem -LiteralPath $Root -Recurse -Force -ErrorAction SilentlyContinue)) {
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) { continue }
    $rel = ([string]$item.FullName).Substring($rootFull.TrimEnd([char]92, [char]47).Length).TrimStart([char]92, [char]47).Replace([char]92, '/')
    $target = ''
    try { $target = [string]$item.Target } catch { $target = '<unreadable>' }
    $findings += ('{0} is a reparse point that redirects to {1}' -f $rel, $target)
  }
  return @($findings)
}

# RC07: exclusions are exact RELATIVE paths. They used to be matched against the
# file NAME anywhere in the tree, so an attacker's '03-migrations/EVIDENCE-MANIFEST.json'
# or a second '06-complete.json' in a subdirectory vanished from the sealed set
# without a word, and a '.tmp' suffix was excluded on the same basis.
function Get-ClashSealExclusions {
  return @('EVIDENCE-MANIFEST.json', '06-complete.json', '06-complete-unverified.json')
}

# RC07: the sealed set and the "is anything unsealed?" scan must be enumerated by
# ONE function, with hidden and system files included, so the two can never
# disagree about what is in the run directory.
function Get-ClashSealedFileCandidates {
  param([Parameter(Mandatory = $true)][string]$Root)
  $excluded = @(Get-ClashSealExclusions)
  $rows = @()
  foreach ($file in @(Get-ChildItem -LiteralPath $Root -Recurse -File -Force)) {
    # Forward slashes, always: the seal's entry paths are compared with the names
    # the rest of the package uses (03-migrations/<NNN>-<version>.json), so a
    # Windows-style backslash here made every migration receipt "appear 0 time(s)
    # in the seal" and refused every finalization (Round 20 CI).
    $rel = ([string]$file.FullName).Substring($Root.Length).TrimStart('\', '/').Replace('\', '/')
    if ($excluded -ccontains $rel) { continue }
    $rows += [ordered]@{ relative = $rel; path = [string]$file.FullName; bytes = [long]$file.Length }
  }
  return @($rows | Sort-Object { $_.relative })
}

function Seal-Evidence {
  param([Parameter(Mandatory = $true)][string]$Root, [string]$SealName = 'EVIDENCE-MANIFEST.json')

  # RC07: the sealed set comes from ONE enumeration (exact relative-path
  # exclusions, hidden files included), which is the same enumeration the verifier
  # uses for its "anything unsealed?" scan.
  # R20-M2: a tree with a redirect in it is not sealed at all. Sealing it would
  # certify a file set whose bytes live somewhere else.
  $redirects = @(Get-ClashReparsePointFindings -Root $Root)
  if ($redirects.Count -gt 0) {
    throw ('the evidence tree contains {0} reparse point(s) and cannot be sealed: {1}' -f $redirects.Count, ($redirects -join '; '))
  }
  $files = @(Get-ClashSealedFileCandidates -Root $Root)
  $rows = @()
  $chain = 'GENESIS'
  foreach ($f in $files) {
    $rel  = [string]$f['relative']
    $h    = Get-NormalizedSha256 -Path ([string]$f['path'])
    $item = [ordered]@{ path = $rel; bytes = [long]$f['bytes']; sha256 = $h; chain = (Get-TextSha256 -Text ($chain + '|' + $rel + '|' + $h)) }
    $chain = [string]$item['chain']
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
  # R20-M2: the verifier applies the same reparse-point policy as the sealer, so a
  # redirect planted after sealing is a problem and not a silent extra file.
  foreach ($redirect in @(Get-ClashReparsePointFindings -Root $Root)) {
    $problems.Add(('the sealed tree holds a reparse point: {0}' -f $redirect))
  }
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
  # C18-C1: the seal's ROOT is validated on its own. A seal containing `null`
  # used to reject with a silent, EMPTY problem list; a rejection nobody can read
  # is a rejection nobody can act on.
  $sealRoot = Get-ClashJsonRoot -Path $target -Label 'evidence seal' -Kind @('object')
  if (-not $sealRoot['ok']) {
    $problems.Add($sealRoot['problem'])
    return [ordered]@{ ok = $false; problems = @($problems); fileCount = 0; chainHead = ''; sha256 = $sha }
  }
  $seal = $sealRoot['value']
  # The seal is untrusted input, so its SHAPE is part of the verdict: the root
  # must be an object, "files" a JSON array, each entry an object, each entry
  # field a JSON string and fileCount a JSON integer. A wrong type is a rejection;
  # nothing here is coerced into an acceptable value (C17-C1).
  if (-not (Test-ClashJsonKind -Value $seal -Kind 'object')) {
    $problems.Add(('the seal {0} is {1}; a seal must be a JSON object' -f $SealName, (Format-ClashFieldValue -Value $seal)))
    return [ordered]@{ ok = $false; problems = @($problems); fileCount = 0; chainHead = ''; sha256 = $sha }
  }
  $sealFilesField = Get-ClashJsonField -Object $seal -Name 'files'
  $entries = @()
  if ($sealFilesField['kind'] -cne 'array') {
    if ($sealFilesField['kind'] -ceq 'missing' -or $sealFilesField['kind'] -ceq 'null') {
      $problems.Add('the seal lists no files')
    }
    else {
      $problems.Add(('the seal field files is {0}; it must be a JSON array of entries' -f (Format-ClashFieldValue -Value $sealFilesField['value'])))
    }
  }
  else {
    $entries = @($sealFilesField['value'])
  }
  $chain = 'GENESIS'
  $seen = @{}
  foreach ($entry in $entries) {
    if (-not (Test-ClashJsonKind -Value $entry -Kind 'object')) {
      $problems.Add(('the seal lists an entry that is {0}; every entry must be a JSON object' -f (Format-ClashFieldValue -Value $entry)))
      continue
    }
    $entryPathField = Get-ClashJsonField -Object $entry -Name 'path'
    $rel = ''
    if (Test-ClashJsonKind -Value $entryPathField['value'] -Kind 'string') { $rel = [string]$entryPathField['value'] }
    if ([string]::IsNullOrWhiteSpace($rel)) {
      $problems.Add(('the seal contains an entry with no path ({0})' -f (Format-ClashFieldValue -Value $entryPathField['value'])))
      continue
    }
    if ($seen.ContainsKey($rel)) { $problems.Add(('the seal lists {0} twice' -f $rel)) }
    $seen[$rel] = $true
    # RC06: the entry path is resolved WITH containment, so '..\outside.txt' or
    # 'C:\windows\win.ini' is a rejection instead of a read outside the run.
    $contained = Resolve-ClashContainedPath -Root $Root -Relative $rel -Label 'seal entry path'
    if (-not $contained['ok']) { $problems.Add($contained['problem']); continue }
    $full = [string]$contained['path']
    if (-not (Test-Path -LiteralPath $full)) { $problems.Add(('{0} is sealed but missing from disk' -f $rel)); continue }
    if (Test-Path -LiteralPath $full -PathType Container) { $problems.Add(('{0} is sealed but is a directory' -f $rel)); continue }
    $entryShaField = Get-ClashJsonField -Object $entry -Name 'sha256'
    if (-not (Test-ClashJsonKind -Value $entryShaField['value'] -Kind 'string')) {
      $problems.Add(('the seal entry {0} records its hash as {1}; it must be a JSON string' -f $rel, (Format-ClashFieldValue -Value $entryShaField['value'])))
      continue
    }
    $claim = [string]$entryShaField['value']
    $actual = ''
    try { $actual = Get-NormalizedSha256 -Path $full }
    catch { $problems.Add(('{0} could not be read: {1}' -f $rel, (Protect-Text $_.Exception.Message))); continue }
    if ($actual -cne $claim) { $problems.Add(('{0} hash is {1}, the seal says {2}' -f $rel, $actual, $claim)) }
    # RC10: the byte count is part of the entry, and it used to be recorded and
    # never read - a seal entry could claim -999 bytes or "12" and still verify.
    $entryBytesField = Get-ClashJsonField -Object $entry -Name 'bytes'
    if (-not (Test-ClashIntegerValue $entryBytesField['value'])) {
      $problems.Add(('the seal entry {0} records its size as {1}; it must be a JSON integer' -f $rel, (Format-ClashFieldValue -Value $entryBytesField['value'])))
    }
    elseif ([long]$entryBytesField['value'] -lt 0) {
      $problems.Add(('the seal entry {0} records a negative size ({1})' -f $rel, $entryBytesField['value']))
    }
    else {
      $onDisk = -1
      try { $onDisk = [long](Get-Item -LiteralPath $full -Force).Length } catch { $onDisk = -1 }
      if ($onDisk -lt 0) { $problems.Add(('{0} could not be measured on disk' -f $rel)) }
      elseif ($onDisk -ne [long]$entryBytesField['value']) {
        $problems.Add(('{0} is {1} byte(s) on disk, the seal records {2}' -f $rel, $onDisk, $entryBytesField['value']))
      }
    }
    $chain = Get-TextSha256 -Text ($chain + '|' + $rel + '|' + $claim)
    $entryChainField = Get-ClashJsonField -Object $entry -Name 'chain'
    if (-not (Test-ClashJsonKind -Value $entryChainField['value'] -Kind 'string')) {
      $problems.Add(('the seal entry {0} records its chain link as {1}; it must be a JSON string' -f $rel, (Format-ClashFieldValue -Value $entryChainField['value'])))
    }
    elseif ($chain -cne [string]$entryChainField['value']) {
      $problems.Add(('{0} chain link does not re-derive' -f $rel))
    }
  }
  $sealHeadField = Get-ClashJsonField -Object $seal -Name 'chainHead'
  if (-not (Test-ClashJsonKind -Value $sealHeadField['value'] -Kind 'string')) {
    $problems.Add(('the seal chainHead is {0}; it must be a JSON string of 64 lowercase hex characters' -f (Format-ClashFieldValue -Value $sealHeadField['value'])))
  }
  elseif ([string]$sealHeadField['value'] -cne $chain) {
    $problems.Add('the seal chain head does not re-derive from its entries')
  }
  $sealCountField = Get-ClashJsonField -Object $seal -Name 'fileCount'
  if (-not (Test-ClashJsonKind -Value $sealCountField['value'] -Kind 'integer')) {
    $problems.Add(('the seal fileCount is {0}; it must be a JSON integer' -f (Format-ClashFieldValue -Value $sealCountField['value'])))
  }
  elseif ([int]$sealCountField['value'] -ne $entries.Count) {
    $problems.Add(('the seal says {0} file(s) but lists {1}' -f $sealCountField['value'], $entries.Count))
  }
  # RC10: the seal's own metadata is typed as well. A seal whose adapter identity
  # is ["clash-native-adapter/5.6.0"] or whose sealedUtc is not a timestamp cannot
  # be compared with a marker, so it is rejected here rather than coerced later.
  $sealAdapterField = Get-ClashJsonField -Object $seal -Name 'adapter'
  if (-not (Test-ClashJsonKind -Value $sealAdapterField['value'] -Kind 'string')) {
    $problems.Add(('the seal adapter is {0}; it must be a JSON string' -f (Format-ClashFieldValue -Value $sealAdapterField['value'])))
  }
  elseif ([string]::IsNullOrWhiteSpace([string]$sealAdapterField['value'])) {
    $problems.Add('the seal records an empty adapter identity')
  }
  $sealedUtcField = Get-ClashJsonField -Object $seal -Name 'sealedUtc'
  $sealedUtcOk = $false
  if (Test-ClashJsonKind -Value $sealedUtcField['value'] -Kind 'string') {
    $sealedUtcParsed = [datetime]::MinValue
    $sealedUtcOk = [datetime]::TryParse([string]$sealedUtcField['value'], [System.Globalization.CultureInfo]::InvariantCulture,
      [System.Globalization.DateTimeStyles]::RoundtripKind, [ref]$sealedUtcParsed)
  }
  if (-not $sealedUtcOk) {
    $problems.Add(('the seal sealedUtc is {0}; it must be a parseable ISO-8601 timestamp' -f (Format-ClashFieldValue -Value $sealedUtcField['value'])))
  }
  foreach ($required in @($Require)) {
    if ([string]::IsNullOrWhiteSpace($required)) { continue }
    $hit = @($entries | Where-Object {
        $requiredPath = (Get-ClashJsonField -Object $_ -Name 'path')['value']
        (Test-ClashJsonKind -Value $requiredPath -Kind 'string') -and ($requiredPath -ceq $required)
      }).Count
    if ($hit -ne 1) { $problems.Add(('required evidence {0} appears {1} time(s) in the seal' -f $required, $hit)) }
  }
  # Anything present but unsealed means evidence was written after the seal - the
  # exact shape of R15-C1 - so it is reported rather than ignored. RC07: the scan
  # uses the SAME enumeration as the seal (hidden files included, exclusions by
  # exact relative path), so a hidden file or a '.tmp' can no longer hide.
  foreach ($file in @(Get-ClashSealedFileCandidates -Root $Root)) {
    $rel = [string]$file['relative']
    if (-not $seen.ContainsKey($rel)) { $problems.Add(('{0} exists in the run but is not sealed' -f $rel)) }
  }
  return [ordered]@{ ok = ($problems.Count -eq 0); problems = @($problems); fileCount = $entries.Count; chainHead = $chain; sha256 = $sha }
}

# ============================================================================
# TYPED DOCUMENT BOUNDARY (RC01-RC11)
#
# One place where an untrusted JSON field becomes a decision. Everything below
# follows the same three steps and nothing else may replace them:
#
#   1. read the field with Get-ClashJsonField   -> present / kind / value
#   2. test the KIND                             -> a string is not a boolean,
#                                                   ["x"] is not "x", 6.0 is not 6
#   3. compare the VALUE                         -> -ceq / -cne on strings,
#                                                   -cne $true on booleans, exact
#                                                   integer arithmetic on numbers
#
# There is no truthiness, no [int] cast of untrusted text, no -ne on an array (PS
# filters instead of comparing) and no comparison that a null guard can skip.
# "Assert-" below means "append a problem if this assertion does not hold": these
# functions never throw, never convert and never repair.
# ============================================================================

function New-ClashFieldProblem {
  param([string]$Label, [string]$Field, $Value, [string]$Expected)
  return ('{0}.{1} is {2}; it must be {3}' -f $Label, $Field, (Format-ClashFieldValue -Value $Value), $Expected)
}

# A JSON string that is present, of kind string, and not blank unless allowed.
function Assert-ClashTextField {
  param($Object, [string]$Label, [string]$Field, $Problems, [switch]$AllowEmpty)
  $f = Get-ClashJsonField -Object $Object -Name $Field
  if (-not $f['present']) { $Problems.Add((New-ClashFieldProblem $Label $Field '<missing>' 'a JSON string')) ; return '' }
  if ($f['kind'] -cne 'string') { $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) 'a JSON string')) ; return '' }
  $text = [string]$f['value']
  if (-not $AllowEmpty -and [string]::IsNullOrWhiteSpace($text)) {
    $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) 'a non-empty JSON string'))
    return ''
  }
  return $text
}

# A JSON string that must equal an exact literal (ordinal, case sensitive).
function Assert-ClashStringEquals {
  param($Object, [string]$Label, [string]$Field, [string]$Expected, $Problems)
  $f = Get-ClashJsonField -Object $Object -Name $Field
  if (-not $f['present']) { $Problems.Add((New-ClashFieldProblem $Label $Field '<missing>' ('the string "{0}"' -f $Expected))) ; return }
  if ($f['kind'] -cne 'string') { $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) ('the string "{0}"' -f $Expected))) ; return }
  if ([string]$f['value'] -cne $Expected) {
    $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) ('the string "{0}"' -f $Expected)))
  }
}

# A JSON boolean. -RequireTrue demands the exact boolean true.
function Assert-ClashBooleanField {
  param($Object, [string]$Label, [string]$Field, $Problems, [switch]$RequireTrue)
  $f = Get-ClashJsonField -Object $Object -Name $Field
  if (-not $f['present']) { $Problems.Add((New-ClashFieldProblem $Label $Field '<missing>' 'a JSON boolean')) ; return }
  if ($f['kind'] -cne 'boolean') { $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) 'a JSON boolean')) ; return }
  if ($RequireTrue -and ($f['value'] -cne $true)) {
    $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) 'the JSON boolean true'))
  }
}

# A JSON integer in [Min, Max]; -Expect pins one exact value.
function Assert-ClashIntegerField {
  param($Object, [string]$Label, [string]$Field, $Problems, $Min = $null, $Max = $null, [long]$Expect = 0, [switch]$ExpectSet)
  $f = Get-ClashJsonField -Object $Object -Name $Field
  $bounds = 'a JSON integer'
  if (($null -ne $Min) -and ($null -ne $Max)) { $bounds = ('a JSON integer between {0} and {1}' -f $Min, $Max) }
  elseif ($null -ne $Min) { $bounds = ('a JSON integer of at least {0}' -f $Min) }
  elseif ($null -ne $Max) { $bounds = ('a JSON integer of at most {0}' -f $Max) }
  if (-not $f['present']) { $Problems.Add((New-ClashFieldProblem $Label $Field '<missing>' $bounds)) ; return }
  if (-not (Test-ClashIntegerValue $f['value'])) {
    $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) $bounds))
    return
  }
  $v = [long]$f['value']
  if (($null -ne $Min) -and ($v -lt [long]$Min)) {
    $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) $bounds))
    return
  }
  if (($null -ne $Max) -and ($v -gt [long]$Max)) {
    $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) $bounds))
    return
  }
  if ($ExpectSet -and ($v -ne $Expect)) {
    $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) ('the JSON integer {0}' -f $Expect)))
  }
}

# 64 lowercase hex characters.
function Assert-ClashHexField {
  param($Object, [string]$Label, [string]$Field, $Problems)
  $f = Get-ClashJsonField -Object $Object -Name $Field
  if (-not (Test-ClashSha256Text $f['value'])) {
    $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) 'a 64-character lowercase hex digest'))
  }
}

# A JSON array whose items are all strings and whose length is at least MinCount.
function Assert-ClashStringArrayField {
  param($Object, [string]$Label, [string]$Field, $Problems, [int]$MinCount = 1)
  $f = Get-ClashJsonField -Object $Object -Name $Field
  if ($f['kind'] -cne 'array') {
    $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) ('a JSON array of at least {0} string(s)' -f $MinCount)))
    return @()
  }
  $items = @($f['value'])
  if ($items.Count -lt $MinCount) {
    $Problems.Add((New-ClashFieldProblem $Label $Field ($f['value']) ('a JSON array of at least {0} string(s)' -f $MinCount)))
  }
  foreach ($item in $items) {
    if (-not ($item -is [string])) {
      $Problems.Add((New-ClashFieldProblem $Label $Field $item 'a JSON array of plain strings'))
      return $items
    }
  }
  return $items
}

# The header every receipt written by Add-Receipt carries.
function Assert-ClashReceiptHeader {
  param($Object, [string]$Label, [string]$Name, $Problems, [string]$AdapterKind = 'string')
  Assert-ClashStringEquals -Object $Object -Label $Label -Field 'receipt' -Expected $Name -Problems $Problems
  $utc = Assert-ClashTextField -Object $Object -Label $Label -Field 'utc' -Problems $Problems
  if ($utc.Length -gt 0) {
    $parsed = [datetime]::MinValue
    $okUtc = [datetime]::TryParse($utc, [System.Globalization.CultureInfo]::InvariantCulture,
      [System.Globalization.DateTimeStyles]::RoundtripKind, [ref]$parsed)
    if (-not $okUtc) { $Problems.Add((New-ClashFieldProblem $Label 'utc' $utc 'a parseable ISO-8601 timestamp')) }
  }
  if ($AdapterKind -ceq 'object') {
    $af = Get-ClashJsonField -Object $Object -Name 'adapter'
    if (-not (Test-ClashJsonKind -Value $af['value'] -Kind 'object')) {
      $Problems.Add((New-ClashFieldProblem $Label 'adapter' $af['value'] 'a JSON object (the adapter proof)'))
    }
  }
  else {
    [void](Assert-ClashTextField -Object $Object -Label $Label -Field 'adapter' -Problems $Problems)
  }
  $prev = Get-ClashJsonField -Object $Object -Name 'prevReceiptSha'
  if ($prev['kind'] -cne 'string') {
    $Problems.Add((New-ClashFieldProblem $Label 'prevReceiptSha' $prev['value'] 'a JSON string (a digest or GENESIS)'))
  }
  elseif (([string]$prev['value'] -cne 'GENESIS') -and (-not (Test-ClashSha256Text $prev['value']))) {
    $Problems.Add((New-ClashFieldProblem $Label 'prevReceiptSha' $prev['value'] 'GENESIS or a 64-character lowercase hex digest'))
  }
}

# The three verification receipts share one schema, so they share one validator.
# Everything a verdict depends on is typed, and the internal arithmetic of the
# receipt must hold on its own: a receipt that says rows=21 while its own counters
# sum to 19 is not evidence, whatever its status line says.
function Test-ClashReportReceipt {
  param([Parameter(Mandatory = $true)][string]$Root, [Parameter(Mandatory = $true)][string]$Name, [Parameter(Mandatory = $true)][string]$ContractName, [Parameter(Mandatory = $true)][int]$GatingExpected, [Parameter(Mandatory = $true)][int]$InfoExpected)

  $problems = New-Object System.Collections.Generic.List[string]
  $path = Join-Path $Root $Name
  # NOT `$root`: PowerShell variable names are case-insensitive, so `$root` IS the
  # [string]$Root parameter, and assigning the verdict record to it converts the
  # record to 'System.Collections.Hashtable'. Indexing that string yields nothing,
  # so every document looked like an empty root failure - six of them, once per
  # report and per migration receipt. (Round 20 CI.)
  $docRoot = Get-ClashJsonRoot -Path $path -Label ('phase receipt ' + $Name) -Kind @('object')
  if (-not $docRoot['ok']) {
    $problems.Add(('{0} root: ok=[{1}] state=[{2}] kind=[{3}] problem=[{4}]' -f $Name,
        [string]($docRoot['ok']), [string]($docRoot['state']), [string]($docRoot['kind']), [string]($docRoot['problem'])))
    return [ordered]@{ ok = $false; problems = @($problems); status = '' }
  }
  $doc = $docRoot['value']
  $label = $Name
  Assert-ClashReceiptHeader -Object $doc -Label $label -Name $Name -Problems $problems
  $status = Assert-ClashTextField -Object $doc -Label $label -Field 'status' -Problems $problems
  if (($status.Length -gt 0) -and ($status -cne 'PASS')) {
    $problems.Add((New-ClashFieldProblem $label 'status' $status 'PASS: a required phase cannot authorise completion with any other status'))
  }
  $outcome = Assert-ClashTextField -Object $doc -Label $label -Field 'outcome' -Problems $problems
  if (($outcome.Length -gt 0) -and ($outcome -cne 'SUCCEEDED')) {
    $problems.Add((New-ClashFieldProblem $label 'outcome' $outcome 'SUCCEEDED'))
  }
  Assert-ClashIntegerField -Object $doc -Label $label -Field 'exitCode' -Problems $problems -Expect 0 -ExpectSet
  Assert-ClashBooleanField -Object $doc -Label $label -Field 'timedOut' -Problems $problems
  $timedOut = (Get-ClashJsonField -Object $doc -Name 'timedOut')['value']
  if ((Test-ClashJsonKind -Value $timedOut -Kind 'boolean') -and ($timedOut -ceq $true)) {
    $problems.Add((New-ClashFieldProblem $label 'timedOut' $timedOut 'the JSON boolean false'))
  }
  Assert-ClashIntegerField -Object $doc -Label $label -Field 'rows' -Problems $problems -Min 0
  Assert-ClashIntegerField -Object $doc -Label $label -Field 'passRows' -Problems $problems -Min 0 -Expect $GatingExpected -ExpectSet
  Assert-ClashIntegerField -Object $doc -Label $label -Field 'failRows' -Problems $problems -Min 0 -Expect 0 -ExpectSet
  Assert-ClashIntegerField -Object $doc -Label $label -Field 'infoRows' -Problems $problems -Min 0 -Expect $InfoExpected -ExpectSet
  Assert-ClashIntegerField -Object $doc -Label $label -Field 'gatingExpected' -Problems $problems -Expect $GatingExpected -ExpectSet
  Assert-ClashIntegerField -Object $doc -Label $label -Field 'infoExpected' -Problems $problems -Expect $InfoExpected -ExpectSet
  Assert-ClashIntegerField -Object $doc -Label $label -Field 'footerRows' -Problems $problems -Min 0
  Assert-ClashBooleanField -Object $doc -Label $label -Field 'captureComplete' -Problems $problems -RequireTrue
  Assert-ClashBooleanField -Object $doc -Label $label -Field 'headerSeen' -Problems $problems -RequireTrue
  Assert-ClashBooleanField -Object $doc -Label $label -Field 'separatorSeen' -Problems $problems -RequireTrue
  Assert-ClashBooleanField -Object $doc -Label $label -Field 'footerSeen' -Problems $problems -RequireTrue
  Assert-ClashStringEquals -Object $doc -Label $label -Field 'reportContract' -Expected $ContractName -Problems $problems
  $listed = Assert-ClashStringArrayField -Object $doc -Label $label -Field 'problems' -Problems $problems -MinCount 0
  if (@($listed).Count -gt 0) {
    $problems.Add(('{0}.problems lists {1} problem(s): {2}' -f $label, @($listed).Count, (@($listed) -join '; ')))
  }
  # internal arithmetic: the counters must describe the same report
  $rowsField = Get-ClashJsonField -Object $doc -Name 'rows'
  $passField = Get-ClashJsonField -Object $doc -Name 'passRows'
  $failField = Get-ClashJsonField -Object $doc -Name 'failRows'
  $infoField = Get-ClashJsonField -Object $doc -Name 'infoRows'
  $footField = Get-ClashJsonField -Object $doc -Name 'footerRows'
  if ((Test-ClashIntegerValue $rowsField['value']) -and (Test-ClashIntegerValue $passField['value']) -and
      (Test-ClashIntegerValue $failField['value']) -and (Test-ClashIntegerValue $infoField['value'])) {
    $sum = [long]$passField['value'] + [long]$failField['value'] + [long]$infoField['value']
    if ([long]$rowsField['value'] -ne $sum) {
      $problems.Add(('{0}.rows is {1} but its own counters sum to {2}' -f $label, $rowsField['value'], $sum))
    }
  }
  if ((Test-ClashIntegerValue $rowsField['value']) -and (Test-ClashIntegerValue $footField['value'])) {
    if ([long]$rowsField['value'] -ne [long]$footField['value']) {
      $problems.Add(('{0}.footerRows is {1} but the receipt parsed {2} row(s)' -f $label, $footField['value'], $rowsField['value']))
    }
  }
  return [ordered]@{ ok = ($problems.Count -eq 0); problems = @($problems); status = $status }
}

# Round 22 (C21-01/C21-02): ONE receipt chain, and ONE canonical place for the
# applied receipt.
#
# The runner writes 03-migrations/<NNN>-<version>.json and then,
# on success, <NNN>-<version>-applied.json AT THE RUN ROOT; the applied receipt is
# what the next migration chains from. The verifier used to look for the applied
# receipt inside 03-migrations, so an actual writer-produced stream could never be
# verified. This function is the single definition of that path, used by the writer
# and by the verifier.
function Get-ClashAppliedReceiptRelative {
  param(
    [Parameter(Mandatory = $true)][int]$Index,
    [Parameter(Mandatory = $true)][string]$Version
  )
  return ('{0:D3}-{1}-applied.json' -f $Index, $Version)
}

# The protocol phase a receipt belongs to, in the order the runner writes them.
# A receipt that cannot be placed is a problem: the chain is a sequence, not a bag.
function Get-ClashReceiptPhaseRank {
  param([string]$Relative)

  # The rank is the protocol phase a receipt belongs to, derived from the name the
  # runner writes. It exists to detect a receipt that was written out of order, so it
  # must cover the runner's WHOLE vocabulary - including its failure receipts - or a
  # legitimate run would be refused for a name the map simply did not know.
  $rel = ([string]$Relative).Replace('\', '/')
  $leaf = @($rel -split '/')[-1]
  if ($leaf -clike '*-applied.json') { return 50 }          # per-migration applied receipt
  if ($leaf -clike '*-digest-detail.json') { return 50 }    # per-migration digest detail
  $bands = @(
    @{ pattern = '^03-migrations/'; rank = 50 }
    @{ pattern = '^01-gates/';      rank = 15 }
    @{ pattern = '^00-';            rank = 0 }
    @{ pattern = '^01-integrity';   rank = 10 }
    @{ pattern = '^01-approved';    rank = 15 }
    @{ pattern = '^01b-';           rank = 20 }
    @{ pattern = '^02-';            rank = 30 }
    @{ pattern = '^03-ledger';      rank = 40 }
    @{ pattern = '^03b-';           rank = 40 }
    @{ pattern = '^03c-';           rank = 45 }
    @{ pattern = '^04-';            rank = 55 }
    @{ pattern = '^05-';            rank = 60 }
    @{ pattern = '^06-claim-release'; rank = 70 }
    @{ pattern = '^06-finalization-intent'; rank = 78 }
    @{ pattern = '^06-finalize-fail'; rank = 79 }
    @{ pattern = '^06-complete';    rank = 80 }
    @{ pattern = '^99-';            rank = 90 }
  )
  foreach ($band in $bands) {
    if ($rel -match [string]$band.pattern) { return [int]$band.rank }
  }
  return -1
}

# Round 22 (C21-02). The chain is verified as ONE ORDERED PATH over every receipt
# in the run, because the Round 21 verifier only compared a migration receipt with
# the receipt before it: an unrelated postflight predecessor - the exact Round 20
# reproduction - was still accepted, and GENESIS acted as an exemption from the link
# rule anywhere in the sequence.
function Get-ClashReceiptChain {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [string[]]$Exclude = @()
  )

  $problems = New-Object System.Collections.Generic.List[string]
  $rows = @()
  $rootFull = [System.IO.Path]::GetFullPath($Root)
  foreach ($file in @(Get-ChildItem -LiteralPath $Root -Recurse -File -Force -Filter '*.json')) {
    $rel = ([string]$file.FullName).Substring($rootFull.TrimEnd([char]92, [char]47).Length).TrimStart([char]92, [char]47).Replace([char]92, '/')
    if (@($Exclude) -ccontains $rel) { continue }
    $docRoot = Get-ClashJsonRoot -Path $file.FullName -Label ('receipt ' + $rel) -Kind @('object')
    if (-not $docRoot['ok']) {
      $problems.Add(('{0} is not a JSON object receipt: {1}' -f $rel, [string]$docRoot['problem']))
      continue
    }
    $prevField = Get-ClashJsonField -Object $docRoot['value'] -Name 'prevReceiptSha'
    if (-not (Test-ClashJsonKind -Value $prevField['value'] -Kind 'string')) {
      $problems.Add(('{0} does not declare prevReceiptSha as a JSON string, so it cannot be placed in the receipt chain' -f $rel))
      continue
    }
    $prev = [string]$prevField['value']
    if (($prev -cne 'GENESIS') -and (-not (Test-ClashSha256Text $prev))) {
      $problems.Add((New-ClashFieldProblem $rel 'prevReceiptSha' $prev 'GENESIS or the sha256 of the receipt written before it'))
      continue
    }
    $rows += [ordered]@{
      relative = $rel
      prev     = $prev
      sha      = (Get-NormalizedSha256 -Path $file.FullName)
      rank     = (Get-ClashReceiptPhaseRank -Relative $rel)
    }
  }
  if (@($rows).Count -eq 0) {
    $problems.Add('the run holds no chained receipt at all')
    return [ordered]@{ ok = $false; problems = @($problems); order = @(); count = 0 }
  }

  $bySha = @{}
  foreach ($row in $rows) {
    if ($bySha.ContainsKey([string]$row.sha)) {
      $problems.Add(('{0} and {1} have the same content, so the chain cannot tell them apart' -f $bySha[[string]$row.sha], $row.relative))
    }
    else { $bySha[[string]$row.sha] = [string]$row.relative }
  }
  $genesis = @($rows | Where-Object { $_.prev -ceq 'GENESIS' })
  if ($genesis.Count -ne 1) {
    $names = @($genesis | ForEach-Object { [string]$_.relative })
    $problems.Add(('{0} receipt(s) declare prevReceiptSha=GENESIS ({1}); exactly one receipt starts the chain, and GENESIS is never an exemption for an interior link' -f $genesis.Count, ($names -join ', ')))
    if ($genesis.Count -eq 0) {
      return [ordered]@{ ok = $false; problems = @($problems); order = @(); count = @($rows).Count }
    }
  }

  $order = @()
  $visited = @{}
  $current = [string]$genesis[0].relative
  while ($true) {
    if ($visited.ContainsKey($current)) {
      $problems.Add(('the receipt chain revisits {0}; a chain that loops is not a sequence' -f $current))
      break
    }
    $visited[$current] = $true
    $order += $current
    $currentRow = @($rows | Where-Object { $_.relative -ceq $current })[0]
    $successors = @($rows | Where-Object { $_.prev -ceq [string]$currentRow.sha })
    if ($successors.Count -gt 1) {
      $names = @($successors | ForEach-Object { [string]$_.relative })
      $problems.Add(('{0} receipt(s) chain from {1} ({2}); the chain forks' -f $successors.Count, $current, ($names -join ', ')))
      break
    }
    if ($successors.Count -eq 0) { break }
    $current = [string]$successors[0].relative
  }

  foreach ($row in $rows) {
    if ($visited.ContainsKey([string]$row.relative)) { continue }
    $problems.Add(('{0} is not reachable from the start of the receipt chain: it either chains from a digest that is no receipt in this run ({1}) or it sits in a cycle' -f $row.relative, $(if ($row.prev -ceq 'GENESIS') { 'GENESIS' } else { ([string]$row.prev).Substring(0, 12) + '...' })))
  }

  $lastRank = -1
  $lastName = ''
  foreach ($rel in $order) {
    $row = @($rows | Where-Object { $_.relative -ceq $rel })[0]
    if ([int]$row.rank -lt 0) {
      $problems.Add(('{0} is a receipt the protocol does not place in any phase, so the chain cannot be ordered' -f $rel))
      continue
    }
    if ([int]$row.rank -lt $lastRank) {
      $problems.Add(('{0} is written after {1} in the chain but belongs to an earlier protocol phase' -f $rel, $lastName))
    }
    $lastRank = [int]$row.rank
    $lastName = $rel
  }

  return [ordered]@{ ok = (@($problems).Count -eq 0); problems = @($problems); order = @($order); count = @($rows).Count }
}

# Every per-migration receipt the runner writes is named 03-migrations/<NNN>-<version>.json.
function Get-ClashMigrationReceiptNames {
  param([Parameter(Mandatory = $true)][string]$Root)
  $dir = Join-Path $Root '03-migrations'
  $names = @()
  if (-not (Test-Path -LiteralPath $dir)) { return @() }
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { return @() }
  foreach ($file in @(Get-ChildItem -LiteralPath $dir -File -Force)) {
    $leaf = [string]$file.Name
    if ($leaf -notmatch '\.json$') { continue }
    $names += ('03-migrations/' + $leaf)
  }
  return @($names | Sort-Object)
}

# Round 23 (C22-M1). ONE closed receipt vocabulary, and one semantic success
# contract over it.
#
# The Round 22 verifier asked two questions: does each APPROVED per-migration
# receipt say the right thing, and does the chain form one ordered path? Both can be
# answered "yes" while the run also holds receipts nobody approved - a nested
# 03-migrations/extra/999-unapproved.json, an unlisted 04-unexpected.json, a second
# 04-supplement.json recording FAIL - and while an applied or ownership receipt says
# the opposite of the completion it is supposed to support.
#
# A graph is ordering, not permission. The inventory below is the closed set of
# receipt paths the runner may write (its whole vocabulary, plus the names derived
# from the approved manifest); anything else is evidence the approved package does
# not describe. The semantic pass then requires every receipt that carries a status
# to carry the status its TYPE is allowed to carry, and validates the applied and
# ownership receipts against their own success contract.
function Get-ClashReceiptVocabulary {
  # Every receipt name deploy.ps1 can write, including its failure receipts: a
  # closed inventory must describe the runner, not just its happy path, or a
  # legitimate failed run would be refused for holding an undeclared name.
  $names = @(
    '00-baseline.json'
    '00-baseline-fail.json'
    '00-baseline-dirty.json'
    '00-baseline-git.json'
    '01-gates/input-unapproved.json'
    '01-gates/input-unverified.json'
    '01-integrity.json'
    '01-integrity-fail.json'
    '01-approved-inventory.json'
    '01b-approved.json'
    '02-preflight.json'
    '02-preflight-fail.json'
    '02-preflight-rows.json'
    '03-ledger.json'
    '03-ledger-fail.json'
    '03-ledger-probe.json'
    '03-ledger-probe-fail.json'
    '03-ledger-probe-weird.json'
    '03-ledger-not-empty.json'
    '03-ledger-parse.json'
    '03-ledger-parse-stop.json'
    '03b-bootstrap-digest.json'
    '03b-bootstrap-digest-stop.json'
    '03b-bootstrap.json'
    '03b-bootstrap-fail.json'
    '03b-bootstrap-missing.json'
    '03b-bootstrap-unproven.json'
    '03b-bootstrap-nonempty.json'
    '03b-schema.json'
    '03b-schema-stop.json'
    '03c-writer-claim.json'
    '03c-writer-claim-stop.json'
    '04-postflight.json'
    '04-postflight-fail.json'
    '05-storage.json'
    '05-storage-fail.json'
    '06-claim-release-ownership.json'
    '06-claim-release-ownership-stop.json'
    '06-claim-release.json'
    '06-claim-release-fail.json'
    '06-finalization-intent.json'
    '06-finalize-fail.json'
    '06-complete.json'
    '06-complete-unverified.json'
    '99-runner-exception.json'
    'STOP.json'
  )
  return $names
}

# The exact path set a run may hold, derived from the runner vocabulary and the
# APPROVED manifest. Nothing in the run directory can extend it.
function Get-ClashDeclaredReceiptNames {
  param($Approved)

  $declared = @()
  foreach ($name in @(Get-ClashReceiptVocabulary)) { $declared += [string]$name }
  $approvedEntries = @()
  if ($null -ne $Approved) { $approvedEntries = @($Approved.entries) }
  foreach ($entry in $approvedEntries) {
    $label = ('{0:D3}-{1}' -f [int]$entry.index, [string]$entry.version)
    $declared += ('03-migrations/' + $label + '.json')
    $declared += ('03-migrations/' + $label + '.sql')
    $declared += ($label + '-applied.json')
    $declared += ($label + '-digest-detail.json')
    $declared += ($label + '-missing.json')
    $declared += ($label + '-digest.json')
    $declared += ($label + '-digest-detail-stop.json')
    $declared += ($label + '-unproven.json')
    $declared += ($label + '-ledger-mismatch.json')
    $declared += ('03-migrations/' + $label + '-failed.json')
    $declared += ($label + '-failed.json')
  }
  return @($declared)
}

# Closed inventory: every JSON under the run must be a declared receipt.
function Test-ClashReceiptInventory {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    $Approved = $null
  )

  $problems = New-Object System.Collections.Generic.List[string]
  $declared = @(Get-ClashDeclaredReceiptNames -Approved $Approved)
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd([char]92, [char]47)
  foreach ($file in @(Get-ChildItem -LiteralPath $Root -Recurse -File -Force -Filter '*.json')) {
    $rel = ([string]$file.FullName).Substring($rootFull.Length).TrimStart([char]92, [char]47).Replace([char]92, '/')
    if ($rel -ceq 'EVIDENCE-MANIFEST.json') { continue }
    # Round 24 (F1): the canonical text contract applies to every file the run holds,
    # not only to SQL. A receipt is evidence; evidence that two readers can split
    # differently is not evidence.
    $fileCanonical = ''
    try { $fileCanonical = Get-ClashCanonicalTextProblem -Text ([System.IO.File]::ReadAllText($file.FullName)) -Label $rel }
    catch { $fileCanonical = '' }
    if ($fileCanonical.Length -gt 0) { $problems.Add($fileCanonical) }
    if ($declared -ccontains $rel) { continue }
    if ($rel -clike '03-migrations/*/*') {
      $problems.Add(('{0} is a receipt nested inside 03-migrations; every per-migration receipt belongs directly in 03-migrations/ and must name an approved migration' -f $rel))
      continue
    }
    $problems.Add(('{0} is not a receipt this protocol declares; a completed run cannot hold evidence the approved package does not describe' -f $rel))
  }
  return @($problems)
}

# Semantic success contract: a receipt may not say the opposite of the completion it
# supports, and the receipts that carry the deployment's success claims (the applied
# receipts and the claim-ownership record) are validated field by field.
function Test-ClashReceiptSemantics {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    $Approved = $null
  )

  $problems = New-Object System.Collections.Generic.List[string]
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd([char]92, [char]47)
  # The status each receipt TYPE is allowed to carry. Every other status - FAIL,
  # STOP, EXCEPTION, UNKNOWN, UNPROVEN, a non-string, an empty string - contradicts a
  # completed deployment, whatever the receipt is called.
  $typedStatus = @{
    '00-baseline.json'              = 'BASELINE'
    '06-finalization-intent.json'   = 'FINALIZING'
    '06-complete.json'              = 'COMPLETE'
  }
  # Receipts whose status is ALREADY owned by a dedicated validator: the baseline,
  # the integrity gate, the three report contracts, the claim release, the applied
  # receipts and the ownership record. The rule below does not restate theirs - two
  # guards on one field make a mutation control unable to isolate either of them, and
  # a second copy of a rule is a second place for it to drift.
  $ownedElsewhere = @(
    '00-baseline.json'
    '01-integrity.json'
    '02-preflight.json'
    '04-postflight.json'
    '05-storage.json'
    '06-claim-release.json'
    '06-claim-release-ownership.json'
  )
  foreach ($file in @(Get-ChildItem -LiteralPath $Root -Recurse -File -Force -Filter '*.json')) {
    $rel = ([string]$file.FullName).Substring($rootFull.Length).TrimStart([char]92, [char]47).Replace([char]92, '/')
    if ($rel -ceq 'EVIDENCE-MANIFEST.json') { continue }
    $docRoot = $null
    try { $docRoot = Get-ClashJsonRoot -Path $file.FullName -Label ('receipt ' + $rel) -Kind @('object') }
    catch { $docRoot = $null }
    if (($null -eq $docRoot) -or (-not $docRoot['ok'])) {
      $problems.Add(('{0} could not be read as a JSON receipt, so the run cannot be certified complete' -f $rel))
      continue
    }
    $doc = $docRoot['value']
    if (($ownedElsewhere -ccontains $rel) -or ($rel -clike '03-migrations/*') -or ($rel -clike '*-applied.json')) { continue }
    $statusField = Get-ClashJsonField -Object $doc -Name 'status'
    if ($statusField['kind'] -ceq 'missing') {
      # Round 24 (F3): "no status" was treated as "nothing to contradict". A receipt
      # that does not state an outcome states nothing, and silence is not success: a
      # receipt the protocol declares must carry its status.
      $problems.Add(('{0} declares no status; a run receipt must state the outcome it records, and an absent status is not a success' -f $rel))
      continue
    }
    $expected = 'PASS'
    if ($typedStatus.ContainsKey($rel)) { $expected = [string]$typedStatus[$rel] }
    if (-not (Test-ClashJsonKind -Value $statusField['value'] -Kind 'string')) {
      $problems.Add(('{0} records status {1}; a completion record must state its outcome as a JSON string' -f $rel, (Format-ClashFieldValue -Value $statusField['value'])))
      continue
    }
    $status = [string]$statusField['value']
    if ($status -cne $expected) {
      $problems.Add(('{0} records status "{1}"; a completed deployment cannot hold a receipt that does not say "{2}"' -f $rel, $status, $expected))
    }
  }

  # ---- the applied receipts: one per approved migration, and it must say COMMITTED
  $approvedEntries = @()
  if ($null -ne $Approved) { $approvedEntries = @($Approved.entries) }
  foreach ($entry in $approvedEntries) {
    $rel = Get-ClashAppliedReceiptRelative -Index ([int]$entry.index) -Version ([string]$entry.version)
    $abs = Join-Path $Root ($rel.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $abs -PathType Leaf)) {
      $problems.Add(('no applied receipt exists for approved migration {0} ({1}): {2} is what the next migration chains from' -f [string]$entry.index, [string]$entry.version, $rel))
      continue
    }
    $docRoot = Get-ClashJsonRoot -Path $abs -Label ('applied receipt ' + $rel) -Kind @('object')
    if (-not $docRoot['ok']) { $problems.Add(('{0}: {1}' -f $rel, [string]$docRoot['problem'])); continue }
    $doc = $docRoot['value']
    # Round 23: a distinct local name, so the RC02 mutant's unique anchor
    # (the phase-status guard) stays unique in this file - the mutation harness
    # refuses to guess which of two identical guards it should drop.
    $appliedStatus = Assert-ClashTextField -Object $doc -Label $rel -Field 'status' -Problems $problems
    if (($appliedStatus.Length -gt 0) -and ($appliedStatus -cne 'PASS')) {
      $problems.Add((New-ClashFieldProblem $rel 'status' $appliedStatus 'PASS: an applied migration that did not commit cannot support a completed deployment'))
    }
    $outcome = Assert-ClashTextField -Object $doc -Label $rel -Field 'outcome' -Problems $problems
    if (($outcome.Length -gt 0) -and ($outcome -cne 'COMMITTED')) {
      $problems.Add((New-ClashFieldProblem $rel 'outcome' $outcome 'COMMITTED'))
    }
    $version = Assert-ClashTextField -Object $doc -Label $rel -Field 'version' -Problems $problems
    if (($version.Length -gt 0) -and ($version -cne [string]$entry.version)) {
      $problems.Add((New-ClashFieldProblem $rel 'version' $version ('the approved version "{0}"' -f [string]$entry.version)))
    }
  }

  # ---- the claim-ownership record: PASS, at least one row, and THIS run's row
  $ownerRel = '06-claim-release-ownership.json'
  $ownerAbs = Join-Path $Root $ownerRel
  if (-not (Test-Path -LiteralPath $ownerAbs -PathType Leaf)) {
    $problems.Add(('no {0} exists: releasing the exclusive-writer claim must be PROVEN, not assumed' -f $ownerRel))
  }
  else {
    $ownerRoot = Get-ClashJsonRoot -Path $ownerAbs -Label 'claim release ownership receipt' -Kind @('object')
    if (-not $ownerRoot['ok']) { $problems.Add(('{0}: {1}' -f $ownerRel, [string]$ownerRoot['problem'])) }
    else {
      $owner = $ownerRoot['value']
      $ownerStatus = Assert-ClashTextField -Object $owner -Label $ownerRel -Field 'status' -Problems $problems
      if (($ownerStatus.Length -gt 0) -and ($ownerStatus -cne 'PASS')) {
        $problems.Add((New-ClashFieldProblem $ownerRel 'status' $ownerStatus 'PASS: the delete that released the claim must have removed exactly this run''s row'))
      }
      $rowsField = Get-ClashJsonField -Object $owner -Name 'returnedRows'
      if (-not (Test-ClashIntegerValue $rowsField['value'])) {
        $problems.Add((New-ClashFieldProblem $ownerRel 'returnedRows' ($rowsField['value']) 'the number of rows the release returned, as a JSON integer'))
      }
      elseif ([long]$rowsField['value'] -lt 1) {
        $problems.Add((New-ClashFieldProblem $ownerRel 'returnedRows' $rowsField['value'] 'at least one row: a release that removed nothing did not release this run''s claim'))
      }
      $releaseRoot = Get-ClashJsonRoot -Path (Join-Path $Root '06-claim-release.json') -Label 'claim release receipt' -Kind @('object')
      if ($releaseRoot['ok']) {
        $runId = [string](Get-ClashJsonField -Object $releaseRoot['value'] -Name 'runId')['value']
        $expectedRunId = [string](Get-ClashJsonField -Object $owner -Name 'expectedRunId')['value']
        if (($runId.Length -gt 0) -and ($expectedRunId.Length -gt 0) -and ($expectedRunId -cne $runId)) {
          $problems.Add((New-ClashFieldProblem $ownerRel 'expectedRunId' $expectedRunId ('the run id the released claim belonged to ("{0}")' -f $runId)))
        }
        $returnedField = Get-ClashJsonField -Object $owner -Name 'returned'
        if (Test-ClashJsonKind -Value $returnedField['value'] -Kind 'array') {
          $returned = @($returnedField['value'])
          if (($runId.Length -gt 0) -and ($returned -cnotcontains $runId)) {
            $problems.Add(('{0} does not list this run''s id "{1}" among the rows it returned' -f $ownerRel, $runId))
          }
        }
        else {
          $problems.Add((New-ClashFieldProblem $ownerRel 'returned' ($returnedField['value']) 'the list of run ids the release returned' ))
        }
      }
    }
  }
  return @($problems)
}

# RC02: ONE deployment-evidence contract, validated by the producer BEFORE it
# publishes anything and independently by every consumer.
#
# The old contract required five files to exist and to match their sealed hashes.
# Existence is not evidence: Codex sealed a run whose required phase receipts each
# recorded status FAIL - and both the real producer and the real consumer accepted
# it, because both asked only "is it there and is it unchanged?". This function
# asks what each receipt SAYS.
function Test-ClashDeploymentEvidence {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [int]$ExpectedMigrationCount = 0,
    # Round 21 (R20-H1): the approved package inventory. When it is not supplied the
    # adapter loads the manifest that ships beside it - the evidence directory is
    # never an input to this decision.
    $Approved = $null,
    [string]$ManifestPath = ''
  )

  $problems = New-Object System.Collections.Generic.List[string]
  $receiptsValidated = 0

  $approved = $Approved
  if ($null -eq $approved) { $approved = Get-ClashApprovedInventory -ManifestPath $ManifestPath }
  $approvedProblems = @($approved.problems)
  if (-not [bool]$approved.ok) {
    if ($approvedProblems.Count -eq 0) { $approvedProblems = @('the approved package inventory could not be established') }
    foreach ($p in $approvedProblems) { $problems.Add(('approved package inventory: ' + [string]$p)) }
  }
  $approvedEntries = @($approved.entries)
  $approvedProjectRef = [string]$approved.projectRef

  # ------------------------------------------ closed inventory (C22-M1) ------
  # Round 23. Two questions the Round 22 contract never asked: is every receipt in
  # this run one the protocol declares, and does every receipt that carries a status
  # agree with the completion it is supposed to support? A correct graph of receipts
  # can still describe an unapproved migration or a failed release.
  foreach ($p in @(Test-ClashReceiptInventory -Root $Root -Approved $approved)) {
    $problems.Add(('receipt inventory: ' + [string]$p))
  }
  foreach ($p in @(Test-ClashReceiptSemantics -Root $Root -Approved $approved)) {
    $problems.Add(('receipt semantics: ' + [string]$p))
  }

  # ---------------------------------------------------------- 00-baseline ----
  $baseName = '00-baseline.json'
  $baseRoot = Get-ClashJsonRoot -Path (Join-Path $Root $baseName) -Label 'deployment baseline receipt' -Kind @('object')
  if (-not $baseRoot['ok']) { $problems.Add(('{0} root: {1}' -f $baseName, [string]$baseRoot['problem'])) }
  else {
    $base = $baseRoot['value']
    Assert-ClashReceiptHeader -Object $base -Label $baseName -Name $baseName -Problems $problems -AdapterKind 'object'
    $baseStatus = Assert-ClashTextField -Object $base -Label $baseName -Field 'status' -Problems $problems
    if (($baseStatus.Length -gt 0) -and ($baseStatus -cne 'BASELINE')) {
      $problems.Add((New-ClashFieldProblem $baseName 'status' $baseStatus 'BASELINE'))
    }
    $baseProject = Assert-ClashTextField -Object $base -Label $baseName -Field 'projectRef' -Problems $problems
    # The run must have been executed against the project the APPROVED package was
    # built for. The evidence states its own project ref, so a run that renamed the
    # project in production would otherwise certify itself.
    if (($baseProject.Length -gt 0) -and ($approvedProjectRef.Length -gt 0) -and ($baseProject -cne $approvedProjectRef)) {
      $problems.Add((New-ClashFieldProblem $baseName 'projectRef' $baseProject ('the approved project ref "{0}"' -f $approvedProjectRef)))
    }
    $baseHead = Assert-ClashTextField -Object $base -Label $baseName -Field 'repoHead' -Problems $problems
    if (($baseHead.Length -gt 0) -and ($baseHead -notmatch '^[0-9a-f]{40}$')) {
      $problems.Add((New-ClashFieldProblem $baseName 'repoHead' $baseHead 'the 40-character commit the runner executed from'))
    }
    # the adapter certification travels with the run as a proof object
    $proofField = Get-ClashJsonField -Object $base -Name 'adapter'
    $proof = $proofField['value']
    if (Test-ClashJsonKind -Value $proof -Kind 'object') {
      Assert-ClashHexField -Object $proof -Label ($baseName + '.adapter') -Field 'receiptSha256' -Problems $problems
      Assert-ClashHexField -Object $proof -Label ($baseName + '.adapter') -Field 'adapterSha256' -Problems $problems
      Assert-ClashIntegerField -Object $proof -Label ($baseName + '.adapter') -Field 'casesExecuted' -Problems $problems -Min 1
      $psv = Assert-ClashTextField -Object $proof -Label ($baseName + '.adapter') -Field 'powerShell' -Problems $problems
      if (($psv.Length -gt 0) -and ($psv -notmatch '^5\.1\.')) {
        $problems.Add((New-ClashFieldProblem ($baseName + '.adapter') 'powerShell' $psv 'a PowerShell 5.1 version string'))
      }
      # The proof must be the FULL certification the adapter demands, not a reduced
      # one: the receipt has to record every case in the inventory, and it has to
      # describe this adapter.
      $executedField = Get-ClashJsonField -Object $proof -Name 'casesExecuted'
      $requiredCases = @(Get-ClashSelfTestInventory).Count
      if (-not (Test-ClashIntegerValue $executedField['value'])) {
        $problems.Add((New-ClashFieldProblem ($baseName + '.adapter') 'casesExecuted' ($executedField['value']) 'a JSON integer'))
      }
      elseif ([long]$executedField['value'] -ne [long]$requiredCases) {
        $problems.Add((New-ClashFieldProblem ($baseName + '.adapter') 'casesExecuted' $executedField['value'] ('the {0} cases this adapter must certify' -f $requiredCases)))
      }
      $proofVersion = (Get-ClashJsonField -Object $proof -Name 'adapterVersion')['value']
      if ($null -ne $proofVersion) {
        if (-not (Test-ClashJsonKind -Value $proofVersion -Kind 'string')) {
          $problems.Add((New-ClashFieldProblem ($baseName + '.adapter') 'adapterVersion' $proofVersion 'a JSON string'))
        }
        elseif ([string]$proofVersion -cne [string]$script:ClashAdapterVersion) {
          $problems.Add((New-ClashFieldProblem ($baseName + '.adapter') 'adapterVersion' $proofVersion ('the adapter that validates this evidence ({0})' -f $script:ClashAdapterVersion)))
        }
      }
    }
    $receiptsValidated++
  }

  # --------------------------------------------------------- 01-integrity ----
  $intName = '01-integrity.json'
  $intRoot = Get-ClashJsonRoot -Path (Join-Path $Root $intName) -Label 'package integrity receipt' -Kind @('object')
  $wrappersChecked = -1
  if (-not $intRoot['ok']) { $problems.Add(('{0} root: {1}' -f $intName, [string]$intRoot['problem'])) }
  else {
    $integrity = $intRoot['value']
    Assert-ClashReceiptHeader -Object $integrity -Label $intName -Name $intName -Problems $problems
    $intStatus = Assert-ClashTextField -Object $integrity -Label $intName -Field 'status' -Problems $problems
    if (($intStatus.Length -gt 0) -and ($intStatus -cne 'PASS')) {
      $problems.Add((New-ClashFieldProblem $intName 'status' $intStatus 'PASS: no migration may be executed on an unproven package'))
    }
    Assert-ClashIntegerField -Object $integrity -Label $intName -Field 'filesVerified' -Problems $problems -Min 1
    Assert-ClashIntegerField -Object $integrity -Label $intName -Field 'checksumEntries' -Problems $problems -Min 1
    Assert-ClashIntegerField -Object $integrity -Label $intName -Field 'wrappersChecked' -Problems $problems -Min 1
    Assert-ClashHexField -Object $integrity -Label $intName -Field 'packageTreeHash' -Problems $problems
    $intProblems = Assert-ClashStringArrayField -Object $integrity -Label $intName -Field 'problems' -Problems $problems -MinCount 0
    if (@($intProblems).Count -gt 0) {
      $problems.Add(('{0}.problems lists {1} problem(s): {2}' -f $intName, @($intProblems).Count, (@($intProblems) -join '; ')))
    }
    $wrapField = Get-ClashJsonField -Object $integrity -Name 'wrappersChecked'
    if (Test-ClashIntegerValue $wrapField['value']) { $wrappersChecked = [long]$wrapField['value'] }
    if (($approvedEntries.Count -gt 0) -and (Test-ClashIntegerValue $wrapField['value']) -and ([long]$wrapField['value'] -ne [long]$approvedEntries.Count)) {
      $problems.Add((New-ClashFieldProblem $intName 'wrappersChecked' $wrapField['value'] ('the {0} wrappers the approved package records' -f @($approvedEntries).Count)))
    }
    $receiptsValidated++
  }

  # ------------------------------------ 02-preflight / 04-postflight / 05-storage
  $preflight = Test-ClashReportReceipt -Root $Root -Name '02-preflight.json' -ContractName '00_preflight.sql' -GatingExpected 19 -InfoExpected 2
  foreach ($p in @($preflight['problems'])) { $problems.Add(('02-preflight.json: ' + [string]$p)) }
  if ($preflight['ok']) { $receiptsValidated++ }
  $postflight = Test-ClashReportReceipt -Root $Root -Name '04-postflight.json' -ContractName '90_verify.sql' -GatingExpected 19 -InfoExpected 0
  foreach ($p in @($postflight['problems'])) { $problems.Add(('04-postflight.json: ' + [string]$p)) }
  if ($postflight['ok']) { $receiptsValidated++ }
  $storage = Test-ClashReportReceipt -Root $Root -Name '05-storage.json' -ContractName '95_storage_config.sql' -GatingExpected 6 -InfoExpected 1
  foreach ($p in @($storage['problems'])) { $problems.Add(('05-storage.json: ' + [string]$p)) }
  if ($storage['ok']) { $receiptsValidated++ }

  # ----------------------------------------------------- 06-claim-release ----
  $relName = '06-claim-release.json'
  $relRoot = Get-ClashJsonRoot -Path (Join-Path $Root $relName) -Label 'claim release receipt' -Kind @('object')
  if (-not $relRoot['ok']) { $problems.Add(('{0} root: {1}' -f $relName, [string]$relRoot['problem'])) }
  else {
    $release = $relRoot['value']
    Assert-ClashReceiptHeader -Object $release -Label $relName -Name $relName -Problems $problems
    $relStatus = Assert-ClashTextField -Object $release -Label $relName -Field 'status' -Problems $problems
    if (($relStatus.Length -gt 0) -and ($relStatus -cne 'PASS')) {
      $problems.Add((New-ClashFieldProblem $relName 'status' $relStatus 'PASS: the claim is released only by an owned, successful delete'))
    }
    Assert-ClashBooleanField -Object $release -Label $relName -Field 'released' -Problems $problems -RequireTrue
    [void](Assert-ClashTextField -Object $release -Label $relName -Field 'runId' -Problems $problems)
    $receiptsValidated++
  }

  # -------------------------------------- per-migration receipts vs APPROVED ----
  # Round 21 (R20-H1). The expected receipt set comes from the approved package: one
  # receipt per approved ordinal, named 03-migrations/<NNN>-<version>.json, carrying
  # that ordinal's approved version, mode, ledger identity, executed digest, wrapper
  # digest, normalisation and ledger token. Anything else in 03-migrations is an
  # extra, and an extra is a problem: a sealer that includes a STOPPED receipt must
  # not be able to complete by adding it.
  $presentNames = @(Get-ClashMigrationReceiptNames -Root $Root)
  $expectedNames = @()
  $indices = @{}
  $versions = @{}
  # Round 22 (C21-01): the applied receipts live at the RUN ROOT with the name
  # <NNN>-<version>-applied.json, which is where the runner writes them and where the
  # next migration chains from. Resolving them anywhere else made an actual
  # writer-produced stream unverifiable.
  $receiptShaByName = @{}
  $hashSources = @()
  foreach ($name in $presentNames) { $hashSources += [string]$name }
  foreach ($entry in $approvedEntries) {
    $hashSources += (Get-ClashAppliedReceiptRelative -Index ([int]$entry.index) -Version ([string]$entry.version))
  }
  foreach ($name in $hashSources) {
    $abs = Join-Path $Root ($name.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $abs -PathType Leaf)) { continue }
    try { $receiptShaByName[[string]$name] = Get-NormalizedSha256 -Path $abs } catch { $receiptShaByName[[string]$name] = '' }
  }

  $ordinal = 0
  foreach ($entry in $approvedEntries) {
    $ordinal++
    $relName = [string]$entry.receipt
    $expectedNames += $relName
    $label = $relName
    if ($presentNames -cnotcontains $relName) {
      $problems.Add(('no per-migration receipt exists for index {0} of {1}: the approved migration {2} ({3}) must be recorded at {4}' -f $entry.index, $approvedEntries.Count, $entry.index, $entry.version, $relName))
      continue
    }
    # A validator decides; it does not crash. An unexpected exception inside this
    # receipt (a malformed document, a path the runtime refuses) is a REFUSAL with the
    # reason recorded, never an exception that escapes into a caller that only asked
    # "may this run be considered complete?".
    try {
    $migRoot = Get-ClashJsonRoot -Path (Join-Path $Root $relName) -Label ('migration receipt ' + $relName) -Kind @('object')
    if (-not $migRoot['ok']) {
      $problems.Add(('{0} root: ok=[{1}] state=[{2}] kind=[{3}] problem=[{4}]' -f $relName,
          [string]($migRoot['ok']), [string]($migRoot['state']), [string]($migRoot['kind']), [string]($migRoot['problem'])))
      continue
    }
    $doc = $migRoot['value']
    Assert-ClashReceiptHeader -Object $doc -Label $label -Name $relName -Problems $problems
    $mstatus = Assert-ClashTextField -Object $doc -Label $label -Field 'status' -Problems $problems
    if (($mstatus.Length -gt 0) -and ($mstatus -cne 'PASS')) {
      $problems.Add((New-ClashFieldProblem $label 'status' $mstatus 'PASS: a migration that did not verifiably commit cannot be part of a completed deployment'))
    }
    $outcome = Assert-ClashTextField -Object $doc -Label $label -Field 'outcome' -Problems $problems
    if (($outcome.Length -gt 0) -and ($outcome -cne 'COMMITTED')) {
      $problems.Add((New-ClashFieldProblem $label 'outcome' $outcome 'COMMITTED'))
    }
    Assert-ClashStringEquals -Object $doc -Label $label -Field 'ledgerReadBack' -Expected 'MATCH' -Problems $problems

    # ---- the approved identity of THIS ordinal, field by field
    $idxField = Get-ClashJsonField -Object $doc -Name 'index'
    if (-not (Test-ClashIntegerValue $idxField['value'])) {
      $problems.Add((New-ClashFieldProblem $label 'index' ($idxField['value']) 'a JSON integer'))
    }
    elseif ([int]$idxField['value'] -ne [int]$entry.index) {
      $problems.Add((New-ClashFieldProblem $label 'index' $idxField['value'] ('the approved ordinal {0}' -f $entry.index)))
    }
    foreach ($pair in @(
        @('version', 'version'),
        @('mode', 'mode'),
        @('ledgerName', 'ledgerName'),
        @('normalisation', 'normalisation'),
        @('executedSha256', 'executedSha256'),
        @('wrapperSha256', 'wrapperSha256'),
        @('expectedToken', 'expectedToken'),
        @('wrapperPath', 'wrapperPath'))) {
      $fieldName = [string]$pair[0]
      $expectedValue = [string]$entry[$pair[1]]
      $actualField = Get-ClashJsonField -Object $doc -Name $fieldName
      if (-not (Test-ClashJsonKind -Value $actualField['value'] -Kind 'string')) {
        $problems.Add((New-ClashFieldProblem $label $fieldName ($actualField['value']) ('the approved "{0}" as a JSON string' -f $expectedValue)))
        continue
      }
      if ([string]$actualField['value'] -cne $expectedValue) {
        $problems.Add((New-ClashFieldProblem $label $fieldName $actualField['value'] ('the approved "{0}"' -f $expectedValue)))
      }
    }
    $origField = Get-ClashJsonField -Object $doc -Name 'originalSha256'
    if ($null -ne $origField['value']) {
      if (-not (Test-ClashSha256Text $origField['value']) -or ([string]$origField['value'] -cne [string]$entry.sha256)) {
        $problems.Add((New-ClashFieldProblem $label 'originalSha256' $origField['value'] ('the approved "{0}"' -f $entry.sha256)))
      }
    }

    # ---- the name must describe this ordinal, and the receipt must be unique
    $leafName = Split-Path -Leaf $relName
    $expectedLeaf = ('{0:D3}-{1}.json' -f [int]$entry.index, [string]$entry.version)
    if ($leafName -cne $expectedLeaf) {
      $problems.Add(('{0} is named "{1}" but the approved ordinal is {2}; the receipt name must describe its own migration' -f $relName, $leafName, $expectedLeaf))
    }
    if ($indices.ContainsKey([int]$entry.index)) { $problems.Add(('{0} repeats migration index {1}' -f $relName, $entry.index)) }
    else { $indices[[int]$entry.index] = $relName }
    if ($versions.ContainsKey([string]$entry.version)) { $problems.Add(('{0} repeats migration version {1}' -f $relName, $entry.version)) }
    else { $versions[[string]$entry.version] = $relName }

    # ---- the predecessor link: this receipt must chain from the PREVIOUS ordinal's
    # receipts (the earlier audit replaced an interior link with a valid-looking hash)
    $prevField = Get-ClashJsonField -Object $doc -Name 'prevReceiptSha'
    $prevValue = [string]$prevField['value']
    if ($prevField['kind'] -cne 'string') {
      $problems.Add((New-ClashFieldProblem $label 'prevReceiptSha' ($prevField['value']) 'a JSON string'))
    }
    elseif ($ordinal -eq 1) {
      # The first migration chains from whatever receipt the runner wrote before it
      # (the preflight or ledger receipt). GENESIS is only legal when nothing
      # precedes it, and the chain check below is what establishes that.
      if (($prevValue -cne 'GENESIS') -and (-not (Test-ClashSha256Text $prevValue))) {
        $problems.Add((New-ClashFieldProblem $label 'prevReceiptSha' $prevValue 'GENESIS or the sha256 of the receipt before it'))
      }
    }
    else {
      $previousEntry = $approvedEntries[$ordinal - 2]
      $previousName = [string]$previousEntry.receipt
      $previousApplied = Get-ClashAppliedReceiptRelative -Index ([int]$previousEntry.index) -Version ([string]$previousEntry.version)
      $accepted = @()
      foreach ($candidate in @($previousName, $previousApplied)) {
        if ($receiptShaByName.ContainsKey($candidate) -and ([string]$receiptShaByName[$candidate]).Length -gt 0) {
          $accepted += [string]$receiptShaByName[$candidate]
        }
      }
      # Round 22 (C21-02): GENESIS is NOT an exemption here. The Round 21 rule read
      # `($prevValue -cne 'GENESIS') -and ...`, so any interior migration could
      # declare GENESIS and skip predecessor validation entirely.
      if ($accepted -cnotcontains $prevValue) {
        $problems.Add(('{0} chains from {1}, which is neither the per-migration receipt {2} nor the applied receipt {3} the runner writes for the previous approved migration' -f $relName, $prevValue, $previousName, $previousApplied))
      }
    }
    $receiptsValidated++
    }
    catch {
      $problems.Add(('{0}: the receipt could not be evaluated: {1}' -f $relName, (Protect-Text ([string]$_.Exception.Message))))
    }
  }

  # Anything in 03-migrations that the approved inventory does not name is extra
  # evidence, and extra evidence is how a stopped run tries to look finished.
  foreach ($name in $presentNames) {
    if ($expectedNames -cnotcontains [string]$name) {
      $problems.Add(('{0} is not an approved migration receipt; the run holds evidence the approved package does not describe' -f $name))
    }
  }

  # ----------------------------------- contradictory terminal evidence ------
  # A completed deployment cannot also have recorded a stop, a failure or an
  # unknown outcome anywhere in the run - including inside the sealed set, which is
  # where the auditor put one.
  $forbidden = @{}
  foreach ($pattern in @('STOP.json', 'STOP.txt', '*-failed.json', '*-unproven.json', '*-mismatch.json', '*-digest.json', '*-digest-detail.json', '06-finalize-fail.json', '99-runner-exception.json', '06-complete-unverified.json')) {
    $forbidden[$pattern] = $true
  }
  foreach ($file in @(Get-ChildItem -LiteralPath $Root -Recurse -File -Force)) {
    $leaf = [string]$file.Name
    $hit = $false
    foreach ($pattern in @($forbidden.Keys)) {
      if ($leaf -like $pattern) { $hit = $true; break }
    }
    if (-not $hit) { continue }
    $rel = ([string]$file.FullName).Substring([System.IO.Path]::GetFullPath($Root).TrimEnd([char]92, [char]47).Length).TrimStart([char]92, [char]47).Replace([char]92, '/')
    $problems.Add(('the run holds {0}, which records that this deployment did not complete' -f $rel))
  }

  # ------------------------------------------- one receipt chain (C21-02) -----
  # Every receipt in the run must form ONE ordered path: exactly one GENESIS, every
  # other receipt chained to the actual bytes of the receipt written before it, and
  # the resulting order following the protocol phases. Round 21 verified only the
  # migration links, so an unrelated postflight predecessor - the exact Round 20
  # reproduction - was still accepted.
  $chain = Get-ClashReceiptChain -Root $Root -Exclude @('EVIDENCE-MANIFEST.json', '06-complete-unverified.json')
  if (-not $chain.ok) {
    $chainProblems = @($chain.problems)
    $chainShown = $chainProblems
    if ($chainShown.Count -gt 6) { $chainShown = $chainShown[0..5] }
    foreach ($p in $chainShown) { $problems.Add(('receipt chain: ' + [string]$p)) }
    if ($chainProblems.Count -gt 6) {
      $problems.Add(('receipt chain: {0} more problem(s) were not shown' -f ($chainProblems.Count - 6)))
    }
  }
  # A phase receipt that exists but is not reachable from the chain's start is
  # evidence the chain does not describe.
  foreach ($chainedName in @('00-baseline.json', '01-integrity.json', '02-preflight.json', '04-postflight.json', '05-storage.json', '06-claim-release.json', '06-finalization-intent.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $Root $chainedName) -PathType Leaf)) { continue }
    if (@($chain.order) -cnotcontains $chainedName) {
      $problems.Add(('receipt chain: {0} exists but is not part of the verified receipt chain' -f $chainedName))
    }
  }

  # The receipt count is declared by the sealed integrity receipt and must describe
  # exactly the approved set: 1..N with no gap, no repeat and no extra file.
  $declared = @($approvedEntries).Count
  if ($ExpectedMigrationCount -gt 0) {
    if ([long]$ExpectedMigrationCount -ne [long]$declared) {
      $problems.Add(('the approved package records {0} migration(s) but this run expected {1}' -f $declared, $ExpectedMigrationCount))
    }
  }
  if (@($presentNames).Count -ne $declared) {
    $problems.Add(('the run holds {0} per-migration receipt(s) but the approved package records {1} executed migration(s)' -f @($presentNames).Count, $declared))
  }
  if ($declared -lt 1) {
    $problems.Add('the approved package records no executed migration at all')
  }

  return [ordered]@{
    ok                = ($problems.Count -eq 0)
    problems          = @($problems)
    receiptsValidated = $receiptsValidated
    migrationCount    = @($presentNames).Count
    declaredCount     = $declared
  }
}

# RC09: the suite's machine-readable summary is authoritative evidence, so it is
# parsed once, typed, and compared with the PASS/FAIL lines that were printed. The
# old gate used [int] casts on untrusted text ({passed:1.4} became 1, "12" passed)
# and took the LAST summary line, so a later summary could mask an earlier failure.
function Test-ClashSuiteSummary {
  param([string]$StdOut, [int]$PassLines, [int]$FailLines)

  $problems = New-Object System.Collections.Generic.List[string]
  $lines = @()
  foreach ($line in ([string]$StdOut -split "`r?`n")) {
    if ($line -match '^CLASH-TEST-SUMMARY ') { $lines += $line.Substring('CLASH-TEST-SUMMARY '.Length) }
  }
  if ($lines.Count -eq 0) {
    $problems.Add('the suite printed no CLASH-TEST-SUMMARY line, so its counts are unproven')
    return [ordered]@{ ok = $false; problems = @($problems); passed = -1; failed = -1; total = -1 }
  }
  if ($lines.Count -gt 1) {
    $problems.Add(('the suite printed {0} CLASH-TEST-SUMMARY line(s); exactly one is authoritative and a second cannot be reconciled' -f $lines.Count))
    return [ordered]@{ ok = $false; problems = @($problems); passed = -1; failed = -1; total = -1 }
  }
  $doc = $null
  try { $doc = $lines[0] | ConvertFrom-Json }
  catch {
    $problems.Add(('the suite summary line is not readable JSON: {0}' -f (Protect-Text $_.Exception.Message)))
    return [ordered]@{ ok = $false; problems = @($problems); passed = -1; failed = -1; total = -1 }
  }
  if (-not (Test-ClashJsonKind -Value $doc -Kind 'object')) {
    $problems.Add(('the suite summary is {0}; it must be a JSON object' -f (Format-ClashFieldValue -Value $doc)))
    return [ordered]@{ ok = $false; problems = @($problems); passed = -1; failed = -1; total = -1 }
  }
  foreach ($field in @('passed', 'failed', 'total')) {
    Assert-ClashIntegerField -Object $doc -Label 'CLASH-TEST-SUMMARY' -Field $field -Problems $problems -Min 0
  }
  $passedF = Get-ClashJsonField -Object $doc -Name 'passed'
  $failedF = Get-ClashJsonField -Object $doc -Name 'failed'
  $totalF = Get-ClashJsonField -Object $doc -Name 'total'
  if ((Test-ClashIntegerValue $passedF['value']) -and (Test-ClashIntegerValue $failedF['value']) -and (Test-ClashIntegerValue $totalF['value'])) {
    $p = [long]$passedF['value']
    $f = [long]$failedF['value']
    $t = [long]$totalF['value']
    if ($t -ne ($p + $f)) { $problems.Add(('the suite summary says total={0} but passed+failed={1}' -f $t, ($p + $f))) }
    if ($p -ne [long]$PassLines) { $problems.Add(('the suite summary says passed={0} but {1} PASS line(s) were printed' -f $p, $PassLines)) }
    if ($f -ne [long]$FailLines) { $problems.Add(('the suite summary says failed={0} but {1} FAIL line(s) were printed' -f $f, $FailLines)) }
  }
  $reportedPassed = -1
  $reportedFailed = -1
  $reportedTotal = -1
  if (Test-ClashIntegerValue $passedF['value']) { $reportedPassed = [int]$passedF['value'] }
  if (Test-ClashIntegerValue $failedF['value']) { $reportedFailed = [int]$failedF['value'] }
  if (Test-ClashIntegerValue $totalF['value']) { $reportedTotal = [int]$totalF['value'] }
  return [ordered]@{ ok = ($problems.Count -eq 0); problems = @($problems); passed = $reportedPassed; failed = $reportedFailed; total = $reportedTotal }
}

# ============================================================================
# RC03: ONE package-integrity planner
#
# deploy.ps1 (Gate 1), check-manifest.ps1 and the tests each carried their own
# reading of checksums.sha256 and manifest.json. They disagreed: the runner
# accepted a list of 200 well-formed lines and silently skipped the rest, the
# checker failed on an unreadable line, and neither enforced membership, order,
# uniqueness or the identity relationships the manifest claims. A file whose
# checksum line was deleted and whose bytes were then changed passed both.
#
# This is now the only implementation. It answers one question - "is this tree
# exactly the package the manifest describes?" - and every caller consumes its
# verdict. Nothing here repairs, defaults or skips.
# ============================================================================

# The exact member set: every file under supabase/cloud except the checksum file
# itself, the generated attribute file and the two runtime evidence homes, plus
# every original migration under supabase/migrations. Declared exclusions are
# exact relative paths, never basenames.
function Get-ClashPackageMemberSet {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$CloudRoot
  )
  $members = @()
  $cloudPrefix = 'supabase/cloud/'
  $excludedDirs = @('evidence', 'evidence-adapter')
  $excludedFiles = @('checksums.sha256', 'generated/.gitattributes')
  foreach ($file in @(Get-ChildItem -LiteralPath $CloudRoot -Recurse -File -Force)) {
    $rel = ([string]$file.FullName).Substring($CloudRoot.Length).TrimStart('\', '/').Replace('\', '/')
    $head = @($rel -split '/')[0]
    if ($excludedDirs -ccontains $head) { continue }
    if ($excludedFiles -ccontains $rel) { continue }
    $members += ($cloudPrefix + $rel)
  }
  $migrationsDir = Join-Path (Split-Path -Parent $CloudRoot) 'migrations'
  if (Test-Path -LiteralPath $migrationsDir -PathType Container) {
    foreach ($file in @(Get-ChildItem -LiteralPath $migrationsDir -File -Force)) {
      $leaf = [string]$file.Name
      if ($leaf -notmatch '\.sql$') { continue }
      $members += ('supabase/migrations/' + $leaf)
    }
  }
  return @($members | Sort-Object)
}

# checksums.sha256, read strictly. A line this parser cannot read is a problem,
# never a skip; a repeated path is a problem; a path that is absolute, escapes the
# repository, uses a backslash or differs only by case from another entry is a
# problem too, because Windows would resolve both to the same file.
function Read-ClashChecksumFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    $Problems
  )

  $entries = @{}
  $order = @()
  $seenLower = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    $Problems.Add('checksums.sha256 is missing')
    return [ordered]@{ ok = $false; count = 0; entries = $entries; order = $order }
  }
  if (Test-Path -LiteralPath $Path -PathType Container) {
    $Problems.Add('checksums.sha256 is a directory')
    return [ordered]@{ ok = $false; count = 0; entries = $entries; order = $order }
  }
  $lineNo = 0
  $problemsBefore = $Problems.Count
  foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
    $lineNo++
    if ($line.Length -eq 0) { continue }
    if ([string]::IsNullOrWhiteSpace($line)) {
      $Problems.Add(('checksums.sha256 line {0} is blank; a checksum list has no empty records' -f $lineNo))
      continue
    }
    $m = [regex]::Match($line, '^([0-9a-f]{64})  ([^ ].*)$')
    if (-not $m.Success) {
      $Problems.Add(('checksums.sha256 line {0} is not "<64 lowercase hex>  <relative path>": {1}' -f $lineNo, (Protect-Text $line)))
      continue
    }
    $digest = [string]$m.Groups[1].Value
    $relText = [string]$m.Groups[2].Value
    $contained = Resolve-ClashContainedPath -Root $RepoRoot -Relative $relText -Label 'checksums.sha256 entry'
    if (-not $contained['ok']) { $Problems.Add($contained['problem']); continue }
    if ($relText.Contains('\')) {
      $Problems.Add(('checksums.sha256 line {0} names "{1}" with a backslash; entries are forward-slash relative paths' -f $lineNo, $relText))
      continue
    }
    if ($entries.ContainsKey($relText)) {
      $Problems.Add(('checksums.sha256 lists {0} twice (lines are position {1} and {2})' -f $relText, $entries[$relText].line, $lineNo))
      continue
    }
    $lower = $relText.ToLowerInvariant()
    if ($seenLower.ContainsKey($lower)) {
      $Problems.Add(('checksums.sha256 lists {0} which differs from {1} only by case; Windows resolves both to one file' -f $relText, $seenLower[$lower]))
      continue
    }
    $seenLower[$lower] = $relText
    $entries[$relText] = [ordered]@{ sha256 = $digest; line = $lineNo }
    $order += $relText
  }
  return [ordered]@{ ok = ($Problems.Count -eq $problemsBefore); count = @($order).Count; entries = $entries; order = $order }
}

# The whole package proof. Returns a verdict record; it never throws and never
# writes. Every field a caller needs is in the record, so no caller needs to
# re-read either file.
# Round 23 (C22-H1). The wrapper's ENVELOPE, not only its body.
#
# Round 22 compared the text between the wrapper's begin; boundary and its ledger
# insert, and the ledger tail, which is why an added line inside the body, a rewritten
# ledger token and text after commit; were all refused. None of those checks looked at
# what precedes begin; - so a statement inserted BEFORE the transaction passed with
# every digest rebound, because the body it compared was still the approved body.
#
# The envelope rule is structural and total: exactly one statement-level begin; line,
# exactly one statement-level commit; line, exactly one ledger insert between them,
# commit; as the last non-blank line, and only comments or blank lines before begin;.
# Anything executable outside the transaction is refused, whatever the digests say.
function Get-ClashWrapperEnvelopeProblem {
  param([string]$Text)

  # Round 24 (F1): the canonical contract comes FIRST. Splitting on LF and then
  # reading the lines is only sound if no other character can end a line for
  # PostgreSQL; a bare CR breaks exactly that assumption.
  $canonicalProblem = Get-ClashCanonicalTextProblem -Text $Text -Label 'the wrapper'
  if ($canonicalProblem.Length -gt 0) { return $canonicalProblem }
  $lines = @(([string]$Text).Replace("`r`n", "`n") -split "`n")
  $beginAt = @()
  $commitAt = @()
  $insertAt = @()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = [string]$lines[$i]
    if ($line -match '^[ \t]*(?i:begin)[ \t]*;[ \t]*$') { $beginAt += $i }
    if ($line -match '^[ \t]*(?i:commit)[ \t]*;[ \t]*$') { $commitAt += $i }
    if ($line -match '^[ \t]*(?i:insert)[ \t]+(?i:into)[ \t]+supabase_migrations\.schema_migrations') { $insertAt += $i }
  }
  if ($beginAt.Count -ne 1) {
    return ('has {0} statement-level begin; line(s); the wrapper must open exactly one transaction' -f @($beginAt).Count)
  }
  if ($commitAt.Count -ne 1) {
    return ('has {0} statement-level commit; line(s); the wrapper must close exactly one transaction' -f @($commitAt).Count)
  }
  if ($insertAt.Count -ne 1) {
    return ('has {0} ledger insert statement(s); the wrapper must record exactly one ledger row' -f @($insertAt).Count)
  }
  $beginIndex = [int]$beginAt[0]
  $insertIndex = [int]$insertAt[0]
  $commitIndex = [int]$commitAt[0]
  if ($insertIndex -le $beginIndex) { return 'records its ledger row before the transaction it describes' }
  if ($commitIndex -le $insertIndex) { return 'closes its transaction before recording the ledger row' }
  for ($i = $commitIndex + 1; $i -lt $lines.Count; $i++) {
    if (([string]$lines[$i]).Trim().Length -gt 0) {
      return ('has executable content after its commit; line (line {0}); the transaction must be the end of the artifact' -f ($i + 1))
    }
  }
  for ($i = 0; $i -lt $beginIndex; $i++) {
    $line = [string]$lines[$i]
    if ($line.Trim().Length -eq 0) { continue }
    if ($line -match '^[ \t]*--') { continue }
    $shown = $line.Trim()
    if ($shown.Length -gt 80) { $shown = $shown.Substring(0, 80) + '...' }
    return ('has executable content before its begin; line (line {0}: "{1}"); only comments may precede the transaction' -f ($i + 1), $shown)
  }
  return ''
}

function Test-ClashPackageIntegrity {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [string]$CloudRoot = '',
    [switch]$SkipFileHashes
  )

  $problems = New-Object System.Collections.Generic.List[string]
  if ([string]::IsNullOrWhiteSpace($CloudRoot)) { $CloudRoot = Join-Path (Join-Path $RepoRoot 'supabase') 'cloud' }

  $members = @(Get-ClashPackageMemberSet -RepoRoot $RepoRoot -CloudRoot $CloudRoot)
  $sumPath = Join-Path $CloudRoot 'checksums.sha256'
  $sums = Read-ClashChecksumFile -Path $sumPath -RepoRoot $RepoRoot -Problems $problems
  $checksumEntries = @($sums.order)
  $sumMap = $sums.entries

  # ---- exact membership, both directions
  foreach ($member in $members) {
    if (-not $sumMap.ContainsKey($member)) { $problems.Add(('package member {0} has no checksum entry' -f $member)) }
  }
  foreach ($listed in $checksumEntries) {
    if ($members -cnotcontains $listed) { $problems.Add(('checksums.sha256 lists {0}, which is not a package member' -f $listed)) }
  }

  # ---- digests
  $verified = 0
  $treeRows = @()
  foreach ($listed in $checksumEntries) {
    $contained = Resolve-ClashContainedPath -Root $RepoRoot -Relative $listed -Label 'checksum entry'
    if (-not $contained['ok']) { continue }
    $full = [string]$contained['path']
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
      $problems.Add(('checksum entry {0} has no file on disk' -f $listed))
      continue
    }
    $claim = [string]$sumMap[$listed].sha256
    if (-not $SkipFileHashes) {
      $actual = ''
      try { $actual = Get-NormalizedSha256 -Path $full }
      catch {
        $problems.Add(('{0} could not be read: {1}' -f $listed, (Protect-Text $_.Exception.Message)))
        continue
      }
      if ($actual -cne $claim) {
        $problems.Add(('{0} is {1} but checksums.sha256 says {2}' -f $listed, $actual, $claim))
        continue
      }
      $verified++
      $treeRows += ($actual + '  ' + $listed)
    }
  }
  $treeHash = ''
  if ($treeRows.Count -gt 0) { $treeHash = Get-TextSha256 -Text ($treeRows -join "`n") }

  # ---- manifest: shape, order, identity relationships
  $manifestPath = Join-Path $CloudRoot 'manifest.json'
  $manifestRoot = Get-ClashJsonRoot -Path $manifestPath -Label 'package manifest' -Kind @('object')
  $entryCount = 0
  if (-not $manifestRoot['ok']) { $problems.Add($manifestRoot['problem']) }
  else {
    $manifest = $manifestRoot['value']
    $projectRef = Assert-ClashTextField -Object $manifest -Label 'manifest.json' -Field 'project_ref' -Problems $problems
    if (($projectRef.Length -gt 0) -and ($projectRef -notmatch '^[a-z0-9]{20}$')) {
      $problems.Add((New-ClashFieldProblem 'manifest.json' 'project_ref' $projectRef 'a 20-character Supabase project ref'))
    }
    [void](Assert-ClashTextField -Object $manifest -Label 'manifest.json' -Field 'builder' -Problems $problems)
    [void](Assert-ClashTextField -Object $manifest -Label 'manifest.json' -Field 'built_at_utc' -Problems $problems)
    Assert-ClashIntegerField -Object $manifest -Label 'manifest.json' -Field 'total' -Problems $problems -Min 1

    $entriesField = Get-ClashJsonField -Object $manifest -Name 'entries'
    if ($entriesField['kind'] -cne 'array') {
      $problems.Add((New-ClashFieldProblem 'manifest.json' 'entries' ($entriesField['value']) 'a JSON array of migration entries'))
    }
    else {
      $entries = @($entriesField['value'])
      $entryCount = $entries.Count
      $totalField = Get-ClashJsonField -Object $manifest -Name 'total'
      if ((Test-ClashIntegerValue $totalField['value']) -and ([long]$totalField['value'] -ne [long]$entryCount)) {
        $problems.Add(('manifest.json total is {0} but it lists {1} entries' -f $totalField['value'], $entryCount))
      }
      $expectedEntries = 0
      foreach ($name in $members) { if ($name -match '^supabase/migrations/.*\.sql$') { $expectedEntries++ } }
      if ($entryCount -ne $expectedEntries) {
        $problems.Add(('manifest.json lists {0} migration(s) but the package holds {1} original migration file(s)' -f $entryCount, $expectedEntries))
      }
      $seenVersions = @{}
      $position = 0
      foreach ($entry in $entries) {
        $position++
        $label = ('manifest entries[{0}]' -f ($position - 1))
        if (-not (Test-ClashJsonKind -Value $entry -Kind 'object')) {
          $problems.Add((New-ClashFieldProblem $label '' $entry 'a JSON object'))
          continue
        }
        Assert-ClashIntegerField -Object $entry -Label $label -Field 'index' -Problems $problems -Expect $position -ExpectSet
        $version = Assert-ClashTextField -Object $entry -Label $label -Field 'version' -Problems $problems
        if (($version.Length -gt 0) -and ($version -notmatch '^\d{14}$')) {
          $problems.Add((New-ClashFieldProblem $label 'version' $version 'a 14-digit migration version'))
        }
        if ($version.Length -gt 0) {
          if ($seenVersions.ContainsKey($version)) { $problems.Add(('{0} repeats version {1} (already used by entries[{2}])' -f $label, $version, $seenVersions[$version])) }
          else { $seenVersions[$version] = ($position - 1) }
        }
        $name = Assert-ClashTextField -Object $entry -Label $label -Field 'name' -Problems $problems
        $file = Assert-ClashTextField -Object $entry -Label $label -Field 'file' -Problems $problems
        $expectedFile = ('supabase/migrations/{0}_{1}.sql' -f $version, $name)
        if (($file.Length -gt 0) -and ($version.Length -gt 0) -and ($name.Length -gt 0) -and ($file -cne $expectedFile)) {
          $problems.Add((New-ClashFieldProblem $label 'file' $file ('the string "{0}"' -f $expectedFile)))
        }
        Assert-ClashHexField -Object $entry -Label $label -Field 'sha256' -Problems $problems
        Assert-ClashIntegerField -Object $entry -Label $label -Field 'bytes' -Problems $problems -Min 1
        Assert-ClashHexField -Object $entry -Label $label -Field 'executedSha256' -Problems $problems
        Assert-ClashHexField -Object $entry -Label $label -Field 'normalizedSha256' -Problems $problems
        Assert-ClashHexField -Object $entry -Label $label -Field 'wrapperSha256' -Problems $problems
        Assert-ClashBooleanField -Object $entry -Label $label -Field 'statementsStored' -Problems $problems -RequireTrue
        [void](Assert-ClashTextField -Object $entry -Label $label -Field 'ledgerName' -Problems $problems)
        $mode = Assert-ClashTextField -Object $entry -Label $label -Field 'mode' -Problems $problems
        if (($mode.Length -gt 0) -and (@('direct', 'diverged') -cnotcontains $mode)) {
          $problems.Add((New-ClashFieldProblem $label 'mode' $mode 'either "direct" or "diverged"'))
        }
        $normalisation = Assert-ClashTextField -Object $entry -Label $label -Field 'normalisation' -Problems $problems
        if (($normalisation.Length -gt 0) -and (@('none', 'strip-begin-commit') -cnotcontains $normalisation)) {
          $problems.Add((New-ClashFieldProblem $label 'normalisation' $normalisation 'either "none" or "strip-begin-commit"'))
        }
        $wrapperPath = Assert-ClashTextField -Object $entry -Label $label -Field 'wrapperPath' -Problems $problems
        $expectedWrapper = ('{0:D3}_{1}.sql' -f $position, $version)
        if (($wrapperPath.Length -gt 0) -and ($version.Length -gt 0) -and ($wrapperPath -cne $expectedWrapper)) {
          $problems.Add((New-ClashFieldProblem $label 'wrapperPath' $wrapperPath ('the wrapper "{0}" its index and version describe' -f $expectedWrapper)))
        }
        $sqlPath = Assert-ClashTextField -Object $entry -Label $label -Field 'sqlPath' -Problems $problems
        if (($sqlPath.Length -gt 0) -and ($members -cnotcontains $sqlPath)) {
          $problems.Add((New-ClashFieldProblem $label 'sqlPath' $sqlPath 'a package member (the executed source must ship with the package)'))
        }
        if (($mode -ceq 'direct') -and ($sqlPath.Length -gt 0) -and ($file.Length -gt 0) -and ($sqlPath -cne $file)) {
          $problems.Add((New-ClashFieldProblem $label 'sqlPath' $sqlPath ('the original file "{0}", because mode is direct' -f $file)))
        }
        $shaField = Get-ClashJsonField -Object $entry -Name 'sha256'
        $execField = Get-ClashJsonField -Object $entry -Name 'executedSha256'
        if ((Test-ClashSha256Text $shaField['value']) -and (Test-ClashSha256Text $execField['value'])) {
          if (($mode -ceq 'direct') -and ([string]$shaField['value'] -cne [string]$execField['value'])) {
            $problems.Add(('{0} is mode direct but its original and executed digests differ' -f $label))
          }
          if (($mode -ceq 'diverged') -and ([string]$shaField['value'] -ceq [string]$execField['value'])) {
            $problems.Add(('{0} is mode diverged but its original and executed digests are identical' -f $label))
          }
        }

        # ---- relationships with the bytes on disk
        $originalAbs = Join-Path $RepoRoot ($file.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
        $executedAbs = Join-Path $RepoRoot ($sqlPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
        $wrapperAbs = Join-Path (Join-Path $CloudRoot 'generated') ([string]$wrapperPath)
        if (-not $SkipFileHashes) {
          if (-not (Test-Path -LiteralPath $originalAbs -PathType Leaf)) { $problems.Add(('{0}: original {1} is missing' -f $label, $file)) }
          elseif ((Get-NormalizedSha256 -Path $originalAbs) -cne [string]$shaField['value']) { $problems.Add(('{0}: original {1} does not match the manifest digest' -f $label, $file)) }
          if (-not (Test-Path -LiteralPath $executedAbs -PathType Leaf)) { $problems.Add(('{0}: executed source {1} is missing' -f $label, $sqlPath)) }
          elseif ((Get-NormalizedSha256 -Path $executedAbs) -cne [string]$execField['value']) { $problems.Add(('{0}: executed source {1} does not match the manifest digest' -f $label, $sqlPath)) }
        }
        if (-not (Test-Path -LiteralPath $wrapperAbs -PathType Leaf)) {
          $problems.Add(('{0}: wrapper {1} is missing' -f $label, $wrapperPath))
        }
        else {
          $wrapperRel = 'supabase/cloud/generated/' + [string]$wrapperPath
          $wrapperShaField = Get-ClashJsonField -Object $entry -Name 'wrapperSha256'
          if (-not $SkipFileHashes) {
            $wrapperActual = Get-NormalizedSha256 -Path $wrapperAbs
            if ($wrapperActual -cne [string]$wrapperShaField['value']) {
              $problems.Add(('{0}: wrapper {1} does not match the manifest digest' -f $label, $wrapperPath))
            }
          }

          # ---- Round 21 (R20-M4): the WRAPPER must be the approved original.
          # Digest equality alone proved that the wrapper is the file the manifest
          # describes; it did not prove that the wrapper still CONTAINS the migration
          # body the approved original holds, that its ledger identity is the approved
          # one, or that the declared byte length is real. All three are checked here,
          # by the same planner the runner and the CI step use.
          $wrapperText = ''
          try { $wrapperText = [System.IO.File]::ReadAllText($wrapperAbs) }
          catch { $wrapperText = '' }
          if (-not $SkipFileHashes) {
            $declaredBytes = 0
            $bytesChk = Get-ClashJsonField -Object $entry -Name 'bytes'
            if (Test-ClashIntegerValue $bytesChk['value']) { $declaredBytes = [long]$bytesChk['value'] }
            if (($declaredBytes -gt 0) -and (Test-Path -LiteralPath $originalAbs -PathType Leaf)) {
              # The declared length is the LF-normalised length, the same normalisation
              # every digest in this package uses. Measuring the raw file made a CRLF
              # checkout look 1 byte per line heavier than the reviewed original, so
              # every Windows run reported all 111 originals as tampered.
              $originalRaw = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($originalAbs))
              if ($originalRaw.Length -gt 0 -and $originalRaw[0] -eq [char]0xFEFF) { $originalRaw = $originalRaw.Substring(1) }
              # Round 24 (F1): the approved original is held to the same canonical text
              # contract as the wrapper. A bare CR would make the server split a line the
              # digests treat as one, so it is refused before any length or hash is used.
              $originalCanonical = Get-ClashCanonicalTextProblem -Text $originalRaw -Label ('the approved original ' + $file)
              if ($originalCanonical.Length -gt 0) { $problems.Add($originalCanonical) }
              $actualBytes = [long][System.Text.Encoding]::UTF8.GetByteCount($originalRaw.Replace("`r`n", "`n"))
              if ($actualBytes -ne $declaredBytes) {
                $problems.Add(('{0}: original {1} is {2} byte(s), the manifest declares {3}' -f $label, $file, $actualBytes, $declaredBytes))
              }
            }

            # the normalised body the wrapper must carry: the executed source, with
            # standalone BEGIN;/COMMIT; lines removed when that is the declared policy
            $executedText = ''
            try { $executedText = [System.IO.File]::ReadAllText($executedAbs) } catch { $executedText = '' }
            if ($executedText.Length -gt 0) {
              $executedCanonical = Get-ClashCanonicalTextProblem -Text $executedText -Label ('the executed source ' + $file)
              if ($executedCanonical.Length -gt 0) { $problems.Add($executedCanonical) }
              $executedText = $executedText.Replace("`r`n", "`n")
              if ($executedText.Length -gt 0 -and $executedText[0] -eq [char]0xFEFF) { $executedText = $executedText.Substring(1) }
              $bodyText = $executedText
              if ($normalisation -ceq 'strip-begin-commit') {
                $kept = @()
                foreach ($line in @($executedText -split "`n")) {
                  if ($line -match '^[ \t]*(?i:(begin|commit))[ \t]*;[ \t]*$') { continue }
                  $kept += $line
                }
                $bodyText = ($kept -join "`n")
              }
              $bodySha = Get-TextSha256 -Text $bodyText
              $normChk = Get-ClashJsonField -Object $entry -Name 'normalizedSha256'
              if (Test-ClashSha256Text $normChk['value']) {
                if ($bodySha -cne [string]$normChk['value']) {
                  $problems.Add(('{0}: the normalised body of {1} is {2}, the manifest declares {3}' -f $label, $sqlPath, $bodySha, $normChk['value']))
                }
                if (($normalisation -ceq 'none') -and ($bodySha -cne [string]$execField['value'])) {
                  $problems.Add(('{0}: normalisation is none but the normalised body digest {1} is not the executed digest {2}' -f $label, $bodySha, $execField['value']))
                }
              }
              # Round 22 (C21-03): CONTAINMENT is not fidelity. Round 21 required the
              # wrapper to contain the approved body as a substring, so a harmless line
              # added at the start of the body - exact Node fidelity fails, containment
              # holds - passed the shared planner. The body is now EXTRACTED between the
              # wrapper's transaction boundary and its ledger insert and compared whole.
              if ($wrapperText.Length -gt 0) {
                $wrapperNorm = $wrapperText.Replace("`r`n", "`n")
                # Round 23 (C22-H1): the envelope first. The body and tail checks below
                # cannot see a statement inserted BEFORE begin;, so the structure of the
                # whole artifact is verified before its contents are compared.
                $envelopeProblem = Get-ClashWrapperEnvelopeProblem -Text $wrapperNorm
                if ($envelopeProblem.Length -gt 0) {
                  $problems.Add(('{0}: wrapper {1} {2}' -f $label, $wrapperPath, $envelopeProblem))
                }
                $openMark = "`nbegin;`n"
                $insertMark = "`ninsert into supabase_migrations.schema_migrations"
                $openAt = $wrapperNorm.IndexOf($openMark)
                $insertAt = $wrapperNorm.IndexOf($insertMark)
                if ($openAt -lt 0) {
                  $problems.Add(('{0}: wrapper {1} has no standalone begin; boundary, so its executable body cannot be established' -f $label, $wrapperPath))
                }
                elseif (($insertAt -lt 0) -or ($insertAt -le $openAt)) {
                  $problems.Add(('{0}: wrapper {1} has no ledger insert after its begin; boundary, so its executable body cannot be established' -f $label, $wrapperPath))
                }
                else {
                  $wrapperBody = $wrapperNorm.Substring($openAt + $openMark.Length, $insertAt - ($openAt + $openMark.Length))
                  $wrapperBodySha = Get-TextSha256 -Text $wrapperBody.Trim()
                  $approvedBodySha = Get-TextSha256 -Text $bodyText.Trim()
                  if ($wrapperBodySha -cne $approvedBodySha) {
                    $problems.Add(('{0}: the executable body of wrapper {1} is {2}, but the approved body of {3} is {4}; the wrapper must execute exactly the approved migration text, not a variant of it (a line added before or inside the body changes this digest)' -f $label, $wrapperPath, $wrapperBodySha, $sqlPath, $approvedBodySha))
                  }
                  # The ledger insert and the transaction close are part of the body the
                  # wrapper executes: they must be the approved template for THIS ordinal,
                  # not merely present somewhere.
                  $tailText = $wrapperNorm.Substring($insertAt + 1)
                  $expectedTail = @(
                    'insert into supabase_migrations.schema_migrations (version, name, statements, created_by)',
                    'values (',
                    ("  '{0}'," -f [string]$entry.version),
                    ("  '{0}'," -f [string]$entry.ledgerName),
                    ("  array['sha256:{0}']," -f [string]$normChk['value']),
                    "  'clash-cloud-wrapper-v1'",
                    ');',
                    '',
                    'commit;'
                  ) -join "`n"
                  $tailSquashed = (($tailText -replace '\s+', ' ').Trim())
                  $expectedSquashed = (($expectedTail -replace '\s+', ' ').Trim())
                  if ($tailSquashed -cne $expectedSquashed) {
                    $problems.Add(('{0}: the ledger insert and transaction close of wrapper {1} are not the approved template for version {2} / ledger name {3} / token sha256:{4}' -f $label, $wrapperPath, [string]$entry.version, [string]$entry.ledgerName, [string]$normChk['value']))
                  }
                }
              }
            }
          }
          if (-not $sumMap.ContainsKey($wrapperRel)) {
            $problems.Add(('{0}: wrapper {1} has no checksum entry' -f $label, $wrapperRel))
          }
          elseif ([string]$sumMap[$wrapperRel].sha256 -cne [string]$wrapperShaField['value']) {
            $problems.Add(('{0}: wrapper {1} digest disagrees with checksums.sha256' -f $label, $wrapperRel))
          }
          # The wrapper is the artefact that actually executes, so its shape is part
          # of the package proof: one transaction, a trailing commit, a ledger insert
          # that precedes that commit, the version literal and the identity token.
          if ($wrapperText.Length -eq 0) { $problems.Add(('{0}: wrapper {1} could not be read' -f $label, $wrapperPath)) }
          if ($wrapperText.Length -gt 0) {
            if (([regex]::Matches($wrapperText, '(?m)^begin;\s*$')).Count -ne 1) { $problems.Add(('{0}: wrapper {1} must contain exactly one top-level begin;' -f $label, $wrapperPath)) }
            if ($wrapperText -notmatch '(?m)^commit;\s*$') { $problems.Add(('{0}: wrapper {1} has no trailing commit' -f $label, $wrapperPath)) }
            $insertAt = $wrapperText.IndexOf('insert into supabase_migrations.schema_migrations')
            if ($insertAt -lt 0) { $problems.Add(('{0}: wrapper {1} has no ledger insert' -f $label, $wrapperPath)) }
            elseif ($insertAt -gt $wrapperText.LastIndexOf('commit;')) { $problems.Add(('{0}: wrapper {1} inserts into the ledger after its commit' -f $label, $wrapperPath)) }
            if (($version.Length -gt 0) -and ($wrapperText -notmatch [regex]::Escape("'$version'"))) { $problems.Add(('{0}: wrapper {1} does not carry its ledger version literal' -f $label, $wrapperPath)) }
            $ledgerNameField = Get-ClashJsonField -Object $entry -Name 'ledgerName'
            if ((Test-ClashJsonKind -Value $ledgerNameField['value'] -Kind 'string') -and ([string]$ledgerNameField['value']).Length -gt 0) {
              if ($wrapperText -notmatch [regex]::Escape("'" + [string]$ledgerNameField['value'] + "'")) {
                $problems.Add(('{0}: wrapper {1} does not carry its approved ledger identity "{2}"' -f $label, $wrapperPath, $ledgerNameField['value']))
              }
            }
            $normField = Get-ClashJsonField -Object $entry -Name 'normalizedSha256'
            if ((Test-ClashSha256Text $normField['value']) -and ($wrapperText -notmatch [regex]::Escape(('sha256:' + [string]$normField['value'])))) {
              $problems.Add(('{0}: wrapper {1} does not carry its normalised identity token' -f $label, $wrapperPath))
            }
          }
        }
      }
    }
  }

  return [ordered]@{
    ok              = ($problems.Count -eq 0)
    problems        = @($problems)
    memberCount     = @($members).Count
    checksumEntries = @($checksumEntries).Count
    verifiedFiles   = $verified
    entryCount      = $entryCount
    packageTreeHash = $treeHash
    checksums       = $sumMap
  }
}

# ------------------------------------------------- approved package inventory ---
# Round 21 (R20-H1). The completion evidence used to be judged against ITSELF: the
# per-migration receipts were validated for internal consistency (status PASS,
# outcome COMMITTED, a hex-shaped hash, a version that matched its own file name)
# and the count came from the run's own integrity receipt. A complete, mutually
# consistent set of receipts for the WRONG package therefore completed: a wrong
# wrapper digest, a wrong executed-original digest, a wrong ledger token, a foreign
# version, a broken predecessor link, the wrong project ref, a reduced adapter
# certification and an extra sealed STOPPED receipt all passed.
#
# The expected inventory is now sourced from the APPROVED PACKAGE (manifest.json,
# which the integrity planner validates against checksums.sha256 and the files on
# disk) and never from the evidence being validated. The producer and the consumer
# call the same function, so they cannot disagree about what an approved migration
# is. A caller may inject an inventory (the tests do, from their own fixtures) but
# it is always an input, never a reading of the run directory.
function Get-ClashApprovedInventory {
  param(
    # Default: the manifest that ships beside this adapter. The path is derived
    # from the location of the CODE, not from the evidence being validated.
    [string]$ManifestPath = ''
  )

  $record = @{ ok = $false; problems = @(); entries = @(); count = 0; projectRef = ''; sourceCommit = ''; manifestSha256 = ''; path = '' }
  if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    # $PSScriptRoot is <cloud>/tools/lib, so the manifest beside the adapter is TWO
    # levels up. One level up is <cloud>/tools, which has no manifest - a default
    # that made every implicit call report 'the approved package manifest is
    # missing' while the real manifest sat one directory higher.
    $ManifestPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'manifest.json'
  }
  $record['path'] = $ManifestPath
  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    $record['problems'] = @(('the approved package manifest is missing: {0}' -f $ManifestPath))
    return $record
  }
  # not `$root`: a variable named like a typed parameter is converted to its type
  # name by the binder (the Round 20 CI failure), and the suite refuses the shape.
  $manifestRoot = Get-ClashJsonRoot -Path $ManifestPath -Label 'approved package manifest' -Kind @('object')
  if (-not $manifestRoot['ok']) {
    $record['problems'] = @([string]$manifestRoot['problem'])
    return $record
  }
  $manifest = $manifestRoot['value']
  $problems = New-Object System.Collections.Generic.List[string]
  $label = 'manifest.json'

  $projectRef  = Assert-ClashTextField -Object $manifest -Label $label -Field 'project_ref' -Problems $problems
  $sourceCommit = Assert-ClashTextField -Object $manifest -Label $label -Field 'source_commit' -Problems $problems
  if (($projectRef.Length -gt 0) -and ($projectRef -notmatch '^[a-z0-9]{20}$')) {
    $problems.Add((New-ClashFieldProblem $label 'project_ref' $projectRef 'a 20-character Supabase project ref'))
  }
  if (($sourceCommit.Length -gt 0) -and ($sourceCommit -notmatch '^[0-9a-f]{40}$')) {
    $problems.Add((New-ClashFieldProblem $label 'source_commit' $sourceCommit 'the 40-character commit the package was built from'))
  }
  Assert-ClashIntegerField -Object $manifest -Label $label -Field 'total' -Problems $problems -Min 1

  $entriesField = Get-ClashJsonField -Object $manifest -Name 'entries'
  if ($entriesField['kind'] -cne 'array') {
    $problems.Add((New-ClashFieldProblem $label 'entries' ($entriesField['value']) 'a JSON array of approved migration entries'))
    $record['problems'] = @($problems)
    return $record
  }
  $rawEntries = @($entriesField['value'])
  $totalField = Get-ClashJsonField -Object $manifest -Name 'total'
  if ((Test-ClashIntegerValue $totalField['value']) -and ([long]$totalField['value'] -ne [long]$rawEntries.Count)) {
    $problems.Add(('{0} total is {1} but it lists {2} approved entries' -f $label, $totalField['value'], $rawEntries.Count))
  }
  if ($rawEntries.Count -lt 1) { $problems.Add(('{0} lists no approved migration' -f $label)) }

  $entries = @()
  $seenVersions = @{}
  $seenLedger = @{}
  $position = 0
  foreach ($raw in $rawEntries) {
    $position++
    $elabel = ('approved entries[{0}]' -f $position)
    if (-not (Test-ClashJsonKind -Value $raw -Kind 'object')) {
      $problems.Add((New-ClashFieldProblem $elabel '' $raw 'a JSON object'))
      continue
    }
    $index = $position
    $indexField = Get-ClashJsonField -Object $raw -Name 'index'
    if (-not (Test-ClashIntegerValue $indexField['value'])) {
      $problems.Add((New-ClashFieldProblem $elabel 'index' ($indexField['value']) 'a JSON integer'))
      continue
    }
    $index = [int]$indexField['value']
    if ($index -ne $position) {
      $problems.Add(('{0} records index {1} at position {2}; the approved inventory is ordered and gapless' -f $elabel, $index, $position))
    }
    $version      = Assert-ClashTextField -Object $raw -Label $elabel -Field 'version' -Problems $problems
    $ledgerName   = Assert-ClashTextField -Object $raw -Label $elabel -Field 'ledgerName' -Problems $problems
    $mode         = Assert-ClashTextField -Object $raw -Label $elabel -Field 'mode' -Problems $problems
    $normalisation = Assert-ClashTextField -Object $raw -Label $elabel -Field 'normalisation' -Problems $problems
    $wrapperPath  = Assert-ClashTextField -Object $raw -Label $elabel -Field 'wrapperPath' -Problems $problems
    $name         = Assert-ClashTextField -Object $raw -Label $elabel -Field 'name' -Problems $problems
    if (($version.Length -gt 0) -and ($version -notmatch '^\d{14}$')) {
      $problems.Add((New-ClashFieldProblem $elabel 'version' $version 'a 14-digit migration version'))
    }
    if (($mode.Length -gt 0) -and (@('direct', 'diverged') -cnotcontains $mode)) {
      $problems.Add((New-ClashFieldProblem $elabel 'mode' $mode 'either "direct" or "diverged"'))
    }
    if (($normalisation.Length -gt 0) -and (@('none', 'strip-begin-commit') -cnotcontains $normalisation)) {
      $problems.Add((New-ClashFieldProblem $elabel 'normalisation' $normalisation 'either "none" or "strip-begin-commit"'))
    }
    if (($wrapperPath.Length -gt 0) -and ($version.Length -gt 0)) {
      $expectedWrapper = ('{0:D3}_{1}.sql' -f $index, $version)
      if ($wrapperPath -cne $expectedWrapper) {
        $problems.Add((New-ClashFieldProblem $elabel 'wrapperPath' $wrapperPath ('the wrapper "{0}" its ordinal and version describe' -f $expectedWrapper)))
      }
    }
    # The ledger identity is the DECLARED ledgerName - the value the wrapper stores in
    # supabase_migrations.schema_migrations.name. It is NOT a version_name composite:
    # the manifest records 'initial_arena_schema', and a rule that invented a second
    # shape here refused the real package while accepting a fabricated one (Round 21
    # CI). What binds it is the package's own rule: a DIRECT migration stores its
    # migration name, and the one DIVERGED migration stores its documented variant.
    if (($mode -ceq 'direct') -and ($ledgerName.Length -gt 0) -and ($name.Length -gt 0) -and ($ledgerName -cne $name)) {
      $problems.Add((New-ClashFieldProblem $elabel 'ledgerName' $ledgerName ('the migration name "{0}" for a direct migration' -f $name)))
    }
    $shaField   = Get-ClashJsonField -Object $raw -Name 'sha256'
    $execField  = Get-ClashJsonField -Object $raw -Name 'executedSha256'
    $normField  = Get-ClashJsonField -Object $raw -Name 'normalizedSha256'
    $wrapField  = Get-ClashJsonField -Object $raw -Name 'wrapperSha256'
    $bytesField = Get-ClashJsonField -Object $raw -Name 'bytes'
    foreach ($pair in @(@('sha256', $shaField), @('executedSha256', $execField), @('normalizedSha256', $normField), @('wrapperSha256', $wrapField))) {
      if (-not (Test-ClashSha256Text $pair[1]['value'])) {
        $problems.Add((New-ClashFieldProblem $elabel [string]$pair[0] ($pair[1]['value']) 'sha256:<64 lowercase hex>'))
      }
    }
    if (-not ((Test-ClashIntegerValue $bytesField['value']) -and ([long]$bytesField['value'] -gt 0))) {
      $problems.Add((New-ClashFieldProblem $elabel 'bytes' ($bytesField['value']) 'the original byte length as a JSON integer'))
    }
    if ($version.Length -gt 0) {
      if ($seenVersions.ContainsKey($version)) { $problems.Add(('{0} repeats approved version {1}' -f $elabel, $version)) }
      else { $seenVersions[$version] = $true }
    }
    if ($ledgerName.Length -gt 0) {
      if ($seenLedger.ContainsKey($ledgerName)) { $problems.Add(('{0} repeats approved ledger identity {1}' -f $elabel, $ledgerName)) }
      else { $seenLedger[$ledgerName] = $true }
    }
    $entries += [ordered]@{
      index            = $index
      version          = $version
      name             = $name
      mode             = $mode
      normalisation    = $normalisation
      ledgerName       = $ledgerName
      wrapperPath      = $wrapperPath
      sha256           = [string]$shaField['value']
      executedSha256   = [string]$execField['value']
      normalizedSha256 = [string]$normField['value']
      wrapperSha256    = [string]$wrapField['value']
      bytes            = $(if (Test-ClashIntegerValue $bytesField['value']) { [long]$bytesField['value'] } else { 0 })
      receipt          = ('03-migrations/{0:D3}-{1}.json' -f $index, $version)
      expectedToken    = ('sha256:' + [string]$normField['value'])
    }
  }

  $record['problems']    = @($problems)
  $record['entries']     = @($entries)
  $record['count']       = @($entries).Count
  $record['projectRef']  = $projectRef
  $record['sourceCommit'] = $sourceCommit
  $record['manifestSha256'] = (Get-NormalizedSha256 -Path $ManifestPath)
  $record['ok'] = (@($problems).Count -eq 0)
  return $record
}

# RC08: "hash the wrapper, then execute the wrapper by pathname" is a
# time-of-check / time-of-use gap. Anything that can write the file between the two
# calls - another process, a sync client, a build in the same directory - makes the
# runner execute bytes that were never verified, while the receipt records the hash
# of the bytes that were.
#
# The file is therefore read ONCE. The digest is computed from those bytes, the same
# bytes are written to a private snapshot inside the run directory, the snapshot's
# digest is verified independently from disk, and the snapshot is then opened with a
# sharing mode that refuses every concurrent writer for as long as the child runs.
# The caller must dispose the returned stream in a finally block.
function New-VerifiedSqlSnapshot {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$TargetPath,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [Parameter(Mandatory = $true)][string]$Label
  )
  $record = @{ ok = $false; path = $null; sha256 = ''; bytes = 0; stream = $null; problem = '' }
  if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    $record['problem'] = ('{0}: the source file is missing' -f $Label)
    return $record
  }
  if (Test-Path -LiteralPath $TargetPath) {
    $record['problem'] = ('{0}: the snapshot target already exists, and evidence is never overwritten' -f $Label)
    return $record
  }
  $bytes = $null
  try { $bytes = [System.IO.File]::ReadAllBytes($SourcePath) }
  catch {
    $record['problem'] = ('{0}: the source file could not be read: {1}' -f $Label, (Protect-Text $_.Exception.Message))
    return $record
  }
  $written = -1
  try {
    $writer = New-Object System.IO.FileStream($TargetPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
      $writer.Write($bytes, 0, $bytes.Length)
      $writer.Flush($true)
      $written = [int]$bytes.Length
    }
    finally { $writer.Dispose() }
  }
  catch {
    $record['problem'] = ('{0}: the snapshot could not be written: {1}' -f $Label, (Protect-Text $_.Exception.Message))
    return $record
  }
  # Round 21 (R20-M1): the lock is taken BEFORE the digest is read, and the digest is
  # computed THROUGH the locked handle. The auditor demonstrated a real mutation in
  # the window between "read the snapshot back by path" and "open it with a denying
  # share mode": the hash proved one set of bytes and psql executed another. There is
  # no such window now - FileShare::Read refuses every writer and every delete for as
  # long as this handle lives, and the bytes hashed here are read from that handle.
  $held = $null
  try {
    $held = New-Object System.IO.FileStream($TargetPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  }
  catch {
    $record['problem'] = ('{0}: the snapshot could not be locked before it was hashed: {1}' -f $Label, (Protect-Text $_.Exception.Message))
    return $record
  }
  $actual = ''
  try { $actual = Get-NormalizedSha256FromStream -Stream $held }
  catch {
    try { $held.Dispose() } catch { }
    $record['problem'] = ('{0}: the locked snapshot could not be hashed: {1}' -f $Label, (Protect-Text $_.Exception.Message))
    return $record
  }
  if ($actual -cne $ExpectedSha256) {
    try { $held.Dispose() } catch { }
    $record['problem'] = ('{0}: digest is {1}, the reviewed bytes were {2}' -f $Label, $actual, $ExpectedSha256)
    $record['sha256'] = $actual
    return $record
  }
  $record['ok'] = $true
  $record['path'] = $TargetPath
  $record['sha256'] = $actual
  $record['bytes'] = $written
  $record['stream'] = $held
  return $record
}

# The evidence a completed run must have sealed. Declared once: the runner
# demands it (Publish-ClashCompletion) and every consumer requires it, so the
# producer and the consumer cannot drift apart.
# RC02: the required evidence is no longer "the five files that happened to exist
# when this list was written". A completed deployment must carry the baseline, the
# package integrity proof, the preflight, one receipt for EVERY executed migration,
# the postflight, the storage report, the claim release and the finalization intent.
# -Root adds the per-migration receipts that are actually present, so the seal and
# the intent describe the same set the evidence validator checks.
function Get-ClashCompletionRequiredEvidence {
  param([string]$Root = '')
  $required = @(
    '00-baseline.json'
    '01-integrity.json'
    '02-preflight.json'
    '04-postflight.json'
    '05-storage.json'
    '06-claim-release.json'
    '06-finalization-intent.json'
  )
  if (-not [string]::IsNullOrWhiteSpace($Root)) {
    foreach ($name in @(Get-ClashMigrationReceiptNames -Root $Root)) { $required += [string]$name }
  }
  return $required
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
    $Fields = @{},
    [string[]]$RequiredEvidence = @(),
    $Approved = $null,
    [string]$PrevSha = '',
    [int]$ExpectedMigrationCount = 0
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

  # RC02: the PRODUCER runs the same deployment-evidence contract the consumer runs,
  # before it publishes anything at all. A phase receipt that records status FAIL,
  # a missing migration, a preflight that claims 19 gating rows while its own
  # counters sum to 17, an integrity proof that did not pass - each of those used to
  # seal cleanly and be accepted by both halves of the contract.
  # The INTENT must declare what this run actually requires, and that set is derived
  # from the run directory, not from the caller: a caller that supplies six phase
  # names while the run also holds three migration receipts would publish an intent
  # the consumer must reject ("the sealed intent does not declare the required
  # evidence 03-migrations/..."). A caller's extra requirements still widen the seal
  # check, and a caller's names are always included in the intent.
  $requiredFromRun = @(Get-ClashCompletionRequiredEvidence -Root $Root)
  $declaredEvidence = @($requiredFromRun)
  foreach ($extra in @($RequiredEvidence)) {
    if ([string]::IsNullOrWhiteSpace([string]$extra)) { continue }
    if ($declaredEvidence -cnotcontains [string]$extra) { $declaredEvidence += [string]$extra }
  }
  $RequiredEvidence = $declaredEvidence
  $evidence = Test-ClashDeploymentEvidence -Root $Root -ExpectedMigrationCount $ExpectedMigrationCount -Approved $Approved
  if (-not $evidence.ok) {
    # Every problem is rendered with its length, so an empty entry (a null that
    # reached the list) is visible as such instead of as a blank between separators.
    $evidenceSample = @(@($evidence.problems) | Select-Object -First 12 | ForEach-Object {
        '#{0}#{1}#{2}' -f ([string]$_).Length, $(if ($null -eq $_) { 'null' } else { 'str' }), [string]$_ })
    throw ('completion refused: the deployment evidence does not satisfy the contract ({0} problem(s)): {1}. Nothing was published.' -f @($evidence.problems).Count, ($evidenceSample -join '; '))
  }

  # writerRunId is part of the authoritative contract: the consumer checks it
  # against the sealed claim-release receipt. A caller that cannot supply it must
  # not be able to publish a marker at all.
  $writerRunId = ''
  if ($Fields.Contains('writerRunId')) { $writerRunId = [string]$Fields['writerRunId'] }
  if ([string]::IsNullOrWhiteSpace($writerRunId)) {
    throw 'completion refused: the marker requires writerRunId, which is verified against the sealed 06-claim-release.json. Nothing was published.'
  }

  # Provisional receipt: it says finalization started, never that it succeeded.
  # It joins the hash chain so the run's receipts remain one ordered sequence.
  $intentSha = Add-Receipt -Root $Root -Name '06-finalization-intent.json' -PrevSha $PrevSha -Fields @{
    protocol         = $protocol
    status           = 'FINALIZING'
    requiredEvidence = @($declaredEvidence)
    guidance         = 'Provisional. A run is complete only when 06-complete.json exists and Test-ClashRunCompletion accepts it.'
  }

  $seal = Seal-Evidence -Root $Root
  $check = Test-EvidenceSeal -Root $Root -Require $RequiredEvidence
  if (-not $check.ok) {
    $sample = @($check.problems)
    if ($sample.Count -gt 4) { $sample = @($sample[0..3]) }
    throw ('completion refused: the evidence seal does not verify: {0}' -f ($sample -join '; '))
  }

  # Which marker fields are authoritative is declared here, once. Everything the
  # consumer validates is derivable from sealed evidence; everything else is
  # metadata and is explicitly ignored by the consumer.
  $metadata = [ordered]@{}
  foreach ($k in @($Fields.Keys)) {
    if ([string]$k -ceq 'writerRunId') { continue }
    $metadata[[string]$k] = $Fields[$k]
  }
  $object = [ordered]@{
    protocol       = $protocol
    status         = 'COMPLETE'
    utc            = (Get-Date).ToUniversalTime().ToString('o')
    adapter        = ("{0}/{1}" -f $script:ClashAdapterId, $script:ClashAdapterVersion)
    finalized      = $true
    prevReceiptSha = $intentSha
    writerRunId    = $writerRunId
    seal           = [ordered]@{
      name      = 'EVIDENCE-MANIFEST.json'
      sha256    = [string]$check.sha256
      fileCount = [int]$check.fileCount
      chainHead = [string]$check.chainHead
    }
    metadata       = $metadata
  }

  $temp = '{0}.{1}.tmp' -f $marker, ([guid]::NewGuid().ToString('N').Substring(0, 12))
  $markerSha = Write-EvidenceJson -Path $temp -Object $object
  # Verify the candidate BEFORE it becomes authoritative: same bytes, but read
  # back from disk rather than trusted from memory.
  $candidateRoot = Get-ClashJsonRoot -Path $temp -Label 'candidate completion marker' -Kind @('object')
  if (-not $candidateRoot['ok']) {
    throw ('completion refused: {0}; nothing was published' -f $candidateRoot['problem'])
  }
  $candidate = $candidateRoot['value']
  # Producer-side typed self-check, independent of the consumer: the publisher
  # asserts the JSON KIND of every authoritative field it just wrote. A serializer
  # that turned true into "true", 6 into "6" or an object into a one-element array
  # is caught here, before the marker can become authoritative.
  $expectedKinds = @{
    protocol = 'string'; status = 'string'; finalized = 'boolean'; adapter = 'string'
    prevReceiptSha = 'string'; writerRunId = 'string'; seal = 'object'; utc = 'string'; metadata = 'object'
  }
  foreach ($fieldName in @($expectedKinds.Keys)) {
    $actualKind = (Get-ClashJsonField -Object $candidate -Name $fieldName)['kind']
    if ($actualKind -cne $expectedKinds[$fieldName]) {
      throw ('completion refused: the candidate marker wrote {0} as a JSON {1}, not a JSON {2}; nothing was published' -f $fieldName, $actualKind, $expectedKinds[$fieldName])
    }
  }
  $candidateSeal = (Get-ClashJsonField -Object $candidate -Name 'seal')['value']
  foreach ($fieldName in @('name', 'sha256', 'chainHead')) {
    $actualKind = (Get-ClashJsonField -Object $candidateSeal -Name $fieldName)['kind']
    if ($actualKind -cne 'string') {
      throw ('completion refused: the candidate marker wrote seal.{0} as a JSON {1}, not a JSON string; nothing was published' -f $fieldName, $actualKind)
    }
  }
  $candidateCountKind = (Get-ClashJsonField -Object $candidateSeal -Name 'fileCount')['kind']
  if ($candidateCountKind -cne 'integer') {
    throw ('completion refused: the candidate marker wrote seal.fileCount as a JSON {0}, not a JSON integer; nothing was published' -f $candidateCountKind)
  }
  $candidateStatus = (Get-ClashJsonField -Object $candidate -Name 'status')['value']
  $candidateProto  = (Get-ClashJsonField -Object $candidate -Name 'protocol')['value']
  if ($candidateStatus -cne 'COMPLETE' -or $candidateProto -cne $protocol) {
    throw 'completion refused: the candidate marker did not read back as a COMPLETE marker for this protocol'
  }
  $candidateSealSha = (Get-ClashJsonField -Object $candidateSeal -Name 'sha256')['value']
  if ($candidateSealSha -cne [string]$check.sha256) {
    throw 'completion refused: the candidate marker does not bind the seal that was verified'
  }
  # THE COMMIT POINT. Move fails if the marker appeared meanwhile, so the
  # authoritative name is created exactly once and only with verified content.
  [System.IO.File]::Move($temp, $marker)

  $published = $null
  $publishedRoot = Get-ClashJsonRoot -Path $marker -Label 'published completion marker' -Kind @('object')
  if ($publishedRoot['ok']) { $published = $publishedRoot['value'] }
  # Re-verification is part of the protocol, so it must not be able to throw its
  # way out: an unreadable seal here is exactly the doubt this step exists to
  # record.
  $publishedOk = $false
  try {
    if ($null -ne $published) {
      $pubStatus  = (Get-ClashJsonField -Object $published -Name 'status')['value']
      $pubProto   = (Get-ClashJsonField -Object $published -Name 'protocol')['value']
      $pubSeal    = (Get-ClashJsonField -Object $published -Name 'seal')['value']
      $pubSealSha = (Get-ClashJsonField -Object $pubSeal -Name 'sha256')['value']
      $sealOnDisk = Get-NormalizedSha256 -Path (Join-Path $Root 'EVIDENCE-MANIFEST.json')
      # same typed reading as the consumer: the commit protocol must not accept a
      # marker whose fields are the right characters in the wrong JSON type.
      $publishedOk = ((Test-ClashJsonKind -Value $pubStatus -Kind 'string') -and ($pubStatus -ceq 'COMPLETE') -and
        (Test-ClashJsonKind -Value $pubProto -Kind 'string') -and ($pubProto -ceq $protocol) -and
        (Test-ClashJsonKind -Value $pubSeal -Kind 'object') -and
        (Test-ClashJsonKind -Value $pubSealSha -Kind 'string') -and ($pubSealSha -ceq [string]$sealOnDisk))
    }
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

  # The publisher accepts its own output only if the CONSUMER accepts it. A
  # marker the consumer would reject is never reported as a successful
  # finalization, whatever the publisher believes it wrote.
  # Round 21 (R20-H1): the publisher's self-check runs against the APPROVED package
  # it was told to deploy. Without -Approved the consumer fell back to the manifest
  # beside the adapter and refused runs whose approved inventory was supplied by the
  # caller - a producer that certifies its own output against a different contract
  # than the one it was invoked with is exactly the hole this round closes.
  $selfCheck = Test-ClashRunCompletion -RunPath $Root -Approved $Approved
  if (-not $selfCheck.ok) {
    $shown = @($selfCheck.problems)
    if ($shown.Count -gt 6) { $shown = @($shown[0..5]) }
    try {
      [void](Add-Receipt -Root $Root -Name '06-complete-unverified.json' -PrevSha $markerSha -Fields @{
          protocol = $protocol
          status   = 'UNVERIFIED'
          reason   = 'the published marker does not satisfy the completion contract'
          problems = @($shown)
        })
    }
    catch { Write-Host ('REPORT LOST: the doubt receipt could not be persisted: {0}' -f (Protect-Text $_.Exception.Message)) -ForegroundColor Red }
    throw ('completion refused: the published marker fails the completion contract: {0}' -f ($shown -join '; '))
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

# ------------------------------------------------------------------ consumer --
# The consumer half of the contract. AUTHORITATIVE marker fields, and where each
# one is derived from (all of them from sealed evidence):
#
#   protocol        constant clash-completion/2
#   status          constant COMPLETE
#   finalized       boolean true (a string "true" is not accepted)
#   adapter         the adapter identity recorded in the verified seal
#   prevReceiptSha  sha256 of the SEALED 06-finalization-intent.json
#   writerRunId     the runId recorded in the SEALED 06-claim-release.json
#   seal.name       constant EVIDENCE-MANIFEST.json
#   seal.sha256     the normalised sha256 of the seal on disk
#   seal.fileCount  the number of entries the seal lists
#   seal.chainHead  the chain head RE-DERIVED from the seal's entries
#
# Plus the sealed finalization intent, which must itself chain to the sealed
# claim release and declare required evidence that is really sealed.
#
# NOT authoritative, and never trusted: "utc" (checked for parseability only,
# used for nothing) and "metadata" (free-form copies of facts that are proven by
# their own sealed receipts). A consumer must not accept a claim from either.
function Test-ClashRunCompletion {
  param(
    [Parameter(Mandatory = $true)][string]$RunPath,
    # Round 21 (R20-H1): the consumer judges the published run against the approved
    # package, exactly as the producer did. The default is the manifest beside the
    # adapter; a caller may inject an inventory, but never one read from the run.
    $Approved = $null
  )

  $protocol      = 'clash-completion/2'
  $sealName      = 'EVIDENCE-MANIFEST.json'
  $problems      = New-Object System.Collections.Generic.List[string]
  $markerPath    = Join-Path $RunPath '06-complete.json'
  $doubtPath     = Join-Path $RunPath '06-complete-unverified.json'
  $exceptionPath = Join-Path $RunPath '99-runner-exception.json'
  $intentPath    = Join-Path $RunPath '06-finalization-intent.json'
  $releasePath   = Join-Path $RunPath '06-claim-release.json'
  $sealPath      = Join-Path $RunPath $sealName

  if (-not (Test-Path -LiteralPath $markerPath)) { $problems.Add('no 06-complete.json: the run is not finalised') }
  if (Test-Path -LiteralPath $doubtPath) { $problems.Add('06-complete-unverified.json is present: the run published a marker it could not verify') }
  if (Test-Path -LiteralPath $exceptionPath) { $problems.Add('99-runner-exception.json is present: the run ended in an exception') }

  # The seal is the anchor: it is verified first, and every authoritative marker
  # field is then compared against it.
  $check = Test-EvidenceSeal -Root $RunPath -Require @(Get-ClashCompletionRequiredEvidence -Root $RunPath)
  if (-not $check.ok) {
    $shown = @($check.problems)
    if ($shown.Count -gt 6) { $shown = @($shown[0..5]) }
    foreach ($p in $shown) { $problems.Add(('seal: {0}' -f $p)) }
  }

  # RC05/RC02: the consumer validates the DEPLOYMENT EVIDENCE as well as the seal.
  # The two are independent checks: the seal proves the bytes did not change, this
  # proves the bytes do not describe a failed deployment. Sharing one incomplete
  # predicate between producer and consumer is what let Codex seal three required
  # phased receipts with status FAIL and have both sides accept them.
  $evidence = Test-ClashDeploymentEvidence -Root $RunPath -Approved $Approved
  if (-not $evidence.ok) {
    $evidenceProblems = @($evidence.problems)
    $evidenceShown = $evidenceProblems
    if ($evidenceShown.Count -gt 6) { $evidenceShown = @($evidenceShown[0..5]) }
    foreach ($p in $evidenceShown) { $problems.Add(('deployment evidence: {0}' -f $p)) }
    if ($evidenceProblems.Count -gt 6) {
      $problems.Add(('deployment evidence: {0} more problem(s) were not shown' -f ($evidenceProblems.Count - 6)))
    }
  }

  # C18-C1: the marker ROOT is validated on its own, so an unparsable, empty,
  # null, array or scalar marker is a rejection even though every field check
  # below is guarded by "the document parsed".
  $markerRoot = Get-ClashJsonRoot -Path $markerPath -Label 'completion marker' -Kind @('object')
  if (-not $markerRoot['ok']) { $problems.Add($markerRoot['problem']) }
  $document = $markerRoot['value']

  # The seal document is parsed here ONLY for the adapter identity it records.
  # Its root is validated by Test-EvidenceSeal above (C18-C1), which already
  # rejects a missing, empty, null, array or malformed seal, so a null value here
  # cannot be used to accept anything.
  $sealDocument = $null
  if (Test-Path -LiteralPath $sealPath -PathType Leaf) {
    try { $sealDocument = [System.IO.File]::ReadAllText($sealPath) | ConvertFrom-Json }
    catch { $sealDocument = $null }
  }

  if ($null -ne $document) {
    # The marker must be a JSON OBJECT. A scalar or array root has no fields at
    # all, so it is reported as the wrong shape instead of as ten mysteries.
    if (-not (Test-ClashJsonKind -Value $document -Kind 'object')) {
      $problems.Add(('06-complete.json is {0}; a completion marker must be a JSON object' -f (Format-ClashFieldValue -Value $document)))
    }

    # ---- 1-3: the three constants -----------------------------------------
    # Every authoritative field is read with Get-ClashJsonField and gated on its
    # JSON KIND before its value is used. A one-element array is not a string, an
    # array is not a boolean, and an array of one seal is not a seal object.
    $proto = (Get-ClashJsonField -Object $document -Name 'protocol')['value']
    if (-not (Test-ClashJsonKind -Value $proto -Kind 'string') -or $proto -cne $protocol) {
      $problems.Add(('the marker protocol is {0}, not "{1}"' -f (Format-ClashFieldValue $proto), $protocol))
    }
    $status = (Get-ClashJsonField -Object $document -Name 'status')['value']
    if (-not (Test-ClashJsonKind -Value $status -Kind 'string') -or $status -cne 'COMPLETE') {
      $problems.Add(('the marker status is {0}, not COMPLETE' -f (Format-ClashFieldValue $status)))
    }
    $finalized = (Get-ClashJsonField -Object $document -Name 'finalized')['value']
    if (-not (Test-ClashJsonKind -Value $finalized -Kind 'boolean') -or $finalized -ne $true) {
      $problems.Add(('the marker finalized field is {0}; a completed finalization must be boolean true' -f (Format-ClashFieldValue $finalized)))
    }

    # ---- 4: utc is ordering metadata: parseable, never trusted ------------
    $utc = (Get-ClashJsonField -Object $document -Name 'utc')['value']
    $utcOk = $false
    if ($utc -is [string] -and -not [string]::IsNullOrWhiteSpace($utc)) {
      $parsed = [datetime]::MinValue
      $utcOk = [datetime]::TryParse($utc, [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::RoundtripKind, [ref]$parsed)
    }
    if (-not $utcOk) {
      $problems.Add(('the marker utc is {0}; it must be a parseable ISO-8601 timestamp' -f (Format-ClashFieldValue $utc)))
    }

    # ---- 5: adapter identity must match the verified seal ----------------
    $adapter = (Get-ClashJsonField -Object $document -Name 'adapter')['value']
    $sealAdapter = (Get-ClashJsonField -Object $sealDocument -Name 'adapter')['value']
    if (-not (Test-ClashJsonKind -Value $adapter -Kind 'string') -or [string]::IsNullOrWhiteSpace([string]$adapter)) {
      $problems.Add(('the marker adapter is {0}' -f (Format-ClashFieldValue $adapter)))
    }
    elseif (-not (Test-ClashJsonKind -Value $sealAdapter -Kind 'string') -or [string]::IsNullOrWhiteSpace([string]$sealAdapter)) {
      $problems.Add('the seal records no adapter identity, so the marker adapter cannot be verified')
    }
    elseif ([string]$adapter -cne [string]$sealAdapter) {
      $problems.Add(('the marker adapter is "{0}" but the seal was written by "{1}"' -f $adapter, $sealAdapter))
    }

    # ---- 6-9: the seal block ---------------------------------------------
    $markerSeal = (Get-ClashJsonField -Object $document -Name 'seal')['value']
    if (-not (Test-ClashJsonKind -Value $markerSeal -Kind 'object')) {
      $problems.Add(('the marker seal block is {0}; it must be an object' -f (Format-ClashFieldValue $markerSeal)))
    }
    else {
      $sealFieldName = (Get-ClashJsonField -Object $markerSeal -Name 'name')['value']
      if (-not (Test-ClashJsonKind -Value $sealFieldName -Kind 'string') -or $sealFieldName -cne $sealName) {
        $problems.Add(('the marker names the seal {0}, not "{1}"' -f (Format-ClashFieldValue $sealFieldName), $sealName))
      }
      $boundSha = (Get-ClashJsonField -Object $markerSeal -Name 'sha256')['value']
      if (-not (Test-ClashSha256Text $boundSha)) {
        $problems.Add(('the marker seal sha256 is {0}; it must be 64 lowercase hex characters' -f (Format-ClashFieldValue $boundSha)))
      }
      elseif ([string]$boundSha -cne [string]$check.sha256) {
        $problems.Add(('the marker binds seal {0} but the seal on disk is {1}' -f $boundSha, (Format-ClashFieldValue $check.sha256)))
      }
      $boundCount = (Get-ClashJsonField -Object $markerSeal -Name 'fileCount')['value']
      if (-not (Test-ClashIntegerValue $boundCount)) {
        $problems.Add(('the marker seal fileCount is {0}; it must be an integer' -f (Format-ClashFieldValue $boundCount)))
      }
      elseif ([int]$boundCount -ne [int]$check.fileCount) {
        $problems.Add(('the marker says the seal covers {0} file(s), the seal lists {1}' -f $boundCount, $check.fileCount))
      }
      $boundHead = (Get-ClashJsonField -Object $markerSeal -Name 'chainHead')['value']
      if (-not (Test-ClashSha256Text $boundHead)) {
        $problems.Add(('the marker seal chainHead is {0}; it must be 64 lowercase hex characters' -f (Format-ClashFieldValue $boundHead)))
      }
      elseif ([string]$boundHead -cne [string]$check.chainHead) {
        $problems.Add(('the marker declares seal chain head {0} but the seal re-derives to {1}' -f $boundHead, (Format-ClashFieldValue $check.chainHead)))
      }
    }

    # ---- 10: the receipt-chain predecessor must be the sealed intent -----
    $prev = (Get-ClashJsonField -Object $document -Name 'prevReceiptSha')['value']
    $intentHashes = @(Get-ClashFileHashes -Path $intentPath)
    if (-not (Test-ClashSha256Text $prev)) {
      $problems.Add(('the marker prevReceiptSha is {0}; it must be 64 lowercase hex characters' -f (Format-ClashFieldValue $prev)))
    }
    elseif ($intentHashes.Count -eq 0) {
      $problems.Add('the marker prevReceiptSha cannot be verified: the sealed 06-finalization-intent.json is missing or unreadable')
    }
    elseif ($intentHashes -cnotcontains [string]$prev) {
      $problems.Add(('the marker prevReceiptSha {0} is not the hash of the sealed 06-finalization-intent.json ({1})' -f $prev, $intentHashes[0]))
    }

    # ---- 11: the sealed intent must be a FINALIZING intent that chains to the
    #          sealed claim release and declares evidence that is really sealed
    $intentHashesNow = @(Get-ClashFileHashes -Path $intentPath)
    if ($intentHashesNow.Count -eq 0) {
      $problems.Add('the sealed 06-finalization-intent.json is missing or unreadable, so the run has no finalization intent')
    }
    else {
      $intentRoot = Get-ClashJsonRoot -Path $intentPath -Label 'sealed finalization intent' -Kind @('object')
      if (-not $intentRoot['ok']) { $problems.Add($intentRoot['problem']) }
      $intent = $intentRoot['value']
      if (($null -ne $intent) -and (-not (Test-ClashJsonKind -Value $intent -Kind 'object'))) {
        $problems.Add(('06-finalization-intent.json is {0}; a finalization intent must be a JSON object' -f (Format-ClashFieldValue -Value $intent)))
      }
      elseif ($null -ne $intent) {
        $intentName = (Get-ClashJsonField -Object $intent -Name 'receipt')['value']
        if (-not (Test-ClashJsonKind -Value $intentName -Kind 'string') -or $intentName -cne '06-finalization-intent.json') {
          $problems.Add(('the sealed intent names itself {0}, not "06-finalization-intent.json"' -f (Format-ClashFieldValue $intentName)))
        }
        $intentProto = (Get-ClashJsonField -Object $intent -Name 'protocol')['value']
        if (-not (Test-ClashJsonKind -Value $intentProto -Kind 'string') -or $intentProto -cne $protocol) {
          $problems.Add(('the sealed intent protocol is {0}, not "{1}"' -f (Format-ClashFieldValue $intentProto), $protocol))
        }
        $intentStatus = (Get-ClashJsonField -Object $intent -Name 'status')['value']
        if (-not (Test-ClashJsonKind -Value $intentStatus -Kind 'string') -or $intentStatus -cne 'FINALIZING') {
          $problems.Add(('the sealed intent status is {0}, not FINALIZING' -f (Format-ClashFieldValue $intentStatus)))
        }
        # the intent must chain to the sealed claim release
        $intentPrev = (Get-ClashJsonField -Object $intent -Name 'prevReceiptSha')['value']
        $releaseHashes = @(Get-ClashFileHashes -Path $releasePath)
        if (-not (Test-ClashSha256Text $intentPrev)) {
          $problems.Add(('the sealed intent prevReceiptSha is {0}; it must be 64 lowercase hex characters' -f (Format-ClashFieldValue $intentPrev)))
        }
        elseif ($releaseHashes.Count -eq 0) {
          $problems.Add('the sealed intent cannot be chained: 06-claim-release.json is missing or unreadable')
        }
        elseif ($releaseHashes -cnotcontains [string]$intentPrev) {
          $problems.Add(('the sealed intent prevReceiptSha {0} is not the hash of the sealed 06-claim-release.json ({1})' -f $intentPrev, $releaseHashes[0]))
        }
        # declared required evidence must be a clean list and really be sealed
        $declaredRaw = (Get-ClashJsonField -Object $intent -Name 'requiredEvidence')['value']
        if (-not (Test-ClashJsonKind -Value $declaredRaw -Kind 'array')) {
          $problems.Add(('the sealed intent requiredEvidence is {0}; it must be a non-empty array' -f (Format-ClashFieldValue $declaredRaw)))
        }
        else {
          $declared = @($declaredRaw)
          if ($declared.Count -eq 0) { $problems.Add('the sealed intent declares no required evidence') }
          $seenDeclared = @{}
          # A declared entry is a RELATIVE path ('03-migrations/001-...json'), not a
          # leaf name: comparing it with $_.Name made every migration receipt look
          # absent and refused every finalization (the RC07 class, in the consumer).
          $runFiles = @(Get-ClashSealedFileCandidates -Root $RunPath)
          foreach ($entry in $declared) {
            if (-not ($entry -is [string]) -or [string]::IsNullOrWhiteSpace([string]$entry)) {
              $problems.Add(('the sealed intent declares a required evidence entry that is not a name: {0}' -f (Format-ClashFieldValue $entry)))
              continue
            }
            if ($seenDeclared.ContainsKey([string]$entry)) {
              $problems.Add(('the sealed intent declares {0} twice' -f $entry))
              continue
            }
            $seenDeclared[[string]$entry] = $true
            $hits = @($runFiles | Where-Object { [string]$_['relative'] -ceq [string]$entry }).Count
            if ($hits -lt 1) { $problems.Add(('the sealed intent requires {0} but no such file exists in the run' -f $entry)) }
          }
          $sealEntriesField = Get-ClashJsonField -Object $sealDocument -Name 'files'
          $sealEntries = @()
          if ($sealEntriesField['kind'] -ceq 'array') { $sealEntries = @($sealEntriesField['value']) }
          foreach ($must in @(Get-ClashCompletionRequiredEvidence -Root $RunPath)) {
            if (-not $seenDeclared.ContainsKey($must)) {
              $problems.Add(('the sealed intent does not declare the required evidence {0}' -f $must))
            }
            $sealed = 0
            foreach ($entry in $sealEntries) {
              $entryPath = (Get-ClashJsonField -Object $entry -Name 'path')['value']
              if ((Test-ClashJsonKind -Value $entryPath -Kind 'string') -and ([string]$entryPath -ceq $must)) { $sealed++ }
            }
            if ($sealed -ne 1) { $problems.Add(('the evidence {0} appears {1} time(s) in the seal, expected exactly 1' -f $must, $sealed)) }
          }
        }
      }
    }

    # ---- 12: writerRunId must match the sealed claim release -------------
    $writerRun  = (Get-ClashJsonField -Object $document -Name 'writerRunId')['value']
    $releaseRoot = Get-ClashJsonRoot -Path $releasePath -Label 'sealed claim release' -Kind @('object')
    if (-not $releaseRoot['ok']) { $problems.Add($releaseRoot['problem']) }
    $releaseDoc = $releaseRoot['value']
    if (($null -ne $releaseDoc) -and (-not (Test-ClashJsonKind -Value $releaseDoc -Kind 'object'))) {
      $problems.Add(('the sealed 06-claim-release.json is {0}; a claim release must be a JSON object' -f (Format-ClashFieldValue -Value $releaseDoc)))
    }
    $releaseRun   = (Get-ClashJsonField -Object $releaseDoc -Name 'runId')['value']
    $releaseState = (Get-ClashJsonField -Object $releaseDoc -Name 'status')['value']
    $releaseDone  = (Get-ClashJsonField -Object $releaseDoc -Name 'released')['value']
    if (-not (Test-ClashJsonKind -Value $writerRun -Kind 'string') -or [string]::IsNullOrWhiteSpace([string]$writerRun)) {
      $problems.Add(('the marker writerRunId is {0}' -f (Format-ClashFieldValue $writerRun)))
    }
    elseif ($null -eq $releaseDoc) {
      $problems.Add('the marker writerRunId cannot be verified: 06-claim-release.json is missing or unreadable')
    }
    else {
      if (-not (Test-ClashJsonKind -Value $releaseState -Kind 'string') -or $releaseState -cne 'PASS') {
        $problems.Add(('the sealed claim release status is {0}, not PASS' -f (Format-ClashFieldValue $releaseState)))
      }
      if (-not (Test-ClashJsonKind -Value $releaseDone -Kind 'boolean') -or $releaseDone -ne $true) {
        $problems.Add(('the sealed claim release does not record released = true ({0})' -f (Format-ClashFieldValue $releaseDone)))
      }
      if (-not (Test-ClashJsonKind -Value $releaseRun -Kind 'string') -or $releaseRun -cne [string]$writerRun) {
        $problems.Add(('the marker writerRunId "{0}" is not the runId {1} recorded by the sealed claim release' -f $writerRun, (Format-ClashFieldValue -Value $releaseRun)))
      }
    }
  }

  $markerSha = ''
  if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
    try { $markerSha = Get-NormalizedSha256 -Path $markerPath } catch { $markerSha = '' }
  }

  # The verdict record reports the protocol only when the marker really carries a
  # JSON string. Reporting the enumerated scalar here is what made C17-C1 look
  # accepted even to a careful reader of this record.
  $reportedProtocol = ''
  $reportedProtocolKind = 'missing'
  if ($null -ne $document) {
    $reportedField = Get-ClashJsonField -Object $document -Name 'protocol'
    $reportedProtocolKind = [string]$reportedField['kind']
    if ($reportedProtocolKind -ceq 'string') { $reportedProtocol = [string]$reportedField['value'] }
  }

  return [ordered]@{
    ok          = ($problems.Count -eq 0)
    problems    = @($problems)
    protocolKind = $reportedProtocolKind
    protocol    = $reportedProtocol
    sealSha256  = [string]$check.sha256
    sealFiles   = [int]$check.fileCount
    sealChain   = [string]$check.chainHead
    markerSha256 = $markerSha
  }
}

# ------------------------------------------------------- connection policy --
# Project identity and transport security are enforced, not defaulted.
function Resolve-ExecutionPolicy {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRef,
    [string]$PgHost,
    [string]$ConfirmedPoolerHost = '',
    [int]$PgPort = 5432,
    [string]$PgUser = 'postgres',
    [string]$PgDatabase = 'postgres',
    [string]$CaCert = ''
  )
  if ($ProjectRef -cnotmatch '\A[a-z0-9]{20}\z') {
    throw ("ProjectRef '{0}' is not a 20-character Supabase project ref." -f $ProjectRef)
  }
  $direct = ('db.{0}.supabase.co' -f $ProjectRef)
  # One DNS label: aws-INDEX-REGION. Regions have two or more word segments
  # followed by a numeric partition (ap-south-1, us-gov-east-1, etc.). ASCII,
  # case-sensitive absolute anchors also refuse trailing LF and lookalikes.
  $pooler = '\Aaws-[0-9]+-[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)+-[0-9]+\.pooler\.supabase\.com\z'

  $mode = ''
  if ([string]::IsNullOrEmpty($PgHost)) { $PgHost = $direct }
  if ($PgHost -ceq $direct) {
    $mode = 'direct'
    if ($PgPort -ne 5432) { throw ("Direct host {0} requires port 5432, not {1}." -f $PgHost, $PgPort) }
  }
  elseif ($PgHost -cmatch $pooler -and $PgHost.Split('.')[0].Length -le 63) {
    $mode = 'pooler'
    # Shared session pooling is 5432. Transaction pooling on 6543 cannot retain
    # the session state required by the writer claim and migration runner.
    if ($PgPort -ne 5432) { throw ("Session pooler host {0} requires port 5432; transaction pooling on 6543 is refused (received {1})." -f $PgHost, $PgPort) }
    $wantUser = 'postgres.' + $ProjectRef
    if ($PgUser -cne $wantUser) { throw ("Pooler user must be '{0}' for project '{1}', not '{2}'." -f $wantUser, $ProjectRef, $PgUser) }
    if ([string]::IsNullOrEmpty($ConfirmedPoolerHost) -or $ConfirmedPoolerHost -cne $PgHost) {
      throw 'ConfirmedPoolerHost must exactly match PgHost copied from this project Dashboard Connect > Session pooler. Never infer a host from the region.'
    }
  }
  else {
    throw 'Host is not permitted for project. Use its exact direct host or a dashboard-confirmed aws-INDEX-REGION.pooler.supabase.com session host.'
  }
  if ($PgDatabase -cne 'postgres') { throw ("Database must be 'postgres', not '{0}'." -f $PgDatabase) }

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
  if (-not (Test-Path -LiteralPath $ca -PathType Leaf)) { throw ("CA certificate not found: {0}" -f $ca) }
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
      gating = 28
      info   = 0
      checks = @(
        [ordered]@{ ord = 1;  name = 'ledger rows';                                        expected = '119';        info = $false }
        [ordered]@{ ord = 2;  name = 'ledger versions match manifest exactly';             expected = '119';        info = $false }
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
        [ordered]@{ ord = 20; name = 'public tables without RLS'; expected = '0'; info = $false }
        [ordered]@{ ord = 21; name = 'beta guard prerequisites present'; expected = '0'; info = $false }
        [ordered]@{ ord = 22; name = 'Meet admission closed'; expected = 'false'; info = $false }
        [ordered]@{ ord = 23; name = 'beta take identity trigger enabled'; expected = '1'; info = $false }
        [ordered]@{ ord = 24; name = 'beta participant write fences enabled'; expected = '6'; info = $false }
        [ordered]@{ ord = 25; name = 'Storage upload admission trigger enabled'; expected = '1'; info = $false }
        [ordered]@{ ord = 26; name = 'legacy start_clash API execute grants'; expected = '0'; info = $false }
        [ordered]@{ ord = 27; name = 'creator continuation approval API table grants'; expected = '0'; info = $false }
        [ordered]@{ ord = 28; name = 'obsolete Storage admission policies'; expected = '0'; info = $false }
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
        [ordered]@{ ord = 6; name = 'storage.objects policies';                      expected = '4';         info = $false }
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
# RC05: what the 'actual' column is allowed to say, given the expectation the SQL
# declares. One function so the three contracts cannot each invent a rule.
function Get-ClashReportActualProblem {
  param([string]$Expected, [string]$Actual, [bool]$IsInfo)
  if ($IsInfo) {
    if ([string]::IsNullOrWhiteSpace($Actual)) { return 'the actual cell is empty; an INFO row must still render the fact it reports' }
    return ''
  }
  if ($Expected -match '^>=(\d+)$') {
    $floor = [int]$Matches[1]
    $parsed = 0
    if (-not [int]::TryParse($Actual, [ref]$parsed)) {
      return ('the actual cell ''{0}'' is not an integer, so it cannot be compared with the declared ''{1}''' -f $Actual, $Expected)
    }
    if ($parsed -lt $floor) { return ('the actual value {0} does not satisfy the declared ''{1}''' -f $parsed, $Expected) }
    return ''
  }
  if ($Actual -cne $Expected) {
    return ('the actual cell ''{0}'' disagrees with the declared expectation ''{1}''; a PASS row must render the value it claims' -f $Actual, $Expected)
  }
  return ''
}

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
      # RC05: the actual cell is read and kept. The parser used to throw it away and
      # trust the status cell, so a report that rendered 'PASS' beside a blank or
      # contradictory actual value was accepted - the status column is produced BY
      # the SQL from this column, so a status that disagrees with its own actual is
      # a rewritten report, not a passing check.
      $actual = ([string]$fields[3]).Trim()
      if ($byOrd.Contains($ord)) { $duplicates += $ord; continue }
      $byOrd[$ord] = [ordered]@{ ord = $ord; name = $name; expected = $expected; actual = $actual; status = $status }
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
    # RC05: the ACTUAL cell must satisfy the declared expectation, using the same
    # rule the SQL renders the status with: '>=N' means an integer of at least N,
    # anything else means the exact expected text. An INFO row carries prose, so it
    # only has to be non-empty.
    $actualProblem = Get-ClashReportActualProblem -Expected ([string]$d.expected) -Actual ([string]$row.actual) -IsInfo ([bool]$d.info)
    if ($actualProblem.Length -gt 0) {
      $problems += ("check {0} ({1}): {2}" -f $ord, $d.name, $actualProblem)
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
  'deployTailIsTheOnlyCompletionPath',
  # Round 17 (C16-C1): every authoritative marker field is verified against
  # sealed evidence, one mutation at a time.
  'completionRejectsCodexChainMutation',
  'completionRejectsWrongPrevReceiptShaOnly',
  'completionRejectsWrongSealChainHeadOnly',
  'completionRejectsMissingIntent',
  'completionRejectsMisTypedMarker',
  'completionRejectsMalformedHashFields',
  'completionRejectsIntentChainBreak',
  'completionRejectsPostSealEvidenceLoss',
  'completionRejectsContradictoryWriterRunId',
  'completionRejectsUnknownSealName',
  'completionRejectsForeignAdapter',
  # Round 18 (C17-C1): the JSON type boundary. The shared accessor must not
  # enumerate, and every authoritative field is gated on its exact JSON kind.
  'jsonAccessorPreservesCollectionShape',
  'jsonFieldReportsExactJsonKinds',
  'jsonFieldSeparatesMissingFromNull',
  'completionRejectsProtocolSingletonArray',
  'completionRejectsProtocolEmptyArray',
  'completionRejectsProtocolMultiValueArray',
  'completionRejectsProtocolNestedArray',
  'completionRejectsProtocolObject',
  'completionRejectsProtocolNull',
  'completionRejectsArrayTypedMarkerFields',
  'completionRejectsArrayTypedSealBlockFields',
  'completionRejectsCollectionRootMarker',
  'evidenceSealRejectsNonArrayFiles',
  'evidenceSealRejectsStringFileCount',
  'evidenceSealRejectsArrayChainHead',
  'completionRejectsCollectionValuedIntent',
  'completionRejectsCollectionValuedClaimRelease',
  'selfTestReceiptRejectsCollectionValuedMetadata',
  # Round 19 (C18-C1): the ROOT of every document is validated on its own -
  # missing, empty, whitespace, null, array, scalar, malformed, and a valid object.
  'completionRejectsNullRootMarker',
  'completionRejectsEmptyRootMarker',
  'completionRejectsWhitespaceRootMarker',
  'completionRejectsArrayRootMarker',
  'completionRejectsScalarRootMarker',
  'completionRejectsMalformedRootMarker',
  'completionRejectsMissingRootMarker',
  # Round 20 (RC01-RC11): the systemic validation boundary, executed.
  'casePassedRequiresJsonBooleanTrue',
  'deploymentEvidenceRejectsFailedPhase',
  'deploymentEvidenceRejectsContradictoryCounters',
  'deploymentEvidenceRequiresEveryMigration',
  'packageIntegrityRejectsTamperedTree',
  'packageIntegrityRejectsUnreadableChecksumLine',
  'packageIntegrityRejectsManifestDrift',
  'gateBaselineRequiresProvenGitCapture',
  'reportActualCellMustSatisfyExpected',
  'containedPathRejectsEscape',
  'sealEntriesAreContainedAndSized',
  'hiddenEvidenceIsSealedAndUnsealedDetected',
  'jsonFieldReadsBothObjectRepresentations',
  'suiteSummaryRequiresTypedIntegers',
  'mutatedValidatorIsDetectedByTheSuite',
  'jsonRootStatesAreValidated',
  'completionAcceptsValidObjectRoot',
  'evidenceSealRejectsNullRoot',
  'evidenceSealRejectsEmptyRoot',
  'completionRejectsNullRootIntent',
  'completionRejectsNullRootClaimRelease',
  'selfTestReceiptRejectsInvalidRoot',
  'adapterSelfTestRejectsNullRootReceipt',
  'approvedInventoryIsTheOnlySourceOfExpectedMigrations',
  'completionRejectsSelfConsistentButUnapprovedEvidence',
  'sqlSnapshotIsLockedBeforeItIsHashed',
  'reparsePointsCannotRedirectEvidence',
  'certificationProblemsMustBePlainStrings',
  'packageFidelityBindsEveryWrapperToItsOriginal',
  'writerReceiptStreamRoundTripsThroughProducerAndConsumer',
  'receiptChainRejectsBrokenAndExemptedLinks',
  'wrapperBodyIsTheApprovedBodyExactly',
  'wrapperEnvelopeRejectsContentOutsideTheTransaction',
  'completionRejectsUnapprovedAndContradictoryEvidence',
  'wrapperEnvelopeRejectsBareCarriageControls'
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
    if ($Object.Contains($Name)) { return ,$Object[$Name] }
    return $Default
  }
  $p = $Object.PSObject.Properties[$Name]
  if ($null -eq $p) { return $Default }
  # Same C17-C1 boundary as Get-ClashProperty: the pipeline would enumerate an
  # array, so a receipt that recorded ["PASS"] would arrive as the string "PASS".
  return ,$p.Value
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
    if ($Cases.Contains($Name)) { return ,$Cases[$Name] }
    return $null
  }
  $p = $Cases.PSObject.Properties[$Name]
  if ($null -eq $p) { return $null }
  # as everywhere else: a case record that happened to be an array must arrive as
  # an array, so the caller's shape check sees the truth (C17-C1 class)
  return ,$p.Value
}

# RC01 (C19-C1): the ONE reading of a case record's pass/fail authority.
#
# The previous check was `if ($passed -ne $true) { problem }`. On an array,
# PowerShell's -ne is a FILTER: `[false,true] -ne $true` returns @($false), which
# is truthy, so the rejection never fired; 1, "true", [true], [true,true] and []
# all certified too. A test receipt is authoritative evidence, so the field is now
# read as a field - present, then KIND, then VALUE - and only a JSON boolean true
# passes. Every consumer of a case record goes through this function, so the
# adapter validator and the harness cannot drift apart.
function Get-ClashCasePassedProblem {
  param($Entry, [Parameter(Mandatory = $true)][string]$Name, [string]$Context = 'case')
  $field = Get-ClashJsonField -Object $Entry -Name 'passed'
  if (-not $field['present']) {
    return ("{0} '{1}' records no passed field" -f $Context, $Name)
  }
  if ($field['kind'] -cne 'boolean') {
    return ("{0} '{1}' records passed as {2}; only a JSON boolean true certifies a case" -f $Context, $Name, (Format-ClashFieldValue -Value $field['value']))
  }
  if ($field['value'] -cne $true) {
    return ("{0} '{1}' is not recorded as passed (passed = {2})" -f $Context, $Name, (Format-ClashFieldValue -Value $field['value']))
  }
  return ''
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
    return [ordered]@{ ok = $false; problems = @('receipt is empty: an adapter self-test receipt must be a JSON object, and this document parsed to null') }
  }
  if (-not (Test-ClashJsonKind -Value $Document -Kind 'object')) {
    $problems += ('the receipt root is {0}; an adapter self-test receipt must be a JSON object' -f (Format-ClashFieldValue -Value $Document))
  }

  # the declared inventory itself must be valid before it is used to judge a receipt
  $declaredCheck = Assert-SelfTestInventory -Names (Get-ClashSelfTestInventory)
  if (-not $declaredCheck.ok) {
    foreach ($p in @($declaredCheck.problems)) { $problems += ('declared inventory invalid: ' + $p) }
  }

  # A verification receipt is untrusted input too, and its SHAPE decides what it
  # can prove. Every field a verdict depends on must be the JSON type the contract
  # declares: a verdict of ["PASS"], a casesExecuted of [102] or a problems string
  # are wrong types, not shortcuts (C17-C1 class).
  foreach ($shape in @(
      @{ name = 'adapterId'; kind = 'string' },
      @{ name = 'adapterVersion'; kind = 'string' },
      @{ name = 'adapterSha256'; kind = 'string' },
      @{ name = 'verdict'; kind = 'string' },
      @{ name = 'powerShellVersion'; kind = 'string' },
      @{ name = 'problems'; kind = 'array' },
      @{ name = 'casesExecuted'; kind = 'integer' },
      @{ name = 'cases'; kind = 'object' })) {
    $shapeField = Get-ClashJsonField -Object $Document -Name $shape['name']
    if ($shapeField['kind'] -cne $shape['kind']) {
      $problems += ('receipt field {0} is a JSON {1}, not a JSON {2}' -f $shape['name'], $shapeField['kind'], $shape['kind'])
    }
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
  # RC01 residual (Round 21): `problems` is a JSON array of non-empty strings and
  # nothing else. The old reader stringified every element and dropped the ones that
  # stringified to whitespace, so `[[]]`, `[[],[]]` and `[{}]` were silently ignored -
  # a receipt could carry arbitrary structure in the field that is supposed to list
  # what went wrong. The declared schema is now enforced element by element.
  $problemsList = @()
  $problemsField = Get-ClashJsonField -Object $Document -Name 'problems'
  if ($problemsField['kind'] -cne 'array') {
    $problems += (New-ClashFieldProblem 'receipt' 'problems' ($problemsField['value']) 'a JSON array of non-empty strings')
  }
  else {
    foreach ($item in @($problemsField['value'])) {
      if (-not ($item -is [string])) {
        $problems += ('receipt problems carries {0}; a problem list is an array of non-empty strings' -f (Format-ClashFieldValue -Value $item))
        continue
      }
      if ([string]::IsNullOrWhiteSpace([string]$item)) {
        $problems += 'receipt problems carries an empty entry; a problem list is an array of non-empty strings'
        continue
      }
      $problemsList += [string]$item
    }
  }
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
      # RC01: a case record must be an OBJECT carrying a JSON boolean true. The
      # shape of the record is decided here, before its authority is read, so a
      # record that is a string, a number, null or an ARRAY can never satisfy the
      # inventory. Get-ClashCasePassedProblem is the single implementation.
      if (-not (Test-ClashJsonKind -Value $entry -Kind 'object')) {
        $problems += ("case '{0}' is recorded as {1}; a case record must be a JSON object with passed = true" -f $name, (Format-ClashFieldValue -Value $entry))
        continue
      }
      $passedProblem = Get-ClashCasePassedProblem -Entry $entry -Name $name
      if ($passedProblem.Length -gt 0) { $problems += $passedProblem }
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
  $receiptRoot = Get-ClashJsonRoot -Path $ReceiptPath -Label 'adapter self-test receipt' -Kind @('object')
  if (-not $receiptRoot['ok']) { throw ('Adapter self-test receipt rejected: ' + $receiptRoot['problem']) }
  $doc = $receiptRoot['value']

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
