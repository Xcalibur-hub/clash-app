const fs = require('node:fs'), path = require('node:path'), test = require('node:test'), assert = require('node:assert/strict');
const { harness, React, nodes, text } = require('./ui-completion-harness.cjs');

class MockSupabaseError extends Error {
  constructor(message, code = 'unexpected') { super(message); this.code = code; }
}
const read = (rel) => fs.readFileSync(path.resolve(rel), 'utf8');
const FUTURE = () => new Date(Date.now() + 86_400_000).toISOString();

function serviceDeps(rpcImpl) {
  let uid = 'auth-a';
  const calls = [];
  return {
    calls, setUser: (next) => { uid = next; },
    deps: {
      supabaseClient: {
        SupabaseError: MockSupabaseError,
        requestError: (e) => new MockSupabaseError(e.message ?? String(e), e.code),
        currentUserId: async () => uid,
        requireSupabase: () => ({
          rpc: (fn, args) => {
            calls.push([fn, args]);
            const query = Promise.resolve(rpcImpl(fn, args));
            query.abortSignal = () => query;
            return query;
          },
        }),
      },
      apiService: { fetchTakeById: async () => ({ id: 'take-1', authorId: 'u-b', text: 'Source Take proposition', status: 'active', expiresAt: Date.now() + 3_600_000 }) },
      clashEngineService: { fetchClashViewForTake: async () => null },
      mediaService: { getPublicMediaUrl: () => null },
    },
  };
}

function validChallenge(overrides = {}) {
  return {
    id: 'ch-1', takeId: 'take-1', challengerId: 'u-a', challengedId: 'u-b',
    counterPosition: 'Substantive counter argument with clear evidence.', status: 'PENDING',
    createdAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: FUTURE(), resolvedAt: null,
    clashId: null, roomId: null, created: true, challenger: { id: 'u-a', name: 'Fictional A', handle: 'user_a' },
    recipient: { id: 'u-b', name: 'Fictional B', handle: 'user_b' }, source: { id: 'take-1', title: 'Source Take', hood: 'techtakes' },
    ...overrides,
  };
}

test('challenge RPC wrappers derive actor from session, block account switches and reject forged room payloads', async () => {
  let nextPayload = validChallenge();
  const env = serviceDeps(async () => ({ data: nextPayload, error: null }));
  const h = harness('services/arenaChallengeService.ts', {}, () => () => null, { dependencies: env.deps });
  try {
    const svc = h.load('services/arenaChallengeService.ts');
    const created = await svc.createArenaChallenge('take-1', 'A substantive counter position for the debate.', 'auth-a');
    assert.equal(created.id, 'ch-1');
    assert.deepEqual(env.calls[0], ['create_arena_challenge', { p_take_id: 'take-1', p_counter_position: 'A substantive counter position for the debate.' }]);
    await assert.rejects(() => svc.resolveArenaChallenge('ch-1', 'ACCEPT', 'auth-b'), (e) => e.code === 'account_changed');
    for (const bad of [
      validChallenge({ status: 'ACCEPTED', resolvedAt: new Date().toISOString(), clashId: null, roomId: 'ar-forged' }),
      validChallenge({ status: 'PENDING', clashId: 'cl-forged', roomId: 'ar-forged' }),
      validChallenge({ challengerId: 'u-a', challengedId: 'u-a', challenger: { id: 'u-a', name: 'A', handle: 'a' } }),
    ]) {
      nextPayload = bad;
      await assert.rejects(() => svc.createArenaChallenge('take-1', 'Another valid counter argument here.', 'auth-a'), /Invalid Challenge/);
    }
  } finally { await h.unmount(); }
});

test('ChallengeInbox navigates only on server-confirmed matching invitation and Room ID', async () => {
  const native = { ...Object.fromEntries(['View', 'Text', 'Pressable', 'FlatList'].map((k) => [k, k])),
    Alert: { alert() {} }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    StyleSheet: { create: (s) => s } };
  const h = harness('components/arena/ChallengeInbox.tsx', {}, undefined, {
    dependencies: { 'react-native': native, 'expo-router': { useRouter: () => h.router, useFocusEffect: (fn) => React.useEffect(fn, [fn]) } },
  });
  h.services.fetchChallengeInbox = async () => ({ items: [validChallenge()], hasMore: false });
  h.services.resolveArenaChallenge = async () => validChallenge({
    id: 'ch-wrong', takeId: 'take-other', status: 'ACCEPTED', resolvedAt: new Date().toISOString(), clashId: 'cl-1', roomId: 'ar-forged',
  });
  try {
    await h.mount();
    const accept = () => {
      const list = h.nodes.find((n) => n.type === 'FlatList');
      return list.props.data.flatMap((item) => nodes(list.props.renderItem({ item })))
        .find((n) => n.props.onPress && /Accept/.test(n.props.accessibilityLabel ?? text(n)));
    };
    await h.act(async () => accept().props.onPress());
    assert.deepEqual(h.calls, []);
    assert.equal(nodes(h.tree.props.ListHeaderComponent).filter((n) => n.props?.accessibilityRole === 'alert').length, 1);

    h.services.resolveArenaChallenge = async () => validChallenge({
      status: 'ACCEPTED', resolvedAt: new Date().toISOString(), clashId: 'cl-confirmed', roomId: 'ar-confirmed',
    });
    await h.act(async () => accept().props.onPress());
    assert.deepEqual(h.calls, [['push', '/arena/room/ar-confirmed']]);
  } finally { await h.unmount(); }
});

