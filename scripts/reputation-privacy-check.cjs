// Controlled execution of the actual service and screen. No DB/native access.
const fs = require('node:fs');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const babel = require('@babel/core');
const React = require('react');
for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (mod, filename) => {
  mod._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code, filename);
};
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
class ServiceError extends Error { constructor(message, code) { super(message); this.code = code; } }
let uid = 'a', profile = 'pa', listeners = new Set(), queries = [], result, profileWait;
const event = (name, next) => { uid = next; for (const fn of listeners) fn(name, next ? { user: { id: next } } : null); };
const client = {
  auth: {
    onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe() { listeners.delete(fn); } } } }; },
    async getSession() { return { data: { session: uid ? { user: { id: uid } } : null } }; },
  },
  from(table) {
    const q = { table }; queries.push(q);
    const chain = { select(columns) { q.columns = columns; return this; }, eq(column, value) { q[column] = value; return this; },
      order(column, options) { q.order = [column, options]; return this; }, limit(value) { q.limit = value; return result; } };
    return chain;
  },
};
const row = { id: 'event-a', profile_id: 'pa', clash_id: 'cl', kind: 'clash_win', reputation_delta: 105, coins_delta: 40, created_at: '2026-10-11T00:00:00Z' };
let screen = false, account = 'a', takeId = 'take', focus, cells = [], index = 0, screenEvents, screenView;
const hooks = { ...React,
  useState(value) { const i = index++; if (!(i in cells)) cells[i] = value; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
  useRef(value) { const i = index++; if (!(i in cells)) cells[i] = { current: value }; return cells[i]; },
  useMemo: fn => fn(),
  useCallback(fn, deps) {
    const i = index++, old = cells[i];
    if (!old || deps.some((d, j) => d !== old.deps[j])) cells[i] = { deps, fn };
    return cells[i].fn;
  }, useEffect() {},
};
const noop = () => {};
const originalLoad = Module._load;
Module._load = function(request, parent) {
  if (screen && parent.filename.endsWith('useOperationScope.ts') && request === 'react') return hooks;
  if (parent.filename.endsWith('clashEngineService.ts')) {
    if (request === './apiService') return { currentViewerProfileId: async () => profileWait ? await profileWait : profile };
    if (request === './supabaseClient') return { requireSupabase: () => client, requestError: e => new ServiceError(e.message, e.code), SupabaseError: ServiceError };
  }
  if (screen && parent.filename.replaceAll('\\', '/').endsWith('/app/clash/[takeId].tsx')) {
    if (request === 'react') return hooks;
    if (request === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Share: {}, StyleSheet: { create: s => s, hairlineWidth: 1 } };
    if (request === 'expo-router') return { useLocalSearchParams: () => ({ takeId }), useRouter: () => ({}), useFocusEffect: fn => { focus = fn; }, Redirect: 'Redirect' };
    if (request === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
    if (request === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (request.endsWith('/store/AuthProvider')) return { useAuth: () => ({ signedIn: !!account, user: account ? { id: account } : null }) };
    if (request === '../../store') return { useClash: () => ({ state: { takes: [] }, dispatch: noop }), selectCommentsForTake: () => [], selectAuthor: noop, showNotice: noop };
    if (request.endsWith('/services/clashEngineService')) return { fetchClashViewForTake: async () => screenView, fetchReputationEvents: () => screenEvents, settleClash: noop, submitJudgement: noop };
    if (request.endsWith('/services/apiService')) return { currentViewerProfileId: async () => account ? `p${account}` : null };
    if (request.endsWith('/services/supabaseClient')) return { errorText: e => e.message, SupabaseError: ServiceError };
    if (request.endsWith('/services/analytics')) return { analytics: { track: noop } };
    if (request.endsWith('/hooks/useClock')) return { useClock: () => 0 };
    if (request.endsWith('/hooks/useRequireAuth')) return { useRequireAuth: () => () => !!account };
    if (request.endsWith('/utils/haptics')) return { tap: noop, judge: noop };
    if (request === '../../theme') return { layout: {}, radius: {}, space: {}, typeScale: {}, useThemeColors: () => ({}) };
    if (request.endsWith('/ClashCountdown')) return { ClashCountdown: 'ClashCountdown', countdownUrgency: () => 'calm' };
    if (request.includes('/components/')) return new Proxy({}, { get: (_target, name) => String(name) });
  }
  return originalLoad.apply(this, arguments);
};
const { fetchReputationEvents } = require('../services/clashEngineService.ts');
function reset() { assert.equal(listeners.size, 0); uid = 'a'; profile = 'pa'; queries = []; profileWait = null; result = Promise.resolve({ data: [row], error: null }); }

test('own history retains fields and uses an explicit private projection', async () => {
  reset(); const rows = await fetchReputationEvents('pa');
  assert.deepEqual(rows, [{ id: row.id, profileId: 'pa', clashId: 'cl', kind: 'clash_win', reputationDelta: 105, coinsDelta: 40, createdAt: Date.parse(row.created_at) }]);
  assert.equal(queries[0].columns, 'id, profile_id, clash_id, kind, reputation_delta, coins_delta, created_at');
  assert.equal(queries[0].profile_id, 'pa'); assert.equal(queries[0].limit, 100); assert.equal(listeners.size, 0);
});
test('foreign profile never queries another history', async () => { reset(); assert.deepEqual(await fetchReputationEvents('pb'), []); assert.equal(queries.length, 0); });
test('guest never requests raw history', async () => { reset(); uid = null; assert.deepEqual(await fetchReputationEvents('pa'), []); assert.equal(queries.length, 0); });
for (const scenario of ['logout', 'switch', 'away-and-back', 'other-event-switch', 'token-refresh']) test(`pending history: ${scenario}`, async () => {
  reset(); const pending = defer(); result = pending.promise; const request = fetchReputationEvents('pa'); await flush();
  if (scenario === 'logout') event('SIGNED_OUT', null);
  if (scenario === 'switch') event('SIGNED_IN', 'b');
  if (scenario === 'away-and-back') { event('SIGNED_OUT', null); event('SIGNED_IN', 'a'); }
  if (scenario === 'other-event-switch') event('PASSWORD_RECOVERY', 'b');
  if (scenario === 'token-refresh') event('TOKEN_REFRESHED', 'a');
  pending.resolve({ data: [row], error: null });
  assert.equal((await request).length, scenario === 'token-refresh' ? 1 : 0); assert.equal(listeners.size, 0);
});
test('logout while resolving own profile cancels before SELECT', async () => {
  reset(); const pending = defer(); profileWait = pending.promise; const request = fetchReputationEvents('pa'); await flush();
  event('SIGNED_OUT', null); pending.resolve('pa'); assert.deepEqual(await request, []); assert.equal(queries.length, 0);
});
test('final session check rejects a different account even without an auth event', async () => {
  reset(); const pending = defer(); result = pending.promise; const request = fetchReputationEvents('pa'); await flush(); uid = 'b';
  pending.resolve({ data: [row], error: null }); assert.deepEqual(await request, []);
});
test('malformed foreign-owner rows are discarded defensively', async () => {
  reset(); result = Promise.resolve({ data: [{ ...row, profile_id: 'pb' }], error: null }); assert.deepEqual(await fetchReputationEvents('pa'), []);
});
test('current-account errors propagate and release subscription', async () => {
  reset(); result = Promise.resolve({ data: null, error: { code: '42501', message: 'denied' } });
  await assert.rejects(fetchReputationEvents('pa'), { code: '42501' }); assert.equal(listeners.size, 0);
});
test('revoked-session error cannot repopulate history', async () => {
  reset(); const pending = defer(); result = pending.promise; const request = fetchReputationEvents('pa'); await flush(); event('SIGNED_OUT', null);
  pending.resolve({ data: null, error: { code: '42501', message: 'denied' } }); assert.deepEqual(await request, []);
});

// Execute the actual legacy screen with controlled hooks, including render-time
// masking (before effects) and async request races. Child/native components are
// inert element types; these tests do not assert physical rendering.
const view = { clashId: 'cl', battleMode: 'LEGACY', roomId: null, status: 'settled', mode: 'STANDARD', closesAt: 0, myBallot: 'A', revealed: true, verdict: { winnerSide: 'A' }, sideA: null, sideB: null };
let Screen;
const render = () => { index = 0; return Screen(); };
function find(element, type) {
  if (!element || typeof element !== 'object') return null;
  if (element.type === type) return element;
  for (const child of [element.props?.children].flat(Infinity)) { const found = find(child, type); if (found) return found; }
  return null;
}
function startScreen() {
  screen = true; account = 'a'; takeId = 'take'; cells = []; screenView = { ...view };
  screenEvents = Promise.resolve([{ clashId: 'cl', reputationDelta: 120, coinsDelta: 40 }]);
  Screen ??= require('../app/clash/[takeId].tsx').default;
  render();
  const interval = global.setInterval; global.setInterval = () => 0;
  const cleanup = focus(); global.setInterval = interval; return cleanup;
}
function rewards() { return find(render(), 'VerdictReveal')?.props; }

test('screen preserves legitimate own reward display', async () => {
  const cleanup = startScreen(); await flush(); assert.equal(rewards().reputationDelta, 120); assert.equal(rewards().coinsDelta, 40); cleanup();
});
test('screen immediately masks history on switch and on return to old identity', async () => {
  const cleanup = startScreen(); await flush(); account = 'b'; assert.equal(find(render(), 'VerdictReveal'), null); assert.equal(rewards()?.reputationDelta ?? 0, 0);
  account = 'a'; assert.equal(find(render(), 'VerdictReveal'), null); assert.equal(rewards()?.reputationDelta ?? 0, 0); cleanup();
});
for (const scenario of ['logout', 'switch', 'blur', 'take-change']) test(`screen rejects late reward response after ${scenario}`, async () => {
  const cleanup = startScreen(); await flush(); const pending = defer(); screenEvents = pending.promise;
  const interval = global.setInterval; global.setInterval = () => 0; const stop = focus(); global.setInterval = interval; await flush();
  if (scenario === 'logout') { account = null; render(); }
  if (scenario === 'switch') { account = 'b'; render(); }
  if (scenario === 'blur') stop();
  if (scenario === 'take-change') { takeId = 'other'; render(); }
  pending.resolve([{ clashId: 'cl', reputationDelta: 999, coinsDelta: 999 }]); await flush();
  assert.equal(rewards()?.reputationDelta ?? 0, 0); cleanup(); stop();
});
