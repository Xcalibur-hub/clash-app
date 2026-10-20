const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const { harness, row, deferred, pruneDuringRead } = require('./arena-room-harness.cjs');

// The real ReactDOM reconciler mounts the actual hook; it renders no host nodes.
// This tiny event-capable container is not a browser or React Native renderer.
const documentStub = { nodeType: 9, addEventListener() {}, removeEventListener() {},
  activeElement: null, body: null, documentElement: { nodeName: 'HTML' } };
const windowStub = { document: documentStub, HTMLIFrameElement: function () {}, HTMLElement: function () {},
  addEventListener() {}, removeEventListener() {} };
documentStub.defaultView = windowStub;
global.window = windowStub; global.document = documentStub; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const message = (id, n, count = 0, body = 'old') => ({ ...row(id, n), body,
  reactions: [{ emoji: 'fire', count, viewerReacted: count > 0 }] });

function mountedRoom({ strict = false, suspend = false, roomId: initialRoomId = 'room' } = {}) {
  const modules = new Map(), observations = [], owners = [];
  let toggles = 0, completions = 0, suspensions = 0;
  let rendering = false, insert, flushHydration, controller, committed, forceRender, shouldSuspend = false;
  let activeRoomId = initialRoomId;
  const renderViews = [];
  const never = new Promise(() => {});
  const server = new Map();
  const services = {
    fetchRoom: async (id) => ({ id: id ?? activeRoomId, roomMode: 'GROUP', status: 'LIVE' }),
    fetchOfficialPage: async () => [], fetchEvidence: async () => [],
    fetchMessage: async id => server.get(id) ?? null,
    reactMessage: async id => {
      toggles++;
      const prior = server.get(id), selected = !prior.reactions[0]?.viewerReacted;
      const count = selected ? 1 : 0;
      server.set(id, { ...prior, reactions: [{ emoji: 'fire', count, viewerReacted: selected }] });
      return { messageId: id, emoji: 'fire', count, reacted: selected };
    },
    fetchVisibleMessageIds: async (_room, ids) => ids,
    subscribeRoomMessages: (_room, onInsert) => { insert = onInsert; return () => {}; },
  };
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} }; modules.set(file, module);
    const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file,
      babelrc: false, configFile: false, presets: ['@babel/preset-typescript'],
      plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
    vm.runInThisContext('(function(module,exports,require,setTimeout,clearTimeout,setInterval,clearInterval){' + code + '\n})')(
      module, module.exports, dependency => {
        if (dependency === 'react') return React;
        if (dependency === 'expo-router') return { useFocusEffect() {} };
        if (dependency === 'react-native') return { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
        if (dependency === '../store') return { useClash: () => ({ dispatch() {} }), showNotice: value => value };
        if (dependency.endsWith('/liveArenaService')) return services;
        if (dependency.endsWith('/supabaseClient')) return { currentUserId: async () => 'account', errorText: String, SupabaseError: Error };
        if (dependency.endsWith('/officialRequestStore')) return { acquireOfficialRequest: async () => 'request', confirmOfficialRequest: async () => {} };
        if (!dependency.startsWith('.')) throw Error('Unexpected mounted dependency: ' + dependency);
        return load(path.resolve(path.dirname(file), dependency.replace(/\.ts$/, '') + '.ts'));
      }, fn => { flushHydration = fn; return 1; }, () => {}, () => 1, () => {});
    if (file.endsWith(path.join('utils', 'reactionSnapshots.ts'))) {
      const create = module.exports.createReactionSnapshots;
      module.exports.createReactionSnapshots = () => {
        const guard = create(), merge = guard.merge, finish = guard.finishMutation;
        guard.finishMutation = id => { completions++; finish(id); };
        guard.merge = (...args) => {
          const result = merge(...args);
          observations.push({ rendering, count: result.find(item => item.id === 'm')?.reactions[0]?.count });
          return result;
        };
        return guard;
      };
    }
    if (file.endsWith(path.join('utils', 'arenaTranscriptStore.ts'))) {
      const create = module.exports.createArenaTranscriptStore;
      module.exports.createArenaTranscriptStore = () => {
        const owner = create(); owners.push(owner); return owner;
      };
    }
    return module.exports;
  }
  const { useLiveArenaRoom } = load('hooks/useLiveArenaRoom.ts');
  function MaySuspend({ messages }) {
    if (shouldSuspend && messages.find(item => item.id === 'm')?.reactions[0]?.count === 7) { suspensions++; throw never; }
    return null;
  }
  function App() {
    rendering = true;
    try {
      const [, tick] = React.useState(0); forceRender = () => tick(value => value + 1);
      controller = useLiveArenaRoom(activeRoomId);
    } finally { rendering = false; }
    const current = controller;
    // Capture pre-paint message identities for room-switch isolation checks.
    renderViews.push({ roomId: activeRoomId, ids: current.messages.map((item) => item.id) });
    React.useLayoutEffect(() => { committed = current; });
    return React.createElement(MaySuspend, { messages: current.messages });
  }
  const root = createRoot({ nodeType: 1, tagName: 'DIV', nodeName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: documentStub,
    addEventListener() {}, removeEventListener() {}, textContent: '' });
  return {
    server, observations, services, renderViews,
    get committed() { return committed; },
    get owner() { return owners.find(owner => owner.getSnapshot().some(item => item.id === 'm')) ?? owners[0]; },
    get toggles() { return toggles; }, get completions() { return completions; },
    get suspensions() { return suspensions; },
    async mount() {
      await React.act(async () => {
        let app = React.createElement(App);
        if (strict) app = React.createElement(React.StrictMode, null, app);
        flushSync(() => root.render(React.createElement(React.Suspense, { fallback: null }, app)));
      });
    },
    async switchRoom(nextId) {
      activeRoomId = nextId;
      await React.act(async () => flushSync(forceRender));
    },
    async resume() {
      shouldSuspend = false;
      await React.act(async () => flushSync(forceRender));
    },
    async hydrate(ids, interrupt = false) {
      await React.act(async () => {
        if (interrupt) { shouldSuspend = suspend; React.startTransition(forceRender); }
        else forceRender(); // Prevent the legacy setter's eager-result shortcut.
        for (const id of ids) insert({ id });
        flushHydration();
        for (let turn = 0; turn < 12; turn++) await Promise.resolve();
      });
    },
    async unmount() { await React.act(async () => root.unmount()); },
  };
}

