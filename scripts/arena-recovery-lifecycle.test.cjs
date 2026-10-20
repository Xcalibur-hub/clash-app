const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, row, deferred, pruneDuringRead, sendingHarness, queuedRecovery } = require('./arena-room-harness.cjs');

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

test('R1 reversed visibility removal invalidates only the evicted accepted row, even after pruning', async () => {
  const q = queuedRecovery(), { h } = q;
  h.rows.push(q.all[0], { ...row('pending', 60), pending: true });
  const pending = q.refresh();
  await q.firstStarted.promise; q.first.resolve(); await q.secondStarted.promise;
  assert.equal(h.scope.messageCursor.current.id, 'gap40');
  await h.callback('reconcileVisibility')();
  h.flushLast(); // Apply the later authoritative removal before the accepted page.
  assert.equal(h.rows.some(item => item.id === 'gap1'), false);
  // Prune the individual tombstone before applying the accepted batch.
  h.scope.visibilityBarrier.mark(Array.from({ length: 501 }, (_, i) => 'pruned' + i));
  h.flushNext();
  const removed = h.rows.some(item => item.id === 'gap1');
  const unrelated = h.rows.filter(item => item.id.startsWith('gap')).length;
  q.second.resolve(); await pending; h.flushAll();
  assert.equal(removed, false, 'a later eviction survives reversed updater execution and pruning');
  assert.equal(unrelated, 39, 'unrelated accepted coverage survives');
  assert.equal(h.rows.some(item => item.id === 'pending' && item.pending), true);
  assert.equal(new Set(h.rows.map(item => item.id)).size, h.rows.length);
});

for (const loaded of [false, true]) for (const reverse of [false, true]) {
  test(`R2 recovery/rollup snapshots preserve newer reactions: loaded=${loaded}, reverse=${reverse}`, async () => {
    const h = harness(undefined, { queued: true }), gate = deferred(), started = deferred();
    const older = { ...row('m', 1), reactions: [{ emoji: 'fire', count: 0, viewerReacted: false }] };
    const newer = { ...older, reactions: [{ emoji: 'fire', count: 1, viewerReacted: true }] };
    if (loaded) h.rows.push(older);
    h.scope.fetchOfficialPage = async (_room, _kind, _cursor, direction) => {
      if (direction !== 'newer') return [newer];
      started.resolve(); await gate.promise; return [older];
    };
    const pending = h.callback('refreshThread')();
    await started.promise; gate.resolve(); await pending;
    if (reverse) { h.flushLast(); h.flushNext(); } else h.flushAll();
    const message = h.rows.find(item => item.id === 'm');
    assert.equal(message.reactions[0].count, 1);
    assert.equal(message.reactions[0].viewerReacted, true);
    assert.equal(h.scope.messageCursor.current.id, 'm');
    assert.equal(new Set(h.rows.map(item => item.id)).size, h.rows.length);
  });
}

for (const ending of ['generation', 'unmount']) test(`R3 deferred rollup rejects ${ending} at application`, async () => {
  const h = harness(undefined, { queued: true });
  h.scope.fetchOfficialPage = async (_room, _kind, _cursor, direction) => direction === 'newer' ? [] : [row('late', 1)];
  await h.callback('refreshThread')();
  if (ending === 'generation') { h.scope.clearPrivateThread(); h.flushLast(); }
  else h.scope.mounted.current = false;
  h.flushAll();
  assert.equal(h.rows.some(item => item.id === 'late'), false);
});

test('R4 reversed refresh batches preserve newer locally ordered body and moderation fields', async () => {
  const h = harness(undefined, { queued: true });
  h.rows.push({ ...row('pending', 2), pending: true });
  let pass = 0;
  h.scope.fetchOfficialPage = async (_room, _kind, cursor, direction) => {
    if (direction === 'newer') return cursor.id === 'base' ? [row('m', 1)] : [];
    return [{ ...row('m', 1), body: pass ? '[redacted]' : 'older body', mediaUrl: pass ? null : 'old-url' }];
  };
  const refresh = h.callback('refreshThread');
  await refresh(); pass++; await refresh();
  const cursor = h.scope.messageCursor.current.id;
  h.flushLast(); // Newer server response commits first.
  assert.equal(h.rows.find(item => item.id === 'm').body, '[redacted]');
  while (h.queuedUpdates) h.flushLast();
  const message = h.rows.find(item => item.id === 'm');
  assert.equal(message.body, '[redacted]');
  assert.equal(message.mediaUrl, null);
  assert.equal(h.scope.messageCursor.current.id, cursor);
  assert.equal(h.rows.some(item => item.id === 'pending' && item.pending), true);
  assert.equal(new Set(h.rows.map(item => item.id)).size, h.rows.length);
});

