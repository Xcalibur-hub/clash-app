// Actual entry components and service with controlled reads/RPCs. No database writes.
const { test, after } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module'), babel = require('@babel/core'), React = require('react');
for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (m, f) => m._compile(babel.transformSync(fs.readFileSync(f, 'utf8'), {
  filename: f, babelrc: false, configFile: false, presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]], plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, f);
let cells = [], index = 0, effects = [], clock, uid, fresh, clash, routes, notices, rpcCalls, startCalls, fetchImpl, listeners;
const realNow = Date.now; Date.now = () => clock;
const hooks = { ...React,
  useState(v) { const i = index++; if (!(i in cells)) cells[i] = typeof v === 'function' ? v() : v; return [cells[i], n => { cells[i] = typeof n === 'function' ? n(cells[i]) : n; }]; },
  useRef(v) { const i = index++; if (!(i in cells)) cells[i] = { current: v }; return cells[i]; },
  useCallback(f, deps) { const i = index++, old = cells[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) cells[i] = { deps, fn: f }; return cells[i].fn; },
  useMemo(f) { return f(); },
  useEffect(f, deps) { const i = index++, old = cells[i]; if (!old || !deps || deps.some((d, j) => d !== old.deps?.[j])) effects.push(() => { old?.cleanup?.(); cells[i] = { deps, cleanup: f() }; }); },
};
const base = { id: 'take', authorId: 'owner', text: 'An isolated test Take', hood: 'techtakes', createdAt: 0, expiresAt: 9e6, status: 'active', reactions: 0, clashes: 0 };
const owner = { id: 'owner', name: 'Owner', handle: 'owner' }, viewer = { id: 'viewer', name: 'Viewer' };
const state = { viewer, takes: [base], comments: [], upvotedCommentIds: [] };
const challenge = { id: 'challenge', takeId: 'take', challengerId: 'viewer', challengedId: 'owner', counterPosition: 'A valid counter-position for testing.', status: 'PENDING', createdAt: new Date(1000).toISOString(), expiresAt: new Date(5e6).toISOString(), resolvedAt: null, roomId: null, clashId: null, created: true, challenger: { id: 'viewer', name: 'Viewer', handle: 'viewer' } };
let history, rpcError;
class ApiError extends Error { constructor(message, code) { super(message); this.code = code; } }
const router = { push: p => routes.push(p), replace: p => routes.push(p), canGoBack: () => true, back() {} };
const dispatch = event => notices.push(event);
const original = Module._load;
Module._load = function (r, parent) {
  const own = parent && !parent.filename.includes('node_modules');
  if (own && r === 'react') return hooks;
  if (r === 'react-native') return { View: 'View', Text: 'Text', Modal: 'Modal', FlatList: 'List', Pressable: 'Button', TextInput: 'Input', KeyboardAvoidingView: 'Keyboard', ScrollView: 'Scroll', Image: 'Image', ActivityIndicator: 'Spinner', Platform: { OS: 'android' }, StyleSheet: { create: x => x }, AppState: { currentState: 'active', addEventListener: (_, fn) => { listeners.push(fn); return { remove() {} }; } }, Share: {} };
  if (r === 'react-native-reanimated') return { __esModule: true, default: { View: 'View' }, useReducedMotion: () => true };
  if (r === 'expo-router') return { useRouter: () => router, useFocusEffect: fn => hooks.useEffect(fn, [fn]), useLocalSearchParams: () => ({ takeId: 'take' }) };
  if (r === 'expo-constants') return { expoConfig: { extra: { appVariant: 'development' } } };
  if (r === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
  if (own && r.endsWith('/AuthProvider')) return { useAuth: () => ({ user: { id: uid }, signedIn: Boolean(uid) }) };
  if (own && r === '../../store') return { useClash: () => ({ state, dispatch }), selectAuthor: () => owner, selectCommentsForTake: () => [], buildCommentTree: () => [], selectIsSaved: () => false, selectHasReacted: () => false, showNotice: message => ({ message }) };
  if (own && r.endsWith('/theme')) return { useThemeColors: () => ({}), layout: { screenX: 16 }, space: {}, typeScale: {} };
  if (own && r.endsWith('/useClock')) return { useClock: () => clock };
  if (own && r.endsWith('/useKeyboardVisible')) return { useKeyboardVisible: () => false };
  if (own && r.endsWith('/useRequireAuth')) return { useRequireAuth: () => () => Boolean(uid) };
  if (own && r.endsWith('/useTakeReaction')) return { useTakeReaction: () => () => {} };
  if (own && r.endsWith('/supabaseClient')) return { isSupabaseConfigured: false, isLocalSupabase: true, SupabaseError: ApiError, errorText: e => e.message, requestError: e => new ApiError(e.message, e.code), currentUserId: async () => uid, requireSupabase: () => ({ rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: name === 'list_arena_challenges' ? history : challenge, error: name === 'create_arena_challenge' ? rpcError : null }; } }) };
  if (own && r.endsWith('/apiService')) return { fetchTakeById: async () => fetchImpl ? fetchImpl() : fresh, fetchProfilesByIds: async () => [owner] };
  if (own && r.endsWith('/clashEngineService')) return { fetchClashViewForTake: async () => clash, startClash: async () => { startCalls++; return 'legacy'; } };
  if (own && r.endsWith('/socialService')) return { fetchFollowState: async () => ({ following: false }) };
  if (own && r.endsWith('/analytics')) return { analytics: { track() {}, trackOnce() {} } };
  if (own && r.endsWith('/logger')) return { logger: { warn() {} } };
  if (own && r.endsWith('/haptics')) return { press() {}, tap() {} };
  if (own && !parent.filename.endsWith('take-challenge-check.test.cjs') && (r.includes('/components/') || r.startsWith('../shared/') || r.startsWith('./FullScreen') || r.startsWith('./ClashConfirmed') || r.startsWith('./TakeStory') || r.startsWith('./QuestionVote'))) return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key });
  return original.apply(this, arguments);
};
const service = require('../services/arenaChallengeService.ts');
const { ChallengeTakeButton, TakeChallenges } = require('../components/arena/TakeChallenges.tsx');
const { TakeFeedItem } = require('../components/arena/TakeFeedItem.tsx');
const Detail = require('../app/take/[takeId].tsx').default;
const nodes = v => !v || typeof v !== 'object' ? [] : [v, ...React.Children.toArray(v.props?.children).flatMap(nodes), ...nodes(v.props?.ListHeaderComponent)];
const node = (tree, type) => nodes(tree).find(n => n.type === type);
const text = tree => nodes(tree).filter(n => n.type === 'Text').map(n => n.props.children).flat().join(' ');
const button = (tree, label) => { const n = nodes(tree).find(n => n.props?.onPress && (n.props.accessibilityLabel === label || text(n).trim() === label)); assert.ok(n, 'Missing ' + label); return n; };
const render = (component, props) => { index = 0; const tree = (typeof component === 'function' ? component : component.type)(props); const run = effects; effects = []; run.forEach(f => f()); return tree; };
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function reset() { for (const c of cells) c?.cleanup?.(); cells = []; effects = []; clock = 1000; uid = 'auth-viewer'; fresh = { ...base }; state.takes = [base]; clash = null; routes = []; notices = []; rpcCalls = []; startCalls = 0; history = []; rpcError = null; fetchImpl = null; listeners = []; }
after(() => { reset(); Date.now = realNow; });

