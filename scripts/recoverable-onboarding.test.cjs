// Production components/hooks and service bodies, with controlled SDK/native boundaries only.
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, React, deferred, text } = require('./ui-completion-harness.cjs');
const incomplete = { topicIds: [], version: 0, revision: 0, skipped: false };
const selected = ['film', 'sport', 'technology'];
const saved = changes => ({ topicIds: selected, version: 1, revision: 1, skipped: false, ...changes });
const catalogue = selected.map(id => ({ id, name: id, description: id, hoods: [] }));
function native() {
  const listeners = new Set();
  return { listeners, module: { ...Object.fromEntries(['View', 'Text', 'Pressable', 'ScrollView', 'ActivityIndicator', 'Modal'].map(k => [k, k])),
    StyleSheet: { create: s => s, absoluteFill: {} }, BackHandler: { addEventListener: (_name, fn) => {
      listeners.add(fn); return { remove: () => listeners.delete(fn) };
    } } } };
}
const button = (h, label) => h.nodes.find(n => n.props.onPress && (n.props.accessibilityLabel === label || text(n).trim() === label));
const press = (h, label) => h.act(async () => { const n = button(h, label); assert.ok(n, label); assert.ok(!n.props.disabled); n.props.onPress(); });
function editor(props = {}) {
  const events = [], calls = [], sdk = [], n = native();
  const h = harness('components/onboarding/ArenaInterestEditor.tsx', { onboarding: true, onSaved: (...args) => calls.push(args), onBack: () => events.push('exit'), ...props }, undefined,
    { dependencies: { 'react-native': n.module, TopicSelection: { TopicSelection: 'Topics' }, haptics: { notify: value => events.push(value) },
      store: { useClash: () => ({ reloadArena: async () => events.push('reload') }) } } });
  h.services.fetchInterestCatalogue = async () => catalogue;
  h.services.fetchMyArenaInterests = async () => incomplete;
  h.services.saveMyArenaInterests = async (...args) => { sdk.push(args); return saved(); };
  const choose = ids => h.act(async () => h.nodes.find(n => n.type === 'Topics').props.onChange(ids));
  return { h, events, calls, sdk, choose, native: n };
}
function gate() {
  const n = native(), events = []; let path = '/take/context', reads = 0;
  const dispatch = event => events.push(event);
  const h = harness('components/onboarding/InterestOnboardingGate.tsx', {}, undefined, { dependencies: {
    'react-native': n.module, 'expo-router': { useRouter: () => h.router, usePathname: () => path },
    store: { useClash: () => ({ dispatch }), markOnboarded: () => ({ type: 'onboarded' }) },
    ArenaInterestEditor: { ArenaInterestEditor: 'Editor' }, OnboardingNextStep: { OnboardingNextStep: 'Next' },
  } });
  h.services.fetchMyArenaInterests = async () => { reads++; return incomplete; };
  return { h, events, native: n, path: next => { path = next; }, get reads() { return reads; } };
}

test('confirmed save uses the existing revision API once and refreshes the feed only after confirmation', async () => {
  const r = editor(), response = deferred(); r.h.services.saveMyArenaInterests = (...args) => { r.sdk.push(args); return response.promise; };
  try { await r.h.mount(); await r.choose(selected); const send = button(r.h, 'Save and continue').props.onPress;
    await r.h.act(async () => { send(); send(); }); assert.equal(r.sdk.length, 1); assert.deepEqual(r.sdk[0].slice(0, 4), [selected, false, 0, 'account-a']);
    assert.equal(r.sdk[0][4](), true); assert.equal(r.calls.length, 0); assert.deepEqual(r.events, []);
    await r.h.act(async () => response.resolve(saved())); assert.deepEqual(r.calls, [[saved(), true]]); assert.deepEqual(r.events, ['success', 'reload']);
  } finally { await r.h.unmount(); }
});

test('a queued tap after confirmed save cannot submit or navigate again', async () => {
  const r = editor();
  try { await r.h.mount(); await r.choose(selected); const send = button(r.h, 'Save and continue').props.onPress;
    await r.h.act(async () => send()); await r.h.act(async () => send());
    assert.equal(r.sdk.length, 1); assert.equal(r.calls.length, 1);
  } finally { await r.h.unmount(); }
});

