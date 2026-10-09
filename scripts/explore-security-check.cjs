// Runs the actual Explore screen/hooks with controlled native dependencies.
// This is a client regression check, not physical Android verification.
const fs = require('fs'), Module = require('module'), babel = require('@babel/core');
const assert = require('node:assert/strict'), React = require('react');
for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (m, f) => m._compile(babel.transformSync(fs.readFileSync(f, 'utf8'), {
  filename: f, babelrc: false, configFile: false,
  presets: ['@babel/preset-typescript', ['@babel/preset-react', {runtime: 'automatic'}]],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, f);
let cells = [], index = 0, effects = [], uid = 'a', path = '/explore', calls = [], searches = new Map(), pageImpl;
const hooks = {...React,
  useState(v) { const i = index++; if (!(i in cells)) cells[i] = v; return [cells[i], n => {cells[i] = typeof n === 'function' ? n(cells[i]) : n;}]; },
  useRef(v) { const i = index++; if (!(i in cells)) cells[i] = {current: v}; return cells[i]; },
  useMemo(fn) { index++; return fn(); },
  useCallback(fn, deps) { const i = index++, old = cells[i]; if (!old || deps.some((d,j) => d !== old.deps[j])) cells[i] = {deps, fn}; return cells[i].fn; },
  useEffect(fn, deps) { const i = index++, old = cells[i]; if (!old || !deps || deps.some((d,j) => d !== old.deps?.[j])) effects.push(() => {old?.cleanup?.(); cells[i] = {deps, cleanup: fn()};}); },
};
const native = {StyleSheet: {create: x => x}, View: 'View', Text: 'Text', Pressable: 'Button', FlatList: 'List', ScrollView: 'Scroll', ActivityIndicator: 'Loading'};
const fade = {duration() {return this;}, delay() {return this;}};
let realService=false, rpcCalls=0, rpcArgs;
let history = [], treasureDetail, claimImpl, claimCalls=0;
const play={fetchTreasureDetail:async()=>treasureDetail,claimTreasureReward:()=>{claimCalls++;return claimImpl();}};
const service = {
  fetchExploreWorldSummary: async () => ({countries: [], challenges: [], treasures: []}),
  fetchExploreLive: async () => ({topics: [], takes: []}),
  fetchExploreForYou: (limit, cursor) => {calls.push(cursor); return pageImpl(cursor);},
  searchExplore: query => {const d = deferred(); searches.set(query, d); return d.promise;},
  clearTeleportHistory() {history = [];}, readTeleportHistory: () => history,
  rememberTeleportId: id => history.push(id), fetchTeleportCandidate: async () => null,
};
const original = Module._load;
Module._load = function(request, parent) {
  const own = parent?.filename.includes('Clash') && !parent.filename.includes('node_modules');
  if (own && request === 'react') return hooks;
  if (request === 'react-native') return native;
  if (request === 'expo-router') return {usePathname: () => path, useRouter: () => ({push() {}}),useLocalSearchParams:()=>({id:'hunt'})};
  if(request==='expo-linear-gradient')return{LinearGradient:'Gradient'};
  if(own&&request.endsWith('/playService'))return play;
  if(own&&request.endsWith('/useClock'))return{useClock:()=>Date.now()};
  if(own&&request.endsWith('/useRequireAuth'))return{useRequireAuth:()=>()=>Boolean(uid)};
  if (request === 'react-native-safe-area-context') return {useSafeAreaInsets: () => ({top: 0, bottom: 0})};
  if (request === 'react-native-reanimated') return {__esModule: true, default: {View: 'View'}, FadeIn: fade, FadeOut: fade, FadeInDown: fade, useReducedMotion: () => true, useSharedValue: value => ({value}), useAnimatedStyle: fn => fn(), interpolate: () => 0};
  if (own && request.endsWith('/AuthProvider')) return {useAuth: () => ({user: uid ? {id: uid} : null})};
  if (own && request.endsWith('/exploreService') && !realService) return service;
  if(own&&request.endsWith('/supabaseClient'))return{requireSupabase:()=>({rpc:async(name,args)=>{rpcCalls++;rpcArgs=args;return{data:{countryCode:'IN',activityCount:null},error:null};}}),requestError:e=>e,SupabaseError:class extends Error{constructor(message,code){super(message);this.code=code;}}};
  if(own&&request.endsWith('/mediaService'))return{getPublicMediaUrl:()=>null};
  if (own && request.endsWith('/useDebouncedValue')) return {useDebouncedValue: v => v};
  if (own && request.endsWith('/theme')) return {layout: {}, space: {}, radius: {}, typeScale: new Proxy({},{get:()=>({})}), useThemeColors: () => ({})};
  if (own && request.endsWith('/analytics')) return {analytics: {track() {}}};
  if (own && request.endsWith('/haptics')) return {tap() {},notify(){},press(){}};
  if (own && request.includes('/components/') && !request.endsWith('/ExploreAccountBoundary')) return new Proxy({}, {get: (_, name) => name === 'dockBottomPadding' ? () => 0 : String(name)});
  return original.apply(this, arguments);
};
function deferred() {let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject};}
function reset() {cells.forEach(c => c?.cleanup?.()); cells=[]; effects=[];}
function render(fn) {index=0; const tree=fn(); const run=effects; effects=[]; run.forEach(fn => fn()); return tree;}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
const node = (tree, type) => {const n=nodes(tree).find(n=>n.type===type); assert.ok(n, 'missing '+type); return n;};
async function flush() {for(let i=0;i<16;i++) await Promise.resolve();}
let passed=0;
function pass(name) {passed++; console.log('PASS '+name);}
(async () => {
  const boundary=require('../app/(tabs)/explore.tsx').default;
  let child=boundary(); const firstKey=child.key; uid='b'; assert.notEqual(boundary().key, firstKey); uid=null; assert.notEqual(boundary().key, firstKey);
  uid='a'; path='/explore/country/IN'; assert.notEqual(boundary().key, firstKey); path='/explore';
  pass('identity and route changes remount discovery state, including guest transitions');
  const scope=require('../hooks/useOperationScope.ts').useOperationScope;
  const a=render(()=>scope(uid)); uid='b'; const b=render(()=>scope(uid)); uid='a'; const again=render(()=>scope(uid));
  assert.equal(a(),false); assert.equal(b(),false); assert.equal(again(),true); reset(); assert.equal(again(),false);
  pass('A to B to A and unmount reject earlier asynchronous operations');
  const Screen=child.type;
  const late=deferred(); pageImpl=()=>late.promise; render(Screen); reset(); pageImpl=async()=>({items:[],nextCursor:24}); render(Screen); await flush();
  late.resolve({items:[{id:'old',kind:'TAKE',title:'old',score:50}],nextCursor:99}); await flush();
  let tree=render(Screen); assert.equal(node(tree,'List').props.data.length,0);
  pass('late initial data cannot populate a newly mounted account');
  const page=deferred(); pageImpl=()=>page.promise; const before=calls.length;
  node(tree,'List').props.onEndReached(); node(tree,'List').props.onEndReached(); assert.equal(calls.length,before+1);
  page.resolve({items:[{id:'new',kind:'TAKE',title:'New',score:50},{id:'new',kind:'TAKE',title:'New',score:50}],nextCursor:null}); await flush(); tree=render(Screen);
  assert.equal(JSON.stringify(node(tree,'List').props.data).match(/"id":"new"/g).length,1);
  node(tree,'List').props.onEndReached(); assert.equal(calls.length,before+1);
  pass('duplicate pagination taps/delivery are deduplicated and terminal cursors stop');
  node(tree,'ExploreSearch').props.onChange('older'); render(Screen); node(render(Screen),'ExploreSearch').props.onChange('newer'); render(Screen);
  searches.get('newer').resolve({marker:'newer',countries:[],people:[],takes:[],vaultPreviews:[],challenges:[]}); await flush();
  searches.get('older').resolve({marker:'older'}); await flush(); tree=render(Screen);
  assert.equal(nodes(tree).find(n=>typeof n.type==='function'&&n.type.name==='SearchHub').props.results.marker,'newer');
  pass('out-of-order search responses preserve the newest query');
  node(tree,'ExploreSearch').props.onChange('failure'); render(Screen); searches.get('failure').reject(Error('offline')); await flush(); tree=render(Screen);
  const retry=nodes(tree).find(n=>n.props?.accessibilityLabel==='Retry Explore'); assert.ok(retry); const previous=searches.get('failure'); retry.props.onPress(); render(Screen); assert.notEqual(searches.get('failure'),previous);
  pass('failed search exposes retry and reruns the request');
  reset(); treasureDetail={id:'hunt',title:'Hunt',completed:true,claimed:false,progress:1,clueCount:1,endsAt:Date.now()+100000};
  const Treasure=require('../app/explore/treasure/[id].tsx').default().type;
  const claim=deferred(); claimImpl=()=>claim.promise; render(Treasure); await flush(); tree=render(Treasure);
  node(tree,'GiftReveal').props.onClaim(); node(tree,'GiftReveal').props.onClaim(); assert.equal(claimCalls,1);
  reset(); render(Treasure); await flush(); claim.reject(Error('former account failure')); await flush(); tree=render(Treasure);
  assert.ok(!JSON.stringify(tree).includes('former account failure'));
  pass('reward claim blocks duplicate taps and ignores errors after account unmount');
  reset(); realService=true; const actual=require('../services/exploreService.ts');
  await assert.rejects(actual.fetchExploreCountry('../private'),{code:'invalid_country'}); assert.equal(rpcCalls,0);
  const country=await actual.fetchExploreCountry('in'); assert.deepEqual(rpcArgs,{p_country_code:'IN'}); assert.equal(country.activityCount,null);
  pass('country service rejects malformed codes before RPC and preserves suppressed counts');
  reset(); console.log(`${passed}/${passed} Explore client checks passed; controlled hook bridge, not device verification.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