for (const [label, change] of [
  ['expired', () => { fresh.expiresAt = clock; }],
  ['less than 30 minutes', () => { fresh.expiresAt = clock + 1800000; }],
  ['inactive despite future expiry', () => { fresh.status = 'expired'; }],
  ['runtime fixture', () => { fresh.isRuntimeFixture = true; }],
  ['revoked or blocked source', () => { fresh = null; }],
  ['active canonical duel', () => { clash = { status: 'open', battleMode: 'DUEL' }; }],
]) test(`fresh service veto: ${label}`, async () => {
  reset(); change(); await assert.rejects(service.createArenaChallenge('take', challenge.counterPosition), service.ChallengeEligibilityError);
  assert.equal(rpcCalls.filter(c => c.name === 'create_arena_challenge').length, 0);
});

test('eligible creation still calls actual RPC contract once', async () => {
  reset(); const result = await service.createArenaChallenge('take', challenge.counterPosition);
  assert.equal(result.id, 'challenge'); assert.equal(rpcCalls.length, 1);
  assert.deepEqual(rpcCalls[0], { name: 'create_arena_challenge', args: { p_take_id: 'take', p_counter_position: challenge.counterPosition } });
});
test('account switch during preflight never submits under another identity', async () => {
  reset(); fetchImpl = async () => { uid = 'different-account'; return fresh; };
  await assert.rejects(service.createArenaChallenge('take', challenge.counterPosition), e => e.code === 'account_changed');
  assert.equal(rpcCalls.length, 0);
});
test('ChallengeTakeButton rechecks stale ID-only callers before routing', async () => {
  reset(); fresh.expiresAt = clock; const tree = render(ChallengeTakeButton, { takeId: 'take' });
  await button(tree, 'Challenge this take').props.onPress(); await flush(); assert.deepEqual(routes, []); assert.ok(notices.length);
});
test('feed supplies real Take metadata and preserves historical detail/Clash links', () => {
  reset(); const expired = { ...base, expiresAt: clock }; state.takes = [expired]; const events = [];
  const tree = render(TakeFeedItem, { take: expired, author: owner, isViewer: false, onOpenDetail: () => events.push('detail'), onOpenClash: () => events.push('history') });
  const entry = nodes(tree).find(n => n.type === ChallengeTakeButton); assert.equal(entry.props.take, expired);
  assert.equal(button(tree, 'React to this take').props.disabled, true);
  button(tree, 'Clash on this take').props.onPress(); assert.deepEqual(events, ['history']);
});
test('cached expiry disables feed challenge entry without relying on parent readOnly', () => {
  reset(); const expired = { ...base, expiresAt: clock }; const tree = render(ChallengeTakeButton, { takeId: 'take', take: expired });
  assert.equal(button(tree, 'Challenge this take').props.disabled, true);
});
test('deep-link challenge=1 cannot open a composer for a freshly expired cached Take', async () => {
  reset(); fresh.expiresAt = clock; const props = { take: base, openComposer: true }; render(TakeChallenges, props); await flush();
  const tree = render(TakeChallenges, props); assert.equal(node(tree, 'Modal').props.visible, false); assert.match(text(tree), /archived/);
});
test('normal Take challenge entry performs fresh eligibility before opening', async () => {
  reset(); const props = { take: base, openComposer: false }; render(TakeChallenges, props); await flush(); let tree = render(TakeChallenges, props);
  fresh.expiresAt = clock + 1800000; await button(tree, '⚔ CHALLENGE').props.onPress(); await flush(); tree = render(TakeChallenges, props);
  assert.equal(node(tree, 'Modal').props.visible, false); assert.match(text(tree), /more than 30 minutes/);
});
test('deadline crosses while composer is open: modal closes and stale submit callback cannot send', async () => {
  reset(); fresh.expiresAt = clock + 1800001; const take = { ...fresh }, props = { take, openComposer: true };
  render(TakeChallenges, props); await flush(); let tree = render(TakeChallenges, props); assert.equal(node(tree, 'Modal').props.visible, true);
  node(tree, 'Input').props.onChangeText(challenge.counterPosition); tree = render(TakeChallenges, props); const send = button(tree, 'SEND CHALLENGE').props.onPress;
  clock++; send(); await flush(); tree = render(TakeChallenges, props); assert.equal(node(tree, 'Modal').props.visible, false);
  assert.equal(rpcCalls.filter(c => c.name === 'create_arena_challenge').length, 0);
});
test('server metadata changes while composing: submit refreshes and denies without a write', async () => {
  reset(); const props = { take: base, openComposer: true }; render(TakeChallenges, props); await flush(); let tree = render(TakeChallenges, props);
  node(tree, 'Input').props.onChangeText(challenge.counterPosition); tree = render(TakeChallenges, props); fresh = { ...fresh, status: 'expired' };
  button(tree, 'SEND CHALLENGE').props.onPress(); await flush(); tree = render(TakeChallenges, props); assert.equal(node(tree, 'Modal').props.visible, false);
  assert.equal(rpcCalls.filter(c => c.name === 'create_arena_challenge').length, 0);
});
test('historical accepted duel remains reachable when challenge creation closes', async () => {
  reset(); history = [{ ...challenge, status: 'ACCEPTED', clashId: 'clash', roomId: 'room', resolvedAt: new Date(2000).toISOString() }];
  const take = { ...base, expiresAt: clock }, props = { take, readOnly: true, openComposer: true }; render(TakeChallenges, props); await flush(); const tree = render(TakeChallenges, props);
  assert.equal(node(tree, 'Modal').props.visible, false); button(tree, 'OPEN DUEL').props.onPress(); assert.deepEqual(routes, ['/arena/room/room']);
});
test('legacy comment challenge preflights stale source before showing mode sheet', async () => {
  reset(); fresh = { ...base, expiresAt: clock }; const tree = render(Detail); const row = node(tree, 'List').props.renderItem({ item: { comment: { id: 'comment' }, children: [] } });
  await node(row, 'CommentBranch').props.onClash({ id: 'comment' }); await flush(); const updated = render(Detail);
  assert.equal(node(updated, 'ClashModeSheet').props.visible, false); assert.equal(startCalls, 0);
});
test('legacy sheet also refreshes before submitting, retaining its distinct timing contract', async () => {
  reset(); fresh.expiresAt = clock + 60000; let tree = render(Detail); const row = node(tree, 'List').props.renderItem({ item: { comment: { id: 'comment' }, children: [] } });
  await node(row, 'CommentBranch').props.onClash({ id: 'comment' }); await flush(); tree = render(Detail); const sheet = node(tree, 'ClashModeSheet'); assert.equal(sheet.props.visible, true);
  fresh = { ...fresh, status: 'expired' }; await sheet.props.onChoose('STANDARD'); await flush(); tree = render(Detail); assert.equal(node(tree, 'ClashModeSheet').props.visible, false); assert.equal(startCalls, 0);
});

