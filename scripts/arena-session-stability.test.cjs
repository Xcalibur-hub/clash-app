const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mountedRoom, message, React } = require('./arena-mounted-room.cjs');
const { harness, row, deferred } = require('./arena-room-harness.cjs');

const page = (roomId, start, length) => Array.from({ length }, (_, i) => ({ ...message(roomId + '-' + (start - i), start - i), roomId }));

test('C3 R1 public refresh keeps its original session across every continuation', async () => {
  const room = mountedRoom({ roomId: 'A' }), gate = deferred(), started = deferred();
  let hold = false, pending; const requests = [];
  room.services.fetchOfficialPage = async (id, kind, cursor, direction) => {
    requests.push({ id, kind, direction });
    if (hold && id === 'A' && direction === 'newer') { hold = false; started.resolve(); return gate.promise; }
    return direction ? [] : page(id, 100, 40);
  };
  try {
    await room.mount(); hold = true;
    await React.act(async () => { pending = room.committed.refresh(); await started.promise; });
    await room.switchRoom('B');
    const count = requests.length, reads = room.readTokens.length, snapshot = room.owner.getSnapshot();
    await React.act(async () => { gate.resolve(page('A', 140, 40)); await pending; });
    const trace = { requests: requests.slice(count), tokens: room.readTokens.length - reads };
    assert.equal(requests.length, count, 'old operation issued reads after cancellation: ' + JSON.stringify(trace));
    assert.equal(room.readTokens.length, reads, 'old operation allocated B read tokens');
    assert.equal(room.owner.getSnapshot(), snapshot, 'B snapshot changed after stale A completion');
    assert.equal(room.committed.loading, false); assert.equal(room.committed.refreshing, false);
    assert.equal(room.renderViews.some(view => view.roomId === 'B' && view.ids.some(id => id.startsWith('A-'))), false);
  } finally { gate.resolve([]); if (pending) await pending; await room.unmount(); }
});

test('C3 R1 pagination busy ownership resets for B and stale A cannot release B', async () => {
  const room = mountedRoom({ roomId: 'A' }), a = deferred(), b = deferred(), started = deferred();
  let first, second, reads = 0;
  room.services.fetchOfficialPage = async (id, kind, cursor, direction) => {
    if (!cursor || direction) return direction ? [] : page(id, 100, 40);
    reads++; started.resolve(); return id === 'A' ? a.promise : b.promise;
  };
  try {
    await room.mount();
    await React.act(async () => { first = room.committed.loadOlder(); await started.promise; });
    await room.switchRoom('B');
    assert.equal(room.committed.loadingOlder, false, 'B inherited A pagination busy state');
    await React.act(async () => { second = room.committed.loadOlder(); for (let i = 0; i < 12; i++) await Promise.resolve(); });
    assert.equal(reads, 2); assert.equal(room.committed.loadingOlder, true);
    await React.act(async () => { a.resolve(page('A', 60, 10)); await first; });
    assert.equal(room.committed.loadingOlder, true, 'A released B pagination ownership');
    await React.act(async () => { b.resolve([]); await second; });
    assert.equal(room.committed.loadingOlder, false);
  } finally { a.resolve([]); b.resolve([]); await React.act(async () => { await Promise.all([first, second]); }); await room.unmount(); }
});

test('C3 R2 same-turn older requests cannot reverse exhaustion metadata', async () => {
  const room = mountedRoom(), first = deferred(), second = deferred();
  let requests = 0, a, b;
  room.services.fetchOfficialPage = async (id, kind, cursor, direction) => !cursor || direction
    ? page(id, 100, 40) : (++requests === 1 ? first.promise : second.promise);
  try {
    await room.mount();
    await React.act(async () => { const load = room.committed.loadOlder; a = load(); b = load(); for (let i = 0; i < 12; i++) await Promise.resolve(); });
    if (requests === 2) {
      await React.act(async () => { second.resolve(page('room', 60, 40)); await b; });
      await React.act(async () => { first.resolve(page('room', 60, 10)); await a; });
    } else await React.act(async () => { first.resolve(page('room', 60, 40)); await Promise.all([a, b]); });
    assert.equal(requests, 1, 'two same-turn requests started; final hasOlder=' + room.committed.hasOlder);
    assert.equal(room.committed.hasOlder, true);
    assert.equal(new Set(room.committed.messages.map(row => row.id)).size, room.committed.messages.length);
  } finally { first.resolve([]); second.resolve([]); await React.act(async () => { await Promise.all([a, b]); }); await room.unmount(); }
});

