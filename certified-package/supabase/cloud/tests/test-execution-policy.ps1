# Offline only: calls the pure policy resolver, never psql or deploy.ps1.
[CmdletBinding()]
param([string]$AdapterPath, [string]$OutFile, [string]$FixtureRoot)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
if (-not $AdapterPath) { $AdapterPath = Join-Path $PSScriptRoot '..\tools\lib\clash-native.ps1' }
. $AdapterPath
if (-not $FixtureRoot) { $FixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('clash-policy-' + [guid]::NewGuid().ToString('N')) }
$scratch = $FixtureRoot
[void][IO.Directory]::CreateDirectory($scratch)
$ca = Join-Path $scratch 'synthetic-ca.txt'
if (-not (Test-Path -LiteralPath $ca)) { [IO.File]::WriteAllText($ca, 'offline synthetic CA placeholder; never use for a connection') }
# Override only this child process; no real credentials are read or changed.
$env:PGPASSWORD = 'offline-synthetic-test-value'
$env:PGPASSFILE = ''
$env:PGHOSTADDR = ''
$env:PGSERVICE = ''
$env:PGOPTIONS = ''
$env:PGSSLROOTCERT = ''
$env:PGSSLMODE = 'disable'
$ref = 'kgaqejgubjemdecifzew'
$direct = 'db.' + $ref + '.supabase.co'
$pooler = 'aws-0-ap-south-1.pooler.supabase.com'
$poolerMulti = 'aws-0-ap-southeast-1.pooler.supabase.com'
$cases = New-Object System.Collections.Generic.List[object]
function Check([string]$Name, [scriptblock]$Body) {
  $ok = $false
  try { $ok = [bool](& $Body) } catch { $ok = $false }
  $cases.Add([ordered]@{ name = $Name; pass = $ok })
}
function Refuses([hashtable]$Changes, [string]$Pattern) {
  $argsMap = @{ ProjectRef = $ref; PgHost = $pooler; PgPort = 5432;
               PgUser = ('postgres.' + $ref); CaCert = $ca; ConfirmedPoolerHost = $pooler }
  foreach ($key in $Changes.Keys) { $argsMap[$key] = $Changes[$key] }
  try { $null = Resolve-ExecutionPolicy @argsMap; return $false }
  catch { return $_.Exception.Message -match $Pattern }
}
Check 'direct5432VerifyFull' {
  $p = Resolve-ExecutionPolicy -ProjectRef $ref -PgHost $direct -CaCert $ca
  $p.mode -eq 'direct' -and $p.port -eq 5432 -and $p.env.PGSSLMODE -eq 'verify-full' -and $p.sslModeOverrode -eq 'disable'
}
Check 'session5432VerifyFull' {
  $p = Resolve-ExecutionPolicy -ProjectRef $ref -PgHost $pooler -PgPort 5432 -PgUser ('postgres.' + $ref) -CaCert $ca -ConfirmedPoolerHost $pooler
  $p.mode -eq 'pooler' -and $p.port -eq 5432 -and $p.env.PGSSLMODE -eq 'verify-full' -and $p.caCertSha256 -eq (Get-NormalizedSha256 -Path $ca)
}
Check 'sessionDefaultPort5432' {
  $p = Resolve-ExecutionPolicy -ProjectRef $ref -PgHost $pooler -PgUser ('postgres.' + $ref) -CaCert $ca -ConfirmedPoolerHost $pooler
  $p.port -eq 5432
}
Check 'session6543Refused' { Refuses @{ PgPort = 6543 } 'requires port 5432' }
Check 'direct6543Refused' { Refuses @{ PgHost = $direct; PgPort = 6543; PgUser = 'postgres' } 'requires port 5432' }
Check 'arbitraryPortRefused' { Refuses @{ PgPort = 1234 } 'requires port 5432' }
Check 'wrongPoolerUserRefused' { Refuses @{ PgUser = 'postgres' } 'Pooler user must' }
Check 'differentProjectUserRefused' { Refuses @{ PgUser = 'postgres.eagbgwasiocfppwobpsd' } 'Pooler user must' }
Check 'differentDirectHostRefused' { Refuses @{ PgHost = 'db.eagbgwasiocfppwobpsd.supabase.co' } 'not permitted' }
Check 'suffixHostRefused' { Refuses @{ PgHost = ($pooler + '.invalid') } 'not permitted' }
Check 'arbitraryPoolerRefused' { Refuses @{ PgHost = 'evil.pooler.supabase.com' } 'not permitted' }
Check 'invalidRefRefused' { Refuses @{ ProjectRef = 'invalid' } '20-character' }
Check 'differentDatabaseRefused' { Refuses @{ PgDatabase = 'template1' } 'Database must' }
Check 'missingCaRefused' { Refuses @{ CaCert = '' } 'CA certificate is required' }
Check 'nonexistentCaRefused' { Refuses @{ CaCert = (Join-Path $scratch 'absent.txt') } 'certificate not found' }
Check 'multiSegmentRegionAccepted' {
  $p = Resolve-ExecutionPolicy -ProjectRef $ref -PgHost $poolerMulti -PgPort 5432 -PgUser ('postgres.' + $ref) -CaCert $ca -ConfirmedPoolerHost $poolerMulti
  $p.mode -eq 'pooler' -and $p.port -eq 5432 -and $p.env.PGSSLMODE -eq 'verify-full'
}
Check 'unconfirmedPoolerHostRefused' {
  try { $null = Resolve-ExecutionPolicy -ProjectRef $ref -PgHost $pooler -PgPort 5432 -PgUser ('postgres.' + $ref) -CaCert $ca; $false }
  catch { $_.Exception.Message -match 'ConfirmedPoolerHost must exactly match' }
}
Check 'mismatchedPoolerConfirmationRefused' { Refuses @{ ConfirmedPoolerHost = $poolerMulti } 'ConfirmedPoolerHost must exactly match' }
Check 'twoSegmentRegionRefused' { Refuses @{ PgHost = 'aws-0-ap-south.pooler.supabase.com' } 'not permitted' }
Check 'lookalikePoolerZoneRefused' { Refuses @{ PgHost = ($pooler + '.evil.com') } 'not permitted' }
Check 'uppercasePoolerHostRefused' { Refuses @{ PgHost = $pooler.ToUpperInvariant() } 'not permitted' }
Check 'trailingNewlinePoolerRefused' { Refuses @{ PgHost = ($pooler + "`n") } 'not permitted' }
foreach ($variable in @('PGHOSTADDR','PGSERVICE','PGOPTIONS')) {
  [Environment]::SetEnvironmentVariable($variable, 'synthetic-redirect')
  $blocked = Refuses @{} ($variable + ' is set')
  $cases.Add([ordered]@{ name = ($variable + 'Refused'); pass = $blocked })
  [Environment]::SetEnvironmentVariable($variable, '')
}

