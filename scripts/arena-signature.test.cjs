const test = require('node:test'), assert = require('node:assert/strict');
const { harness, text, deferred } = require('./ui-completion-harness.cjs');
const duel = (extra = {}) => ({ clashId: 'fictional-x1', status: 'open', viewerRelationship: 'fighter_a',
  fighterA: { id: 'a', name: 'Fictional fighter A with a long name', handle: 'fictional_a_long_handle' },
  fighterB: { id: 'b', name: 'Fictional fighter B with a long name', handle: 'fictional_b_long_handle' },
  sourceText: 'Full source Take. '.repeat(70), counterPosition: 'Full counter-position. '.repeat(70),
  mayJudge: false, hasJudged: false, verdict: null, ...extra });
const message = { id: 'official-a', roomId: 'room-x1', kind: 'text', body: 'Official argument',
  author: { id: 'a', name: 'Fictional A' }, createdAt: 1, reactions: [{ emoji: '🔥', count: 3, viewerReacted: true }] };
const button = (h, label) => h.nodes.find(n => n.props?.accessibilityLabel === label);
const leaf = name => ({ [name]: name });

test('full-position comparison opens/closes and preserves long source and counter text across presentation sizes', async () => {
  const d = duel(), h = harness('components/liveArena/DuelPositions.tsx', { duel: d }, e => e.DuelPositions,
    { dependencies: { ArenaSheet: leaf('ArenaSheet') } });
  try {
    await h.mount(); assert.equal(h.nodes.some(n => n.type === 'ArenaSheet'), false);
    await h.act(async () => button(h, 'Compare both full positions').props.onPress());
    for (const width of [320, 360, 430]) for (const fontScale of [1, 1.3]) for (const scheme of ['dark', 'light']) {
      Object.assign(h.dimensions, { width, fontScale }); Object.assign(h.colors, { scheme }); await h.update();
      assert.ok(text(h.tree).includes(d.sourceText)); assert.ok(text(h.tree).includes(d.counterPosition));
      for (const body of [d.sourceText, d.counterPosition, d.fighterA.name, d.fighterB.handle]) {
        const n = h.nodes.find(n => n.type === 'Text' && text(n).includes(body.trim()));
        assert.ok(n); assert.equal(n.props.numberOfLines, undefined);
      }
    }
    await h.update({ duel: duel({ counterPosition: '' }) });
    assert.match(text(h.tree), /Counter-position unavailable/);
    await h.act(async () => h.nodes.find(n => n.type === 'ArenaSheet').props.onClose());
    assert.equal(h.nodes.some(n => n.type === 'ArenaSheet'), false);
  } finally { await h.unmount(); }
});

test('argument reactions use existing callback and counts, with no spectator/pending/system mutation control', async () => {
  const calls = [], props = { message, canReact: true, onReact: (m, emoji) => calls.push([m.id, emoji]) };
  const h = harness('components/liveArena/DuelArgumentReactions.tsx', props, e => e.DuelArgumentReactions,
    { dependencies: { ArenaReactionPicker: leaf('ArenaReactionPicker') } });
  try {
    await h.mount(); assert.deepEqual(calls, []); assert.match(text(h.tree), /3/);
    await h.act(async () => button(h, 'React to the current official argument').props.onPress());
    const picker = h.nodes.find(n => n.type === 'ArenaReactionPicker');
    assert.deepEqual(picker.props.activeEmojis, ['🔥']);
    await h.act(async () => picker.props.onPick('🔥')); assert.deepEqual(calls, [['official-a', '🔥']]);
    assert.match(text(h.tree), /3/); // No local invented increment or success receipt.
    await h.update({ ...props, canReact: false });
    assert.equal(button(h, 'React to the current official argument'), undefined);
    assert.equal(h.nodes.some(n => n.type === 'ArenaReactionPicker'), false);
    for (const extra of [{ pending: true }, { kind: 'system' }]) {
      await h.update({ ...props, message: { ...message, ...extra } }); assert.equal(h.tree, null);
    }
  } finally { await h.unmount(); }
});

