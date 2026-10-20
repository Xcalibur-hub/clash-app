
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const t = require('@babel/types');

// Execute the real callback bodies with deferred transport and optional queued
// imperative commands. This is not a React renderer or native/backend integration test.
function harness(transform = (source) => source, { queued = false } = {}) {
  const modules = new Map();
  const context = vm.createContext({ Date, Math, Symbol });
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const source = transform(fs.readFileSync(file, 'utf8'), path.relative(process.cwd(), file).replaceAll('\\', '/'));
    const code = babel.transformSync(source, {
      filename: file, babelrc: false, configFile: false,
      presets: ['@babel/preset-typescript'], plugins: ['@babel/plugin-transform-modules-commonjs'],
    }).code;
    vm.runInContext(`(function(module,exports,require){${code}\n})`, context)(module, module.exports, (dependency) => {
      if (!dependency.startsWith('.')) throw Error(`Unexpected dependency: ${dependency}`);
      return load(path.resolve(path.dirname(file), dependency.replace(/\.ts$/, '') + '.ts'));
    });
    return module.exports;
  }
  const source = transform(fs.readFileSync('hooks/useLiveArenaRoom.ts', 'utf8'), 'hooks/useLiveArenaRoom.ts');
  const ast = babel.parseSync(source, {
    filename: 'hook.ts', babelrc: false, configFile: false, presets: ['@babel/preset-typescript'],
  });
  const callbacks = new Map();
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.init?.callee?.property?.name === 'useCallback') {
      callbacks.set(node.id.name, node.init.arguments[0]);
    }
    if (node.type === 'CallExpression' && node.callee?.name === 'createRoomReactionBridge') {
      const write = node.arguments[0].properties.find(property => property.key?.name === 'write');
      callbacks.set('writeReaction', write.value);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  })(ast);
  function callback(name, scope) {
    assert.ok(callbacks.has(name), name);
    const file = t.file(t.program([t.expressionStatement(t.assignmentExpression('=',
      t.memberExpression(t.identifier('module'), t.identifier('exports')), callbacks.get(name)))]));
    const code = babel.transformFromAstSync(file, null, {
      filename: 'callback.ts', babelrc: false, configFile: false, presets: ['@babel/preset-typescript'],
    }).code;
    const module = { exports: {} };
    vm.runInNewContext(code, { module, ...scope });
    return module.exports;
  }
  const ordering = load('utils/transcriptOrdering.ts');
  const { createReactionSnapshots } = load('utils/reactionSnapshots.ts');
  const { mergeMessagesById, removeUnavailableMessages } = load('utils/liveRoomThread.ts');
  const { drainOfficialGap } = load('utils/officialRecovery.ts');
  let rows = [row('base', 0)], sending = false, writes = 0, notices = 0;
  let evidence = [];
  const evidenceUpdates = [];
  const updates = [];
  const apply = (update) => { rows = typeof update === 'function' ? update(rows) : update; writes++; };
  const noop = () => {};
  const scope = {
    ...ordering, roomId: 'room', PAGE: 40, mounted: { current: true }, accessGeneration: { current: 0 },
    sendBusy: { current: null }, reactionSnapshots: { current: createReactionSnapshots() },
    visibilityBarrier: ordering.createVisibilityBarrier(), messageCursor: { current: row('base', 0) },
    initialCoverage: { current: null },
    evidenceCursor: { current: null }, evidenceRef: { current: [] }, evidenceVisibilityCursor: { current: 0 },
    visibilityCursor: { current: 0 }, VISIBILITY_BATCH: 100, roomRef: { current: { roomMode: 'DUEL' } },
    messagesRef: { get current() { return rows; } }, recovering: { current: false },
    reactionQueue: { current: { reconcile: async () => {} } }, drainOfficialGap,
    // The unchanged overflow scheduler is deliberately outside these tests.
    recoverOverflowAfterRefresh: async () => false,
    setMessages(update) { if (queued) updates.push(update); else apply(update); },
    setEvidence(update) {
      const applyEvidence = () => { evidence = typeof update === 'function' ? update(evidence) : update; };
      if (queued) evidenceUpdates.push(applyEvidence); else applyEvidence();
    },
    setSending(value) { sending = value; }, notify() { notices++; },
    setStats: noop, setHasOlder: noop, setThreadLocked: noop, setError: noop,
    setRoom: noop, setLoading: noop, setRefreshing: noop, setLoadingOlder: noop,
    fetchRoom: async () => ({ roomMode: 'DUEL', status: 'LIVE' }), fetchEvidence: async () => [],
    fetchMessage: async id => row(id, 1), loadingOlder: false, hasOlder: true, threadLocked: false,
    messageHasOlder: { current: true }, evidenceHasOlder: { current: false }, olderEvidence: { current: null },
    get messages() { return rows; }, evidenceBusy: { current: false },
    fetchVisibleMessageIds: async () => ['base'], removeUnavailableMessages, mergeMessages: mergeMessagesById,
    isMembershipRefusal: (error) => error?.code === '42501',
    currentUserId: async () => 'account', acquireOfficialRequest: async () => 'request',
    confirmOfficialRequest: async () => {}, authorRef: { current: { id: 'account' } },
  };
  // Legacy queued-command mode deliberately stresses delayed imperative
  // transitions. Mounted tests separately bind the actual authoritative owner.
  scope.updateMessages = scope.setMessages;
  scope.clearPrivateThread = callback('clearPrivateThread', scope);
  return {
    scope, callback: (name) => callback(name, scope), load,
    get rows() { return rows; }, set rows(value) { rows = value; },
    get sending() { return sending; }, get writes() { return writes; }, get notices() { return notices; },
    get queuedUpdates() { return updates.length; },
    get evidence() { return evidence; },
    set evidence(value) { evidence = value; },
    flushEvidenceAll() { while (evidenceUpdates.length) evidenceUpdates.shift()(); },
    flushNext() { assert.ok(updates.length, 'queued updater available'); apply(updates.shift()); },
    flushLast() { assert.ok(updates.length, 'queued updater available'); apply(updates.pop()); },
    flushAll() { while (updates.length) apply(updates.shift()); },
  };
}
function row(id, n) {
  return { id, roomId: 'room', createdAt: n * 1000, preciseCreatedAt: new Date(n * 1000).toISOString(), body: id, reactions: [] };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function pruneDuringRead(h) {
  h.rows.push(...Array.from({ length: 501 }, (_, i) => row('hidden' + i, -i - 1)));
  const visibility = h.callback('reconcileVisibility');
  for (let pass = 0; h.rows.some((item) => item.id.startsWith('hidden')) && pass < 10; pass++) await visibility();
  assert.equal(h.rows.length, 1);
  assert.equal(h.scope.visibilityBarrier.allows(0), false);
}

function sendingHarness() {
  const h = harness(), requests = [];
  h.scope.postMessage = () => { const request = deferred(); requests.push(request); return request.promise; };
  const send = h.callback('send');
  return { h, requests, send, async start() {
    const previous = requests.length, pending = send({ body: 'argument' });
    for (let turns = 0; requests.length === previous && turns < 20; turns++) await Promise.resolve();
    assert.equal(requests.length, previous + 1, 'send reached mocked transport');
    return { pending, request: requests.at(-1) };
  } };
}
function queuedRecovery() {
  const h = harness(undefined, { queued: true });
  const all = Array.from({ length: 50 }, (_, i) => row('gap' + (i + 1), i + 1));
  const first = deferred(), second = deferred(), firstStarted = deferred(), secondStarted = deferred();
  let reads = 0, holdSecond = true;
  h.scope.fetchOfficialPage = async (_room, _kind, cursor, direction) => {
    if (direction !== 'newer') return all.slice(-40).reverse();
    reads++;
    if (cursor.id === 'base') { firstStarted.resolve(); await first.promise; return all.slice(0, 40); }
    if (cursor.id === 'gap40' && holdSecond) {
      holdSecond = false; secondStarted.resolve(); await second.promise;
    }
    return all.filter((item) => item.createdAt > cursor.createdAt).slice(0, 40);
  };
  const refresh = h.callback('refreshThread');
  return { h, all, first, second, firstStarted, secondStarted, refresh, get reads() { return reads; } };
}


module.exports = { harness, row, deferred, pruneDuringRead, sendingHarness, queuedRecovery };
