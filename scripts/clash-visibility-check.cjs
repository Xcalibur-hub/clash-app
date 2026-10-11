// Actual services/screens with controlled dependencies; no DB or native access.
const fs = require('node:fs'), Module = require('node:module');
const assert = require('node:assert/strict'), { test } = require('node:test');
const babel = require('@babel/core'), React = require('react');
for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (mod, filename) => mod._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), {
  filename, babelrc: false, configFile: false,
  presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, filename);
const noop = () => {};
const defer = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
class ServiceError extends Error { constructor(message, code) { super(message); this.code = code; } }
let response = { data: null, error: null }, calls = [];
const client = {
  from(table) { const call = { table }; calls.push(call); const q = {
    select(fields) { call.fields = fields; return q; }, eq() { return q; }, order() { return q; }, limit() { return q; },
    async maybeSingle() { return response; },
  }; return q; },
  async rpc(name) { calls.push({ rpc: name }); return response; },
};
let mode = null, account = 'a', routeId = 'take', cells = [], index = 0, effects = [], focus, screenView, historyResult, notificationResult, destinationResult, navigation = [];
const dispatch = noop, refreshUnread = noop;
const hooks = { ...React,
  useState(value) { const i = index++; if (!(i in cells)) cells[i] = value; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
  useRef(value) { const i = index++; if (!(i in cells)) cells[i] = { current: value }; return cells[i]; },
  useCallback(fn, deps) { const i = index++, old = cells[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) cells[i] = { fn, deps }; return cells[i].fn; },
  useMemo: fn => fn(),
  useEffect(fn, deps) { const i = index++, old = cells[i]; if (!old || !deps || deps.some((d, j) => d !== old.deps?.[j])) effects.push(() => { old?.cleanup?.(); cells[i] = { deps, cleanup: fn() }; }); },
};
const state = { viewer: { id: 'pa' }, takes: [] };
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', FlatList: 'FlatList', ActivityIndicator: 'Spinner', RefreshControl: 'RefreshControl', Share: {}, StyleSheet: { create: x => x, hairlineWidth: 1 } };
const auth = () => ({ user: account ? { id: account } : null, signedIn: !!account, loading: false });
const originalLoad = Module._load;
Module._load = function(request, parent) {
  const file = parent.filename.replaceAll('\\', '/');
  if (file.endsWith('/services/clashEngineService.ts') || file.endsWith('/services/profileService.ts')) {
    if (request === './supabaseClient') return { requireSupabase: () => client, requestError: e => new ServiceError(e.message, e.code), SupabaseError: ServiceError };
    if (request === './apiService') return {};
    if (request === './arenaMappers') return {};
  }
  const controlled = mode && (file.endsWith('/app/clash/[takeId].tsx') || file.endsWith('/components/profile/ProfileScreen.tsx') || file.endsWith('/app/(tabs)/notifications.tsx') || file.endsWith('/hooks/useOperationScope.ts'));
  if (controlled) {
    if (request === 'react') return hooks;
    if (request === 'react-native') return native;
    if (request === 'expo-router') return { useLocalSearchParams: () => ({ takeId: routeId }), useRouter: () => ({ push: path => navigation.push(path), replace: path => navigation.push(path), canGoBack: () => false, back: noop }), useFocusEffect: fn => { focusCallbacks.push(fn); }, Redirect: 'Redirect' };
    if (request === 'expo-linear-gradient') return { LinearGradient: 'Gradient' };
    if (request === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (request.endsWith('/store/AuthProvider')) return { useAuth: auth };
    if (request.endsWith('/store/NotificationUnreadProvider')) return { useNotificationUnread: () => ({ refresh: refreshUnread }) };
    if (request === '../../store') return { useClash: () => ({ state, dispatch }), selectCommentsForTake: () => [], selectAuthor: noop, showNotice: x => x };
    if (request.endsWith('/services/clashEngineService')) return { fetchClashViewForTake: () => screenView, fetchReputationEvents: async () => [], fetchClashById: () => destinationResult, settleClash: noop, submitJudgement: noop };
    if (request.endsWith('/services/profileService')) return { fetchProfileById: async () => ({ id: routeId, name: 'Profile', handle: 'profile' }), fetchProfileClashes: () => historyResult, fetchProfileTakes: async () => [], fetchProfileReplies: async () => [] };
    if (request.endsWith('/services/apiService')) return { currentViewerProfileId: async () => null, fetchProfilesByIds: async () => [] };
    if (request.endsWith('/services/socialService')) return { fetchFollowState: async () => ({ following: false, followerCount: 0, followingCount: 0 }) };
    if (request.endsWith('/services/safetyService')) return { fetchViewerSafetyState: async () => ({ blockedProfileIds: [] }) };
    if (request.endsWith('/services/vaultService')) return { fetchVault: async () => null };
    if (request.endsWith('/services/arenaGameService')) return { fetchMyArenaReputation: async () => null };
    if (request.endsWith('/services/notificationService')) return { fetchNotifications: () => notificationResult, markNotificationRead: async () => {}, markAllNotificationsRead: async () => {} };
    if (request.endsWith('/services/supabaseClient')) return { errorText: e => e.message, SupabaseError: ServiceError };
    if (request.endsWith('/services/analytics')) return { analytics: { track: noop, trackOnce: noop } };
    if (request.endsWith('/hooks/useClock')) return { useClock: () => 0 };
    if (request.endsWith('/hooks/useRequireAuth')) return { useRequireAuth: () => () => !!account };
    if (request.endsWith('/utils/haptics')) return { tap: noop, judge: noop };
    if (request.endsWith('/theme')) return { layout: {}, radius: {}, space: {}, typeScale: {}, useThemeColors: () => ({}) };
    if (request.endsWith('/ClashCountdown')) return { ClashCountdown: 'ClashCountdown', countdownUrgency: () => 'calm' };
    if (request.endsWith('/dockConfig')) return { dockBottomPadding: () => 0 };
    if (request.includes('/shared/') || request.includes('/components/') || request.startsWith('./') || request === '../arena/PostActionsSheet') {
      // Keep the scope hook real; other child components are inert element types.
      if (!request.endsWith('/useOperationScope')) return new Proxy({}, { get: (_t, name) => String(name) });
    }
  }
  return originalLoad.apply(this, arguments);
};
const engine = require('../services/clashEngineService.ts');
const profileService = require('../services/profileService.ts');
const clash = { id: 'cl', take_id: 'take', mode: 'STANDARD', status: 'settled', opens_at: '2026-10-10T00:00:00Z', closes_at: '2026-10-10T01:00:00Z', created_at: '2026-10-10T00:00:00Z', settled_at: '2026-10-10T01:00:01Z' };
const verdict = { clash_id: 'cl', winner_side: 'DRAW', side_a_score: 2, side_b_score: 2, jury_size: 4, agreement: .5, margin: 0, verdict_label: 'DRAW' };
for (const name of ['fetchVerdict', 'fetchClashById', 'fetchClashView', 'fetchClashViewForTake', 'fetchClashForTake']) {
  test(`${name}: denied rows return null`, async () => { response = { data: null, error: null }; assert.equal(await engine[name]('known-id'), null); });
  test(`${name}: privilege denial returns unavailable`, async () => { response = { data: null, error: { code: '42501', message: 'denied' } }; assert.equal(await engine[name]('known-id'), null); });
}
test('readable DRAW verdict retains authoritative fields and explicit projection', async () => {
  calls = []; response = { data: verdict, error: null }; assert.equal((await engine.fetchVerdict('cl')).winnerSide, 'DRAW'); assert.ok(!calls[0].fields.includes('*'));
});
test('safe Clash projection preserves legacy metadata without identities', async () => {
  calls = []; response = { data: clash, error: null }; const result = await engine.fetchClashForTake('take');
  assert.equal(result.takeId, 'take'); assert.equal(result.challengerId, ''); assert.equal(result.challengerCommentId, null); assert.ok(!calls[0].fields.includes('*'));
});
test('unexpected read failures propagate instead of manufacturing a result', async () => {
  response = { data: null, error: { code: 'NETWORK', message: 'offline' } }; await assert.rejects(engine.fetchVerdict('cl'), { code: 'NETWORK' });
});
test('profile history denial returns an empty list', async () => {
  response = { data: null, error: { code: '42501', message: 'denied' } }; assert.deepEqual(await profileService.fetchProfileClashes('profile'), []);
});
test('profile history does not infer a verdict from settled status alone', async () => {
  response = { error: null, data: [{ clashId: 'cl', takeId: 'take', status: 'settled', createdAt: clash.created_at, closesAt: clash.closes_at, takeText: 'Visible', opponentId: null, outcome: null, verdict: null }] };
  assert.equal((await profileService.fetchProfileClashes('profile'))[0].verdict, null);
});

let Component, props, focusCallbacks = [];
function render() { index = 0; focusCallbacks = []; const tree = Component(props); const callbacks = focusCallbacks; focus = () => { const cleanups = callbacks.map(fn => fn()); return () => cleanups.forEach(fn => fn?.()); }; const pending = effects; effects = []; pending.forEach(fn => fn()); return tree; }
function find(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type || node.type?.name === type) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type); if (found) return found; }
  return null;
}
function start(kind) {
  for (const cell of cells) cell?.cleanup?.();
  mode = kind; cells = []; index = 0; effects = []; account = 'a'; routeId = 'take'; navigation = [];
  if (kind === 'clash') { Component = require('../app/clash/[takeId].tsx').default; props = {}; }
  if (kind === 'profile') { Component = require('../components/profile/ProfileScreen.tsx').ProfileScreen; props = { profileId: 'profile' }; }
  if (kind === 'notifications') { const tab = require('../app/(tabs)/notifications.tsx').default(); Component = tab.type; props = {}; }
  return render();
}
function enter() { const original = global.setInterval; global.setInterval = () => 0; try { return focus(); } finally { global.setInterval = original; } }
const view = { clashId: 'cl', battleMode: 'LEGACY', roomId: null, status: 'settled', mode: 'STANDARD', closesAt: 0, revealed: true, verdict: { winnerSide: 'DRAW' }, sideA: null, sideB: null, sideAText: 'Source', sideBText: 'Counter' };
test('Clash screen drops a cached result when revalidation returns null', async () => {
  screenView = Promise.resolve(view); start('clash'); let cleanup = enter(); await flush(); assert.ok(find(render(), 'ClashMatchup'));
  cleanup(); screenView = Promise.resolve(null); cleanup = enter(); await flush(); assert.equal(find(render(), 'ClashMatchup'), null); assert.ok(find(render(), 'EmptyState')); cleanup();
});
test('Clash screen clears previous readable result on a current read error', async () => {
  screenView = Promise.resolve(view); start('clash'); const cleanup = enter(); await flush(); assert.ok(find(render(), 'VerdictReveal'));
  screenView = Promise.reject(new ServiceError('offline', 'NETWORK')); enter(); await flush(); assert.equal(find(render(), 'VerdictReveal'), null); cleanup();
});
test('late readable Clash response cannot overwrite a newer denied response', async () => {
  const old = defer(); screenView = old.promise; start('clash'); const cleanup = enter(); await flush(); screenView = Promise.resolve(null); enter(); await flush(); old.resolve(view); await flush(); assert.equal(find(render(), 'ClashMatchup'), null); cleanup();
});
test('account change masks cached Clash and rejects prior-account response', async () => {
  screenView = Promise.resolve(view); start('clash'); const cleanup = enter(); await flush(); assert.ok(find(render(), 'ClashMatchup'));
  const old = defer(); screenView = old.promise; enter(); await flush(); account = 'b'; assert.equal(find(render(), 'ClashMatchup'), null); old.resolve(view); await flush(); assert.equal(find(render(), 'ClashMatchup'), null); cleanup();
});
const history = [{ clash: { id: 'cl', takeId: 'take' }, opponentId: null, verdict: null }];
async function openHistory() { historyResult = Promise.resolve(history); start('profile'); enter(); await flush(); find(render(), 'SegmentedTabs').props.onChange('clashes'); render(); const cleanup = enter(); await flush(); return cleanup; }
test('profile refocus revalidates previously cached history and removes denied rows', async () => {
  let cleanup = await openHistory(); assert.equal(find(render(), 'ClashesList').props.clashes.length, 1);
  cleanup(); const denied = defer(); historyResult = denied.promise; cleanup = enter(); assert.equal(find(render(), 'ClashesList')?.props.clashes ?? null, null);
  denied.resolve([]); await flush(); assert.deepEqual(find(render(), 'ClashesList').props.clashes, []); cleanup();
});
test('late history cannot overwrite a newer empty response', async () => {
  let cleanup = await openHistory(); cleanup(); const old = defer(); historyResult = old.promise; cleanup = enter(); await flush();
  historyResult = Promise.resolve([]); enter(); await flush(); old.resolve(history); await flush(); assert.deepEqual(find(render(), 'ClashesList').props.clashes, []); cleanup();
});
test('profile history is masked on account switch including A to B to A', async () => {
  const cleanup = await openHistory(); account = 'b'; assert.equal(find(render(), 'ClashesList')?.props.clashes ?? null, null);
  account = 'a'; assert.equal(find(render(), 'ClashesList')?.props.clashes ?? null, null); cleanup();
});
const item = { id: 'n', kind: 'clash_result', entityId: 'cl', actorId: null, readAt: 1 };
async function pressNotification() { notificationResult = Promise.resolve([item]); start('notifications'); enter(); await flush(); const row = find(render(), 'FlatList').props.renderItem({ item }); row.props.onPress(); await flush(); }
test('denied Clash notification routes safely to profile, never cached Take ID', async () => {
  destinationResult = Promise.resolve(null); await pressNotification(); assert.deepEqual(navigation, ['/(tabs)/profile']);
});
test('readable legacy Clash notification retains original destination', async () => {
  destinationResult = Promise.resolve({ takeId: 'take' }); await pressNotification(); assert.deepEqual(navigation, ['/clash/take']);
});
test('late notification result cannot navigate after account switch', async () => {
  const old = defer(); destinationResult = old.promise; await pressNotification(); account = 'b'; render(); old.resolve({ takeId: 'hidden' }); await flush(); assert.deepEqual(navigation, []);
});
test('notification inbox remounts under a different account key', () => {
  const Tab = require('../app/(tabs)/notifications.tsx').default; account = 'a'; const before = Tab().key; account = 'b'; assert.notEqual(Tab().key, before);
});
