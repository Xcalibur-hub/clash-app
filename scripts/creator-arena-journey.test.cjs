const test = require('node:test'), assert = require('node:assert/strict');
const { harness, deferred, React, text } = require('./ui-completion-harness.cjs');
const invitation = (change = {}) => ({ id: 'challenge-a', takeId: 'take-a', status: 'PENDING',
  createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
  challenger: { name: 'Fictional B', handle: 'b' }, recipient: { name: 'Fictional A', handle: 'a' },
  source: { title: 'Source Take' }, counterPosition: 'Counterposition', ...change });
function setup(rows = [invitation()]) {
  let focused = true, resolveCalls = [], reads = 0;
  const h = harness('components/arena/ChallengeInbox.tsx', {}, e => e.ChallengeInbox, { dependencies: {
    'expo-router': { useRouter: () => h.router, useFocusEffect: fn => React.useEffect(() => focused ? fn() : undefined, [fn, focused]) },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', FlatList: 'FlatList',
      StyleSheet: { create: s => s, hairlineWidth: 1 }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
      Alert: { alert: (_title, _body, buttons) => { h.confirm = buttons.at(-1).onPress; } } },
  } });
  h.services.fetchChallengeInbox = async () => { reads++; return { items: rows, hasMore: false }; };
  h.services.resolveArenaChallenge = async (...args) => { resolveCalls.push(args); return invitation({ status: 'ACCEPTED', roomId: 'server-room' }); };
  const cardNodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(cardNodes)];
  const nodes = () => [...cardNodes(h.tree.props.ListHeaderComponent), ...h.tree.props.data.flatMap(row => cardNodes(h.tree.props.renderItem({ item: row })))];
  const button = label => nodes().find(n => n.props?.accessibilityLabel === label && n.props.onPress);
  const press = label => h.act(async () => { const n = button(label); assert.ok(n, label); assert.ok(!n.props.disabled); n.props.onPress(); });
  return { h, button, press, get reads() { return reads; }, get calls() { return resolveCalls; }, focus: v => { focused = v; } };
}

test('confirmed acceptance pushes only the server Room once and preserves the Inbox stack', async () => {
  const r = setup(), pending = deferred(); r.h.services.resolveArenaChallenge = async (...args) => { r.calls.push(args); return pending.promise; };
  try { await r.h.mount(); const callback = r.button('Accept this challenge').props.onPress;
    await r.h.act(async () => { callback(); callback(); }); assert.equal(r.calls.length, 1);
    assert.deepEqual(r.calls[0], ['challenge-a', 'ACCEPT', 'account-a']);
    await r.h.act(async () => pending.resolve(invitation({ status: 'ACCEPTED', roomId: 'server-room' })));
    assert.deepEqual(r.h.calls, [['push', '/arena/room/server-room']]);
  } finally { await r.h.unmount(); }
});

test('pending, terminal and accepted invitations expose only appropriate actions, never inferred live/settled state', async () => {
  for (const status of ['PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED', 'PASSED']) {
    const r = setup([invitation({ status, clashId: 'clash-a', roomId: 'server-room' })]);
    try { await r.h.mount(); assert.equal(!!r.button('Accept this challenge'), status === 'PENDING');
      assert.equal(!!r.button('Open Room'), status === 'ACCEPTED');
      if (status === 'ACCEPTED') { await r.press('Open Room'); assert.deepEqual(r.h.calls, [['push', '/arena/room/server-room']]); }
      assert.equal(r.calls.length, 0);
    } finally { await r.h.unmount(); }
  }
  const r = setup([invitation({ expiresAt: new Date(0).toISOString() })]);
  try { await r.h.mount(); assert.equal(r.button('Accept this challenge'), undefined); }
  finally { await r.h.unmount(); }
});

test('failed reads retry; server expiry or accepted-without-Room never navigates or fabricates success', async () => {
  const r = setup(); r.h.services.fetchChallengeInbox = async () => { throw Error('network'); };
  try { await r.h.mount(); assert.equal(r.h.tree.props.data.length, 0); assert.doesNotMatch(text(r.h.tree.props.ListHeaderComponent), /No\s+incoming\s+invitations/);
    assert.ok(r.h.tree.props.ListHeaderComponent.props.children.some(n => n?.props?.accessibilityRole === 'alert'));
    r.h.services.fetchChallengeInbox = async () => ({ items: [invitation()], hasMore: false }); await r.press('Refresh');
    for (const status of ['EXPIRED', 'ACCEPTED']) {
      r.h.services.resolveArenaChallenge = async () => invitation({ status, roomId: null }); await r.press('Accept this challenge');
      assert.deepEqual(r.h.calls, []);
    }
  } finally { await r.h.unmount(); }
});

test('blur, account change and unmount fence delayed acceptance and stale callbacks', async () => {
  for (const mode of ['blur', 'account', 'unmount']) {
    const r = setup(), pending = deferred(); r.h.services.resolveArenaChallenge = async () => pending.promise;
    await r.h.mount(); const stale = r.button('Accept this challenge').props.onPress;
    await r.h.act(async () => stale());
    if (mode === 'blur') { r.focus(false); await r.h.update(); }
    if (mode === 'account') { r.h.auth = { user: { id: 'account-b' }, signedIn: true }; await r.h.update(); }
    if (mode === 'unmount') await r.h.unmount();
    await r.h.act(async () => pending.resolve(invitation({ status: 'ACCEPTED', roomId: 'old-room' })));
    assert.deepEqual(r.h.calls, []);
    if (mode !== 'unmount') { await r.h.act(async () => stale()); assert.deepEqual(r.h.calls, []); await r.h.unmount(); }
  }
});

