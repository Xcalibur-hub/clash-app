// Actual assist service + persisted request store, with controlled transport.
const fs=require('node:fs'),Module=require('node:module'),assert=require('node:assert/strict'),babel=require('@babel/core');
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(m,f)=>m._compile(babel.transformSync(fs.readFileSync(f,'utf8'),{filename:f,babelrc:false,configFile:false,presets:['@babel/preset-typescript'],plugins:['@babel/plugin-transform-modules-commonjs']}).code,f);
let account='a',fail=false,calls=[],uploads=0,hold=false,finish;
const memory=new Map(),storage={async getItem(k){return memory.get(k)??null;},async setItem(k,v){memory.set(k,v);},async removeItem(k){memory.delete(k);}};
const assist={id:'id',body:'Private help',status:'ACCEPTED',createdAt:'2026-10-14T00:00:00.123456+00:00',mediaId:'private',mediaPath:'owner/private.png',mediaKind:'image',publishedMessageId:null};
const client={rpc(name,args){calls.push({name,args});return hold?new Promise(r=>finish=()=>r({data:[assist],error:null})):Promise.resolve({data:name==='list_arena_private_assists'?[assist]:null,error:fail?{code:'network',message:'lost response'}:null});},functions:{async invoke(name,args){assert.equal(name,'arena-assist-media-access');assert.deepEqual(args,{body:{assistId:assist.id}});return {data:{url:'https://private.invalid/signed',expiresIn:60},error:null};}}};
const original=Module._load;
Module._load=function(request,parent){
 if(request==='./supabaseClient'&&parent.filename.endsWith('arenaAssistService.ts'))return {currentUserId:async()=>account,requireSupabase:()=>client,requestError:e=>Object.assign(new Error(e.message),{code:e.code}),SupabaseError:class extends Error{constructor(m,c){super(m);this.code=c;}}};
 if(request==='./mediaService'&&parent.filename.endsWith('arenaAssistService.ts'))return {async createUpload(){uploads++;return{id:'copy-'+uploads,bucket:'public-media',path:'copy.png'};},async readPickedBytes(){return new ArrayBuffer(1);},async uploadFile(){},async completeUpload(){},getPublicMediaUrl(){return 'https://public.invalid/copy.png';}};
 if(request==='@react-native-async-storage/async-storage')return{__esModule:true,default:storage};
 return original.apply(this,arguments);
};
global.fetch=async()=>({ok:true,headers:{get:()=> 'image/png'},arrayBuffer:async()=>new ArrayBuffer(1)});
let count=0;const pass=x=>{count++;console.log('PASS '+x);};
async function main(){
 const s=require('../services/arenaAssistService.ts');
 fail=true;await assert.rejects(s.sendPrivateAssist('a','room','A','Hint',null));const first=calls.at(-1);
 fail=false;await s.sendPrivateAssist('a','room','A','Hint',null);assert.equal(calls.at(-1).args.p_request_key,first.args.p_request_key);pass('lost send response retains same persisted assist request key');
 const before=calls.length;account='b';await assert.rejects(s.sendPrivateAssist('a','room','B','Hint',null),{code:'account_changed'});assert.equal(calls.length,before);pass('account switch prevents old-identity RPC');account='a';
 hold=true;const pending=s.listPrivateAssists('a','room');while(!finish)await Promise.resolve();account='b';finish();await assert.rejects(pending,{code:'account_changed'});hold=false;account='a';pass('late private inbox response rejected after account switch');
 assert.equal(s.parsePrivateAssist(assist).createdAt,assist.createdAt);assert.throws(()=>s.parsePrivateAssist({...assist,mediaKind:'unknown'}));pass('strict payload and precise cursor preserved');
 fail=true;await assert.rejects(s.incorporatePrivateAssist('a','room',assist));const key=calls.at(-1).args.p_request_key,mediaId=calls.at(-1).args.p_public_media_id;
 fail=false;await s.incorporatePrivateAssist('a','room',assist);assert.equal(calls.at(-1).args.p_request_key,key);assert.equal(calls.at(-1).args.p_public_media_id,mediaId);assert.equal(uploads,1);pass('lost publish response reuses one copied media object and official key');
 assert.equal(memory.has('assist-public-copy:v1:a:room:id'),false);pass('confirmed publication removes pending media copy cache');
 await s.privateAssistMediaUrl('a',assist);pass('private viewer invokes server signer by assist ID only, with 60-second URL');
 await s.respondPrivateAssist('a','id','REJECTED');assert.equal(calls.at(-1).name,'respond_arena_private_assist');await s.reportPrivateAssist('a','id');assert.equal(calls.at(-1).args.p_reason,'harassment');pass('accept/reject/report actions use server RPCs');
 console.log(`${count}/${count} assist service checks passed; controlled transport, not native verification.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