test('C3 R3 root StrictMode outside Suspense loads the authoritative initial row', async () => {
  const room = mountedRoom({ strict: true, rootStrict: true });
  room.services.fetchOfficialPage = async () => [message('m', 1, 7, 'authoritative')];
  try {
    await room.mount();
    assert.equal(room.committed.messages.find(row => row.id === 'm')?.reactions[0]?.count, 7, 'root replay stranded initial coverage');
    assert.equal(room.committed.messages[0].body, 'authoritative');
    assert.equal(room.committed.loading, false);
    assert.equal(room.observations.some(item => item.rendering), false);
  } finally { await room.unmount(); }
});

for (const [method, transport, args, result] of [
  ['voteSide', 'submitSideVote', ['AGREE'], undefined],
  ['voteArgument', 'submitArgumentVote', ['A-row'], undefined],
  ['recordFinal', 'recordFinalStance', ['AGREE'], { finalStance: 'AGREE', finalRecordedAt: 1 }],
  ['upgradeToDebater', 'upgradeSpectator', ['AGREE'], undefined],
]) test(`C3 R1 ${method} completion keeps its room session`, async () => {
  const room = mountedRoom({ roomId: 'A' }), gate = deferred(), started = deferred(); let pending;
  room.services.fetchRoom = async id => ({ id, roomMode: 'GROUP', status: 'LIVE', viewer: {} });
  room.services[transport] = async () => { started.resolve(); return gate.promise; };
  try {
    await room.mount(); await React.act(async () => { pending = room.committed[method](...args); await started.promise; });
    await room.switchRoom('B'); const before = room.committed.room;
    await React.act(async () => { gate.resolve(result); await pending; });
    assert.equal(room.committed.room, before, 'stale ' + method + ' modified B');
  } finally { gate.resolve(result); await React.act(async () => { if (pending) await pending; }); await room.unmount(); }
});

function owned() {
  const h = harness(), store = h.load('utils/arenaTranscriptStore.ts').createArenaTranscriptStore();
  Object.assign(h.scope, { updateMessages: store.update, messagesRef: store.messagesRef,
    visibilityBarrier: store.visibility, reactionSnapshots: { current: store.reactions } });
  return { h, store };
}

test('C3 R4 acknowledged raw boundary wins over a retained newer visible row', async () => {
  const { h, store } = owned(), gate = deferred(), started = deferred(), cursors = [];
  const hidden = page('hidden', 99, 40); store.update([row('base', 100)]);
  h.scope.fetchOfficialPage = async (id, kind, cursor) => {
    if (kind === 'evidence') return [];
    cursors.push(cursor.id); if (cursors.length === 1) { started.resolve(); return gate.promise; } return [];
  };
  const pending = h.callback('loadOlder')(); await started.promise;
  store.update(current => [...current, ...hidden]); await h.callback('reconcileVisibility')();
  gate.resolve(hidden); await pending;
  assert.equal(store.getSnapshot().length, 1);
  assert.equal(h.scope.messageOlderAnchor.current.id, hidden.at(-1).id);
  await h.callback('loadOlder')();
  assert.equal(cursors[1], hidden.at(-1).id, 'raw anchor ignored: ' + JSON.stringify(cursors));
  assert.equal(h.scope.messageHasOlder.current, false, 'accepted empty page exhausts');
});

test('C3 R4 an initial page superseding a fallback request keeps its newer coverage metadata', async () => {
  const { h, store } = owned(), gate = deferred(), started = deferred();
  store.update([row('base', 100)]); h.scope.messageCursor.current = null;
  h.scope.fetchOfficialPage = async (id, kind, cursor) => {
    if (kind === 'evidence') return [];
    if (cursor) { started.resolve(); return gate.promise; }
    return page('room', 100, 40);
  };
  const pending = h.callback('loadOlder')(); await started.promise;
  await h.callback('load')('initial');
  gate.resolve(page('room', 99, 10)); await pending;
  assert.equal(h.scope.messageOlderAnchor.current.id, 'room-61');
  assert.equal(h.scope.messageHasOlder.current, true);
});

test('C3 R4 recovery and older pagination retain independent coverage cursors', async () => {
  const { h, store } = owned(), gate = deferred(), started = deferred();
  store.update([row('base', 100)]); h.scope.messageCursor.current = row('base', 100);
  const newer = page('new', 140, 40).reverse();
  h.scope.fetchOfficialPage = async (id, kind, cursor, direction) => {
    if (kind === 'evidence') return [];
    if (direction === 'newer') return newer.filter(row => row.createdAt > cursor.createdAt);
    if (cursor) { started.resolve(); return gate.promise; }
    return [...newer].reverse();
  };
  const pending = h.callback('loadOlder')(); await started.promise;
  await h.callback('refreshThread')(); gate.resolve(page('old', 99, 40)); await pending;
  assert.equal(h.scope.messageCursor.current.id, 'new-140');
  assert.equal(h.scope.messageOlderAnchor.current.id, 'old-60');
  assert.equal(store.getSnapshot().length, 81);
  assert.equal(new Set(store.getSnapshot().map(row => row.id)).size, 81);
});