test('R1 mounted StrictMode preserves hydration at the 257-message eviction boundary', async () => {
  const room = mountedRoom({ strict: true });
  try {
    await room.mount(); room.server.set('m', message('m', 1)); await room.hydrate(['m']);
    for (let n = 0; n < 256; n += 12) {
      const ids = Array.from({ length: Math.min(12, 256 - n) }, (_, k) => 'history-' + (n + k));
      for (const id of ids) room.server.set(id, message(id, -Number(id.slice(8)) - 1));
      await room.hydrate(ids);
    }
    room.observations.length = 0;
    room.server.set('m', message('m', 1, 7, 'new'));
    await room.hydrate(['m']);
    assert.equal(room.committed.messages.find(item => item.id === 'm').reactions[0].count, 7);
    assert.equal(room.committed.messages.find(item => item.id === 'm').body, 'new');
    assert.equal(room.observations.some(item => item.rendering), false, 'render must not mutate ordering metadata');
  } finally { await room.unmount(); }
});

test('R2 mounted suspension cannot execute an ordering transition during render', async () => {
  const room = mountedRoom({ suspend: true });
  try {
    await room.mount(); room.server.set('m', message('m', 1)); await room.hydrate(['m']);
    room.observations.length = 0;
    room.server.set('m', message('m', 1, 7, 'new'));
    await room.hydrate(['m'], true);
    assert.ok(room.suspensions > 0, 'React actually abandoned a suspended render');
    assert.equal(room.committed.messages.find(item => item.id === 'm').reactions[0].count, 0);
    assert.equal(room.observations.some(item => item.rendering), false, 'abandoned render must not mutate external metadata');
    const snapshot = room.owner.getSnapshot(), merges = room.observations.length;
    assert.equal(snapshot.find(item => item.id === 'm').reactions[0].count, 7, 'the owner committed rows with metadata');
    for (let read = 0; read < 100; read++) assert.equal(room.owner.getSnapshot(), snapshot);
    assert.equal(room.observations.length, merges, 'React snapshot reads do not evaluate transitions');
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(Object.isFrozen(snapshot.find(item => item.id === 'm')), true);
    assert.equal(Object.isFrozen(snapshot.find(item => item.id === 'm').reactions), true);
    await room.resume();
    assert.equal(room.committed.messages.find(item => item.id === 'm').reactions[0].count, 7);
    assert.equal(room.observations.length, merges, 'resuming a render cannot replay the cache transition');
  } finally { await room.unmount(); }
});

