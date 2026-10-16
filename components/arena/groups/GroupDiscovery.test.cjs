/* Controlled render/transport checks of the real Groups component, not device or database tests. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const babel = require('@babel/core');
const code = babel.transformSync(fs.readFileSync(__dirname + '/GroupDiscovery.tsx', 'utf8'), { filename: 'GroupDiscovery.tsx', babelrc: false, configFile: false, presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'classic' }]], plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
const crew = (id, member = false, following = false) => ({ id, name: id, slug: id, specialties: [], memberCount: 0, viewer: { isMember: member, isFollowing: following } });
function harness(advanced = false, signedIn = true) {
  let states = [], memos = [], si = 0, mi = 0, effect, previous, cleanup, tree;
  const auth = { signedIn, user: signedIn ? { id: 'a' } : null }, calls = [], routes = [];
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'Fragment',
    useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useCallback(fn, deps) { const i = mi++; if (!memos[i] || deps.some((v, n) => v !== memos[i].deps[n])) memos[i] = { fn, deps }; return memos[i].fn; } };
  const rpc = (kind, args) => new Promise((resolve, reject) => calls.push({ kind, args, resolve, reject }));
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === 'react') return React;
    if (name === 'react-native') return { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: x => x, hairlineWidth: 1 } };
    if (name === 'expo-router') return { useFocusEffect: fn => { effect = fn; }, useRouter: () => ({ push: route => routes.push(route) }) };
    if (name === 'lucide-react-native') return { ArrowRight: 'ArrowRight', Plus: 'Plus', Users: 'Users' };
    if (name.endsWith('/arenaCrewService')) return { ARENA_CREW_SPECIALTIES: ['Tech', 'Science'], listMyArenaCrews: () => rpc('mine'), listArenaCrews: args => rpc('list', args), discoverArenaCrews: args => rpc('discover', args) };
    if (name.endsWith('/AuthProvider')) return { useAuth: () => auth };
    if (name.endsWith('/theme')) return { layout: { screenX: 20 }, useThemeColors: () => ({}) };
    if (name === './GroupIdentity') return { GroupCard: 'GroupCard' };
    throw Error('Unexpected dependency ' + name);
  } });
  const render = () => { si = 0; mi = 0; tree = module.exports.GroupDiscovery({ advanced }); if (effect !== previous) { cleanup?.(); previous = effect; cleanup = effect(); } return tree; };
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const text = (node = tree) => !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : text(node.props?.children);
  const press = label => { const button = nodes().find(n => n.type === 'Pressable' && (n.props.accessibilityLabel === label || text(n).trim() === label)); assert.ok(button, 'Missing control: ' + label); assert.ok(!button.props.disabled, 'Disabled control: ' + label); button.props.onPress(); render(); };
  const cards = () => nodes().filter(n => n.type === 'GroupCard').map(n => n.props.crew.id);
  const settle = async () => { await new Promise(setImmediate); render(); };
  render();
  return { auth, calls, routes, render, nodes, text, press, cards, settle, blur: () => cleanup?.() };
}
test('guest is gated and never requests Crew data', () => { const h = harness(false, false); h.press('Sign in'); assert.equal(h.calls.length, 0); assert.equal(h.routes.at(-1), '/auth'); });
test('Joined excludes merely-followed crews; following stays separate', async () => { const h = harness(); h.calls[0].resolve([crew('joined', true), crew('followed', false, true)]); h.calls[1].resolve([crew('discover')]); await h.settle(); assert.deepEqual(h.cards(), ['discover']); h.press('Joined'); assert.deepEqual(h.cards(), ['joined', 'followed']); assert.match(h.text(), /Your membership.*Following/); });
test('late previous-account responses cannot replace current account', async () => { const h = harness(); h.auth.user = { id: 'b' }; h.render(); assert.deepEqual(h.cards(), []); h.calls[2].resolve([]); h.calls[3].resolve([crew('b')]); await h.settle(); h.calls[0].resolve([]); h.calls[1].resolve([crew('private-a')]); await h.settle(); assert.deepEqual(h.cards(), ['b']); });
test('specialty change hides old results and ignores late request', async () => { const h = harness(); h.press('Tech'); assert.equal(h.calls[3].args.specialty, 'Tech'); h.calls[2].resolve([]); h.calls[3].resolve([crew('tech')]); await h.settle(); h.calls[0].resolve([]); h.calls[1].resolve([crew('old')]); await h.settle(); assert.deepEqual(h.cards(), ['tech']); });
test('offset pagination preserves server limit and clears prior page', async () => { const h = harness(); h.calls[0].resolve([]); h.calls[1].resolve(Array.from({ length: 24 }, (_, i) => crew('c' + i))); await h.settle(); h.press('Next'); assert.equal(h.calls[3].args.offset, 24); assert.equal(h.calls[3].args.limit, 24); assert.deepEqual(h.cards(), []); });
test('server failure is an error, not a fabricated empty state; retry is actionable', async () => { const h = harness(); h.calls[0].resolve([]); h.calls[1].reject(Error('network')); await h.settle(); assert.match(h.text(), /couldn’t be loaded/); assert.doesNotMatch(h.text(), /Nothing here yet/); h.press('Try again'); assert.equal(h.calls.length, 4); });
test('blur discards pending results', async () => { const h = harness(); h.blur(); h.calls[0].resolve([]); h.calls[1].resolve([crew('late')]); await h.settle(); assert.deepEqual(h.cards(), []); });
test('advanced discovery uses server cursors and preserves Rising sort', async () => { const h = harness(true); h.calls[0].resolve([]); h.calls[1].resolve({ items: [crew('first')], nextCursor: 'precise-server-cursor' }); await h.settle(); h.press('Next'); assert.equal(h.calls[3].args.cursor, 'precise-server-cursor'); h.press('Rising'); assert.equal(h.calls.at(-1).args.sort, 'rising'); assert.equal(h.calls.at(-1).args.cursor, null); });
