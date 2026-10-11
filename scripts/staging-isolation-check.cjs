// Controlled config/policy checks only: no env-file writes, network or native calls.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const babel = require('@babel/core');
const { test } = require('node:test');
function load(file, imports = {}, env = {}, globals = {}) {
  const module = { exports: {} };
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, babelrc: false, configFile: false,
    presets: ['@babel/preset-typescript'], plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  vm.runInNewContext(code, { ...globals, module, exports: module.exports, URL, process: { env }, require(name) {
    if (Object.hasOwn(imports, name)) return imports[name]; throw Error('Unexpected import ' + name);
  } });
  return module.exports;
}
const policy = require('../utils/backendPolicy.js');
const origins = { staging: ['https://stage-test.supabase.co'], production: ['https://prod-test.supabase.co'] };
for (const variant of ['staging', 'production', 'preview']) {
  test(`${variant} only accepts its exact approved backend`, () => {
    const good = variant === 'staging' ? origins.staging[0] : origins.production[0];
    policy.assertBackendAllowed(variant, good, origins);
    for (const bad of ['', 'http://localhost:55321', good.replace('https:', 'http:'), good + '.evil.test', good + '/api', good + '?x=1', good.replace('https://', 'https://user@'), variant === 'staging' ? origins.production[0] : origins.staging[0]]) {
      assert.throws(() => policy.assertBackendAllowed(variant, bad, origins));
    }
  });
}
test('empty or overlapping allowlists fail closed', () => {
  assert.throws(() => policy.assertBackendAllowed('staging', origins.staging[0], { staging: [], production: [] }));
  assert.throws(() => policy.assertBackendAllowed('production', origins.production[0], { staging: origins.production, production: origins.production }));
});
test('unknown variant never falls back to production', () => {
  assert.equal(policy.resolveAppVariant(undefined), 'production');
  for (const variant of ['stage', '', 'Production', null]) assert.throws(() => policy.resolveAppVariant(variant));
});
test('sessions are scoped to exact backend origin', () => {
  assert.notEqual(policy.backendStorageKey(origins.staging[0]), policy.backendStorageKey(origins.production[0]));
  assert.notEqual(policy.backendStorageKey('http://127.0.0.1:55321'), policy.backendStorageKey('http://127.0.0.1:54321'));
  assert.equal(policy.backendStorageKey(origins.staging[0]), policy.backendStorageKey(origins.staging[0] + '/'));
});
test('native identity rejects cross-variant bundles', () => {
  policy.assertNativeVariant('staging', 'com.clash.v2.staging');
  policy.assertNativeVariant('production', 'com.clash.v2');
  policy.assertNativeVariant('development', 'com.clash.v2.dev');
  assert.throws(() => policy.assertNativeVariant('staging', 'com.clash.v2'));
  assert.throws(() => policy.assertNativeVariant('staging', null));
  assert.throws(() => policy.assertNativeVariant('production', 'com.clash.v2.staging'));
  assert.throws(() => policy.assertNativeVariant('development', 'com.clash.v2'));
});
for (const [variant, id, scheme] of [['development', 'com.clash.v2.dev', 'clash-dev'], ['production', 'com.clash.v2', 'clash'], ['preview', 'com.clash.v2', 'clash'], ['staging', 'com.clash.v2.staging', 'clash-staging']]) {
  test(`${variant} Expo identity and CI backend gate`, () => {
    const env = { APP_VARIANT: variant, CI: '1', EXPO_PUBLIC_SUPABASE_URL: variant === 'staging' ? origins.staging[0] : origins.production[0] };
    const configure = load('app.config.ts', { './utils/backendPolicy': policy, './config/backend-origins.json': origins }, env).default;
    const output = configure({ config: { name: 'CLASH', slug: 'clash' } });
    assert.equal(output.android.package, id); assert.equal(output.ios.bundleIdentifier, id); assert.equal(output.scheme, scheme);
    if (variant !== 'development') { env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:55321'; assert.throws(() => configure({ config: {} })); }
  });
}
test('staging EAS profile uses dedicated channel and variant', () => {
  const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
  assert.equal(eas.build.staging.channel, 'clash-staging'); assert.equal(eas.build.staging.env.APP_VARIANT, 'staging');
  assert.equal(eas.build.development.env.APP_VARIANT, 'development'); assert.equal(eas.build.production.env.APP_VARIANT, 'production');
});

function actualClient(variant, applicationId, url, isDev = true) {
  const calls = [];
  const imports = {
    'react-native-url-polyfill/auto': {},
    'expo-constants': { expoConfig: { extra: { appVariant: variant } } },
    'expo-application': { applicationId },
    '../config/backend-origins.json': origins,
    '../utils/backendPolicy': policy,
    '@react-native-async-storage/async-storage': {},
    'react-native': { AppState: { addEventListener() {} } },
    '@supabase/supabase-js': { createClient(...args) { calls.push(args); return {}; } },
    '../utils/supabaseEnv': { isLocalSupabaseUrl: () => false },
    './logger': { logger: { warn() {}, error() {} } },
  };
  const module = load('services/supabaseClient.ts', imports, { EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'controlled-public-key' }, { __DEV__: isDev });
  return { module, calls };
}
test('actual staging client checks approved backend and uses project-scoped session', () => {
  const result = actualClient('staging', 'com.clash.v2.staging', origins.staging[0]);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0][0], origins.staging[0]);
  assert.equal(result.calls[0][2].auth.storageKey, policy.backendStorageKey(origins.staging[0]));
});
test('actual staging client refuses production backend even in a dev bundle', () => {
  assert.throws(() => actualClient('staging', 'com.clash.v2.staging', origins.production[0]));
});
test('actual production client refuses staging backend and variant substitution', () => {
  assert.throws(() => actualClient('production', 'com.clash.v2', origins.staging[0]));
  assert.throws(() => actualClient('development', 'com.clash.v2', origins.production[0]));
  assert.throws(() => actualClient('production', 'com.clash.v2.staging', origins.production[0]));
});
test('actual client never connects when config is missing', () => {
  const result = actualClient('staging', 'com.clash.v2.staging', '');
  assert.equal(result.module.supabase, null); assert.equal(result.calls.length, 0);
});
