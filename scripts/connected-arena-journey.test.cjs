const test = require('node:test'), assert = require('node:assert/strict');
const { harness, deferred, text, React } = require('./ui-completion-harness.cjs');
const file = 'components/arena/TakeArenaJourney.tsx';
const view = (overrides = {}) => ({ takeId: 'take-a', clashId: 'clash-a', roomId: 'room-a', battleMode: 'DUEL',
  status: 'open', opensAt: 100, closesAt: 20000, isParticipant: false, verdict: null, ...overrides });
function setup() {
  let focused = true, now = 10000;
  const h = harness(file, { takeId: 'take-a' }, e => e.TakeArenaJourney, { dependencies: {
    'expo-router': { useRouter: () => h.router, useFocusEffect: fn => React.useEffect(() => focused ? fn() : undefined, [fn, focused]) },
    useRequireAuth: { useRequireAuth: () => () => {
      if (h.auth.signedIn) return true; h.calls.push(['push', '/auth']); return false;
    } },
    useClock: { useClock: () => now },
    supabaseClient: { isSupabaseConfigured: true },
  } });
  let reads = 0;
  h.services.fetchClashViewForTake = async id => { reads++; assert.equal(id, 'take-a'); return view(); };
  return { h, get reads() { return reads; }, focus: value => { focused = value; }, clock: value => { now = value; } };
}
const button = (h, label) => h.nodes.find(n => n.props?.accessibilityLabel === label && n.props?.onPress);
const press = (h, label) => h.act(async () => { assert.ok(button(h, label), label); button(h, label).props.onPress(); });

test('loading, failed, successful-empty and retry are independent, without admitting or inventing a Room', async () => {
  const r = setup(), h = r.h, pending = deferred(); h.services.fetchClashViewForTake = () => pending.promise;
  try {
    await h.mount(); assert.match(text(h.tree), /Checking this Take/); assert.doesNotMatch(text(h.tree), /No linked Clash/);
    await h.act(async () => pending.reject(Error('network')));
    assert.match(text(h.tree), /availability is unverified/); assert.doesNotMatch(text(h.tree), /No linked Clash/);
    h.services.fetchClashViewForTake = async () => null; await press(h, 'Retry related Arena');
    assert.match(text(h.tree), /No linked Clash is available to you/); assert.equal(button(h, 'Open Arena Room'), undefined);
    await press(h, 'Discover Arena'); assert.deepEqual(h.calls, [['push', '/arena/topics']]);
  } finally { await h.unmount(); }
});

test('canonical link uses the returned Room, never the Take/Clash ID; fighter/spectator/guest capability copy stays honest', async () => {
  for (const role of ['fighter', 'spectator', 'guest']) {
    const { h } = setup(); h.services.fetchClashViewForTake = async () => view({ isParticipant: role === 'fighter' });
    if (role === 'guest') h.auth = { user: null, signedIn: false, loading: false };
    try {
      await h.mount(); assert.match(text(h.tree), role === 'fighter' ? /You are a fighter/ : role === 'guest' ? /Sign in/ : /permissions and phase/);
      await press(h, 'Open Arena Room'); assert.deepEqual(h.calls, [['push', role === 'guest' ? '/auth' : '/arena/room/room-a']]);
    } finally { await h.unmount(); }
  }
});

test('scheduled, live, overdue, settled, redacted-result and cancelled statuses never infer settlement or permissions', async () => {
  for (const [change, expected] of [
    [{ opensAt: 20000 }, 'Scheduled'], [{}, 'In progress'], [{ closesAt: 5000 }, 'Awaiting settlement'],
    [{ status: 'settled', verdict: { winnerSide: 'A' } }, 'Settled · community result'],
    [{ status: 'settled' }, 'Settled · result unavailable'], [{ status: 'cancelled' }, 'Cancelled'],
  ]) {
    const { h } = setup(); h.services.fetchClashViewForTake = async () => view(change);
    try { await h.mount(); assert.ok(text(h.tree).includes(expected)); assert.deepEqual(h.calls, []);
      if (change.status) await press(h, 'Review Arena Room');
    } finally { await h.unmount(); }
  }
});

