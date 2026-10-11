// FUTURE AUTHORIZED DISPOSABLE ATTEMPT ONLY. Never invoked by offline tests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {hash,compose,frozen,CONCURRENCY_PREFIXES}=require('./prepare.cjs');
const {verify:verifyArtifact,prepare:artifact}=require('../../scripts/migration-compatibility-artifact.cjs');
const {checkCompose}=require('../../scripts/loopback-binding-check.cjs');
const {parseTap,observedTap}=require('./tap.cjs');
function verifyPrepared(root) {
 root=path.resolve(root); assert.equal(fs.realpathSync(root).toLowerCase(),root.toLowerCase());
 const meta=JSON.parse(fs.readFileSync(path.join(root,'prepared.json')));
 assert.match(meta.project,/^clash_p11bind_[a-z0-9_]+$/);assert.equal(path.basename(root),meta.project);
 const config=JSON.parse(fs.readFileSync(path.join(root,'compose.json')));checkCompose(config,meta.project);
 const env=config.services.db.environment;
 const secrets={...env,...config.services.storage.environment,SERVICE_KEY:config.services.storage.environment.SERVICE_KEY,
  SECRET_KEY_BASE:config.services.realtime.environment.SECRET_KEY_BASE,DB_ENC_KEY:config.services.realtime.environment.DB_ENC_KEY,
  S3_ACCESS_KEY:config.services.storage.environment.S3_PROTOCOL_ACCESS_KEY_ID,S3_SECRET_KEY:config.services.storage.environment.S3_PROTOCOL_ACCESS_KEY_SECRET};
 assert.deepEqual(config,compose(meta.project,secrets),'Prepared Compose changed');
 const {jwt}=require('./prepare.cjs');assert.equal(secrets.ANON_KEY,jwt(env.JWT_SECRET,'anon'));assert.equal(secrets.SERVICE_KEY,jwt(env.JWT_SECRET,'service_role'));
 for(const file of ['db-entrypoint.sh','extensions.sql','inspect-security.sql','images.json',...require('./vendor/provenance.json').map(e=>'vendor/'+e.file)])
  assert.deepEqual(fs.readFileSync(path.join(root,'bootstrap',file)),fs.readFileSync(path.join(__dirname,file)),'Bootstrap file changed: '+file);
 verifyArtifact(path.join(root,'migration-compatibility-reviewed'),artifact());
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'source-manifest.json')));
 assert.deepEqual(manifest,frozen().manifest,'Frozen suite/source manifest changed');
 assert.equal(manifest.sql_suites_prepared_not_executed.length,89);
 for(const e of manifest.sql_suites_prepared_not_executed) assert.equal(hash(fs.readFileSync(path.join(root,'tests',path.basename(e.path)))),e.sha256);
 const migrated=artifact();assert.deepEqual(fs.readdirSync(path.join(root,'supabase','migrations')).sort(),migrated.outputs.map(o=>o.name).sort());
 for(const e of migrated.outputs) assert.equal(hash(fs.readFileSync(path.join(root,'supabase','migrations',e.name))),e.entry.artifact_sha256);
 for(const file of ['project-ref','pooler-url']) assert.ok(!fs.existsSync(path.join(root,'supabase','.temp',file)),'No inherited project-link configuration');
 assert.equal(fs.readFileSync(path.join(root,'supabase','config.toml'),'utf8'),'project_id = "'+meta.project+'"\n[db]\nmajor_version = 17\n');
 return {root,meta,manifest};
}
function validateSuite(name,...args) {
 const r=parseTap(...args);
 if(/^(085|087|088|089)_/.test(name)) assert.equal(r.skipped+r.todo+Number(r.suite_skipped),0,'Focused security suite cannot skip/TODO');
 return r;
}
function main(mode,root,authorization) {
 assert.equal(authorization,'--authorized-new-disposable-attempt','Separate runtime authorization REQUIRED');
 assert.ok(['migrate','tests'].includes(mode));const ctx=verifyPrepared(root);root=ctx.root;
 assert.ok(fs.existsSync(path.join(root,'bootstrap-complete.json')),'Managed bootstrap and binding evidence required');
 const config=JSON.parse(fs.readFileSync(path.join(root,'compose.json'))),project=ctx.meta.project;
 const evidence=path.join(root,'evidence');fs.mkdirSync(evidence,{recursive:true});
 const claim=path.join(evidence,mode+'-attempt.json');fs.writeFileSync(claim,JSON.stringify({started_at:new Date().toISOString()}),{flag:'wx'});
 const childEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|DOCKER_CONTEXT)$/i.test(k)));
 // Never inherit SUPABASE_*, PG*, DATABASE_URL, backend URLs or keys.
 const run=(command,args)=>spawnSync(command,args,{cwd:root,env:childEnv,encoding:'utf8',maxBuffer:64*1024*1024,timeout:15*60*1000,shell:false});
 const docker=args=>run('docker',['compose','-p',project,'-f',path.join(root,'compose.json'),...args]);
 const endpoint=run('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}']);assert.equal(endpoint.status,0);assert.match(endpoint.stdout.trim(),/^(npipe:|unix:)/,'Local Docker daemon required');
 const inspected=run('docker',['inspect',...docker(['ps','-a','-q']).stdout.trim().split(/\r?\n/)]);
 assert.equal(inspected.status,0);require('../../scripts/loopback-binding-check.cjs').checkInspect(JSON.parse(inspected.stdout),project,false);
 const sqlArgs=['exec','-T','-e','PGOPTIONS=-c search_path=public,extensions','db','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'];
 if(mode==='migrate') {
  const version=run('supabase',['--version']);assert.equal(version.status,0);assert.equal(version.stdout.trim(),'2.40.7');
  const empty=docker([...sqlArgs,'-c',"select case when to_regclass('supabase_migrations.schema_migrations') is null then 'EMPTY' else 'EXISTS' end"]);
  assert.equal(empty.status,0);assert.equal(empty.stdout.trim(),'EMPTY','Existing migration ledger refused; no repair/retry');
  const r=run('supabase',['migration','up','--db-url','postgresql://postgres:postgres@127.0.0.1:57722/postgres?sslmode=disable','--workdir',root]);
  fs.writeFileSync(path.join(evidence,'migrations.log'),r.stdout+'\n'+r.stderr);
  assert.equal(r.status,0,'Migration failed: STOP, no retries');
  const ledger=docker([...sqlArgs,'-c','select version from supabase_migrations.schema_migrations order by version']);
  assert.equal(ledger.status,0);const expected=ctx.manifest.migration_order.map(e=>path.basename(e.path).split('_')[0]);
  assert.deepEqual(ledger.stdout.trim().split(/\r?\n/),expected);
  fs.writeFileSync(path.join(evidence,'migration-success.json'),JSON.stringify({migrations:106,versions:expected},null,2));
 } else {
  assert.ok(fs.existsSync(path.join(evidence,'migration-success.json')),'All106 migrations must pass first');
  const results=[];
  for(const e of ctx.manifest.sql_suites_prepared_not_executed) {
   const name=path.basename(e.path),r=docker([...sqlArgs,'-f','/tests/'+name]);
   fs.writeFileSync(path.join(evidence,name+'.stdout'),r.stdout||'');fs.writeFileSync(path.join(evidence,name+'.stderr'),r.stderr||'');
   try {results.push({suite:name,...validateSuite(name,r.stdout||'',r.stderr||'',r.status)});}
   catch(error) {results.push({suite:name,status:'FAIL',error:error.message,observed_tap:observedTap(r.stdout||''),exit_code:r.status});
    fs.writeFileSync(path.join(evidence,'failure-summary.json'),JSON.stringify({suites_attempted:results.length,suites_not_run:89-results.length,failed_suite:name,
     observed_tap:observedTap(r.stdout||''),note:'Observed counts are not a passing TAP validation; see per-suite results and raw logs.'},null,2));fs.writeFileSync(path.join(evidence,'tap-results.json'),JSON.stringify(results,null,2));throw error;}
   fs.writeFileSync(path.join(evidence,'tap-results.json'),JSON.stringify(results,null,2));
  }
  const totals=results.reduce((a,r)=>{for(const k of ['assertions','passed','failed','skipped','todo','unexpected_todo_pass'])a[k]+=r[k];return a;},
   {suites:results.length,concurrency_suites:results.filter(r=>CONCURRENCY_PREFIXES.includes(r.suite.slice(0,3))).length,assertions:0,passed:0,failed:0,skipped:0,todo:0,unexpected_todo_pass:0});
  fs.writeFileSync(path.join(evidence,'tap-totals.json'),JSON.stringify(totals,null,2));console.log(JSON.stringify(totals));
 }
}
if(require.main===module)try{main(...process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={verifyPrepared,validateSuite};
