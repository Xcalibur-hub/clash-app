const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),babel=require('@babel/core');
const compile=file=>babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:['@babel/preset-typescript'],plugins:['@babel/plugin-transform-modules-commonjs']}).code;
const pure={exports:{}};vm.runInNewContext(compile('utils/personalizedLiveDiscovery.ts'),{module:pure,exports:pure.exports});
const {rankLiveDiscovery:rank,retainLiveOrder:retain}=pure.exports;
const row=(id,hood='tech',opensAt=1000)=>({entry:{id,takeId:'take-'+id,roomId:'room-'+id,title:'Proposition '+id,state:'LIVE',status:'open',kind:'CLASH'},hood,opensAt,phase:'open',fighters:[{id:'fighter-'+id,name:'Fighter '+id,tint:'#555'}],identityHidden:false});
const signals={interests:[{hood:'tech',name:'Technology'}],followedIds:['fighter-follow']};
const ids=rows=>Array.from(rows,x=>x.duel.entry.id);
test('For You is explicit interest, followed fighter, then opening recency and stable ID',()=>{const data=[row('recent','film',9000),row('follow','film',3000),row('interest','tech',2000),row('a','tech',1000),row('b','tech',1000)];assert.deepEqual(ids(rank(data,'For You',signals)),['interest','a','b','follow','recent']);assert.match(rank(data,'For You',signals)[0].reason,/Technology/);assert.equal(rank(data,'For You',signals).find(x=>x.duel.entry.id==='follow').reason,'A fighter you follow');assert.deepEqual(ids(rank([...data].reverse(),'For You',signals)),ids(rank(data,'For You',signals)));});
test('Following never fills unrelated duels and does not infer hidden BLIND identities',()=>{const data=[row('other'),row('follow')];assert.deepEqual(ids(rank(data,'Following',signals)),['follow']);assert.equal(rank(data,'Following',{...signals,followedIds:[]}).length,0);assert.equal(rank([{...row('follow'),identityHidden:true}],'Following',signals).length,0);assert.equal(rank([{...row('follow'),fighters:undefined}],'Following',signals).length,0);});
test('Discover prefers known topics outside explicit interests and unfamiliar fighters',()=>{const data=[row('interest'),row('follow','film'),row('broad','science'),row('unknown',null)];assert.deepEqual(ids(rank(data,'Discover',signals)),['broad','follow','interest','unknown']);assert.equal(rank(data,'Discover',signals)[0].reason,'Outside your selected interests');assert.notDeepEqual(ids(rank(data,'Discover',signals)),ids(rank(data,'For You',signals)));});
test('missing signals fall back truthfully; sparse Discover traverses topics deterministically',()=>{const data=[row('a','tech',5000),row('b','film',1000),row('c',null,NaN)];const empty={interests:[],followedIds:[]};assert.deepEqual(ids(rank(data,'For You',empty)),['a','b','c']);assert.deepEqual(ids(rank(data,'Discover',empty)),['b','a','c']);assert.match(rank(data,'For You',empty)[0].reason,/Recent/);assert.doesNotMatch(rank(data,'Discover',empty)[0].reason,/interest:|follow|popular/i);});
test('deduplicate, reject conflicting destinations and deny pending/terminal/closed/paused',()=>{const a=row('a');assert.equal(rank([a,a],'For You',signals).length,1);assert.equal(rank([a,{...a,entry:{...a.entry,roomId:'different'}}],'For You',signals).length,0);for(const patch of [{state:'PENDING',kind:'CHALLENGE'},{state:'UPCOMING'},{state:'COMPLETED',status:'settled'},{status:'cancelled'}])assert.equal(rank([{...a,entry:{...a.entry,...patch}}],'For You',signals).length,0);for(const phase of ['closed','paused','scheduled'])assert.equal(rank([{...a,phase}],'For You',signals).length,0);});
test('polling removes revoked rows and retains page ordering without new insertions',()=>{const before=rank([row('a'),row('b')],'For You',signals),fresh=rank([row('b'),row('new','tech',10000)],'For You',signals);assert.deepEqual(ids(retain(before,fresh)),['b']);assert.deepEqual(ids(before),['a','b']);});
function harness(options={}){
 let account='account',active=true,inFlight=0,maxInFlight=0,expire;const calls=[];
 const entries=options.entries??[row('a').entry,row('b').entry];
 const query=table=>{let filters=[];const q={select(value){calls.push({table,select:value});return q;},in(column,ids){filters.push(['in',column,ids]);return q;},eq(column,value){filters.push(['eq',column,value]);return q;},filter(column,operator,value){assert.equal(operator,'eq');filters.push(['eq',column,value]);return q;},limit(limit){calls.push({table,filters,limit});if(table==='takes')return Promise.resolve({data:options.sources??entries.map(e=>({id:e.takeId,hood:'tech'})),error:null});return Promise.resolve({data:options.followError?null:[{following_id:'fighter-a'}],error:options.followError?Error('network'):null});}};return q;};
 const module={exports:{}};
 vm.runInNewContext(compile('services/personalizedLiveDiscoveryService.ts'),{module,exports:module.exports,setTimeout:options.timeout?(fn,ms)=>{assert.equal(ms,45000);expire=fn;return 1}:setTimeout,clearTimeout:options.timeout?()=>{}:clearTimeout,require(name){
  if(name==='./supabaseClient')return{currentUserId:async()=>account,requestError:e=>e,requireSupabase:()=>({from:query})};
  if(name==='./apiService')return{currentViewerProfileId:async()=>'profile'};
  if(name==='./arenaClashDiscoveryService')return{fetchClashDiscovery:async()=>options.hang?new Promise(()=>{}):entries};
  if(name==='./clashEngineService')return{fetchClashView:async id=>{inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);await new Promise(resolve=>setTimeout(resolve,1));inFlight--;if(options.switchAccount)account='other';if(options.blur)active=false;if(options.denied===id)return null;return{clashId:options.mismatch?'different':id,takeId:'take-'+id,roomId:'room-'+id,status:options.cancelled?'cancelled':'open',opensAt:1000,sideAText:'Source',revealed:!options.blind,mode:options.blind?'BLIND':'PUBLIC',sideA:{id:'fighter-'+id,name:id,tint:'#555'},sideB:null};}};
  if(name==='./liveArenaService')return{fetchRoom:async id=>{calls.push({room:id});if(options.roomDenied)throw Error('denied');return{roomId:id,clashId:id.slice(5),roomMode:'DUEL',phase:options.closed?'closed':'open'};}};
  if(name==='./arenaInterestService')return{fetchInterestCatalogue:async()=>{if(options.interestError)throw Error('offline');return[{id:'i',name:'Technology',hoods:['tech']}]},fetchMyArenaInterests:async()=>({topicIds:['i']})};
  throw Error(name);
 }});
 return{run:()=>module.exports.fetchPersonalizedLiveDiscovery('account',()=>active),expire:()=>expire(),calls,get maxInFlight(){return maxInFlight;}};
}
test('read adapter whitelists source fields, restricts candidate follow IDs and caps detail concurrency',async()=>{const h=harness({entries:Array.from({length:12},(_,i)=>row('r'+i).entry)}),s=await h.run();assert.equal(s.rows.length,12);assert.ok(h.maxInFlight<=4);assert.ok(h.calls.some(c=>c.table==='takes'&&c.select==='id,hood'));const f=h.calls.find(c=>c.table==='follows'&&c.filters);assert.equal(f.limit,120);assert.deepEqual(f.filters.find(x=>x[0]==='eq'),['eq','follower_id','profile']);assert.equal(f.filters.find(x=>x[0]==='in')[2].length,12);assert.ok(h.calls.some(c=>c.table==='takes'&&c.filters?.some(x=>x[1]==='is_runtime_fixture'&&x[2]===false)));});
test('unreadable source, null view and denied canonical Room are omitted',async()=>{assert.equal((await harness({sources:[]}).run()).rows.length,0);assert.equal((await harness({denied:'a'}).run()).rows.length,1);assert.equal((await harness({mismatch:true}).run()).rows.length,0);const s=await harness({roomDenied:true}).run();assert.equal(s.rows.length,0);assert.equal(s.metadataError,true);});
test('known BLIND IDs never cause follow probes; optional failures stay distinguishable',async()=>{const h=harness({blind:true}),s=await h.run();assert.ok(s.rows.every(r=>r.fighters===undefined&&r.identityHidden));assert.ok(!h.calls.some(c=>c.table==='follows'));const failed=await harness({followError:true,interestError:true}).run();assert.equal(failed.followingError,true);assert.equal(failed.interestsError,true);assert.equal(failed.signals.followedIds.length,0);});
test('account switch and blur reject late recovery; oversize snapshots fail closed',async()=>{for(const flag of ['switchAccount','blur'])await assert.rejects(harness({[flag]:true}).run(),/account_changed/);await assert.rejects(harness({entries:Array.from({length:61},(_,i)=>row(String(i)).entry)}).run(),/exceeds/);});
test('server terminal phase/status overrides stale discovery LIVE',async()=>{for(const opt of ['closed','cancelled']){const s=await harness({[opt]:true}).run();assert.ok(s.rows.every(r=>r.entry.state==='COMPLETED'));assert.equal(rank(s.rows,'For You',s.signals).length,0);}});

