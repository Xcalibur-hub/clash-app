const test = require('node:test'), assert = require('node:assert/strict');
const { harness, deferred, nodes, text } = require('./ui-completion-harness.cjs');
const find = (tree, name) => nodes(tree).find(n => (n.type?.name ?? n.type) === name);
function clock() {
  let now = 0, next = 0; const timers = new Map();
  return { setTimeout(fn, delay) { timers.set(++next, { fn, at: now + delay }); return next; }, clearTimeout(id) { timers.delete(id); },
    advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } }, get size() { return timers.size; } };
}

test('Reduced RealmPortal has no decorative presentation/timing, completes once and cleans up', async () => {
  const time = clock(); let done = 0;
  const h = harness('components/navigation/RealmPortal.tsx', { direction: 'arena-to-vault', onDone: () => done++ }, ex => ex.RealmPortal, time);
  try {
    await h.mount(); assert.equal(h.tree, null); assert.equal(h.animations.length, 0);
    await h.act(async () => time.advance(0)); assert.equal(done, 1);
    await h.update({ direction: 'arena-to-vault', onDone: () => done++ }); await h.act(async () => time.advance(1000)); assert.equal(done, 1);
  } finally { await h.unmount(); assert.equal(time.size, 0); }
});
test('Normal RealmPortal deadline survives parent rerenders; latest callback fires once; unmount cancels it', async () => {
  const time = clock(); let old = 0, latest = 0;
  const h = harness('components/navigation/RealmPortal.tsx', { direction: 'arena-to-vault', onDone: () => old++ }, ex => ex.RealmPortal, time); h.motion.reduced = false;
  try {
    await h.mount(); assert.equal(h.tree.props.importantForAccessibility, 'no-hide-descendants');
    await h.act(async () => time.advance(500)); await h.update({ direction: 'arena-to-vault', onDone: () => latest++ });
    await h.act(async () => time.advance(180)); assert.equal(old, 0); assert.equal(latest, 1);
    await h.act(async () => time.advance(1000)); assert.equal(latest, 1);
  } finally { await h.unmount(); assert.equal(time.size, 0); }
  const cancel = harness('components/navigation/RealmPortal.tsx', { direction: 'vault-to-arena', onDone: () => latest++ }, ex => ex.RealmPortal, time); cancel.motion.reduced = false;
  await cancel.mount(); await cancel.unmount(); time.advance(2000); assert.equal(latest, 1);
});
test('Reduced realm navigation is immediate; normal delayed navigation is cancelled on unmount', async () => {
  const time = clock(), h = harness('components/navigation/useRealmSwitch.ts', {}, ex => () => ex.useRealmSwitch(), time);
  await h.mount(); await h.act(async () => h.tree.shiftTo('vault', '/(vault)'));
  assert.deepEqual(h.calls, [['replace', '/(vault)']]); assert.equal(time.size, 0); assert.equal(h.tree.shifting, false); await h.unmount();
  const normal = harness('components/navigation/useRealmSwitch.ts', {}, ex => () => ex.useRealmSwitch(), time); normal.motion.reduced = false;
  await normal.mount(); await normal.act(async () => normal.tree.shiftTo('vault', '/(vault)')); assert.equal(time.size, 2);
  await normal.unmount(); time.advance(1000); assert.deepEqual(normal.calls, []);
});

