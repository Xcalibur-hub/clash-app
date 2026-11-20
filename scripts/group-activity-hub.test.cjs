const test = require('node:test'), assert = require('node:assert/strict');
const { harness, text, React, deferred } = require('./ui-completion-harness.cjs');
const base = 'components/arena/groups/';
const crew = { id: 'crew-a', slug: 'circle', name: 'A circle', bio: 'Test claims together',
  viewer: { isMember: true, role: 'OWNER' }, memberCount: 1 };
const dependencies = { 'expo-constants': { __esModule: true, default: { expoConfig: { extra: { appVariant: 'development' } } } } };
const press = (h, label) => h.act(async () => {
  const n = h.nodes.find(n => n.props?.label === label || n.props?.accessibilityLabel === label);
  assert.ok(n, label); assert.ok(!n.props.disabled, label + ' enabled'); n.props.onPress();
});

test('activity hub uses actual purpose/role, honest unavailable activity and canonical discovery/member callbacks', async () => {
  let members = 0; global.__DEV__ = true;
  const h = harness(base + 'GroupActivityHub.tsx', { crew, identity: 'a:circle', onMembers: () => members++ }, e => e.GroupActivityHub, { dependencies });
  try {
    await h.mount(); assert.match(text(h.tree), /Test claims together/); assert.match(text(h.tree), /Your role: owner/);
    assert.match(text(h.tree), /Group-linked Arena activity is not available/);
    await press(h, 'Explore Arena topics'); assert.deepEqual(h.calls, [['push', '/arena/topics']]);
    await press(h, 'Explore group members'); assert.equal(members, 1);
    assert.equal(h.nodes.filter(n => n.type?.name === 'GroupMissionRehearsal').length, 1);
    const previousKey = h.nodes.find(n => n.type?.name === 'GroupMissionRehearsal').key;
    await h.update({ crew, identity: 'b:circle', onMembers() {} });
    assert.notEqual(h.nodes.find(n => n.type?.name === 'GroupMissionRehearsal').key, previousKey, 'account-scoped React key changes');
  } finally { await h.unmount(); delete global.__DEV__; }
});

test('mission fails closed for release JS or non-development native identities; visitor has no admission action', async () => {
  for (const [dev, variant] of [[false, 'development'], [true, 'production'], [true, undefined]]) {
    global.__DEV__ = dev;
    const h = harness(base + 'GroupActivityHub.tsx', { crew: { ...crew, viewer: { isMember: false } }, identity: 'v', onMembers() {} }, e => e.GroupActivityHub,
      { dependencies: { 'expo-constants': { __esModule: true, default: { expoConfig: { extra: { appVariant: variant } } } } } });
    try { await h.mount(); assert.equal(h.nodes.some(n => n.type?.name === 'GroupMissionRehearsal'), false);
      assert.match(text(h.tree), /Browsing does not join/); assert.match(text(h.tree), /New membership, invitations and group posting are unavailable/);
      assert.deepEqual(h.calls, []);
    } finally { await h.unmount(); }
  }
  delete global.__DEV__;
});

test('actual mission callbacks handle disabled submit, failure, retry, success, replay and close with no service writes', async () => {
  const h = harness(base + 'GroupMissionRehearsal.tsx', {}, e => e.GroupMissionRehearsal);
  try {
    await h.mount(); await press(h, 'Try local mission');
    assert.equal(h.nodes.find(n => n.props?.label === 'Check local answer').props.disabled, true);
    await press(h, 'Repeat the claim more confidently.'); await press(h, 'Check local answer');
    assert.match(text(h.tree), /Not yet/); assert.match(text(h.tree), /0\s*\/1/);
    assert.ok(h.nodes.filter(n => n.props?.accessibilityRole === 'radio').every(n => n.props.disabled));
    await press(h, 'Try again locally'); await press(h, 'Ask for a comparable before-and-after measurement.');
    await press(h, 'Check local answer'); assert.match(text(h.tree), /Mission complete locally/); assert.match(text(h.tree), /1\s*\/1/);
    await press(h, 'Replay local mission'); assert.match(text(h.tree), /0\s*\/1/);
    await press(h, 'Close local mission'); assert.ok(h.nodes.some(n => n.props?.label === 'Try local mission'));
    assert.deepEqual(h.calls, []);
  } finally { await h.unmount(); }
});

