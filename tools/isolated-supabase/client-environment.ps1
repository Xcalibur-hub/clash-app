# Functions only; importing never launches a client or changes the environment.
function Get-IsolatedClientEnvironment {
 $policy=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'client-environment.json') | ConvertFrom-Json
 $clean=@{}
 foreach ($entry in [Environment]::GetEnvironmentVariables('Process').GetEnumerator()) {
  $key=([string]$entry.Key).ToUpperInvariant()
  if ($policy.allowed -contains $key) { $clean[$key]=[string]$entry.Value }
 }
 foreach ($key in $policy.windows_required) {
  $value=$clean[$key]
  if ([string]::IsNullOrWhiteSpace($value) -or $value -match "[\r\n\x00]" -or ($key -ne 'PATH' -and -not [IO.Path]::IsPathRooted($value))) {
   throw ('Missing or invalid Windows client prerequisite: '+$key)
  }
 }
 return $clean
}
function Invoke-IsolatedClient([string]$Command,[string[]]$Arguments) {
 $clean=Get-IsolatedClientEnvironment # Fail before client execution; values never enter argv/logs.
 $previous=[Environment]::GetEnvironmentVariables('Process')
 try {
  foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable([string]$key,$null,'Process') }
  foreach ($key in $clean.Keys) { [Environment]::SetEnvironmentVariable($key,$clean[$key],'Process') }
  $global:LASTEXITCODE=0
  & $Command @Arguments
 } finally {
  foreach ($key in [Environment]::GetEnvironmentVariables('Process').Keys) { [Environment]::SetEnvironmentVariable([string]$key,$null,'Process') }
  foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable([string]$key,[string]$previous[$key],'Process') }
 }
}