test('C3 R5 failed initial publication retains bounded coverage for recovery', async () => {
  const { h, store } = owned(); store.update([row('base', 0)]); h.scope.messageCursor.current = null;
  let server = page('room', 40, 40), reads = 0;
  h.scope.fetchOfficialPage = async (id, kind, cursor, direction) => {
    if (kind === 'evidence') return [];
    if (direction === 'newer') return server.filter(row => row.createdAt > cursor.createdAt).sort((a, b) => a.createdAt - b.createdAt).slice(0, 40);
    return server.slice(0, 40);
  };
  h.scope.fetchMessage = async id => { reads++; return server.find(row => row.id === id) ?? null; };
  const merge = store.reactions.merge;
  store.reactions.merge = (...args) => { merge(...args); throw Error('publication failure'); };
  await h.callback('load')('initial');
  assert.equal(h.scope.messageCursor.current, null);
  assert.equal(h.scope.initialCoverage.current.ids.length, 40);
  assert.equal(store.getSnapshot().length, 1);
  store.reactions.merge = merge; server = page('room', 90, 90);
  await h.callback('refreshThread')();
  assert.equal(reads, 40); assert.equal(h.scope.messageCursor.current.id, 'room-90');
  assert.equal(store.getSnapshot().length, 91);
});

test('C3 R5 failed older publication neither advances the anchor nor exhausts history', async () => {
  const { h, store } = owned(); store.update([row('base', 100)]);
  h.scope.messageOlderAnchor.current = row('base', 100);
  h.scope.fetchOfficialPage = async () => page('room', 99, 10);
  const merge = store.reactions.merge;
  store.reactions.merge = (...args) => { merge(...args); throw Error('older publication failure'); };
  await h.callback('loadOlder')();
  assert.equal(h.scope.messageOlderAnchor.current.id, 'base');
  assert.equal(h.scope.messageHasOlder.current, true);
  store.reactions.merge = merge; await h.callback('loadOlder')();
  assert.equal(h.scope.messageOlderAnchor.current.id, 'room-90');
  assert.equal(h.scope.messageHasOlder.current, false);
  assert.equal(store.getSnapshot().length, 11);
});

function orderedStore() {
  const { h, store } = owned(), updater = h.load('utils/transcriptOrdering.ts').createTranscriptUpdater;
  const read = count => updater(store.visibility.admit([message('m', 1, count)], store.visibility.epoch()),
    store.reactions.beginSnapshot(), store.reactions, store.visibility, () => true);
  store.update(read(0)); return { store, read };
}

test('C3 R5 outer error restores guard state and reports, rather than loses, queued work', () => {
  const { store, read } = orderedStore(), older = read(5), failed = read(7); let error, ran = false;
  try { store.update(current => {
    failed(current);
    store.update(state => { ran = true; return older(state); });
    throw Error('outer failure');
  }); } catch (caught) { error = caught; }
  assert.equal(ran, true, 'accepted queued work silently disappeared');
  assert.equal(store.getSnapshot()[0].reactions[0].count, 5, 'failed merge left an application fence');
  assert.equal(error?.name, 'AggregateError');
});

test('C3 R5 queued error rolls back metadata and later queued work still completes', () => {
  const { store, read } = orderedStore(), older = read(5), failed = read(7); let error;
  try { store.update(current => {
    store.update(state => { failed(state); throw Error('queued failure'); });
    store.update(older); return current;
  }); } catch (caught) { error = caught; }
  assert.equal(store.getSnapshot()[0].reactions[0].count, 5, 'failed queued merge corrupted the remaining queue');
  assert.equal(error?.name, 'AggregateError');
});

test('C3 R5 failed transition restores pending ownership and reaction-write tickets', () => {
  const { store } = orderedStore(), original = store.reactions.beginReactionWrite('m'); let abandoned;
  assert.throws(() => store.update(current => {
    abandoned = store.reactions.beginReactionWrite('m'); store.reactions.beginMutation('m');
    throw Error('ticket failure');
  }));
  assert.equal(original(), true, 'old ticket was invalidated by an aborted write');
  assert.equal(abandoned(), false, 'aborted ticket remained usable');
  assert.equal(store.reactions.protectedIds().length, 0, 'aborted mutation ownership remained');
});

test('C3 R5 failed visibility change restores admission and discards aborted batches', () => {
  const { store, read } = orderedStore(), older = read(5); let aborted;
  assert.throws(() => store.update(current => {
    store.visibility.mark(['m']);
    aborted = store.visibility.admit([message('aborted', 2)], store.visibility.epoch());
    throw Error('visibility failure');
  }));
  store.update(older);
  assert.equal(store.getSnapshot()[0].reactions[0].count, 5, 'failed removal invalidated an earlier admission');
  assert.equal(store.visibility.filterAccepted(aborted).length, 0, 'aborted admission remained usable');
});

