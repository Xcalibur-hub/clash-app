const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness,deferred,React,text}=require('./ui-completion-harness.cjs');
const session=(patch={})=>({id:'session-a',creatorId:'host',title:'Fictional retained session',status:'LIVE',viewerAccess:true,canParticipate:true,isOwner:false,watching:0,...patch});
const round=(patch={})=>({id:'round-a',sessionId:'session-a',type:'CHOICE',prompt:'Fictional decision',status:'OPEN',openedAt:100,closesAt:null,options:[{id:'a',label:'A'},{id:'b',label:'B'}],tallies:{},totalVotes:0,result:null,voted:false,myVote:null,canParticipate:true,...patch});
const snapshot=(s={},r={},source='snapshot')=>({session:session(s),interactions:[round(r)],source,interactionWindowComplete:true});
const event=(kind='INTERACTION_OPENED')=>({id:'old-event',kind,interactionId:'round-a',actionKind:null,payload:{type:'CHOICE',tallies:{},total:0},createdAt:1});
function setup(controller=false){
 let focus=true,reads=0,writes=0,id=0;const timers=new Map(),listeners=new Set(),subscriptions=[],notices=[];
 const h=harness(controller?'hooks/useCreatorLive.ts':'hooks/useCreatorLiveFeed.ts',{id:'session-a'},e=>p=>controller?e.useCreatorLive(p.id):e.useCreatorLiveFeed(p.id),{
  setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key),dependencies:{
   'expo-router':{useFocusEffect:fn=>React.useEffect(()=>focus?fn():undefined,[focus,fn])},
   'react-native':{AppState:{currentState:'active',addEventListener:(_name,fn)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)};}}},
   store:{useClash:()=>({dispatch:e=>notices.push(e)}),showNotice:message=>({message})},
  }});
 h.services.fetchCreatorLiveReadSnapshot=async()=>{reads++;return snapshot();};
 h.services.subscribeCreatorLive=(_sid,callback,options)=>{const item={callback,options,disposed:false};subscriptions.push(item);return()=>{item.disposed=true;};};
 h.services.submitCreatorLiveVote=async()=>{writes++;return{accepted:true,alreadyVoted:false,myVote:'a'};};
 h.services.errorText=e=>e.message??e.code??'read failed';
 const flush=()=>h.act(async()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());});
 return {h,timers,listeners,subscriptions,notices,flush,focus:value=>{focus=value;},get reads(){return reads;},get writes(){return writes;}};
}