test('rollup scope gate is effective independently of visibility invalidation', async () => {
  const h = harness(undefined, { queued: true });
  h.scope.fetchOfficialPage = async (_r, _k, _c, direction) => direction === 'newer' ? [] : [row('late', 1)];
  await h.callback('refreshThread')();
  h.scope.accessGeneration.current++;
  h.flushAll();
  assert.equal(h.rows.some(item => item.id === 'late'), false);
});

for (const path of ['hydrateInserted', 'load', 'loadOlder', 'send']) {
  test(`${path} deferred server rows reject generation invalidation`, async () => {
    const h = harness(undefined, { queued: true });
    h.scope.fetchOfficialPage = async () => [row('late', -1)];
    h.scope.postMessage = async () => row('late', 1);
    const callback = h.callback(path);
    await callback(path === 'hydrateInserted' ? ['late'] : path === 'load' ? 'initial' : { body: 'argument' });
    assert.ok(h.queuedUpdates > 0, 'production callback queued a message updater');
    h.scope.accessGeneration.current++;
    h.flushAll(); h.flushEvidenceAll();
    assert.equal(h.rows.some(item => item.id === 'late' || item.pending), false);
    assert.equal(h.evidence.length, 0);
  });
}

test('authoritative reaction-only null removal invalidates an already accepted batch', async () => {
  const q = queuedRecovery(), { h } = q;
  h.rows.push(q.all[0]);
  const pending = q.refresh();
  await q.firstStarted.promise; q.first.resolve(); await q.secondStarted.promise;
  h.callback('writeReaction')('gap1', null);
  h.flushLast(); h.flushNext();
  const resurrected = h.rows.some(item => item.id === 'gap1');
  q.second.resolve(); await pending; h.flushAll();
  assert.equal(resurrected, false);
});

test('deferred reaction-only write rejects a later access generation', () => {
  const h = harness(undefined, { queued: true });
  h.scope.reactionSnapshots.current.beginMutation('base');
  h.callback('writeReaction')('base', [{ emoji: 'fire', count: 9, viewerReacted: true }]);
  h.scope.accessGeneration.current++;
  h.flushAll();
  assert.equal(h.rows[0].reactions.length, 0);
  assert.equal(h.scope.reactionSnapshots.current.protectedIds().length, 1, 'application does not finish a toggle');
});

test('stale thread-clear updater cannot erase a newer scope', () => {
  const h = harness(undefined, { queued: true });
  h.scope.clearPrivateThread();
  h.scope.accessGeneration.current++;
  h.rows = [row('new-scope', 1)];
  h.flushAll();
  assert.equal(h.rows[0].id, 'new-scope');
});

test('reversed successful send cannot leave its queued placeholder behind', async () => {
  const h = harness(undefined, { queued: true });
  h.scope.postMessage = async () => row('posted', 1);
  assert.equal(await h.callback('send')({ body: 'argument' }), true);
  assert.equal(h.queuedUpdates, 2);
  h.flushLast(); h.flushNext();
  assert.equal(h.rows.some(item => item.pending), false);
  assert.equal(h.rows.filter(item => item.id === 'posted').length, 1);
});

test('6G.5A.6 R1 fresh admission survives an older visibility removal through complete recovery', async () => {
  const q = queuedRecovery(), { h } = q;
  h.rows.push(q.all[0], { ...row('pending', 60), pending: true });
  const pending = q.refresh();
  await q.firstStarted.promise; q.first.resolve(); await q.secondStarted.promise;
  assert.equal(h.scope.messageCursor.current.id, 'gap40');
  await h.callback('reconcileVisibility')();
  h.scope.fetchMessage = async () => ({ ...q.all[0], body: 'authorized again' });
  await h.callback('hydrateInserted')(['gap1']);
  h.flushLast(); // New authorized insertion applies before the old removal.
  assert.equal(h.rows.find(item => item.id === 'gap1').body, 'authorized again');
  h.flushLast(); h.flushNext();
  q.second.resolve(); await pending; h.flushAll();
  await q.refresh(); h.flushAll();
  for (const item of q.all) assert.ok(h.rows.some(loaded => loaded.id === item.id), item.id);
  assert.equal(h.scope.messageCursor.current.id, 'gap50');
  assert.equal(h.rows.some(item => item.id === 'pending' && item.pending), true);
  assert.equal(new Set(h.rows.map(item => item.id)).size, h.rows.length);
});

