// Actual service/store modules with controlled network and storage dependencies.
const fs=require('node:fs'),Module=require('node:module'),babel=require('@babel/core'),assert=require('node:assert/strict');
const load=Module._load;
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(mod,file)=>mod._compile(babel.transformSync(fs.readFileSync(file,'utf8'),{
 filename:file,babelrc:false,configFile:false,presets:['@babel/preset-typescript'],plugins:['@babel/plugin-transform-modules-commonjs'],
}).code,file);
let account='account-a',captured,fail=false,hold=false,finish,callback,stateCallback,removed=false;
const message={id:'m1',roomId:'r',kind:'text',body:'Argument',createdAt:'2026-10-09T01:00:00.123456+00:00',isOwn:true};
let response=message;
const channel={on(_kind,_filter,fn){callback=fn;return this;},subscribe(fn){stateCallback=fn;fn('SUBSCRIBED');return this;}};
const client={rpc(name,args){assert.equal(this,client);captured={name,args};const promise=hold?new Promise(resolve=>finish=()=>resolve({data:response,error:null})):Promise.resolve({data:response,error:fail?{code:'network',message:'response lost'}:null});promise.abortSignal=()=>promise;return promise;},
 channel(){return channel;},removeChannel(){removed=true;return Promise.resolve();},auth:{getSession:async()=>({data:{session:{access_token:'unit-token'}}})},realtime:{setAuth:async()=>{}}};
const memory=new Map();const storage={async getItem(k){return memory.get(k)??null;},async setItem(k,v){memory.set(k,v);},async removeItem(k){memory.delete(k);}};
class ServiceError extends Error{constructor(message,code){super(message);this.code=code;}}
Module._load=function(request,parent){
 if(request==='./supabaseClient'&&parent.filename.endsWith('liveArenaService.ts'))return {requireSupabase:()=>client,currentUserId:async()=>account,requestError:e=>Object.assign(new Error(e.message),{code:e.code}),SupabaseError:ServiceError};
 if(request==='./mediaService'&&parent.filename.endsWith('liveArenaService.ts'))return {};
 if(request==='@react-native-async-storage/async-storage')return {__esModule:true,default:storage};
 return load.apply(this,arguments);
};
let passed=0;const pass=label=>{passed++;console.log('PASS '+label);};
async function main(){
 const service=require('../services/liveArenaService.ts'),store=require('../services/officialRequestStore.ts');
 const payload={body:'Argument'};
 const [key,same]=await Promise.all([store.acquireOfficialRequest(account,'r','message',payload),store.acquireOfficialRequest(account,'r','message',payload)]);
 assert.equal(key,same);pass('concurrent cache acquisition uses one key');
 fail=true;await assert.rejects(service.postMessage({...payload,roomId:'r',requestKey:key,expectedAccountId:account}),{code:'network'});
 assert.equal(await store.acquireOfficialRequest(account,'r','message',payload),key);pass('lost-response retry retains persisted request');
 delete require.cache[require.resolve('../services/officialRequestStore.ts')];
 const reloaded=require('../services/officialRequestStore.ts');assert.equal(await reloaded.acquireOfficialRequest(account,'r','message',payload),key);pass('request survives module/session restart');
 fail=false;assert.equal((await service.postMessage({...payload,roomId:'r',requestKey:key,expectedAccountId:account})).id,'m1');
 assert.equal(captured.args.p_request_key,key);assert.equal(captured.name,'submit_arena_official');pass('canonical request ID reaches bound RPC and authoritative result');
 await reloaded.confirmOfficialRequest(account,'r','message',key);assert.notEqual(await reloaded.acquireOfficialRequest(account,'r','message',payload),key);pass('confirmed operation releases its request');
 assert.notEqual(await reloaded.acquireOfficialRequest(account,'r','message',{body:'Edited'}),key);pass('explicit payload edit abandons prior key');
 assert.notEqual(await reloaded.acquireOfficialRequest('account-b','r','message',payload),key);pass('storage namespace isolates accounts');
 account='account-b';await assert.rejects(service.postMessage({...payload,roomId:'r',requestKey:key,expectedAccountId:'account-a'}),{code:'account_changed'});pass('old-account request refused before dispatch');
 account='account-a';hold=true;const action=service.postMessage({...payload,roomId:'r',requestKey:key,expectedAccountId:account});
 await new Promise(resolve=>setImmediate(resolve));account='account-b';finish();await assert.rejects(action,{code:'account_changed'});hold=false;pass('account switch rejects late submission response');
 account='account-a';response=[message];await service.fetchOfficialPage('r','message',{id:'m0',preciseCreatedAt:message.createdAt},'newer');
 assert.equal(captured.args.p_cursor_at,message.createdAt);assert.equal(captured.args.p_cursor_id,'m0');pass('page cursor preserves microseconds and ID');
 response=[{...message,roomId:'private'}];await assert.rejects(service.fetchOfficialPage('r','message'));pass('foreign Room page fails closed');
 response=[message];hold=true;const recovery=service.fetchOfficialPage('r','message');await new Promise(resolve=>setImmediate(resolve));account='account-b';finish();await assert.rejects(recovery,{code:'account_changed'});hold=false;pass('account switch rejects late recovery page');
 account='account-a';let connected=false,ids=[];const stop=service.subscribeRoomMessages('r',event=>ids.push(event.id),v=>connected=v);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(connected,true);stateCallback('CHANNEL_ERROR');assert.equal(connected,false);stateCallback('SUBSCRIBED');assert.equal(connected,true);pass('connection recovery notifies official hook');
 stop();assert.equal(removed,true);stateCallback('SUBSCRIBED');callback({new:{id:'late',room_id:'r'}});assert.deepEqual(ids,[]);pass('disposed subscription cannot reconnect or deliver late rows');
 console.log(`${passed}/${passed} official service/store checks passed; network/storage doubles, not device verification.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