test('failed save retains the selection and explicit Retry rereads the authoritative revision', async () => {
  for (const code of ['network', 'timeout', 'PT409', '42501']) {
    const r = editor(); r.h.services.saveMyArenaInterests = async () => { throw { code }; };
    try { await r.h.mount(); await r.choose(selected); await press(r.h, 'Save and continue');
      assert.deepEqual(r.h.nodes.find(n => n.type === 'Topics').props.selected, selected); assert.equal(r.calls.length, 0);
      assert.match(text(r.h.tree), /selection|selection is kept/); assert.equal(button(r.h, 'Continue without saving').props.disabled, false);
      r.h.services.fetchMyArenaInterests = async () => { throw Error('still offline'); };
      await press(r.h, 'Retry save'); assert.equal(r.calls.length, 0); assert.deepEqual(r.h.nodes.find(n => n.type === 'Topics').props.selected, selected);
      let reads = 0; r.h.services.fetchMyArenaInterests = async () => { reads++; return saved({ topicIds: ['a', 'b', 'c'], revision: 7 }); };
      r.h.services.saveMyArenaInterests = async (...args) => { r.sdk.push(args); return saved({ revision: 8 }); };
      await press(r.h, 'Retry save'); assert.equal(reads, 1); assert.deepEqual(r.sdk[0].slice(0, 4), [selected, false, 7, 'account-a']);
      assert.deepEqual(r.calls, [[saved({ revision: 8 }), true]]);
    } finally { await r.h.unmount(); }
  }
});

test('ambiguous save confirmed by Retry read is not submitted again', async () => {
  const r = editor(); let writes = 0;
  r.h.services.saveMyArenaInterests = async () => { writes++; throw { code: 'timeout' }; };
  try { await r.h.mount(); await r.choose(selected); await press(r.h, 'Save and continue');
    r.h.services.fetchMyArenaInterests = async () => saved(); await press(r.h, 'Retry save');
    assert.equal(writes, 1); assert.deepEqual(r.calls, [[saved(), true]]);
  } finally { await r.h.unmount(); }
});

test('exiting during load or save does not claim persistence or allow late success navigation', async () => {
  for (const phase of ['load', 'save']) {
    const r = editor(), pending = deferred();
    if (phase === 'load') r.h.services.fetchMyArenaInterests = () => pending.promise;
    else r.h.services.saveMyArenaInterests = () => pending.promise;
    try { await r.h.mount(); if (phase === 'save') { await r.choose(selected); await press(r.h, 'Save and continue'); }
      const exit = button(r.h, phase === 'save' ? 'Continue while save is pending' : 'Continue without saving').props.onPress;
      await r.h.act(async () => { exit(); exit(); }); await r.h.act(async () => pending.resolve(saved()));
      assert.deepEqual(r.events, ['exit']); assert.deepEqual(r.calls, []); assert.deepEqual(r.h.calls, []);
    } finally { await r.h.unmount(); }
  }
});

test('account A-B-A and unmount fence delayed saves and old submit callbacks', async () => {
  for (const mode of ['account', 'unmount']) {
    const r = editor(), pending = deferred(); r.h.services.saveMyArenaInterests = (...args) => { r.sdk.push(args); return pending.promise; };
    await r.h.mount(); await r.choose(selected); const stale = button(r.h, 'Save and continue').props.onPress;
    await r.h.act(async () => stale());
    if (mode === 'account') { r.h.auth = { user: { id: 'account-b' }, signedIn: true }; await r.h.update();
      assert.deepEqual(r.h.nodes.find(n => n.type === 'Topics').props.selected, []);
      r.h.auth = { user: { id: 'account-a' }, signedIn: true }; await r.h.update(); }
    else await r.h.unmount();
    await r.h.act(async () => pending.resolve(saved())); await r.h.act(async () => stale());
    assert.equal(r.sdk.length, 1); assert.deepEqual(r.calls, []); assert.deepEqual(r.events, []);
    if (mode !== 'unmount') await r.h.unmount();
  }
});

test('read failure offers bounded Retry and Exit; a server-confirmed skip is distinct from unsaved continuation', async () => {
  const r = editor(); r.h.services.fetchInterestCatalogue = async () => { throw Error('offline'); };
  try { await r.h.mount(); assert.ok(button(r.h, 'Continue without saving')); const retry = button(r.h, 'Retry').props.onPress;
    let reads = 0; r.h.services.fetchInterestCatalogue = async () => { reads++; return catalogue; };
    await r.h.act(async () => { retry(); retry(); }); assert.equal(reads, 1);
    r.h.services.saveMyArenaInterests = async (...args) => { r.sdk.push(args); return saved({ topicIds: [], skipped: true }); };
    await press(r.h, 'Save general feed preference'); assert.deepEqual(r.sdk[0].slice(0, 4), [[], true, 0, 'account-a']);
    assert.equal(r.calls[0][0].skipped, true); assert.equal(r.calls[0][0].version, 1);
  } finally { await r.h.unmount(); }
});