test('R5 mounted actual serialized toggles complete once each without render-time writes', async () => {
  const room = mountedRoom({ strict: true });
  try {
    await room.mount(); room.server.set('m', message('m', 1)); await room.hydrate(['m']);
    room.observations.length = 0;
    await React.act(async () => {
      const first = room.committed.react('m', 'fire');
      const second = room.committed.react('m', 'fire');
      await Promise.all([first, second]);
    });
    const fire = room.committed.messages.find(item => item.id === 'm').reactions[0];
    assert.equal(fire?.count ?? 0, 0); assert.equal(fire?.viewerReacted ?? false, false);
    assert.equal(room.toggles, 2); assert.equal(room.completions, 2);
    assert.deepEqual(room.owner.reactions.protectedIds(), []);
    assert.equal(room.observations.some(item => item.rendering), false);
  } finally { await room.unmount(); }
});

for (const ending of ['generation', 'unmount']) test(`R5 mounted late hydration rejects ${ending}`, async () => {
  const room = mountedRoom(), gate = deferred(); let unmounted = false;
  try {
    await room.mount(); room.server.set('m', message('m', 1)); await room.hydrate(['m']);
    const owner = room.owner;
    room.services.fetchMessage = async () => gate.promise;
    await room.hydrate(['m']);
    if (ending === 'generation') {
      room.services.fetchOfficialPage = async () => { throw Object.assign(Error('membership'), { code: '42501' }); };
      await React.act(async () => room.committed.refresh());
    } else { await room.unmount(); unmounted = true; }
    await React.act(async () => { gate.resolve(message('m', 1, 7, 'stale')); for (let turn = 0; turn < 12; turn++) await Promise.resolve(); });
    assert.equal(owner.getSnapshot().some(item => item.body === 'stale'), false);
    if (ending === 'generation') assert.equal(owner.getSnapshot().length, 0);
    else assert.equal(owner.getSnapshot().find(item => item.id === 'm').reactions[0].count, 0);
  } finally { if (!unmounted) await room.unmount(); }
});

test('R3 rejected initial coverage is recovered after traffic moves beyond the newest page', async () => {
  const h = harness(undefined, { queued: true }), gate = deferred(), started = deferred();
  h.scope.messageCursor.current = null;
  h.rows.push(...Array.from({ length: 501 }, (_, n) => row('hidden' + n, -n - 1)));
  let server = Array.from({ length: 40 }, (_, n) => row('m' + (n + 1), n + 1)), initial = true, idReads = 0;
  h.scope.fetchMessage = async id => { idReads++; return server.find(item => item.id === id) ?? null; };
  h.scope.fetchOfficialPage = async (_room, kind, cursor, direction) => {
    if (kind === 'evidence') return [];
    if (initial && !cursor) { initial = false; const page = server.slice(-40).reverse(); started.resolve(); await gate.promise; return page; }
    if (direction === 'newer') return server.filter(item => item.createdAt > cursor.createdAt).slice(0, 40);
    return (cursor ? server.filter(item => item.createdAt < cursor.createdAt) : server).slice(-40).reverse();
  };
  const pending = h.callback('load')('initial'); await started.promise;
  const visibility = h.callback('reconcileVisibility');
  for (let i = 0; i < 10 && h.rows.some(item => item.id.startsWith('hidden')); i++) { await visibility(); h.flushAll(); }
  gate.resolve(); await pending; h.flushAll(); h.flushEvidenceAll();
  const acknowledgedRejectedCoverage = h.scope.messageCursor.current !== null;
  server = Array.from({ length: 90 }, (_, n) => row('m' + (n + 1), n + 1));
  await h.callback('refreshThread')(); h.flushAll(); h.flushEvidenceAll();
  await h.callback('load')('refresh'); h.flushAll(); h.flushEvidenceAll();
  await h.callback('loadOlder')(); h.flushAll(); h.flushEvidenceAll();
  assert.equal(acknowledgedRejectedCoverage, false, 'whole rejection must not initialize a cursor');
  for (const item of server) assert.ok(h.rows.some(loaded => loaded.id === item.id), item.id);
  assert.equal(h.scope.messageCursor.current.id, 'm90');
  assert.ok(idReads <= 40, 'initial retry must stay within one retained page');
});

