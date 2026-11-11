const test = require('node:test'), assert = require('node:assert/strict');
const { harness, React, deferred, text } = require('./ui-completion-harness.cjs');
const { mountedRoom } = require('./arena-mounted-room.cjs');
class ServerError extends Error { constructor(code) { super(code); this.code = code; } }
const supabase = { SupabaseError: ServerError, currentUserId: async () => 'account-a' };
const button = (h, label) => h.nodes.find(n => n.props?.accessibilityLabel === label);

test('Clash-specific ledger filters before the cap and detects truncated or unavailable counts', async () => {
  const ledger = Array.from({ length: 125 }, (_, i) => ({ id: String(i), profile_id: 'profile-a',
    clash_id: i === 0 ? 'old-clash' : 'new-clash', reputation_delta: i === 0 ? 15 : 1,
    coins_delta: 0, created_at: new Date().toISOString(), kind: 'jury' }));
  let countOverride, queried;
  const client = { from(table) { assert.equal(table, 'reputation_events'); const filters = []; let options, cap;
    const query = { select(_columns, opts) { options = opts; return query; },
      eq(key, value) { filters.push([key, value]); return query; }, order() { return query; },
      async limit(n) { cap = n; queried = filters; const rows = ledger.filter(row => filters.every(([k, v]) => row[k] === v));
        assert.equal(options.count, 'exact'); return { data: rows.slice(0, cap), error: null,
          count: countOverride === undefined ? rows.length : countOverride }; } }; return query; } };
  const h = harness('services/clashEngineService.ts', {}, () => () => null, { dependencies: {
    supabaseClient: { requireSupabase: () => client, requestError: e => e, SupabaseError: ServerError }, apiService: {},
  } });
  const api = h.load('services/clashEngineService.ts');
  const old = await api.fetchClashReputationEvents('profile-a', 'old-clash');
  assert.equal(old.complete, true); assert.equal(old.events[0].reputationDelta, 15);
  assert.deepEqual(queried, [['profile_id', 'profile-a'], ['clash_id', 'old-clash']]);
  assert.equal((await api.fetchClashReputationEvents('profile-a', 'new-clash')).complete, false);
  countOverride = null; assert.equal((await api.fetchClashReputationEvents('profile-a', 'old-clash')).complete, false);
});

test('mounted personal result displays verified rewards, never zero for an incomplete read, and ignores stale accounts', async () => {
  const h = harness('components/liveArena/DuelPersonalResult.tsx', { clashId: 'old-clash' });
  h.services.currentUserId = async () => h.auth.user?.id;
  h.services.currentViewerProfileId = async () => 'profile-a';
  h.services.fetchClashView = async () => ({ clashId: 'old-clash', status: 'settled', myBallot: 'B' });
  h.services.fetchClashReputationEvents = async () => ({ complete: false, events: [] });
  try {
    await h.mount(); assert.match(text(h.tree), /could not be verified/); assert.doesNotMatch(text(h.tree), /Reputation: 0/);
    h.services.fetchClashReputationEvents = async () => ({ complete: true, events: [{ profileId: 'profile-a', clashId: 'old-clash', reputationDelta: 15, coinsDelta: 3 }] });
    await h.act(async () => button(h, 'Retry your recorded result').props.onPress());
    assert.match(text(h.tree), /Reputation: \+15/); assert.match(text(h.tree), /Side B/);
    const late = deferred(); h.services.fetchClashReputationEvents = () => late.promise;
    await h.update({ clashId: 'other' }); h.auth = { user: null }; await h.update();
    await h.act(async () => late.resolve({ complete: true, events: [] })); assert.equal(h.tree, null);
  } finally { await h.unmount(); }
});

