// Production screen/component functions mounted with React; transport/native boundaries stay offline.
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, deferred, nodes, text, React } = require('./ui-completion-harness.cjs');
const leaf = name => ({ [name]: name });
const focus = { useFocusEffect: callback => React.useEffect(callback, [callback]) };
const state = { arenaStatus: 'ready', viewer: { id: 'a' } }, dispatch = () => {};
const store = { useClash: () => ({ state, dispatch, reloadArena: async () => {} }),
  selectFeedForScope: () => [], showNotice: text => ({ text }) };
const homeDeps = Object.fromEntries(['ArenaTopBar', 'ArenaLiveGateway', 'ArenaDiscoveryRail', 'ArenaSideRail',
  'ArenaCommunity', 'ArenaTopics', 'ArenaAtmosphere', 'ArenaEntrance', 'FreshTakesSection',
  'PostActionsSheet', 'TakeFeedItem', 'LiveDuelCard', 'ArenaSheet'].map(name => [name, leaf(name)]));
Object.assign(homeDeps, { store, native: focus, 'expo-router': { ...focus, useRouter: () => ({ push() {} }) },
  useRequireAuth: { useRequireAuth: () => () => true }, arenaEntranceState: { consumeArenaEntrance: () => false },
  ArenaPrimitives: leaf('ArenaButton'), arena: { arena: { type: {} } } });

test('Home Back ownership follows actual navigation focus, cleanup and refocus', async () => {
  const back = new Set(), listeners = { focus: new Set(), blur: new Set() };
  let focused = true, useActualFocus;
  const navigation = { isFocused: () => focused, addListener(event, callback) {
    listeners[event].add(callback); return () => listeners[event].delete(callback);
  } };
  const native = { ...Object.fromEntries(['View', 'Text', 'Pressable', 'FlatList'].map(n => [n, n])),
    StyleSheet: { create: x => x }, BackHandler: { addEventListener(event, callback) {
      assert.equal(event, 'hardwareBackPress'); back.add(callback);
      return { remove() { back.delete(callback); } };
    } } };
  const h = harness('app/(tabs)/index.tsx', {}, e => e.default, { dependencies: {
    ...homeDeps, 'react-native': native,
    native: { useFocusEffect: callback => useActualFocus(callback) },
    useNavigation: { useNavigation: () => navigation },
  } });
  useActualFocus = h.load('node_modules/@react-navigation/core/src/useFocusEffect.tsx').useFocusEffect;
  h.services.fetchFollowingIds = async () => []; h.services.fetchLiveTopics = async () => [];
  const mode = () => h.nodes.find(n => n.type === 'ArenaSideRail').props.mode;
  const selectLive = () => h.nodes.find(n => n.type === 'ArenaSideRail').props.onChange('clashes');
  const hardwareBack = () => [...back].reverse().some(callback => callback());
  try {
    await h.mount(); await h.act(async () => selectLive());
    assert.equal(back.size, 1);
    await h.act(async () => assert.equal(hardwareBack(), true));
    assert.equal(mode(), 'for_you');
    for (const route of ['/arena/challenges', '/arena/crews', '/arena/topics', '/explore']) {
      await h.act(async () => selectLive());
      await h.act(async () => { focused = false; for (const callback of listeners.blur) callback(); });
      assert.equal(back.size, 0, 'No background Home listener on ' + route);
      assert.equal(hardwareBack(), false);
      assert.equal(mode(), 'clashes');
      await h.act(async () => { focused = true; for (const callback of listeners.focus) callback(); });
      assert.equal(back.size, 1, 'One listener after refocus');
      assert.equal(mode(), 'clashes');
    }
  } finally { await h.unmount(); }
  assert.equal(back.size, 0);
  assert.equal(listeners.focus.size + listeners.blur.size, 0);
});
function ancestry(tree, name, parents = []) {
  if (!tree || typeof tree !== 'object') return null;
  if ((tree.type?.name ?? tree.type) === name) return [...parents, tree];
  for (const child of React.Children.toArray(tree.props?.children)) {
    const found = ancestry(child, name, [...parents, tree]); if (found) return found;
  }
  return null;
}
test('production Home gives Live a bounded View and keeps Groups/Discover off the Home list', async () => {
  const h = harness('app/(tabs)/index.tsx', {}, e => e.default, { dependencies: homeDeps });
  h.services.fetchFollowingIds = async () => []; h.services.fetchLiveTopics = async () => [];
  try {
    await h.mount();
    for (const mode of ['clashes', 'for_you', 'clashes']) {
      await h.act(async () => h.nodes.find(n => n.type === 'ArenaSideRail').props.onChange(mode));
      const child = mode === 'clashes' ? 'ArenaClashes' : 'FlatList';
      const chain = ancestry(h.tree, child); assert.ok(chain, child);
      assert.equal(chain.slice(0, -1).some(n => n.type === 'FlatList'), false);
      assert.equal(h.nodes.some(n => n.type === 'ArenaCommunity' || n.type === 'ArenaTopics'), false);
      if (mode === 'clashes') {
        assert.equal(chain.at(-2).type, 'View');
        assert.equal(Object.assign({}, ...chain.at(-2).props.style.filter(Boolean)).flex, 1);
        const live = harness('components/arena/ArenaClashes.tsx', chain.at(-1).props, e => e.ArenaClashes, { dependencies: homeDeps });
        live.services.fetchPersonalizedLiveDiscovery = async () => ({ rows: [], signals: {} });
        try {
          await live.mount();
          const list = live.nodes.find(n => n.type === 'FlatList');
          assert.ok(list);
          assert.equal(list.props.style.flex, 1);
          assert.equal(typeof list.props.onRefresh, 'function');
          assert.equal(typeof list.props.onEndReached, 'function');
          assert.ok(list.props.contentContainerStyle.at(-1).paddingBottom > 0);
        } finally { await live.unmount(); }
      }
      const rail = ancestry(h.tree, 'ArenaSideRail');
      assert.equal(rail.some(n => n.type === 'ScrollView' || n.type === 'FlatList'), false);
    }
  } finally { await h.unmount(); }
});