test('server veto after successful preflight closes composer, retaining history instead of displaying a retryable duel-window error', async () => {
  reset(); const props = { take: base, openComposer: true }; render(TakeChallenges, props); await flush(); let tree = render(TakeChallenges, props);
  node(tree, 'Input').props.onChangeText(challenge.counterPosition); tree = render(TakeChallenges, props);
  rpcError = { code: 'P0003', message: 'Take cannot support a duel window' }; button(tree, 'SEND CHALLENGE').props.onPress(); await flush(); tree = render(TakeChallenges, props);
  assert.equal(node(tree, 'Modal').props.visible, false); assert.equal(rpcCalls.filter(c => c.name === 'create_arena_challenge').length, 1);
});
test('actual expiry while open closes immediately even without a parent readOnly prop', async () => {
  reset(); const take = { ...base }, props = { take, openComposer: true }; render(TakeChallenges, props); await flush(); let tree = render(TakeChallenges, props);
  assert.equal(node(tree, 'Modal').props.visible, true); clock = take.expiresAt; tree = render(TakeChallenges, props); assert.equal(node(tree, 'Modal').props.visible, false);
});
test('a refreshed inactive Take prop cannot be overridden by an older successful preflight', async () => {
  reset(); let props = { take: base, openComposer: true }; render(TakeChallenges, props); await flush(); assert.equal(node(render(TakeChallenges, props), 'Modal').props.visible, true);
  props = { ...props, take: { ...base, status: 'expired' } }; assert.equal(node(render(TakeChallenges, props), 'Modal').props.visible, false);
});

test('Take focus refresh replaces cached active metadata with the server archive state', async () => {
  reset(); fresh = { ...base, status: 'expired' }; render(Detail); await flush();
  const tree = render(Detail); assert.equal(node(tree, 'TakeActionRow').props.readOnly, true);
  assert.equal(node(tree, 'TakeChallenges').props.readOnly, true); assert.equal(node(tree, 'RebuttalInput'), undefined);
});
test('mapper retains already-public server eligibility metadata', () => {
  reset(); const { toTake } = require('../services/arenaMappers.ts');
  const mapped = toTake({ id: 'take', author_id: 'owner', text: 'Fixture', hood: 'techtakes', created_at: new Date(0).toISOString(), expires_at: new Date(9e6).toISOString(), status: 'expired', is_runtime_fixture: true, media_kind: null, clashes_count: 0, reactions_count: 0 });
  assert.equal(mapped.status, 'expired'); assert.equal(mapped.isRuntimeFixture, true);
});