test('R4 individually excluded accepted coverage retains raw boundaries and older history', async () => {
  const h = harness(undefined, { queued: true }), gate = deferred(), started = deferred();
  h.scope.messageCursor.current = null;
  const hidden = Array.from({ length: 40 }, (_, n) => row('hidden' + n, n + 1)); let olderReads = 0;
  h.scope.fetchOfficialPage = async (_room, kind, cursor) => {
    if (kind === 'evidence') return [];
    if (cursor) { olderReads++; return [row('history', -1)]; }
    started.resolve(); await gate.promise; return [...hidden].reverse();
  };
  const pending = h.callback('load')('initial'); await started.promise;
  h.rows.push(...hidden); await h.callback('reconcileVisibility')(); h.flushAll();
  gate.resolve(); await pending; h.flushAll(); h.flushEvidenceAll();
  assert.equal(h.scope.messageCursor.current.id, 'hidden39');
  assert.equal(h.scope.messageHasOlder.current, true);
  await h.callback('loadOlder')(); h.flushAll();
  assert.equal(olderReads, 1); assert.ok(h.rows.some(item => item.id === 'history'));
});

async function rejectedInitial() {
  const h = harness(), gate = deferred(), started = deferred();
  const server = Array.from({ length: 90 }, (_, n) => row('m' + (n + 1), n + 1));
  let first = true;
  h.scope.messageCursor.current = null;
  h.scope.fetchOfficialPage = async (_room, kind, cursor, direction) => {
    if (kind === 'evidence') return [];
    if (first) { first = false; started.resolve(); return gate.promise; }
    if (direction === 'newer') return server.filter(item => item.createdAt > cursor.createdAt).slice(0, 40);
    return (cursor ? server.filter(item => item.createdAt < cursor.createdAt) : server).slice(-40).reverse();
  };
  h.scope.fetchMessage = async id => server.find(item => item.id === id) ?? null;
  const pending = h.callback('load')('initial'); await started.promise;
  await pruneDuringRead(h);
  gate.resolve(server.slice(0, 40).reverse()); await pending;
  assert.equal(h.scope.messageCursor.current, null);
  return { h, server };
}

test('R3 partial retry failure preserves its obligation across a newer latest-page load', async () => {
  const { h, server } = await rejectedInitial(), calls = [];
  let fail = true;
  h.scope.fetchMessage = async id => {
    calls.push(id);
    if (fail && calls.length === 13) throw Error('transient transport');
    return server.find(item => item.id === id) ?? null;
  };
  await h.callback('refreshThread')();
  assert.equal(calls.length, 24);
  assert.equal(h.scope.messageCursor.current, null);
  const obligation = h.scope.initialCoverage.current;
  assert.equal(obligation.ids.length, 28);
  await h.callback('load')('refresh');
  assert.equal(h.scope.initialCoverage.current, obligation);
  assert.equal(obligation.cursor.id, 'm40');
  assert.equal(h.scope.messageCursor.current, null);
  fail = false; calls.length = 0;
  await h.callback('refreshThread')();
  assert.equal(calls.length, 28, 'successful first batch is not fetched again');
  for (const item of server) assert.ok(h.rows.some(loaded => loaded.id === item.id), item.id);
  assert.equal(h.scope.messageCursor.current.id, 'm90');
  assert.equal(h.scope.initialCoverage.current, null);
});