test('room production wiring restricts reactions, keeps assist scope, and removes terminal atmosphere', async () => {
  const leaves = Object.fromEntries(['ImmersiveClash', 'DuelEntrance', 'DuelRoomOutcome', 'ArgumentHistorySheet',
    'ClashMoreSheet', 'DuelDevPanel', 'PrivateAssistPanel', 'ArenaAtmosphere', 'ArenaSheet'].map(n => [n, leaf(n)]));
  const crowd = { context: null, messages: [], identityVersion: 1, refresh: async () => {} };
  const room = { roomId: 'room-x1', clashId: 'fictional-x1', roomMode: 'DUEL', phase: 'open',
    status: 'OPEN', topic: { title: 'Fallback topic' }, viewer: { role: 'debater' }, duel: duel() };
  const props = { room, messages: [message], evidence: [], paddingTop: 24, paddingBottom: 24,
    loading: false, error: null, threadLocked: false, composer: 'Fighter composer', onReact() {}, onJudge: async () => {}, onRefresh: async () => {} };
  const h = harness('components/liveArena/DuelRoomExperience.tsx', props, e => e.DuelRoomExperience, { dependencies: {
    ...leaves, useArenaCrowd: { useArenaCrowd: () => crowd }, useDuelReactionBurst: { useDuelReactionBurst: () => null },
    'react-native': { ...Object.fromEntries(['View', 'Text', 'Pressable', 'KeyboardAvoidingView'].map(n => [n, n])),
      Platform: { OS: 'android', select: options => options.android ?? options.default }, StyleSheet: { create: x => x }, useWindowDimensions: () => ({ width: 360, fontScale: 1 }),
      Keyboard: { addListener: () => ({ remove() {} }) } },
  } });
  h.services.fetchClashFollowState = async () => false;
  try {
    await h.mount(); const stage = () => h.nodes.find(n => n.type === 'ImmersiveClash');
    assert.equal(stage().props.canReact, true); assert.equal(stage().props.onReact, props.onReact);
    for (const role of ['spectator', 'staff']) {
      await h.update({ ...props, room: { ...room, duel: duel({ viewerRelationship: role }) } });
      assert.equal(stage().props.canReact, false);
    }
    await h.update({ ...props, room: { ...room, phase: 'closed', duel: duel({ status: 'settled' }) } });
    assert.equal(stage().props.canReact, false);
    assert.equal(h.nodes.some(n => n.type === 'ArenaAtmosphere'), false);
    assert.equal(h.nodes.find(n => n.type === 'DuelEntrance').props.phase, 'closed');
    await h.update({ ...props, loading: true, messages: [] });
    assert.equal(h.nodes.some(n => n.type === 'DuelEntrance'), false, 'Loading cannot claim the intro');
  } finally { await h.unmount(); }
});

test('entry uses authoritative phase, skips once and does not replay on remount or sheet rerenders', async () => {
  const timers = new Map(); let serial = 0, finished = 0;
  const props = { duel: duel({ status: 'settled' }), phase: 'closed', proposition: 'Fictional source Take', active: true,
    momentKey: 'fictional-entry-x1', onDone: () => finished++ };
  const options = { dependencies: { Avatar: leaf('Avatar') },
    setTimeout: (fn, ms) => { timers.set(++serial, { fn, ms }); return serial; }, clearTimeout: id => timers.delete(id) };
  const h = harness('components/liveArena/DuelEntrance.tsx', props, e => e.DuelEntrance, options);
  let registry;
  try {
    await h.mount(); registry = h.load('utils/motionOnce.ts');
    assert.match(text(h.tree), /OFFICIAL RESULT/); assert.doesNotMatch(text(h.tree), /LIVE DUEL/);
    assert.equal(timers.size, 1); assert.equal([...timers.values()][0].ms, 120);
    await h.update(); assert.equal(timers.size, 1);
    await h.act(async () => button(h, 'Skip Clash intro').props.onPress());
    await h.act(async () => { for (const { fn } of timers.values()) fn(); }); assert.equal(finished, 1);
    await h.update({ ...props, active: false }); assert.equal(h.tree, null);
  } finally { await h.unmount(); }
  assert.equal(timers.size, 0);
  const again = harness('components/liveArena/DuelEntrance.tsx', props, e => e.DuelEntrance,
    { ...options, dependencies: { ...options.dependencies, motionOnce: registry } });
  try { await again.mount(); assert.equal(again.tree, null); } finally { await again.unmount(); }
  const entrances = [];
  const normal = harness('components/liveArena/DuelEntrance.tsx', { ...props,
    duel: duel(), phase: 'final_arguments', momentKey: 'fictional-entry-normal-x1' }, e => e.DuelEntrance,
    { ...options, dependencies: { ...options.dependencies, 'react-native-reanimated': {
      __esModule: true, default: { View: 'View' }, useReducedMotion: () => false,
      FadeInDown: { duration: ms => { entrances.push(ms); return {}; } },
    } } });
  try {
    await normal.mount(); assert.match(text(normal.tree), /FINAL ARGUMENTS/);
    assert.equal([...timers.values()][0].ms, 620);
    assert.ok(entrances.includes(180) && entrances.includes(240));
    await normal.act(async () => { for (const { fn } of timers.values()) fn(); });
    assert.equal(finished, 2);
  } finally { await normal.unmount(); }
  assert.equal(timers.size, 0);
});