function ballotHarness() {
  const h = harness('components/liveArena/useDuelBallot.ts', { clashId: 'clash', write: async () => {} },
    e => props => React.createElement('State', e.useDuelBallot(props.clashId, props.write)),
    { dependencies: { supabaseClient: supabase } });
  h.services.fetchClashView = async () => ({ clashId: 'clash', myBallot: null });
  return h;
}
test('ambiguous ballot confirms the authoritative retained side without replaying the write', async () => {
  const h = ballotHarness(); let writes = 0;
  h.services.fetchClashView = async () => ({ clashId: 'clash', myBallot: 'B' });
  try { await h.update({ clashId: 'clash', write: async () => { writes++; throw Error('timeout'); } });
    const submit = h.tree.props.submit; await h.act(async () => { await Promise.all([submit('A'), submit('A')]); });
    assert.equal(writes, 1); assert.equal(h.tree.props.status, 'confirmed'); assert.equal(h.tree.props.side, 'B');
  } finally { await h.unmount(); }
});
test('unknown ballot stays locked after a null or failed authoritative read; verification is read-only', async () => {
  const h = ballotHarness(); let writes = 0, reads = 0;
  h.services.fetchClashView = async () => { reads++; return { clashId: 'clash', myBallot: null }; };
  try { await h.update({ clashId: 'clash', write: async () => { writes++; throw Error('lost response'); } });
    await h.act(async () => h.tree.props.submit('A')); assert.equal(h.tree.props.status, 'unknown'); assert.equal(h.tree.props.locked, true);
    await h.act(async () => h.tree.props.submit('B')); assert.equal(writes, 1);
    h.services.fetchClashView = async () => { reads++; throw Error('offline'); };
    await h.act(async () => h.tree.props.reconcile()); assert.equal(h.tree.props.status, 'unknown');
    h.services.fetchClashView = async () => { reads++; return { clashId: 'clash', myBallot: 'A' }; };
    await h.act(async () => h.tree.props.reconcile()); assert.equal(h.tree.props.side, 'A'); assert.equal(writes, 1); assert.equal(reads, 3);
  } finally { await h.unmount(); }
});
test('definitive SQL rejection plus absent ballot allows deliberate retry; unknown codes do not', async () => {
  for (const code of ['P0004', 'unexpected']) {
    const h = ballotHarness(); let writes = 0;
    try { await h.update({ clashId: 'clash', write: async () => { writes++; throw new ServerError(code); } });
      await h.act(async () => h.tree.props.submit('A'));
      assert.equal(h.tree.props.status, code === 'P0004' ? 'rejected' : 'unknown');
      await h.act(async () => h.tree.props.submit('B')); assert.equal(writes, code === 'P0004' ? 2 : 1);
    } finally { await h.unmount(); }
  }
});
test('Auth read failure during ballot verification remains unknown, unlocked only for another read', async () => {
  const h = ballotHarness(), original = supabase.currentUserId; let writes = 0;
  try { await h.update({ clashId: 'clash', write: async () => { writes++; throw Error('timeout'); } });
    await h.act(async () => h.tree.props.submit('A'));
    supabase.currentUserId = async () => { throw Error('Auth unavailable'); };
    await h.act(async () => h.tree.props.reconcile());
    assert.equal(h.tree.props.status, 'unknown'); assert.equal(h.tree.props.busy, false);
    assert.equal(h.tree.props.locked, true); assert.equal(writes, 1);
  } finally { supabase.currentUserId = original; await h.unmount(); }
});
test('ballot duplicate callbacks, remount and A-B-A stale closures cannot reopen an unresolved intent', async () => {
  const h = ballotHarness(); let writes = 0; const pending = deferred();
  try { await h.update({ clashId: 'clash', write: async () => { writes++; await pending.promise; } });
    const stale = h.tree.props.submit; await h.act(async () => { void stale('A'); void stale('A'); });
    h.auth = { user: { id: 'account-b' } }; await h.update(); h.auth = { user: { id: 'account-a' } }; await h.update();
    await h.act(async () => { await stale('B'); pending.resolve(); });
    assert.equal(writes, 1); assert.equal(h.tree.props.status, 'unknown'); assert.equal(h.tree.props.locked, true);
    const original = h.load('components/liveArena/useDuelBallot.ts'); await h.unmount();
    const remount = harness('components/liveArena/useDuelBallot.ts', { clashId: 'clash', write: async () => { writes++; } },
      () => props => React.createElement('State', original.useDuelBallot(props.clashId, props.write)));
    try { await remount.mount(); assert.equal(remount.tree.props.locked, true);
      await remount.act(async () => remount.tree.props.submit('B')); assert.equal(writes, 1);
    } finally { await remount.unmount(); }
  } finally { await h.unmount(); }
});

