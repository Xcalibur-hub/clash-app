// Preloaded ONLY by offline tests. Never import the client helper here: that would hide its import-order defect.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=process.env.CLASH_BOOTSTRAP_FIXTURE_ROOT,mode=process.env.CLASH_BOOTSTRAP_MOCK_RESULT;
const config=JSON.parse(fs.readFileSync(path.join(root,'compose.json'),'utf8'));
const calls=path.join(root,'mock-calls.jsonl');
const realExec=cp.execFileSync;
cp.execFileSync=(command,args,options)=>{if(command!=='git')throw new Error('Offline fixture forbids non-Git execFileSync');return realExec(command,args,options);};
cp.spawnSync=(command,args,options)=>{
 assert.ok(command==='docker','Offline fixture forbids unexpected subprocess');
 fs.appendFileSync(calls,JSON.stringify({invoked:true})+'\n');
 const expected=['compose','-p',config.name,'-f',path.join(root,'compose.json'),'exec','-T','-e','PGPASSWORD','db','psql','-X','-w','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres','-f','/bootstrap/extensions.sql'];
 assert.ok(JSON.stringify(args)===JSON.stringify(expected),'Unexpected bootstrap arguments');
 assert.ok(options.env.PGPASSWORD===config.services.db.environment.POSTGRES_PASSWORD,'Password propagation mismatch');
 assert.ok(options.shell===false&&options.cwd===root,'Client execution contract changed');
 for(const key of ['PGHOST','SUPABASE_ACCESS_TOKEN','DATABASE_URL','JWT_SECRET','GOTRUE_DB_DATABASE_URL','S3_SECRET_KEY'])assert.ok(options.env[key]===undefined,'Inherited override reached subprocess');
 fs.appendFileSync(path.join(root,'mock-verified.jsonl'),JSON.stringify({role:'supabase_admin',noninteractive:true,error_stop:true,password_forwarded:true,password_in_argv:false,overrides_stripped:true})+'\n');
 if(mode==='throw')throw new Error(config.services.db.environment.POSTGRES_PASSWORD);
 return {status:mode==='failure'?2:0,stdout:mode==='failure'?config.services.db.environment.POSTGRES_PASSWORD:'MOCK_PREREQUISITES_OK',stderr:mode==='failure'?config.services.db.environment.JWT_SECRET:''};
};
