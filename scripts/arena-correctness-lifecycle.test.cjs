const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), babel = require('@babel/core');
function load(file, requireMock) {
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, babelrc: false, configFile: false,
    presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'classic' }]], plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: requireMock,
    setTimeout: (...args) => clock.set(...args), clearTimeout: id => clock.clear(id), Date });
  return module.exports;
}
let clock;
function harness(file, name, reduced = false, sharedRegistry) {
  let time = 0, nextTimer = 0, index = 0, effects = [], slots = [], timers = new Map(), haptics = 0;
  clock = { set(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: time + delay }); return id; }, clear(id) { timers.delete(id); } };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(value) { const i = index++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(value) { const i = index++; return slots[i] ??= { current: value }; },
    useEffect(fn, deps) { const i = index++, previous = slots[i]; if (!previous || deps.some((v, n) => !Object.is(v, previous.deps[n]))) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const registry = sharedRegistry ?? load('utils/motionOnce.ts', () => { throw Error('Unexpected dependency'); });
  const chain = new Proxy({}, { get: () => () => chain });
  const exported = load(file, dep => {
    if (dep === 'react') return React;
    if (dep === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'Input', FlatList: 'List', Platform: { OS: 'android' }, StyleSheet: { create: x => x }, useWindowDimensions: () => ({ width: 360, fontScale: 1 }) };
    if (dep === 'react-native-reanimated') return { __esModule: true, default: { View: 'AnimatedView', Text: 'AnimatedText' },
      FadeIn: chain, FadeInDown: chain, SlideInLeft: chain, SlideInRight: chain, ZoomIn: chain, Easing: { out: x => x, cubic: 0 },
      useReducedMotion: () => reduced, useSharedValue: value => React.useRef(value).current, useAnimatedStyle: () => ({}) };
    if (dep.endsWith('/motionOnce')) return registry;
    if (dep.endsWith('/crowdPresentation')) return load('utils/crowdPresentation.ts', () => { throw Error('Unexpected dependency'); });
    if (dep.endsWith('/arenaCrowd')) return { validCrowdText: text => !!text.trim() };
    if (dep.endsWith('/haptics')) return { notify: () => { haptics++; } };
    if (dep.endsWith('/verdictView')) return { verdictView: () => ({ title: 'Official result', aPct: 50, bPct: 50 }) };
    if (dep.endsWith('/liveArenaStyles')) return { hexWithAlpha: x => x, verdictMetrics: () => ({}), crowdRowLabel: (author, body) => author + body };
    if (dep.endsWith('/Avatar')) return { Avatar: 'Avatar' };
    if (dep.endsWith('/ArenaAtmosphere')) return { ArenaAtmosphere: 'Atmosphere' };
    if (dep.endsWith('/theme')) return { useThemeColors: () => ({}), space: {}, typeScale: {}, layout: {} };
    throw Error('Unexpected dependency: ' + dep);
  });
  return { registry, get haptics() { return haptics; },
    render(props, commit = true) { index = 0; effects = []; const tree = exported[name](props); if (commit) effects.forEach(fn => fn()); return tree; },
    tick(ms) { const end = time + ms; for (;;) { const due = [...timers].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; time = due[1].at; timers.delete(due[0]); due[1].fn(); } time = end; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
const duel = { clashId: 'c', status: 'settled', fighterA: { name: 'A' }, fighterB: { name: 'B' }, verdict: { verdictLabel: 'DRAW', jurySize: 2 } };
test('actual entrance rerenders do not restart deadline; latest callback fires once', () => {
  const h = harness('components/liveArena/DuelEntrance.tsx', 'DuelEntrance'); let finished = 0;
  const props = { duel, proposition: 'A proposition', momentKey: 'entrance:c', active: true, onDone: () => { finished++; } };
  h.render(props);
  for (let i = 0; i < 6; i++) { h.tick(100); h.render({ ...props, onDone: () => { finished++; } }); }
  assert.equal(finished, 0); h.tick(20); assert.equal(finished, 1); h.tick(1000); assert.equal(finished, 1);
});
test('Skip and automatic completion share a single completion guard', () => {
  const h = harness('components/liveArena/DuelEntrance.tsx', 'DuelEntrance'); let finished = 0;
  const tree = h.render({ duel, proposition: '', momentKey: 'entrance:c', active: true, onDone: () => { finished++; } });
  tree.props.onPress(); h.tick(1000); assert.equal(finished, 1);
});
test('entrance cleanup cancels timer and reduced motion uses short deadline', () => {
  const h = harness('components/liveArena/DuelEntrance.tsx', 'DuelEntrance', true); let finished = 0;
  const props = { duel, proposition: '', momentKey: 'entrance:c', active: true, onDone: () => { finished++; } };
  h.render(props); h.tick(119); assert.equal(finished, 0); h.tick(1); assert.equal(finished, 1);
  const other = harness('components/liveArena/DuelEntrance.tsx', 'DuelEntrance');
  other.render(props); other.unmount(); other.tick(1000); assert.equal(finished, 1);
});
test('uncommitted or inactive entrance does not claim a moment; committed entrance does', () => {
  const h = harness('components/liveArena/DuelEntrance.tsx', 'DuelEntrance');
  const props = { duel, proposition: '', momentKey: 'entrance:c', active: false, onDone() {} };
  assert.equal(h.render(props), null); assert.equal(h.registry.hasPlayed(props.momentKey), false);
  h.render({ ...props, active: true }, false); assert.equal(h.registry.hasPlayed(props.momentKey), false);
  h.render({ ...props, active: true }); assert.equal(h.registry.hasPlayed(props.momentKey), true);
});
test('offscreen verdict does not consume visual reveal or haptic', () => {
  const h = harness('components/liveArena/VerdictReveal.tsx', 'VerdictReveal');
  h.render({ duel, visible: false });
  assert.equal(h.registry.hasPlayed('verdict:c:settled:DRAW'), false); assert.equal(h.haptics, 0);
});
test('visible verdict claims after commit and does not repeat haptic on rerender', () => {
  const h = harness('components/liveArena/VerdictReveal.tsx', 'VerdictReveal');
  h.render({ duel, visible: true }, false); assert.equal(h.registry.hasPlayed('verdict:c:settled:DRAW'), false);
  h.render({ duel, visible: true }); h.render({ duel, visible: true });
  assert.equal(h.registry.hasPlayed('verdict:c:settled:DRAW'), true); assert.equal(h.haptics, 1);
});
test('offscreen result cannot consume a sheet reveal; ordinary remount does not replay', () => {
  const inline = harness('components/liveArena/VerdictReveal.tsx', 'VerdictReveal');
  inline.render({ duel, visible: false });
  const sheet = harness('components/liveArena/VerdictReveal.tsx', 'VerdictReveal', false, inline.registry);
  sheet.render({ duel, visible: true }); assert.equal(sheet.haptics, 1);
  const remount = harness('components/liveArena/VerdictReveal.tsx', 'VerdictReveal', false, inline.registry);
  remount.render({ duel, visible: true }); assert.equal(remount.haptics, 0);
});
test('an entrance that already began is suppressed on ordinary remount', () => {
  const first = harness('components/liveArena/DuelEntrance.tsx', 'DuelEntrance');
  const props = { duel, proposition: '', momentKey: 'entrance:c', active: true, onDone() {} };
  assert.ok(first.render(props)); first.unmount();
  const next = harness('components/liveArena/DuelEntrance.tsx', 'DuelEntrance', false, first.registry);
  assert.equal(next.render(props), null);
});
test('actual Crowd component hides input immediately despite stale writable context', () => {
  const h = harness('components/liveArena/LiveCrowdLayer.tsx', 'LiveCrowdLayer');
  const crowd = { messages: [], context: { canSend: true }, connected: true };
  assert.match(JSON.stringify(h.render({ crowd })), /Public Crowd message/);
  const closed = JSON.stringify(h.render({ crowd, readOnly: true }));
  assert.doesNotMatch(closed, /Public Crowd message|Send public Crowd message/); assert.match(closed, /read-only/);
});
test('Crowd history reader sees arrivals but not removal, replay or pagination', () => {
  const h = harness('components/liveArena/LiveCrowdLayer.tsx', 'LiveCrowdLayer');
  const row = n => ({ id: String(n), createdAt: `2026-10-20T00:00:0${n}.000001Z` });
  const props = messages => ({ crowd: { messages, context: { canSend: false } } });
  let tree = h.render(props([row(2), row(3)]));
  const list = tree.props.children.find(node => node?.type === 'List');
  list.props.onScrollBeginDrag(); list.props.onScroll({ nativeEvent: { contentOffset: { y: 0 }, layoutMeasurement: { height: 100 }, contentSize: { height: 800 } } });
  h.render(props([row(1), row(2), row(3)])); assert.doesNotMatch(JSON.stringify(h.render(props([row(1), row(2)]))), /New messages ↓/);
  h.render(props([row(1), row(2), row(3)])); assert.doesNotMatch(JSON.stringify(h.render(props([row(1), row(2), row(3)]))), /New messages ↓/);
  h.render(props([row(1), row(2), row(3), row(4)])); assert.match(JSON.stringify(h.render(props([row(1), row(2), row(3), row(4)]))), /New messages ↓/);
});
