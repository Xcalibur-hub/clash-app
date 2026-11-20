// Uses the installed SDK with fake storage and a fetch tripwire. No real tokens.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module');
const dependencies = createRequire(require('node:path').resolve('package.json'));
const { transform } = dependencies('sucrase');
const { createClient } = dependencies('@supabase/supabase-js');
const candidate = { exports: {}, URL, process: { env: {} } };
let source = fs.readFileSync(path.resolve('utils/supabaseEnv.ts'), 'utf8');
if (process.env.PHASE3E_NEGATIVE_CONTROL === '1') {
  const anchor = 'return `sb-clash-project:${encodeURIComponent(origin)}:auth-token`;';
  if (!source.includes(anchor)) throw Error('Negative control mutation anchor missing');
  source = source.replace(anchor,
    "return 'sb-clash-hosted-auth-token';");
}
vm.runInNewContext(transform(source,
  { transforms: ['typescript', 'imports'] }).code, candidate);
const { supabaseAuthStorageKey: key } = candidate.exports;
const oldOrigin = 'https://eagbgwasiocfppwobpsd.supabase.co';
const newOrigin = 'https://kgaqejgubjemdecifzew.supabase.co';
const legacyKey = 'sb-clash-hosted-auth-token';
const syntheticSession = label => ({ access_token: 'OFFLINE_SYNTHETIC_' + label,
  refresh_token: 'OFFLINE_SYNTHETIC_REFRESH_' + label, token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'fixture-' + label } });
function harness(rows = []) {
  const values = new Map(rows), reads = [], writes = [], removals = [], requests = [];
  const storage = {
    getItem: async name => { reads.push(name); return values.get(name) ?? null; },
    setItem: async (name, value) => { writes.push(name); values.set(name, value); },
    removeItem: async name => { removals.push(name); values.delete(name); },
  };
  const client = origin => createClient(origin, 'sb_publishable_OFFLINE_SYNTHETIC_NOT_A_REAL_KEY', {
    auth: { storage, storageKey: key(origin), persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async () => { requests.push('UNEXPECTED'); throw Error('Network forbidden'); } },
  });
  return { values, reads, writes, removals, requests, client };
}
test('old and new projects have distinct storage namespaces, separate from the shared legacy key', () => {
  assert.notEqual(key(oldOrigin), key(newOrigin));
  for (const origin of [oldOrigin, newOrigin]) assert.notEqual(key(origin), legacyKey);
});
test('host casing, default HTTPS port and trailing slash share one canonical origin', () => {
  assert.equal(key(newOrigin), key('https://KGAQEJGUBJEMDECIFZEW.supabase.co:443/'));
  assert.notEqual(key(newOrigin), key(newOrigin.replace('https:', 'http:')));
  assert.notEqual(key(newOrigin), key(newOrigin + ':444'));
});
test('existing primary local session and disposable stack separation are preserved', () => {
  assert.equal(key('http://127.0.0.1:55321'), 'sb-clash-local-auth-token');
  assert.equal(key('http://localhost:55321'), 'sb-clash-local-auth-token');
  assert.notEqual(key('http://127.0.0.1:57721'), key('http://127.0.0.1:57731'));
  assert.notEqual(key(newOrigin), key('http://127.0.0.1:55321'));
});
test('malformed or credential-bearing configuration fails without echoing the input', () => {
  for (const origin of ['', 'bad', 'file:///private', newOrigin + '/rest/v1', newOrigin + '?secret=fixture',
    newOrigin + '#fixture', 'https://fixture:fixture@kgaqejgubjemdecifzew.supabase.co']) {
    assert.throws(() => key(origin), error => error.message === 'Invalid Supabase origin.');
  }
});
test('new SDK client ignores the legacy and old-project session and remains signed out', async () => {
  const legacy = JSON.stringify(syntheticSession('legacy')), old = JSON.stringify(syntheticSession('old'));
  const h = harness([[legacyKey, legacy], [key(oldOrigin), old]]), client = h.client(newOrigin);
  const result = await client.auth.getSession();
  assert.equal(result.error, null); assert.equal(result.data.session, null);
  assert.ok(!h.reads.includes(legacyKey)); assert.ok(!h.reads.includes(key(oldOrigin)));
  assert.equal(h.values.get(legacyKey), legacy); assert.equal(h.values.get(key(oldOrigin)), old);
  assert.deepEqual(h.writes, []); assert.deepEqual(h.removals, []); assert.deepEqual(h.requests, []);
  await client.auth.stopAutoRefresh();
});
test('SDK restores each project only from its own synthetic session after restart', async () => {
  const old = syntheticSession('old'), fresh = syntheticSession('new');
  const h = harness([[key(oldOrigin), JSON.stringify(old)], [key(newOrigin), JSON.stringify(fresh)]]);
  for (const [origin, expected] of [[newOrigin, fresh], [oldOrigin, old], [newOrigin, fresh]]) {
    const client = h.client(origin), result = await client.auth.getSession();
    assert.equal(result.error, null); assert.equal(result.data.session.user.id, expected.user.id);
    await client.auth.stopAutoRefresh();
  }
  assert.deepEqual(h.requests, []); assert.ok(!h.reads.includes(legacyKey));
});