test('Retry preserves a failed general-feed choice instead of silently saving selected topics', async () => {
  const r = editor(); r.h.services.saveMyArenaInterests = async () => { throw Error('offline'); };
  try { await r.h.mount(); await r.choose(selected); await press(r.h, 'Save general feed preference');
    assert.deepEqual(r.h.nodes.find(n => n.type === 'Topics').props.selected, selected);
    r.h.services.saveMyArenaInterests = async (...args) => { r.sdk.push(args); return saved({ topicIds: [], skipped: true }); };
    await press(r.h, 'Retry general feed preference'); assert.deepEqual(r.sdk[0].slice(0, 4), [[], true, 0, 'account-a']);
    assert.deepEqual(r.calls, [[saved({ topicIds: [], skipped: true }), true]]);
  } finally { await r.h.unmount(); }
});

test('gate loading/error exit and Android Back never mark preferences saved or redirect', async () => {
  for (const mode of ['loading', 'error', 'back']) {
    const r = gate(), pending = deferred(); r.h.services.fetchMyArenaInterests = mode === 'error' ? async () => { throw Error('offline'); } : () => pending.promise;
    try { await r.h.mount(); if (mode === 'back') await r.h.act(async () => { assert.equal(r.h.tree.type, 'Modal'); r.h.tree.props.onRequestClose(); });
      else await press(r.h, 'Continue without saving');
      await r.h.act(async () => pending.resolve(saved())); assert.equal(r.h.tree, null); assert.deepEqual(r.events, []); assert.deepEqual(r.h.calls, []);
      assert.equal(r.native.listeners.size, 0); r.path('/arena/challenges'); await r.h.update(); assert.equal(r.h.tree, null);
    } finally { await r.h.unmount(); }
  }
});

test('gate retries once, accepts only confirmed completion and offers the existing first-action handoff', async () => {
  const r = gate(); r.h.services.fetchMyArenaInterests = async () => { throw Error('offline'); };
  try { await r.h.mount(); let reads = 0; r.h.services.fetchMyArenaInterests = async () => { reads++; return incomplete; };
    const retry = button(r.h, 'Retry preferences').props.onPress; await r.h.act(async () => { retry(); retry(); }); assert.equal(reads, 1);
    const child = r.h.nodes.find(n => n.type === 'Editor'); await r.h.act(async () => child.props.onSaved(incomplete)); assert.deepEqual(r.events, []);
    await r.h.act(async () => child.props.onSaved(saved())); assert.deepEqual(r.events, [{ type: 'onboarded' }]);
    await r.h.act(async () => r.h.nodes.find(n => n.type === 'Next').props.onDone('/arena/challenges'));
    assert.equal(r.h.tree, null); assert.deepEqual(r.h.calls, [['push', '/arena/challenges']]);
  } finally { await r.h.unmount(); }
});

test('returning completed users are not gated; incomplete users can reopen Interests without a loop', async () => {
  const r = gate(); let reads = 0;
  r.h.services.fetchMyArenaInterests = async () => { reads++; if (reads > 1) throw Error('now offline'); return saved(); };
  try { await r.h.mount(); assert.equal(r.h.tree, null); assert.deepEqual(r.events, [{ type: 'onboarded' }]);
    r.path('/take/next-context'); await r.h.update(); assert.equal(reads, 1); assert.equal(r.h.tree, null);
    r.h.auth = { user: { id: 'account-b' }, signedIn: true }; r.h.services.fetchMyArenaInterests = async () => incomplete;
    await r.h.update(); assert.ok(r.h.nodes.find(n => n.type === 'Editor'));
    r.path('/interests'); await r.h.update(); assert.equal(r.h.tree, null); assert.equal(r.native.listeners.size, 0);
    r.path('/take/context'); await r.h.update(); assert.equal(r.h.tree, null); assert.deepEqual(r.h.calls, []);
    // Session dismissal is not persisted: another account epoch must read its own server state.
    r.h.auth = { user: { id: 'account-a' }, signedIn: true }; await r.h.update(); assert.ok(r.h.nodes.find(n => n.type === 'Editor'));
  } finally { await r.h.unmount(); }
});