function screenHarness(data,fail=false){
 let values=[],index=0,account='account',focus,cleanup,poll,resolveRead,late=false;const requests=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(initial){const i=index++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v}];},useCallback:fn=>fn};
 const module={exports:{}};
 const code=babel.transformSync(fs.readFileSync('components/arena/ArenaClashes.tsx','utf8'),{filename:'ArenaClashes.tsx',babelrc:false,configFile:false,presets:['@babel/preset-typescript',['@babel/preset-react',{runtime:'classic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code;
 vm.runInNewContext(code,{module,exports:module.exports,setInterval:fn=>{poll=fn;return 1},clearInterval(){},require(name){
  if(name==='react')return React;
  if(name==='react-native')return{FlatList:'List',Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:x=>x}};
  if(name==='expo-router')return{useFocusEffect:fn=>{focus=fn},useRouter:()=>({push(){}})};
  if(name.endsWith('/AuthProvider'))return{useAuth:()=>({user:account?{id:account}:null})};
  if(name.endsWith('/personalizedLiveDiscoveryService'))return{fetchPersonalizedLiveDiscovery:async(owner,isCurrent)=>{requests.push(owner);if(late)return new Promise(r=>{resolveRead=r});if(fail)throw Error('offline');return data;}};
  if(name.endsWith('/personalizedLiveDiscovery'))return pure.exports;
  if(name.endsWith('/data/hoods'))return{HOOD_LABEL:{tech:'Tech',film:'Film'}};
  if(name.endsWith('/theme'))return{layout:{screenX:16},useThemeColors:()=>({})};
  if(name.endsWith('/theme/arena'))return{arena:{type:{}}};
  if(name.endsWith('/haptics'))return{press(){}};
  if(name.endsWith('/arenaClashDiscovery'))return{clashDiscoveryDestination:e=>'/arena/room/'+e.roomId};
  if(name==='./LiveDuelCard')return{LiveDuelCard:'Card'};
  if(name.endsWith('/ArenaPrimitives'))return{ArenaButton:'Button'};
  throw Error(name);
 }});
 const render=()=>{index=0;return module.exports.ArenaClashes({topics:[],onEnter(){},onWatch(){}})};
 const walk=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(walk):[n,...walk(n.props?.children)];
 return{render,focus(){render();cleanup=focus();},blur(){cleanup()},button(label){const target=walk(render().props.ListHeaderComponent).find(n=>n.props?.label===label);assert.ok(target,'Actual header action '+label);target.props.onPress();},switchAccount(id){account=id},delay(){late=true},finish(value){resolveRead(value)},poll:()=>poll(),requests};
}
const flushUI=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
const snapshot=(patch={})=>({rows:[row('a'),row('follow','film')],signals,interestsError:false,followingError:false,metadataError:false,...patch});
test('actual Following UI separates loading, failed graph and genuinely empty candidate set',async()=>{
 const failed=screenHarness(snapshot({followingError:true}));failed.focus();assert.equal(failed.render().props.ListEmptyComponent,null);await flushUI();failed.button('Following');assert.equal(failed.render().props.data.length,0);assert.equal(failed.render().props.ListEmptyComponent,null);assert.match(JSON.stringify(failed.render().props.ListHeaderComponent),/Couldn.t load|follow relationships/);
 const empty=screenHarness(snapshot({signals:{interests:[],followedIds:[]}}));empty.focus();await flushUI();empty.button('Following');assert.equal(empty.render().props.data.length,0);assert.match(JSON.stringify(empty.render().props.ListEmptyComponent),/No followed fighters/);
 const network=screenHarness(snapshot(),true);network.focus();await flushUI();assert.equal(network.render().props.ListEmptyComponent,null);assert.match(JSON.stringify(network.render().props.ListHeaderComponent),/Couldn.t load/);
});
test('actual list pages are bounded, filter changes reset pages and exactly one card is featured',async()=>{const h=screenHarness(snapshot({rows:Array.from({length:30},(_,i)=>row(String(i)))}));h.focus();await flushUI();let list=h.render();assert.equal(list.props.data.length,12);assert.equal(list.props.renderItem({item:list.props.data[0],index:0}).props.featured,true);assert.equal(list.props.renderItem({item:list.props.data[1],index:1}).props.featured,false);list.props.onEndReached();assert.equal(h.render().props.data.length,24);h.button('Discover');assert.equal(h.render().props.data.length,12);});
test('actual account switch hides previous snapshot synchronously; late blurred requests are ignored',async()=>{const h=screenHarness(snapshot());h.focus();await flushUI();assert.equal(h.render().props.data.length,2);h.switchAccount('other');assert.equal(h.render().props.data.length,0);const late=screenHarness(snapshot());late.delay();late.focus();late.blur();late.finish(snapshot());await flushUI();assert.equal(late.render().props.data.length,0);});

test('a hung read produces a bounded error instead of permanent loading',async()=>{const h=harness({timeout:true,hang:true}),pending=h.run();h.expire();await assert.rejects(pending,/discovery_timeout/);assert.equal(h.calls.length,0);});

test('actual Discover topic exploration only filters authorized snapshot rows',async()=>{const h=screenHarness(snapshot());h.focus();await flushUI();h.button('Discover');h.button('Film');assert.deepEqual(Array.from(h.render().props.data,x=>x.duel.entry.id),['follow']);h.button('All topics');assert.equal(h.render().props.data.length,2);});
