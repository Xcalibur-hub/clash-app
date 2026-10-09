// Actual World screen with a controlled hook/native bridge and deferred services.
// Test records exist only in this process; this is not physical-device evidence.
const fs=require('fs'),Module=require('module'),babel=require('@babel/core');
const assert=require('node:assert/strict'),React=require('react');
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(m,f)=>m._compile(babel.transformSync(fs.readFileSync(f,'utf8'),{
  filename:f,babelrc:false,configFile:false,presets:['@babel/preset-typescript',['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs'],
}).code,f);
let cells=[],index=0,effects=[],notices=[],writes=0;
const hooks={...React,
  useState(v){const i=index++;if(!(i in cells))cells[i]=v;return[cells[i],n=>{writes++;cells[i]=typeof n==='function'?n(cells[i]):n;}];},
  useRef(v){const i=index++;if(!(i in cells))cells[i]={current:v};return cells[i];},
  useMemo(fn){index++;return fn();},
  useCallback(fn,deps){const i=index++,old=cells[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))cells[i]={deps,fn};return cells[i].fn;},
  useEffect(fn,deps){const i=index++,old=cells[i];if(!old||!deps||deps.some((d,j)=>d!==old.deps?.[j]))effects.push(()=>{old?.cleanup?.();cells[i]={deps,cleanup:fn()};});},
};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
let requests=[];
const request=kind=>{const d=deferred();requests.push({kind,...d});return d.promise;};
const service={fetchActiveMissions:()=>request('missions'),fetchRecentWorldDrops:()=>request('recent'),fetchNearbyWorldDrops:()=>request('area'),fetchMissionDrops:()=>request('mission-drops')};
const location={getForegroundPermission:()=>request('permission'),requestForegroundPermission:()=>request('prompt'),getOneShotLocation:()=>request('gps')};
const dispatch=e=>notices.push(e);
const original=Module._load;
Module._load=function(r,parent){
 const own=parent?.filename.includes('Clash')&&!parent.filename.includes('node_modules');
 if(own&&r==='react')return hooks;
 if(r==='react-native')return{View:'View',Text:'Text',Pressable:'Button',ActivityIndicator:'Spinner',Platform:{OS:'android'},StyleSheet:{create:x=>x}};
 if(r==='react-native-maps')return{__esModule:true,default:'Map',Circle:'Circle'};
 if(r==='expo-router')return{useRouter:()=>({push(){},replace(){},back(){},canGoBack:()=>true})};
 if(r==='@react-navigation/native')return{useFocusEffect:()=>{}};
 if(r==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({top:0,bottom:0})};
 if(own&&r.endsWith('/worldService'))return service;
 if(own&&r.endsWith('/locationService'))return location;
 if(own&&r.endsWith('/useClock'))return{useClock:()=>Date.now()};
 if(own&&r.endsWith('/useRequireAuth'))return{useRequireAuth:()=>()=>true};
 if(own&&r.endsWith('/analytics'))return{analytics:{track(){}}};
 if(own&&r.endsWith('/supabaseClient'))return{errorText:e=>e.message};
 if(own&&r.endsWith('/store'))return{useClash:()=>({dispatch}),showNotice:text=>({text})};
 if(own&&r.endsWith('/theme'))return{space:{},radius:{},typeScale:new Proxy({},{get:()=>({})}),useTheme:()=>({scheme:'dark'}),useThemeColors:()=>({})};
 if(own&&r.endsWith('/haptics'))return{tap(){}};
 if(own&&r.endsWith('/worldCluster'))return{clusterWorldDrops:drops=>drops.map(drop=>({kind:'drop',id:drop.id,drop})),regionMovedSignificantly:()=>true};
 if(own&&r.includes('/components/'))return new Proxy({},{get:(_,key)=>String(key)});
 return original.apply(this,arguments);
};
const Screen=require('../app/world/index.tsx').default;
const nodes=t=>!t||typeof t!=='object'?[]:[t,...React.Children.toArray(t.props?.children).flatMap(nodes)];
function render(){index=0;const t=Screen();const run=effects;effects=[];run.forEach(f=>f());return t;}
function cleanup(){cells.forEach(c=>c?.cleanup?.());}
function reset(){cleanup();cells=[];effects=[];requests=[];notices=[];writes=0;}
function find(t,label){const n=nodes(t).find(n=>n.props?.accessibilityLabel===label);assert.ok(n,'missing '+label);return n;}
function byType(t,type){return nodes(t).find(n=>n.type===type);}
function press(label){find(render(),label).props.onPress();}
function pending(kind){const r=requests.find(r=>r.kind===kind&&!r.used);assert.ok(r,'missing request '+kind);r.used=true;return r;}
const ids=()=>nodes(render()).filter(n=>n.type==='WorldDropMarker').map(n=>n.props.drop.id);
const selected=label=>find(render(),label).props.accessibilityState.selected;
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
const mission={id:'test-mission',title:'Controlled fixture'};
async function boot(){render();pending('missions').resolve([mission]);await flush();pending('recent').resolve([]);await flush();}
let passed=0;
function pass(name){passed++;console.log('PASS '+name);}
(async()=>{
 reset();await boot();assert.equal(requests.some(r=>['permission','prompt','gps'].includes(r.kind)),false);assert.equal(selected('Recent'),true);pass('entry stays permission-free and selects Recent');
 press('Map area');const older=pending('area');press('Missions');pending('missions').resolve([mission]);await flush();pending('mission-drops').resolve([{id:'mission-new'}]);await flush();older.resolve([{id:'area-old'}]);await flush();assert.deepEqual(ids(),['mission-new']);assert.equal(selected('Missions'),true);pass('rapid filter changes reject older results');
 press('Map area');pending('area').resolve([]);await flush();byType(render(),'Map').props.onRegionChangeComplete({latitude:12,longitude:70,latitudeDelta:0.1,longitudeDelta:0.1});press('Search this area');const search=pending('area');press('Recent');pending('recent').resolve([{id:'recent-new'}]);await flush();search.resolve([{id:'search-old'}]);await flush();assert.deepEqual(ids(),['recent-new']);assert.equal(selected('Recent'),true);pass('area search cannot overwrite a later Recent request');
 press('Use my location to recenter map');const permission=pending('permission');press('Missions');pending('missions').resolve([mission]);await flush();pending('mission-drops').resolve([{id:'mission-current'}]);await flush();permission.resolve('denied');await flush();assert.equal(requests.some(r=>r.kind==='prompt'),false);assert.deepEqual(ids(),['mission-current']);pass('superseded permission lookup cannot open a dialog');
 press('Use my location to recenter map');pending('permission').resolve('denied');await flush();const prompt=pending('prompt');press('Recent');pending('recent').resolve([{id:'recent-after-prompt'}]);await flush();prompt.resolve('granted');await flush();assert.equal(requests.some(r=>r.kind==='gps'),false);assert.equal(selected('Recent'),true);pass('superseded OS prompt cannot start GPS');
 press('Use my location to recenter map');pending('permission').resolve('granted');await flush();const gps=pending('gps');press('Map area');pending('area').resolve([{id:'area-current'}]);await flush();gps.resolve({latitude:1,longitude:2});await flush();assert.deepEqual(ids(),['area-current']);assert.equal(byType(render(),'Circle'),undefined);pass('late GPS cannot recenter or install a viewer dot');
 press('Map area');const failure=pending('area');press('Recent');pending('recent').resolve([]);await flush();failure.reject(Error('stale failure'));await flush();assert.ok(!notices.some(n=>n.text==='stale failure'));pass('stale failures do not post current-screen notices');
 press('Map area');const departing=pending('area');cleanup();const before=writes;departing.resolve([{id:'departed'}]);await flush();assert.equal(writes,before);pass('unmount discards pending writes');
 reset();render();const startup=pending('missions');press('Missions');const current=pending('missions');current.resolve([mission]);await flush();pending('mission-drops').resolve([]);await flush();startup.resolve([mission]);await flush();assert.ok(byType(render(),'WorldMissionBeacon'),'initial mission metadata must survive a filter switch');pass('filter changes during startup preserve mission metadata');
 reset();render();const pendingStartup=pending('missions');press('Use my location to recenter map');pending('permission').resolve('denied');await flush();pending('prompt').resolve('denied');await flush();pendingStartup.resolve([mission]);await flush();assert.equal(byType(render(),'Spinner'),undefined,'denied recenter must release superseded startup loading');pass('denied Locate during startup cannot leave a permanent loading overlay');
 reset();render();const departingMetadata=pending('missions');cleanup();const priorWrites=writes;departingMetadata.resolve([mission]);await flush();assert.equal(writes,priorWrites);assert.equal(requests.some(r=>r.kind==='recent'),false);pass('unmounted startup cannot commit mission metadata or start a feed request');
 cleanup();console.log(`${passed}/${passed} World runtime checks passed; controlled hook bridge, not device tests.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