test('Subscription presentation is honest, scrollable, scalable, safe-area-aware and reduced-motion-aware', async () => {
  let closes = 0;
  const h = harness('components/vault/SubscriptionInfoSheet.tsx', { visible: true, creatorName: 'A very long fictional creator', onClose: () => closes++ });
  try {
    await h.mount(); assert.match(text(h.tree), /Membership unavailable/); assert.doesNotMatch(text(h.tree), /Unlock this world|JOIN/);
    assert.equal(h.animations.length, 0); assert.ok(find(h.tree, 'ScrollView'));
    assert.ok(h.nodes.filter(n => n.type === 'Text').every(n => n.props.allowFontScaling !== false));
    assert.ok(h.nodes.some(n => n.props?.accessibilityViewIsModal));
    await h.act(async () => h.tree.props.onRequestClose()); assert.equal(closes, 1);
    h.motion.reduced = false; h.colors.scheme = 'light'; await h.update(); assert.equal(h.animations.length, 2);
    const action = find(h.tree, 'VaultActionButton'); assert.equal(action.props.label, 'Got it'); await h.act(async () => action.props.onPress()); assert.equal(closes, 2);
  } finally { await h.unmount(); }
});
test('Missing subscription/follow callbacks are disabled rather than enabled no-ops; hero actions wrap', async () => {
  const h = harness('components/vault/world/WorldHeroCopy.tsx', { creatorName: 'Fictional', identity: 'Long bio', subscribed: false, following: false, isSelf: false });
  try {
    await h.mount(); const buttons = h.nodes.filter(n => n.type?.name === 'VaultActionButton'); assert.equal(buttons[1].props.label, 'Membership availability');
    const Button = h.load('components/vault/VaultActionButton.tsx').VaultActionButton;
    for (const button of buttons) assert.equal(Button(button.props).props.disabled, true);
    assert.ok(h.nodes.some(n => n.props?.style?.flexWrap === 'wrap')); // styles.actions is a direct object
    assert.ok(h.nodes.filter(n => n.type === 'Text').every(n => n.props.allowFontScaling !== false));
  } finally { await h.unmount(); }
});

test('Vault Back exposes 44dp geometry with both stack Back and deep-link fallback', async () => {
  const h = harness('components/vault/VaultBackButton.tsx', { fallback: '/vault/course/c' });
  try {
    await h.mount(); assert.equal(h.tree.props.style.height, 44); assert.equal(h.tree.props.style.width, 44);
    await h.act(async () => h.tree.props.onPress()); assert.deepEqual(h.calls.pop(), ['replace', '/vault/course/c']);
    h.router.canGoBack = () => true; await h.act(async () => h.tree.props.onPress()); assert.deepEqual(h.calls.pop(), ['back']);
  } finally { await h.unmount(); }
});
test('Shared tabs support scaling/multiline labels, 44dp targets and actual selection', async () => {
  let selected;
  const h = harness('components/shared/SegmentedTabs.tsx', { value: 'a', items: [{ key: 'a', label: 'Long selected label' }, { key: 'b', label: 'Another option' }], onChange: value => { selected = value; }, label: 'Sections' });
  try {
    await h.mount(); const tabs = h.nodes.filter(n => n.props?.accessibilityRole === 'tab');
    assert.ok(tabs.every(n => n.props.style.some(s => s?.minHeight >= 44)));
    assert.ok(h.nodes.filter(n => n.type === 'Text').every(n => n.props.allowFontScaling !== false && n.props.numberOfLines !== 1));
    await h.act(async () => tabs[1].props.onPress()); assert.equal(selected, 'b');
  } finally { await h.unmount(); }
});
test('Creator hero and media tiles grow beyond their base size; headers remain 44dp at review widths', async () => {
  const h = harness('components/vault/world/WorldHero.tsx', { creatorName: 'Long fictional creator', onBack() {}, topInset: 24 }, undefined, {
    dependencies: { WorldHeroCopy: { WorldHeroCopy: 'Copy' }, WorldHeroMeta: { WorldHeroMeta: 'Meta' }, WorldHeroPoster: { WorldHeroPoster: 'Poster' } },
  });
  try {
    for (const width of [320, 360, 430]) {
      h.dimensions.width = width; h.dimensions.fontScale = 2; await h.update();
      const back = h.nodes.find(n => n.props?.accessibilityLabel === 'Back'); assert.equal(back.props.style[0].height, 44);
      const hero = h.nodes.find(n => Array.isArray(n.props?.style) && n.props.style.some(s => s?.minHeight));
      assert.ok(hero.props.style.some(s => s?.minHeight > 0)); assert.ok(hero.props.style.every(s => s?.height === undefined));
    }
  } finally { await h.unmount(); }
});
test('Unavailable free cards do not present unlocked media; membership actions are informational and optional', async () => {
  const drop = { accessLevel: 'free', accessible: false, publicMedia: { bucket: 'public', path: 'old' }, caption: 'Expired', status: 'expired' };
  const h = harness('components/vault/VaultDropCard.tsx', { drop, onOpen() {} }, undefined, { dependencies: { VaultMediaTile: { VaultMediaTile: 'Tile' } } });
  h.services.getPublicMediaUrl = () => { throw Error('Unavailable asset must not be shown'); };
  try {
    await h.mount(); assert.equal(find(h.tree, 'Tile').props.kind, 'UNAVAILABLE'); assert.equal(find(h.tree, 'Tile').props.mediaUrl, null);
    await h.update({ drop: { ...drop, accessLevel: 'subscriber', publicMedia: null }, onOpen() {} });
    assert.equal(h.nodes.some(n => n.props?.accessibilityLabel === 'Unlock'), false);
    assert.equal(h.nodes.some(n => n.type === 'Pressable'), false);
  } finally { await h.unmount(); }
});
test('Creator read failure has retry; blocked Vault does not offer acquisition or treat it as a network error', async () => {
  let retries = 0; const model = { phase: 'error', creator: null, isSelf: false, retry: () => retries++ };
  const h = harness('components/vault/VaultScreen.tsx', { creatorId: 'p' }, undefined, { dependencies: {
    useCreatorWorld: { useCreatorWorld: () => model }, WorldHero: { WorldHero: 'Hero' }, WorldChapter: { WorldChapter: 'Chapter' },
  } });
  try {
    await h.mount(); assert.equal(find(h.tree, 'EmptyState').props.actionLabel, 'Try again');
    await h.act(async () => find(h.tree, 'EmptyState').props.onAction()); assert.equal(retries, 1);
    model.phase = 'blocked'; await h.update(); assert.equal(find(h.tree, 'EmptyState').props.actionLabel, undefined);
  } finally { await h.unmount(); }
});