test('R3 visibility rejection during retry retains all unacknowledged ids', async () => {
  const { h, server } = await rejectedInitial(), gate = deferred(), started = deferred();
  h.scope.fetchMessage = async id => { started.resolve(); await gate.promise; return server.find(item => item.id === id); };
  const pending = h.callback('refreshThread')(); await started.promise;
  await pruneDuringRead(h); gate.resolve(); await pending;
  assert.equal(h.scope.messageCursor.current, null);
  assert.equal(h.scope.initialCoverage.current.ids.length, 40);
  h.scope.fetchMessage = async id => server.find(item => item.id === id);
  await h.callback('refreshThread')();
  assert.equal(h.scope.messageCursor.current.id, 'm90');
  assert.equal(h.scope.initialCoverage.current, null);
});

test('R3 a null authoritative retry acknowledges absence and removes stale cached content', async () => {
  const { h, server } = await rejectedInitial();
  server.splice(server.findIndex(item => item.id === 'm1'), 1);
  h.rows.push(row('m1', 1));
  await h.callback('refreshThread')();
  assert.equal(h.rows.some(item => item.id === 'm1'), false);
  for (const item of server) assert.ok(h.rows.some(loaded => loaded.id === item.id), item.id);
  assert.equal(h.scope.messageCursor.current.id, 'm90');
});

for (const ending of ['generation', 'unmount']) test(`R3 retry rejects ${ending} completion`, async () => {
  const { h, server } = await rejectedInitial(), gate = deferred(), started = deferred();
  h.scope.fetchMessage = async id => { started.resolve(); await gate.promise; return server.find(item => item.id === id); };
  const pending = h.callback('refreshThread')(); await started.promise;
  if (ending === 'generation') h.scope.clearPrivateThread();
  else h.scope.mounted.current = false;
  const rowsBefore = h.rows;
  gate.resolve(); await pending;
  assert.equal(h.rows, rowsBefore);
  assert.equal(h.scope.messageCursor.current, null);
  assert.equal(h.scope.recovering.current, false);
  if (ending === 'generation') assert.equal(h.scope.initialCoverage.current, null);
});

test('R3 an empty rejected initial response requires a fresh accepted bootstrap page', async () => {
  const h = harness(), gate = deferred(), started = deferred(); let reads = 0;
  h.scope.messageCursor.current = null;
  h.scope.fetchOfficialPage = async (_room, kind, cursor) => {
    if (kind === 'evidence' || cursor) return [];
    if (++reads === 1) { started.resolve(); return gate.promise; }
    return [row('later', 1)];
  };
  const pending = h.callback('load')('initial'); await started.promise;
  await pruneDuringRead(h); gate.resolve([]); await pending;
  assert.equal(h.scope.messageCursor.current, null);
  await h.callback('refreshThread')();
  assert.equal(h.scope.messageCursor.current.id, 'later');
  assert.equal(h.scope.initialCoverage.current, null);
  assert.equal(h.scope.messageHasOlder.current, false);
  assert.equal(reads, 3, 'one bootstrap read plus the existing rollup');
  assert.ok(h.rows.some(item => item.id === 'later'));
});

// --- Step 6G.5C.2: room-session isolation, pagination anchors, nested store ---