for (const reintroduce of [false, true]) test(`6G.5A.6 R2 null removal with later admission=${reintroduce}`, async () => {
  const h = harness(undefined, { queued: true });
  h.rows.push(row('m', 1));
  const { createRoomReactionBridge } = h.load('utils/roomReactionBridge.ts');
  let toggles = 0;
  h.scope.reactionQueue.current = createRoomReactionBridge({
    snapshots: h.scope.reactionSnapshots.current, read: async () => null,
    toggle: async () => { toggles++; throw Error('null row must not toggle'); },
    write: h.callback('writeReaction'), onError: () => {},
  });
  await h.callback('react')('m', 'fire');
  if (reintroduce) {
    h.scope.fetchMessage = async () => ({ ...row('m', 1), body: 'authorized again' });
    await h.callback('hydrateInserted')(['m']); h.flushLast();
  }
  h.flushAll();
  assert.equal(h.rows.some(item => item.id === 'm'), reintroduce);
  assert.equal(toggles, 0);
  assert.equal(h.scope.reactionSnapshots.current.protectedIds().length, 0);
});

function reactionApplicationHarness() {
  const h = harness(undefined, { queued: true });
  const reactions = (count, viewerReacted) => [{ emoji: 'fire', count, viewerReacted }];
  h.rows.push({ ...row('m', 1), reactions: reactions(0, false) });
  let state = reactions(0, false), toggles = 0, completions = 0, offline = false;
  const original = h.scope.reactionSnapshots.current;
  h.scope.reactionSnapshots.current = { ...original, finishMutation(id) {
    completions++; original.finishMutation(id);
  } };
  const { createRoomReactionBridge } = h.load('utils/roomReactionBridge.ts');
  h.scope.reactionQueue.current = createRoomReactionBridge({
    snapshots: h.scope.reactionSnapshots.current,
    read: async () => { if (offline) throw Error('offline'); return state; },
    toggle: async () => {
      toggles++;
      if (offline) throw Error('ambiguous');
      const selected = !state[0].viewerReacted;
      state = reactions(selected ? 1 : 0, selected);
      return { messageId: 'm', emoji: 'fire', count: state[0].count, reacted: selected };
    },
    write: h.callback('writeReaction'), onError: () => {},
  });
  return {
    h, react: h.callback('react'), reactions,
    get toggles() { return toggles; }, get completions() { return completions; },
    set state(value) { state = value; }, set offline(value) { offline = value; },
  };
}

test('6G.5A.6 R3 two serialized actual toggles retain the latest result under reversed application', async () => {
  const q = reactionApplicationHarness(), { h } = q;
  await q.react('m', 'fire'); h.flushNext(); // First optimistic write already ran.
  await q.react('m', 'fire');
  assert.equal(h.queuedUpdates, 3);
  while (h.queuedUpdates) h.flushLast();
  const fire = h.rows.find(item => item.id === 'm').reactions.find(item => item.emoji === 'fire');
  assert.equal(fire?.count ?? 0, 0);
  assert.equal(fire?.viewerReacted ?? false, false);
  assert.equal(q.toggles, 2);
  assert.equal(q.completions, 2);
  assert.equal(h.scope.reactionSnapshots.current.protectedIds().length, 0);
});

test('6G.5A.6 R4 authoritative reconciliation supersedes queued mutation writes', async () => {
  const q = reactionApplicationHarness(), { h } = q;
  // Retain a failed baseline read for the real queue to reconcile.
  q.offline = true; await q.react('m', 'fire'); q.offline = false;
  await q.react('m', 'fire');
  // Keep a dirty obligation without a toggle RPC by failing its baseline read.
  q.offline = true; await q.react('m', 'fire'); q.offline = false;
  q.state = q.reactions(7, false);
  await h.scope.reactionQueue.current.reconcile();
  while (h.queuedUpdates) h.flushLast();
  const fire = h.rows.find(item => item.id === 'm').reactions[0];
  assert.equal(fire.count, 7); assert.equal(fire.viewerReacted, false);
  assert.equal(q.toggles, 1, 'ambiguous/baseline failures do not replay toggles');
  assert.equal(q.completions, 3);
});

test('6G.5A.6 R4 queued authoritative reconciliation cannot overwrite a later mutation', async () => {
  const q = reactionApplicationHarness(), { h } = q;
  q.offline = true; await q.react('m', 'fire'); q.offline = false;
  await h.scope.reactionQueue.current.reconcile();
  await q.react('m', 'fire');
  while (h.queuedUpdates) h.flushLast();
  const fire = h.rows.find(item => item.id === 'm').reactions[0];
  assert.equal(fire.count, 1); assert.equal(fire.viewerReacted, true);
  assert.equal(q.toggles, 1); assert.equal(q.completions, 2);
});

