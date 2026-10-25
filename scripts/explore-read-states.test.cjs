const test = require('node:test'), assert = require('node:assert/strict');
const { harness, deferred, nodes, text, React } = require('./ui-completion-harness.cjs');
const leaf = name => ({ [name]: name });
const dependencies = Object.fromEntries(['CountryPickerSheet', 'ExploreDiscoverShelves', 'ExploreFilterWheel',
  'ExploreModeRail', 'ExploreSearch', 'ExploreWorldCanvas', 'MeetHomePanel', 'PlayHomePanel',
  'WorldActiveRail', 'WorldCountryPanel', 'WorldSurpriseCard'].map(name => [name, leaf(name)]));
Object.assign(dependencies, {
  ExploreAccountBoundary: { withExploreAccount: Screen => Screen },
  ExploreMosaicRow: leaf('ExploreMosaicRowView'),
  useDebouncedValue: { useDebouncedValue: value => value },
  'react-native-reanimated': { __esModule: true, default: { View: 'View' },
    useReducedMotion: () => true, useSharedValue: value => React.useRef({ value }).current,
    useAnimatedStyle: fn => fn(), interpolate: (v, [a, b], [x, y]) => x + (y - x) * (v - a) / (b - a),
    withTiming: value => value },
});
const node = (tree, name) => nodes(tree).find(n => (n.type?.name ?? n.type) === name);
const emptyWorld = { countries: [], challenges: [], treasures: [] };
const item = { id: 'one', kind: 'TAKE', title: 'Existing content', score: 1, href: '/take/one' };
function setup() {
  const h = harness('app/(tabs)/explore.tsx', {}, e => e.default, { dependencies });
  const feed = deferred(), world = deferred(), live = deferred();
  const counts = { feed: 0, world: 0, live: 0 };
  h.services.fetchExploreForYou = () => { counts.feed++; return feed.promise; };
  h.services.fetchExploreWorldSummary = () => { counts.world++; return world.promise; };
  h.services.fetchExploreLive = () => { counts.live++; return live.promise; };
  h.services.clearTeleportHistory = () => {};
  return { h, feed, world, live, counts };
}
const list = h => node(h.tree, 'FlatList');
const header = h => list(h).props.ListHeaderComponent;
const empty = h => text(list(h).props.ListEmptyComponent);
const feedback = (h, tree) => {
  const n = node(tree, 'ReadFeedback');
  return h.load('components/shared/ReadFeedback.tsx').ReadFeedback(n.props);
};
const mode = (h, value) => h.act(async () => node(h.tree, 'ExploreModeRail').props.onChange(value));
const worldView = h => h.load('components/explore/WorldExperience.tsx').WorldExperience(node(h.tree, 'WorldExperience').props);
const retry = (h, tree) => h.act(async () => node(feedback(h, tree), 'Pressable').props.onPress());

test('loading feed and World never claim successful emptiness', async () => {
  const { h } = setup();
  try {
    await h.mount(); assert.equal(empty(h), ''); assert.ok(list(h).props.ListFooterComponent);
    await mode(h, 'world'); const view = worldView(h);
    assert.match(text(feedback(h, view)), /Loading\s+World activity/);
    assert.doesNotMatch(text(view), /No public activity/);
  } finally { await h.unmount(); }
});

