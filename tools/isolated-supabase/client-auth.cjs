// File-only on import. Runtime entry point requires separate disposable-attempt authorization.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {clientEnvironment}=require('./client-environment.cjs');
function loadConfig(root) {
 try {return JSON.parse(fs.readFileSync(path.join(root,'compose.json'),'utf8'));}
 catch {throw new Error('Cannot read disposable Compose configuration');}
}
function password(config) {
 const value=config?.services?.db?.environment?.POSTGRES_PASSWORD;
 if(typeof value!=='string'||!value.trim()||/[\r\n\0]/.test(value)) throw new Error('Missing or invalid disposable database password');
 return value;
}
function redactor(config) {
 const values=[];
 for(const service of Object.values(config.services||{})) for(const [key,value] of Object.entries(service.environment||{})) {
  if(typeof value!=='string'||!value) continue;
  if(/SECRET|KEY|PASSWORD/i.test(key)) values.push(value);
  try {const u=new URL(value);if(u.password) values.push(u.password,decodeURIComponent(u.password));} catch {}
 }
 return text=>{let result=String(text??'');for(const value of [...new Set(values)].sort((a,b)=>b.length-a.length)) result=result.split(value).join('[REDACTED]');return result;};
}
function runner(config,root,spawn=spawnSync,inherited=process.env) {
 const value=password(config); // Reject before ANY child process, including Docker inspection.
 const env=clientEnvironment(inherited);
 return (command,args,authenticated=false)=>{
  const childEnv={...env,...(authenticated?{PGPASSWORD:value}:{})};
  try {
   const result=spawn(command,args,{cwd:root,env:childEnv,encoding:'utf8',maxBuffer:64*1024*1024,timeout:15*60*1000,shell:false});
   // Do not expose native spawn error objects (may include private environment/diagnostics).
   return {status:result.status,stdout:result.stdout||'',stderr:result.stderr||'',...(result.error?{error:'Client process failed'}:{})};
  } catch {throw new Error('Client process could not start');}
 };
}
function psqlArgs(role,extra=[],transcript=false) {
 if(!['postgres','supabase_admin'].includes(role)) throw new Error('Unexpected client role');
 return ['exec','-T','-e','PGPASSWORD',...(transcript?['-e','PGOPTIONS=-c search_path=public,extensions']:[]),
  'db','psql','-X','-w',...(transcript?['-q','-A','-t']:[]),'-v','ON_ERROR_STOP=1','-U',role,'-d','postgres',...extra];
}
function migrationArgs(root) {
 return ['migration','up','--db-url','postgresql://postgres@127.0.0.1:57722/postgres?sslmode=disable','--workdir',root];
}
function bootstrap(root,authorization) {
 if(authorization!=='--authorized-new-disposable-attempt') throw new Error('Separate runtime authorization REQUIRED');
 // Exact prepared artifact/configuration and prior lifecycle gates are still required.
 const ctx=require('./execute.cjs').verifyPrepared(root);
 if(!fs.existsSync(path.join(root,'bootstrap-attempt.json'))||!fs.existsSync(path.join(root,'creation-verified.json'))) throw new Error('Lifecycle bootstrap gates required');
 const config=loadConfig(root),safe=redactor(config),run=runner(config,root);
 const result=run('docker',['compose','-p',ctx.meta.project,'-f',path.join(root,'compose.json'),...psqlArgs('supabase_admin',['-f','/bootstrap/extensions.sql'])],true);
 fs.appendFileSync(path.join(root,'commands.sanitized.log'),'bootstrap psql exit='+result.status+'\n'+safe(result.stdout+'\n'+result.stderr)+'\n');
 if(result.status!==0) throw new Error('Bootstrap psql failed; stop affected sequence');
}
if(require.main===module) {
 try {if(process.argv[2]!=='bootstrap') throw new Error('Unknown client operation');bootstrap(process.argv[3],process.argv[4]);}
 catch {console.error('Bootstrap client failed; see sanitized log if available. No retry authorized.');process.exitCode=1;}
}
module.exports={loadConfig,password,redactor,runner,psqlArgs,migrationArgs};
