const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {clientEnvironment}=require('./client-environment.cjs');
const {runner}=require('./client-auth.cjs');
const policy=require('./client-environment.json');
const windows=()=>({Path:'C:\\Tools;C:\\Windows\\System32',SystemRoot:'C:\\Windows',USERPROFILE:'C:\\Users\\fixture',ProgramFiles:'C:\\Program Files',ProgramData:'C:\\ProgramData',PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules',TEMP:'C:\\Temp'});
const config={services:{db:{environment:{POSTGRES_PASSWORD:'fixture-only-password'}}}};
const overrides={SUPABASE_ACCESS_TOKEN:'sentinel',PGPASSWORD:'sentinel',PGHOST:'sentinel',DATABASE_URL:'sentinel',DATABASE_PASSWORD:'sentinel',JWT_SECRET:'sentinel',GOTRUE_DB_DATABASE_URL:'sentinel',S3_SECRET_KEY:'sentinel',AWS_SECRET_ACCESS_KEY:'sentinel',DOCKER_HOST:'sentinel',DOCKER_CONFIG:'sentinel',DOCKER_TLS_VERIFY:'sentinel',NODE_OPTIONS:'sentinel',EXPO_PUBLIC_SUPABASE_URL:'sentinel',UNKNOWN:'sentinel'};
test('Windows policy retains Docker system plugin roots with case-insensitive names',()=>{
 const original={...windows(),...overrides},env=clientEnvironment(original,'win32');
 assert.equal(env.PROGRAMFILES,'C:\\Program Files');assert.equal(env.PROGRAMDATA,'C:\\ProgramData');assert.equal(env.PSMODULEPATH,windows().PSModulePath);
 for(const key of Object.keys(overrides))assert.equal(env[key],undefined,key);
 assert.deepEqual(original,{...windows(),...overrides});assert.ok(Object.keys(env).every(k=>policy.allowed.includes(k)));
});
test('mock Compose discovery succeeds for Node Docker and migration clients without inherited credentials',()=>{
 let calls=0;
 const run=runner(config,'fixture',(command,args,options)=>{
  calls++;assert.equal(path.win32.join(options.env.PROGRAMFILES,'Docker','cli-plugins','docker-compose.exe'),'C:\\Program Files\\Docker\\cli-plugins\\docker-compose.exe');
  assert.equal(path.win32.join(options.env.PROGRAMDATA,'Docker','cli-plugins'),'C:\\ProgramData\\Docker\\cli-plugins');
  for(const key of Object.keys(overrides))if(key!=='PGPASSWORD')assert.equal(options.env[key],undefined);
  assert.equal(options.env.PGPASSWORD,command==='supabase'?'fixture-only-password':undefined);
  return {status:0,stdout:'MOCK_COMPOSE_FOUND'};
 },{...windows(),...overrides});
 assert.equal(run('docker',['compose','version']).status,0);assert.equal(run('supabase',['migration','up'],true).status,0);assert.equal(calls,2);
});
test('each missing/invalid Windows prerequisite fails explicitly before subprocess execution',()=>{
 for(const key of policy.windows_required) for(const value of [undefined,'',' ','x\ny']) {
  const inherited=clientEnvironment(windows(),'win32');inherited[key]=value;let calls=0;
  assert.throws(()=>clientEnvironment(inherited,'win32'),new RegExp('Windows client prerequisite: '+key));
  if(process.platform==='win32')assert.throws(()=>runner(config,'fixture',()=>{calls++;},inherited),new RegExp('Windows client prerequisite: '+key));
  assert.equal(calls,0);
 }
});
test('non-Windows filtering does not impose Windows paths or forward unknown variables',()=>{
 assert.deepEqual(clientEnvironment({PATH:'/usr/bin',PGPASSWORD:'sentinel',UNREVIEWED:'sentinel'},'linux'),{PATH:'/usr/bin'});
});
test('PowerShell mocked lifecycle Docker and Node calls share filtering, discovery, failure gates and restoration',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'clash-winenv-'));const script=path.join(root,'test.ps1');
 try {
  fs.writeFileSync(script,`$ErrorActionPreference='Stop'
. $args[0]
$env:SUPABASE_ACCESS_TOKEN='fixture-secret'
$env:PGPASSWORD='fixture-secret'
$env:DATABASE_PASSWORD='fixture-secret'
$env:JWT_SECRET='fixture-secret'
$env:GOTRUE_DB_DATABASE_URL='fixture-secret'
$env:S3_SECRET_KEY='fixture-secret'
$env:AWS_SECRET_ACCESS_KEY='fixture-secret'
$env:DOCKER_CONFIG='fixture-secret'
$env:NODE_OPTIONS='fixture-secret'
$global:mockCalls=0
function Check-MockEnvironment {
 $global:mockCalls++
 if (-not $env:ProgramFiles -or -not $env:ProgramData) { throw 'Plugin roots missing' }
 $plugin=Join-Path $env:ProgramFiles 'Docker/cli-plugins/docker-compose.exe'
 if (-not $plugin.Replace([char]92,[char]47).EndsWith('Docker/cli-plugins/docker-compose.exe')) {throw 'Plugin path changed'}
 foreach($key in @('SUPABASE_ACCESS_TOKEN','PGPASSWORD','DATABASE_PASSWORD','JWT_SECRET','GOTRUE_DB_DATABASE_URL','S3_SECRET_KEY','AWS_SECRET_ACCESS_KEY','DOCKER_CONFIG','NODE_OPTIONS')) {
  if ([Environment]::GetEnvironmentVariable($key,'Process')) {throw 'Credential override reached child'}
 }
 $global:LASTEXITCODE=0
 Write-Output 'MOCK_CLIENT_PASS'
}
function docker { Check-MockEnvironment }
function node { Check-MockEnvironment }
Invoke-IsolatedClient 'docker' @('compose','version')
Invoke-IsolatedClient 'node' @('fixture.cjs')
if ($global:mockCalls -ne 2 -or $env:PGPASSWORD -ne 'fixture-secret') {throw 'Environment was not restored'}
$original=$env:ProgramFiles
try {
 $env:ProgramFiles=$null
 try {Invoke-IsolatedClient 'docker' @('compose','version');throw 'Expected prerequisite rejection'} catch {if ($_.Exception.Message -notmatch 'Windows client prerequisite: PROGRAMFILES') {throw 'Wrong prerequisite failure'}}
 if ($global:mockCalls -ne 2) {throw 'Client executed with missing prerequisites'}
} finally {$env:ProgramFiles=$original}
function docker {throw 'mock client exception'}
try {Invoke-IsolatedClient 'docker' @('compose','version')} catch {if ($_.Exception.Message -ne 'mock client exception') {throw}}
if ($env:PGPASSWORD -ne 'fixture-secret' -or $env:ProgramFiles -ne $original) {throw 'Environment not restored on exception'}
Write-Output 'POWERSHELL_ENV_PASS'
`);
  for(const engine of ['powershell.exe',...(process.env.CLASH_TEST_PWSH?[process.env.CLASH_TEST_PWSH]:[])]) {
  const result=spawnSync(engine,['-NoProfile','-NonInteractive','-File',script,path.join(__dirname,'client-environment.ps1')],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/POWERSHELL_ENV_PASS/);assert.equal((result.stdout.match(/MOCK_CLIENT_PASS/g)||[]).length,2);
  assert.ok(!(result.stdout+result.stderr).includes('fixture-secret'));
  }
 } finally {fs.unlinkSync(script);fs.rmdirSync(root);}
});
