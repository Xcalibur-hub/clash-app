/* LOCAL ONLY: real Auth, PostgREST and WebSocket sessions. No production seeds.
 * --keep-for-device leaves disposable local accounts for an Android check.
 * --device-listen / --device-send reuse them; --cleanup removes the fixtures.
 */
const { createClient } = require('@supabase/supabase-js');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const status = JSON.parse(execFileSync('supabase.exe',['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
const url = status.API_URL;
assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'This check must only access local Supabase');
const key = status.ANON_KEY; const admin = createClient(url,status.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const fixturePath = path.join(__dirname,'..','.crowd-runtime.json');
const must = result => { if(result.error) throw new Error(`${result.error.code || ''}: ${result.error.message}`); return result.data; };
const rpc = async (client,name,args) => must(await client.rpc(name,args));
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
const waitFor = async (fn,label) => { for(let i=0;i<300;i++){ if(fn())return; await pause(100); } throw new Error(`Timeout: ${label}`); };
async function login(user) {
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const data=must(await client.auth.signInWithPassword({email:user.email,password:user.password}));
  await client.realtime.setAuth(data.session.access_token); return client;
}
async function cleanup(f) {
  if(f.takeId) must(await admin.from('takes').delete().eq('id',f.takeId));
  if(f.topicId) must(await admin.from('arena_daily_topics').delete().eq('id',f.topicId));
  for(const u of f.users ?? []) { await admin.from('rate_limit_events').delete().eq('actor_id',u.profileId); if(u.profileId)must(await admin.from('profiles').delete().eq('id',u.profileId)); must(await admin.auth.admin.deleteUser(u.id)); }
  if(fs.existsSync(fixturePath)) fs.unlinkSync(fixturePath);
}
async function main() {
  const mode=process.argv[2]; const clients=[]; let f;
  if(mode==='--cleanup') { if(fs.existsSync(fixturePath)) await cleanup(JSON.parse(fs.readFileSync(fixturePath,'utf8'))); console.log('PASS local fixtures cleaned'); return; }
  if(mode==='--device-listen' || mode==='--device-send') {
    f=JSON.parse(fs.readFileSync(fixturePath,'utf8')); const client=await login(f.users[3]);
    try {
      if(mode==='--device-send') { await rpc(client,'post_arena_crowd_message',{p_room_id:f.roomId,p_body:'[LOCAL TEST] Authenticated client to Android',p_request_key:randomUUID()}); console.log('PASS authenticated client sent Android test message'); return; }
      const expected=process.argv[3] || 'Physical Android Crowd check';
      let received=false;
      const channel=client.channel(`device-${randomUUID()}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'arena_crowd_messages',filter:`room_id=eq.${f.roomId}`},event=>{
        if(event.new.body===expected) { received=true; console.log('PASS physical Android send received by second authenticated session'); }
      }).subscribe();
      await waitFor(()=>channel.state==='joined','device listener subscribed'); console.log('READY Android listener');
      for(let i=0;i<600 && !received;i++) await pause(100);
      assert.ok(received,'Android message not received');
      const page=await rpc(client,'list_arena_crowd_messages',{p_room_id:f.roomId});
      assert.ok(page.some(m=>m.body===expected),'Android message not persisted');
    } finally { await client.removeAllChannels(); await client.auth.signOut(); }
    return;
  }
  assert.ok(!fs.existsSync(fixturePath),'Clean prior local Crowd fixtures first');
  f={users:[]};
  try {
    const run=randomUUID().slice(0,8);
    for(let i=0;i<5;i++) {
      const user={email:`crowd-${run}-${i}@example.test`,password:`Crowd-${randomUUID()}`};
      const created=must(await admin.auth.admin.createUser({...user,email_confirm:true})); user.id=created.user.id;
      f.users.push(user);
      user.profileId=must(await admin.from('profiles').select('id').eq('auth_user_id',user.id).single()).id;
      must(await admin.from('profiles').update({name:`LOCAL Crowd Test ${i}`}).eq('id',user.profileId));
    }
    f.takeId=`crowd-local-${run}`;
    must(await admin.from('takes').insert({id:f.takeId,author_id:f.users[0].profileId,hood:'techtakes',text:'[LOCAL TEST] Crowd runtime validation — removed after testing'}));
    const duel=await rpc(admin,'create_arena_duel',{p_take_id:f.takeId,p_fighter_b_id:f.users[1].profileId,p_request_key:randomUUID()});
    f.roomId=duel.roomId; f.topicId=must(await admin.from('arena_rooms').select('topic_id').eq('id',f.roomId).single()).topic_id;
    for(const u of f.users) clients.push(await login(u));
    await rpc(clients[0],'post_arena_room_message',{p_room_id:f.roomId,p_body:'[LOCAL TEST] Official argument remains on the Stage.'});
    for(const i of [2,3]) await rpc(clients[i],'watch_arena_room',{p_room_id:f.roomId});
    const typingSeen=[0,0]; const typingJoined=[false,false]; const typingChannels=[];
    for(const [index,who] of [0,2].entries()) {
      const channel=clients[who].channel(`arena-typing:${f.roomId}`,{config:{private:true}})
        .on('broadcast',{event:'typing'},()=>{typingSeen[index]++;})
        .subscribe(state=>{typingJoined[index]=state==='SUBSCRIBED';});
      typingChannels.push(channel);
    }
    await waitFor(()=>typingJoined.every(Boolean),'private typing members authorized');
    let outsiderDenied=false;
    clients[4].channel(`arena-typing:${f.roomId}`,{config:{private:true}})
      .on('broadcast',{event:'typing'},()=>{throw new Error('Private typing hint reached outsider');})
      .subscribe(state=>{if(state==='CHANNEL_ERROR')outsiderDenied=true;});
    await waitFor(()=>outsiderDenied,'outsider private channel rejected');
    const anonymous=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(anonymous);
    let guestDenied=false;
    anonymous.channel(`arena-typing:${f.roomId}`,{config:{private:true}}).on('broadcast',{event:'typing'},()=>{
      throw new Error('Private typing hint reached anonymous session');
    }).subscribe(state=>{if(state==='CHANNEL_ERROR')guestDenied=true;});
    await waitFor(()=>guestDenied,'anonymous private channel rejected');
    const publicGuest=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(publicGuest);
    let publicJoined=false;
    const publicChannel=publicGuest.channel(`arena-typing:${f.roomId}`).subscribe(state=>{publicJoined=state==='SUBSCRIBED';});
    await waitFor(()=>publicJoined,'public adversarial topic ready');
    const beforePublicSpoof=typingSeen[0];
    await publicChannel.send({type:'broadcast',event:'typing',payload:{userId:f.users[1].profileId,name:'Public spoof'}});
    await pause(500);assert.equal(typingSeen[0],beforePublicSpoof,'public topic must not inject private events');
    await rpc(clients[0],'set_arena_room_typing',{p_room_id:f.roomId,p_typing:true});
    await waitFor(()=>typingSeen.every(n=>n>0),'server typing broadcast reaches both members');
    const genuine=await rpc(clients[2],'get_arena_room_typing',{p_room_id:f.roomId});
    assert.equal(genuine[0].userId,f.users[0].profileId);
    assert.equal((await clients[2].rpc('set_arena_room_typing',{p_room_id:f.roomId,p_typing:true})).error?.code,'42501');
    assert.equal((await clients[4].rpc('get_arena_room_typing',{p_room_id:f.roomId})).error?.code,'42501');
    const beforeSpoof=typingSeen[0];
    await typingChannels[1].send({type:'broadcast',event:'typing',payload:{userId:f.users[1].profileId,name:'Spoofed'}});
    await pause(500); assert.equal(typingSeen[0],beforeSpoof,'client private broadcast must not reach members');
    await rpc(clients[0],'set_arena_room_typing',{p_room_id:f.roomId,p_typing:false});
    assert.equal((await rpc(clients[2],'get_arena_room_typing',{p_room_id:f.roomId})).length,0);
    console.log('PASS private typing two-session delivery, outsider/anonymous denial, public-topic isolation, server identity, spectator authorization and spoofed broadcast denial');
    const seen=[new Set(),new Set(),new Set()];
    const subscribed=[false,false,false]; const databaseReady=[false,false,false];
    for(const [index,who] of [2,3,4].entries()) clients[who].channel(`crowd-check-${index}-${run}`).on('postgres_changes',{
      event:'INSERT',schema:'public',table:'arena_crowd_messages',filter:`room_id=eq.${f.roomId}`,
    },event=>seen[index].add(event.new.id)).on('system',{},event=>{ databaseReady[index]=event.status==='ok'; if(event.status==='error') console.log(`Realtime ${index}: ${event.message}`); }).subscribe(state=>{subscribed[index]=state==='SUBSCRIBED';});
    await waitFor(()=>subscribed.every(Boolean)&&databaseReady.every(Boolean),'three authorized/outsider database subscriptions');
    const first=await rpc(clients[2],'post_arena_crowd_message',{p_room_id:f.roomId,p_body:'[LOCAL TEST] Session one says hello',p_request_key:randomUUID()});
    await waitFor(()=>seen[0].has(first.id)&&seen[1].has(first.id),'both sessions receive first message');
    console.log('PASS session 1 -> both authenticated Realtime clients');
    const second=await rpc(clients[3],'post_arena_crowd_message',{p_room_id:f.roomId,p_body:'[LOCAL TEST] Session two replies',p_request_key:randomUUID()});
    await waitFor(()=>seen[0].has(second.id)&&seen[1].has(second.id),'both sessions receive reply');
    console.log('PASS session 2 -> both authenticated Realtime clients');
    await pause(500); assert.equal(seen[2].size,0); console.log('PASS nonmember receives no Crowd events');
    const forged=await clients[2].rpc('post_arena_room_message',{p_room_id:f.roomId,p_body:'Unauthorized official argument'});
    assert.equal(forged.error?.code,'42501'); console.log('PASS spectator cannot publish official argument');
    await clients[3].removeAllChannels();
    const missed=await rpc(clients[2],'post_arena_crowd_message',{p_room_id:f.roomId,p_body:'[LOCAL TEST] Sent during disconnect',p_request_key:randomUUID()});
    const recovered=await rpc(clients[3],'list_arena_crowd_messages',{p_room_id:f.roomId,p_cursor_at:second.createdAt,p_cursor_id:second.id,p_direction:'newer'});
    assert.ok(recovered.some(m=>m.id===missed.id)); console.log('PASS disconnected session recovers missed message via gap cursor');
    let reconnect=false; let reconnected=false; clients[3].channel(`crowd-reconnect-${run}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'arena_crowd_messages',filter:`room_id=eq.${f.roomId}`},event=>{if(event.new.body==='[LOCAL TEST] Reconnected')reconnect=true;}).on('system',{},event=>{reconnected=event.status==='ok';}).subscribe();
    await waitFor(()=>reconnected,'reconnected database subscription');
    await rpc(clients[2],'post_arena_crowd_message',{p_room_id:f.roomId,p_body:'[LOCAL TEST] Reconnected',p_request_key:randomUUID()});
    await waitFor(()=>reconnect,'Realtime after reconnect'); console.log('PASS reconnect receives subsequent live event');
    await rpc(clients[3],'mute_profile',{p_target_id:f.users[2].profileId});
    const filtered=await rpc(clients[3],'get_arena_crowd_messages',{p_room_id:f.roomId,p_ids:[first.id,second.id]});
    assert.deepEqual(filtered.map(m=>m.id),[second.id]); console.log('PASS mute removes already-loaded sender content');
    await rpc(clients[3],'unmute_profile',{p_target_id:f.users[2].profileId});
    assert.equal((await rpc(clients[2],'get_arena_crowd',{p_room_id:f.roomId})).spectatorCount,2); console.log('PASS server count reflects two joined spectators');
    if(mode!=='--keep-for-device') {
      await clients[2].removeAllChannels();await clients[2].auth.signOut();
      must(await clients[2].auth.signInWithPassword({email:f.users[4].email,password:f.users[4].password}));
      assert.equal((await rpc(clients[2],'get_my_profile'))[0].id,f.users[4].profileId);
      assert.equal((await clients[2].rpc('get_arena_crowd',{p_room_id:f.roomId})).error?.code,'42501');
      assert.equal((await clients[2].rpc('get_arena_room_typing',{p_room_id:f.roomId})).error?.code,'42501');
      console.log('PASS same-client account switch loses previous Room/Crowd/typing authorization');
      must(await admin.from('takes').update({status:'removed'}).eq('id',f.takeId));
      assert.equal(must(await clients[3].from('takes').select('id').eq('id',f.takeId)).length,0);
      assert.equal(await rpc(clients[3],'clash_view',{p_clash_id:duel.clashId}),null);
      assert.equal((await clients[3].rpc('get_arena_room',{p_room_id:f.roomId})).error?.code,'42501');
      assert.equal((await clients[3].rpc('list_arena_room_messages',{p_room_id:f.roomId})).error?.code,'42501');
      assert.equal((await clients[3].rpc('get_arena_crowd',{p_room_id:f.roomId})).error?.code,'42501');
      console.log('PASS removed source denied through direct REST, legacy Clash, Room, official transcript and Crowd RPCs');
    }
    if(mode==='--keep-for-device') { fs.writeFileSync(fixturePath,JSON.stringify(f)); console.log(`DEVICE_ROOM ${f.roomId}`); }
  } finally {
    for(const client of clients) { await client.removeAllChannels(); await client.auth.signOut(); }
    if(mode!=='--keep-for-device' || !fs.existsSync(fixturePath)) await cleanup(f);
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
