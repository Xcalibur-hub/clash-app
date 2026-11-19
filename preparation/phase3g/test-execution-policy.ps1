# Offline only: calls the pure policy resolver, never psql or deploy.ps1.
[CmdletBinding()]
param([string]$AdapterPath, [string]$OutFile)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
if (-not $AdapterPath) { $AdapterPath = Join-Path $PSScriptRoot '..\phase3f\package\supabase\cloud\tools\lib\clash-native.ps1' }
. $AdapterPath
$scratch = Join-Path $PSScriptRoot 'policy-fixtures'
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
$cases = New-Object System.Collections.Generic.List[object]
function Check([string]$Name, [scriptblock]$Body) {
  $ok = $false
  try { $ok = [bool](& $Body) } catch { $ok = $false }
  $cases.Add([ordered]@{ name = $Name; pass = $ok })
}
function Refuses([hashtable]$Changes, [string]$Pattern) {
  $argsMap = @{ ProjectRef = $ref; PgHost = $pooler; PgPort = 5432; PgUser = ('postgres.' + $ref); CaCert = $ca }
  foreach ($key in $Changes.Keys) { $argsMap[$key] = $Changes[$key] }
  try { $null = Resolve-ExecutionPolicy @argsMap; return $false }
  catch { return $_.Exception.Message -match $Pattern }
}
Check 'direct5432VerifyFull' {
  $p = Resolve-ExecutionPolicy -ProjectRef $ref -PgHost $direct -CaCert $ca
  $p.mode -eq 'direct' -and $p.port -eq 5432 -and $p.env.PGSSLMODE -eq 'verify-full' -and $p.sslModeOverrode -eq 'disable'
}
Check 'session5432VerifyFull' {
  $p = Resolve-ExecutionPolicy -ProjectRef $ref -PgHost $pooler -PgPort 5432 -PgUser ('postgres.' + $ref) -CaCert $ca
  $p.mode -eq 'pooler' -and $p.port -eq 5432 -and $p.env.PGSSLMODE -eq 'verify-full' -and $p.caCertSha256 -eq (Get-NormalizedSha256 -Path $ca)
}
Check 'sessionDefaultPort5432' {
  $p = Resolve-ExecutionPolicy -ProjectRef $ref -PgHost $pooler -PgUser ('postgres.' + $ref) -CaCert $ca
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
foreach ($variable in @('PGHOSTADDR','PGSERVICE','PGOPTIONS')) {
  [Environment]::SetEnvironmentVariable($variable, 'synthetic-redirect')
  $blocked = Refuses @{} ($variable + ' is set')
  $cases.Add([ordered]@{ name = ($variable + 'Refused'); pass = $blocked })
  [Environment]::SetEnvironmentVariable($variable, '')
}
$env:PGPASSWORD = ''
Check 'missingCredentialRefused' { Refuses @{} 'No credential available' }
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
