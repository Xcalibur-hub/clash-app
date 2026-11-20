const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto');
const { transform } = require('sucrase');
const source = fs.readFileSync('app.config.ts', 'utf8');
const base = JSON.parse(fs.readFileSync('app.json')).expo;
const ref = 'abcdefghijklmnopqrst', origin = `https://${ref}.supabase.co`;
const opaque = 'sb_publishable_OFFLINE_SYNTHETIC_NOT_A_REAL_KEY';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
// Deliberately unsigned synthetic test material: never used with any server.
const jwt = (claims = {}, header = { alg: 'HS256' }) => [header,
  { role: 'anon', ref, exp: 4102444800, ...claims }].map(x => Buffer.from(JSON.stringify(x)).toString('base64url'))
  .concat(Buffer.alloc(32).toString('base64url')).join('.');
const approval = key => ({ synthetic: { projectRef: ref, supabaseUrl: origin, publicKeySha256: hash(key) } });
const valid = key => ({ APP_VARIANT: 'production', CLASH_RELEASE_TARGET: 'synthetic', EXPO_PUBLIC_SUPABASE_URL: origin, EXPO_PUBLIC_SUPABASE_ANON_KEY: key });
function configure(env, targets = approval(opaque)) {
  const context = { exports: {}, require: name => name === './config/release-targets.json' ? targets : require(name),
    process: { env }, URL, Buffer, Date };
  vm.runInNewContext(transform(source, { transforms: ['typescript', 'imports'] }).code, context);
  return context.exports.default({ config: base });
}
for (const context of [{}, { CI: '1' }, { EAS_BUILD: 'true' }, { NODE_ENV: 'production' }]) {
  for (const value of [undefined, '', 'typo']) test(`explicit variant required: ${JSON.stringify(context)} / ${String(value)}`, () => {
    assert.throws(() => configure({ ...valid(opaque), ...context, APP_VARIANT: value }), /APP_VARIANT/);
  });
}
for (const variant of ['preview', 'production']) {
  test(`${variant} requires separately approved target`, () => {
    assert.throws(() => configure({ ...valid(opaque), APP_VARIANT: variant }, {}), /approval required/);
    assert.throws(() => configure({ ...valid(opaque), APP_VARIANT: variant, CLASH_RELEASE_TARGET: '' }), /approval required/);
    assert.throws(() => configure({ ...valid(opaque), APP_VARIANT: variant, CLASH_RELEASE_TARGET: '__proto__' }), /approval required/);
  });
  for (const url of [undefined, '', 'invalid', 'http://localhost:55481', 'https://localhost', 'https://127.0.0.1',
    'https://127.1', 'https://2130706433', 'https://[::1]', 'https://10.0.2.2', 'https://10.0.3.2',
    'https://10.1.2.3', 'https://172.16.0.1', 'https://192.168.0.1', 'https://169.254.169.254',
    'https://[fe80::1]', 'https://[fc00::1]', 'https://unapproved.invalid', `http://${ref}.supabase.co`,
    origin + '/rest/v1', origin + '?x=1', origin + '#x', `https://user:pass@${ref}.supabase.co`]) {
    test(`${variant} rejects nonapproved URL case ${String(url)}`, () => {
      assert.throws(() => configure({ ...valid(opaque), APP_VARIANT: variant, EXPO_PUBLIC_SUPABASE_URL: url }), /approved HTTPS/);
    });
  }
}
for (const key of [undefined, '', 'malformed', 'sb_publishable_short', 'sb_secret_OFFLINE_SYNTHETIC_KEY',
  jwt({ role: 'service_role' }), jwt({ role: 'authenticated' }), jwt({ ref: 'wrong' }), jwt({ exp: 1 }),
  jwt({}, { alg: 'none' })]) {
  test(`rejects invalid/privileged credential case ${key ? hash(key).slice(0, 8) : 'absent'}`, () => {
    // Pinning even an invalid key must not bypass role/format checks.
    assert.throws(() => configure(valid(key), approval(key || '')), /credential/);
  });
}
test('approved opaque synthetic key selects exact production identity without copying secrets into config', () => {
  const result = configure(valid(opaque));
  assert.equal(result.android.package, 'com.clash.v2');
  assert.equal(result.extra.appVariant, 'production');
  assert.ok(!JSON.stringify(result).includes(opaque));
});
test('approved legacy anon test key checks explicit project identity and exact key pin', () => {
  const key = jwt(); assert.equal(configure(valid(key), approval(key)).scheme, 'clash');
  assert.throws(() => configure(valid(jwt({ ref: 'differentprojectrefxx' })), approval(key)), /credential/);
});
test('mismatched opaque key, host and approval records fail closed', () => {
  assert.throws(() => configure(valid(opaque + 'OTHER')), /fingerprint/);
  const record = approval(opaque); record.synthetic.supabaseUrl = 'https://10.0.0.1';
  assert.throws(() => configure(valid(opaque), record), /approved HTTPS/);
});
test('development preserves intentional QA and missing-backend workflows', () => {
  for (const env of [{ APP_VARIANT: 'development' }, { APP_VARIANT: 'development', CI: '1', EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55481' }]) {
    const result = configure(env, {}); assert.equal(result.android.package, 'com.clash.v2.dev');
    assert.equal(result.scheme, 'clash-dev'); assert.equal(result.android.usesCleartextTraffic, true);
  }
});
test('checked-in approvals are empty: neither preview nor production can configure now', () => {
  const real = JSON.parse(fs.readFileSync('config/release-targets.json'));
  assert.deepEqual(real, {});
  for (const variant of ['preview', 'production']) assert.throws(() => configure({ ...valid(opaque), APP_VARIANT: variant }, real), /approval required/);
});
test('errors never interpolate supplied credentials', () => {
  const secret = 'DO_NOT_LOG_THIS_INVALID_KEY';
  try { configure(valid(secret)); assert.fail('must reject'); } catch (error) { assert.ok(!error.message.includes(secret)); }
});
test('installed Expo evaluator loads actual config and registry without a TS import hook', () => {
  const previous = process.env.APP_VARIANT;
  try {
    process.env.APP_VARIANT = 'development';
    const { evalConfig } = require('@expo/config/build/evalConfig');
    const result = evalConfig(require('node:path').resolve('app.config.ts'), { projectRoot: process.cwd(), staticConfigPath: null, packageJsonPath: 'package.json', config: base });
    assert.equal(result.config.android.package, 'com.clash.v2.dev');
  } finally { if (previous === undefined) delete process.env.APP_VARIANT; else process.env.APP_VARIANT = previous; }
});
