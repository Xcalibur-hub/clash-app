const test = require('node:test'), assert = require('node:assert/strict');
const { harness, React, nodes, text, deferred } = require('./ui-completion-harness.cjs');
const native = { ...Object.fromEntries(['View', 'Text', 'Pressable', 'ScrollView', 'FlatList', 'RefreshControl', 'ActivityIndicator', 'TextInput', 'Modal'].map(k => [k, k])),
  StyleSheet: { create: s => s, hairlineWidth: 1, absoluteFill: {} }, Platform: { OS: 'android' } };
const button = (h, label) => h.nodes.find(n => n.props.label === label || n.props.accessibilityLabel === label || (n.props.onPress && text(n) === label));
const model = (extra = {}) => ({ isEmpty: true, canCreate: true, discoverWorlds: [], yourCreators: [], todaysDrops: [], continueItems: [], discoverServices: [], discoverCourses: [], discoverProducts: [], ...extra });
function home() {
  let focused = true, reads = 0;
  const h = harness('components/vault/VaultHome.tsx', {}, undefined, { dependencies: {
    'react-native': native, native: { useIsFocused: () => focused },
    'expo-router': { useRouter: () => h.router, useFocusEffect: fn => React.useEffect(() => focused ? fn() : undefined, [fn, focused]) },
    StoryEntry: { StoryEntry: 'Story' }, HomeRowView: { HomeRowView: 'Row' }, VaultScopeControl: { VaultScopeControl: 'Scope' },
  } });
  h.services.fetchVaultHome = async () => { reads++; return model(); };
  const rows = () => { const list = h.nodes.find(n => n.type === 'FlatList'); return list ? list.props.data.flatMap(item => nodes(list.props.renderItem({ item }))) : h.nodes; };
  return { h, rows, focus: value => { focused = value; }, get reads() { return reads; } };
}
function studio(file, mine = null) {
  const dispatch = () => {};
  const h = harness(file, {}, undefined, { dependencies: {
    'react-native': native, store: { useClash: () => ({ dispatch }), showNotice: text => text },
    CreatorDropRow: { CreatorDropRow: 'Drop' }, VaultFormSheet: { VaultFormSheet: 'Form' },
    ...Object.fromEntries(['CommunityStudio', 'WorldDropsStudio', 'LiveStudio', 'AiStudio'].map(name => [name, { [name]: name }])),
  } });
  Object.assign(h.services, { fetchMyVault: async () => mine, fetchViewerProfile: async () => ({ id: 'profile-a' }), fetchStorefront: async () => [],
    fetchCreatorServices: async () => [], fetchCreatorCourses: async () => [], fetchCreatorProducts: async () => [], fetchMyServiceRequests: async () => [], fetchCollections: async () => [] });
  return h;
}
for (const capability of ['creator', 'live', 'world', 'play', 'commerce', 'groups', 'ai']) test(`actual policy-aware button blocks deferred ${capability} admission, including a queued callback`, async () => {
  let writes = 0; const h = harness('components/vault/VaultActionButton.tsx', { label: 'Create', admission: capability, onPress: () => writes++ });
  try { await h.mount(); assert.equal(h.tree.props.disabled, true); assert.match(text(h.tree), /Unavailable/);
    assert.match(h.tree.props.accessibilityHint, /Existing content/); await h.act(async () => h.tree.props.onPress()); assert.equal(writes, 0);
  } finally { await h.unmount(); }
});
test('read, history, remove and existing management buttons remain usable without admission', async () => {
  for (const label of ['Read', 'History', 'Remove', 'End live', 'Manage Vault']) {
    let count = 0; const h = harness('components/vault/VaultActionButton.tsx', { label, onPress: () => count++ });
    try { await h.mount(); assert.equal(h.tree.props.disabled, false); await h.act(async () => h.tree.props.onPress()); assert.equal(count, 1); } finally { await h.unmount(); }
  }
});
test('guest and signed-in Vault discovery never offer Create even with an older canCreate payload', async () => {
  for (const signedIn of [false, true]) { const r = home(); r.h.auth = { user: signedIn ? { id: 'a' } : null, signedIn };
    try { await r.h.mount(); const rows = r.rows(); assert.equal(rows.some(n => n.props.accessibilityLabel === 'Create Drop'), false);
      const takes = rows.find(n => n.props.onPress && text(n) === 'Explore Takes'); assert.ok(takes);
      await r.h.act(async () => takes.props.onPress()); assert.deepEqual(r.h.calls, [['push', '/(tabs)']]);
      assert.ok(rows.some(n => n.type === 'Row' && n.props.row.kind === 'empty_discover'));
    } finally { await r.h.unmount(); }
  }
});
test('offline and denied discovery offer Retry and real read navigation without creation redirects', async () => {
  for (const code of ['network', '42501']) { const r = home(); r.h.services.fetchVaultHome = async () => { throw { code }; };
    try { await r.h.mount(); const retry = r.h.nodes.find(n => n.props.actionLabel === 'Try again'); assert.ok(retry);
      const inbox = button(r.h, 'View Challenge Inbox'); await r.h.act(async () => inbox.props.onPress());
      assert.deepEqual(r.h.calls, [['push', '/arena/challenges']]); r.h.services.fetchVaultHome = async () => model();
      await r.h.act(async () => retry.props.onAction()); assert.ok(r.rows().some(n => n.type === 'Scope'));
    } finally { await r.h.unmount(); }
  }
});
test('Vault refresh is a deduplicated read and a failed refresh labels retained content', async () => {
  const r = home(), response = deferred(); try { await r.h.mount(); let count = 0;
    r.h.services.fetchVaultHome = () => { count++; return response.promise; };
    const refresh = r.h.nodes.find(n => n.type === 'FlatList').props.refreshControl.props.onRefresh;
    await r.h.act(async () => { refresh(); refresh(); }); assert.equal(count, 1);
    await r.h.act(async () => response.reject(Error('offline'))); assert.match(r.rows().map(text).join(' '), /Previously loaded content/);
    assert.deepEqual(r.h.calls, []);
  } finally { await r.h.unmount(); }
});
test('a permission failure clears cached Vault cards instead of retaining unauthorized discovery', async () => {
  const r = home(); try { await r.h.mount(); r.h.services.fetchVaultHome = async () => { throw { code: '42501' }; };
    await r.h.act(async () => r.h.nodes.find(n => n.type === 'FlatList').props.refreshControl.props.onRefresh());
    assert.equal(r.h.nodes.some(n => n.type === 'FlatList'), false); assert.ok(r.h.nodes.find(n => n.props.title === 'Vault unavailable'));
  } finally { await r.h.unmount(); }
});
test('account A to B to A, blur and unmount invalidate old content requests and navigation callbacks', async () => {
  const r = home(), a = deferred(), b = deferred(), fresh = deferred(); r.h.services.fetchVaultHome = () => a.promise;
  try { await r.h.mount(); const old = button(r.h, 'Explore Takes').props.onPress;
    r.h.auth = { user: { id: 'b' } }; r.h.services.fetchVaultHome = () => b.promise; await r.h.update();
    r.h.auth = { user: { id: 'account-a' } }; r.h.services.fetchVaultHome = () => fresh.promise; await r.h.update();
    await r.h.act(async () => { a.resolve(model()); b.resolve(model()); old(); }); assert.ok(r.h.nodes.some(n => typeof n.type === 'function' && n.type.name === 'VaultHomeSkeleton')); assert.deepEqual(r.h.calls, []);
    await r.h.act(async () => fresh.resolve(model())); const current = r.rows().find(n => n.props.onPress && text(n) === 'Explore Takes').props.onPress;
    r.focus(false); await r.h.update(); await r.h.act(async () => current()); assert.deepEqual(r.h.calls, []);
    r.focus(true); await r.h.update(); const last = r.rows().find(n => n.props.onPress && text(n) === 'Explore Takes').props.onPress;
    await r.h.unmount(); last(); assert.deepEqual(r.h.calls, []);
  } finally { await r.h.unmount(); }
});
test('Vault content cards keep canonical creator/drop/offer routes and never acquire or publish', async () => {
  const r = home(); r.h.services.fetchVaultHome = async () => model({ isEmpty: false, discoverWorlds: [{ creatorId: 'creator-real' }], todaysDrops: [{ dropId: 'drop-real' }], discoverProducts: [{ id: 'product-real', kind: 'product' }] });
  try { await r.h.mount(); const row = r.rows().find(n => n.type === 'Row');
    await r.h.act(async () => { row.props.onEnterWorld('creator-real'); row.props.onOpenDrop('drop-real'); row.props.onOpenOffer({ kind: 'product', id: 'product-real' }); });
    assert.deepEqual(r.h.calls, [['push', '/vault/creator-real'], ['push', '/vault/drop/drop-real'], ['push', '/vault/product/product-real']]);
  } finally { await r.h.unmount(); }
});
for (const name of ['CreatorVaultHome', 'CreatorStudio', 'CreatorCollections']) test(`${name} no-Vault state offers browsing instead of false publishing`, async () => {
  const h = studio(`components/vault/${name}.tsx`); try { await h.mount(); const empty = h.nodes.find(n => n.props.actionLabel === 'Browse Vault'); assert.ok(empty);
    assert.match(empty.props.body, /unavailable|browse/i); await h.act(async () => empty.props.onAction()); assert.deepEqual(h.calls, [['push', '/(vault)']]);
    assert.ok(!h.nodes.some(n => n.props.actionLabel === 'Create Vault'));
  } finally { await h.unmount(); }
});
for (const name of ['CreatorVaultHome', 'CreatorStudio']) test(`${name} retains existing Drop read/removal, not draft Publish`, async () => {
  const h = studio(`components/vault/${name}.tsx`, { id: 'owned', title: 'Owned' }); let removed = 0;
  h.services.fetchStorefront = async () => [{ id: 'draft', status: 'draft' }]; h.services.deleteDrop = async () => removed++;
  try { await h.mount(); const row = h.nodes.find(n => n.type === 'Drop'); assert.ok(row); assert.equal(row.props.onPublish, undefined);
    await h.act(async () => row.props.onOpen()); assert.deepEqual(h.calls, [['push', '/vault/drop/draft']]);
    await h.act(async () => row.props.onRemove()); assert.equal(removed, 1);
    assert.equal(button(h, 'New Drop').props.admission, 'creator');
    const manage = button(h, name === 'CreatorStudio' ? 'Manage Vault' : 'Manage'); await h.act(async () => manage.props.onPress());
    assert.equal(h.nodes.find(n => n.type === 'Form').props.mode, 'edit');
  } finally { await h.unmount(); }
});
test('empty creator chapter removes new-publishing action while keeping history row routes', async () => {
  const h = harness('components/vault/world/WorldChapter.tsx', { row: { kind: 'empty' }, isSelf: true, personality: 'editorial', onCreate: () => assert.fail('deferred publish') }, e => e.WorldChapter.type, { dependencies:
    Object.fromEntries(['LiveChapter', 'AiChapter', 'CommunityChapterCard', 'WorldDropsChapter', 'SeriesComposition'].map(name => [name, { [name]: name }])) });
  try { await h.mount(); assert.match(h.tree.props.body, /unavailable/); assert.equal(h.tree.props.onAction, undefined); assert.equal(h.tree.props.actionLabel, undefined); } finally { await h.unmount(); }
});
test('existing entitlement labels and new publishing availability remain separate', async () => {
  const h = harness('components/vault/VaultAvailability.tsx', { state: 'member' });
  try { await h.mount(); assert.match(text(h.tree), /Member access/); assert.doesNotMatch(text(h.tree), /Unavailable/); } finally { await h.unmount(); }
  const copy = harness('components/vault/VaultAvailability.tsx', {}, e => e.VaultPublishingAvailability);
  try { await copy.mount(); assert.match(text(copy.tree), /public free content.*authorized library/); assert.match(text(copy.tree), /publishing.*unavailable/); } finally { await copy.unmount(); }
});
test('digital creator connection/configuration are deferred while existing Preview and Disconnect remain reachable', async () => {
  for (const connected of [false, true]) {
    const h = harness('components/vault/ai/DigitalVersionPanel.tsx', { config: { connected }, displayName: 'Creator', creatorName: 'Creator', onConnect: () => assert.fail('deferred connection'), onPreview() {}, onDisconnect() {} });
    try { await h.mount(); assert.equal(button(h, connected ? 'Configure' : 'Connect').props.admission, 'ai');
      if (connected) { assert.equal(button(h, 'Disconnect').props.admission, undefined); assert.equal(button(h, 'Preview').props.admission, undefined); }
      else assert.match(text(h.tree), /unavailable in this beta/);
    } finally { await h.unmount(); }
  }
});
test('discovery cards distinguish read/preview and deferred admission without disabling reads', async () => {
  for (const [kind, label] of [['VAULT', /READ \/ PREVIEW/], ['CREATOR', /VIEW PROFILE/], ['CHALLENGE', /VIEW \/ HISTORY/], ['TREASURE', /VIEW \/ HISTORY/], ['TAKE', /TAKE/]]) {
    let opened = 0; const h = harness('components/explore/ExploreDiscoveryCard.tsx', { kind, title: 'Real content', onPress: () => opened++ });
    try { await h.mount(); assert.match(h.tree.props.accessibilityLabel, label); await h.act(async () => h.tree.props.onPress()); assert.equal(opened, 1); } finally { await h.unmount(); }
  }
});
test('service discovery opens details without implying or performing a new request', async () => {
  const opened = [], h = harness('components/vault/world/SessionInvite.tsx', { items: [{ id: 'service-real', title: 'Existing offer' }], creatorName: 'Creator', onOpen: id => opened.push(id) }, e => e.SessionInvite.type);
  try { await h.mount(); assert.match(text(h.tree), /VIEW DETAILS/); assert.doesNotMatch(text(h.tree), /REQUEST SESSION/);
    await h.act(async () => button(h, 'View service details: Existing offer').props.onPress()); assert.deepEqual(opened, ['service-real']);
  } finally { await h.unmount(); }
});
test('self and creator Profile Vault entries preserve the profile stack and real creator ID', async () => {
  for (const [self, hasVault] of [[true, true], [true, false], [false, true]]) {
    const dispatch = () => {}, id = self ? 'profile-a' : 'creator-real';
    const h = harness('components/profile/ProfileScreen.tsx', { profileId: id }, undefined, { dependencies: {
      'react-native': native, store: { useClash: () => ({ state: h.state, dispatch }), showNotice: text => text },
      ...Object.fromEntries(['ProfileHeader', 'AppearanceRow', 'EditProfileSheet', 'SignOutSheet', 'PostActionsSheet'].map(name => [name, { [name]: name }])),
      ProfileLists: { ProfileClashRow: 'Clash', ProfileReplyItem: 'Reply', ProfileTakeItem: 'Take' },
    } });
    Object.assign(h.services, { fetchProfileById: async () => ({ id, name: 'Creator' }), fetchFollowState: async () => ({ following: false }),
      fetchViewerSafetyState: async () => ({ blockedProfileIds: [], blockingProfileIds: [] }), fetchVault: async () => hasVault ? { id: 'vault-real' } : null,
      fetchProfileTakes: async () => [] });
    try { await h.mount(); const label = hasVault ? self ? 'Read your Vault' : "Read Creator's Vault" : 'Browse Vault creators';
      const entry = button(h, label); assert.ok(entry, label); const old = entry.props.onPress; await h.act(async () => old());
      assert.deepEqual(h.calls, [['push', hasVault ? `/vault/${id}` : '/(vault)']]);
      h.auth = { signedIn: true, user: { id: 'another-account' } }; await h.update(); await h.act(async () => old()); assert.equal(h.calls.length, 1);
    } finally { await h.unmount(); }
  }
});
test('local demo labels retain both development JS and native-variant gates', async () => {
  const prior = global.__DEV__;
  try { for (const [file, route] of [['components/play/signal/SignalEntry.tsx', '/explore/play/signal'], ['components/vault/story/StoryEntry.tsx', '/vault/story'], ['components/world/beacon/BeaconEntry.tsx', '/world/beacon']]) {
    for (const [dev, variant, visible] of [[false, 'development', false], [true, 'production', false], [true, 'development', true]]) {
      global.__DEV__ = dev; const h = harness(file, {}, undefined, { dependencies: {
        'expo-constants': { __esModule: true, default: { expoConfig: { extra: { appVariant: variant } } } }, SignalBoard: { SignalPattern: 'Pattern' },
      } });
      try { await h.mount(); if (!visible) assert.equal(h.tree, null); else { assert.match(text(h.tree), /Local demo|LOCAL DEMO/);
        await h.act(async () => h.tree.props.onPress()); assert.deepEqual(h.calls, [['push', route]]); }
      } finally { await h.unmount(); }
    }
  } } finally { global.__DEV__ = prior; }
});
test('deep-linked Vault compose remains blocked without mounting publishing hooks; Back restores context', async () => {
  const base = harness('components/shared/ReleaseUnavailable.tsx', { capability: 'creator' });
  try { const guard = base.load('components/shared/ReleaseUnavailable.tsx').withReleaseAdmission(() => assert.fail('must not mount publisher'), 'creator');
    assert.equal(guard().props.capability, 'creator'); base.router.canGoBack = () => true;
    await base.mount(); await base.act(async () => button(base, 'Back').props.onPress()); assert.deepEqual(base.calls, [['back']]);
  } finally { await base.unmount(); }
});