const world = phase => ({ phase, creator: { id: 'creator', name: 'Fictional', tint: '#888' }, vault: {}, follow: { following: false },
  subscription: null, storefront: [], collections: [], services: [], courses: [], products: [], community: null, worldDrops: [], liveSessions: [], aiProfile: null, isSelf: false, isGuest: false });
test('Creator retry and follow use scoped production state, reject duplicates, rollback errors and ignore old accounts', async () => {
  let reads = 0, writes = 0; const gate = deferred();
  const h = harness('components/vault/world/useCreatorWorld.ts', { id: 'creator' }, ex => p => ex.useCreatorWorld(p.id), {
    dependencies: { creatorWorldLoader: { emptyCreatorWorldData: world, fetchCreatorWorld: async () => { if (++reads === 1) throw Error('network'); return world('ready'); } } },
  });
  h.services.followUser = async () => { writes++; return gate.promise; };
  try {
    await h.mount(); assert.equal(h.tree.phase, 'error'); await h.act(async () => h.tree.retry()); assert.equal(h.tree.phase, 'ready');
    const follow = h.tree.toggleFollow; await h.act(async () => { follow(); follow(); }); assert.equal(writes, 1); assert.equal(h.tree.followBusy, true); assert.equal(h.tree.follow.following, true);
    await h.act(async () => gate.reject(Error('rejected'))); assert.equal(h.tree.follow.following, false); assert.equal(h.tree.followError, true);
    const old = deferred(); h.services.followUser = async () => old.promise; await h.act(async () => h.tree.toggleFollow());
    h.auth = { user: { id: 'other' }, loading: false }; await h.update(); await h.act(async () => old.resolve());
    assert.equal(h.tree.follow.following, false); assert.equal(h.tree.followBusy, false); assert.equal(h.tree.followError, false);
  } finally { await h.unmount(); }
});
