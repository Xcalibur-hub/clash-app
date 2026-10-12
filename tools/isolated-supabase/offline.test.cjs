const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {compose,secrets,jwt,frozen,vendorCheck,CONCURRENCY_PREFIXES}=require('./prepare.cjs');
const {parseTap}=require('./tap.cjs');
const {checkCompose,checkInspect}=require('../../scripts/loopback-binding-check.cjs');
const project='clash_p11bind_unit';
test('six pinned runtime services and three exact ordered initialization jobs',()=>{
 const c=compose(project,secrets()); assert.equal(Object.keys(c.services).length,9);
 for(const s of Object.values(c.services)) {assert.match(s.image,/@sha256:[a-f0-9]{64}$/);assert.equal(s.platform,'linux/amd64');assert.equal(s.restart,'no');assert.ok(!s.container_name);}
 assert.deepEqual(c.services['auth-init'].command,['gotrue','migrate']);
 assert.deepEqual(c.services['storage-init'].command,['node','dist/scripts/migrate-call.js']);
 assert.match(c.services['realtime-init'].command[2],/health_check\("realtime-dev"\)/);
});
test('only DB and gateway publish explicit loopback ports; all resources project scoped',()=>{
 const c=compose(project,secrets());checkCompose(c,project);
 for(const [n,s] of Object.entries(c.services)) if(!['db','kong'].includes(n)) assert.equal(s.ports,undefined);
 for(const v of Object.values(c.volumes)) {assert.ok(v.name.startsWith(project+'_'));assert.ok(!v.external);}
 assert.equal(c.networks.isolated.name,project+'_network');
});
test('wildcard or inherited networking fails static gate',()=>{
 for(const mutation of [c=>c.services.db.ports[0].host_ip='0.0.0.0',c=>c.services.auth.ports=[{target:9999}],c=>c.services.rest.network_mode='host']) {
  const c=compose(project,secrets());mutation(c);assert.throws(()=>checkCompose(c,project));
 }
});
test('fresh secrets and keys share isolated signature; public/privileged keys differ',()=>{
 const a=secrets(),b=secrets();assert.notEqual(a.JWT_SECRET,b.JWT_SECRET);assert.notEqual(a.ANON_KEY,a.SERVICE_KEY);
 assert.equal(a.ANON_KEY,jwt(a.JWT_SECRET,'anon'));assert.equal(a.SERVICE_KEY,jwt(a.JWT_SECRET,'service_role'));
 assert.equal(a.DB_ENC_KEY.length,16);assert.equal(a.PGSODIUM_ROOT_KEY.length,64);
});
test('bootstrap vendor bytes match pinned upstream hashes',vendorCheck);
test('all245 frozen source hashes and89 suites; nine designated concurrency/race suites retained',()=>{
 const f=frozen();assert.equal(f.files.length,245);assert.equal(f.manifest.sql_suites_prepared_not_executed.length,89);
 assert.equal(f.manifest.sql_suites_prepared_not_executed.filter(e=>CONCURRENCY_PREFIXES.includes(path.basename(e.path).slice(0,3))).length,9);
});
test('TAP success requires real assertion count and matching plan',()=>{
 assert.deepEqual(parseTap('1..2\nok 1 - a\nok 2 - b\n'),{planned:2,assertions:2,passed:2,failed:0,skipped:0,todo:0,unexpected_todo_pass:0,suite_skipped:false});
 assert.equal(parseTap('ok 1 - a\n1..1').passed,1);
});
test('exit0 without TAP or incomplete plan fails',()=>{for(const s of ['','SELECT 1','ok 1 - no plan','1..2\nok 1','1..1\n1..1\nok 1','1..0'])assert.throws(()=>parseTap(s));});
test('not ok, SQL failure, bailout, duplicate/out-of-order numbering fail',()=>{
 for(const s of ['1..1\nnot ok 1','1..1\nBail out! broken','1..2\nok 1\nok 1','1..1\nok 2'])assert.throws(()=>parseTap(s));
 assert.throws(()=>parseTap('1..1\nok 1','',1));assert.throws(()=>parseTap('1..1\nok 1','psql:/tests/x.sql:12: ERROR: denied',0));
});
test('skip andTODO counted separately; unexpectedTODO pass fails',()=>{
 const r=parseTap('1..3\nok 1\nok 2 # SKIP unavailable\nnot ok 3 # TODO later');assert.equal(r.passed,1);assert.equal(r.skipped,1);assert.equal(r.todo,1);
 assert.throws(()=>parseTap('1..1\nok 1 # TODO surprising'));assert.equal(parseTap('1..0 # SKIP reason').suite_skipped,true);
});
test('inspection distinguishes file intent from unsafe actual host bindings',()=>{
 const c=compose(project,secrets());const inspect=Object.entries(c.services).map(([name,s])=>({Config:{Labels:{'com.docker.compose.project':project,'com.docker.compose.service':name}},HostConfig:{NetworkMode:project+'_network',PublishAllPorts:false,PortBindings:s.ports?{[s.ports[0].target+'/tcp']:[{HostIp:'127.0.0.1',HostPort:s.ports[0].published}]}:{}}}));
 assert.equal(checkInspect(inspect,project,false).reachability_verified,false);inspect[0].HostConfig.PortBindings['5432/tcp'][0].HostIp='';assert.throws(()=>checkInspect(inspect,project,false));
});
test('future lifecycle refuses missing authorization; default executor cannot run on import',()=>{
 const s=fs.readFileSync(path.join(__dirname,'lifecycle.ps1'),'utf8');assert.ok(s.indexOf('if (-not $AuthorizedNewDisposableAttempt)')<s.indexOf("Invoke-IsolatedClient 'docker'"));
 assert.ok(s.indexOf("C @('create','--no-build')")<s.indexOf("C @('start','db')"));
 const execute=require('./execute.cjs');assert.equal(typeof execute.verifyPrepared,'function');
});
// End-to-end FILE-ONLY preparation; never invokes a database process.
test('prepare refuses unsafe/existing destinations and detects changed copied bootstrap',()=>{
 const {prepare}=require('./prepare.cjs'),{verifyPrepared}=require('./execute.cjs');
 assert.throws(()=>prepare('../escape'));assert.throws(()=>prepare('invalid'));
 const name='clash_p11bind_test_'+require('node:crypto').randomBytes(6).toString('hex');
 const output=prepare(name);assert.equal(verifyPrepared(output.directory).manifest.migration_order.length,106);
 assert.throws(()=>prepare(name),{code:'ERR_ASSERTION'});
 const file=path.join(output.directory,'bootstrap','extensions.sql'),before=fs.readFileSync(file);
 fs.appendFileSync(file,'-- altered fixture\n');assert.throws(()=>verifyPrepared(output.directory),/Bootstrap file changed/);fs.writeFileSync(file,before);
});
test('failed-suite emitted assertion counts survive SQL/TAP failure reporting',()=>{
 const {observedTap}=require('./tap.cjs');assert.deepEqual(observedTap('1..3\nok 1\nnot ok 2\nok 3 # SKIP unavailable'),
  {emitted_assertions:3,not_ok:1,skip_directives:1,todo_directives:0});
});
test('focused security suites cannot silently skip or defer assertions',()=>{
 const {validateSuite}=require('./execute.cjs');assert.equal(validateSuite('087_critical_authorization.sql','1..1\nok 1').passed,1);
 assert.throws(()=>validateSuite('089_m1_clash_visibility.sql','1..1\nok 1 # SKIP unavailable'));
 assert.throws(()=>validateSuite('088_h3_reputation_privacy.sql','1..1\nnot ok 1 # TODO later'));
 assert.equal(parseTap('1..1\nok 1 - handles ERROR: in user text').passed,1);
});
