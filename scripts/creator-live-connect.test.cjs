const test = require('node:test'), assert = require('node:assert/strict');
const { harness, deferred, React, text } = require('./ui-completion-harness.cjs');
const session = (change = {}) => ({ id: 'session-a', title: 'Fictional retained session', creatorId: 'creator-a', creatorName: 'Fictional host', status: 'LIVE', viewerAccess: true, ...change });
const interaction = (change = {}) => ({ id: 'round-a', sessionId: 'session-a', type: 'CHOICE', status: 'CLOSED', prompt: 'Retained decision', openedAt: new Date().toISOString(), options: [{ id: 'a', label: 'Option A' }, { id: 'b', label: 'Option B' }], tallies: { a: 2, b: 2 }, totalVotes: 4, result: { winner: 'a', tie: true }, ...change });
function setup() {
  let focused = true; const listeners = new Set();
  const h = harness('components/vault/live/LiveSessionReadOnly.tsx', { sessionId: 'session-a' }, e => e.LiveSessionReadOnly, { dependencies: {
    'expo-router': { useRouter: () => h.router, useFocusEffect: fn => React.useEffect(() => focused ? fn() : undefined, [fn, focused]) },
    'react-native': { ScrollView: 'ScrollView', View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: s => s },
      AppState: { addEventListener: (_name, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } } },
  } });
  let reads = 0; h.services.fetchCreatorLiveReadSnapshot = async (id, actor) => { reads++; assert.equal(id, 'session-a'); assert.equal(actor, h.auth.user?.id ?? null); return { session: session(), interactions: [interaction()] }; };
  const press = label => h.act(async () => { const n = h.nodes.find(n => n.props?.accessibilityLabel === label && n.props.onPress); assert.ok(n, label); n.props.onPress(); });
  const status = () => h.nodes.find(n => n.props?.subject === 'Live session').props.status;
  return { h, press, status, listeners, focus: v => { focused = v; }, get reads() { return reads; } };
}

test('read-only snapshot renders real session/interaction IDs and authoritative tie, without vote/host/playback controls', async () => {
  const r = setup(), h = r.h;
  try { await h.mount(); assert.equal(r.status(), 'ready'); assert.match(text(h.tree), /Fictional retained session/);
    assert.match(text(h.tree), /server recorded a tie/); assert.doesNotMatch(text(h.tree), /Server result: Option A/);
    assert.equal(r.reads, 1); assert.deepEqual(h.calls, []);
    assert.deepEqual(h.nodes.filter(n => n.type === 'Pressable').map(n => n.props.accessibilityLabel), ['Back', 'Refresh Live session']);
    await r.press('Back'); assert.deepEqual(h.calls, [['replace', '/']]);
    h.router.canGoBack = () => true; await h.update(); await r.press('Back'); assert.deepEqual(h.calls.at(-1), ['back']);
  } finally { await h.unmount(); }
});

test('loading, failed/retry, missing and permission-denied remain distinct from successful zero interactions', async () => {
  const r = setup(), h = r.h, wait = deferred(); h.services.fetchCreatorLiveReadSnapshot = () => wait.promise;
  try { await h.mount(); assert.equal(r.status(), 'loading'); assert.doesNotMatch(text(h.tree), /No interactions/);
    await h.act(async () => wait.reject(Error('network'))); assert.equal(r.status(), 'error');
    for (const [value, expected] of [[null, 'missing'], [{ session: session({ status: 'ENDED' }), interactions: [] }, 'ready']]) {
      h.services.fetchCreatorLiveReadSnapshot = async () => value;
      await h.act(async () => h.nodes.find(n => n.props?.subject === 'Live session').props.retry()); assert.equal(r.status(), expected);
      assert.equal(/No interactions/.test(text(h.tree)), expected === 'ready');
    }
    h.services.fetchCreatorLiveReadSnapshot = async () => { throw { code: '42501' }; };
    await r.press('Refresh Live session'); assert.equal(r.status(), 'denied'); assert.doesNotMatch(text(h.tree), /No interactions/);
  } finally { await h.unmount(); }
});

