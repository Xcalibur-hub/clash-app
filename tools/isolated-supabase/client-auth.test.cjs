const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {password,redactor,runner,psqlArgs,migrationArgs,loadConfig}=require('./client-auth.cjs');
const platformEnv={PATH:'path',SYSTEMROOT:'C:\\Windows',USERPROFILE:'C:\\Users\\fixture',PROGRAMFILES:'C:\\Program Files',PROGRAMDATA:'C:\\ProgramData'};
const fixture=()=>({services:{db:{environment:{POSTGRES_PASSWORD:'test-password-unique'}},auth:{environment:{GOTRUE_DB_DATABASE_URL:'postgresql://user:url-secret@db/db',JWT_SECRET:'jwt-secret-unique'}}}});
test('password is read from disposable configuration, not inherited credentials',()=>{
 const config=fixture();let captured;
 runner(config,'fixture',(command,args,options)=>{captured={command,args,options};return {status:0,stdout:'ok'};},{...platformEnv,PGPASSWORD:'inherited',DATABASE_URL:'other',SUPABASE_DB_PASSWORD:'other',SUPABASE_ACCESS_TOKEN:'other'})('docker',psqlArgs('supabase_admin'),true);
 assert.equal(captured.options.env.PGPASSWORD,password(config));assert.equal(captured.options.env.PATH,'path');
 for(const key of ['DATABASE_URL','SUPABASE_DB_PASSWORD','SUPABASE_ACCESS_TOKEN'])assert.equal(captured.options.env[key],undefined);
 assert.ok(!JSON.stringify(captured.args).includes(password(config)));assert.equal(captured.options.shell,false);
});
test('missing, blank, non-string or line-breaking passwords reject before subprocess',()=>{
 for(const value of [undefined,'',' ',123,'abc\nxyz','abc\0xyz']) {const c=fixture();c.services.db.environment.POSTGRES_PASSWORD=value;let calls=0;
  assert.throws(()=>runner(c,'fixture',()=>{calls++;}));assert.equal(calls,0);}
});
test('credentials are forwarded only to authenticated child processes without parent mutation',()=>{
 const inherited={...platformEnv};const captured=[];
 const run=runner(fixture(),'fixture',(command,args,options)=>{captured.push(options.env);return {status:0};},inherited);
 run('docker',['inspect']);run('docker',psqlArgs('postgres'),true);run('docker',['inspect']);
 assert.equal(captured[0].PGPASSWORD,undefined);assert.equal(captured[1].PGPASSWORD,password(fixture()));assert.equal(captured[2].PGPASSWORD,undefined);assert.deepEqual(inherited,platformEnv);
});
test('all psql roles use noninteractive auth, name-only forwarding and error stop',()=>{
 for(const role of ['postgres','supabase_admin']) for(const transcript of [false,true]) {
  const args=psqlArgs(role,['-f','/tests/fixture.sql'],transcript);
  assert.ok(args.includes('-w'));assert.ok(args.includes('ON_ERROR_STOP=1'));assert.ok(args.includes('PGPASSWORD'));assert.ok(!args.some(a=>a.startsWith('PGPASSWORD=')));
  assert.equal(args[args.indexOf('-U')+1],role);assert.equal(args[args.indexOf('-d')+1],'postgres');assert.ok(!args.includes('-h'));
  assert.equal(args.includes('PGOPTIONS=-c search_path=public,extensions'),transcript);
 }
 assert.throws(()=>psqlArgs('service_role'));
});
test('CLI preserves endpoint/version workflow and passes password through child env only',()=>{
 let captured;const args=migrationArgs('fixture');const u=new URL(args[args.indexOf('--db-url')+1]);
 assert.equal(u.password,'');assert.equal(u.username,'postgres');assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'57722');assert.equal(u.search,'?sslmode=disable');
 runner(fixture(),'fixture',(command,args,options)=>{captured={command,args,options};return {status:0};})('supabase',args,true);
 assert.equal(captured.options.env.PGPASSWORD,password(fixture()));assert.ok(!JSON.stringify(captured.args).includes(password(fixture())));
});
test('safe logging redacts passwords, URL passwords, keys and encoded password forms',()=>{
 const c=fixture();c.services.auth.environment.DATABASE_URL='postgresql://u:p%40ss@db/db';
 const safe=redactor(c);const output=safe('test-password-unique url-secret jwt-secret-unique p%40ss p@ss');
 for(const value of ['test-password-unique','url-secret','jwt-secret-unique','p%40ss','p@ss'])assert.ok(!output.includes(value));assert.match(output,/REDACTED/);
});
test('process exception details cannot escape and native error objects are discarded',()=>{
 assert.throws(()=>runner(fixture(),'fixture',()=>{throw new Error(password(fixture()));})('docker',[],true),/^Error: Client process could not start$/);
 const r=runner(fixture(),'fixture',()=>({status:null,error:new Error(password(fixture()))}))('docker',[],true);
 assert.equal(r.error,'Client process failed');assert.ok(!JSON.stringify(r).includes(password(fixture())));
});
test('malformed private config errors do not print its contents',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'clash-auth-'));const file=path.join(root,'compose.json');
 try {fs.writeFileSync(file,'{"password":"private-sentinel"');assert.throws(()=>loadConfig(root),/^Error: Cannot read disposable Compose configuration$/);}
 finally {fs.unlinkSync(file);fs.rmdirSync(root);}
});
test('lifecycle delegates bootstrap to authenticated helper and contains no bare psql',()=>{
 const s=fs.readFileSync(path.join(__dirname,'lifecycle.ps1'),'utf8');
 assert.ok(s.includes("'client-auth.cjs'),'bootstrap',$taskRoot,'--authorized-new-disposable-attempt'"));assert.ok(!s.includes("'psql'"));
 const e=fs.readFileSync(path.join(__dirname,'execute.cjs'),'utf8');assert.ok(e.includes("psqlArgs('postgres',[],true)"));assert.ok(e.includes("run('supabase',migrationArgs(root),true)"));
 assert.ok(e.includes("safe(r.stdout+'\\n'+r.stderr)"));assert.ok(e.includes('safe(r.stderr)'));
});
test('bootstrap helper import is inert and unauthorized entry never starts clients',()=>{
 const result=spawnSync(process.execPath,[path.join(__dirname,'client-auth.cjs'),'bootstrap','nonexistent'],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/Bootstrap client failed/);assert.equal(result.stdout,'');
});
test('PowerShell logging sanitizes actual mocked command output and preserves generic failure',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'clash-auth-ps-'));
 const script=path.join(root,'test.ps1');
 const source=path.join(__dirname,'lifecycle.ps1');
 try {
  fs.writeFileSync(path.join(root,'compose.json'),JSON.stringify(fixture()));
  fs.writeFileSync(path.join(root,'stderr.cjs'),"const c=require('./compose.json');process.stderr.write(c.services.db.environment.POSTGRES_PASSWORD);process.exitCode=2;");
  fs.writeFileSync(script,`$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
. (Join-Path (Split-Path $args[0]) 'client-environment.ps1')
$ast=[System.Management.Automation.Language.Parser]::ParseFile($args[0],[ref]$null,[ref]$null)
$fn=$ast.Find({param($a) $a -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -eq 'D'},$true)
Invoke-Expression $fn.Extent.Text
function docker { Write-Output 'test-password-unique url-secret jwt-secret-unique'; $global:LASTEXITCODE=2 }
try { D @('inspect') | Out-Null; throw 'Expected failure' } catch { if ($_.Exception.Message -ne 'Docker command failed; stop affected sequence: inspect') {throw 'Unexpected unsafe failure'} }
function docker { & node (Join-Path $taskRoot 'stderr.cjs') }
try { D @('inspect') | Out-Null; throw 'Expected failure' } catch { if ($_.Exception.Message -ne 'Docker command failed; stop affected sequence: inspect') {throw 'Unexpected unsafe native stderr failure'} }
$log=Get-Content -Raw (Join-Path $taskRoot 'commands.sanitized.log')
if ($log -match 'test-password-unique|url-secret|jwt-secret-unique') { throw 'Credential leakage' }
Write-Output 'SAFE_LOG_PASS'
`);
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',script,source],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/SAFE_LOG_PASS/);
  for(const value of ['test-password-unique','url-secret','jwt-secret-unique']) assert.ok(!(result.stdout+result.stderr).includes(value),'Console credential leakage');
 } finally {for(const f of fs.readdirSync(root)) fs.unlinkSync(path.join(root,f));fs.rmdirSync(root);}
});