test('old gate reads, completion callbacks and exit callbacks cannot survive account A-B-A', async () => {
  const r = gate();
  try { await r.h.mount(); const old = r.h.nodes.find(n => n.type === 'Editor').props;
    const delayed = deferred(); r.h.services.fetchMyArenaInterests = () => delayed.promise;
    r.h.auth = { user: { id: 'account-b' }, signedIn: true }; await r.h.update();
    r.h.services.fetchMyArenaInterests = async () => incomplete; r.h.auth = { user: { id: 'account-a' }, signedIn: true }; await r.h.update();
    await r.h.act(async () => { old.onSaved(saved()); old.onBack(); delayed.resolve(saved()); });
    assert.ok(r.h.nodes.find(n => n.type === 'Editor')); assert.deepEqual(r.events, []); assert.deepEqual(r.h.calls, []);
  } finally { await r.h.unmount(); }
});

test('first-action discovery uses a real returned Take or honest empty/error alternatives, with no writes', async () => {
  for (const state of ['populated', 'empty', 'error']) {
    const n = native(), routes = [];
    const h = harness('components/onboarding/OnboardingNextStep.tsx', { onDone: destination => routes.push(destination) }, undefined, { dependencies: { 'react-native': n.module } });
    h.services.fetchPersonalizedArenaTakes = async () => { if (state === 'error') throw Error('offline'); return state === 'empty' ? [] : [{ id: 'server-take', text: 'Returned public Take' }]; };
    try { await h.mount(); if (state === 'populated') {
      const read = button(h, 'Read this Take').props.onPress; await h.act(async () => { read(); read(); }); assert.deepEqual(routes, ['/take/server-take']);
    } else { assert.equal(button(h, 'Read this Take'), undefined); assert.match(text(h.tree), state === 'empty' ? /No public Takes/ : /Could not load Takes/);
      if (state === 'error') { h.services.fetchPersonalizedArenaTakes = async () => []; await press(h, 'Retry Takes'); assert.match(text(h.tree), /No public Takes/); }
      await press(h, 'View Challenge Inbox'); assert.deepEqual(routes, ['/arena/challenges']);
    } } finally { await h.unmount(); }
  }
});

test('reopened incomplete editor leads to first action; Back and ordinary edits preserve the previous stack', async () => {
  const h = harness('app/interests.tsx', {}, undefined, { dependencies: { native: { useIsFocused: () => true }, ArenaInterestEditor: { ArenaInterestEditor: 'Editor' }, OnboardingNextStep: { OnboardingNextStep: 'Next' } } });
  h.router.canGoBack = () => true;
  try { await h.mount(); await h.act(async () => h.tree.props.onBack()); assert.deepEqual(h.calls, [['back']]);
    await h.act(async () => h.tree.props.onSaved(saved(), true)); assert.equal(h.tree.type, 'Next');
    await h.act(async () => h.tree.props.onDone('/take/server-take')); assert.deepEqual(h.calls.at(-1), ['replace', '/take/server-take']);
    h.auth = { user: { id: 'account-b' }, signedIn: true }; await h.update(); assert.equal(h.tree.type, 'Editor');
    await h.act(async () => h.tree.props.onSaved(saved(), false)); assert.deepEqual(h.calls.at(-1), ['back']);
  } finally { await h.unmount(); }
});

test('an Interests save cannot pop a different foreground route or revive a stale navigation callback', async () => {
  let focused = true;
  const h = harness('app/interests.tsx', {}, undefined, { dependencies: { native: { useIsFocused: () => focused },
    ArenaInterestEditor: { ArenaInterestEditor: 'Editor' }, OnboardingNextStep: { OnboardingNextStep: 'Next' } } });
  h.router.canGoBack = () => true;
  try { await h.mount(); const old = h.tree.props;
    focused = false; await h.update(); await h.act(async () => old.onSaved(saved(), false)); assert.deepEqual(h.calls, []);
    focused = true; await h.update(); await h.act(async () => old.onBack()); assert.deepEqual(h.calls, []);
    await h.act(async () => h.tree.props.onBack()); assert.deepEqual(h.calls, [['back']]);
  } finally { await h.unmount(); }
});