test('focus/resume obtains a new snapshot; old requests cannot restore another account/session after switch or unmount', async () => {
  const r = setup(), h = r.h;
  try { await h.mount(); r.focus(false); await h.update(); assert.equal(r.listeners.size, 0);
    r.focus(true); await h.update(); assert.equal(r.reads, 2);
    await h.act(async () => [...r.listeners][0]('active')); assert.equal(r.reads, 3);
    const late = deferred(); h.services.fetchCreatorLiveReadSnapshot = () => late.promise; await r.press('Refresh Live session');
    h.auth = { user: { id: 'account-b' }, signedIn: true }; h.services.fetchCreatorLiveReadSnapshot = async () => null; await h.update();
    await h.act(async () => late.resolve({ session: session(), interactions: [interaction()] })); assert.equal(r.status(), 'missing');
    assert.doesNotMatch(text(h.tree), /Fictional retained session/);
    h.auth = { user: { id: 'account-a' }, signedIn: true }; await h.update(); assert.equal(r.status(), 'missing');
    await h.update({ sessionId: 'other-session' }); assert.equal(r.status(), 'missing');
  } finally { await h.unmount(); }
  assert.equal(r.listeners.size, 0);
});

test('auth hydration, absent ID, themes and enlarged text never create admission or hide prose behind line limits', async () => {
  const r = setup(), h = r.h; h.auth = { ...h.auth, loading: true };
  try { await h.mount(); assert.equal(r.reads, 0); assert.equal(r.status(), 'loading');
    h.auth = { ...h.auth, loading: false }; await h.update(); assert.equal(r.reads, 1);
    for (const width of [320, 360, 430]) for (const scheme of ['dark', 'light']) {
      Object.assign(h.dimensions, { width, fontScale: 1.3 }); h.colors.scheme = scheme; await h.update();
      for (const n of h.nodes.filter(n => n.type === 'Text')) { assert.notEqual(n.props.allowFontScaling, false); assert.equal(n.props.numberOfLines, undefined); }
      for (const n of h.nodes.filter(n => n.type === 'Pressable')) assert.ok(n.props.style.minHeight >= 44);
    }
    await h.update({ sessionId: undefined }); assert.equal(r.status(), 'unavailable'); assert.deepEqual(h.calls, []);
  } finally { await h.unmount(); }
});

test('direct read-mode route mounts only snapshot inspection, never the existing heartbeat/vote/host hooks', async () => {
  const h = harness('app/vault/live/[sessionId].tsx', {}, undefined, { dependencies: {
    'expo-router': { useLocalSearchParams: () => ({ sessionId: ['session-a'], mode: 'read' }) },
    LiveSessionReadOnly: { LiveSessionReadOnly: 'ReadOnly' }, LiveStage: { LiveStage: 'Stage' },
    LiveControlPanel: { LiveControlPanel: 'Controls' }, LiveCrowdOverlay: { LiveCrowdOverlay: 'Overlay' }, LiveInteractionPanel: { LiveInteractionPanel: 'Interaction' },
    useCreatorLive: { useCreatorLive: () => { throw Error('Mutation-capable viewer hook mounted'); } },
    useCreatorLiveHost: { useCreatorLiveHost: () => { throw Error('Host hook mounted'); } },
  } });
  try { await h.mount(); assert.equal(h.tree.type, 'ReadOnly'); assert.equal(h.tree.props.sessionId, 'session-a'); }
  finally { await h.unmount(); }
});

