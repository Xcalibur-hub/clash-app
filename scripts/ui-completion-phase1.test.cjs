const test = require('node:test'), assert = require('node:assert/strict');
const { harness, deferred, text, nodes } = require('./ui-completion-harness.cjs');
const node = (h, type) => h.nodes.find(n => typeof n.type === 'function' ? n.type.name === type : n.type === type);
const feedback = h => { const n = node(h, 'ReadFeedback'); return h.load('components/shared/ReadFeedback.tsx').ReadFeedback(n.props); };
const press = async (h, target) => h.act(async () => target.props.onPress());
const liveHarness = () => harness('components/explore/ExploreLivePanel.tsx', {}, exports => () => exports.ExploreLivePanel({ live: exports.useExploreLive() }));
const hookHarness = props => harness('hooks/useRetryableRead.ts', props, exports => p => exports.useRetryableRead(p.load, p.scope));

test('read retry is explicit; stale account responses never restore prior-account content', async () => {
  const a = deferred(), b = deferred(); let calls = 0;
  const loadA = () => { calls++; return a.promise; }, loadB = () => { calls++; return b.promise; };
  const h = hookHarness({ load: loadA, scope: 'a' });
  try {
    await h.mount(); assert.equal(h.tree.status, 'loading');
    await h.update({ load: loadB, scope: 'b' });
    await h.act(async () => a.resolve(['private-a'])); assert.equal(h.tree.data, null);
    await h.act(async () => b.reject(Error('offline'))); assert.equal(h.tree.status, 'error'); assert.equal(calls, 2);
    const next = deferred(); await h.update({ load: () => next.promise, scope: 'b' });
    await h.act(async () => next.resolve(['b'])); assert.deepEqual(h.tree.data, ['b']);
    await h.act(async () => h.tree.retry()); assert.equal(h.tree.status, 'ready'); // resolved promise re-read
  } finally { await h.unmount(); }
});

for (const [value, expected] of [[null, 'missing'], [[], 'ready'], [{ code: '42501' }, 'denied'], [{ code: 'not_configured' }, 'unavailable']]) {
  test(`read classifies ${expected} without raw errors or silent empty fallback`, async () => {
    const h = hookHarness({ scope: 'a', load: async () => { if (value?.code) throw value; return value; } });
    try { await h.mount(); assert.equal(h.tree.status, expected); } finally { await h.unmount(); }
  });
}

test('unmounted reads settle without another render or retry', async () => {
  const gate = deferred(); let calls = 0;
  const h = hookHarness({ scope: 'a', load: () => { calls++; return gate.promise; } });
  await h.mount(); const before = h.tree; await h.unmount(); gate.resolve(['late']);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h.tree, before); assert.equal(calls, 1);
});

