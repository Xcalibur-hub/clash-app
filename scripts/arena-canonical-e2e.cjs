// Disposable-only canonical workflow: never reads app .env or linked project config.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {createClient}=require('@supabase/supabase-js');
const root=path.resolve(process.argv[2]||'');
assert.equal(path.dirname(root),path.resolve('.expo'),'Isolated ignored test root required');
assert.match(path.basename(root),/^(arena31-20261014-(prepared|final)|arena31a-20261014)$/,'Reviewed disposable directory required');
const config=JSON.parse(fs.readFileSync(path.join(root,'compose.json'))),project=path.basename(root)==='arena31a-20261014'?'clash_p11bind_arena31a_20261014':'clash_p11bind_arena31_20261014';
assert.equal(config.name,project);assert.ok(fs.existsSync(root+'/migration-complete.json'));
const url='http://127.0.0.1:57721',key=config.services.storage.environment.ANON_KEY,serviceKey=config.services.storage.environment.SERVICE_KEY;
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,serviceKey,options),users=[],clients=[],results=[];
// Run the actual portable Edge handler over loopback HTTP, with real Auth/RPC/
// Storage upstreams. This verifies its behavior, not the Deno deployment runtime.
const Module=require('node:module'),handlerFile=path.resolve('supabase/functions/arena-assist-media-access/handler.ts');
const handlerModule=new Module(handlerFile,module);
handlerModule._compile(require('@babel/core').transformSync(fs.readFileSync(handlerFile,'utf8'),{filename:handlerFile,babelrc:false,configFile:false,presets:['@babel/preset-typescript'],plugins:['@babel/plugin-transform-modules-commonjs']}).code,handlerFile);
const handler=handlerModule.exports.createAssistMediaHandler({url,anonKey:key,serviceKey});
const signer=require('node:http').createServer(async(req,res)=>{
 try{const chunks=[];for await(const chunk of req){chunks.push(chunk);if(Buffer.concat(chunks).length>1024){res.writeHead(400);res.end();return;}}
 const response=await handler(new Request('http://127.0.0.1/',{method:req.method,headers:req.headers,body:Buffer.concat(chunks)}));
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());}catch{res.writeHead(500);res.end();}
});
let signerUrl;
async function signAssist(client,id){const session=must(await client.auth.getSession()).session;return fetch(signerUrl,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({assistId:id})});}
function must(r){if(r.error)throw new Error((r.error.code||'')+': '+r.error.message);return r.data;}
const rpc=async(c,n,a)=>must(await c.rpc(n,a));
function pass(label){results.push({label,result:'PASS'});console.log('PASS '+label);}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label){for(let i=0;i<150;i++){if(fn())return;await pause(100);}throw new Error('Timeout '+label);}
function sql(q){
 const id=spawnSync('docker',['ps','-aq','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service=db'],{encoding:'utf8',env:cleanEnvironment()}).stdout.trim();assert.ok(/^[a-f0-9]{12,64}$/.test(id));
 const r=spawnSync('docker',['exec','-e','PGPASSWORD',id,'psql','-X','-w','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres','-c',q],{encoding:'utf8',env:{...cleanEnvironment(),PGPASSWORD:config.services.db.environment.POSTGRES_PASSWORD}});if(r.status!==0){fs.writeFileSync(root+'/clock-failure.sanitized.log','PostgreSQL fixture command failed with exit '+r.status);throw new Error('Disposable clock fixture SQL failed; see sanitized evidence');}
}
const cleanEnvironment=()=>Object.fromEntries(['PATH','SystemRoot','WINDIR','SystemDrive','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','ProgramFiles','ProgramData'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const lit=s=>"'"+s.replaceAll("'","''")+"'";
async function verifyAssists(a,b,c,roomId){
 const key=randomUUID(),args={p_room_id:roomId,p_side:'A',p_body:'Private strategic hint',p_media_id:null,p_request_key:key};
 const [sent,sentAgain]=await Promise.all([rpc(c,'send_arena_private_assist',args),rpc(c,'send_arena_private_assist',args)]);assert.equal(sent.id,sentAgain.id);
 assert.equal((await c.rpc('send_arena_private_assist',{...args,p_body:'Altered private hint'})).error?.code,'P0006');
 assert.equal(must(await c.from('arena_private_assists').select('id')).length,0);
 assert.equal((await rpc(b,'list_arena_private_assists',{p_room_id:roomId})).length,0);
 assert.ok((await rpc(a,'list_arena_private_assists',{p_room_id:roomId})).some(x=>x.id===key));
 assert.equal((await b.rpc('respond_arena_private_assist',{p_id:key,p_action:'ACCEPTED'})).error?.code,'42501');
 await rpc(a,'respond_arena_private_assist',{p_id:key,p_action:'ACCEPTED'});
 const publish={p_id:key,p_request_key:randomUUID()},[m1,m2]=await Promise.all([rpc(a,'incorporate_arena_private_assist',publish),rpc(a,'incorporate_arena_private_assist',publish)]);assert.equal(m1.id,m2.id);
 pass('private text assist: recipient-only REST/RPC, concurrent retry, accept and explicit idempotent official publication');
 const rejectKey=randomUUID();await rpc(c,'send_arena_private_assist',{...args,p_request_key:rejectKey,p_side:'B',p_body:'Rejectable private hint'});
 await rpc(b,'respond_arena_private_assist',{p_id:rejectKey,p_action:'REJECTED'});
 assert.equal((await b.rpc('incorporate_arena_private_assist',{p_id:rejectKey,p_request_key:randomUUID()})).error?.code,'42501');pass('selected fighter rejects; rejected assist cannot be published');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=','base64');
 const plan=await rpc(c,'create_media_upload',{p_media_kind:'image',p_mime_type:'image/png',p_visibility:'private'});
 assert.equal(plan.bucket,'private-media');
 must(await c.storage.from(plan.bucket).upload(plan.path,png,{contentType:'image/png',upsert:false}));
 assert.ok((await b.storage.from(plan.bucket).upload(plan.path,png,{contentType:'image/png',upsert:false})).error,'foreign namespace upload denied');
 await rpc(c,'complete_media_upload',{p_media_id:plan.id,p_size_bytes:png.length,p_width:1,p_height:1});
 const imageKey=randomUUID();await rpc(c,'send_arena_private_assist',{...args,p_request_key:imageKey,p_media_id:plan.id,p_body:'Private image evidence'});
 assert.ok((await a.storage.from('private-media').createSignedUrl(plan.path,60)).error,'selected fighter has no direct Storage bypass');
 assert.equal((await signAssist(c,imageKey)).status,403,'sender cannot use recipient signer');
 assert.equal((await signAssist(b,imageKey)).status,403,'other fighter cannot use recipient signer');
 const allowed=await signAssist(a,imageKey);assert.equal(allowed.status,200);const signed=await allowed.json();assert.equal(signed.expiresIn,60);
 assert.ok((await b.storage.from('private-media').createSignedUrl(plan.path,60)).error,'other fighter cannot sign attachment');
 const imageResponse=await fetch(signed.url);assert.equal(imageResponse.status,200);assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()),png);
 await rpc(a,'block_profile',{p_target_id:users[2].profile});assert.equal((await signAssist(a,imageKey)).status,403);await rpc(a,'unblock_profile',{p_target_id:users[2].profile});
 pass('real private PNG: server signer recipient-only, direct Storage denied, block revokes signing, exact bytes retrieved');
 await rpc(a,'respond_arena_private_assist',{p_id:imageKey,p_action:'ACCEPTED'});
 const copy=await rpc(a,'create_media_upload',{p_media_kind:'image',p_mime_type:'image/png',p_visibility:'public'});
 must(await a.storage.from(copy.bucket).upload(copy.path,png,{contentType:'image/png',upsert:false}));await rpc(a,'complete_media_upload',{p_media_id:copy.id,p_size_bytes:png.length});
 const pubUrl=a.storage.from(copy.bucket).getPublicUrl(copy.path).data.publicUrl;
 await rpc(a,'incorporate_arena_private_assist',{p_id:imageKey,p_request_key:randomUUID(),p_public_media_id:copy.id,p_public_media_url:pubUrl});
 assert.deepEqual(Buffer.from(await (await fetch(pubUrl)).arrayBuffer()),png);
 const original=must(await admin.from('media_objects').select('owner_id,visibility').eq('id',plan.id).single());assert.equal(original.owner_id,users[2].profile);assert.equal(original.visibility,'private');
 pass('explicit accepted image publication uses a fighter-owned public copy; private original owner/visibility unchanged');
 const videoPath=root+'/flower.mp4';assert.ok(fs.existsSync(videoPath),'Real video fixture required');const video=fs.readFileSync(videoPath);
 const vp=await rpc(a,'create_media_upload',{p_media_kind:'video',p_mime_type:'video/mp4',p_visibility:'public'});
 must(await a.storage.from(vp.bucket).upload(vp.path,video,{contentType:'video/mp4',upsert:false}));await rpc(a,'complete_media_upload',{p_media_id:vp.id,p_size_bytes:video.length});
 const videoUrl=a.storage.from(vp.bucket).getPublicUrl(vp.path).data.publicUrl;
 await rpc(a,'submit_arena_official',{p_room_id:roomId,p_operation:'message',p_request_key:randomUUID(),p_payload:{body:'Video argument',mediaObjectId:vp.id,mediaUrl:videoUrl}});
 assert.deepEqual(Buffer.from(await (await fetch(videoUrl)).arrayBuffer()),video);
 pass('real MP4 upload/completion/official submission and byte-identical HTTP retrieval; native playback not asserted');
}
async function verifyVerdict(a,c,roomId,clashId){
 // Controlled clock fixtures ONLY inside this wholly disposable database; engine unchanged.
 sql(`begin;update public.clashes set opens_at=now()-interval '1 hour',closes_at=now()+interval '5 minutes' where id=${lit(clashId)};update public.arena_rooms set opens_at=now()-interval '1 hour',closes_at=now()+interval '5 minutes' where id=${lit(roomId)};update public.arena_daily_topics set opens_at=now()-interval '1 hour',final_arguments_at=now()-interval '30 minutes',judging_at=now()-interval '1 minute',closes_at=now()+interval '5 minutes' where id=(select topic_id from public.arena_rooms where id=${lit(roomId)});commit;`);
 assert.equal((await a.rpc('submit_judgement',{p_clash_id:clashId,p_side:'B'})).error?.code,'P0005');
 await rpc(c,'submit_judgement',{p_clash_id:clashId,p_side:'A'});pass('judging opens by server-controlled test clock; spectator casts actual judgement');
 sql(`begin;update public.clashes set closes_at=now()-interval '1 second' where id=${lit(clashId)};update public.arena_rooms set closes_at=now()-interval '1 second' where id=${lit(roomId)};update public.arena_daily_topics set closes_at=now()-interval '1 second' where id=(select topic_id from public.arena_rooms where id=${lit(roomId)});commit;`);
 const [settled,settledAgain]=await Promise.all([rpc(c,'settle_clash',{p_clash_id:clashId}),rpc(a,'settle_clash',{p_clash_id:clashId})]);assert.deepEqual(settled,settledAgain);assert.equal(settled.winner_side,'A');
 assert.equal(must(await admin.from('verdicts').select('clash_id').eq('clash_id',clashId)).length,1);pass('concurrent settlement returns one authoritative verdict');
 assert.equal((await c.rpc('post_arena_crowd_message',{p_room_id:roomId,p_body:'After close',p_request_key:randomUUID()})).error?.code,'P0003');pass('closed Crowd rejects new writes');
}
async function main(){
 await new Promise(resolve=>signer.listen(0,'127.0.0.1',resolve));signerUrl='http://127.0.0.1:'+signer.address().port;
 for(let i=0;i<3;i++){
  const existing=fs.existsSync(root+'/accounts.private.json')?JSON.parse(fs.readFileSync(root+'/accounts.private.json')):null;
  const u=existing?.[i]??{email:'arena31-'+randomUUID()+'@example.test',password:'Arena31-'+randomUUID()};
  if(!u.id)u.id=must(await admin.auth.admin.createUser({email:u.email,password:u.password,email_confirm:true})).user.id;
  u.profile=must(await admin.from('profiles').select('id').eq('auth_user_id',u.id).single()).id;
  const c=createClient(url,key,options);const session=must(await c.auth.signInWithPassword({email:u.email,password:u.password})).session;
  await c.realtime.setAuth(session.access_token);users.push(u);clients.push(c);
 }
 const [a,b,c]=clients;
 if(process.argv[3]==='--resume-verdict'){const context=JSON.parse(fs.readFileSync(root+'/canonical-context.private.json'));return verifyVerdict(a,c,context.roomId,context.clashId);}
 fs.writeFileSync(root+'/accounts.private.json',JSON.stringify(users),{mode:0o600});
 pass('three disposable authenticated accounts');
 const take=await rpc(a,'create_take',{p_hood:'techtakes',p_text:'A canonical argument needs independently checked evidence. Case '+randomUUID().slice(0,8)});const takeId=take[0].id;
 const ch=await rpc(b,'create_arena_challenge',{p_take_id:takeId,p_counter_position:'Evidence is strongest when multiple independent sources agree.'});assert.equal(ch.status,'PENDING');pass('A creates Take and B challenges through authenticated RPCs');
 assert.equal((await b.rpc('resolve_arena_challenge',{p_challenge_id:ch.id,p_action:'ACCEPT'})).error?.code,'42501');
 const [accepted,retry]=await Promise.all([rpc(a,'resolve_arena_challenge',{p_challenge_id:ch.id,p_action:'ACCEPT'}),rpc(a,'resolve_arena_challenge',{p_challenge_id:ch.id,p_action:'ACCEPT'})]);
 assert.equal(accepted.status,'ACCEPTED');assert.equal(retry.roomId,accepted.roomId);assert.equal(retry.clashId,accepted.clashId);
 const roomId=accepted.roomId,clashId=accepted.clashId;
 assert.equal(must(await admin.from('clashes').select('id').eq('take_id',takeId)).length,1);
 assert.equal(must(await admin.from('arena_rooms').select('id').eq('clash_id',clashId)).length,1);
 const fighters=must(await admin.from('arena_room_participants').select('profile_id,role').eq('room_id',roomId).eq('role','debater'));
 assert.deepEqual(fighters.map(x=>x.profile_id).sort(),users.slice(0,2).map(x=>x.profile).sort());pass('concurrent author acceptance is idempotent; exactly one canonical Clash/Room and two fighters');
 const request={p_room_id:roomId,p_operation:'message',p_payload:{body:'Fighter A official argument'},p_request_key:randomUUID()};
 const [m1,m2]=await Promise.all([rpc(a,'submit_arena_official',request),rpc(a,'submit_arena_official',request)]);assert.equal(m1.id,m2.id);
 assert.equal((await a.rpc('submit_arena_official',{...request,p_payload:{body:'Altered same key'}})).error?.code,'P0006');
 await rpc(b,'post_arena_room_message',{p_room_id:roomId,p_body:'Fighter B official argument'});pass('both fighters publish; concurrent same-key retry deduplicated and altered payload denied');
 assert.equal((await c.rpc('post_arena_room_message',{p_room_id:roomId,p_body:'Forged fighter'})).error?.code,'42501');
 await rpc(c,'watch_arena_room',{p_room_id:roomId});
 assert.equal((await c.rpc('post_arena_room_message',{p_room_id:roomId,p_body:'Forged after joining'})).error?.code,'42501');pass('spectator joins; official arguments denied before and after membership');
 let seen=new Set(),ready=false;
 const channel=c.channel('arena31-'+randomUUID()).on('postgres_changes',{event:'INSERT',schema:'public',table:'arena_crowd_messages',filter:'room_id=eq.'+roomId},e=>seen.add(e.new.id)).on('system',{},e=>{if(e.status==='ok')ready=true;}).subscribe();
 await wait(()=>ready,'spectator Realtime subscription');
 const msg=await rpc(c,'post_arena_crowd_message',{p_room_id:roomId,p_body:'Spectator Crowd message',p_request_key:randomUUID()});await wait(()=>seen.has(msg.id),'Crowd delivery');
 await c.removeChannel(channel);
 const gap=await rpc(c,'post_arena_crowd_message',{p_room_id:roomId,p_body:'Crowd message during disconnect',p_request_key:randomUUID()});
 const page=await rpc(c,'list_arena_crowd_messages',{p_room_id:roomId,p_cursor_at:msg.createdAt,p_cursor_id:msg.id,p_direction:'newer'});assert.ok(page.some(x=>x.id===gap.id));pass('actual Crowd WebSocket delivery and disconnected gap recovery');
 const discovered=await rpc(c,'list_arena_clash_discovery',{});assert.ok(discovered.some(x=>x.roomId===roomId&&x.state==='LIVE'));pass('canonical Room appears in server Live discovery');
 fs.writeFileSync(root+'/canonical-context.private.json',JSON.stringify({takeId,roomId,clashId,users:users.map(x=>({id:x.id,profile:x.profile}))}));
 await verifyAssists(a,b,c,roomId);
 await verifyVerdict(a,c,roomId,clashId);
}
main().catch(e=>{results.push({result:'FAIL',failure:e.message});console.error(e.message);process.exitCode=1;}).finally(async()=>{signer.close();for(const c of clients){await c.removeAllChannels();await c.auth.signOut();}fs.writeFileSync(root+(process.argv[3]==='--resume-verdict'?'/verdict-resume-results.json':'/canonical-results.json'),JSON.stringify({results,real_auth:true,target:url},null,2));});
