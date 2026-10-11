// Actual safety services/UI; controlled auth, transport and hooks. Not Android verification.
const fs = require('node:fs'), Module = require('node:module'), babel = require('@babel/core'), assert = require('node:assert/strict');
const React = require('react');
for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (mod, file) => mod._compile(babel.transformSync(fs.readFileSync(file, 'utf8'), {
  filename: file, babelrc: false, configFile: false, presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]], plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, file);
let uid = 'a', records = { blocks: [], mutes: [] }, profiles = new Map(), logs = [], listeners = new Set(), networkError = null, lostResponse = false, held = null;
let cells = [], index = 0, focus, cleanup, foreground, alert, reloads = 0, routes = [];
const hooks = { ...React,
  useState(value) { const i = index++; if (!(i in cells)) cells[i] = value; return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value; }]; },
  useRef(value) { const i = index++; if (!(i in cells)) cells[i] = { current: value }; return cells[i]; },
  useCallback(fn, deps) { const i = index++, old = cells[i]; if (!old || deps.some((d,j) => d !== old.deps[j])) cells[i] = { fn, deps }; return cells[i].fn; },
  useEffect() {},
};
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function switchAccount(next) { uid = next; for (const listener of listeners) listener('SIGNED_IN', uid ? { user: { id: uid } } : null); }
class ServiceError extends Error { constructor(message, code) { super(message); this.code = code; } }
function builder(table, args, rpc = false) {
  const query = { table, args, rpc, headers: {}, filters: [], size: null,
    select(fields) { this.fields = fields; return this; }, eq(field, value) { this.filters.push([field, value]); return this; },
    order(field) { this.orderField = field; return this; }, limit(size) { this.size = size; return this; }, gt(field, value) { this.after = [field, value]; return this; },
    in(field, values) { this.ids = values; return this; }, setHeader(name, value) { this.headers[name] = value; return this; }, abortSignal(signal) { this.signal = signal; return this; },
    async then(resolve, reject) {
      try {
        logs.push(this);
        if (held?.table === table) { const wait = held; held = null; await wait.promise; }
        if (networkError) return resolve({ data: null, error: networkError });
        const actor = this.headers.Authorization?.replace('Bearer token-', '') ?? uid;
        let data;
        if (rpc) {
          if (table === 'my_profile_id') data = 'profile-' + actor;
          else if (table === 'submit_report') data = 'report-id';
          else {
            const block = table.includes('block'), list = block ? 'blocks' : 'mutes';
            const ownerKey = block ? 'blocker_id' : 'muter_id', targetKey = block ? 'blocked_id' : 'muted_id';
            const existing = records[list].find(row => row[ownerKey] === 'profile-' + actor && row[targetKey] === args.p_target_id);
            if (table.startsWith('un')) records[list] = records[list].filter(row => row !== existing);
            else if (!existing) records[list].push({ [ownerKey]: 'profile-' + actor, [targetKey]: args.p_target_id });
            data = null;
          }
        } else if (table === 'profiles') data = this.ids.flatMap(id => profiles.has(id) ? [{ id, ...profiles.get(id) }] : []);
        else {
          data = records[table].filter(row => this.filters.every(([field, value]) => row[field] === value));
          data = [...data].sort((a, b) => a[this.orderField].localeCompare(b[this.orderField]));
          if (this.after) data = data.filter(row => row[this.after[0]] > this.after[1]);
          data = data.slice(0, this.size);
        }
        if (lostResponse) { lostResponse = false; return resolve({ data: null, error: { code: 'network', message: 'Response lost after commit' } }); }
        return resolve({ data, error: null });
      } catch (error) { return reject(error); }
    },
  };
  return query;
}
const client = {
  auth: { async getSession() { return { data: { session: uid ? { user: { id: uid }, access_token: 'token-' + uid } : null }, error: null }; },
    onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe() { listeners.delete(fn); } } } }; } },
  rpc(name, args) { return builder(name, args, true); }, from(table) { return builder(table); },
};
const original = Module._load;
Module._load = function(request, parent) {
  const file = parent.filename.replaceAll('\\', '/');
  if (file.endsWith('/safetyService.ts')) {
    if (request === './supabaseClient') return { currentUserId: async () => uid, requireSupabase: () => client, requestError: error => new ServiceError(error.message, error.code), SupabaseError: ServiceError };
    if (request === './apiService') return { currentViewerProfileId: async () => uid ? 'profile-' + uid : null, fetchProfilesByIds: async () => [] };
  }
  if (file.endsWith('/SafetySettingsScreen.tsx') || file.endsWith('/settings/index.tsx')) {
    if (request === 'react') return hooks;
    if (request === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'Spinner', Alert: { alert(...args) { alert = args; } }, AppState: { addEventListener(_event, fn) { foreground = fn; return { remove() { foreground = null; } }; } } };
    if (request === 'expo-router') return { useFocusEffect(fn) { focus = fn; }, useRouter: () => ({ push: route => routes.push(route), replace: route => routes.push(route), canGoBack: () => false }) };
    if (request === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (request.endsWith('/AuthProvider')) return { useAuth: () => ({ user: uid ? { id: uid } : null, loading: false }) };
    if (request.endsWith('/store')) return { useClash: () => ({ reloadArena: async () => { reloads++; } }) };
    if (request.endsWith('/theme')) return { layout: { screenX: 20 }, space: { sm: 8, md: 12, lg: 20, xl: 24 }, typeScale: {}, useThemeColors: () => ({}) };
    if (request.endsWith('/icons')) return { BackIcon: 'BackIcon', SettingsIcon: 'SettingsIcon' };
    if (request.endsWith('/GlowButton')) return { GlowButton: 'Button' };
  }
  return original.apply(this, arguments);
};
let profileFocus = [];
let profileRead = async () => ({ id: 'target', name: 'Target', handle: 'target' });
const safetyLoader = Module._load;
Module._load = function(request, parent) {
  const file = parent.filename.replaceAll('\\', '/');
  if (file.endsWith('/hooks/useOperationScope.ts') && request === 'react') return hooks;
  if (file.endsWith('/ProfileScreen.tsx')) {
    if (request === 'react') return { ...hooks, useEffect() {} };
    if (request === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'Spinner', RefreshControl: 'RefreshControl', StyleSheet: { create: styles => styles } };
    if (request === 'expo-router') return { useFocusEffect(fn) { profileFocus.push(fn); focus = () => { const stops = profileFocus.map(setup => setup()); return () => stops.forEach(stop => stop?.()); }; }, useRouter: () => ({ push() {}, replace() {} }) };
    if (request === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (request.endsWith('/AuthProvider')) return { useAuth: () => ({ signedIn: !!uid, user: uid ? { id: uid } : null }) };
    if (request.endsWith('/store')) return { useClash: () => ({ state: { viewer: { id: 'profile-' + uid } }, dispatch() {} }), showNotice: value => value };
    if (request.endsWith('/profileService')) return { fetchProfileById: () => profileRead(), fetchProfileClashes: async () => [], fetchProfileReplies: async () => [], fetchProfileTakes: async () => [] };
    if (request.endsWith('/socialService')) return { fetchFollowState: async () => ({ following: false, followerCount: 0, followingCount: 0 }) };
    if (request.endsWith('/safetyService')) return { fetchViewerSafetyState: async () => ({ blockedProfileIds: records.blocks.filter(row => row.blocker_id === 'profile-' + uid).map(row => row.blocked_id) }) };
    if (request.endsWith('/vaultService')) return { fetchVault: async () => null };
    if (request.endsWith('/arenaGameService')) return { fetchMyArenaReputation: async () => null };
    if (request.endsWith('/utils/profileStatsLifecycle') || request.endsWith('/hooks/useOperationScope')) return original.apply(this, arguments);
    if (request.endsWith('/apiService')) return { fetchProfilesByIds: async () => [] };
    if (request.endsWith('/supabaseClient')) return { errorText: error => error.message };
    if (request.endsWith('/analytics')) return { analytics: { trackOnce() {} } };
    if (request.endsWith('/theme')) return { layout: { screenX: 20 }, space: {}, typeScale: {}, useThemeColors: () => ({}) };
    if (request.endsWith('/dockConfig')) return { dockBottomPadding: () => 0 };
    if (request.endsWith('/haptics')) return { tap() {} };
    if (request === 'react/jsx-runtime') return original.apply(this, arguments);
    return new Proxy({}, { get: (_target, key) => String(key) });
  }
  return safetyLoader.apply(this, arguments);
};

let count = 0;
const pass = label => { count++; console.log('ok ' + count + ' - ' + label); };
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)] : [];
const text = tree => typeof tree === 'string' ? tree : tree && typeof tree === 'object' ? React.Children.toArray(tree.props?.children).map(text).join(' ').replace(/\s+/g, ' ') : '';
const button = (tree, label) => nodes(tree).find(node => node.props?.accessibilityLabel === label && node.props?.onPress);
(async () => {
  const api = require('../services/safetyService.ts');
  profiles.set('target', { name: 'Target', handle: 'target' });
  await api.blockProfile('target');
  assert.deepEqual((await api.fetchSafetyPage('blocked', 'a')).items, [{ id: 'target', name: 'Target', handle: 'target' }]);
  assert.deepEqual(logs.find(row => row.table === 'block_profile').args, { p_target_id: 'target' });
  pass('existing Arena block RPC derives actor; blocked target appears in owner list');
  await api.muteUser('target'); assert.equal((await api.fetchSafetyPage('muted', 'a')).items[0].id, 'target');
  pass('existing Arena mute RPC appears in muted list');
  await api.unblockProfile('target', 'a'); await api.unmuteUser('target', 'a');
  assert.equal((await api.fetchSafetyPage('blocked', 'a')).items.length, 0); assert.equal((await api.fetchSafetyPage('muted', 'a')).items.length, 0);
  pass('confirmed unblock and unmute remove server relationships');
  const profileQuery = logs.find(row => row.table === 'profiles'); assert.equal(profileQuery.fields, 'id,name,handle');
  assert.equal(logs.find(row => row.table === 'blocks').size, 51); assert.deepEqual(logs.find(row => row.table === 'blocks').filters, [['blocker_id', 'profile-a']]);
  pass('lists derive owner, bound pages and whitelist minimal identity fields');
  const beforeGuest = logs.length; switchAccount(null);
  for (const call of [() => api.fetchSafetyPage('blocked', 'a'), () => api.blockProfile('target'), () => api.unblockProfile('target'), () => api.muteUser('target'), () => api.unmuteUser('target')]) await assert.rejects(call(), { code: 'account_changed' });
  assert.equal(logs.length, beforeGuest); pass('guests cannot query or mutate relationships');
  switchAccount('a'); lostResponse = true; await assert.rejects(api.blockProfile('target'), { code: 'network' }); await api.blockProfile('target');
  assert.equal(records.blocks.length, 1); pass('lost response can retry existing idempotent RPC without duplicate relationship');
  const oldCalls = logs.length; switchAccount('b'); await assert.rejects(api.unblockProfile('target', 'a'), { code: 'account_changed' }); assert.equal(logs.length, oldCalls);
  assert.equal((await api.fetchSafetyPage('blocked', 'b')).items.length, 0); pass('old account action is rejected before dispatch and new account list is empty');
  switchAccount('a'); const late = deferred(); held = { table: 'unblock_profile', ...late }; const pending = api.unblockProfile('target', 'a'); await flush(); switchAccount('b'); late.resolve(); await assert.rejects(pending, { code: 'account_changed' });
  assert.equal(logs.findLast(row => row.table === 'unblock_profile').headers.Authorization, 'Bearer token-a');
  assert.equal(listeners.size, 0); pass('in-flight mutation binds original JWT, aborts on identity change and discards response');
  switchAccount('a'); records.mutes = Array.from({ length: 56 }, (_, i) => ({ muter_id: 'profile-a', muted_id: 'person-' + String(i).padStart(3, '0') }));
  const first = await api.fetchSafetyPage('muted', 'a'), second = await api.fetchSafetyPage('muted', 'a', first.nextCursor);
  assert.equal(first.items.length, 50); assert.equal(second.items.length, 6); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map(row => row.id)).size, 56); assert.equal(first.items[0].name, null);
  pass('keyset pagination retrieves more than 50 relationships and preserves unavailable profiles');
  networkError = { code: '42501', message: 'Denied' }; await assert.rejects(api.fetchSafetyPage('blocked', 'a'), { code: '42501' }); networkError = null;
  pass('server permission failures propagate instead of returning false empty success');

  const { SafetySection, default: SafetyScreen } = require('../components/settings/SafetySettingsScreen.tsx');
  let kind = 'blocked';
  const render = () => { index = 0; return SafetySection({ kind, accountId: uid }); };
  const activate = () => { cleanup?.(); cleanup = focus(); };
  const reset = () => { cleanup?.(); cleanup = null; cells = []; alert = null; };
  await api.blockProfile('target'); let tree = render(); assert.match(text(tree), /Loading accounts/); assert.doesNotMatch(text(tree), /No blocked/); activate(); await flush(); tree = render();
  assert.match(text(tree), /Target/); pass('actual section hides empty state during loading and renders server-backed identity');
  const unblock = button(tree, 'Unblock @target'); unblock.props.onPress(); unblock.props.onPress();
  assert.equal(alert[0], 'Unblock account?'); alert[2][0].onPress(); tree = render(); assert.equal(button(tree, 'Unblock @target').props.disabled, false); assert.equal(records.blocks.length, 1);
  pass('block removal requires confirmation and cancellation preserves relationship');
  networkError = { code: 'network', message: 'Offline' }; button(tree, 'Unblock @target').props.onPress(); alert[2][1].onPress(); await flush(); tree = render();
  assert.match(text(tree), /Could not confirm/); assert.match(text(tree), /Target/); assert.doesNotMatch(text(tree), /Account unblocked/); assert.equal(reloads, 0);
  pass('RPC failure retains row and shows no success or Arena refresh');
  networkError = null; const removal = deferred(); held = { table: 'unblock_profile', ...removal }; button(tree, 'Unblock @target').props.onPress(); alert[2][1].onPress(); alert[2][1].onPress(); await flush();
  // Confirmation callbacks and repeated row taps must not dispatch again.
  tree = render(); assert.equal(button(tree, 'Unblock @target').props.disabled, true); const before = logs.filter(row => row.table === 'unblock_profile').length;
  button(tree, 'Unblock @target').props.onPress(); await flush(); assert.equal(logs.filter(row => row.table === 'unblock_profile').length, before);
  removal.resolve(); await flush(); tree = render(); assert.doesNotMatch(text(tree), /Target/); assert.match(text(tree), /Account unblocked/); assert.match(text(tree), /No blocked accounts/);
  pass('pending controls reject repeated row taps; confirmed removal updates list and success');
  assert.ok(reloads >= 1); pass('confirmed relationship change refreshes existing Arena safety hydration');
  reset(); kind = 'muted'; records.mutes = []; await api.muteUser('target'); tree = render(); activate(); await flush(); tree = render();
  const beforeUnmute = logs.filter(row => row.table === 'unmute_profile').length;
  button(tree, 'Unmute @target').props.onPress(); button(tree, 'Unmute @target').props.onPress(); await flush(); tree = render(); assert.match(text(tree), /Account unmuted/); assert.match(text(tree), /No muted accounts/);
  assert.equal(logs.filter(row => row.table === 'unmute_profile').length, beforeUnmute + 1);
  pass('unmute interaction updates authoritative list without repeated dispatch');
  await api.muteUser('target'); const oldRead = deferred(); held = { table: 'mutes', ...oldRead }; button(tree, 'Refresh muted accounts').props.onPress(); await flush(); cleanup(); cleanup = null;
  switchAccount('b'); reset(); tree = render(); activate(); await flush(); oldRead.resolve(); await flush(); tree = render(); assert.doesNotMatch(text(tree), /Target/); assert.match(text(tree), /No muted/);
  pass('account switch clears prior rows and late requests cannot repopulate new account');
  reset(); switchAccount('a'); const blurRead = deferred(); held = { table: 'mutes', ...blurRead }; tree = render(); activate(); await flush(); cleanup(); cleanup = null;
  records.mutes = []; render(); activate(); await flush(); blurRead.resolve(); await flush(); tree = render(); assert.match(text(tree), /No muted/); assert.doesNotMatch(text(tree), /Target/);
  pass('blur/refocus invalidates old reads while refreshing current server state');
  await api.muteUser('target'); foreground('active'); await flush(); tree = render(); assert.match(text(tree), /Target/); pass('foreground refresh reflects external safety changes');
  profiles.delete('target'); button(tree, 'Refresh muted accounts').props.onPress(); await flush(); tree = render(); assert.match(text(tree), /Unavailable account/); assert.ok(button(tree, 'Unmute unavailable account'));
  pass('unavailable profile remains manageable without additional personal data');
  reset(); switchAccount(null); index = 0; tree = SafetyScreen(); assert.match(text(tree), /Sign in to manage/); nodes(tree).find(row => row.props?.label === 'Sign in').props.onPress(); assert.equal(routes.at(-1), '/auth');
  pass('actual Settings screen gates guest lists and offers existing authentication route');
  const Settings = require('../app/settings/index.tsx').default; index = 0; tree = Settings(); button(tree, 'Safety settings').props.onPress(); assert.equal(routes.at(-1), '/settings/safety');
  pass('Settings entry navigates to Safety settings');
  switchAccount('a'); index = 0; tree = SafetyScreen(); assert.equal(tree.props.children[1].props.children[1].key, 'a'); switchAccount('b'); index = 0; tree = SafetyScreen(); assert.equal(tree.props.children[1].props.children[1].key, 'b');
  pass('screen keys relationship subtree by authenticated account for immediate isolation');
  reset(); switchAccount('a'); await api.blockProfile('target');
  const { ProfileScreen } = require('../components/profile/ProfileScreen.tsx');
  const renderProfile = () => { index = 0; profileFocus = []; return ProfileScreen({ profileId: 'target' }); };
  tree = renderProfile(); activate(); await flush(); tree = renderProfile();
  assert.ok(nodes(tree).some(row => row.props?.title === 'You blocked this user'));
  const oldProfile = deferred(); profileRead = () => oldProfile.promise;
  activate(); await flush(); cleanup(); cleanup = null;
  await api.unblockProfile('target', 'a'); profileRead = async () => ({ id: 'target', name: 'Target', handle: 'target' });
  renderProfile(); activate(); await flush(); tree = renderProfile(); assert.ok(nodes(tree).some(row => row.type === 'ProfileHeader'));
  oldProfile.resolve({ id: 'target', name: 'Target', handle: 'target' }); await flush(); tree = renderProfile();
  assert.ok(nodes(tree).some(row => row.type === 'ProfileHeader')); assert.ok(!nodes(tree).some(row => row.props?.title === 'You blocked this user'));
  pass('profile refocus refreshes block state after Settings and rejects stale pre-unblock result');
  reset(); assert.equal(listeners.size, 0); console.log(`${count}/${count} safety service/UI checks passed; controlled dependencies, not live database or Android.`);
})().catch(error => { cleanup?.(); console.error(error); process.exitCode = 1; });
