const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const t = require('@babel/types');

// Execute the real callback bodies with deferred transport and optional queued
// state updaters. This is not a React renderer or native/backend integration test.
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
  const updates = [];
  const apply = (update) => { rows = typeof update === 'function' ? update(rows) : update; writes++; };
  const noop = () => {};
  const scope = {
    ...ordering, roomId: 'room', PAGE: 40, mounted: { current: true }, accessGeneration: { current: 0 },
    sendBusy: { current: null }, reactionSnapshots: { current: createReactionSnapshots() },
    visibilityBarrier: ordering.createVisibilityBarrier(), messageCursor: { current: row('base', 0) },
    evidenceCursor: { current: null }, evidenceRef: { current: [] }, evidenceVisibilityCursor: { current: 0 },
    visibilityCursor: { current: 0 }, VISIBILITY_BATCH: 100, roomRef: { current: { roomMode: 'DUEL' } },
    messagesRef: { get current() { return rows; } }, recovering: { current: false },
    reactionQueue: { current: { reconcile: async () => {} } }, drainOfficialGap,
    // The unchanged overflow scheduler is deliberately outside these tests.
    recoverOverflowAfterRefresh: async () => false,
    setMessages(update) { if (queued) updates.push(update); else apply(update); },
    setSending(value) { sending = value; }, notify() { notices++; },
    setEvidence: noop, setStats: noop, setHasOlder: noop, setThreadLocked: noop, setError: noop,
    fetchVisibleMessageIds: async () => ['base'], removeUnavailableMessages, mergeMessages: mergeMessagesById,
    isMembershipRefusal: (error) => error?.code === '42501',
    currentUserId: async () => 'account', acquireOfficialRequest: async () => 'request',
    confirmOfficialRequest: async () => {}, authorRef: { current: { id: 'account' } },
  };
  scope.clearPrivateThread = callback('clearPrivateThread', scope);
  return {
    scope, callback: (name) => callback(name, scope), load,
    get rows() { return rows; }, set rows(value) { rows = value; },
    get sending() { return sending; }, get writes() { return writes; }, get notices() { return notices; },
    get queuedUpdates() { return updates.length; },
    flushNext() { assert.ok(updates.length, 'queued updater available'); apply(updates.shift()); },
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

test('rejected 50-message drain preserves its cursor; a fresh pass recovers all 50', async () => {
  const h = harness(), gate = deferred(), started = deferred();
  const all = Array.from({ length: 50 }, (_, i) => row('gap' + (i + 1), i + 1));
  let newerReads = 0, hold = true;
  h.scope.fetchOfficialPage = async (_room, _kind, cursor, direction) => {
    if (direction !== 'newer') return all.slice(-40).reverse();
    newerReads++;
    if (hold) { hold = false; started.resolve(); await gate.promise; }
    return all.filter((item) => item.createdAt > cursor.createdAt).slice(0, 40);
  };
  const refresh = h.callback('refreshThread'), pending = refresh();
  await started.promise;
  await pruneDuringRead(h);
  gate.resolve();
  await pending;
  assert.equal(h.scope.messageCursor.current.id, 'base', 'rejected coverage must not advance');
  assert.equal(newerReads, 1, 'conservative rejection stops the drain without a tight retry');
  assert.equal(h.rows.filter((item) => item.id.startsWith('gap')).length, 40, 'rollup alone misses the first ten');
  await refresh();
  assert.equal(h.scope.messageCursor.current.id, 'gap50');
  for (const item of all) assert.ok(h.rows.some((loaded) => loaded.id === item.id), item.id);
  assert.equal(h.rows.length, 51);
  assert.equal(new Set(h.rows.map((item) => item.id)).size, h.rows.length);
});

test('individual visibility exclusion permits accepted page coverage to advance', async () => {
  const h = harness(), gate = deferred(), started = deferred();
  const all = Array.from({ length: 45 }, (_, i) => row('gap' + (i + 1), i + 1));
  h.rows.push(all[0]);
  let reads = 0;
  h.scope.fetchOfficialPage = async (_room, _kind, cursor, direction) => {
    if (direction !== 'newer') return all.slice(-40).reverse();
    if (++reads === 1) { started.resolve(); await gate.promise; }
    return all.filter((item) => item.createdAt > cursor.createdAt).slice(0, 40);
  };
  const pending = h.callback('refreshThread')();
  await started.promise;
  await h.callback('reconcileVisibility')();
  gate.resolve();
  await pending;
  assert.equal(h.scope.messageCursor.current.id, 'gap45');
  assert.equal(reads, 2);
  assert.equal(h.rows.some((item) => item.id === 'gap1'), false);
});

test('accepted empty gap page terminates without cursor movement', async () => {
  const h = harness(); let reads = 0;
  h.scope.fetchOfficialPage = async () => { reads++; return []; };
  await h.callback('refreshThread')();
  assert.equal(h.scope.messageCursor.current.id, 'base');
  assert.equal(reads, 2, 'one empty gap read and one rollup');
});

test('accepted coverage advances even when every row is individually excluded', async () => {
  const h = harness(), gate = deferred(), started = deferred();
  const page = Array.from({ length: 40 }, (_, i) => row('hidden' + (i + 1), i + 1));
  h.rows.push(...page);
  let reads = 0;
  h.scope.fetchOfficialPage = async (_room, _kind, cursor, direction) => {
    if (direction !== 'newer') return [];
    reads++;
    if (cursor.id !== 'base') return [];
    started.resolve(); await gate.promise; return page;
  };
  const pending = h.callback('refreshThread')();
  await started.promise;
  await h.callback('reconcileVisibility')();
  gate.resolve();
  await pending;
  assert.equal(h.scope.messageCursor.current.id, 'hidden40');
  assert.equal(reads, 2);
  assert.equal(h.rows.length, 1);
});

for (const ending of ['failure', 'generation', 'unmount']) test(`${ending} during gap fetch preserves the cursor`, async () => {
  const h = harness(), gate = deferred(), started = deferred();
  h.scope.fetchOfficialPage = async () => { started.resolve(); return gate.promise; };
  const pending = h.callback('refreshThread')();
  await started.promise;
  if (ending === 'generation') h.scope.clearPrivateThread();
  if (ending === 'unmount') h.scope.mounted.current = false;
  if (ending === 'failure') gate.reject(Error('offline')); else gate.resolve([row('late', 1)]);
  await pending;
  assert.equal(h.scope.messageCursor.current.id, 'base');
  assert.equal(h.rows.some((item) => item.id === 'late'), false);
});

test('drain stops when its consumer rejects coverage', async () => {
  const h = harness(); let fetches = 0, accepts = 0;
  await h.load('utils/officialRecovery.ts').drainOfficialGap(row('base', 0), async () => {
    fetches++; return Array.from({ length: 40 }, (_, i) => row('gap' + (i + 1), i + 1));
  }, () => { accepts++; return false; }, () => true);
  assert.equal(fetches, 1);
  assert.equal(accepts, 1);
});

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
for (const ending of ['success', 'failure']) test(`normal send ${ending} clears only its placeholder and busy state`, async () => {
  const { h, start } = sendingHarness();
  const operation = await start();
  assert.equal(h.sending, true);
  if (ending === 'success') operation.request.resolve(row('posted', 1)); else operation.request.reject(Error('offline'));
  assert.equal(await operation.pending, ending === 'success');
  assert.equal(h.sending, false);
  assert.equal(Boolean(h.scope.sendBusy.current), false);
  assert.equal(h.rows.some((item) => item.pending), false);
});

for (const ending of ['success', 'failure']) test(`invalidated ${ending} cannot retain busy state or clear a newer send`, async () => {
  const { h, start } = sendingHarness(), old = await start();
  h.scope.clearPrivateThread();
  assert.equal(h.sending, false, 'new scope is immediately available');
  assert.equal(Boolean(h.scope.sendBusy.current), false);
  const newer = await start(), placeholder = h.rows.find((item) => item.pending).id;
  if (ending === 'success') old.request.resolve(row('old', 1)); else old.request.reject(Error('offline'));
  assert.equal(await old.pending, false);
  assert.equal(h.rows.some((item) => item.id === 'old'), false);
  assert.equal(h.notices, 0);
  assert.equal(h.sending, true);
  assert.equal(Boolean(h.scope.sendBusy.current), true, 'old finally must not release new owner');
  assert.equal(h.rows.find((item) => item.pending).id, placeholder);
  newer.request.resolve(row('new', 2));
  assert.equal(await newer.pending, true);
  assert.equal(h.sending, false);
  assert.equal(h.rows.some((item) => item.pending), false);
});

test('invalidation while confirmation is pending releases sending without stale success', async () => {
  const { h, requests } = sendingHarness(), confirmation = deferred(), reached = deferred();
  h.scope.confirmOfficialRequest = () => { reached.resolve(); return confirmation.promise; };
  const send = h.callback('send'), pending = send({ body: 'argument' });
  for (let turns = 0; requests.length === 0 && turns < 20; turns++) await Promise.resolve();
  assert.equal(requests.length, 1);
  requests[0].resolve(row('old', 1));
  await reached.promise;
  h.scope.clearPrivateThread();
  assert.equal(h.sending, false);
  confirmation.resolve();
  assert.equal(await pending, false);
  assert.equal(h.rows.length, 0);
  assert.equal(Boolean(h.scope.sendBusy.current), false);
});

test('unmounted send never writes a row or reports success', async () => {
  const { h, start } = sendingHarness(), operation = await start();
  h.scope.mounted.current = false;
  const before = h.writes;
  operation.request.resolve(row('late', 1));
  assert.equal(await operation.pending, false);
  assert.equal(h.writes, before);
  assert.equal(Boolean(h.scope.sendBusy.current), false);
});

for (const stage of ['account', 'request']) test(`invalidation during ${stage} preparation aborts the old send`, async () => {
  const h = harness(), gate = deferred(), started = deferred();
  let posts = 0;
  h.scope[stage === 'account' ? 'currentUserId' : 'acquireOfficialRequest'] = () => {
    started.resolve(); return gate.promise;
  };
  h.scope.postMessage = async () => { posts++; return row('unexpected', 1); };
  const pending = h.callback('send')({ body: 'argument' });
  await started.promise;
  h.scope.clearPrivateThread();
  gate.resolve(stage === 'account' ? 'account' : 'request');
  assert.equal(await pending, false);
  assert.equal(posts, 0);
  assert.equal(h.rows.length, 0);
  assert.equal(h.sending, false);
  assert.equal(Boolean(h.scope.sendBusy.current), false);
});

test('a duplicate send cannot steal ownership from the active request', async () => {
  const { h, requests, send, start } = sendingHarness(), operation = await start();
  assert.equal(await send({ body: 'duplicate' }), false);
  assert.equal(requests.length, 1);
  assert.equal(h.sending, true);
  operation.request.resolve(row('posted', 1));
  assert.equal(await operation.pending, true);
  assert.equal(h.sending, false);
});

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

test('accepted queued page survives a later pruning floor and all 50 messages remain recoverable', async () => {
  const q = queuedRecovery(), { h } = q;
  h.rows.push({ ...row('pending', 51), pending: true });
  h.rows.push(...Array.from({ length: 501 }, (_, i) => row('hidden' + i, -i - 1)));
  const pending = q.refresh();
  await q.firstStarted.promise;
  q.first.resolve();
  await q.secondStarted.promise;
  assert.equal(h.scope.messageCursor.current.id, 'gap40');
  assert.equal(h.rows.some((item) => item.id.startsWith('gap')), false);
  const visibility = h.callback('reconcileVisibility');
  for (let pass = 0; pass < 6; pass++) await visibility();
  assert.equal(h.scope.visibilityBarrier.allows(0), false);
  h.flushAll();
  assert.equal(h.rows.filter((item) => item.id.startsWith('gap')).length, 40,
    'already accepted coverage must survive deferred application');
  q.second.resolve();
  await pending;
  h.flushAll();
  await q.refresh();
  h.flushAll();
  for (const item of q.all) assert.ok(h.rows.some((loaded) => loaded.id === item.id), item.id);
  assert.equal(h.rows.some((item) => item.id === 'pending' && item.pending), true);
  assert.equal(h.rows.length, 52);
  assert.equal(new Set(h.rows.map((item) => item.id)).size, 52);
});

test('queued merge followed by authoritative removal does not resurrect the removed row', async () => {
  const q = queuedRecovery(), { h } = q;
  h.rows.push(q.all[0]);
  const pending = q.refresh();
  await q.firstStarted.promise;
  q.first.resolve();
  await q.secondStarted.promise;
  await h.callback('reconcileVisibility')();
  h.flushAll();
  assert.equal(h.rows.some((item) => item.id === 'gap1'), false);
  assert.equal(h.rows.some((item) => item.id === 'gap2'), true);
  q.second.resolve();
  await pending;
  h.flushAll();
  assert.equal(h.rows.some((item) => item.id === 'gap1'), false);
});

for (const ending of ['generation', 'unmount']) test(`${ending} before queued page execution prevents stale insertion`, async () => {
  const q = queuedRecovery(), { h } = q, pending = q.refresh();
  await q.firstStarted.promise;
  q.first.resolve();
  await q.secondStarted.promise;
  if (ending === 'generation') h.scope.clearPrivateThread(); else h.scope.mounted.current = false;
  h.flushNext();
  assert.equal(h.rows.some((item) => item.id.startsWith('gap')), false);
  h.flushAll();
  q.second.resolve();
  await pending;
  h.flushAll();
  assert.equal(h.rows.some((item) => item.id.startsWith('gap')), false);
});

test('queued page uses current reaction barriers when its updater executes', async () => {
  const q = queuedRecovery(), { h } = q;
  h.rows.push({ ...q.all[0], reactions: [{ emoji: 'fire', count: 0, viewerReacted: false }] });
  q.all[0].reactions = [{ emoji: 'fire', count: 0, viewerReacted: false }];
  const pending = q.refresh();
  await q.firstStarted.promise;
  q.first.resolve();
  await q.secondStarted.promise;
  // A newer authoritative reaction has committed before this lower-priority
  // transcript updater. Transport/mutation semantics are covered separately.
  h.rows = h.rows.map((item) => item.id === 'gap1'
    ? { ...item, reactions: [{ emoji: 'fire', count: 1, viewerReacted: true }] } : item);
  const guard = h.scope.reactionSnapshots.current;
  guard.beginMutation('gap1'); guard.markAuthoritativeReactionWrite('gap1'); guard.finishMutation('gap1');
  h.flushNext();
  const reaction = h.rows.find((item) => item.id === 'gap1').reactions[0];
  assert.equal(reaction.count, 1);
  assert.equal(reaction.viewerReacted, true);
  q.second.resolve(); await pending; h.flushAll();
  assert.equal(h.rows.find((item) => item.id === 'gap1').reactions[0].count, 1);
});

test('concurrent refresh cannot overlap a drain with a queued page', async () => {
  const q = queuedRecovery(), { h } = q, pending = q.refresh();
  await q.firstStarted.promise;
  q.first.resolve();
  await q.secondStarted.promise;
  await q.refresh();
  assert.equal(q.reads, 2);
  assert.equal(h.scope.messageCursor.current.id, 'gap40');
  q.second.resolve(); await pending; h.flushAll();
  assert.equal(q.reads, 2);
  assert.equal(h.rows.length, 51);
});

test('whole-request rejection before acceptance remains unacknowledged with queued setters', async () => {
  const q = queuedRecovery(), { h } = q;
  h.rows.push(...Array.from({ length: 501 }, (_, i) => row('hidden' + i, -i - 1)));
  const pending = q.refresh();
  await q.firstStarted.promise;
  const visibility = h.callback('reconcileVisibility');
  for (let pass = 0; pass < 6; pass++) await visibility();
  h.flushAll();
  q.first.resolve();
  await pending;
  h.flushAll();
  assert.equal(h.scope.messageCursor.current.id, 'base');
  assert.equal(q.reads, 1);
  assert.equal(h.rows.filter((item) => item.id.startsWith('gap')).length, 40);
});

module.exports = { harness, sendingHarness };