test('outgoing cancellation confirmation cannot act after an account switch; source Take opens without mutation', async () => {
  const r = setup();
  try { await r.h.mount(); await r.press('View Take'); assert.deepEqual(r.h.calls, [['push', '/take/take-a']]);
    await r.press('Outgoing challenges'); assert.equal(r.button('Accept this challenge'), undefined);
    await r.press('Cancel invitation'); const confirm = r.h.confirm;
    r.h.auth = { user: { id: 'account-b' }, signedIn: true }; await r.h.update();
    await r.h.act(async () => confirm()); assert.equal(r.calls.length, 0);
  } finally { await r.h.unmount(); }
});

test('Inbox Back uses the existing stack or Activity fallback without replacing the Room', async () => {
  const h = harness('app/arena/challenges.tsx', {}, undefined, { dependencies: { ChallengeInbox: { ChallengeInbox: 'Inbox' } } });
  try { await h.mount(); await h.act(async () => h.nodes.find(n => n.props.accessibilityLabel === 'Go back').props.onPress());
    assert.deepEqual(h.calls, [['replace', '/(tabs)/notifications']]); h.router.canGoBack = () => true;
    await h.update(); await h.act(async () => h.nodes.find(n => n.props.accessibilityLabel === 'Go back').props.onPress());
    assert.deepEqual(h.calls.at(-1), ['back']);
  } finally { await h.unmount(); }
});

test('failed decisions retain server-refreshed state and report failure without automatic retry', async () => {
  const r = setup(); let writes = 0;
  r.h.services.resolveArenaChallenge = async () => { writes++; throw { code: '42501' }; };
  try { await r.h.mount(); await r.press('Pass on this challenge');
    assert.equal(writes, 1); assert.deepEqual(r.h.calls, []);
    assert.match(text(r.h.tree.props.ListHeaderComponent), /no longer available to your account/);
    assert.equal(r.button('Accept this challenge').props.disabled, false);
  } finally { await r.h.unmount(); }
});

test('a stale action cannot revive after switching away from and back to the original account', async () => {
  const r = setup();
  try { await r.h.mount(); const stale = r.button('Accept this challenge').props.onPress;
    r.h.auth = { user: { id: 'account-b' }, signedIn: true }; await r.h.update();
    r.h.auth = { user: { id: 'account-a' }, signedIn: true }; await r.h.update();
    await r.h.act(async () => stale()); assert.equal(r.calls.length, 0);
  } finally { await r.h.unmount(); }
});

test('Activity opens Challenge Inbox without marking notifications or issuing admission', async () => {
  const refresh = async () => {};
  const h = harness('app/(tabs)/notifications.tsx', {}, undefined, { dependencies: {
    'expo-router': { useRouter: () => h.router, useFocusEffect: fn => React.useEffect(fn, [fn]) },
    NotificationUnreadProvider: { useNotificationUnread: () => ({ refresh }) },
    ArenaReturnVisits: { ArenaReturnVisits: 'Returns' }, NotificationRow: { NotificationRow: 'Row' },
    ArenaPrimitives: { ArenaButton: 'ArenaButton' }, dockConfig: { dockBottomPadding: () => 80 },
  } });
  h.services.fetchNotifications = async () => []; h.services.currentUserId = async () => 'account-a';
  h.services.fetchProfilesByIds = async () => [];
  try { await h.mount(); const header = h.tree.props.children.props.ListHeaderComponent;
    const launcher = header.props.children.find(n => n?.props?.label === 'Challenge Inbox');
    assert.ok(launcher); await h.act(async () => launcher.props.onPress());
    assert.deepEqual(h.calls, [['push', '/arena/challenges']]);
    // Any mutation call fails at the unmocked service boundary.
  } finally { await h.unmount(); }
});

test('initial loading and a delayed account read never present successful-empty or previous-account invitations', async () => {
  const r = setup(), first = deferred(), next = deferred(); r.h.services.fetchChallengeInbox = () => first.promise;
  try { await r.h.mount(); assert.doesNotMatch(text(r.h.tree.props.ListHeaderComponent), /No\s+incoming\s+invitations/);
    await r.h.act(async () => first.resolve({ items: [invitation()], hasMore: false }));
    r.h.services.fetchChallengeInbox = () => next.promise;
    r.h.auth = { user: { id: 'account-b' }, signedIn: true }; await r.h.update();
    assert.equal(r.h.tree.props.data.length, 0); assert.doesNotMatch(text(r.h.tree.props.ListHeaderComponent), /No\s+incoming\s+invitations/);
    await r.h.act(async () => next.resolve({ items: [], hasMore: false }));
    assert.match(text(r.h.tree.props.ListHeaderComponent), /No\s+incoming\s+invitations/);
  } finally { await r.h.unmount(); }
});