test('C3 R5 throwing subscriber cannot suppress other listeners or queued writes', () => {
  const { store } = orderedStore(); let second = 0, queued = false, error;
  store.subscribe(() => { throw Error('subscriber failure'); });
  store.subscribe(() => { second++; if (!queued) { queued = true; store.update([message('m', 1, 9)]); } });
  try { store.update([message('m', 1, 7)]); } catch (caught) { error = caught; }
  assert.equal(store.getSnapshot()[0].reactions[0].count, 9, 'subscriber exception lost later work');
  assert.equal(second, 2); assert.equal(error?.name, 'AggregateError');
});

test('C3 R5 self-enqueueing subscriber is bounded and the store remains usable', () => {
  const script = `const {harness,row}=require('./scripts/arena-room-harness.cjs');
    const h=harness(),s=h.load('utils/arenaTranscriptStore.ts').createArenaTranscriptStore();
    let notifications=0,error;const stop=s.subscribe(()=>{notifications++;s.update(current=>[...current]);});
    try{s.update([row('m',1)]);}catch(e){error=e.name;}stop();s.update([]);
    console.log(JSON.stringify({notifications,error,remaining:s.getSnapshot().length}));`;
  const result = spawnSync(process.execPath, [], { input: script, encoding: 'utf8', timeout: 6000 });
  assert.equal(result.error?.code, undefined, 'unbounded synchronous drain: ' + result.error?.code);
  assert.equal(result.status, 0, result.stderr);
  const outcome = JSON.parse(result.stdout.trim());
  assert.equal(outcome.error, 'AggregateError');
  assert.ok(outcome.notifications > 0 && outcome.notifications <= 64);
  assert.equal(outcome.remaining, 0);
});

test('C3 R5 failed resets restore fences without recycling allocated tokens or epochs', () => {
  const { store, read } = orderedStore(), older = read(5);
  let abortedToken, abortedEpoch;
  assert.throws(() => store.update(current => {
    store.reactions.reset(); abortedToken = store.reactions.beginSnapshot();
    store.visibility.mark(Array.from({ length: 501 }, (_, i) => 'gone-' + i));
    store.visibility.reset(); abortedEpoch = store.visibility.epoch();
    throw Error('reset failure');
  }));
  assert.ok(store.reactions.beginSnapshot() > abortedToken);
  store.visibility.mark(['later']); assert.ok(store.visibility.epoch() > abortedEpoch);
  store.update(older);
  assert.equal(store.getSnapshot()[0].reactions[0].count, 5);
});

test('C3 R5 queued scope invalidation prevents stale insertion', () => {
  const { store } = orderedStore(); let active = true;
  const h = harness(), create = h.load('utils/transcriptOrdering.ts').createTranscriptUpdater;
  const stale = create(store.visibility.admit([message('stale', 2)], store.visibility.epoch()),
    store.reactions.beginSnapshot(), store.reactions, store.visibility, () => active);
  store.update(current => {
    store.update(stale); active = false; store.visibility.reset(); store.update([]); return current;
  });
  assert.equal(store.getSnapshot().length, 0);
});

test('C3 R1 evidence busy ownership cannot be released by an old room', async () => {
  const room = mountedRoom({ roomId: 'A' }), a = deferred(), b = deferred(), started = deferred();
  let first, second, requests = 0;
  room.services.submitEvidence = async input => { requests++; started.resolve(); return input.roomId === 'A' ? a.promise : b.promise; };
  try {
    await room.mount(); await React.act(async () => { first = room.committed.addEvidence({}); await started.promise; });
    await room.switchRoom('B');
    await React.act(async () => { second = room.committed.addEvidence({}); for (let i = 0; i < 12; i++) await Promise.resolve(); });
    assert.equal(requests, 2);
    await React.act(async () => { a.resolve({ id: 'A-evidence', createdAt: 1 }); await first; });
    await React.act(async () => assert.equal(await room.committed.addEvidence({}), false));
    assert.equal(requests, 2);
    await React.act(async () => { b.resolve({ id: 'B-evidence', createdAt: 1 }); await second; });
    assert.equal(room.committed.evidence.some(row => row.id === 'A-evidence'), false);
    assert.equal(room.committed.evidence.some(row => row.id === 'B-evidence'), true);
  } finally { a.resolve({ id: 'A-evidence' }); b.resolve({ id: 'B-evidence' }); await React.act(async () => { await Promise.all([first, second]); }); await room.unmount(); }
});