const worldDeps = Object.fromEntries(['WorldDropMarker', 'WorldDropPreview', 'WorldMissionBeacon',
  'WorldMissionCard', 'WorldDropCard'].map(name => [name, leaf(name)]));
Object.assign(worldDeps, { store, native: focus, useRequireAuth: { useRequireAuth: () => () => true },
  'react-native': { ...Object.fromEntries(['View', 'Text', 'Pressable', 'ScrollView', 'ActivityIndicator'].map(n => [n, n])),
    Platform: { OS: 'android' }, StyleSheet: { create: x => x, hairlineWidth: 1, absoluteFill: {} } },
  'react-native-maps': { __esModule: true, default: 'Map', Circle: 'Circle' },
  worldNativeMapAvailability: { isWorldNativeMapAvailable: () => false } });
// Keep the normal theme boundary but provide useTheme, which this screen also reads.
worldDeps.theme = { useTheme: () => ({ scheme: 'dark' }), useThemeColors: () => ({ textPrimary: '#fff', textSecondary: '#ccc', border: '#333' }),
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { card: 16 }, typeScale: {} };
const mission = { id: 'mission', title: 'Fictional offline Mission' }, drop = { id: 'drop', author: { handle: 'qa' } };
function world() {
  const h = harness('app/world/index.tsx', {}, e => e.default, { dependencies: worldDeps });
  const reads = { missions: [], drops: [] };
  h.services.errorText = error => error.message;
  h.services.fetchActiveMissions = () => { const d = deferred(); reads.missions.push(d); return d.promise; };
  h.services.fetchRecentWorldDrops = () => { const d = deferred(); reads.drops.push(d); return d.promise; };
  const fallback = harness('components/world/WorldMapUnavailable.tsx', {}, e => e.WorldMapUnavailable, { dependencies: worldDeps });
  const sync = async () => { const component = h.nodes.find(n => n.type?.name === 'WorldMapUnavailable'); assert.ok(component); await fallback.update(component.props); };
  const feedback = () => fallback.nodes.filter(n => n.type?.name === 'ReadFeedback').map(n => n.type(n.props));
  return { h, reads, fallback, sync, feedback, async close() { await fallback.unmount(); await h.unmount(); } };
}
test('World fallback stays loading until each independent read succeeds; only success-empty shows empty copy', async () => {
  const w = world();
  try {
    await w.h.mount(); await w.sync();
    assert.equal(w.reads.missions.length, 1); assert.equal(w.reads.drops.length, 1);
    assert.doesNotMatch(text(w.fallback.tree), /No active Mission|No recent Drops/);
    assert.deepEqual(w.feedback().map(n => n.props.accessibilityLabel), ['Loading World missions', 'Loading World drops']);
    await w.h.act(async () => w.reads.missions[0].resolve([])); await w.sync();
    assert.match(text(w.fallback.tree), /No active Mission/); assert.doesNotMatch(text(w.fallback.tree), /No recent Drops/);
    await w.h.act(async () => w.reads.drops[0].resolve([])); await w.sync();
    assert.match(text(w.fallback.tree), /No recent Drops/);
    assert.equal(w.h.nodes.some(n => n.type === 'Map'), false);
  } finally { await w.close(); }
});
test('World mission failure retains populated Drops and retries only missions through the visible Retry control', async () => {
  const w = world();
  try {
    await w.h.mount();
    await w.h.act(async () => { w.reads.missions[0].reject(Error('offline')); w.reads.drops[0].resolve([drop]); });
    await w.sync(); assert.doesNotMatch(text(w.fallback.tree), /No active Mission|No recent Drops/);
    assert.equal(w.fallback.nodes.find(n => n.type === 'WorldDropCard').props.drop.id, 'drop');
    const feedback = w.feedback()[0]; assert.match(text(feedback), /Couldn't load World missions/);
    const retry = nodes(feedback).find(n => n.props?.accessibilityLabel === 'Retry World missions');
    await w.h.act(async () => retry.props.onPress()); await w.sync();
    assert.equal(w.reads.missions.length, 2); assert.equal(w.reads.drops.length, 1);
    assert.doesNotMatch(text(w.fallback.tree), /No active Mission/);
    await w.h.act(async () => w.reads.missions[1].resolve([mission])); await w.sync();
    assert.equal(w.fallback.nodes.find(n => n.type === 'WorldMissionCard').props.mission.id, 'mission');
    assert.equal(w.feedback()[0], null);
  } finally { await w.close(); }
});
test('World Drop failure retains Mission; Drop retry is independent and successful empty is truthful', async () => {
  const w = world();
  try {
    await w.h.mount(); await w.h.act(async () => { w.reads.missions[0].resolve([mission]); w.reads.drops[0].reject(Error('offline')); });
    await w.sync(); assert.ok(w.fallback.nodes.find(n => n.type === 'WorldMissionCard'));
    assert.doesNotMatch(text(w.fallback.tree), /No recent Drops/);
    const retry = nodes(w.feedback()[1]).find(n => n.props?.accessibilityLabel === 'Retry World drops');
    await w.h.act(async () => retry.props.onPress()); await w.sync();
    assert.equal(w.reads.missions.length, 1); assert.equal(w.reads.drops.length, 2);
    await w.h.act(async () => w.reads.drops[1].resolve([])); await w.sync();
    assert.match(text(w.fallback.tree), /No recent Drops/);
  } finally { await w.close(); }
});
test('World failures do not become successful empty; departure invalidates both pending retries', async () => {
  const w = world();
  try {
    await w.h.mount(); await w.h.act(async () => { w.reads.missions[0].reject(Error('offline')); w.reads.drops[0].reject(Error('offline')); });
    await w.sync(); assert.doesNotMatch(text(w.fallback.tree), /No active Mission|No recent Drops/);
    assert.equal(w.feedback().filter(n => /Couldn't load/.test(text(n))).length, 2);
    await w.h.act(async () => { for (const feedback of w.feedback()) nodes(feedback).find(n => n.type === 'Pressable').props.onPress(); });
    await w.h.unmount();
    await w.h.act(async () => { w.reads.missions[1].resolve([mission]); w.reads.drops[1].resolve([drop]); });
    assert.equal(w.h.nodes.find(n => n.type?.name === 'WorldMapUnavailable').props.missionStatus, 'loading');
  } finally { await w.close(); }
});