test('6G.5C.2 R1 room switch during refresh never publishes Room A into Room B', async () => {
  const h = harness(), gate = deferred(), started = deferred();
  h.scope.accessGeneration.current = 1;
  h.scope.sessionRef.current = { roomId: 'A', generation: 1 };
  h.scope.messageCursor.current = row('a0', 0);
  h.rows = [row('a0', 0)];
  let fetchedRoom = null;
  h.scope.fetchOfficialPage = async (roomId, kind, cursor, direction) => {
    if (kind === 'evidence') return [];
    if (direction === 'newer' || !cursor) {
      fetchedRoom = roomId;
      started.resolve();
      await gate.promise;
      return [{ ...row('a-stale', 2), roomId: 'A' }];
    }
    return [];
  };
  const pending = h.callback('refreshThread')();
  await started.promise;
  assert.equal(fetchedRoom, 'A');
  h.scope.accessGeneration.current = 2;
  h.scope.sessionRef.current = { roomId: 'B', generation: 2 };
  h.scope.recovering.current = false;
  h.rows = [row('b0', 0)];
  const before = h.rows.map((item) => item.id);
  gate.resolve();
  await pending;
  assert.deepEqual(h.rows.map((item) => item.id), before);
  assert.equal(h.rows.some((item) => item.id === 'a-stale'), false);
  assert.equal(h.scope.recovering.current, false);
});

test('6G.5C.2 R1 unmount during refresh cannot publish after remount generation', async () => {
  const h = harness(), gate = deferred(), started = deferred();
  h.scope.accessGeneration.current = 1;
  h.scope.sessionRef.current = { roomId: 'A', generation: 1 };
  h.scope.messageCursor.current = row('a0', 0);
  h.scope.fetchOfficialPage = async (roomId, kind, cursor, direction) => {
    if (kind === 'evidence') return [];
    if (direction === 'newer' || !cursor) {
      started.resolve();
      await gate.promise;
      return [row('a-stale', 2)];
    }
    return [];
  };
  const pending = h.callback('refreshThread')();
  await started.promise;
  h.scope.mounted.current = false;
  const rowsBefore = h.rows;
  gate.resolve();
  await pending;
  assert.equal(h.rows, rowsBefore);
  h.scope.mounted.current = true;
  h.scope.accessGeneration.current = 2;
  h.scope.sessionRef.current = { roomId: 'B', generation: 2 };
  h.scope.recovering.current = false;
  h.rows = [row('b0', 0)];
  assert.equal(h.rows.some((item) => item.id === 'a-stale'), false);
});

test('6G.5C.2 R1 mounted room switch never exposes Room A rows as Room B', async () => {
  const room = mountedRoom({ roomId: 'A' });
  const gate = deferred(), started = deferred();
  let serveA = true;
  room.services.fetchOfficialPage = async (id) => {
    if (id === 'A' && serveA) {
      started.resolve();
      await gate.promise;
      return [{ ...row('a1', 1), roomId: 'A' }];
    }
    return id === 'B' ? [{ ...row('b1', 1), roomId: 'B' }] : [];
  };
  await room.mount();
  await started.promise;
  await room.switchRoom('B');
  serveA = false;
  gate.resolve();
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  assert.equal(room.committed.messages.some((item) => item.id === 'a1'), false);
  assert.equal(room.renderViews.some((view) => view.roomId === 'B' && view.ids.includes('a1')), false);
  await room.unmount();
});

test('6G.5C.2 R2 rejected older page does not falsely exhaust pagination', async () => {
  const h = harness(), gate = deferred(), started = deferred();
  h.scope.messageCursor.current = row('base', 10);
  h.scope.messageOlderAnchor.current = row('base', 10);
  h.rows = [row('base', 10)];
  let olderReads = 0;
  h.scope.fetchOfficialPage = async (_room, kind, cursor) => {
    if (kind === 'evidence') return [];
    if (!cursor) return [row('base', 10)];
    olderReads++;
    started.resolve();
    await gate.promise;
    return Array.from({ length: 40 }, (_, n) => row('old' + n, n));
  };
  const pending = h.callback('loadOlder')();
  await started.promise;
  await pruneDuringRead(h);
  gate.resolve();
  await pending;
  assert.equal(h.scope.messageHasOlder.current, true, 'rejected coverage must not exhaust');
  assert.ok(h.scope.messageOlderAnchor.current, 'anchor remains recoverable');
  h.scope.fetchOfficialPage = async (_room, kind, cursor) => {
    if (kind === 'evidence' || !cursor) return [];
    olderReads++;
    return [row('history', -1)];
  };
  await h.callback('loadOlder')();
  assert.ok(olderReads >= 2);
  assert.ok(h.rows.some((item) => item.id === 'history'));
  assert.equal(new Set(h.rows.map((item) => item.id)).size, h.rows.length);
});