test('Live is loading then failed, never empty; independent retry returns empty only after success', async () => {
  const h = liveHarness(), gate = deferred(); let calls = 0;
  h.services.fetchExploreLive = limit => { assert.equal(limit, 20); calls++; return calls === 1 ? gate.promise : Promise.resolve({ topics: [], takes: [] }); };
  try {
    await h.mount(); assert.equal(node(h, 'ReadFeedback').props.status, 'loading'); assert.doesNotMatch(text(h.tree), /No live activity/);
    await h.act(async () => gate.reject(Error('secret transport details')));
    assert.match(text(feedback(h)), /Couldn't load/); assert.doesNotMatch(text(h.tree), /No live activity/);
    const button = nodes(feedback(h)).find(n => n.props?.accessibilityLabel === 'Retry Live activity');
    await press(h, button); assert.equal(calls, 2); assert.match(text(h.tree), /No live activity right now/);
  } finally { await h.unmount(); }
});

test('Live successful cards retain actual service destinations and metrics', async () => {
  const h = liveHarness(); h.services.fetchExploreLive = async () => ({ topics: [{ id: 't', title: 'Real title', hood: 'Tech', href: '/arena/topic/t' }], takes: [{ id: 'take', title: 'Take', heat: 7, href: '/take/take' }] });
  try {
    await h.mount(); await press(h, node(h, 'ExploreMediaTile')); await press(h, node(h, 'ExploreDiscoveryCard'));
    assert.deepEqual(h.calls, [['push', '/arena/topic/t'], ['push', '/take/take']]);
    assert.equal(node(h, 'ExploreDiscoveryCard').props.meta, 'Heat 7');
  } finally { await h.unmount(); }
});

test('Play retry preserves selected Treasure tab and makes one new read', async () => {
  const h = harness('components/play/PlayHomePanel.tsx'); let calls = 0;
  h.services.fetchPlayHome = async () => { if (++calls === 1) throw Error('offline'); return { challenges: [], treasures: [] }; };
  try {
    await h.mount(); await press(h, h.nodes.find(n => n.props?.accessibilityLabel === 'TREASURE'));
    assert.equal(node(h, 'ReadFeedback').props.status, 'error');
    await press(h, nodes(feedback(h)).find(n => n.props?.accessibilityRole === 'button'));
    assert.equal(calls, 2); assert.equal(h.nodes.find(n => n.props?.accessibilityLabel === 'TREASURE').props.accessibilityState.selected, true);
    assert.match(text(h.tree), /No treasure hunts/); assert.doesNotMatch(text(h.tree), /No active challenges/);
  } finally { await h.unmount(); }
});

for (const state of ['error', 'missing', 'denied']) test(`Collection ${state} has distinct feedback and appropriate retry`, async () => {
  const h = harness('components/vault/CollectionWorld.tsx', { collectionId: 'collection' }); let calls = 0;
  h.services.fetchCollection = async () => {
    calls++; if (state === 'missing') return null;
    if (calls === 1) throw state === 'denied' ? { code: '42501' } : Error('network');
    return { id: 'collection', creatorId: 'creator', drops: [] };
  };
  h.services.fetchProfileById = async () => ({ id: 'creator', name: 'Fictional' });
  try {
    await h.mount(); assert.equal(node(h, 'ReadFeedback').props.status, state);
    const buttons = nodes(feedback(h)).filter(n => n.props?.accessibilityRole === 'button');
    assert.equal(buttons.length, state === 'error' ? 1 : 0);
    if (state === 'error') { await press(h, buttons[0]); assert.equal(node(h, 'FlatList').props.data.length, 0); assert.equal(calls, 2); }
  } finally { await h.unmount(); }
});

test('Collection navigation change invalidates deferred episodes and leaves Back usable', async () => {
  const h = harness('components/vault/CollectionWorld.tsx', { collectionId: 'a' }), gate = deferred();
  h.services.fetchCollection = id => id === 'a' ? gate.promise : Promise.resolve(null);
  h.services.fetchProfileById = async () => null;
  try {
    await h.mount(); await h.update({ collectionId: 'b' });
    await h.act(async () => gate.resolve({ creatorId: 'a', drops: [] }));
    assert.equal(node(h, 'ReadFeedback').props.status, 'missing');
    const back = node(h, 'VaultBackButton'); await press(h, back.type(back.props)); assert.deepEqual(h.calls, [['back']]);
  } finally { await h.unmount(); }
});

test('Wins uses authorized profile history, excludes draws/open/losses, preserves historical route', async () => {
  const h = harness('components/vault/VaultWins.tsx', { profileId: 'p' });
  h.services.fetchProfileClashes = async id => {
    assert.equal(id, 'p'); return ['won', 'draw', 'lost'].map((outcome, i) => ({ clash: { id: 'c' + i, takeId: 't' + i, status: 'settled' }, verdict: {}, outcome }));
  };
  try {
    await h.mount(); const wins = h.nodes.filter(n => (n.type?.name ?? n.type) === 'ProfileClashRow'); assert.equal(wins.length, 1);
    await h.act(async () => wins[0].props.onOpen()); assert.deepEqual(h.calls, [['push', '/clash/t0']]);
    h.auth = { user: null, loading: false }; await h.update();
    assert.equal(h.nodes.filter(n => (n.type?.name ?? n.type) === 'ProfileClashRow').length, 0); assert.equal(node(h, 'EmptyState').props.actionLabel, 'Sign in');
  } finally { await h.unmount(); }
});

test('failed Wins read reports unavailable history, not zero wins', async () => {
  const h = harness('components/vault/VaultWins.tsx', { profileId: 'p' }); h.services.fetchProfileClashes = async () => { throw Error('network'); };
  try { await h.mount(); assert.equal(node(h, 'ReadFeedback').props.status, 'error'); assert.doesNotMatch(text(h.tree), /No wins/); } finally { await h.unmount(); }
});

test('Vault Takes open redesigned detail; Wins is a real history child', async () => {
  const h = harness('app/(vault)/profile.tsx'); h.drafts.push({ id: 'take' });
  try {
    await h.mount(); await press(h, node(h, 'TakeMiniCard')); assert.deepEqual(h.calls, [['push', '/take/take']]);
    await h.act(async () => node(h, 'SegmentedTabs').props.onChange('wins')); assert.equal(node(h, 'VaultWins').props.profileId, 'profile-a');
  } finally { await h.unmount(); }
});

test('Settings account, Back fallback, help and appearance use existing actions in both themes', async () => {
  const h = harness('app/settings.tsx');
  try {
    await h.mount(); await press(h, h.nodes.find(n => n.props?.accessibilityLabel === 'Back')); assert.deepEqual(h.calls.pop(), ['replace', '/(tabs)']);
    await press(h, h.nodes.find(n => text(n) === 'Open profile')); assert.deepEqual(h.calls.pop(), ['push', '/(tabs)/profile']);
    await press(h, h.nodes.find(n => n.props?.accessibilityState?.expanded === false)); assert.match(text(h.tree), /Arena is for Takes/);
    const appearance = h.load('components/profile/AppearanceRow.tsx').AppearanceRow();
    await h.act(async () => nodes(appearance).find(n => n.type === 'SegmentedTabs').props.onChange('light'));
    assert.deepEqual(h.events.pop(), { type: 'theme', mode: 'light' });
    h.colors.scheme = 'light'; h.colors.textPrimary = '#111'; h.auth = { user: null, signedIn: false, loading: false }; await h.update();
    await press(h, h.nodes.find(n => text(n) === 'Sign in')); assert.deepEqual(h.calls.pop(), ['push', '/auth']);
    h.router.canGoBack = () => true; await press(h, h.nodes.find(n => n.props?.accessibilityLabel === 'Back')); assert.deepEqual(h.calls.pop(), ['back']);
  } finally { await h.unmount(); }
});

test('Sidebar Settings closes drawer and navigates instead of posting a notice', async () => {
  const h = harness('components/navigation/AppSidebar.tsx');
  try {
    await h.mount(); const settings = h.nodes.find(n => n.props?.item?.key === 'settings'); assert.equal(settings.props.active, true);
    await press(h, settings); await new Promise(resolve => setTimeout(resolve, 230));
    assert.ok(h.events.includes('close')); assert.deepEqual(h.calls, [['push', '/settings']]);
  } finally { await h.unmount(); }
});