test('B1 reducer reproducer: duplicate OPEN cannot reset tally or grant admission; STARTED cannot regress ENDED',async()=>{
 const h=harness('utils/creatorLiveEvents.ts',{},()=>()=>null),e=h.load('utils/creatorLiveEvents.ts');
 try{
  let state=e.applyLiveEvents({status:'LIVE',interactions:[],banner:null},[event()]);assert.equal(state.interactions[0].canParticipate,false);
  state=e.applyLiveEvents(state,[{...event('TALLY'),id:'new-tally',createdAt:5,payload:{total:2,tallies:{a:2}}}]);
  assert.equal(e.applyLiveEvents(state,[event()]).interactions[0].totalVotes,2);
  assert.equal(e.applyLiveEvents({...state,status:'ENDED'},[event('SESSION_STARTED')]).status,'ENDED');
 }finally{await h.unmount();}
});
test('mounted feed treats old OPEN/STARTED/tallies as read invalidations, never snapshot authority',async()=>{
 const r=setup(),{h}=r;h.services.fetchCreatorLiveReadSnapshot=async()=>snapshot({status:'ENDED'},{status:'CLOSED',tallies:{a:5},totalVotes:5,canParticipate:false});
 try{await h.mount();const sub=r.subscriptions.at(-1);await h.act(async()=>{sub.callback(event());sub.callback(event('SESSION_STARTED'));sub.callback(event('TALLY'));});
  assert.equal(h.tree.status,'ENDED');assert.equal(h.tree.interactions[0].totalVotes,5);assert.equal(r.timers.size,1);
  await r.flush();assert.equal(h.tree.status,'ENDED');assert.equal(h.tree.interactions[0].totalVotes,5);
 }finally{await h.unmount();}assert.equal(r.timers.size,0);
});
test('A→B→A epochs hide old data and reject earlier-A late reads, events and refresh callbacks',async()=>{
 const r=setup(),{h}=r,late=deferred();let pending;
 try{await h.mount();const first=h.tree,sub=r.subscriptions.at(-1);
  h.services.fetchCreatorLiveReadSnapshot=()=>late.promise;await h.act(async()=>{pending=h.tree.refresh();});
  h.services.fetchCreatorLiveReadSnapshot=async()=>snapshot({title:'B snapshot'});h.auth={user:{id:'account-b'},loading:false};await h.update();assert.equal(h.tree.session.title,'B snapshot');
  h.services.fetchCreatorLiveReadSnapshot=async()=>snapshot({title:'new A epoch'});h.auth={user:{id:'account-a'},loading:false};await h.update();
  await h.act(async()=>{late.resolve(snapshot({title:'private OLD A'}));await pending;sub.callback(event('SESSION_STARTED'));await first.refresh();});await r.flush();
  assert.equal(h.tree.session.title,'new A epoch');assert.equal(sub.disposed,true);
 }finally{await h.unmount();}
});
test('session change, blur, background and unmount dispose listeners/timers and reject stale callbacks',async()=>{
 const r=setup(),{h}=r;
 try{await h.mount();const old=r.subscriptions.at(-1);await h.act(async()=>old.callback(event()));assert.equal(r.timers.size,1);
  r.focus(false);await h.update();assert.equal(h.tree.session,null);assert.equal(old.disposed,true);assert.equal(r.timers.size,0);
  r.focus(true);await h.update();await h.act(async()=>[...r.listeners][0]('background'));assert.equal(h.tree.session,null);
  await h.act(async()=>[...r.listeners][0]('active'));assert.ok(h.tree.session);
  h.services.fetchCreatorLiveReadSnapshot=async()=>snapshot({id:'session-b'});await h.update({id:'session-b'});assert.equal(h.tree.session.id,'session-b');
 }finally{await h.unmount();}assert.equal(r.listeners.size,0);assert.equal(r.timers.size,0);assert.ok(r.subscriptions.every(s=>s.disposed));
});
test('same-ID replacement Auth session cannot revive an earlier-A callback after a batched account cycle',async()=>{
 const r=setup(true),{h}=r;
 try{await h.mount();const previous=h.tree.vote;const previousSub=r.subscriptions.at(-1);
  h.auth={user:{id:'account-a'},session:{identity:'new-auth-session'},loading:false};await h.update();
  await h.act(async()=>{await previous('round-a','a');previousSub.callback(event());});await r.flush();
  assert.equal(r.writes,0);assert.equal(previousSub.disposed,true);assert.equal(h.tree.voteIntent.kind,'idle');
 }finally{await h.unmount();}
});
test('reconnect refreshes authoritative state once; passive entry never writes heartbeat or polls',async()=>{
 const r=setup(),{h}=r;
 try{await h.mount();assert.equal(r.reads,1);r.subscriptions.at(-1).options.onStatus('SUBSCRIBED');await r.flush();assert.equal(r.reads,2);
  assert.equal(r.writes,0);assert.equal(r.timers.size,0);assert.deepEqual(h.calls,[]);
 }finally{await h.unmount();}
});
test('denied recovery clears previous data and subscription instead of claiming successful emptiness',async()=>{
 const r=setup(),{h}=r;
 try{await h.mount();h.services.fetchCreatorLiveReadSnapshot=async()=>{throw{code:'42501',message:'denied'};};await h.act(async()=>h.tree.refresh());
  assert.equal(h.tree.session,null);assert.deepEqual(h.tree.interactions,[]);assert.match(h.tree.error,/denied/);assert.equal(r.subscriptions.at(-1).disposed,true);
 }finally{await h.unmount();}
});
test('synchronous duplicate taps publish once and confirm only the actual server option after read',async()=>{
 const r=setup(true),{h}=r,reply=deferred();let calls=0,a,b;
 h.services.submitCreatorLiveVote=()=>{calls++;return reply.promise;};
 try{await h.mount();await h.act(async()=>{a=h.tree.vote('round-a','a');b=h.tree.vote('round-a','a');});assert.equal(calls,1);assert.equal(h.tree.voteIntent.kind,'pending');
  h.services.fetchCreatorLiveReadSnapshot=async()=>snapshot({}, {voted:true,myVote:'a'});
  await h.act(async()=>{reply.resolve({accepted:true,alreadyVoted:false,myVote:'a'});await a;await b;});
  assert.equal(h.tree.voteIntent.kind,'confirmed');assert.equal(h.tree.interactions[0].myVote,'a');
 }finally{await h.unmount();}
});
test('already-voted different-option replay returns false and preserves authoritative prior option',async()=>{
 const r=setup(true),{h}=r;
 h.services.submitCreatorLiveVote=async()=>({accepted:false,alreadyVoted:true,myVote:'a'});
 try{await h.mount();h.services.fetchCreatorLiveReadSnapshot=async()=>snapshot({}, {voted:true,myVote:'a'});
  let result;await h.act(async()=>{result=await h.tree.vote('round-a','b');});assert.equal(result,false);
  assert.equal(h.tree.voteIntent.kind,'replayed');assert.equal(h.tree.voteIntent.myVote,'a');assert.equal(h.tree.interactions[0].myVote,'a');
 }finally{await h.unmount();}
});
test('missing myVote uses authorized read, while network ambiguity never automatically resubmits',async()=>{
 for(const ambiguous of [false,true]){
  const r=setup(true),{h}=r;let calls=0;h.services.submitCreatorLiveVote=async()=>{calls++;if(ambiguous)throw Error('network timeout');return{accepted:true,alreadyVoted:false};};
  try{await h.mount();h.services.fetchCreatorLiveReadSnapshot=async()=>snapshot({}, {voted:true,myVote:'a'});await h.act(async()=>h.tree.vote('round-a','b'));
   assert.equal(h.tree.voteIntent.kind,ambiguous?'ambiguous':'confirmed');assert.equal(h.tree.interactions[0].myVote,'a');assert.equal(calls,1);
   await h.act(async()=>r.subscriptions.at(-1).options.onStatus('SUBSCRIBED'));await r.flush();assert.equal(calls,1);
  }finally{await h.unmount();}
 }
});
test('old mutation callbacks cannot publish or update another account, including A→B→A',async()=>{
 const r=setup(true),{h}=r,reply=deferred();let calls=0,oldRun;h.services.submitCreatorLiveVote=()=>{calls++;return reply.promise;};
 try{await h.mount();const old=h.tree.vote;await h.act(async()=>{oldRun=old('round-a','a');});
  h.auth={user:{id:'account-b'},loading:false};await h.update();h.auth={user:{id:'account-a'},loading:false};await h.update();
  await h.act(async()=>{reply.resolve({accepted:true,alreadyVoted:false,myVote:'a'});await oldRun;await old('round-a','a');});
  assert.equal(calls,1);assert.equal(h.tree.voteIntent.kind,'idle');assert.equal(h.tree.interactions[0].voted,false);assert.deepEqual(r.notices,[]);
 }finally{await h.unmount();}
});
test('legacy fallback, unknown rounds and creator identity do not enable new votes',async()=>{
 for(const [s,source]of [[{},'legacy'],[{isOwner:true},'snapshot'],[{canParticipate:false},'snapshot']]){
  const r=setup(true),{h}=r;h.services.fetchCreatorLiveReadSnapshot=async()=>snapshot(s,{},source);
  try{await h.mount();await h.act(async()=>h.tree.vote('round-a','a'));await h.act(async()=>h.tree.vote('foreign-round','a'));assert.equal(r.writes,0);}
  finally{await h.unmount();}
 }
});
test('denied vote is rejected, clears inaccessible content and makes no retry',async()=>{
 const r=setup(true),{h}=r;let calls=0;h.services.submitCreatorLiveVote=async()=>{calls++;throw{code:'42501',message:'denied'};};
 try{await h.mount();h.services.fetchCreatorLiveReadSnapshot=async()=>null;await h.act(async()=>h.tree.vote('round-a','a'));
  assert.equal(h.tree.voteIntent.kind,'rejected');assert.equal(h.tree.session,null);assert.equal(calls,1);
 }finally{await h.unmount();}
});

