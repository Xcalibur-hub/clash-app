// Production hooks/components and service bodies; only native and network boundaries are mocked.
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, deferred, React, text } = require('./ui-completion-harness.cjs');
const take = { id: 'take-a', authorId: 'author-a', text: 'A public position', status: 'active', expiresAt: Date.now() + 7200000 };
const draft = 'A different position with a reason worth discussing.';
const invitation = changes => ({ id: 'invitation-a', takeId: take.id, challengerId: 'profile-a',
  challengedId: take.authorId, status: 'PENDING', expiresAt: new Date(Date.now() + 3600000).toISOString(),
  counterPosition: draft, challenger: { name: 'Challenger', handle: 'challenger' }, ...changes });
const native = { ...Object.fromEntries(['View', 'Text', 'Pressable', 'TextInput', 'Modal', 'ScrollView', 'KeyboardAvoidingView'].map(k => [k, k])),
  StyleSheet: { create: s => s, hairlineWidth: 1 }, Platform: { OS: 'android', select: options => options.android ?? options.default },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
function setup(props = {}, selector = e => e.TakeChallenges) {
  let focused = true;
  const h = harness('components/arena/TakeChallenges.tsx', { take, openComposer: false, compact: true, ...props }, selector,
    { dependencies: { 'react-native': native,
      'expo-router': { useRouter: () => h.router, useFocusEffect: fn => React.useEffect(() => focused ? fn() : undefined, [fn, focused]) },
      useRequireAuth: { useRequireAuth: () => () => { if (!h.auth.signedIn) { h.router.push('/auth'); return false; } return true; } },
      arenaChallengeService: {
        ChallengeEligibilityError: class extends Error {},
        fetchEligibleChallengeTake: (...args) => h.services.fetchEligibleChallengeTake(...args),
        listArenaChallenges: (...args) => h.services.listArenaChallenges(...args),
        createArenaChallenge: (...args) => h.services.createArenaChallenge(...args),
        resolveArenaChallenge: (...args) => h.services.resolveArenaChallenge(...args),
      },
    } });
  h.services.listArenaChallenges = async () => [];
  h.services.fetchEligibleChallengeTake = async () => take;
  h.services.createArenaChallenge = async () => invitation();
  h.services.errorText = e => e.message;
  const button = label => h.nodes.find(n => n.props.accessibilityLabel === label && n.props.onPress);
  const press = label => h.act(async () => { const n = button(label); assert.ok(n, label); assert.ok(!n.props.disabled); n.props.onPress(); });
  return { h, button, press, focus: value => { focused = value; } };
}

test('Take entry opens only the canonical route; guests sign in and owners review invitations', async () => {
  for (const role of ['guest', 'challenger', 'author']) {
    const r = setup({ takeId: take.id, take }, e => e.ChallengeTakeButton);
    if (role === 'guest') r.h.auth = { user: null, signedIn: false };
    if (role === 'author') r.h.state.viewer.id = take.authorId;
    try { await r.h.mount(); await r.press(role === 'author' ? 'Review challenges' : 'Challenge this take');
      assert.deepEqual(r.h.calls, role === 'guest' ? [['push', '/auth']] : role === 'author'
        ? [['push', '/arena/challenges']] : [['push', { pathname: '/take/[takeId]', params: { takeId: take.id, challenge: '1' } }]]);
    } finally { await r.h.unmount(); }
  }
});

test('comment draft opens the shared editable composer and counts one explicit submission once', async () => {
  const r = setup({ composerRequest: { id: 1, text: draft } }), pending = deferred(); let writes = 0;
  r.h.services.createArenaChallenge = async (id, value, account, active) => {
    assert.equal(id, take.id); assert.equal(value, draft); assert.equal(account, 'account-a'); assert.equal(active(), true);
    writes++; return pending.promise;
  };
  try { await r.h.mount(); assert.equal(writes, 0); assert.equal(r.h.nodes.find(n => n.type === 'TextInput').props.value, draft);
    const send = r.button('SEND CHALLENGE').props.onPress;
    await r.h.act(async () => { send(); send(); }); assert.equal(writes, 1);
    assert.equal(r.h.nodes.find(n => n.type === 'TextInput').props.editable, false);
    await r.h.act(async () => pending.resolve(invitation()));
    assert.equal(r.h.nodes.find(n => n.type === 'Modal').props.visible, false);
    assert.match(text(r.h.tree), /Invitation sent.*Waiting for the author/);
    assert.deepEqual(r.h.calls, []); await r.press('Open Challenge Inbox'); assert.deepEqual(r.h.calls, [['push', '/arena/challenges']]);
  } finally { await r.h.unmount(); }
});

test('author Take uses Inbox review; prior accepted history remains navigable without accepting again', async () => {
  const r = setup(); r.h.state.viewer.id = take.authorId;
  r.h.services.listArenaChallenges = async () => [invitation(), invitation({ id: 'old', status: 'ACCEPTED', roomId: 'recorded-room' })];
  try { await r.h.mount(); assert.equal(r.button('Challenge'), undefined); await r.press('Review');
    assert.deepEqual(r.h.calls, [['push', '/arena/challenges']]); await r.press('Challenge history'); await r.press('OPEN DUEL');
    assert.deepEqual(r.h.calls.at(-1), ['push', '/arena/room/recorded-room']);
  } finally { await r.h.unmount(); }
});

test('closing the canonical composer preserves context and a failed explicit send can recover', async () => {
  const r = setup({ openComposer: true }); let writes = 0;
  r.h.services.createArenaChallenge = async () => { writes++; throw Error('Disconnected. Verify in Inbox before retrying.'); };
  try { await r.h.mount(); await r.h.act(async () => r.h.nodes.find(n => n.type === 'TextInput').props.onChangeText(draft));
    await r.press('SEND CHALLENGE'); assert.equal(writes, 1); assert.match(text(r.h.tree), /Disconnected/);
    assert.equal(r.h.nodes.find(n => n.type === 'Modal').props.visible, true);
    r.h.services.createArenaChallenge = async () => { writes++; return invitation(); }; await r.press('SEND CHALLENGE'); assert.equal(writes, 2);
    await r.press('Challenge'); await r.h.act(async () => r.h.nodes.find(n => n.type === 'Modal').props.onRequestClose());
    assert.equal(r.h.nodes.find(n => n.type === 'Modal').props.visible, false); assert.deepEqual(r.h.calls, []);
  } finally { await r.h.unmount(); }
});

test('duplicate pending invitations, guests and self-challenges cannot submit', async () => {
  for (const role of ['pending', 'guest', 'self']) {
    const r = setup({ openComposer: true }); let writes = 0;
    r.h.services.createArenaChallenge = async () => { writes++; return invitation(); };
    if (role === 'pending') r.h.services.listArenaChallenges = async () => [invitation()];
    if (role === 'guest') r.h.auth = { user: null, signedIn: false };
    if (role === 'self') r.h.state.viewer.id = take.authorId;
    try { await r.h.mount(); if (role === 'pending') {
      await r.h.act(async () => r.h.nodes.find(n => n.type === 'TextInput').props.onChangeText(draft));
      assert.equal(r.button('SEND CHALLENGE').props.disabled, true); await r.press('Open Challenge Inbox');
    } else assert.ok(!r.h.tree || !r.h.nodes.find(n => n.type === 'Modal').props.visible);
    assert.equal(writes, 0);
    } finally { await r.h.unmount(); }
  }
});

test('account A-B-A, blur and unmount invalidate delayed drafts and saved send callbacks', async () => {
  for (const change of ['account', 'blur', 'unmount']) {
    const r = setup({ openComposer: true }); let writes = 0;
    r.h.services.createArenaChallenge = async () => { writes++; return invitation(); };
    await r.h.mount(); await r.h.act(async () => r.h.nodes.find(n => n.type === 'TextInput').props.onChangeText(draft));
    const stale = r.button('SEND CHALLENGE').props.onPress;
    if (change === 'account') { r.h.auth = { user: { id: 'account-b' }, signedIn: true }; await r.h.update();
      r.h.auth = { user: { id: 'account-a' }, signedIn: true }; await r.h.update(); }
    if (change === 'blur') { r.focus(false); await r.h.update(); }
    if (change === 'unmount') await r.h.unmount();
    await r.h.act(async () => stale()); assert.equal(writes, 0); assert.deepEqual(r.h.calls, []);
    if (change !== 'unmount') await r.h.unmount();
  }
});

test('real creation service cancels a stale eligibility read before any canonical or legacy write', async () => {
  const waiting = deferred(); let active = true, writes = 0;
  class ApiError extends Error { constructor(message, code) { super(message); this.code = code; } }
  // A separate loader binds the actual service body to controlled SDK boundaries.
  const h = harness('services/arenaChallengeService.ts', {}, () => () => null, { dependencies: {
    supabaseClient: { SupabaseError: ApiError, currentUserId: async () => 'account-a',
      requireSupabase: () => ({ rpc() { writes++; throw Error('Unexpected write'); } }) },
    apiService: { fetchTakeById: () => waiting.promise }, clashEngineService: { fetchClashViewForTake: async () => null },
  } });
  try { const service = h.load('services/arenaChallengeService.ts');
    const result = service.createArenaChallenge(take.id, draft, 'account-a', () => active);
    active = false; waiting.resolve(take); await assert.rejects(result, { code: 'account_changed' }); assert.equal(writes, 0);
    await assert.rejects(service.createArenaChallenge(take.id, draft, 'account-b'), { code: 'account_changed' }); assert.equal(writes, 0);
  } finally { await h.unmount(); }
});

test('only an authenticated non-author can challenge using their own reply; comments stay unchanged', async () => {
  for (const role of ['challenger', 'author', 'guest', 'other-comment']) {
    const comment = { id: 'reply-a', authorId: role === 'other-comment' ? 'someone-else' : 'profile-a', text: draft, createdAt: Date.now(), upvotes: 0 };
    const before = JSON.stringify(comment); let entries = 0;
    const h = harness('components/arena/CommentThread.tsx', { node: { comment, children: [] }, takeAuthorId: role === 'author' ? 'profile-a' : 'author-a',
      canChallenge: role !== 'guest' && role !== 'author', onClash: value => { assert.equal(value, comment); entries++; }, onUpvote() {}, onReply() {}, onMore() {} },
    e => props => { const item = e.CommentBranch(props); return item.type.type(item.props); }, { dependencies: {
      'react-native': native, ArenaPrimitives: { ArenaAvatar: 'Avatar' }, CommentMedia: { CommentMedia: 'Media' },
      store: { useClash: () => ({ state: h.state, dispatch() {} }), selectAuthor: () => ({ id: comment.authorId, name: 'Author', handle: 'author' }) },
    } });
    h.state.upvotedCommentIds = []; h.state.comments = [comment];
    try { await h.mount(); const action = h.nodes.find(n => n.props.accessibilityLabel === 'Challenge with this rebuttal');
      assert.equal(!!action, role === 'challenger'); if (action) await h.act(async () => action.props.onPress());
      assert.equal(entries, role === 'challenger' ? 1 : 0); assert.equal(JSON.stringify(comment), before);
    } finally { await h.unmount(); }
  }
});

test('an in-flight eligibility read cannot reopen a composer after blur or account change', async () => {
  for (const mode of ['blur', 'account']) {
    const r = setup(), pending = deferred(); r.h.services.fetchEligibleChallengeTake = () => pending.promise;
    try { await r.h.mount(); await r.press('Challenge');
      if (mode === 'blur') r.focus(false); else r.h.auth = { user: { id: 'account-b' }, signedIn: true };
      await r.h.update(); await r.h.act(async () => pending.resolve(take));
      assert.equal(r.h.nodes.find(n => n.type === 'Modal').props.visible, false); assert.deepEqual(r.h.calls, []);
    } finally { await r.h.unmount(); }
  }
});
