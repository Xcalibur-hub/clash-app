const test = require('node:test');
const assert = require('node:assert/strict');
const { assessTarget, assessCapturePair } = require('./lib/meet-native-inspection.cjs');
const target = (bounds, extra = {}) => assessTarget({ bounds, display: [1080, 2340],
  dumpDisplay: [1080, 2131], source: 'legacy-dump', density: 2.625, ...extra });

test('saved initial composer and Send clipping is unknown, never a fabricated small native target', () => {
  for (const bounds of [[42, 2098, 835, 2131], [856, 2099, 1038, 2131]]) {
    assert.deepEqual(target(bounds), { status: 'unknown', reason: 'legacy_display_clipping' });
  }
});
test('saved terminal Leave clipping is unknown, not a 16dp hit-area diagnosis', () => {
  assert.equal(target([42, 2089, 1038, 2131]).reason, 'legacy_display_clipping');
});
test('saved IME-open and restored bounds are adequate reported rectangles only', () => {
  for (const bounds of [[42, 1117, 835, 1233], [856, 1118, 1038, 1233],
    [42, 1889, 835, 2005], [856, 1890, 1038, 2005]]) {
    assert.deepEqual(target(bounds), { status: 'pass', reason: 'reported_bounds_adequate', hitTestVerified: false });
  }
});
test('a genuinely small raw node still fails', () => {
  assert.equal(target([42, 2089, 1038, 2131], { source: 'raw-node' }).status, 'fail');
});
test('full-size raw node is accepted without pretending it was actually tapped', () => {
  assert.deepEqual(target([42, 2089, 1038, 2215], { source: 'raw-node' }),
    { status: 'pass', reason: 'reported_bounds_adequate', hitTestVerified: false });
});
test('IME overlap fails even with a full-size target', () => {
  assert.equal(target([42, 1200, 835, 1400], { imeTop: 1359 }).reason, 'ime_overlap');
});
test('a small node away from the dump clipping edge still fails', () => {
  assert.equal(target([42, 1200, 835, 1242]).status, 'fail');
});
test('horizontal clipping also stays unknown', () => {
  assert.equal(target([1000, 200, 1050, 400], { dumpDisplay: [1050, 2340] }).status, 'unknown');
});
test('invalid provenance or nonfinite bounds are rejected', () => {
  assert.throws(() => target([0, 0, 100, NaN]));
  assert.throws(() => target([0, 0, 100, 100], { source: 'guessed' }));
  assert.throws(() => target([0, 0, 100, 100], { minimumDp: NaN }));
  assert.throws(() => target([0, 0, 100, 100], { imeTop: NaN }));
});

const good = { status: 'pass' };
const frame = (extra = {}) => ({ scope: 'offline-only', state: 'active', theme: 'dark',
  atMs: 100, geometryKey: 'stable', layoutReady: true, transitionComplete: true,
  imageContentVerified: true, targets: { back: good, input: good, send: good }, ...extra });
test('initial mount cannot pass from one populated hierarchy', () => {
  assert.equal(assessCapturePair(null, frame()).ready, false);
});
test('blank initial screenshot fails despite complete accessibility metadata', () => {
  assert.equal(assessCapturePair(frame(), frame({ atMs: 200, imageContentVerified: false })).ready, false);
});
test('unfinished transition or layout does not become ready', () => {
  for (const extra of [{ transitionComplete: false }, { layoutReady: false }]) {
    assert.equal(assessCapturePair(frame(), frame({ atMs: 200, ...extra })).ready, false);
  }
});
test('active-to-terminal transition requires a new complete pair with Leave', () => {
  const ended = frame({ state: 'terminal', atMs: 200, targets: { back: good, leave: good } });
  assert.equal(assessCapturePair(frame(), ended).ready, false);
  assert.equal(assessCapturePair(ended, { ...ended, atMs: 300 }).ready, true);
});
test('theme and scope changes invalidate previous readiness', () => {
  for (const extra of [{ theme: 'light' }, { scope: 'different' }, { geometryKey: 'changed' }]) {
    assert.equal(assessCapturePair(frame(), frame({ atMs: 200, ...extra })).ready, false);
  }
});
test('unknown clipped target prevents acceptance', () => {
  const ended = frame({ state: 'terminal', targets: { back: good, leave: { status: 'unknown' } } });
  assert.equal(assessCapturePair(ended, { ...ended, atMs: 200 }).ready, false);
});
test('stale capture timestamps are rejected', () => {
  assert.equal(assessCapturePair(frame(), frame()).ready, false);
});
test('a complete stable pair is ready for review, not proof of native activation', () => {
  assert.deepEqual(assessCapturePair(frame(), frame({ atMs: 200 })),
    { ready: true, reason: 'verified_capture_pair', hitTestVerified: false });
});
test('truthy substitutes cannot certify paint or transition completion', () => {
  assert.equal(assessCapturePair(frame(), frame({ atMs: 200, imageContentVerified: 'yes' })).ready, false);
});
test('missing scope and geometry metadata cannot silently pass', () => {
  for (const extra of [{ scope: undefined }, { geometryKey: undefined }, { theme: undefined }]) {
    assert.equal(assessCapturePair(frame(extra), frame({ atMs: 200, ...extra })).ready, false);
  }
});
