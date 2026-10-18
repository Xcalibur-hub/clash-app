// Controlled rendering of the actual Take route. No network or native-pass claim.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const babel = require('@babel/core');
const React = require('react');
for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (m, f) => m._compile(babel.transformSync(fs.readFileSync(f, 'utf8'), {
  filename: f, babelrc: false, configFile: false,
  presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, f);
let cells = [], index = 0, effects = [], uid = 'a', now = 100, request, events = [], canBack = true;
const hooks = { ...React,
  useState(v) { const i = index++; if (!(i in cells)) cells[i] = typeof v === 'function' ? v() : v; return [cells[i], n => { cells[i] = typeof n === 'function' ? n(cells[i]) : n; }]; },
  useRef(v) { const i = index++; if (!(i in cells)) cells[i] = { current: v }; return cells[i]; },
  useCallback(f, deps) { const i = index++, old = cells[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) cells[i] = { deps, callback: f }; return cells[i].callback; },
  useEffect(f, deps) { const i = index++, old = cells[i]; if (!old || !deps || deps.some((d, j) => d !== old.deps?.[j])) effects.push(() => { old?.cleanup?.(); cells[i] = { deps, cleanup: f() }; }); },
};
const author = { id: 'a', name: 'Author', handle: 'author' };
const take = { id: 'take', authorId: 'a', text: 'A real discussion contract', hood: 'techtakes', createdAt: 0, expiresAt: 200, reactions: 2 };
const state = { takes: [take], viewer: author, comments: [], users: [author], upvotedCommentIds: [] };
const dispatch = e => events.push(e);
const router = { canGoBack: () => canBack, back: () => events.push('back'), replace: p => events.push(p), push: p => events.push(p) };
let pendingFetch;
const original = Module._load;
Module._load = function (r, parent) {
  const own = parent && !parent.filename.includes('node_modules');
  if (own && r === 'react') return hooks;
  if (r === 'react-native') return { FlatList: 'List', KeyboardAvoidingView: 'Keyboard', Pressable: 'Button', View: 'View', Text: 'Text', ActivityIndicator: 'Spinner', Platform: { OS: 'android' }, StyleSheet: { create: s => s }, Share: { share() {} } };
  if (r === 'expo-constants') return { expoConfig: { extra: { appVariant: 'development' } } };
  if (r === 'expo-router') return { useFocusEffect: f => hooks.useEffect(f, [f]), useRouter: () => router, useLocalSearchParams: () => ({ takeId: 'take' }) };
  if (r === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) };
  if (own && r.endsWith('/AuthProvider')) return { useAuth: () => ({ user: { id: uid }, signedIn: true }) };
  if (own && r === '../../store') return { useClash: () => ({ state, dispatch }), selectAuthor: () => author, selectCommentsForTake: () => [], buildCommentTree: () => [], selectIsSaved: () => false, selectHasReacted: () => false };
  if (own && r.endsWith('/theme')) return { useThemeColors: () => ({}), layout: { screenX: 16 }, space: { xs: 4, sm: 8, md: 16, lg: 24 }, typeScale: {} };
  if (own && r.endsWith('/useClock')) return { useClock: () => now };
  if (own && r.endsWith('/useKeyboardVisible')) return { useKeyboardVisible: () => true };
  if (own && r.endsWith('/useRequireAuth')) return { useRequireAuth: () => () => true };
  if (own && r.endsWith('/useTakeReaction')) return { useTakeReaction: () => () => events.push('reaction') };
  if (own && r.endsWith('/supabaseClient')) return { isSupabaseConfigured: false, isLocalSupabase: true, errorText: e => e.message };
  if (own && r.endsWith('/apiService')) return { fetchTakeById: () => { request++; return pendingFetch; }, fetchProfilesByIds: async () => [author] };
  if (own && r.endsWith('/analytics')) return { analytics: { trackOnce() {} } };
  if (own && r.endsWith('/socialService')) return { fetchFollowState: async () => ({ following: false }) };
  if (own && r.endsWith('/haptics')) return { tap() {}, press() {} };
  if (own && /\/components\//.test(r)) return new Proxy({}, { get: (_, k) => k === '__esModule' ? false : k });
  if (own && /\/services\//.test(r)) return {};
  return original.apply(this, arguments);
};
const Screen = require('../app/take/[takeId].tsx').default;
const nodes = v => !v || typeof v !== 'object' ? [] : [v, ...React.Children.toArray(v.props?.children).flatMap(nodes), ...nodes(v.props?.ListHeaderComponent), ...nodes(v.props?.ListFooterComponent), ...nodes(v.props?.ListEmptyComponent)];
const render = () => { index = 0; const tree = Screen(); const run = effects; effects = []; run.forEach(f => f()); return tree; };
const find = (tree, type) => nodes(tree).find(n => n.type === type);
function reset() { for (const c of cells) c?.cleanup?.(); cells = []; effects = []; uid = 'a'; now = 100; request = 0; events = []; canBack = true; pendingFetch = new Promise(() => {}); state.takes = [take]; }
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('active Take retains voting, composer and challenge contracts; reply action focuses composer', () => {
  reset(); let tree = render();
  assert.equal(find(tree, 'TakeActionRow').props.readOnly, false);
  assert.equal(find(tree, 'TakeChallenges').props.readOnly, false);
  find(tree, 'TakeActionRow').props.onComment(); tree = render();
  assert.equal(find(tree, 'RebuttalInput').props.focusRequest, 1);
  assert.equal(find(tree, 'Keyboard').props.behavior, 'padding');
});

test('expiry tick closes reply/challenge/reaction UI while preserving historical navigation', () => {
  reset(); render(); now = 200; const tree = render();
  assert.equal(find(tree, 'RebuttalInput'), undefined);
  const actions = find(tree, 'TakeActionRow').props;
  assert.equal(actions.readOnly, true); actions.onReact(); assert.equal(events.includes('reaction'), false);
  actions.onClash(); assert.ok(events.includes('/clash/take'));
  assert.equal(find(tree, 'TakeChallenges').props.readOnly, true);
  assert.ok(nodes(tree).some(n => n.props?.children === 'Archived discussion'));
});

test('Back uses native history, with a tabs fallback only for a direct entry', () => {
  reset(); let tree = render(); nodes(tree).find(n => n.props?.accessibilityLabel === 'Back').props.onPress();
  assert.deepEqual(events, ['back']); canBack = false; events = []; tree = render();
  nodes(tree).find(n => n.props?.accessibilityLabel === 'Back').props.onPress(); assert.deepEqual(events, ['/(tabs)']);
});

test('pending archived fetch is loading, then renders readable archive instead of a false expiry error', async () => {
  reset(); state.takes = []; let resolve; pendingFetch = new Promise(r => { resolve = r; });
  let tree = render(); assert.ok(find(tree, 'Spinner')); assert.equal(find(tree, 'EmptyState'), undefined);
  resolve({ ...take, expiresAt: 50 }); await flush(); tree = render();
  assert.equal(find(tree, 'EmptyState'), undefined); assert.equal(find(tree, 'TakeActionRow').props.readOnly, true);
});

test('network error has retry; null response is unavailable rather than expired', async () => {
  reset(); state.takes = []; pendingFetch = Promise.reject(Error('offline')); render(); await flush(); let tree = render();
  assert.equal(find(tree, 'EmptyState').props.actionLabel, 'RETRY');
  pendingFetch = Promise.resolve(null); find(tree, 'EmptyState').props.onAction(); render(); await flush(); tree = render();
  assert.equal(request, 2); assert.equal(find(tree, 'EmptyState').props.title, 'Take unavailable');
});

test('account change rejects the prior account’s late archived response', async () => {
  reset(); state.takes = []; let resolve; pendingFetch = new Promise(r => { resolve = r; }); render();
  uid = 'b'; pendingFetch = new Promise(() => {}); render(); resolve(take); await flush();
  const tree = render(); assert.ok(find(tree, 'Spinner')); assert.equal(find(tree, 'TakeActionRow'), undefined);
});
