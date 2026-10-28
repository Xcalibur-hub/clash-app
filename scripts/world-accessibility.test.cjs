const test = require('node:test'), assert = require('node:assert/strict');
const { harness, nodes, text, React } = require('./ui-completion-harness.cjs');
const find = (tree, label) => nodes(tree).find(n => n.props?.accessibilityLabel === label);
const flat = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const leaf = name => ({ [name]: name });
const props = { activityStatus: 'ready', countries: [], challenges: [], treasures: [], selectedCode: null,
  onRetry() {}, onSelectCountry() {}, onOpenCountry() {}, onOpenChallenge() {}, onOpenTreasure() {}, onSurprise() {}, onClear() {} };
const worldDeps = Object.fromEntries(['WorldActiveRail', 'WorldCountryPanel', 'WorldSurpriseCard'].map(n => [n, leaf(n)]));

test('successful World empty copy scales without a line clamp; other read states never claim emptiness', async () => {
  const h = harness('components/explore/WorldExperience.tsx', props, e => e.WorldExperience, { dependencies: worldDeps });
  try {
    await h.mount();
    const copy = nodes(h.tree).find(n => text(n) === 'No public activity to map yet. Pick any country to look around.');
    assert.ok(copy); assert.notEqual(copy.props.allowFontScaling, false); assert.equal(copy.props.numberOfLines, undefined);
    assert.ok(flat(copy.props.style).marginRight > 0, 'empty copy reserves the floating rail footprint');
    for (const activityStatus of ['loading', 'error', 'unavailable']) {
      await h.update({ ...props, activityStatus }); assert.doesNotMatch(text(h.tree), /No public activity/);
    }
  } finally { await h.unmount(); }
});

test('country panel scales names, descriptions and CTA while keeping open and clear callbacks distinct', async () => {
  const calls = [], name = 'United Kingdom';
  const h = harness('components/explore/WorldCountryPanel.tsx', { code: 'GB', name, activityCount: null,
    content: { challenges: [], treasures: [] }, onOpenCountry: code => calls.push(['open', code]),
    onClear: () => calls.push(['clear']), onOpenChallenge() {}, onOpenTreasure() {} }, e => e.WorldCountryPanel);
  try {
    await h.mount();
    for (const n of nodes(h.tree).filter(n => n.type === 'Text')) {
      assert.notEqual(n.props.allowFontScaling, false); assert.equal(n.props.numberOfLines, undefined);
    }
    const open = find(h.tree, 'Explore '+name), clear = find(h.tree, 'Clear '+name);
    assert.ok(flat(open.props.style).minHeight >= 44);
    await h.act(async () => { open.props.onPress(); clear.props.onPress(); });
    assert.deepEqual(calls, [['open', 'GB'], ['clear']]);
  } finally { await h.unmount(); }
});

test('World map/globe and Search/Teleport retain callbacks with 44dp minimum targets', async () => {
  const dependencies = Object.fromEntries(['CountryPickerSheet', 'ExploreDiscoverShelves', 'ExploreFilterWheel', 'ExploreModeRail',
    'ExploreSearch', 'ExploreWorldCanvas', 'MeetHomePanel', 'PlayHomePanel', 'WorldExperience'].map(n => [n, leaf(n)]));
  Object.assign(dependencies, { ExploreAccountBoundary: { withExploreAccount: Screen => Screen },
    ExploreMosaicRow: leaf('ExploreMosaicRowView'), useDebouncedValue: { useDebouncedValue: x => x },
    'react-native-reanimated': { __esModule: true, default: { View: 'View' },
      useReducedMotion: () => true, useSharedValue: value => React.useRef({ value }).current,
      useAnimatedStyle: fn => fn(), interpolate: (v, [a, b], [x, y]) => x + (y - x) * (v - a) / (b - a),
      withTiming: value => value } });
  const h = harness('app/(tabs)/explore.tsx', {}, e => e.default, { dependencies });
  h.services.fetchExploreForYou = async () => ({ items: [], nextCursor: null });
  h.services.fetchExploreWorldSummary = async () => ({ countries: [], challenges: [], treasures: [] });
  h.services.fetchExploreLive = async () => ({ topics: [], takes: [] }); h.services.clearTeleportHistory = () => {};
  try {
    await h.mount(); const mode = nodes(h.tree).find(n => n.type === 'ExploreModeRail');
    await h.act(async () => mode.props.onChange('world'));
    for (const label of ['Map', 'Globe']) {
      const n = find(h.tree, label); assert.ok(flat(n.props.style).minHeight >= 44);
      assert.notEqual(nodes(n).find(x => x.type === 'Text').props.allowFontScaling, false);
    }
    await h.act(async () => find(h.tree, 'Globe').props.onPress());
    assert.equal(nodes(h.tree).find(n => n.type === 'ExploreWorldCanvas').props.visualMode, 'globe');
    for (const n of nodes(h.tree).filter(n => n.type?.name === 'RoundControl')) {
      const rendered = n.type(n.props), style = flat(rendered.props.style);
      assert.ok(style.minHeight >= 44 && style.minWidth >= 44);
      assert.notEqual(nodes(rendered).find(x => x.type === 'Text').props.allowFontScaling, false);
      if (n.props.label === 'Search') await h.act(async () => rendered.props.onPress());
    }
    assert.equal(nodes(h.tree).find(n => n.type === 'CountryPickerSheet').props.visible, true);
  } finally { await h.unmount(); }
});

test('country destination Back has 44dp geometry, real back/fallback routes and scalable country name', async () => {
  const calls = []; let canGoBack = true;
  const router = { canGoBack: () => canGoBack, back: () => calls.push('back'), replace: route => calls.push(route), push() {} };
  const h = harness('app/explore/country/[code].tsx', {}, e => e.default, { dependencies: {
    ExploreAccountBoundary: { withExploreAccount: Screen => Screen },
    'expo-router': { useLocalSearchParams: () => ({ code: 'GB' }), useRouter: () => router },
  } });
  h.services.fetchExploreCountry = async () => ({ takes: [], creators: [], vaultPreviews: [], challenges: [], treasures: [], liveTopics: [], activityCount: null });
  try {
    await h.mount(); const back = find(h.tree, 'Back'), style = flat(back.props.style);
    assert.ok(style.width >= 44 && style.height >= 44);
    const name = nodes(h.tree).find(n => n.type === 'Text' && text(n) === 'UNITED KINGDOM');
    assert.ok(name); assert.notEqual(name.props.allowFontScaling, false); assert.equal(name.props.numberOfLines, undefined);
    await h.act(async () => back.props.onPress()); canGoBack = false;
    await h.act(async () => back.props.onPress()); assert.deepEqual(calls, ['back', '/(tabs)/explore']);
  } finally { await h.unmount(); }
});