for (const ending of ['generation', 'unmount']) test(`6G.5A.6 R4 queued reaction/removal writes reject ${ending}`, async () => {
  const q = reactionApplicationHarness(), { h } = q;
  await q.react('m', 'fire'); await h.callback('reconcileVisibility')();
  if (ending === 'generation') h.scope.accessGeneration.current++;
  else h.scope.mounted.current = false;
  while (h.queuedUpdates) h.flushLast();
  const fire = h.rows.find(item => item.id === 'm').reactions[0];
  assert.equal(fire.count, 0); assert.equal(fire.viewerReacted, false);
  assert.equal(q.toggles, 1); assert.equal(q.completions, 1);
});

test('6G.5A.6 R4 later authoritative eviction still beats a fresh reintroduction', async () => {
  const h = harness(undefined, { queued: true });
  h.rows.push(row('m', 1));
  await h.callback('reconcileVisibility')();
  await h.callback('hydrateInserted')(['m']); h.flushLast();
  await h.callback('reconcileVisibility')();
  while (h.queuedUpdates) h.flushLast();
  assert.equal(h.rows.some(item => item.id === 'm'), false);
});

test('6G.5A.6 R4 a newer full-row snapshot supersedes queued reaction-only writes', async () => {
  const q = reactionApplicationHarness(), { h } = q;
  await q.react('m', 'fire');
  h.scope.fetchMessage = async () => ({ ...row('m', 1), body: 'new body', reactions: q.reactions(7, false) });
  await h.callback('hydrateInserted')(['m']);
  while (h.queuedUpdates) h.flushLast();
  const message = h.rows.find(item => item.id === 'm');
  assert.equal(message.body, 'new body');
  assert.equal(message.reactions[0].count, 7);
  assert.equal(message.reactions[0].viewerReacted, false);
  assert.equal(q.toggles, 1); assert.equal(q.completions, 1);
});

test('6G.5A.6 R4 a newer mutation supersedes a queued full-row snapshot', async () => {
  const q = reactionApplicationHarness(), { h } = q;
  h.scope.fetchMessage = async () => ({ ...row('m', 1), reactions: q.reactions(7, false) });
  await h.callback('hydrateInserted')(['m']);
  await q.react('m', 'fire');
  while (h.queuedUpdates) h.flushLast();
  const fire = h.rows.find(item => item.id === 'm').reactions[0];
  assert.equal(fire.count, 1); assert.equal(fire.viewerReacted, true);
  assert.equal(q.toggles, 1); assert.equal(q.completions, 1);
});

test('6G.5A.6 R4 latest accepted reaction write survives snapshot entry eviction', async () => {
  const q = reactionApplicationHarness(), { h } = q;
  h.rows.push({ ...row('pending', 9), pending: true });
  await q.react('m', 'fire');
  h.scope.fetchMessage = async id => row(id, -1);
  const hydrate = h.callback('hydrateInserted');
  for (let i = 0; i < 264; i += 12) {
    await hydrate(Array.from({ length: 12 }, (_, n) => 'churn-' + (i + n)));
    h.flushLast();
  }
  h.flushLast(); h.flushNext();
  const fire = h.rows.find(item => item.id === 'm').reactions[0];
  assert.equal(fire.count, 1); assert.equal(fire.viewerReacted, true);
  assert.equal(h.rows.some(item => item.id === 'pending' && item.pending), true);
  assert.equal(new Set(h.rows.map(item => item.id)).size, h.rows.length);
  assert.equal(q.completions, 1);
});

test('6G.5A.6 R4 stale removal preserves only the readmitted id after watermark pruning', async () => {
  const h = harness(undefined, { queued: true });
  h.rows.push(row('m', 1), row('hidden', 2), { ...row('pending', 3), pending: true });
  await h.callback('reconcileVisibility')();
  h.scope.visibilityBarrier.mark(Array.from({ length: 501 }, (_, n) => 'pruned-' + n));
  await h.callback('hydrateInserted')(['m']);
  h.flushLast(); h.flushNext();
  assert.equal(h.rows.some(item => item.id === 'm'), true);
  assert.equal(h.rows.some(item => item.id === 'hidden'), false);
  assert.equal(h.rows.some(item => item.id === 'pending' && item.pending), true);
  assert.equal(new Set(h.rows.map(item => item.id)).size, h.rows.length);
});

module.exports = { harness, sendingHarness };