test('a mounted editor can edit again after a confirmed background save, but its old submit stays invalid', async () => {
  const r = editor();
  try { await r.h.mount(); await r.choose(selected); const stale = button(r.h, 'Save and continue').props.onPress;
    await r.h.act(async () => stale()); await r.choose(['a', 'b', 'c']);
    await r.h.act(async () => stale()); assert.equal(r.sdk.length, 1);
    r.h.services.saveMyArenaInterests = async (...args) => { r.sdk.push(args); return saved({ topicIds: ['a', 'b', 'c'], revision: 2 }); };
    await press(r.h, 'Save and continue'); assert.deepEqual(r.sdk[1].slice(0, 4), [['a', 'b', 'c'], false, 1, 'account-a']);
  } finally { await r.h.unmount(); }
});

test('real SDK service times out even if an aborted transport never settles, without connecting to a database', async () => {
  const timers = new Map(), requests = []; let id = 0;
  class ApiError extends Error { constructor(message, code) { super(message); this.code = code; } }
  const h = harness('services/arenaInterestService.ts', {}, () => () => null, { setTimeout: (fn, delay) => { const key = ++id; timers.set(key, { fn, delay }); return key; },
    clearTimeout: key => timers.delete(key), dependencies: { arenaMappers: { toTake: value => value },
      supabaseClient: { currentUserId: async () => 'account-a', SupabaseError: ApiError, requestError: e => e,
        requireSupabase: () => ({ rpc: (name, args) => ({ abortSignal: signal => { requests.push({ name, args, signal }); return new Promise(() => {}); } }) }) } } });
  const service = h.load('services/arenaInterestService.ts');
  try { for (const run of [() => service.fetchMyArenaInterests('account-a'), () => service.saveMyArenaInterests(selected, false, 0, 'account-a'), () => service.fetchPersonalizedArenaTakes()]) {
    const result = run(), rejected = assert.rejects(result, { code: 'timeout' }); await h.act(async () => {});
    const timer = [...timers.values()][0]; assert.equal(timer.delay, 15000); timer.fn(); await rejected;
    assert.equal(requests.at(-1).signal.aborted, true); assert.equal(timers.size, 0);
  } assert.deepEqual(requests.map(r => r.name), ['get_my_arena_interests', 'save_my_arena_interests', 'rank_arena_for_you']);
  const before = requests.length; await assert.rejects(service.saveMyArenaInterests(selected, false, 0, 'account-a', () => false), { code: 'account_changed' }); assert.equal(requests.length, before);
  } finally { await h.unmount(); }
});

test('production editor completion feeds the actual gate callback only after the existing API confirms saving', async () => {
  const g = gate(), pending = deferred(); let e;
  try { await g.h.mount(); e = editor(g.h.nodes.find(n => n.type === 'Editor').props);
    e.h.services.saveMyArenaInterests = () => pending.promise; await e.h.mount(); await e.choose(selected); await press(e.h, 'Save and continue');
    assert.deepEqual(g.events, []); assert.ok(g.h.nodes.find(n => n.type === 'Editor'));
    await e.h.act(async () => pending.resolve(saved())); assert.deepEqual(g.events, [{ type: 'onboarded' }]);
    assert.ok(g.h.nodes.find(n => n.type === 'Next')); assert.deepEqual(g.h.calls, []);
  } finally { if (e) await e.h.unmount(); await g.h.unmount(); }
});

test('a stale first-action read or navigation callback cannot cross account epochs', async () => {
  const n = native(), routes = [], pending = deferred();
  const h = harness('components/onboarding/OnboardingNextStep.tsx', { onDone: path => routes.push(path) }, undefined, { dependencies: { 'react-native': n.module } });
  h.services.fetchPersonalizedArenaTakes = () => pending.promise;
  try { await h.mount(); const stale = button(h, 'View Challenge Inbox').props.onPress;
    h.auth = { user: { id: 'account-b' }, signedIn: true }; h.services.fetchPersonalizedArenaTakes = async () => []; await h.update();
    h.auth = { user: { id: 'account-a' }, signedIn: true }; await h.update();
    await h.act(async () => { pending.resolve([{ id: 'old-account-take', text: 'Old snapshot' }]); stale(); });
    assert.equal(button(h, 'Read this Take'), undefined); assert.deepEqual(routes, []);
    await press(h, 'Continue where I was'); assert.deepEqual(routes, [undefined]);
  } finally { await h.unmount(); }
});
