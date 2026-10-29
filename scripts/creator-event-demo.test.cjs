const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), babel = require('@babel/core');
const { harness, text } = require('./ui-completion-harness.cjs');
const dependencies = {
  ThemeProvider: { PresentationThemeProvider: 'Theme' },
  'expo-status-bar': { StatusBar: 'StatusBar' },
  ArenaPrimitives: { ArenaButton: 'Button' }, ArenaSheet: { ArenaSheet: 'Sheet' },
};
const button = (h, label) => h.nodes.find(n => n.props?.label === label || n.props?.accessibilityLabel === label);
const press = (h, label) => h.act(async () => { const n = button(h, label); assert.ok(n, label); assert.ok(!n.props.disabled, label + ' is enabled'); n.props.onPress(); });
const base = 'components/dev/creatorEventDemo/';

test('actual local event and decision callbacks complete all three distinct choice/consequence sequences', async () => {
  for (const [choice, title] of [['bridge', 'Build a bridge'], ['tower', 'Raise a tower'], ['spiral', 'Make a spiral']]) {
    let now = Date.now(), exits = 0;
    const h = harness(base + 'CreatorEventDemo.tsx', { onExit: () => exits++, onTheme() {} }, e => e.EventExperience,
      { dependencies: { ...dependencies, useClock: { useClock: () => now } } });
    const child = harness(base + 'RoundDecision.tsx', {}, e => e.RoundDecision, { dependencies });
    try {
      await h.mount(); assert.match(text(h.tree), /LOCAL ONLY/);
      assert.equal(h.tree.props.style.paddingTop, 24);
      assert.equal(h.tree.props.style.paddingBottom, 16, 'root owns the Android system-bar inset');
      assert.equal(h.nodes.find(n => n.type === 'ScrollView').props.contentContainerStyle.paddingBottom, 32, 'content does not double-apply the inset');
      assert.equal(h.nodes.some(n => n.type.name === 'RoundDecision'), false);
      await press(h, 'Enter local event');
      const props = () => h.nodes.find(n => n.type.name === 'RoundDecision').props;
      await child.update(props()); assert.equal(button(child, 'Confirm local choice').props.disabled, true);
      await press(child, title); await child.update(props());
      const confirm = button(child, 'Confirm local choice').props.onPress;
      await child.act(async () => { confirm(); confirm(); }); await child.update(props());
      assert.match(text(child.tree), /Local ballot confirmed/); assert.equal(props().event.ballot, choice);
      assert.equal(button(child, 'Confirm local choice').props.disabled, true);
      assert.equal(h.nodes.find(n => n.type.name === 'EventStage').props.event.phase, 'voting');
      await press(h, 'Host controls'); await press(h, 'Close local round'); await child.update(props());
      assert.match(text(h.tree), /ROUND CLOSED/); assert.equal(button(child, 'Confirm local choice'), undefined);
      await press(h, 'Reveal local outcome'); assert.match(text(h.tree), new RegExp('Local outcome: ' + title));
      const stage = h.nodes.find(n => n.type.name === 'EventStage');
      const visual = harness(base + 'EventStage.tsx', stage.props, e => e.EventStage,
        { dependencies: { 'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path' } } });
      try { await visual.mount(); assert.match(text(visual.tree), /challenge is now/); assert.equal(visual.nodes.find(n => n.type === 'Path').props.d.length > 20, true); }
      finally { await visual.unmount(); }
      await press(h, 'Finish local event'); assert.match(text(h.tree), /EVENT FINISHED/);
      await press(h, 'Replay local event'); assert.match(text(h.tree), /BEFORE THE FIRST FOLD/);
      await press(h, 'Back'); assert.equal(exits, 1);
      assert.deepEqual(h.calls, [], 'no application services or navigation mutations');
    } finally { await child.unmount(); await h.unmount(); }
  }
});

test('deadline fences late choices, host cannot vote, no-vote result invents no winner, reset clears the ballot', async () => {
  const h = harness(base + 'model.ts', {}, e => () => e), m = h.load(base + 'model.ts');
  let state = m.eventStep(m.initialEvent(), { type: 'enter', now: 1000 });
  state = m.eventStep(state, { type: 'select', choice: 'tower', now: 1500 });
  const deadline = state.closesAt;
  state = m.eventStep(state, { type: 'confirm', now: deadline });
  assert.equal(state.phase, 'closed'); assert.equal(state.ballot, null);
  state = m.eventStep(state, { type: 'advance', now: deadline }); assert.equal(state.phase, 'closed');
  state = m.eventStep(state, { type: 'role', role: 'host' });
  state = m.eventStep(state, { type: 'advance', now: deadline }); assert.equal(m.appliedChoice(state), null);
  const fresh = m.eventStep(m.eventStep(m.initialEvent(), { type: 'enter', now: 1000 }), { type: 'role', role: 'host' });
  assert.deepEqual(m.eventStep(fresh, { type: 'select', choice: 'bridge', now: 1200 }), fresh);
  assert.deepEqual(m.eventStep(state, { type: 'reset' }), m.initialEvent());
});