test('legacy open never enters the auto-settling route; terminal history and mismatched IDs are handled explicitly', async () => {
  for (const status of ['open', 'settled', 'cancelled']) {
    const { h } = setup(); h.services.fetchClashViewForTake = async () => view({ status, battleMode: 'LEGACY', roomId: null });
    try { await h.mount(); if (status === 'open') {
      assert.equal(button(h, 'View Clash history'), undefined); assert.match(text(h.tree), /no settlement is requested/);
    } else { await press(h, 'View Clash history'); assert.deepEqual(h.calls, [['push', '/clash/take-a']]); }
    } finally { await h.unmount(); }
  }
  const { h } = setup(); h.services.fetchClashViewForTake = async () => view({ takeId: 'foreign-take' });
  try { await h.mount(); assert.match(text(h.tree), /availability is unverified/); assert.equal(button(h, 'Open Arena Room'), undefined); }
  finally { await h.unmount(); }
});

test('account switch, blur, unmount and refocus fence delayed relationship reads and never issue a mutation', async () => {
  const r = setup(), h = r.h, old = deferred(); h.services.fetchClashViewForTake = () => old.promise;
  try {
    await h.mount(); h.auth = { user: { id: 'account-b' }, signedIn: true, loading: false };
    h.services.fetchClashViewForTake = async () => null; await h.update();
    await h.act(async () => old.resolve(view())); assert.match(text(h.tree), /No linked Clash/);
    const late = deferred(); h.services.fetchClashViewForTake = () => late.promise;
    r.focus(false); await h.update(); r.focus(true); await h.update(); r.focus(false); await h.update();
    await h.act(async () => late.resolve(view())); assert.equal(button(h, 'Open Arena Room'), undefined);
    h.services.fetchClashViewForTake = async () => view(); r.focus(true); await h.update(); assert.ok(button(h, 'Open Arena Room'));
    assert.deepEqual(h.calls, []);
  } finally { await h.unmount(); }
  const late = deferred(), next = setup(); next.h.services.fetchClashViewForTake = () => late.promise;
  await next.h.mount(); await next.h.unmount(); await next.h.act(async () => late.resolve(view())); assert.deepEqual(next.h.calls, []);
});

test('auth hydration waits; theme/font updates preserve context and accessible controls without another read', async () => {
  const r = setup(), h = r.h; h.auth = { ...h.auth, loading: true };
  try {
    await h.mount(); assert.equal(r.reads, 0); h.auth = { ...h.auth, loading: false }; await h.update(); assert.equal(r.reads, 1);
    for (const width of [320, 360, 430]) for (const scheme of ['light', 'dark']) {
      Object.assign(h.dimensions, { width, fontScale: 1.3 }); h.colors.scheme = scheme; await h.update();
      for (const n of h.nodes.filter(n => n.type === 'Pressable')) { assert.ok(n.props.style[0].minHeight >= 44); assert.equal(n.props.accessibilityRole, 'button'); }
      for (const n of h.nodes.filter(n => n.type === 'Text')) { assert.notEqual(n.props.allowFontScaling, false); assert.equal(n.props.numberOfLines, undefined); }
    }
    r.clock(30000); await h.update(); assert.match(text(h.tree), /Awaiting settlement/); assert.equal(r.reads, 1);
  } finally { await h.unmount(); }
});

test('actual shared action row omits duplicate Duels only when the detail supplies no callback; feed launch remains', async () => {
  const h = harness('components/arena/TakeActionRow.tsx', { reactions: 0, commentCount: 0, isSaved: false, hasReacted: false,
    onReact() {}, onComment() {}, onShare() {}, onSave() {}, prominence: 'conversation' }, e => e.TakeActionRow,
  { dependencies: { arena: { arena: { type: {} }, arenaColors: () => ({}) } } });
  try {
    await h.mount(); assert.equal(button(h, 'View Clash history'), undefined);
    let calls = 0; await h.update({ onClash: () => calls++ }); await press(h, 'Clash on this take'); assert.equal(calls, 1);
  } finally { await h.unmount(); }
});