test('interest service and hook fail closed on invalid selections, PT409 conflicts and account changes', async () => {
  let saves = 0;
  const env = serviceDeps(async () => ({ data: null, error: { message: 'conflict', code: 'PT409' } }));
  const h = harness('services/arenaInterestService.ts', {}, () => () => null, { dependencies: env.deps });
  const ui = harness('components/onboarding/useArenaInterestEditor.ts', { onSaved() {} }, (e) => (p) => React.createElement('S', e.useArenaInterestEditor(p.onSaved)));
  ui.services.fetchInterestCatalogue = async () => ['tech', 'culture', 'sports', 'design'].map((id) => ({ id, name: id, description: id }));
  ui.services.fetchMyArenaInterests = async () => ({ topicIds: [], version: 0, skipped: false, revision: 0 });
  ui.services.saveMyArenaInterests = async () => { saves++; throw new MockSupabaseError('conflict', 'PT409'); };
  ui.services.reloadArena = async () => {};
  try {
    const svc = h.load('services/arenaInterestService.ts');
    await assert.rejects(() => svc.saveMyArenaInterests(['a', 'b', 'c'], false, 0, 'auth-other'), (e) => e.code === 'account_changed');
    await assert.rejects(() => svc.saveMyArenaInterests(['a', 'b', 'c'], false, 0, 'auth-a'), (e) => e.code === 'PT409');
    await ui.mount();
    await ui.act(async () => ui.tree.props.change(['tech', 'culture']));
    await ui.act(async () => ui.tree.props.save(false));
    assert.equal(saves, 0);
    await ui.act(async () => ui.tree.props.change(['tech', 'culture', 'sports']));
    await ui.act(async () => ui.tree.props.save(false));
    assert.equal(saves, 1);
    assert.deepEqual(ui.tree.props.selected, ['tech', 'culture', 'sports']);
    assert.equal(ui.tree.props.needsReload, true);
    assert.equal(ui.tree.props.preferences.version, 0);
  } finally { await h.unmount(); await ui.unmount(); }
});

test('deferred Vault, Commerce, AI and Groups client mutators block before hitting Supabase RPC', async () => {
  const env = serviceDeps(async () => { assert.fail('Deferred RPC must not execute'); });
  const h = harness('utils/releaseScope.ts', {}, () => () => null, { dependencies: env.deps });
  try {
    const vSvc = h.load('services/vaultService.ts'), cSvc = h.load('services/vaultCommerceService.ts');
    const aiSvc = h.load('services/creatorAiService.ts'), crewSvc = h.load('services/arenaCrewService.ts');
    for (const call of [
      () => vSvc.createCollection('v-1', 'T', 'D'), () => vSvc.addToCollection('col-1', 'drop-1'),
      () => cSvc.requestCreatorService('srv-1', 'Please'), () => aiSvc.addCreatorAiKnowledge({ kind: 'note', title: 'Test' }),
      () => crewSvc.createArenaCrew({ name: 'Crew', slug: 'crew' }), () => crewSvc.joinArenaCrew('crew-1'),
    ]) {
      await assert.rejects(call, (e) => e instanceof Error && /unavailable in the text-debate beta/.test(e.message));
    }
    assert.equal(env.calls.length, 0);
  } finally { await h.unmount(); }
});

test('repository SQL/Edge contracts enforce core auth boundaries while tracking remaining server gaps', () => {
  const challengeSql = read('supabase/migrations/20261007130100_arena_challenge_lifecycle.sql');
  const inboxSql = read('supabase/migrations/20261008151000_arena_challenge_inbox.sql');
  const interestConflictSql = read('supabase/migrations/20261008135500_arena_interest_conflict_http.sql');
  const vaultHelperSql = read('supabase/migrations/20261008110400_legacy_visibility_helpers.sql');
  assert.match(challengeSql, /revoke execute on function public\.create_arena_challenge\(text,\s*text\),\s*public\.resolve_arena_challenge\(uuid,\s*text\)/i);
  assert.match(challengeSql, /grant execute on function public\.create_arena_challenge\(text,\s*text\),\s*public\.resolve_arena_challenge\(uuid,\s*text\)[\s\S]*to authenticated;/i);
  assert.match(inboxSql, /not t\.is_runtime_fixture/);
  assert.match(interestConflictSql, /errcode\s*=\s*'PT409'/);
  assert.match(vaultHelperSql, /p_viewer_profile_id is distinct from public\.my_profile_id\(\)/);
  assert.match(read('supabase/functions/vault-media-access/index.ts'), /asCaller\.rpc\('vault_drop_media_target'/);
  assert.match(read('supabase/functions/arena-assist-media-access/handler.ts'), /rpc\/arena_private_assist_media_target/);

  const migrations = fs.readdirSync(path.resolve('supabase/migrations')).filter((f) => f.endsWith('.sql')).map((f) => read(`supabase/migrations/${f}`)).join('\n');
  assert.match(migrations, /create function public\.assert_release_admission/i, 'Forward candidate closes deferred RPC admission; deployment is separate');
  assert.match(migrations, /revoke all on function public\.start_clash\([^)]+\)\s+from\s+[^;]*\bauthenticated\b/i, 'Forward retirement removes the legacy callable privilege');
  assert.match(read('supabase/migrations/20261111120000_beta_take_identity.sql'), /create trigger beta_take_identity before update on public\.takes/i, 'Forward identity guard covers all debate fields');
  assert.match(read('supabase/migrations/20261111130000_beta_storage_admission.sql'), /create trigger beta_storage_upload_admission[\s\S]*before insert or update on storage\.objects/i, 'Forward Storage admission trigger closes direct and signed-upload bypass');
  assert.match(read('supabase/migrations/20261111130000_beta_storage_admission.sql'), /create policy "admitted media upload only"[\s\S]*on storage\.objects for insert to authenticated/i, 'Forward Storage INSERT policy requires active uploading admission');
});