# Additional Phase 3H regressions. Every refusal asserts its intended gate.
foreach ($region in @('us-east-1','eu-central-1','us-gov-east-1','eusc-de-east-1','ap-southeast-7')) {
  $regionHost = 'aws-12-' + $region + '.pooler.supabase.com'
  Check ('validRegion:' + $region) {
    $p = Resolve-ExecutionPolicy -ProjectRef $ref -PgHost $regionHost -PgUser ('postgres.' + $ref) -CaCert $ca -ConfirmedPoolerHost $regionHost
    $p.port -eq 5432 -and $p.env.PGSSLMODE -ceq 'verify-full'
  }
}
$badHosts = @('aws-x-ap-south-1.pooler.supabase.com', 'aws-0-south-1.pooler.supabase.com',
  'aws-0-ap--south-1.pooler.supabase.com', 'aws-0-ap-south-.pooler.supabase.com',
  'aws-0-ap-south-1.pooler.supabase.com.', 'aws-0-ap-south-1.pooler.supabase.co',
  'aws-0-ap-south-1.pooler.supabase.com:5432', 'https://aws-0-ap-south-1.pooler.supabase.com',
  'aws-0-ap-south-1.pooler.supabase.com/evil', 'aws-0-ap-south-1.pooler.supabase.com@evil.com',
  'prefix.aws-0-ap-south-1.pooler.supabase.com', 'aws-0-ap_south-1.pooler.supabase.com',
  (' ' + $pooler), ($pooler + ' '), ($pooler + "`t"), ($pooler + "`r`n"),
  ($pooler + "`nPGHOST=evil"), ($pooler + [char]0), ($pooler + [char]0x2028),
  ($pooler.Replace('.', [string][char]0xFF0E)), ($pooler.Replace('a', [string][char]0x0430)),
  ('aws-0-' + ('ap-' * 30) + 'south-1.pooler.supabase.com'))
