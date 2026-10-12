// File-only generator. No Docker, database, HTTP or Supabase execution.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {generate, prepare: artifact} = require('../../scripts/migration-compatibility-artifact.cjs');
const {checkCompose} = require('../../scripts/loopback-binding-check.cjs');
const images = require('./images.json');
const ROOT = path.resolve(__dirname, '../..');
const CANDIDATE = 'a92a550527f810913b01f6e6411dc78996c71a06';
const CONCURRENCY_PREFIXES=['048','055','057','059','067','071','073','078','080'];
const MANIFEST = 'docs/PHASE_11_INTEGRATION_CANDIDATE_MANIFEST.json';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function git(args, input) {
 return execFileSync('git',['-c','safe.directory='+ROOT.replaceAll('\\','/'),...args],{cwd:ROOT,input,maxBuffer:64*1024*1024});
}
function frozen() {
 const bytes=git(['show',CANDIDATE+':'+MANIFEST]);
 assert.equal(hash(bytes),'a9b30736c87a7fac05c9764404dfd58a876f64db6a3e072e9a348cac8b162b4e');
 const manifest=JSON.parse(bytes);
 const entries=[...manifest.migration_order,...manifest.sql_suites_prepared_not_executed,...manifest.integrated_client_config_and_harness_artifacts];
 assert.equal(entries.length,245);
 const data=git(['cat-file','--batch'],entries.map(e=>CANDIDATE+':'+e.path+'\n').join(''));
 let pos=0; const files=entries.map(e=>{
  const end=data.indexOf(10,pos), header=data.subarray(pos,end).toString();
  assert.match(header,/^[a-f0-9]{40} blob \d+$/);
  const size=Number(header.split(' ')[2]), blob=data.subarray(end+1,end+1+size); pos=end+size+2;
  assert.equal(hash(blob),e.sha256,e.path); return {...e,bytes:blob};
 }); assert.equal(pos,data.length); return {manifest,files};
}
function jwt(secret,role) {
 const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const payload=b({alg:'HS256',typ:'JWT'})+'.'+b({iss:'supabase-demo',role,iat:0,exp:4102444800});
 return payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url');
}
function secrets() {
 const hex=n=>crypto.randomBytes(n).toString('hex'), JWT_SECRET=hex(32);
 return {JWT_SECRET,ANON_KEY:jwt(JWT_SECRET,'anon'),SERVICE_KEY:jwt(JWT_SECRET,'service_role'),
  SECRET_KEY_BASE:hex(64),DB_ENC_KEY:hex(8),PGSODIUM_ROOT_KEY:hex(32),S3_ACCESS_KEY:hex(16),S3_SECRET_KEY:hex(32)};
}
function compose(project,s) {
 const common=(image,environment={})=>({image:images[image].image,platform:'linux/amd64',restart:'no',environment,networks:['isolated']});
 const auth={API_EXTERNAL_URL:'http://127.0.0.1:57721',GOTRUE_LOG_LEVEL:'error',GOTRUE_DB_DRIVER:'postgres',
  GOTRUE_DB_DATABASE_URL:'postgresql://supabase_auth_admin:postgres@db:5432/postgres',GOTRUE_SITE_URL:'http://127.0.0.1:57721',GOTRUE_JWT_SECRET:s.JWT_SECRET};
 const rt={PORT:'4000',DB_HOST:'db',DB_PORT:'5432',DB_USER:'supabase_admin',DB_PASSWORD:'postgres',DB_NAME:'postgres',
  DB_AFTER_CONNECT_QUERY:'SET search_path TO _realtime',DB_ENC_KEY:s.DB_ENC_KEY,API_JWT_SECRET:s.JWT_SECRET,METRICS_JWT_SECRET:s.JWT_SECRET,
  APP_NAME:'realtime',SECRET_KEY_BASE:s.SECRET_KEY_BASE,ERL_AFLAGS:'-proto_dist inet_tcp',DNS_NODES:"''",RLIMIT_NOFILE:'',
  SEED_SELF_HOST:'true',RUN_JANITOR:'true',MAX_HEADER_LENGTH:'4096'};
 const st={DB_INSTALL_ROLES:'false',DB_MIGRATIONS_FREEZE_AT:'',ANON_KEY:s.ANON_KEY,SERVICE_KEY:s.SERVICE_KEY,
  DATABASE_URL:'postgresql://supabase_storage_admin:postgres@db:5432/postgres',FILE_SIZE_LIMIT:'52428800',STORAGE_BACKEND:'file',TENANT_ID:'stub',GLOBAL_S3_BUCKET:'stub'};
 const health=(test)=>({test,interval:'2s',timeout:'2s',retries:60,start_period:'10s'});
 const config={name:project,services:{
  db:{...common('db',{POSTGRES_PASSWORD:'postgres',POSTGRES_HOST:'/var/run/postgresql',JWT_SECRET:s.JWT_SECRET,JWT_EXP:'3600',PGSODIUM_ROOT_KEY:s.PGSODIUM_ROOT_KEY}),
   entrypoint:['/bin/sh','/bootstrap/db-entrypoint.sh'],ports:[{host_ip:'127.0.0.1',target:5432,published:'57722',protocol:'tcp'}],
   volumes:['db-data:/var/lib/postgresql/data','db-config:/etc/postgresql-custom','./bootstrap:/bootstrap:ro','./tests:/tests:ro'],
   healthcheck:health(['CMD','pg_isready','-U','postgres','-h','127.0.0.1','-p','5432'])},
  'realtime-init':{...common('realtime',rt),command:['/app/bin/realtime','eval','{:ok, _} = Application.ensure_all_started(:realtime)\n{:ok, _} = Realtime.Tenants.health_check("realtime-dev")']},
  'storage-init':{...common('storage',{...st,PGRST_JWT_SECRET:s.JWT_SECRET,STORAGE_FILE_BACKEND_PATH:'/mnt',REGION:'stub'}),command:['node','dist/scripts/migrate-call.js']},
  'auth-init':{...common('auth',auth),command:['gotrue','migrate']},
  auth:{...common('auth',{...auth,GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_AUD:'authenticated',
   GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_ISSUER:'http://127.0.0.1:57721/auth/v1',
   GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_EXTERNAL_PHONE_ENABLED:'false',GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED:'false'}),
   healthcheck:health(['CMD','wget','--no-verbose','--tries=1','--spider','http://127.0.0.1:9999/health'])},
  rest:common('rest',{PGRST_DB_URI:'postgresql://authenticator:postgres@db:5432/postgres',PGRST_DB_SCHEMAS:'public,graphql_public',
   PGRST_DB_EXTRA_SEARCH_PATH:'public,extensions',PGRST_DB_MAX_ROWS:'1000',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:s.JWT_SECRET,PGRST_ADMIN_SERVER_PORT:'3001'}),
  realtime:{...common('realtime',rt),networks:{isolated:{aliases:['realtime-dev']}},healthcheck:health(['CMD','curl','-sSfL','--head','-o','/dev/null','-H','Host:realtime-dev','http://127.0.0.1:4000/api/ping'])},
  storage:{...common('storage',{...st,AUTH_JWT_SECRET:s.JWT_SECRET,FILE_STORAGE_BACKEND_PATH:'/mnt',STORAGE_S3_REGION:'local',ENABLE_IMAGE_TRANSFORMATION:'false',
   TUS_URL_PATH:'/storage/v1/upload/resumable',S3_PROTOCOL_ACCESS_KEY_ID:s.S3_ACCESS_KEY,S3_PROTOCOL_ACCESS_KEY_SECRET:s.S3_SECRET_KEY,
   S3_PROTOCOL_PREFIX:'/storage/v1',UPLOAD_FILE_SIZE_LIMIT:'52428800000',UPLOAD_FILE_SIZE_LIMIT_STANDARD:'5242880000'}),volumes:['storage-data:/mnt'],
   healthcheck:health(['CMD','wget','--no-verbose','--tries=1','--spider','http://127.0.0.1:5000/status'])},
  kong:{...common('kong',{KONG_DATABASE:'off',KONG_DECLARATIVE_CONFIG:'/home/kong/kong.yml',KONG_PROXY_LISTEN:'0.0.0.0:8000',KONG_ADMIN_LISTEN:'off',
   KONG_PLUGINS:'request-transformer,cors',KONG_DNS_ORDER:'LAST,A,CNAME'}),ports:[{host_ip:'127.0.0.1',target:8000,published:'57721',protocol:'tcp'}],
   volumes:['./kong.yml:/home/kong/kong.yml:ro'],healthcheck:health(['CMD','kong','health'])}
 },networks:{isolated:{name:project+'_network',driver:'bridge'}},volumes:Object.fromEntries(['db-data','db-config','storage-data'].map(n=>[n,{name:project+'_'+n}]))};
 checkCompose(config,project); return config;
}
function vendorCheck() {
 for(const e of require('./vendor/provenance.json')) assert.equal(hash(fs.readFileSync(path.join(__dirname,'vendor',e.file))),e.sha256,e.file);
}
function prepare(name) {
 assert.match(name,/^clash_p11bind_[a-z0-9_]+$/); vendorCheck(); const source=frozen(); artifact();
 const root=path.join(ROOT,'.expo'); fs.mkdirSync(root,{recursive:true});
 assert.equal(fs.realpathSync(root).toLowerCase(),root.toLowerCase(),'Redirected scratch root');
 const dest=path.join(root,name); assert.throws(()=>fs.lstatSync(dest),{code:'ENOENT'});
 fs.mkdirSync(dest); const art=path.join(dest,'migration-compatibility-reviewed'); generate(dest,art);
 fs.mkdirSync(path.join(dest,'supabase','migrations'),{recursive:true}); fs.mkdirSync(path.join(dest,'tests'));
 fs.cpSync(__dirname,path.join(dest,'bootstrap'),{recursive:true});
 for(const e of source.manifest.sql_suites_prepared_not_executed) {
  const b=source.files.find(f=>f.path===e.path).bytes; fs.writeFileSync(path.join(dest,'tests',path.basename(e.path)),b,{flag:'wx'});
 }
 for(const file of fs.readdirSync(path.join(art,'migrations'))) fs.copyFileSync(path.join(art,'migrations',file),path.join(dest,'supabase','migrations',file));
 fs.writeFileSync(path.join(dest,'supabase','config.toml'),'project_id = "'+name+'"\n[db]\nmajor_version = 17\n');
 fs.writeFileSync(path.join(dest,'compose.json'),JSON.stringify(compose(name,secrets()),null,2)+'\n',{flag:'wx',mode:0o600});
 let kong=fs.readFileSync(path.join(__dirname,'vendor','kong.yml'),'utf8').split('  - name: pg-meta')[0];
 for(const [key,value] of Object.entries({GotrueId:'auth',RestId:'rest',RealtimeId:'realtime-dev',StorageId:'storage'})) kong=kong.replaceAll('{{ .'+key+' }}',value);
 assert.ok(!kong.includes('{{')); fs.writeFileSync(path.join(dest,'kong.yml'),kong);
 fs.writeFileSync(path.join(dest,'source-manifest.json'),JSON.stringify(source.manifest,null,2)+'\n');
 fs.writeFileSync(path.join(dest,'prepared.json'),JSON.stringify({candidate:CANDIDATE,source_files:245,migrations:106,suites:89,
  project:name,created_at:new Date().toISOString(),runtime_authorized:false},null,2)+'\n');
 return {directory:dest,project:name,source_files:245,migrations:106,suites:89};
}
if(require.main===module) { try {assert.equal(process.argv.length,3);console.log(JSON.stringify(prepare(process.argv[2])));} catch(e) {console.error(e.message);process.exitCode=1;} }
module.exports={CONCURRENCY_PREFIXES,compose,frozen,secrets,jwt,prepare,vendorCheck,hash};