test('mounted outcome disables an unknown ballot, verifies without another write and displays the recorded side', async () => {
  let writes = 0;
  const fade = { duration() { return this; }, delay() { return this; }, springify() { return this; }, damping() { return this; } };
  const duel = { clashId: 'clash', status: 'open', mayJudge: true, hasJudged: false,
    viewerRelationship: 'spectator', fighterA: { name: 'Fictional A' }, fighterB: { name: 'Fictional B' }, verdict: null };
  const h = harness('components/liveArena/DuelRoomOutcome.tsx', { duel, phase: 'judging', onJudge: async () => { writes++; throw Error('timeout'); } }, undefined,
    { dependencies: { supabaseClient: supabase, haptics: { judge() {} }, VerdictReveal: { VerdictReveal: 'Verdict' },
      NextClashAction: { NextClashAction: 'Next' },
      'react-native-reanimated': { __esModule: true, default: { Text: 'Text', View: 'View' }, FadeInDown: fade, useReducedMotion: () => true } } });
  h.services.fetchClashView = async () => ({ clashId: 'clash', myBallot: null });
  try { await h.mount(); await h.act(async () => h.nodes.find(n => n.props?.accessibilityLabel?.startsWith('Judge Fictional A')).props.onPress());
    assert.match(text(h.tree), /outcome is unknown/);
    assert.ok(h.nodes.filter(n => n.props?.accessibilityLabel?.startsWith('Judge ')).every(n => n.props.disabled));
    h.services.fetchClashView = async () => ({ clashId: 'clash', myBallot: 'B' });
    await h.act(async () => button(h, 'Verify recorded ballot').props.onPress());
    assert.match(text(h.tree), /Your recorded ballot: Side\s+B/); assert.equal(writes, 1);
    const readOnly = async () => {};
    await h.update({ duel: { ...duel, status: 'settled' }, phase: 'closed', onJudge: async () => assert.fail('Unexpected vote'), onRefreshResult: readOnly });
    assert.match(text(h.tree), /Official result unavailable/);
    assert.equal(h.nodes.find(n => n.type?.name === 'ResultRefresh').props.onRefresh, readOnly);
  } finally { await h.unmount(); }
});

test('read-only Refresh reserves synchronously, disables repeat taps and honestly recovers from errors', async () => {
  let reads = 0; const pending = deferred();
  const h = harness('components/liveArena/ResultRefresh.tsx', { onRefresh: async () => { reads++; await pending.promise; } });
  try { await h.mount(); const press = button(h, 'Refresh official result').props.onPress;
    await h.act(async () => { press(); press(); }); assert.equal(reads, 1); assert.equal(button(h, 'Refresh official result').props.disabled, true);
    await h.act(async () => pending.reject(Error('offline'))); assert.match(text(h.tree), /could not be refreshed/);
    await h.update({ onRefresh: async () => { reads++; } });
    await h.act(async () => button(h, 'Refresh official result').props.onPress());
    assert.equal(reads, 2); assert.doesNotMatch(text(h.tree), /could not be refreshed/);
  } finally { await h.unmount(); }
});
test('production Room result refresh calls only fetchRoom, keeps in-flight protection and propagates read failures', async () => {
  const h = mountedRoom(); let reads = 0; const pending = deferred();
  try { await h.mount(); h.services.fetchRoom = async () => { reads++; return pending.promise; };
    h.services.fetchOfficialPage = h.services.fetchEvidence = h.services.fetchMindshiftStats = async () => assert.fail('Result refresh must only read the Room');
    let request; await React.act(async () => { request = h.committed.refreshResult(); await h.committed.refreshResult(); });
    assert.equal(reads, 1); await React.act(async () => { pending.resolve({ roomId: 'room', phase: 'closed' }); await request; });
    assert.equal(h.committed.room.phase, 'closed');
    h.services.fetchRoom = async () => { throw Error('read failed'); };
    await React.act(async () => assert.rejects(h.committed.refreshResult(), /read failed/));
  } finally { await h.unmount(); }
});

