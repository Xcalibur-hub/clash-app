# PROPOSED FUTURE WORKFLOW. Step 5K does NOT authorize running this script.
param(
 [Parameter(Mandatory=$true)][ValidateSet('create','bootstrap','runtime','cleanup')][string]$Stage,
 [Parameter(Mandatory=$true)][string]$Directory,
 [switch]$AuthorizedNewDisposableAttempt
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if (-not $AuthorizedNewDisposableAttempt) { throw 'Separate user authorization for a new disposable attempt is required.' }
$taskRoot=(Resolve-Path -LiteralPath $Directory).Path
$meta=Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'prepared.json') | ConvertFrom-Json
$project=$meta.project
if ($project -notmatch '^clash_p11bind_[a-z0-9_]+$' -or (Split-Path -Leaf $taskRoot) -ne $project) { throw 'Unsafe project identity' }
# Reject inherited credentials/link inputs; never modify existing environment files.
$forbidden=Get-ChildItem Env: | Where-Object { $_.Name -match '^(SUPABASE_|PG|DATABASE_URL$|EXPO_PUBLIC_SUPABASE_|DOCKER_HOST$|DOCKER_TLS_VERIFY$|DOCKER_CERT_PATH$)' }
if ($forbidden) { throw 'Use a clean shell without inherited backend credentials or project links.' }
function D([string[]]$Arguments) {
 # Capture native stderr before it can escape the sanitizer (including Windows PowerShell).
 $priorErrorAction=$ErrorActionPreference
 try {
  $ErrorActionPreference='Continue'
  $result=& docker @Arguments 2>&1
  $code=$LASTEXITCODE
 } catch { throw 'Docker client could not start' }
 finally { $ErrorActionPreference=$priorErrorAction }
 $safe=($result -join "`n")
 $private=Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'compose.json') | ConvertFrom-Json
 foreach ($service in $private.services.PSObject.Properties) {
  foreach ($e in $service.Value.environment.PSObject.Properties) {
   try { $uri=[Uri]([string]$e.Value); if ($uri.UserInfo -match '^[^:]*:(.+)$') { $safe=$safe.Replace($Matches[1],'[REDACTED]').Replace([Uri]::UnescapeDataString($Matches[1]),'[REDACTED]') } } catch {}
   if ($e.Name -match 'SECRET|KEY|PASSWORD' -and [string]$e.Value) { $safe=$safe.Replace([string]$e.Value,'[REDACTED]') }
  }
 }
 Add-Content -LiteralPath (Join-Path $taskRoot 'commands.sanitized.log') -Value ($Arguments[0]+' exit='+$code+"`n"+$safe)
 if ($code -ne 0) { throw ('Docker command failed; stop affected sequence: '+$Arguments[0]) }
 return ($result -join "`n")
}
$composeArgs=@('compose','-p',$project,'-f',(Join-Path $taskRoot 'compose.json'))
function C([string[]]$Arguments) { return D ($composeArgs+$Arguments) }
function Inventory {
 return @{
  containers=@((D @('ps','-a','--format','{{.ID}} {{.Names}} {{.Image}} {{.State}}')).Split("`n") | Where-Object {$_} | Sort-Object)
  volumes=@((D @('volume','ls','--format','{{.Name}} {{.Driver}}')).Split("`n") | Where-Object {$_} | Sort-Object)
  networks=@((D @('network','ls','--no-trunc','--format','{{.ID}} {{.Name}} {{.Driver}}')).Split("`n") | Where-Object {$_} | Sort-Object)
 }
}
function Ids { return @((C @('ps','-a','-q')).Split("`n") | Where-Object {$_}) }
function CheckBindings([bool]$Running) {
 $ids=Ids
 if ($ids.Count -ne 9) { throw 'Expected exactly nine created services, including three initialization jobs' }
 # inspect only newly isolated project containers, never existing stack credentials.
 $inspection=D (@('inspect')+$ids)
 $parsed=$inspection | ConvertFrom-Json
 $actual=@($parsed | ForEach-Object {$_.Config.Labels.'com.docker.compose.service'} | Sort-Object)
 $wanted=@('db','kong','auth','rest','realtime','storage','realtime-init','storage-init','auth-init' | Sort-Object)
 if (($actual -join ',') -ne ($wanted -join ',')) { throw 'Unexpected project container set' }
 $file=Join-Path $taskRoot 'bindings-created.private.json'
 [IO.File]::WriteAllText($file,$inspection)
 & node (Join-Path $PSScriptRoot '../../scripts/loopback-binding-check.cjs') created $file $project
 if ($LASTEXITCODE -ne 0) { throw 'Created bindings denied; no container may start' }
 if ($Running) {
  $runtime=@($parsed | Where-Object {$_.Config.Labels.'com.docker.compose.service' -notmatch '-init$'})
  $file=Join-Path $taskRoot 'bindings-running.private.json'
  [IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject $runtime -Depth 100))
  & node (Join-Path $PSScriptRoot '../../scripts/loopback-binding-check.cjs') running $file $project
  if ($LASTEXITCODE -ne 0) { throw 'Running bindings denied' }
 }
}
function WaitService([string]$Service,[bool]$Job) {
 $id=(C @('ps','-a','-q',$Service)).Trim()
 if (-not $id) {throw 'Missing service'}
 for ($i=0;$i -lt 300;$i++) {
  $state=(D @('inspect','--format','{{json .State}}',$id)) | ConvertFrom-Json
  if ($Job) {
   if ($state.Status -eq 'exited') { if ($state.ExitCode -ne 0) {throw ('Initialization failed: '+$Service)}; return }
  } elseif ($state.Status -ne 'running') {throw ('Service stopped: '+$Service)
  } elseif ($state.Health.Status -eq 'healthy') {return}
  Start-Sleep -Seconds 2
 }
 throw ('Bounded readiness timeout: '+$Service)
}
if ($Stage -eq 'create') {
 if (Test-Path -LiteralPath (Join-Path $taskRoot 'creation-attempt.json')) {throw 'Attempt already consumed; no automatic retry'}
 $endpoint=(D @('context','inspect','--format','{{.Endpoints.docker.Host}}')).Trim()
 if ($endpoint -notmatch '^(npipe:|unix:)') {throw 'Remote Docker daemon not allowed'}
 $baseline=Inventory
 if (($baseline | ConvertTo-Json -Depth 5) -match [regex]::Escape($project)) {throw 'Project resources already exist'}
 $listeners=@(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in @(57721,57722)})
 if ($listeners.Count -ne 0) {throw 'Dedicated ports unavailable'}
 # Verify source/artifact bytes and configuration without any DB connection.
 & node -e "require(process.argv[1]).verifyPrepared(process.argv[2]);" (Join-Path $PSScriptRoot 'execute.cjs') $taskRoot
 if ($LASTEXITCODE -ne 0) {throw 'Offline preparation invalid'}
 $rendered=C @('config','--format','json')
 $renderPath=Join-Path $taskRoot 'compose-rendered.private.json';[IO.File]::WriteAllText($renderPath,$rendered)
 & node (Join-Path $PSScriptRoot '../../scripts/loopback-binding-check.cjs') compose $renderPath $project
 if ($LASTEXITCODE -ne 0) {throw 'Compose binding policy failed'}
 $baseline | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskRoot 'resource-baseline.json')
 @{engine=(D @('version','--format','{{.Server.Version}}'));compose=(D @('compose','version','--short'));endpoint=$endpoint} |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'versions.json')
 '{}' | Set-Content -LiteralPath (Join-Path $taskRoot 'creation-attempt.json')
 # CREATE ONLY: permits HostConfig inspection before any service process runs.
 C @('create','--no-build') | Out-Null
 CheckBindings $false
 '{}' | Set-Content -LiteralPath (Join-Path $taskRoot 'creation-verified.json')
} elseif ($Stage -eq 'bootstrap') {
 if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'creation-verified.json'))) {throw 'Creation bindings not verified'}
 if (Test-Path -LiteralPath (Join-Path $taskRoot 'bootstrap-attempt.json')) {throw 'Bootstrap attempt already consumed'}
 CheckBindings $false
 '{}' | Set-Content -LiteralPath (Join-Path $taskRoot 'bootstrap-attempt.json')
 C @('start','db') | Out-Null; WaitService 'db' $false
 $dbId=(C @('ps','-a','-q','db')).Trim()
 $bindings=(D @('inspect','--format','{{json .NetworkSettings.Ports}}',$dbId)) | ConvertFrom-Json
 $dbPort=@($bindings.'5432/tcp')
 if ($dbPort.Count -ne 1 -or $dbPort[0].HostIp -ne '127.0.0.1' -or $dbPort[0].HostPort -ne '57722') {throw 'Actual DB publication unsafe; stop disposable project'}
 $listeners=@(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -eq 57722})
 if ($listeners.Count -eq 0 -or @($listeners | Where-Object {$_.LocalAddress -ne '127.0.0.1'}).Count -ne 0) {throw 'Windows DB listener is not explicitly loopback-only'}

 foreach ($job in @('realtime-init','storage-init','auth-init')) { C @('start',$job) | Out-Null; WaitService $job $true }
 # Only the newly isolated database. Exact CLI managed bootstrap precedes extensions.
 & node (Join-Path $PSScriptRoot 'client-auth.cjs') bootstrap $taskRoot --authorized-new-disposable-attempt
 if ($LASTEXITCODE -ne 0) { throw 'Bootstrap client failed; stop affected sequence' }
 '{}' | Set-Content -LiteralPath (Join-Path $taskRoot 'bootstrap-complete.json')
} elseif ($Stage -eq 'runtime') {
 if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'evidence/migration-success.json'))) {throw 'All106 migrations must pass before runtime startup'}
 CheckBindings $false
 C @('start','auth','rest','realtime','storage','kong') | Out-Null
 foreach ($service in @('db','auth','realtime','storage','kong')) {WaitService $service $false}
 CheckBindings $true
 $listeners=@(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in @(57721,57722)})
 foreach ($port in @(57721,57722)) {
  if (@($listeners | Where-Object {$_.LocalPort -eq $port}).Count -eq 0) {throw 'Expected Windows listener missing'}
 }
 if (@($listeners | Where-Object {$_.LocalAddress -ne '127.0.0.1'}).Count -gt 0) {throw 'Unexpected non-loopback Windows listener'}
} elseif ($Stage -eq 'cleanup') {
 if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'resource-baseline.json'))) {throw 'No recorded resource baseline; cleanup requires manual review'}
 $baseline=Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'resource-baseline.json') | ConvertFrom-Json
 $config=Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'compose.json') | ConvertFrom-Json
 # Refuse externally redirected resource definitions and unrecognized project containers.
 if ($config.networks.isolated.name -ne ($project+'_network')) {throw 'Network changed'}
 foreach ($v in @('db-data','db-config','storage-data')) {
  if ($config.volumes.$v.name -ne ($project+'_'+$v) -or $config.volumes.$v.PSObject.Properties.Name -contains 'external') {throw 'Volume changed'}
 }
 $ids=Ids
 if ($ids.Count -gt 0) { CheckBindings $false }
 C @('down','--volumes','--timeout','30') | Out-Null
 $after=Inventory
 foreach ($kind in @('containers','volumes','networks')) {
  if (($baseline.$kind -join "`n") -ne ($after[$kind] -join "`n")) {throw ('Resource inventory changed: '+$kind+'; retain evidence for review')}
 }
 @{status='DISPOSABLE_RESOURCES_REMOVED';baseline_inventory_preserved=$true} | ConvertTo-Json |
  Set-Content -LiteralPath (Join-Path $taskRoot 'cleanup-evidence.json')
}
