const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const { SupabaseClient } = require('@supabase/supabase-js');
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; }
function clock() {
  let now=10000, id=0;
  const timers=new Map();
  const add=(fn,ms,repeat=false)=>{const key=++id;timers.set(key,{fn,at:now+ms,ms,repeat});return key;};
  return { env: { Date:{now:()=>now},setTimeout:(f,m)=>add(f,m),setInterval:(f,m)=>add(f,m,true),
    clearTimeout:key=>timers.delete(key),clearInterval:key=>timers.delete(key),queueMicrotask },
    async advance(ms) {
      const end=now+ms;
      for(let n=0;n<1000;n++) {
        const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!due)break;
        const [key,v]=due; now=v.at; timers.delete(key);
        if(v.repeat)timers.set(key,{...v,at:now+v.ms});
        v.fn(); await flush();
      }
      now=end; await flush();
    }, get size(){return timers.size;},
  };
}
function load(file,dependencies,env) {
  const {code}=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,
    presets:['@babel/preset-typescript'],plugins:['@babel/plugin-transform-modules-commonjs']});
  const exports={};
  vm.runInNewContext(code,{exports,require(name){assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name];},...env});
  return exports;
}
function harness(t) {
  const time=clock(), events=[], calls=[], channels=[];
  let user='fictional-a', auth, removed=0;
  let read=async()=>({typing:false,validForMs:0}), write=async()=>null;
  const core=load('utils/meetTyping.ts',{},time.env);
  const rest={async rpc(name,args){
    assert.equal(this,rest,'installed SDK receiver preserved');calls.push({name,args});
    try {return {data:await (name==='get_meet_typing'?read():write(args.p_typing)),error:null};}
    catch(error){return {data:null,error:{code:error.code||'offline'}};}
  }};
  const client={rpc:SupabaseClient.prototype.rpc,rest,
    auth:{onAuthStateChange(callback){auth=callback;return {data:{subscription:{unsubscribe(){auth=undefined;}}}};}},
    channel(topic,options){
      const handlers={}; let status;
      const c={topic,options,handlers,on(type,filter,callback){handlers[type]=callback;return c;},
        subscribe(callback){status=callback;return c;},status(value){status(value);},
        track(){throw Error('Client Presence must never publish');},presenceState(){throw Error('Presence must never be read');}};
      channels.push(c);return c;
    },async removeChannel(){removed++;return 'ok';},
  };
  const service=load('services/meetTypingService.ts',{'./supabaseClient':{requireSupabase:()=>client},'../utils/meetTyping':core},time.env);
  const sub=service.subscribeMeetTyping('fictional-room',value=>events.push(value));
  t.after(()=>sub.unsubscribe());
  return {sub,time,events,calls,channels, get removed(){return removed;},
    setRead(fn){read=fn;},setWrite(fn){write=fn;},
    async auth(id=user){user=id;auth?.('INITIAL_SESSION',id?{user:{id}}:null);await flush();},
    async connected(){channels[0].status('SUBSCRIBED');await flush();},
    async hint(payload={}){channels[0].handlers.broadcast(payload);await flush();},
    get reads(){return calls.filter(x=>x.name==='get_meet_typing');},
    get writes(){return calls.filter(x=>x.name==='set_meet_typing').map(x=>x.args.p_typing);},
  };
}
test('private broadcast only; no Presence key, track, or auto-publish on join',async t=>{
  const h=harness(t);await h.auth();await h.connected();
  assert.equal(h.channels[0].options.config.private,true);assert.equal(h.channels[0].topic,'meet-typing:fictional-room');
  assert.equal(h.channels[0].options.config.presence,undefined);assert.equal(h.channels[0].handlers.presence,undefined);
  assert.deepEqual(h.writes,[]);
  // Immediate authoritative read on start, plus refresh on first SUBSCRIBED.
  assert.equal(h.reads.length,2);
});
test('two peers sharing a legacy key cannot corrupt server-derived peer detection',async t=>{
  const h=harness(t);h.setRead(async()=>({typing:true,validForMs:5000}));await h.auth();await h.connected();
  await h.hint({presence:{typing:[{userId:'spoofed'},{userId:'self'}]},typing:false});
  assert.equal(h.events.at(-1),true);assert.equal(h.reads.length,3);
});
test('forged broadcast data never becomes typing without an authorized read',async t=>{
  const h=harness(t);await h.auth();await h.connected();await h.hint({typing:true,validForMs:999999,userId:'peer'});
  assert.equal(h.events.at(-1),false);
});
for(const code of ['42501','P0002','P0003','PGRST202'])test(`denied/unavailable RPC ${code} fails closed without retrying publication`,async t=>{
  const h=harness(t);h.setRead(async()=>{throw {code};});await h.auth();await h.connected();
  h.sub.broadcast();await h.time.advance(20000);assert.equal(h.events.at(-1),false);
  assert.equal(h.reads.length,1);assert.ok(h.writes.every(x=>x===false));
});
test('A writer publishes set_meet_typing before Realtime SUBSCRIBED (B→A path independent)',async t=>{
  const h=harness(t);await h.auth();
  assert.equal(h.channels.length,1);assert.equal(h.writes.length,0);
  h.sub.broadcast();await flush();
  assert.deepEqual(h.writes,[true]);
});
test('B→A peer indicator appears via authoritative poll without SUBSCRIBED',async t=>{
  const h=harness(t);h.setRead(async()=>({typing:true,validForMs:5000}));await h.auth();
  assert.equal(h.events.at(-1),true);
  assert.ok(h.reads.length>=1);
});
test('A→B idle clear still enqueues false after three seconds without channel',async t=>{
  const h=harness(t);await h.auth();h.sub.broadcast();await flush();
  assert.deepEqual(h.writes,[true]);await h.time.advance(3001);assert.deepEqual(h.writes,[true,false]);
});
test('signed-out initial scope never subscribes or invokes RPCs',async t=>{
  const h=harness(t);await h.auth(null);h.sub.broadcast();await flush();
  assert.equal(h.channels.length,0);assert.equal(h.calls.length,0);
});
test('account switch invalidates a pending read and removes the channel',async t=>{
  const h=harness(t),d=deferred();h.setRead(()=>d.promise);await h.auth();await h.connected();
  await h.auth('fictional-b');const n=h.events.length;d.resolve({typing:true,validForMs:6000});await flush();
  assert.ok(h.events.slice(n).every(x=>!x));assert.equal(h.events.at(-1),false);assert.equal(h.removed,1);
});
test('token refresh for the same account preserves the scope',async t=>{
  const h=harness(t);await h.auth();await h.connected();await h.auth('fictional-a');h.sub.broadcast();await flush();
  assert.deepEqual(h.writes,[true]);assert.equal(h.removed,0);
});
test('account switch cannot send a queued clear as the next actor',async t=>{
  const h=harness(t),d=deferred();h.setWrite(()=>d.promise);await h.auth();await h.connected();
  h.sub.broadcast();await flush();await h.auth('fictional-b');d.resolve(null);await flush();
  assert.deepEqual(h.writes,[true]);
});
test('disconnect immediately hides, clears and rejects a late positive read',async t=>{
  const h=harness(t),d=deferred();h.setRead(()=>d.promise);await h.auth();await h.connected();
  h.channels[0].status('CHANNEL_ERROR');d.resolve({typing:true,validForMs:6000});await flush();
  assert.equal(h.events.at(-1),false);assert.ok(h.writes.includes(false));
});
test('reconnect and periodic reconciliation recover a missed hint',async t=>{
  const h=harness(t);await h.auth();await h.connected();h.channels[0].status('CLOSED');
  h.setRead(async()=>({typing:true,validForMs:5000}));await h.connected();assert.equal(h.events.at(-1),true);
  h.setRead(async()=>({typing:false,validForMs:0}));await h.time.advance(4000);assert.equal(h.events.at(-1),false);
});
test('channel error still reconciles peer typing on the next poll (teardown-safe)',async t=>{
  const h=harness(t);await h.auth();await h.connected();
  h.channels[0].status('CHANNEL_ERROR');await flush();assert.equal(h.events.at(-1),false);
  h.setRead(async()=>({typing:true,validForMs:4500}));await h.time.advance(4000);
  assert.equal(h.events.at(-1),true);
});
test('peer server TTL expires while a subsequent network read is hung',async t=>{
  const h=harness(t);h.setRead(async()=>({typing:true,validForMs:5000}));await h.auth();await h.connected();
  h.setRead(()=>new Promise(()=>{}));await h.time.advance(5001);assert.equal(h.events.at(-1),false);
});
test('server lease shorter than typing TTL wins',async t=>{
  const h=harness(t);h.setRead(async()=>({typing:true,validForMs:300}));await h.auth();await h.connected();
  await h.time.advance(301);assert.equal(h.events.at(-1),false);
});
for(const row of [{typing:true,validForMs:9000},{typing:true,validForMs:-1},{typing:'true',validForMs:3},null])
test(`malformed/forged authoritative row ${JSON.stringify(row)} is hidden`,async t=>{
  const h=harness(t);h.setRead(async()=>row);await h.auth();await h.connected();assert.equal(h.events.at(-1),false);
});
test('keypress bursts throttle writes, then clear on idle',async t=>{
  const h=harness(t);await h.auth();await h.connected();for(let n=0;n<100;n++)h.sub.broadcast();await flush();
  assert.deepEqual(h.writes,[true]);await h.time.advance(3001);assert.deepEqual(h.writes,[true,false]);
});
test('clear is ordered after an unresolved publish, with a bounded pending slot',async t=>{
  const h=harness(t),d=deferred();h.setWrite(value=>value?d.promise:Promise.resolve());await h.auth();await h.connected();
  h.sub.broadcast();await flush();for(let n=0;n<100;n++)h.sub.clear();assert.deepEqual(h.writes,[true]);
  d.resolve();await flush();assert.deepEqual(h.writes,[true,false]);
});
test('clearing our composer does not hide genuine peer typing',async t=>{
  const h=harness(t);h.setRead(async()=>({typing:true,validForMs:5000}));await h.auth();await h.connected();
  h.sub.clear();await flush();assert.equal(h.events.at(-1),true);assert.deepEqual(h.writes,[false]);
});
test('unmount/Leave stops timers and hides; late events never dispatch',async t=>{
  const h=harness(t);await h.auth();await h.connected();h.sub.unsubscribe();await flush();
  const calls=h.calls.length;await h.hint({typing:true});await h.time.advance(30000);h.sub.broadcast();
  assert.equal(h.calls.length,calls);assert.equal(h.time.size,0);assert.equal(h.removed,1);assert.equal(h.events.at(-1),false);
});
test('unmount followed by an account switch cannot dispatch an old queued write',async t=>{
  const h=harness(t),d=deferred();h.setWrite(()=>d.promise);await h.auth();await h.connected();
  h.sub.broadcast();await flush();h.sub.clear();h.sub.unsubscribe();await h.auth('fictional-b');
  d.resolve();await flush();assert.deepEqual(h.writes,[true]);assert.equal(h.events.at(-1),false);
});
test('network read failure hides; bounded polling recovers without replaying writes',async t=>{
  const h=harness(t);h.setRead(async()=>{throw Error('offline');});await h.auth();await h.connected();
  h.setRead(async()=>({typing:true,validForMs:1000}));await h.time.advance(4000);
  assert.equal(h.events.at(-1),true);assert.deepEqual(h.writes,[]);
});
test('read transport is never overlapped by rapid broadcast hints',async t=>{
  const h=harness(t),d=deferred();h.setRead(()=>d.promise);await h.auth();await h.connected();
  for(let n=0;n<100;n++)await h.hint();assert.equal(h.reads.length,1);d.resolve({typing:false,validForMs:0});await flush();
});
test('a delayed read cannot restart a typing TTL that expired in transit',async t=>{
  const h=harness(t),d=deferred();h.setRead(()=>d.promise);await h.auth();await h.connected();
  await h.time.advance(15000);d.resolve({typing:true,validForMs:6000});await flush();
  assert.equal(h.events.at(-1),false);
});
test('failed publish is not replayed automatically',async t=>{
  const h=harness(t);h.setWrite(async()=>{throw Error('lost response');});await h.auth();await h.connected();
  h.sub.broadcast();await flush();await h.time.advance(12000);
  assert.equal(h.writes.filter(Boolean).length,1);assert.equal(h.events.at(-1),false);
});
test('hook wiring clears terminal/background/expired scopes; no resume fake typing (static)',()=>{
  const s=fs.readFileSync('hooks/useMeetChat.ts','utf8');
  assert.match(s,/typingRef\.current\?\.unsubscribe\(\)/);assert.match(s,/!ready \|\| terminal \|\| paused/);
  assert.match(s,/typingLeaseAlive/);assert.match(s,/typingLease > Date\.now\(\)/);
  assert.match(s,/Math\.max\(0, typingLease - Date\.now\(\)\)/);
  assert.doesNotMatch(s,/else typingRef\.current\?\.broadcast\(\)/);
  // Lease extensions must not be effect deps that recreate the channel.
  assert.doesNotMatch(s,/}, \[paused, ready, sessionId, terminal, typingLease\]\)/);
});
test('draft SQL admission, restrictive namespace and lexical checks (STATIC, no SQL execution)',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261023140000_meet_private_typing.sql','utf8');
  const cases=fs.readFileSync('supabase/tests/100_meet_private_typing.sql','utf8');
  const prior=fs.readFileSync('scripts/meet-safety-static-check.cjs','utf8');
  const balanced=vm.runInNewContext(prior.slice(prior.indexOf('function balanced('),prior.indexOf('check(balanced(migration)'))+'\nbalanced;', {assert});
  assert.ok(balanced(sql));assert.ok(balanced(cases));
  assert.equal((sql.match(/security definer set search_path = ''/g)||[]).length,3);
  assert.equal((sql.match(/if (?:not found or )?not public.meet_typing_allowed\(p_session_id\)/g)||[]).length,2);
  assert.match(sql,/me\.left_at is null and peer\.left_at is null/);
  assert.match(sql,/not public.meet_is_blocked/);assert.match(sql,/s\.expires_at>clock_timestamp\(\)/);
  assert.equal((sql.match(/as restrictive/g)||[]).length,3);
  assert.match(sql,/"meet typing guest boundary"[\s\S]*?for select to anon using/);
  assert.doesNotMatch(sql,/for select to anon,authenticated/);
  assert.equal((sql.match(/topic=realtime\.topic\(\)/g)||[]).length,2);
  assert.match(sql,/realtime\.send\('\{\}'::jsonb,'typing','meet-typing:'\|\|p_session_id,true\)/);
  assert.doesNotMatch(sql,/grant[\s\S]*?to (?:public|anon)\s*;/i);
});

