// Actual service and Room hook with controlled React/network dependencies.
// These checks do not assert physical-device or live-network behavior.
const fs=require('node:fs'),Module=require('node:module'),babel=require('@babel/core'),assert=require('node:assert/strict');
const React=require('react'),load=Module._load;
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(mod,file)=>mod._compile(babel.transformSync(fs.readFileSync(file,'utf8'),{
 filename:file,babelrc:false,configFile:false,presets:['@babel/preset-typescript'],plugins:['@babel/plugin-transform-modules-commonjs'],
}).code,file);
class ServiceError extends Error { constructor(message,code){super(message);this.code=code;} }
let payload,networkError=null,called;
const client={async rpc(name,args){assert.equal(this,client);called={name,args};return {data:payload,error:networkError};}};
let cells=[],index=0,effects=[],initial=true,authorized=false;
const hooks={...React,useState(value){const i=index++;if(!(i in cells))cells[i]=value;return [cells[i],next=>{cells[i]=typeof next==='function'?next(cells[i]):next;}];},
 useRef(value){const i=index++;if(!(i in cells))cells[i]={current:value};return cells[i];},useMemo:fn=>fn(),useCallback:fn=>fn,
 useEffect(fn){if(initial)effects.push(fn);}};
const room={roomId:'r',roomMode:'DUEL',phase:'closed',status:'SETTLED',duel:{status:'settled'},viewer:null};
const api={async fetchRoom(){return {...room,viewer:authorized?{role:'spectator'}:null};},async fetchOfficialPage(_room,stream){
 if(!authorized)throw new ServiceError('Members only','42501');
 return stream==='message'?[{id:'m',roomId:'r',createdAt:1,preciseCreatedAt:'2026-10-09T01:00:00.123456Z'}]:[];
},async fetchMindshiftStats(){return null;}};
Module._load=function(request,parent){
 if(parent.filename.endsWith('clashEngineService.ts')){
  if(request==='./apiService')return {};
  if(request==='./supabaseClient')return {requireSupabase:()=>client,requestError:e=>new ServiceError(e.message,e.code),SupabaseError:ServiceError};
 }
 if(parent.filename.endsWith('useLiveArenaRoom.ts')){
  if(request==='react')return hooks;
  if(request==='react-native')return {AppState:{addEventListener(){return {remove(){}};}}};
  if(request==='expo-router')return {useFocusEffect(){}};
  if(request==='../services/liveArenaService')return api;
  if(request==='../services/supabaseClient')return {currentUserId:async()=>'account-a'};
  if(request==='../store')return {useClash:()=>({}),showNotice(){}};
  if(request==='../services/officialRequestStore')return {};
 }
 return load.apply(this,arguments);
};
let passed=0;function pass(label){console.log('PASS '+label);passed++;}
(async()=>{
 const {settleClash,fetchClashView}=require('../services/clashEngineService.ts');
 payload={clash_id:'cl',status:'cancelled',jury_size:0};
 assert.equal((await settleClash('cl')).status,'cancelled');
 assert.deepEqual(called,{name:'settle_clash',args:{p_clash_id:'cl'}});pass('bound settlement RPC accepts authoritative cancellation');
 assert.deepEqual(await settleClash('cl'),await settleClash('cl'));pass('cancelled retry is successful without verdict');
 payload={clash_id:'cl',winner_side:'A',side_a_score:1,side_b_score:0,jury_size:1,agreement:1,margin:1,verdict_label:'SPLIT DECISION'};
 const result=await settleClash('cl');assert.equal(result.status,'settled');assert.equal(result.winnerSide,'A');assert.equal(result.verdict.winnerSide,'A');pass('settled result preserves legacy fields and discriminator');
 assert.deepEqual(await settleClash('cl'),result);pass('settled retry returns same outcome');
 payload={clash_id:'cl',status:'cancelled',jury_size:1};await assert.rejects(settleClash('cl'),{code:'bad_payload'});pass('malformed terminal payload rejected');
 payload={clash_id:'foreign',status:'cancelled',jury_size:0};await assert.rejects(settleClash('cl'),{code:'bad_payload'});pass('foreign Clash response rejected');
 networkError={code:'P0006',message:'Not closed'};await assert.rejects(settleClash('cl'),{code:'P0006'});networkError=null;pass('server timing error propagates');
 const snake={clash_id:'cl',winner_side:'A',side_a_score:1,side_b_score:0,jury_size:1,agreement:1,margin:1,verdict_label:'SPLIT DECISION'};
 const view={clashId:'cl',takeId:'take',mode:'STANDARD',status:'settled',revealed:true,isParticipant:false,mayJudge:false,hasJudged:true,myBallot:'A',opensAt:'2026-10-09T00:00:00Z',closesAt:'2026-10-09T00:30:00Z',settledAt:'2026-10-09T00:30:01Z',sideAText:'Source',sideBText:'Counter',sideA:null,sideB:null};
 payload={...view,verdict:snake};assert.equal((await fetchClashView('cl')).verdict.winnerSide,'A');pass('legacy snake-case verdict read remains compatible');
 payload={...view,verdict:result.verdict};assert.equal((await fetchClashView('cl')).verdict.winnerSide,'A');pass('canonical camel-case verdict read remains compatible');
 const {useLiveArenaRoom}=require('../hooks/useLiveArenaRoom.ts');
 const render=()=>{index=0;return useLiveArenaRoom('r',null,()=>{});};
 render();initial=false;
 const initialize=effects.find(fn=>fn.toString().includes("load('initial')"));assert.ok(initialize);initialize();
 await new Promise(resolve=>setImmediate(resolve));
 let state=render();assert.equal(state.room.roomId,'r');assert.equal(state.threadLocked,true);assert.deepEqual(state.messages,[]);assert.deepEqual(state.evidence,[]);pass('nonmember evidence denial preserves readable historical Room and locked entry');
 authorized=true;await state.refresh();state=render();assert.equal(state.threadLocked,false);assert.equal(state.messages[0].id,'m');assert.equal(state.room.viewer.role,'spectator');pass('server-authorized membership refresh unlocks historical transcript');
 console.log(`${passed}/${passed} settlement/history checks passed; controlled dependencies, not native verification.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