test('6G.5C.2 R3 fully excluded accepted page keeps raw backward anchor', async () => {
  const h = harness();
  h.scope.messageCursor.current = null;
  h.rows = [];
  const hidden = Array.from({ length: 40 }, (_, n) => row('hidden' + n, n + 1));
  let olderReads = 0;
  h.scope.fetchOfficialPage = async (_room, kind, cursor) => {
    if (kind === 'evidence') return [];
    if (!cursor) return [...hidden].reverse();
    olderReads++;
    return [row('history', -1)];
  };
  await h.callback('load')('initial');
  // Individually exclude every admitted row while coverage remains accepted.
  const remove = h.scope.visibilityBarrier.mark(hidden.map((item) => item.id));
  h.scope.updateMessages((current) => remove(current));
  assert.equal(h.rows.length, 0);
  assert.equal(h.scope.messageHasOlder.current, true);
  assert.ok(h.scope.messageOlderAnchor.current?.preciseCreatedAt);
  assert.equal(h.scope.messageCursor.current.id, 'hidden39');
  await h.callback('loadOlder')();
  assert.equal(olderReads, 1);
  assert.ok(h.rows.some((item) => item.id === 'history'));
  assert.equal(h.rows.some((item) => String(item.id).startsWith('hidden')), false);
});

test('6G.5C.2 R4 nested store transitions preserve newer inner commit', () => {
  const h = harness();
  const { createArenaTranscriptStore } = h.load('utils/arenaTranscriptStore.ts');
  const store = createArenaTranscriptStore();
  store.update([row('m', 1)]);
  const snapshots = [];
  store.subscribe(() => snapshots.push(store.getSnapshot().find((item) => item.id === 'm').reactions[0]?.count ?? 0));
  snapshots.length = 0;
  store.update((current) => {
    store.update(current.map((item) => (
      item.id === 'm' ? { ...item, reactions: [{ emoji: 'fire', count: 7, viewerReacted: true }] } : item
    )));
    // Nested write is queued; outer still sees the pre-inner base while it runs.
    assert.equal(store.getSnapshot().find((item) => item.id === 'm').reactions.length, 0);
    return current.map((item) => (
      item.id === 'm' ? { ...item, reactions: [{ emoji: 'fire', count: 1, viewerReacted: true }] } : item
    ));
  });
  // Serialize: outer publishes, then queued inner. Final value is the newer inner commit.
  assert.deepEqual(snapshots, [1, 7]);
  assert.equal(store.getSnapshot().find((item) => item.id === 'm').reactions[0].count, 7);
});

test('6G.5C.2 fault: removing room-session gates leaks Room A into Room B', async () => {
  const h = harness((source, file) => {
    if (!file.includes('useLiveArenaRoom')) return source;
    return source
      .replace(/const stillHere = \(\): boolean => liveSession\(session\);/, 'const stillHere = (): boolean => true;')
      .replace(/if \(!liveSession\(session\)\) return;/g, '/* fault: no session gate */');
  });
  const gate = deferred(), started = deferred();
  h.scope.accessGeneration.current = 1;
  h.scope.sessionRef.current = { roomId: 'A', generation: 1 };
  h.scope.messageCursor.current = row('a0', 0);
  h.rows = [row('a0', 0)];
  h.scope.fetchOfficialPage = async (_room, kind, cursor, direction) => {
    if (kind === 'evidence') return [];
    if (direction === 'newer' || !cursor) {
      started.resolve();
      await gate.promise;
      return [row('a-stale', 2)];
    }
    return [];
  };
  const pending = h.callback('refreshThread')();
  await started.promise;
  h.scope.accessGeneration.current = 2;
  h.scope.sessionRef.current = { roomId: 'B', generation: 2 };
  h.rows = [row('b0', 0)];
  gate.resolve();
  await pending;
  assert.equal(h.rows.some((item) => item.id === 'a-stale'), true, 'fault must make R1 fail');
});