$i = 0
foreach ($bad in $badHosts) { $i++; Check ('malformedHost:' + $i) { Refuses @{ PgHost = $bad; ConfirmedPoolerHost = $bad } 'not permitted' } }
Check 'uppercaseProjectUser' { Refuses @{ PgUser = ('POSTGRES.' + $ref) } 'Pooler user must' }
Check 'userNewline' { Refuses @{ PgUser = ('postgres.' + $ref + "`n") } 'Pooler user must' }
Check 'uppercaseProjectRef' { Refuses @{ ProjectRef = $ref.ToUpperInvariant() } '20-character' }
Check 'projectRefNewline' { Refuses @{ ProjectRef = ($ref + "`n") } '20-character' }
Check 'confirmationWhitespace' { Refuses @{ ConfirmedPoolerHost = ($pooler + ' ') } 'ConfirmedPoolerHost must exactly match' }
Check 'confirmationCase' { Refuses @{ ConfirmedPoolerHost = $pooler.ToUpperInvariant() } 'ConfirmedPoolerHost must exactly match' }
Check 'caDirectoryRefused' { Refuses @{ CaCert = $scratch } 'certificate not found' }
foreach ($ssl in @('disable','allow','prefer','require')) {
  $env:PGSSLMODE = $ssl
  Check ('tlsForced:' + $ssl) {
    $p = Resolve-ExecutionPolicy -ProjectRef $ref -PgHost $pooler -PgUser ('postgres.' + $ref) -CaCert $ca -ConfirmedPoolerHost $pooler
    $p.sslMode -ceq 'verify-full' -and $p.env.PGSSLMODE -ceq 'verify-full' -and $p.sslModeOverrode -ceq $ssl
  }
}
Check 'caRawAndLegacyIdentities' {
  $deployText = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\tools\deploy.ps1'))
  $ledgerText = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\tools\check-ledger.ps1'))
  $bomCa = Join-Path $scratch 'synthetic-bom-crlf-ca.txt'
  $plainCa = Join-Path $scratch 'synthetic-lf-ca.txt'
  [IO.File]::WriteAllBytes($bomCa, [byte[]](239,187,191,65,13,10,66,13,10))
  [IO.File]::WriteAllBytes($plainCa, [byte[]](65,10,66,10))
  $one = Resolve-ExecutionPolicy -ProjectRef $ref -PgHost $pooler -PgUser ('postgres.' + $ref) -CaCert $bomCa -ConfirmedPoolerHost $pooler
  $two = Resolve-ExecutionPolicy -ProjectRef $ref -PgHost $pooler -PgUser ('postgres.' + $ref) -CaCert $plainCa -ConfirmedPoolerHost $pooler
  $one.caCertSha256 -ceq $two.caCertSha256 -and $one.caCertSha256 -ceq (Get-NormalizedSha256 -Path $bomCa) -and
    $one.caCertRawSha256 -ceq 'd98a528c95a12ef80a4af869e6c60344428c52eafac4a7ad01de93a63268ca79' -and
    $two.caCertRawSha256 -ceq 'daee1cd25194ae952d046ad9b9c81d3c07dc5332440b58d6d7461b248be56712' -and
    $one.env.PGSSLROOTCERT -ceq (Resolve-Path -LiteralPath $bomCa).Path -and
    $deployText -match 'caCertRawSha256\s*=\s*\$policy.caCertRawSha256' -and
    $ledgerText -match 'caCertRawSha256\s*=\s*\$policy.caCertRawSha256'
}
# Execute only the actual confirmation IF AST with a refusing stub, never the entrypoint.
Check 'deploymentConfirmationRequired' {
  $tokens = $null; $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '..\tools\deploy.ps1'), [ref]$tokens, [ref]$errors)
  $gate = $ast.Find({ param($n) $n -is [Management.Automation.Language.IfStatementAst] -and $n.Extent.Text.StartsWith('if (-not $ConfirmDeployment)') }, $true)
  if (-not $gate -or @($errors).Count -ne 0) { return $false }
  function Stop-Refused([string]$Reason) { throw $Reason }
  $ConfirmDeployment = $false
  try { & ([scriptblock]::Create($gate.Extent.Text)); return $false }
  catch { return $_.Exception.Message -match 'pass -ConfirmDeployment' }
}

$env:PGPASSWORD = ''
Check 'missingCredentialRefused' { Refuses @{} 'No credential available' }
if ($cases.Count -ne 66) { throw ('Expected 66 policy cases; observed ' + $cases.Count) }
$failures = @($cases | Where-Object { -not $_.pass }).Count
$result = [ordered]@{ utc = [DateTime]::UtcNow.ToString('o'); offline = $true;
  adapterSha256 = Get-NormalizedSha256 -Path $AdapterPath; passed = ($cases.Count - $failures);
  failed = $failures; total = $cases.Count; cases = $cases.ToArray() }
if ($OutFile) {
  $stream = [IO.File]::Open($OutFile, [IO.FileMode]::CreateNew)
  try { $bytes = [Text.Encoding]::UTF8.GetBytes(($result | ConvertTo-Json -Depth 5)); $stream.Write($bytes, 0, $bytes.Length) }
  finally { $stream.Dispose() }
}
$result | ConvertTo-Json -Depth 5
if ($failures -gt 0) { exit 1 }
exit 0