test('mission and hub retain wrapping, scalable type and minimum targets at 320/360/430 inputs without motion', async () => {
  const h = harness(base + 'GroupMissionRehearsal.tsx', {}, e => e.GroupMissionRehearsal);
  try {
    await h.mount(); await press(h, 'Try local mission');
    for (const width of [320, 360, 430]) for (const fontScale of [1, 1.3]) for (const scheme of ['dark', 'light']) {
      Object.assign(h.dimensions, { width, fontScale }); h.colors.scheme = scheme; await h.update();
      assert.ok(h.nodes.filter(n => n.type === 'Text').every(n => n.props.allowFontScaling !== false && n.props.numberOfLines === undefined));
      assert.ok(h.nodes.filter(n => n.props?.accessibilityRole === 'radio').every(n => n.props.style[0].minHeight >= 48));
      assert.equal(h.nodes.find(n => n.props?.accessibilityRole === 'radiogroup').props.accessibilityLabel, 'Choose an evidence check');
    }
    assert.deepEqual(h.animations, [], 'static alternative has no motion under any preference');
  } finally { await h.unmount(); }
});

function detail() {
  const h = harness('app/arena/crews/[slug].tsx', {}, e => e.default, { dependencies: {
    'expo-router': { useRouter: () => h.router, useLocalSearchParams: () => ({ slug: 'circle' }), useFocusEffect: fn => React.useEffect(fn, [fn]) },
    'lucide-react-native': { ArrowLeft: 'ArrowLeft', Users: 'Users' },
    GroupIdentity: { GroupMark: 'GroupMark', GroupSpecialties: 'GroupSpecialties' },
    useRequireAuth: { useRequireAuth: () => () => false }, ...dependencies,
  } });
  h.services.getArenaCrew = async () => ({ ...crew, specialties: [], followerCount: 0, joinMode: 'OPEN', wins: 0, losses: 0, totalReputation: 0, streak: 0 });
  h.services.listArenaCrewMembers = async () => [];
  return h;
}
test('actual detail mounts Activity and preserves Members navigation and blocked new membership', async () => {
  const h = detail();
  try {
    await h.mount(); const hub = h.nodes.find(n => n.type?.name === 'GroupActivityHub'); assert.ok(hub);
    assert.equal(h.tree.props.style[1].paddingBottom, 16, 'screen reserves the navigation inset');
    assert.equal(h.nodes.find(n => n.type === 'ScrollView').props.contentContainerStyle.paddingBottom, 32, 'content does not double-apply it');
    assert.match(text(h.tree), /Activity/); assert.equal(h.nodes.find(n => n.props?.label === 'Joined').props.disabled, true);
    await h.act(async () => hub.props.onMembers()); assert.match(text(h.tree), /Showing\s+0\s+of\s+1\s+members/);
    assert.equal(h.nodes.some(n => n.type?.name === 'GroupActivityHub'), false);
    assert.deepEqual(h.calls, []);
  } finally { await h.unmount(); }
});
test('actual detail loading/failure/retry do not render a fabricated activity hub', async () => {
  const h = detail(), read = deferred(); h.services.getArenaCrew = () => read.promise;
  try {
    await h.mount(); assert.ok(h.nodes.some(n => n.props?.accessibilityLabel === 'Loading group'));
    assert.equal(h.nodes.some(n => n.type?.name === 'GroupActivityHub'), false);
    await h.act(async () => read.reject(Error('offline'))); assert.match(text(h.tree), /couldn.t be loaded/i);
    h.services.getArenaCrew = async () => null; await press(h, 'Try again'); assert.match(text(h.tree), /Group unavailable/);
    assert.equal(h.nodes.some(n => n.type?.name === 'GroupActivityHub'), false);
  } finally { await h.unmount(); }
});