test('6G.5C.2 fault: false pagination exhaustion is detectable', async () => {
  const h = harness((source, file) => {
    if (!file.includes('useLiveArenaRoom')) return source;
    return source.replace(
      /if \(visibilityBarrier\.allows\(pageEpoch\)\) \{\r?\n\s*messageHasOlder\.current = page\.length >= PAGE;/,
      'messageHasOlder.current = page.length >= PAGE; if (false) {\n        messageHasOlder.current = page.length >= PAGE;',
    );
  });
  const gate = deferred(), started = deferred();
  h.scope.messageOlderAnchor.current = row('base', 10);
  h.rows = [row('base', 10)];
  h.scope.fetchOfficialPage = async (_room, kind, cursor) => {
    if (kind === 'evidence' || !cursor) return [];
    started.resolve();
    await gate.promise;
    return Array.from({ length: 10 }, (_, n) => row('old' + n, n));
  };
  const pending = h.callback('loadOlder')();
  await started.promise;
  await pruneDuringRead(h);
  gate.resolve();
  await pending;
  assert.equal(h.scope.messageHasOlder.current, false, 'fault must falsely exhaust');
});

test('6G.5C.2 fault: losing raw backward anchor blocks loadOlder', async () => {
  const h = harness((source, file) => {
    if (!file.includes('useLiveArenaRoom')) return source;
    return source
      .replace(
        /if \(page\.at\(-1\)\?\.preciseCreatedAt\) messageOlderAnchor\.current = page\.at\(-1\) as OfficialCursor;/g,
        'messageOlderAnchor.current = null;',
      )
      .replace(
        /if \(thread\.at\(-1\)\?\.preciseCreatedAt\) messageOlderAnchor\.current = thread\.at\(-1\) as OfficialCursor;/g,
        'messageOlderAnchor.current = null;',
      )
      .replace(
        /\(oldestVisible\?\.preciseCreatedAt\r?\n\s*\? oldestVisible as OfficialCursor\r?\n\s*: null\) \?\? messageOlderAnchor\.current/,
        'oldestVisible?.preciseCreatedAt ? oldestVisible as OfficialCursor : null',
      );
  });
  h.scope.messageCursor.current = null;
  h.rows = [];
  const hidden = Array.from({ length: 40 }, (_, n) => row('hidden' + n, n + 1));
  let olderReads = 0;
  h.scope.fetchOfficialPage = async (_room, kind, cursor) => {
    if (kind === 'evidence') return [];
    if (!cursor) return [...hidden].reverse();
    olderReads++;
    return [row('history', -1)];
  };
  await h.callback('load')('initial');
  const remove = h.scope.visibilityBarrier.mark(hidden.map((item) => item.id));
  h.scope.updateMessages((current) => remove(current));
  assert.equal(h.rows.length, 0);
  await h.callback('loadOlder')();
  assert.equal(olderReads, 0, 'fault must lose the usable anchor');
});

test('6G.5C.2 fault: unsafe nested publication overwrites newer inner commit', () => {
  const h = harness((source, file) => {
    if (!file.includes('arenaTranscriptStore')) return source;
    return source.replace(
      /if \(depth > 0\) \{\r?\n\s*queued\.push\(update\);\r?\n\s*return;\r?\n\s*\}/,
      'if (depth > 0) { /* fault: run nested immediately */ run(update); return; }',
    );
  });
  const { createArenaTranscriptStore } = h.load('utils/arenaTranscriptStore.ts');
  const store = createArenaTranscriptStore();
  store.update([row('m', 1)]);
  store.update((current) => {
    store.update(current.map((item) => (
      item.id === 'm' ? { ...item, reactions: [{ emoji: 'fire', count: 7, viewerReacted: true }] } : item
    )));
    return current.map((item) => (
      item.id === 'm' ? { ...item, reactions: [{ emoji: 'fire', count: 1, viewerReacted: true }] } : item
    ));
  });
  assert.equal(store.getSnapshot().find((item) => item.id === 'm').reactions[0].count, 1,
    'fault allows outer to clobber the already-published inner value');
});
