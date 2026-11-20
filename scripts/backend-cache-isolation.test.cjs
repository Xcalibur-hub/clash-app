const { test } = require('node:test'), assert = require('node:assert/strict');
const { moduleHarness } = require('./lib/backend-module-harness.cjs');
const old = 'https://eagbgwasiocfppwobpsd.supabase.co', fresh = 'https://kgaqejgubjemdecifzew.supabase.co';
test('same Auth UUID and guest remount keys differ by project; tuple keys resist delimiter collisions', () => {
  const a = moduleHarness(old).load('utils/supabaseEnv.ts'), b = moduleHarness(fresh).load('utils/supabaseEnv.ts');
  assert.notEqual(a.backendAccountKey('same'), b.backendAccountKey('same'));
  assert.notEqual(a.backendAccountKey(null), b.backendAccountKey(null));
  assert.notEqual(a.backendAccountKey(null), a.backendAccountKey('guest'));
  assert.notEqual(a.backendCacheKey('n', 'a:b', 'c'), a.backendCacheKey('n', 'a', 'b:c'));
});
test('real official request store resumes only same-project, same-account, same-payload work', async () => {
  const legacy = 'official-request:v1:same:room:vote';
  const a = moduleHarness(old, [[legacy, 'LEGACY_PRESERVE']]), b = moduleHarness(fresh);
  const oldStore = a.load('services/officialRequestStore.ts'), newStore = b.load('services/officialRequestStore.ts');
  const oldRequest = await oldStore.acquireOfficialRequest('same', 'room', 'vote', { vote: 'A' });
  for (const [k, v] of a.values) b.values.set(k, v);
  const newRequest = await newStore.acquireOfficialRequest('same', 'room', 'vote', { vote: 'A' });
  assert.notEqual(oldRequest, newRequest);
  assert.equal(await newStore.acquireOfficialRequest('same', 'room', 'vote', { vote: 'A' }), newRequest);
  assert.notEqual(await newStore.acquireOfficialRequest('different', 'room', 'vote', { vote: 'A' }), newRequest);
  await newStore.confirmOfficialRequest('same', 'room', 'vote', 'wrong');
  assert.equal(await newStore.acquireOfficialRequest('same', 'room', 'vote', { vote: 'A' }), newRequest);
  assert.ok(!b.reads.includes(legacy)); assert.equal(b.values.get(legacy), 'LEGACY_PRESERVE');
  const oldKey = a.load('utils/supabaseEnv.ts').backendCacheKey('official-request:v2', 'same', 'room', 'vote');
  await newStore.confirmOfficialRequest('same', 'room', 'vote', newRequest);
  assert.equal(b.values.get(oldKey), a.values.get(oldKey));
});
test('recent media never carries backend IDs or URLs across project/account/guest boundaries', async () => {
  const legacy = '@clash/arena/expressive-recent/v1';
  const a = moduleHarness(old, [[legacy, 'LEGACY_PRESERVE']]), b = moduleHarness(fresh);
  const recentA = a.load('utils/expressiveMediaRecent.ts'), recentB = b.load('utils/expressiveMediaRecent.ts');
  const media = { kind: 'meme', provider: 'fixture', externalId: 'm', previewUrl: old + '/old.png',
    url: old + '/old.png', mediaObjectId: 'old-media' };
  await recentA.pushExpressiveRecent(media, 'same');
  for (const [k, v] of a.values) b.values.set(k, v);
  assert.equal((await recentB.readExpressiveRecent('same')).length, 0);
  assert.equal((await recentA.readExpressiveRecent('other')).length, 0);
  assert.equal((await recentA.readExpressiveRecent(null)).length, 0);
  assert.equal((await recentA.readExpressiveRecent('same'))[0].mediaObjectId, 'old-media');
  assert.equal(b.values.get(legacy), 'LEGACY_PRESERVE'); assert.ok(!b.reads.includes(legacy));
});
test('real assist service ignores cached old-project public copies before the guarded RPC', async () => {
  const h = moduleHarness(fresh), scope = h.load('utils/supabaseEnv.ts');
  const oldScope = moduleHarness(old).load('utils/supabaseEnv.ts');
  const oldKey = oldScope.backendCacheKey('assist-public-copy:v2', 'same', 'room', 'assist');
  h.values.set(oldKey, JSON.stringify({ id: 'old-media', url: old + '/old.png' }));
  const calls = [];
  const service = h.load('services/arenaAssistService.ts', {
    './supabaseClient': { currentUserId: async () => 'same', SupabaseError: Error,
      requestError: e => e, requireSupabase: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; } }) },
    './mediaService': {},
  });
  await service.incorporatePrivateAssist('same', 'room', { id: 'assist', mediaId: null, mediaKind: null });
  const sent = calls.find(c => c.name === 'incorporate_arena_private_assist');
  assert.equal(sent.args.p_public_media_id, null); assert.equal(sent.args.p_public_media_url, null);
  assert.ok(!h.reads.includes(oldKey)); assert.ok(h.values.has(oldKey));
  assert.ok(h.reads.includes(scope.backendCacheKey('assist-public-copy:v2', 'same', 'room', 'assist')));
});
