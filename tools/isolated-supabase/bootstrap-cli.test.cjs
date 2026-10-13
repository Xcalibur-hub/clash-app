const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {prepare}=require('./prepare.cjs'),{clientEnvironment}=require('./client-environment.cjs');
const root=prepare('clash_p11bind_bootcli_'+crypto.randomBytes(6).toString('hex')).directory;
const configPath=path.join(root,'compose.json'),original=fs.readFileSync(configPath),config=JSON.parse(original);
for(const name of ['bootstrap-attempt.json','creation-verified.json'])fs.writeFileSync(path.join(root,name),'{}');
const auth=path.join(__dirname,'client-auth.cjs'),execute=path.join(__dirname,'execute.cjs');
function count(file){const p=path.join(root,file);return fs.existsSync(p)?fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).length:0;}
function invoke({entry=auth,operation='bootstrap',authorized=true,result='success'}={}) {
 for(const name of ['mock-calls.jsonl','mock-verified.jsonl','commands.sanitized.log']){const p=path.join(root,name);if(fs.existsSync(p))fs.unlinkSync(p);}
 const env={...clientEnvironment(),CLASH_BOOTSTRAP_FIXTURE_ROOT:root,CLASH_BOOTSTRAP_MOCK_RESULT:result,PGHOST:'fixture-override',SUPABASE_ACCESS_TOKEN:'fixture-override',DATABASE_URL:'fixture-override',JWT_SECRET:'fixture-override',GOTRUE_DB_DATABASE_URL:'fixture-override',S3_SECRET_KEY:'fixture-override'};
 const r=spawnSync(process.execPath,['--require',path.join(__dirname,'fixtures/bootstrap-cli-mock.cjs'),entry,operation,root,...(authorized?['--authorized-new-disposable-attempt']:[])],{env,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
 assert.ok(!r.error,'CLI process failed to start');
 for(const value of [config.services.db.environment.POSTGRES_PASSWORD,config.services.db.environment.JWT_SECRET])assert.ok(!(r.stdout+r.stderr).includes(value),'Credential leaked to console');
 return r;
}
test('actual authorized bootstrap CLI verifies real artifacts and reaches exactly one mocked psql command',()=>{
 const r=invoke();assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'');assert.equal(r.stderr,'');assert.equal(count('mock-calls.jsonl'),1);assert.equal(count('mock-verified.jsonl'),1);
 assert.match(fs.readFileSync(path.join(root,'commands.sanitized.log'),'utf8'),/MOCK_PREREQUISITES_OK/);
});
test('failed psql stops once, returns failure and redacts both diagnostic streams',()=>{
 const r=invoke({result:'failure'});assert.equal(r.status,1);assert.match(r.stderr,/Bootstrap client failed/);assert.equal(count('mock-calls.jsonl'),1);assert.equal(count('mock-verified.jsonl'),1);
 const log=fs.readFileSync(path.join(root,'commands.sanitized.log'),'utf8');assert.match(log,/exit=2/);assert.match(log,/REDACTED/);
 for(const value of [config.services.db.environment.POSTGRES_PASSWORD,config.services.db.environment.JWT_SECRET])assert.ok(!log.includes(value),'Credential leaked to log');
 assert.ok(!fs.existsSync(path.join(root,'bootstrap-complete.json')));
});
test('thrown subprocess exception stops once without exposing its secret message',()=>{
 const r=invoke({result:'throw'});assert.equal(r.status,1);assert.equal(count('mock-calls.jsonl'),1);assert.match(r.stderr,/Bootstrap client failed/);
});
test('unauthorized actual bootstrap entry rejects before any client invocation',()=>{
 const r=invoke({authorized:false});assert.equal(r.status,1);assert.equal(count('mock-calls.jsonl'),0);assert.equal(count('mock-verified.jsonl'),0);
});
test('missing generated password rejects actual bootstrap entry before any client invocation',()=>{
 const changed=JSON.parse(original);delete changed.services.db.environment.POSTGRES_PASSWORD;
 try {fs.writeFileSync(configPath,JSON.stringify(changed));const r=invoke();assert.equal(r.status,1);assert.equal(count('mock-calls.jsonl'),0);}
 finally {fs.writeFileSync(configPath,original);}
});
test('missing lifecycle gate rejects authorized entry before any client invocation',()=>{
 const gate=path.join(root,'creation-verified.json');fs.unlinkSync(gate);
 try {const r=invoke();assert.equal(r.status,1);assert.equal(count('mock-calls.jsonl'),0);}
 finally {fs.writeFileSync(gate,'{}');}
});
test('unknown bootstrap operation rejects before any client invocation',()=>{
 const r=invoke({operation:'unknown'});assert.equal(r.status,1);assert.equal(count('mock-calls.jsonl'),0);
});
test('execute CLI imports initialized helpers and preserves its authorization guard for both modes',()=>{
 for(const operation of ['migrate','tests']) {const r=invoke({entry:execute,operation,authorized:false});assert.equal(r.status,1);assert.match(r.stderr,/Separate runtime authorization REQUIRED/);assert.ok(!/circular dependency/.test(r.stderr));assert.equal(count('mock-calls.jsonl'),0);}
});
