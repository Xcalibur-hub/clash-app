// Actual service checks: private channel, server hydration, untrusted hints and
// late responses after disposal. This does not simulate physical devices.
const fs=require('node:fs'); const Module=require('node:module'); const babel=require('@babel/core');
const assert=require('node:assert/strict'); const load=Module._load;
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(mod,file)=>mod._compile(babel.transformSync(fs.readFileSync(file,'utf8'),{
  filename:file,babelrc:false,configFile:false,presets:['@babel/preset-typescript'],plugins:['@babel/plugin-transform-modules-commonjs'],
}).code,file);
let event;let config;let removed=false;let resolveRead;let pending=false;let writes=[];
const row={userId:'fighter-a',name:'Server Fighter',handle:'fighter',avatarTint:'#aaaaaa',typing:true,replyingToMessageId:null};
const channel={on(kind,filter,fn){assert.equal(kind,'broadcast');assert.equal(filter.event,'typing');event=fn;return this;},subscribe(fn){fn('SUBSCRIBED');return this;}};
const client={channel(topic,options){assert.equal(topic,'arena-typing:room');config=options;return channel;},
  async rpc(name,args){assert.equal(this,client);if(name==='get_arena_room_typing'){if(pending)return new Promise(resolve=>{resolveRead=resolve;});return {data:[row],error:null};}writes.push(args);return {data:null,error:null};},
  auth:{getSession:async()=>({data:{session:{access_token:'unit-token'}},error:null})},realtime:{setAuth:async()=>{}},removeChannel(){removed=true;return Promise.resolve();}};
Module._load=function(request,parent){if(parent.filename.endsWith('liveArenaService.ts')){
  if(request==='./supabaseClient')return {requireSupabase:()=>client,requestError:error=>new Error(error.code),SupabaseError:Error};
  if(request==='./mediaService')return {};
}return load.apply(this,arguments);};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
  const {subscribeRoomTyping}=require('../services/liveArenaService.ts');let peers=[];
  const sub=subscribeRoomTyping('room',{userId:'viewer',name:'Viewer',handle:'viewer',avatarTint:'#aaaaaa'},next=>{peers=next;});
  try {
    await tick();assert.deepEqual(config,{config:{private:true}});assert.equal(peers[0].name,'Server Fighter');
    peers=[];event({payload:{userId:'spoofed',name:'Forged'}});await tick();assert.equal(peers[0].userId,'fighter-a');
    sub.setTyping('reply-id');await tick();assert.deepEqual(writes[0],{p_room_id:'room',p_typing:true,p_reply_message_id:'reply-id'});
    assert.equal(writes[0].userId,undefined);assert.equal(writes[0].name,undefined);
    pending=true;event({payload:{userId:'spoofed'}});await tick();sub.unsubscribe();peers=[];
    resolveRead({data:[row],error:null});await tick();assert.deepEqual(peers,[]);assert.equal(removed,true);
    console.log('PASS private typing subscription, server-only identity, ignored forged metadata, caller-derived writes and disposed-response isolation');
  } finally {sub.unsubscribe();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
