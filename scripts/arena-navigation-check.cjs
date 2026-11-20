const fs = require('fs'),
  Module = require('module'),
  babel = require('@babel/core'),
  assert = require('node:assert/strict');
const realReact = require('react'),
  RN = require('react-native-web');
for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (mod, file) => mod._compile(babel.transformSync(fs.readFileSync(file, 'utf8'), {
  filename: file,
  babelrc: false,
  configFile: false,
  presets: ['@babel/preset-typescript', ['@babel/preset-react', {
    runtime: 'automatic'
  }]],
  plugins: ['@babel/plugin-transform-modules-commonjs']
}).code, file);
let values = [],
  index = 0,
  writes = [],
  focus = [],
  routes = [],
  catalogueResponse,
  topicsResponse,
  crewResponse,
  rpcCalls = 0;
const react = {
  ...realReact,
  useState(initial) {
    const i = index++;
    return [i < values.length ? values[i] : typeof initial === 'function' ? initial() : initial, v => writes.push([i, v])];
  },
  useCallback: fn => fn
};
const original = Module._load;
let theme;
const client = {
  from(table) {
    const filters = [];
    return {
      select() { return this; },
      eq(...args) { filters.push(args); return this; },
      filter(key,operator,value) { assert.equal(operator,'eq');filters.push([key,value]);return this; },
      gt(...args) { filters.push(args); return this; },
      then(resolve, reject) {
        if (table === 'takes') assert.ok(filters.some(([key,value]) => key === 'is_runtime_fixture' && value === false));
        return Promise.resolve({data:[],count:0,error:null}).then(resolve,reject);
      }
    };
  },
  async rpc(name) {
    assert.equal(name, 'list_arena_trending_battles');
    rpcCalls++;
    return {
      data: [],
      error: null
    };
  }
};
Module._load = function (request, parent) {
  // Native SVG Fabric modules contain Flow syntax; retain the production graph,
  // replacing only its native drawing primitives in this Node harness.
  if (request === 'react-native-svg') return { __esModule: true, default: RN.View, Line: RN.View };
  if (request === 'react-native-reanimated') return {__esModule:true,default:{Text:RN.Text,View:RN.View},useReducedMotion:()=>true};
  if (request === 'lucide-react-native') return { ArrowRight: RN.View, Plus: RN.View, Users: RN.View };
  if (request === 'react') return react;
  if (request === 'react-native') return { ...RN, useWindowDimensions: () => ({ width: 360, height: 800, scale: 1, fontScale: 1 }) };
  if (request.endsWith('/PressableScale')) return { PressableScale: RN.Pressable };
  if (request === 'expo-router') return {
    useRouter: () => ({
      push: p => routes.push(p)
    }),
    useFocusEffect: fn => focus.push(fn)
  };
  if (request === 'expo-constants') return {
    __esModule: true,
    default: {
      expoConfig: {
        extra: {
          appVariant: 'development'
        }
      }
    }
  };
  const file = Module._resolveFilename(request, parent).replaceAll('\\', '/');
  if (file.endsWith('/theme/index.ts')) return theme;
  if (file.endsWith('/components/shared/icons.ts')) return {
    ArenaIcon: RN.View,
    CreatorsIcon: RN.View,
    HashIcon: RN.View,
    SparklesIcon: RN.View
  };
  if (file.endsWith('/utils/haptics.ts')) return {
    tap() {}
  };
  if (file.endsWith('/store/AuthProvider.tsx')) return {
    useAuth: () => ({
      signedIn: true, user: { id: 'qa' }
    })
  };
  if (file.endsWith('/services/arenaInterestService.ts')) return {
    fetchInterestCatalogue: () => catalogueResponse
  };
  if (file.endsWith('/services/liveArenaService.ts')) return {
    fetchLiveTopics: () => topicsResponse
  };
  if (file.endsWith('/services/arenaCrewService.ts')) return {
    ARENA_CREW_SPECIALTIES: require('../utils/arenaCrewSpecialties.ts').ARENA_CREW_SPECIALTIES,
    listMyArenaCrews: () => crewResponse,
    listArenaCrews: () => crewResponse,
  };
  if (file.endsWith('/components/shared/GlowButton.tsx')) return { GlowButton: RN.View };
  if (file.endsWith('/services/supabaseClient.ts')) return {
    requireSupabase: () => client,
    requestError: e => new Error(e.message)
  };
  return original.apply(this, arguments);
};
function reset(next = []) {
  values = next;
  index = 0;
  writes = [];
  focus = [];
  routes = [];
}
function nodes(tree) {
  if (tree == null || typeof tree !== 'object') return [];
  return [tree, ...realReact.Children.toArray(tree.props?.children).flatMap(nodes)];
}
async function main() {
  theme = {
    ...require('../theme/layout.ts'),
    ...require('../theme/typography.ts'),
    ...require('../theme/colors.ts'),
    useThemeColors: () => require('../theme/palettes.ts').darkTheme,
    useTheme: () => ({ scheme: 'dark' })
  };
  const {
    ArenaSideRail
  } = require('../components/arena/ArenaSideRail.tsx');
  let mode;
  reset();
  const railTree = ArenaSideRail({
    mode: 'for_you',
    onChange: m => mode = m
  });
  const tabs = nodes(railTree).filter(n => n.props.accessibilityRole === 'tab');
  const links = nodes(railTree).filter(n => n.props.accessibilityRole === 'button');
  assert.equal(tabs.length, 2);
  assert.deepEqual(tabs.map(n => n.props.accessibilityState.selected), [true, false]);
  assert.deepEqual(links.map(n => n.props.accessibilityLabel), ['Groups', 'Discover']);
  console.log('PASS two Home modes with Groups and Discover route links');
  tabs[1].props.onPress();
  assert.equal(mode, 'clashes');
  links[0].props.onPress();
  links[1].props.onPress();
  assert.deepEqual(routes, ['/arena/crews', '/arena/topics']);
  console.log('PASS Live chip and Groups/Discover route interactions');
  const {
    ArenaTopics
  } = require('../components/arena/ArenaTopics.tsx');
  const interests = [{
    id: 'film',
    name: 'Film',
    description: 'Canonical',
    hoods: ['movies']
  }];
  const snapshot = topics => ({ owner: 'qa', catalogue: interests, topics, trends: [] });
  const noErrors = { catalogue: false, topics: false, trends: false };
  const discussion = {
    id: 'topic-live',
    title: 'Real discussion',
    viewerRoomId: 'room-canonical'
  };
  reset([snapshot([discussion]), false, noErrors, 0, null]);
  let opened;
  let tree = ArenaTopics({
    onOpenTopic: id => opened = id,
    onOpenRoom: id => opened = id
  });
  let buttons = nodes(tree).filter(n => n.props.accessibilityRole === 'button');
  buttons.find(button => button.props.accessibilityLabel === 'Explore Film').props.onPress();
  assert.ok(writes.some(([slot, value]) => slot === 4 && value === 'film'));
  // Select the actual constellation node before exercising its revealed Hood action.
  reset([snapshot([discussion]), false, noErrors, 0, 'film']);
  tree = ArenaTopics({ onOpenTopic: id => opened = id, onOpenRoom: id => opened = id });
  buttons = nodes(tree).filter(n => n.props.accessibilityRole === 'button');
  buttons.find(button => nodes(button).some(n => Array.isArray(n.props?.children) && n.props.children.join('').startsWith('Explore movies'))).props.onPress();
  assert.deepEqual(routes, ['/hood/movies']);
  buttons.find(button=>button.props.accessibilityLabel==='Open discussion Real discussion').props.onPress();
  assert.equal(opened, 'room-canonical');
  console.log('PASS catalogue mapping and existing Room navigation');
  reset([snapshot([{
    id: 'topic-real',
    title: 'Discussion',
    viewerRoomId: null
  }]), false, noErrors]);
  tree = ArenaTopics({
    onOpenTopic: id => opened = id,
    onOpenRoom: id => opened = id
  });
  nodes(tree).find(n => n.props.accessibilityLabel === 'Open discussion Discussion').props.onPress();
  assert.equal(opened, 'topic-real');
  console.log('PASS discussion without membership opens topic');
  reset([snapshot([]), false, { catalogue: true, topics: true, trends: false }]);
  tree = ArenaTopics({
    onOpenTopic() {},
    onOpenRoom() {}
  });
  const text = nodes(tree).map(n => n.props.children).filter(c => typeof c === 'string').join(' ');
  assert.match(text, /Couldn't load this map/);
  assert.match(text, /Couldn't load discussions/);
  assert.ok(!text.includes('No active discussions'));
  console.log('PASS failure is not misrepresented as no activity');
  let resolveA, resolveB;
  catalogueResponse = new Promise(r => resolveA = r);
  topicsResponse = new Promise(r => resolveB = r);
  reset();
  ArenaTopics({
    onOpenTopic() {},
    onOpenRoom() {}
  });
  const cleanup = focus[0]();
  writes = [];
  cleanup();
  resolveA(interests);
  resolveB([]);
  await new Promise(r => setImmediate(r));
  assert.equal(writes.length, 0);
  console.log('PASS late catalogue/discussion responses discarded after unmount');
  process.env.EXPO_PUBLIC_ARENA_TREND_DEMO = '1';
  global.__DEV__ = true;
  const trends = require('../services/arenaTrendService.ts');
  assert.equal(trends.trendingDemoActive(), true);
  const beforeTrendRead = rpcCalls;
  assert.deepEqual(await trends.fetchTrendingBattles(10, true), []);
  assert.equal(rpcCalls - beforeTrendRead, 1);
  console.log('PASS server-only trends bypass an enabled development fixture');
  const hoodService = require('../services/hoodService.ts');
  assert.equal((await hoodService.fetchHoodOverview('techtakes')).liveCount,0);
  assert.ok((await hoodService.fetchHoodSummaries()).every(item => item.liveCount===0));
  console.log('PASS both actual Hood count queries exclude runtime fixtures');
  const { HoodHeader } = require('../components/arena/HoodHeader.tsx');
  const header=HoodHeader({hood:{name:'Tech',description:'Real',rules:[]},memberCount:null,liveCount:null,joined:false,joining:false,onToggleJoin(){}});
  assert.ok(nodes(header).some(n=>n.props.children==='Live takes unavailable'));
  console.log('PASS unknown Hood count never becomes a fabricated zero');
  const { ArenaCommunity }=require('../components/arena/ArenaCommunity.tsx');
  const renderCommunity = () => { const child = ArenaCommunity({}); return child.type(child.props); };
  reset(['explore', null, 'popular', [null], 0, 0,
    { owner: 'qa', query: JSON.stringify([0,null,'popular',false]), mine: [], page: [], hasMore: false }, false, false]);
  const community=renderCommunity();
  assert.ok(nodes(community).some(n=>n.props.children==='No groups match this interest. Try another or create your own.'));
  console.log('PASS empty Crew discovery remains honest');
  let resolveCrew;
  crewResponse=new Promise(r=>resolveCrew=r);reset();renderCommunity();
  const disposeCrew=focus[0]();writes=[];disposeCrew();resolveCrew([]);
  await new Promise(r=>setImmediate(r));assert.equal(writes.length,0);
  console.log('PASS late Crew response cannot repopulate disposed account view');
  console.log('11/11 Arena navigation component/service checks passed (hook bridge, not device verification).');
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