test('Crowd error/loading/quiet/read-only states are honest and never invent activity', async () => {
  const crowd = { context: null, messages: [], loading: false, error: 'Fictional offline failure', refresh: async () => {} };
  const h = harness('components/liveArena/LiveCrowdLayer.tsx', { crowd }, e => e.LiveCrowdLayer);
  try {
    await h.mount(); const list = () => h.nodes.find(n => n.type === 'FlatList');
    assert.equal(list().props.ListEmptyComponent, null);
    crowd.error = null; crowd.loading = true; await h.update();
    assert.match(text(list().props.ListEmptyComponent), /Finding the Crowd/); assert.doesNotMatch(text(list().props.ListEmptyComponent), /floor is yours/);
    crowd.loading = false; crowd.context = { roomId: 'room-x1', canSend: false }; await h.update();
    assert.match(text(list().props.ListEmptyComponent), /A quiet Crowd/); assert.doesNotMatch(text(list().props.ListEmptyComponent), /Be the first/);
    assert.equal(h.nodes.some(n => n.type === 'TextInput'), false);
    await h.update({ crowd, readOnly: true });
    assert.match(text(list().props.ListEmptyComponent), /conversation is preserved/);
  } finally { await h.unmount(); }
});

test('settled but unavailable result is not called pending settlement', async () => {
  const h = harness('components/liveArena/DuelRoomOutcome.tsx', { duel: duel({ status: 'settled' }), phase: 'closed', onJudge: async () => {} }, e => e.DuelRoomOutcome);
  try { await h.mount(); assert.match(text(h.tree), /Official result unavailable/); assert.doesNotMatch(text(h.tree), /Settlement pending/); }
  finally { await h.unmount(); }
});

test('judging confirms one real callback, exposes failure and never lets a fighter cast a ballot', async () => {
  const response = deferred(); let calls = 0;
  const props = { duel: duel({ viewerRelationship: 'spectator', mayJudge: true }), phase: 'judging',
    onJudge: () => { calls++; return response.promise; } };
  const options = { dependencies: { haptics: { judge() {} } } };
  const h = harness('components/liveArena/DuelRoomOutcome.tsx', props, e => e.DuelRoomOutcome, options);
  const choices = () => h.nodes.filter(n => n.props?.accessibilityLabel?.startsWith('Judge '));
  try {
    await h.mount(); assert.equal(choices().length, 2);
    const vote = choices()[0].props.onPress;
    await h.act(async () => { vote(); vote(); }); assert.equal(calls, 1);
    assert.ok(choices().every(n => n.props.disabled));
    await h.act(async () => response.reject(Error('Fictional network failure')));
    assert.match(text(h.tree), /could not be confirmed/); assert.doesNotMatch(text(h.tree), /Your ballot is recorded/);
    await h.update({ ...props, onJudge: async () => { calls++; } });
    await h.act(async () => choices()[0].props.onPress());
    assert.equal(calls, 2); assert.match(text(h.tree), /Your ballot is recorded/);
    assert.equal(choices().length, 0);
  } finally { await h.unmount(); }
  for (const viewerRelationship of ['fighter_a', 'fighter_b', 'staff']) {
    const denied = harness('components/liveArena/DuelRoomOutcome.tsx', { ...props, duel: duel({ viewerRelationship, mayJudge: false }) }, e => e.DuelRoomOutcome, options);
    try { await denied.mount(); assert.equal(denied.nodes.some(n => n.props?.accessibilityLabel?.startsWith('Judge ')), false); }
    finally { await denied.unmount(); }
  }
});
