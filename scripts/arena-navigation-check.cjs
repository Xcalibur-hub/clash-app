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
    return [i < values.length ? values[i] : initial, v => writes.push([i, v])];
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
  if (request === 'react-native-reanimated') return {__esModule:true,default:{Text:RN.Text},useReducedMotion:()=>true};
  if (request === 'react') return react;
  if (request === 'react-native') return RN;
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
      signedIn: true
    })
  };
  if (file.endsWith('/services/arenaInterestService.ts')) return {
    fetchInterestCatalogue: () => catalogueResponse
  };
  if (file.endsWith('/services/liveArenaService.ts')) return {
    fetchLiveTopics: () => topicsResponse
  };
  if (file.endsWith('/services/arenaCrewService.ts')) return {
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
    useThemeColors: () => require('../theme/palettes.ts').darkTheme
  };
  const {
    ArenaSideRail
  } = require('../components/arena/ArenaSideRail.tsx');
  let mode;
  reset();
  const tabs = nodes(ArenaSideRail({
    mode: 'for_you',
    onChange: m => mode = m
  })).filter(n => n.props.accessibilityRole === 'tab');
  assert.equal(tabs.length, 4);
  assert.deepEqual(tabs.map(n => n.props.accessibilityState.selected), [true, false, false, false]);
  console.log('PASS four destinations with selected accessibility state');
  tabs[1].props.onPress();
  assert.equal(mode, 'clashes');
  tabs[2].props.onPress();
  assert.equal(mode, 'community');
  tabs[3].props.onPress();
  assert.equal(mode, 'topics');
  console.log('PASS all non-Home destination interactions');
  const {
    ArenaTopics
  } = require('../components/arena/ArenaTopics.tsx');
  const interests = [{
    id: 'film',
    name: 'Film',
    description: 'Canonical',
    hoods: ['movies']
  }];
  reset([interests, [{
    id: 'topic-live',
    title: 'Real discussion',
    viewerRoomId: 'room-canonical'
  }], false, false, false]);
  let opened;
  let tree = ArenaTopics({
    onOpenTopic: id => opened = id,
    onOpenRoom: id => opened = id
  });
  let buttons = nodes(tree).filter(n => n.props.accessibilityRole === 'button');
  buttons[0].props.onPress();
  assert.deepEqual(routes, ['/hood/movies']);
  buttons.find(button=>button.props.accessibilityLabel==='Open discussion Real discussion').props.onPress();
  assert.equal(opened, 'room-canonical');
  console.log('PASS catalogue mapping and existing Room navigation');
  reset([[], [{
    id: 'topic-real',
    title: 'Discussion',
    viewerRoomId: null
  }], false, false, false]);
  tree = ArenaTopics({
    onOpenTopic: id => opened = id,
    onOpenRoom: id => opened = id
  });
  nodes(tree).find(n => n.props.accessibilityRole === 'button').props.onPress();
  assert.equal(opened, 'topic-real');
  console.log('PASS discussion without membership opens topic');
  reset([[], [], false, true, true]);
  tree = ArenaTopics({
    onOpenTopic() {},
    onOpenRoom() {}
  });
  const text = nodes(tree).map(n => n.props.children).filter(c => typeof c === 'string').join(' ');
  assert.match(text, /Couldn't load topics/);
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
  assert.deepEqual(await trends.fetchTrendingBattles(10, true), []);
  assert.equal(rpcCalls, 1);
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
  reset([[],[],false,false,0,false]);
  const community=ArenaCommunity({});
  assert.ok(nodes(community).some(n=>n.props.children==='No communities available.'));
  console.log('PASS empty Crew discovery remains honest');
  let resolveCrew;
  crewResponse=new Promise(r=>resolveCrew=r);reset();ArenaCommunity({});
  const disposeCrew=focus[0]();writes=[];disposeCrew();resolveCrew([]);
  await new Promise(r=>setImmediate(r));assert.equal(writes.length,0);
  console.log('PASS late Crew response cannot repopulate disposed account view');
  console.log('11/11 Arena navigation component/service checks passed (hook bridge, not device verification).');
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