const room = phase => ({ phase, duel: { status: 'open' }, closesAt: 400000,
  topic: { finalArgumentsAt: 200000, judgingAt: 300000 }, secondsToFinalArguments: 60,
  secondsToJudging: 30, secondsRemaining: 10 });
test('real Room service attaches only validated server timing, never parser defaults for missing deadlines', async () => {
  let payload = { roomId: 'room', topicId: 'topic', roomMode: 'GROUP', status: 'OPEN', phase: 'open',
    closesAt: new Date(400000).toISOString(), secondsToFinalArguments: 60,
    topic: { finalArgumentsAt: new Date(200000).toISOString(), judgingAt: new Date(300000).toISOString(), closesAt: new Date(400000).toISOString() } };
  const h = harness('services/liveArenaService.ts', {}, () => () => null, { dependencies: {
    mediaService: {}, supabaseClient: { ...supabase, requireSupabase: () => ({ rpc: async name => {
      assert.equal(name, 'get_arena_room'); return { data: payload, error: null };
    } }) },
  } });
  const service = h.load('services/liveArenaService.ts');
  assert.equal((await service.fetchRoom('room')).timing.deadline, 200000);
  payload = { ...payload, topic: { closesAt: new Date(400000).toISOString() } }; assert.equal((await service.fetchRoom('room')).timing, undefined);
  payload = { ...payload, topic: { finalArgumentsAt: new Date(200000).toISOString() }, secondsToFinalArguments: undefined };
  assert.equal((await service.fetchRoom('room')).timing, undefined);
});
test('server-derived clock covers phase boundaries, uncertainty, missing timing and never changes phase', () => {
  const h = harness('utils/arenaPhaseClock.ts', {}, () => () => null), api = h.load('utils/arenaPhaseClock.ts');
  for (const phase of ['open', 'final_arguments', 'judging']) {
    const input = room(phase), clock = api.phaseClock(input, 1000, 200);
    assert.match(api.phaseTimeLabel(clock, 1000), /in about/);
    assert.match(api.phaseTimeLabel(clock, 100000), /awaiting server confirmation/);
    assert.match(api.phaseTimeLabel(clock, 1000, true), /unavailable/);
    assert.match(api.phaseTimeLabel(clock, 0), /unavailable/); assert.equal(input.phase, phase);
  }
  assert.equal(api.phaseClock(room('scheduled'), 0, 0), undefined);
  assert.equal(api.phaseClock(room('open'), 0, 10001), undefined);
  assert.match(api.phaseTimeLabel(undefined, 0), /unavailable/);
});
test('mounted countdown invalidates background timing, reanchors on fresh server data, preserves text scaling and cleans up timers/listeners', async context => {
  let listener, removed = 0, timers = 0, cleared = 0;
  context.mock.method(global, 'setInterval', () => ++timers);
  context.mock.method(global, 'clearInterval', () => { cleared++; });
  const h = harness('components/liveArena/DuelPhaseCountdown.tsx', {}, undefined, { dependencies: {
    'react-native': { View: 'View', Text: 'Text', AppState: { addEventListener: (_event, fn) => { listener = fn; return { remove() { removed++; } }; } } },
  } });
  const api = h.load('utils/arenaPhaseClock.ts'), input = room('judging'); input.timing = api.phaseClock(input, performance.now(), 10);
  try { await h.update({ room: input }); assert.match(text(h.tree), /Voting closes in about/);
    assert.ok(h.nodes.filter(n => n.type === 'Text').every(n => n.props.allowFontScaling !== false));
    await h.act(async () => listener('background')); await h.act(async () => listener('active')); assert.match(text(h.tree), /unavailable/);
    const fresh = { ...input, timing: api.phaseClock(input, performance.now(), 10) };
    await h.update({ room: fresh }); assert.match(text(h.tree), /Voting closes in about/);
    h.motion.reduced = false; h.dimensions.fontScale = 1.3; await h.update({ room: fresh }); assert.match(text(h.tree), /Voting closes in about/);
    await h.update({ room: { ...input, phase: 'closed' } }); assert.equal(h.tree, null); assert.equal(cleared, timers);
  } finally { await h.unmount(); } assert.ok(removed >= 1); assert.equal(cleared, timers);
});