test('mounted clock closes voting after elapsed time and no-ballot host/reset states remain honest', async () => {
  let now = Date.now(); const h = harness(base + 'CreatorEventDemo.tsx', { onExit() {}, onTheme() {} }, e => e.EventExperience,
    { dependencies: { ...dependencies, useClock: { useClock: () => now } } });
  try {
    await h.mount(); await press(h, 'Enter local event');
    now += 60_000; await h.update(); assert.match(text(h.tree), /ROUND CLOSED/);
    await press(h, 'Host controls'); await press(h, 'Reveal local outcome'); assert.match(text(h.tree), /No winning choice/);
    await press(h, 'Reset local event'); assert.match(text(h.tree), /BEFORE THE FIRST FOLD/);
  } finally { await h.unmount(); }
});

test('presentation wraps without text caps at narrow/large input sizes; result motion respects system and preview reduction', async () => {
  const h = harness(base + 'EventStage.tsx', { event: { phase: 'reveal', ballot: 'tower' }, reduceMotion: false }, e => e.EventStage,
    { dependencies: { 'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path' } } });
  try {
    h.motion.reduced = false; await h.mount(); assert.ok(h.animations.some(a => a[1] === 420));
    for (const width of [320, 360, 430]) for (const fontScale of [1, 1.3]) for (const scheme of ['light', 'dark']) {
      Object.assign(h.dimensions, { width, fontScale }); h.colors.scheme = scheme; await h.update();
      assert.ok(h.nodes.filter(n => n.type === 'Text').every(n => n.props.numberOfLines === undefined && n.props.allowFontScaling !== false));
    }
    await h.update({ event: { phase: 'reveal', ballot: 'tower' }, reduceMotion: true });
    assert.ok(h.nodes.filter(n => n.props.accessibilityLabel?.startsWith('Paper stage:')).every(n => n.props.entering === undefined));
    h.motion.reduced = true; await h.update({ event: { phase: 'reveal', ballot: 'bridge' }, reduceMotion: false });
    assert.ok(h.nodes.filter(n => n.props.accessibilityLabel?.startsWith('Paper stage:')).every(n => n.props.entering === undefined));
  } finally { await h.unmount(); }
});

test('development Settings launcher is absent for release variants and opens only the existing guarded demo route', async () => {
  const saved = global.__DEV__; const constants = { expoConfig: { extra: { appVariant: 'development' } } };
  const h = harness('app/settings.tsx', {}, undefined, { dependencies: { 'expo-constants': { __esModule: true, default: constants } } });
  try {
    for (const dev of [false, true]) for (const variant of ['development', 'production', 'preview', undefined]) {
      global.__DEV__ = dev; constants.expoConfig.extra.appVariant = variant; await h.update();
      assert.equal(Boolean(button(h, 'Interactive creator event demo')), dev && variant === 'development');
    }
    global.__DEV__ = true; constants.expoConfig.extra.appVariant = 'development'; await h.update();
    await press(h, 'Interactive creator event demo'); assert.deepEqual(h.calls.pop(), ['push', '/demo-arena?demoScreen=creator-event']);
  } finally { global.__DEV__ = saved; await h.unmount(); }
});

test('compiled creator demo has no service, auth, persistence, network or hardware boundary', () => {
  for (const file of fs.readdirSync(base).filter(p => /\.tsx?$/.test(p))) {
    const code = babel.transformSync(fs.readFileSync(path.join(base, file), 'utf8'), { filename: file, babelrc: false, configFile: false,
      presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]], plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
    assert.doesNotMatch(code, /require\([^)]*(?:\/services\/|\/store(?:["'/])|AuthProvider|async-storage)/);
    assert.doesNotMatch(code, /\bfetch\s*\(|\bnew WebSocket|\.rpc\s*\(|AsyncStorage|\.setItem\(/);
  }
});

test('actual direct demo entry rejects nondevelopment identities and preserves ordinary Demo Arena navigation', async () => {
  const saved = global.__DEV__, constants = { expoConfig: { extra: { appVariant: 'development' } } }, params = { demoScreen: 'creator-event' };
  let back = 0;
  const h = harness('components/dev/arenaDemo/entry.tsx', {}, undefined, { dependencies: {
    'expo-constants': { __esModule: true, default: constants },
    'expo-router': { useRouter: () => ({ canGoBack: () => true, back: () => back++ }), useLocalSearchParams: () => params },
    DemoArena: { DemoArena: 'DemoArena' }, CreatorEventDemo: { CreatorEventDemo: 'CreatorEvent' }, Disabled: { __esModule: true, default: 'Disabled' },
  } });
  try {
    for (const dev of [false, true]) for (const variant of ['development', 'preview', 'production', undefined]) {
      global.__DEV__ = dev; constants.expoConfig.extra.appVariant = variant; await h.update();
      assert.equal(h.tree.type, dev && variant === 'development' ? 'CreatorEvent' : 'Disabled');
    }
    global.__DEV__ = true; constants.expoConfig.extra.appVariant = 'development'; await h.update();
    await h.act(async () => h.tree.props.onExit()); assert.equal(back, 1);
    params.demoScreen = 'room'; await h.update(); assert.equal(h.tree.type, 'DemoArena'); assert.equal(h.tree.props.initialPage.kind, 'room');
  } finally { global.__DEV__ = saved; await h.unmount(); }
});