// Reuse the repository's real React reconciler setup. This mounts the actual
// production hook; only native AppState, timers and service transports are fake.
async function mountedChat(t) {
  const {React}=require('./arena-mounted-room.cjs');
  const {createRoot}=require('react-dom/client');
  const time=clock(),subscriptions=[];
  let view,appState,leaves=0,clears=0;
  const session={sessionId:'fictional-room',status:'active',peerConnected:true,endReason:null,expiresAt:70000};
  const services={fetchMeetSession:async()=>session,listMeetMessages:async()=>[],
    touchMeetSession:async()=>({active:true}),leaveMeetSession:async()=>{leaves++;},
    sendMeetMessage:async()=>({id:'message',createdAt:10000}),
    subscribeMeetTyping(_id,callback){
      const sub={closed:false,publishes:0,show(value){if(!sub.closed)callback(value);},
        broadcast(){if(!sub.closed)sub.publishes++;},clear(){if(!sub.closed)clears++;},
        unsubscribe(){sub.closed=true;callback(false);}};
      subscriptions.push(sub);return sub;
    }};
  const model=load('utils/meetLifecycle.ts',{},time.env);
  const {useMeetChat}=load('hooks/useMeetChat.ts',{
    react:React,'react-native':{AppState:{addEventListener(_event,fn){appState=fn;return {remove(){}};}}},
    '../services/supabaseClient':{errorText:String,SupabaseError:class extends Error{}},
    '../services/meetService':services,'../utils/meetLifecycle':model,
  },time.env);
  const root=createRoot({nodeType:1,tagName:'DIV',nodeName:'DIV',ownerDocument:global.document,
    addEventListener(){},removeEventListener(){},appendChild(){},removeChild(){}});
  function App(){const api=useMeetChat('fictional-room');React.useLayoutEffect(()=>{view=api;});return null;}
  await React.act(async()=>{root.render(React.createElement(App));await flush();});
  t.after(async()=>{await React.act(async()=>root.unmount());});
  return {React,time,services,subscriptions,get view(){return view;},get leaves(){return leaves;},get clears(){return clears;},
    background:status=>appState(status), get sub(){return subscriptions.at(-1);}};
}
for(const action of ['leave','markEnded'])test(`mounted production hook ${action} immediately hides and disposes typing`,async t=>{
  const h=await mountedChat(t);await h.React.act(async()=>h.sub.show(true));assert.equal(h.view.peerTyping,true);
  const sub=h.sub;await h.React.act(async()=>{await h.view[action]();});
  assert.equal(h.view.peerTyping,false);assert.equal(sub.closed,true);
  assert.equal(h.view.canSend,false);assert.equal(h.leaves,action==='leave'?1:0);
});
test('mounted production hook background clears, foreground never pretends to type',async t=>{
  const h=await mountedChat(t);await h.React.act(async()=>h.sub.show(true));const old=h.sub;
  await h.React.act(async()=>h.background('background'));assert.equal(old.closed,true);assert.equal(h.view.peerTyping,false);
  await h.React.act(async()=>h.background('active'));assert.notEqual(h.sub,old);assert.equal(h.sub.publishes,0);
});
test('mounted production hook expires typing even with stale active session context',async t=>{
  const h=await mountedChat(t);await h.React.act(async()=>h.sub.show(true));const old=h.sub;
  await h.React.act(async()=>h.time.advance(60001));assert.equal(old.closed,true);assert.equal(h.view.peerTyping,false);
});
test('mounted production hook clears after a genuine send or empty composer',async t=>{
  const h=await mountedChat(t);await h.React.act(async()=>h.sub.show(true));
  await h.React.act(async()=>h.view.send('A harmless message'));assert.equal(h.view.peerTyping,true);assert.equal(h.clears,1);
  await h.React.act(async()=>h.view.notifyTyping(false));assert.equal(h.clears,2);
});
test('mounted production hook keeps typing subscription across lease extensions',async t=>{
  const h=await mountedChat(t);const first=h.sub;
  await h.React.act(async()=>{h.services.fetchMeetSession=async()=>({
    sessionId:'fictional-room',status:'active',peerConnected:true,endReason:null,expiresAt:120000});
    await h.view.refresh();});
  assert.equal(h.sub,first);assert.equal(first.closed,false);
});
test('mounted production hook A notifyTyping reaches subscription before teardown',async t=>{
  const h=await mountedChat(t);
  await h.React.act(async()=>h.view.notifyTyping(true));
  assert.equal(h.sub.publishes,1);
  await h.React.act(async()=>h.view.leave());
  assert.equal(h.sub.closed,true);
  await h.React.act(async()=>h.view.notifyTyping(true));
  assert.equal(h.sub.publishes,1);
});
