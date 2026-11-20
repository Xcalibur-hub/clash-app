// Exercise the actual service with a stateful Supabase client double. This catches
// lost method binding, response trust and raw-event rendering regressions.
const fs=require('node:fs'); const Module=require('node:module'); const babel=require('@babel/core');
const assert=require('node:assert/strict'); const original=Module._load;
for(const ext of ['.ts','.tsx']) Module._extensions[ext]=(mod,file)=>mod._compile(babel.transformSync(fs.readFileSync(file,'utf8'),{
  filename:file,babelrc:false,configFile:false,presets:['@babel/preset-typescript'],plugins:['@babel/plugin-transform-modules-commonjs'],
}).code,file);
const row={id:'00000000-0000-0000-0000-000000000001',roomId:'r',body:'Verified',createdAt:'2026-10-08T10:00:00.123456+00:00',isOwn:false,author:{id:'s',name:'Sam',handle:'sam',avatarTint:'#aaaaaa'}};
let response=row; let captured; let eventCallback; let stateCallback; let removed=false; let failed=false;
const channel={on(_kind,_filter,callback){eventCallback=callback;return this;},subscribe(callback){stateCallback=callback;callback('SUBSCRIBED');return this;}};
const client={
  async rpc(name,args){assert.equal(this,client,'rpc must remain bound');captured={name,args};return {data:response,error:failed?{code:'42501',message:'refused'}:null};},
  channel(){return channel;},removeChannel(){removed=true;return Promise.resolve();},
  auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  realtime:{setAuth:async()=>{}},
};
Module._load=function(request,parent){if(request==='./supabaseClient'&&parent.filename.endsWith('arenaCrowdService.ts'))return {isSupabaseConfigured:true,requireSupabase:()=>client,requestError:error=>Object.assign(new Error('Access refused'),{code:error.code})};return original.apply(this,arguments);};
async function main(){
  const service=require('../services/arenaCrowdService.ts');
  assert.equal((await service.postCrowd('r','Verified','nonce')).id,row.id);console.log('PASS bound client RPC');
  response=[row];await service.fetchCrowdPage('r',row,'newer');assert.equal(captured.args.p_cursor_at,row.createdAt);console.log('PASS precise reconnect cursor');
  response=[{...row,roomId:'private'}];await assert.rejects(service.fetchCrowdIds('r',[row.id]));console.log('PASS foreign Room payload fails closed');
  failed=true;await assert.rejects(service.fetchCrowdPage('r'),{code:'42501'});console.log('PASS authorization failure propagates');failed=false;
  let ids;let online;const stop=service.subscribeCrowd('r',value=>ids=value,value=>online=value);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(online,true);
  eventCallback({new:{id:row.id,body:'UNTRUSTED EVENT TEXT'}});assert.deepEqual(ids,[row.id]);console.log('PASS Realtime emits IDs only');
  stateCallback('CHANNEL_ERROR');assert.equal(online,false);console.log('PASS reconnect state reported');
  stop();assert.equal(removed,true);ids=[];eventCallback({new:row});assert.deepEqual(ids,[]);online=true;stateCallback('CLOSED');assert.equal(online,true);console.log('PASS disposed subscription cannot update rows or connection state');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