test('real service snapshot uses only canonical authorized reads; account, foreign/duplicate and malformed responses fail closed', async () => {
  let account = 'account-a', reads = [], row = session(), rounds = [interaction()], fail = false;
  const h = harness('services/creatorLiveService.ts', {}, e => () => null, { dependencies: {
    supabaseClient: { currentUserId: async () => account, SupabaseError: class extends Error { constructor(m, code) { super(m); this.code = code; } }, requestError: e => e,
      requireSupabase: () => ({ rpc: async (name, args) => { reads.push([name, args]); if (fail) throw Error('network');
        if (name === 'get_creator_live_snapshot') return { data: null, error: { code: 'PGRST202', message: 'get_creator_live_snapshot missing' } };
        return { data: name === 'get_creator_live_session' ? row : rounds, error: null }; } }) },
    mediaService: { getPublicMediaUrl: () => { throw Error('Unexpected media access'); } },
  } });
  const service = h.load('services/creatorLiveService.ts');
  try {
    const result = await service.fetchCreatorLiveReadSnapshot('session-a', 'account-a'); assert.equal(result.interactions[0].id, 'round-a');
    assert.deepEqual(reads, [['get_creator_live_snapshot', { p_session_id: 'session-a' }], ['get_creator_live_session', { p_session_id: 'session-a' }], ['list_creator_live_interactions', { p_session_id: 'session-a', p_limit: 20 }]]);
    assert.equal(result.source, 'legacy'); assert.equal(result.session.canParticipate, false);
    reads = []; account = 'account-b'; await assert.rejects(service.fetchCreatorLiveReadSnapshot('session-a', 'account-a'), { code: 'account_changed' }); assert.equal(reads.length, 0);
    account = 'account-a';
    for (const wrong of [[interaction({ sessionId: 'foreign' })], [interaction(), interaction()], {}, [{}]]) {
      rounds = wrong; await assert.rejects(service.fetchCreatorLiveReadSnapshot('session-a', account), { code: 'bad_payload' });
    }
    row = session({ id: 'foreign' }); await assert.rejects(service.fetchCreatorLiveReadSnapshot('session-a', account), { code: 'bad_payload' });
    row = {}; await assert.rejects(service.fetchCreatorLiveReadSnapshot('session-a', account), { code: 'bad_payload' });
    reads = []; row = session({ viewerAccess: false }); assert.equal(await service.fetchCreatorLiveReadSnapshot('session-a', account), null); assert.equal(reads.length, 2);
    row = null; assert.equal(await service.fetchCreatorLiveReadSnapshot('session-a', account), null);
    fail = true; await assert.rejects(service.fetchCreatorLiveReadSnapshot('session-a', account), /network/);
  } finally { await h.unmount(); }
});

test('production Vault composition sends audience to read mode and preserves the existing owner continuation', async () => {
  const model = { phase: 'ready', creator: { id: 'creator-a', name: 'Fictional', tint: '#888' }, vault: {},
    liveDrops: [], modules: ['live'], collections: [], services: [], courses: [], products: [], worldDrops: [],
    liveSessions: [session()], aiProfile: null, community: null, isSelf: false, follow: { following: false } };
  const h = harness('components/vault/VaultScreen.tsx', { creatorId: 'creator-a' }, undefined, { dependencies: {
    useCreatorWorld: { useCreatorWorld: () => model }, WorldHero: { WorldHero: 'Hero' }, WorldChapter: { WorldChapter: 'Chapter' },
  } });
  try { await h.mount(); const open = () => h.nodes.find(n => n.props?.renderItem).props.renderItem({ item: { kind: 'chapter', module: 'live' } }).props.onOpenLive('session-a');
    await h.act(async () => open()); assert.deepEqual(h.calls, [['push', { pathname: '/vault/live/[sessionId]', params: { sessionId: 'session-a', mode: 'read' } }]]);
    model.isSelf = true; await h.update(); await h.act(async () => open()); assert.deepEqual(h.calls.at(-1), ['push', '/vault/live/session-a']);
  } finally { await h.unmount(); }
});

test('service checks identity again after a delayed snapshot response before reading any interactions', async () => {
  let account = 'account-a', calls = 0; const pending = deferred();
  const h = harness('services/creatorLiveService.ts', {}, e => () => null, { dependencies: {
    mediaService: { getPublicMediaUrl: () => null },
    supabaseClient: { currentUserId: async () => account, requestError: e => e,
      SupabaseError: class extends Error { constructor(m, code) { super(m); this.code = code; } },
      requireSupabase: () => ({ rpc: () => { calls++; return pending.promise; } }) },
  } });
  try { const run = h.load('services/creatorLiveService.ts').fetchCreatorLiveReadSnapshot('session-a', account);
    await new Promise(resolve => setImmediate(resolve)); account = 'account-b'; pending.resolve({ data: session(), error: null });
    await assert.rejects(run, { code: 'account_changed' }); assert.equal(calls, 1);
  } finally { await h.unmount(); }
});