function serviceHarness(respond){
 let account='account-a';const calls=[];
 const h=harness('services/creatorLiveService.ts',{},()=>()=>null,{dependencies:{mediaService:{getPublicMediaUrl:()=>null},supabaseClient:{
  currentUserId:async()=>account,requestError:e=>e,SupabaseError:class extends Error{constructor(m,code){super(m);this.code=code;}},
  requireSupabase:()=>({rpc:async(name,args)=>{calls.push([name,args]);return respond(name,args);}}),
 }}});
 return{h,api:h.load('services/creatorLiveService.ts'),calls,account:v=>{account=v;}};
}
const rawRound=(patch={})=>({...round(),openedAt:new Date(1000).toISOString(),...patch});
test('snapshot capability works when supported; only exact missing RPC permits existing legacy read fallback',async()=>{
 for(const missing of [false,true]){
  const r=serviceHarness(name=>name==='get_creator_live_snapshot'?missing?{data:null,error:{code:'PGRST202',message:'get_creator_live_snapshot not found'}}:
   {data:{session:session(),interactions:[rawRound()],interactionWindowComplete:true},error:null}:{data:name==='get_creator_live_session'?session():[rawRound()],error:null});
  try{const data=await r.api.fetchCreatorLiveReadSnapshot('session-a','account-a');assert.equal(data.source,missing?'legacy':'snapshot');assert.equal(data.session.canParticipate,!missing);assert.equal(r.calls.length,missing?3:1);}
  finally{await r.h.unmount();}
 }
});
test('permission, network, malformed and unrelated missing-function errors never downgrade to fallback',async()=>{
 for(const error of [{code:'42501',message:'denied'},{code:'PGRST202',message:'other_function missing'},{code:'42883',message:'internal function missing'},{code:'network',message:'offline'}]){
  const r=serviceHarness(()=>({data:null,error}));try{await assert.rejects(r.api.fetchCreatorLiveReadSnapshot('session-a','account-a'));assert.equal(r.calls.length,1);}finally{await r.h.unmount();}
 }
 const r=serviceHarness(()=>({data:{session:session(),interactions:[rawRound({sessionId:'foreign'})],interactionWindowComplete:true},error:null}));
 try{await assert.rejects(r.api.fetchCreatorLiveReadSnapshot('session-a','account-a'),{code:'bad_payload'});assert.equal(r.calls.length,1);}finally{await r.h.unmount();}
});
test('tie/no-ballot results never identify a fabricated winner; ordinary winners remain numerical server data',async()=>{
 const h=harness('utils/creatorLiveState.ts',{},()=>()=>null),m=h.load('utils/creatorLiveState.ts');
 try{for(const [result,total]of [[{winner:'a',tie:true},2],[{winner:'a',outcome:'NO_BALLOTS'},0],[{winner:'a',total:0},0]])assert.equal(m.liveResultWinner(result,total),null);
  assert.match(m.liveResultLabel({winner:'a',tie:true},2,round().options),/tie/);assert.match(m.liveResultLabel({outcome:'NO_BALLOTS'},0,round().options),/No ballots/);
  assert.equal(m.liveResultWinner({winner:'b',tie:false},3),'b');assert.match(m.liveResultLabel({winner:'b'},3,round().options),/B/);
 }finally{await h.unmount();}
});
test('mounted result panel never highlights a tied/no-ballot winner and keeps disabled semantics',async()=>{
 for(const [result,total,label]of [[{winner:'a',tie:true},2,/tie/],[{winner:'a',outcome:'NO_BALLOTS'},0,/No ballots/],[{winner:'b',tie:false},2,/Server result: B/]]){
  const h=harness('components/vault/live/LiveInteractionPanel.tsx',{interaction:round({status:'CLOSED',result,totalVotes:total,canParticipate:false}),busy:false,onVote:()=>{throw Error('unexpected vote');}},e=>e.LiveInteractionPanel);
  try{await h.mount();assert.match(text(h.tree),label);
   const a=h.nodes.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='A');assert.ok(a.props.disabled);assert.equal(a.props.accessibilityState.disabled,true);
   assert.equal(a.props.style.find(v=>v?.borderColor).borderColor,h.colors.border);
  }finally{await h.unmount();}
 }
});
test('subscription transport drops disposed or old-epoch callbacks and never subscribes after a late auth read',async()=>{
 const auth=deferred();let removed=0,subscribed=0,setAuth=0,events=0;const callbacks=[];
 const channel={on:(_kind,_filter,fn)=>{callbacks.push(fn);return channel;},subscribe:()=>{subscribed++;}};
 const h=harness('services/creatorLiveService.ts',{},()=>()=>null,{dependencies:{mediaService:{getPublicMediaUrl:()=>null},supabaseClient:{requireSupabase:()=>({
  channel:()=>channel,auth:{getSession:()=>auth.promise},realtime:{setAuth:async()=>{setAuth++;}},removeChannel:async()=>{removed++;},
 })}}});
 try{const api=h.load('services/creatorLiveService.ts'),dispose=api.subscribeCreatorLive('session-a',()=>events++);dispose();auth.resolve({data:{session:null}});await new Promise(resolve=>setImmediate(resolve));
  callbacks[0]({new:{id:'e',session_id:'session-a',kind:'TALLY',created_at:new Date().toISOString()}});
  assert.equal(subscribed,0);assert.equal(setAuth,0);assert.equal(events,0);assert.equal(removed,1);
 }finally{await h.unmount();}
});
test('host cleanup remains scoped; hosting/opening stay deferred and late completion cannot affect another epoch',async()=>{
 let epoch={},owner=true,notices=[],reads=0,calls=0;const response=deferred();
 const h=harness('hooks/useCreatorLiveHost.ts',{},e=>()=>{
  const token=epoch;const isCurrent=React.useMemo(()=>()=>epoch===token,[token]);
  return e.useCreatorLiveHost('session-a',async()=>{reads++;},{isCurrent,isOwner:owner});
 },{dependencies:{store:{useClash:()=>({dispatch:e=>notices.push(e)}),showNotice:m=>m}}});
 h.services.errorText=e=>e.message;
 h.services.endCreatorLiveSession=()=>{calls++;return response.promise;};h.services.closeCreatorLiveInteraction=async()=>{calls++;};
 try{await h.mount();await h.act(async()=>{await h.tree.start();await h.tree.openInteraction({type:'CHOICE',prompt:'blocked'});});assert.equal(calls,0);
  let run;await h.act(async()=>{run=h.tree.end();});assert.equal(calls,1);const oldClose=h.tree.closeInteraction;
  epoch={};owner=false;await h.update();const before=notices.length;await h.act(async()=>{response.resolve();await run;await oldClose('round-a');});
  assert.equal(reads,0);assert.equal(calls,1);assert.equal(notices.length,before);
 }finally{await h.unmount();}
});
test('terminal subscription failure disposes once instead of leaving SDK retries alive',async()=>{
 let callback,removed=0,statuses=[];const channel={on:()=>channel,subscribe:fn=>{callback=fn;}};
 const h=harness('services/creatorLiveService.ts',{},()=>()=>null,{dependencies:{mediaService:{getPublicMediaUrl:()=>null},supabaseClient:{requireSupabase:()=>({
  channel:()=>channel,auth:{getSession:async()=>({data:{session:null},error:null})},realtime:{setAuth:async()=>{}},removeChannel:async()=>{removed++;},
 })}}});
 try{const dispose=h.load('services/creatorLiveService.ts').subscribeCreatorLive('session-a',()=>{},{onStatus:s=>statuses.push(s)});
  await new Promise(resolve=>setImmediate(resolve));callback('TIMED_OUT');callback('SUBSCRIBED');dispose();
  assert.equal(removed,1);assert.deepEqual(statuses,['TIMED_OUT']);
 }finally{await h.unmount();}
});
test('unmounted pending reads cannot resurrect subscriptions or deliver private state',async()=>{
 const r=setup(),{h}=r,read=deferred();h.services.fetchCreatorLiveReadSnapshot=()=>read.promise;
 await h.mount();assert.equal(h.tree.session,null);await h.unmount();read.resolve(snapshot());await new Promise(resolve=>setImmediate(resolve));
 assert.equal(r.subscriptions.length,0);assert.equal(r.listeners.size,0);assert.equal(r.timers.size,0);
});
test('bounded read timeout releases single-flight, aborts transport and ignores its late result',async()=>{
 const r=setup(),{h}=r,read=deferred();let signal;
 h.services.fetchCreatorLiveReadSnapshot=(_id,_actor,s)=>{signal=s;return read.promise;};
 try{await h.mount();await r.flush();assert.equal(signal.aborted,true);assert.equal(h.tree.session,null);assert.match(h.tree.error,/timed out/);
  h.services.fetchCreatorLiveReadSnapshot=async()=>snapshot({title:'fresh after timeout'});await h.act(async()=>h.tree.refresh());
  await h.act(async()=>read.resolve(snapshot({title:'stale timed out'})));assert.equal(h.tree.session.title,'fresh after timeout');assert.equal(r.timers.size,0);
 }finally{await h.unmount();}
});
test('vote deadline is ambiguous, performs one read and ignores late success without re-submission',async()=>{
 const r=setup(true),{h}=r,write=deferred();let run,signal,calls=0;
 h.services.submitCreatorLiveVote=(_id,_option,s)=>{calls++;signal=s;return write.promise;};
 try{await h.mount();await h.act(async()=>{run=h.tree.vote('round-a','a');});await r.flush();await run;
  assert.equal(signal.aborted,true);assert.equal(h.tree.voteIntent.kind,'ambiguous');assert.equal(calls,1);assert.equal(h.tree.interactions[0].voted,false);
  await h.act(async()=>write.resolve({accepted:true,alreadyVoted:false,myVote:'a'}));assert.equal(h.tree.voteIntent.kind,'ambiguous');assert.equal(calls,1);assert.equal(r.timers.size,0);
 }finally{await h.unmount();}
});
