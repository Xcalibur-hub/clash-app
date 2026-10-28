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
  'PostActionsSheet', 'TakeFeedItem', 'LiveDuelCard'].map(name => [name, leaf(name)]));
Object.assign(homeDeps, { store, native: focus, 'expo-router': { ...focus, useRouter: () => ({ push() {} }) },
  useRequireAuth: { useRequireAuth: () => () => true }, arenaEntranceState: { consumeArenaEntrance: () => false },
  ArenaPrimitives: leaf('ArenaButton'), arena: { arena: { type: {} } } });
function ancestry(tree, name, parents = []) {
  if (!tree || typeof tree !== 'object') return null;
  if ((tree.type?.name ?? tree.type) === name) return [...parents, tree];
  for (const child of React.Children.toArray(tree.props?.children)) {
    const found = ancestry(child, name, [...parents, tree]); if (found) return found;
  }
  return null;
}
test('production Home gives Live a bounded View and preserves separate Groups/Discover scroll and rail', async () => {
  const h = harness('app/(tabs)/index.tsx', {}, e => e.default, { dependencies: homeDeps });
  h.services.fetchFollowingIds = async () => []; h.services.fetchLiveTopics = async () => [];
  try {
    await h.mount();
    for (const mode of ['clashes', 'community', 'topics', 'clashes', 'for_you']) {
      await h.act(async () => h.nodes.find(n => n.type === 'ArenaSideRail').props.onChange(mode));
      const child = mode === 'clashes' ? 'ArenaClashes' : mode === 'community' ? 'ArenaCommunity' : mode === 'topics' ? 'ArenaTopics' : 'FlatList';
      const chain = ancestry(h.tree, child); assert.ok(chain, child);
      assert.equal(chain.slice(0, -1).some(n => n.type === 'FlatList'), false);
      assert.equal(chain.slice(0, -1).some(n => n.type === 'ScrollView'), ['community', 'topics'].includes(mode));
      if (mode === 'clashes') {
        assert.equal(chain.at(-2).type, 'View');
        assert.equal(Object.assign({}, ...chain.at(-2).props.style.filter(Boolean)).flex, 1);
        const live = harness('components/arena/ArenaClashes.tsx', chain.at(-1).props, e => e.ArenaClashes, { dependencies: homeDeps });
        live.services.fetchPersonalizedLiveDiscovery = async () => ({ rows: [], signals: {} });
        try {
          await live.mount(); assert.equal(live.tree.type, 'FlatList');
          assert.equal(live.tree.props.style.flex, 1);
          assert.equal(typeof live.tree.props.onRefresh, 'function');
          assert.equal(typeof live.tree.props.onEndReached, 'function');
          assert.ok(live.tree.props.contentContainerStyle.at(-1).paddingBottom > 0);
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