test('failed feed is not empty; World success is independent; feed retry makes one read', async () => {
  const { h, feed, world, counts } = setup();
  try {
    await h.mount(); await h.act(async () => { feed.reject(Error('offline')); world.resolve(emptyWorld); });
    assert.equal(empty(h), ''); assert.match(text(feedback(h, header(h))), /Couldn't load Explore feed/);
    await h.act(async () => list(h).props.onEndReached()); assert.equal(counts.feed, 1);
    await mode(h, 'world'); assert.match(text(worldView(h)), /No public activity/);
    await mode(h, 'for_you'); const next = deferred(); h.services.fetchExploreForYou = () => { counts.feed++; return next.promise; };
    await retry(h, header(h)); assert.equal(empty(h), ''); assert.equal(counts.world, 1);
    await h.act(async () => next.resolve({ items: [item], nextCursor: null }));
    assert.equal(list(h).props.data.length, 1); assert.equal(counts.feed, 2);
  } finally { await h.unmount(); }
});

test('failed World does not discard a populated feed or its filters', async () => {
  const { h, feed, world } = setup();
  try {
    await h.mount(); await h.act(async () => { feed.resolve({ items: [item], nextCursor: null }); world.reject(Error('offline')); });
    assert.equal(list(h).props.data.length, 1); assert.equal(node(header(h), 'ReadFeedback').props.status, 'ready');
    await h.act(async () => node(h.tree, 'ExploreFilterWheel').props.onChange('video'));
    assert.match(empty(h), /Nothing here yet/); // successful read, no eligible video rows
    await mode(h, 'world'); const view = worldView(h);
    assert.match(text(feedback(h, view)), /Couldn't load World activity/); assert.doesNotMatch(text(view), /No public activity/);
    await mode(h, 'for_you'); assert.equal(node(h.tree, 'ExploreFilterWheel').props.value, 'video');
  } finally { await h.unmount(); }
});

test('successful empty reads alone expose feed and World empty copy', async () => {
  const { h, feed, world } = setup();
  try {
    await h.mount(); await h.act(async () => { feed.resolve({ items: [], nextCursor: null }); world.resolve(emptyWorld); });
    assert.match(empty(h), /Nothing here yet/);
    await mode(h, 'world'); assert.match(text(worldView(h)), /No public activity/);
  } finally { await h.unmount(); }
});

test('World retry is isolated; selected-country navigation survives unavailable activity', async () => {
  const { h, feed, world, counts } = setup();
  try {
    await h.mount(); await h.act(async () => { feed.reject(Error('feed offline')); world.reject(Error('world offline')); });
    await mode(h, 'world'); await h.act(async () => node(h.tree, 'ExploreWorldCanvas').props.onSelectCountry('IN'));
    let view = worldView(h); assert.ok(!node(view, 'WorldCountryPanel'));
    await h.act(async () => nodes(view).find(n => n.props?.accessibilityLabel === 'Explore India').props.onPress());
    assert.deepEqual(h.calls.pop(), ['push', '/explore/country/IN']);
    const next = deferred(); h.services.fetchExploreWorldSummary = () => { counts.world++; return next.promise; };
    await retry(h, view); assert.equal(counts.feed, 1); assert.equal(counts.world, 2);
    assert.equal(node(worldView(h), 'ReadFeedback').props.status, 'loading');
    await h.act(async () => next.resolve({ ...emptyWorld, countries: [{ countryCode: 'IN', name: 'India', activityCount: 5 }] }));
    view = worldView(h); assert.equal(node(view, 'WorldCountryPanel').props.name, 'India');
    assert.doesNotMatch(text(view), /No public activity/);
  } finally { await h.unmount(); }
});

test('pagination failure and retry retain loaded content without automatic repeated reads', async () => {
  const { h, feed, world } = setup();
  try {
    await h.mount(); await h.act(async () => { feed.resolve({ items: [item], nextCursor: 24 }); world.resolve(emptyWorld); });
    let reads = 0; h.services.fetchExploreForYou = async () => { reads++; throw Error('page offline'); };
    await h.act(async () => list(h).props.onEndReached());
    assert.equal(list(h).props.data.length, 1); assert.equal(empty(h), '');
    assert.equal(node(header(h), 'ReadFeedback').props.status, 'error');
    await h.act(async () => list(h).props.onEndReached()); assert.equal(reads, 1);
    const next = deferred(); h.services.fetchExploreForYou = () => next.promise;
    await retry(h, header(h)); assert.equal(list(h).props.data.length, 1);
    await h.act(async () => next.reject(Error('retry offline'))); assert.equal(list(h).props.data.length, 1);
    assert.equal(node(header(h), 'ReadFeedback').props.status, 'error');
  } finally { await h.unmount(); }
});

test('feed/World failures never appear over independent Live or Play', async () => {
  const { h, feed, world, live, counts } = setup();
  try {
    await h.mount(); await h.act(async () => { feed.reject(Error('feed')); world.reject(Error('world')); });
    await mode(h, 'live'); assert.doesNotMatch(text(h.tree), /unavailable|Could not load more/);
    assert.equal(node(h.tree, 'ExploreLivePanel').props.live.status, 'loading');
    await h.act(async () => live.resolve({ topics: [], takes: [] }));
    assert.equal(node(h.tree, 'ExploreLivePanel').props.live.status, 'ready');
    await mode(h, 'play'); assert.ok(node(h.tree, 'PlayHomePanel'));
    assert.doesNotMatch(text(h.tree), /unavailable|Could not load more/); assert.deepEqual(counts, { feed: 1, world: 1, live: 1 });
  } finally { await h.unmount(); }
});

test('unmounted feed and World responses cannot update the disposed screen', async () => {
  const { h, feed, world } = setup(); await h.mount(); const before = h.tree;
  await h.unmount(); feed.resolve({ items: [item], nextCursor: null }); world.resolve(emptyWorld);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h.tree, before);
});
