'use strict';
const test = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_DUMP_TIMEOUT_MS,
  MIN_DUMP_TIMEOUT_MS,
  MAX_DUMP_TIMEOUT_MS,
  normalizeTimeout,
  classifyDumpFailure,
  dumpHierarchy,
  parseBounds,
  findControlByDesc,
  detectScreenState,
} = require('./lib/arena-device-navigation.cjs');

// Sample XML fragments representing actual device UI states
const SETTLED_XML_SAMPLE = `
<hierarchy rotation="0">
  <node index="0" class="android.widget.FrameLayout" bounds="[0,0][1080,2131]">
    <node index="1" class="android.widget.TextView" text="Official verdict" bounds="[42,1200][500,1260]" />
    <node index="13" class="android.widget.Button" content-desc="Return to Arena" bounds="[422,1595][738,1711]">
      <node index="0" text="Return to Arena" bounds="[422,1626][696,1679]" />
    </node>
    <node index="14" class="android.widget.Button" content-desc="Refresh official result" bounds="[42,1753][1038,1879]" />
  </node>
</hierarchy>
`;

const FEED_XML_SAMPLE = `
<hierarchy rotation="0">
  <node index="0" class="android.widget.FrameLayout" bounds="[0,0][1080,2131]">
    <node index="1" class="android.view.ViewGroup" content-desc="Home destinations" bounds="[0,83][1080,2214]">
      <node index="0" text="For You" bounds="[42,100][200,150]" />
      <node index="1" text="Explore live Clashes" bounds="[42,200][400,260]" />
    </node>
  </node>
</hierarchy>
`;

const ACTIVE_ROOM_XML_SAMPLE = `
<hierarchy rotation="0">
  <node index="0" class="android.widget.FrameLayout" bounds="[0,0][1080,2131]">
    <node index="0" class="android.widget.Button" content-desc="Back" bounds="[30,100][120,180]" />
    <node index="1" class="android.widget.TextView" text="Your role: WATCHING" content-desc="Your role: WATCHING" bounds="[150,110][400,170]" />
    <node index="2" class="android.widget.Button" content-desc="Expand Crowd conversation" bounds="[0,2000][1080,2131]" />
  </node>
</hierarchy>
`;

test('parseBounds correctly extracts coordinates, dimensions and center', () => {
  const b = parseBounds('[422,1595][738,1711]');
  a.ok(b);
  a.equal(b.left, 422);
  a.equal(b.top, 1595);
  a.equal(b.right, 738);
  a.equal(b.bottom, 1711);
  a.equal(b.width, 316);
  a.equal(b.height, 116);
  a.equal(b.center.x, 580);
  a.equal(b.center.y, 1653);
});

test('parseBounds returns null on invalid syntax', () => {
  a.equal(parseBounds('invalid'), null);
  a.equal(parseBounds(''), null);
});

test('findControlByDesc locates "Return to Arena" button and extracts dynamic center', () => {
  const ctrl = findControlByDesc(SETTLED_XML_SAMPLE, 'Return to Arena');
  a.equal(ctrl.found, true);
  a.equal(ctrl.bounds.center.x, 580);
  a.equal(ctrl.bounds.center.y, 1653);
  a.equal(ctrl.bounds.width, 316);
  a.equal(ctrl.bounds.height, 116);
});

test('findControlByDesc locates "Back" button on active room', () => {
  const ctrl = findControlByDesc(ACTIVE_ROOM_XML_SAMPLE, /^Back$/i);
  a.equal(ctrl.found, true);
  a.equal(ctrl.bounds.center.x, 75);
  a.equal(ctrl.bounds.center.y, 140);
});

test('findControlByDesc returns found=false when control is absent', () => {
  const ctrl = findControlByDesc(FEED_XML_SAMPLE, 'Return to Arena');
  a.equal(ctrl.found, false);
});

test('findControlByDesc locates "BACK TO ARENA" fallback control', () => {
  const fallbackXml = `
  <hierarchy rotation="0">
    <node index="0" class="android.widget.FrameLayout" bounds="[0,0][1080,2131]">
      <node index="3" text="Room unavailable" bounds="[364,1082][716,1140]" />
      <node index="0" class="android.widget.Button" content-desc="BACK TO ARENA" bounds="[335,1382][745,1482]" />
    </node>
  </hierarchy>
  `;
  const ctrl = findControlByDesc(fallbackXml, /^(Return to Arena|Back to Arena)$/i);
  a.equal(ctrl.found, true);
  a.equal(ctrl.bounds.center.x, 540);
  a.equal(ctrl.bounds.center.y, 1432);
});

test('detectScreenState accurately discriminates settled_outcome, main_feed, and active_arena_room', () => {
  a.equal(detectScreenState(SETTLED_XML_SAMPLE), 'settled_outcome');
  a.equal(detectScreenState(FEED_XML_SAMPLE), 'main_feed');
  a.equal(detectScreenState(ACTIVE_ROOM_XML_SAMPLE), 'active_arena_room');
  a.equal(detectScreenState('<hierarchy></hierarchy>'), 'unknown');
});

test('normalizeTimeout clamps timeout within safe bounded range [1000, 60000]', () => {
  a.equal(DEFAULT_DUMP_TIMEOUT_MS, 12000);
  a.equal(normalizeTimeout(), 12000);
  a.equal(normalizeTimeout(null), 12000);
  a.equal(normalizeTimeout(-500), 12000);
  a.equal(normalizeTimeout(500), MIN_DUMP_TIMEOUT_MS);
  a.equal(normalizeTimeout(12000), 12000);
  a.equal(normalizeTimeout(120000), MAX_DUMP_TIMEOUT_MS);
});

test('dumpHierarchy returns explicit diagnostic failure result on invalid adb binary without throwing', () => {
  const res = dumpHierarchy('non_existent_adb_bin_xyz', 'fake_device', 1000);
  a.equal(res.ok, false);
  a.equal(res.xml, null);
  a.ok(res.durationMs >= 0);
  a.ok(res.error);
  a.ok(res.tempFile.includes('/data/local/tmp/dump_'));
  a.equal(res.includes('test'), false);
  a.equal(res.toString(), '');
});

test('dumpHierarchy throws explicit diagnostic error when throwOnError is true', () => {
  a.throws(
    () => dumpHierarchy('non_existent_adb_bin_xyz', 'fake_device', { timeoutMs: 1000, throwOnError: true }),
    (err) => {
      a.ok(err.diagnostic);
      a.equal(err.diagnostic.ok, false);
      return true;
    }
  );
});

test('detectScreenState and findControlByDesc accept dumpHierarchy result objects transparently', () => {
  const mockSuccessResult = {
    ok: true,
    xml: SETTLED_XML_SAMPLE,
    durationMs: 4500,
    tempFile: '/data/local/tmp/dump_mock.xml',
    toString: () => SETTLED_XML_SAMPLE,
    includes: (s) => SETTLED_XML_SAMPLE.includes(s),
  };
  a.equal(detectScreenState(mockSuccessResult), 'settled_outcome');
  const ctrl = findControlByDesc(mockSuccessResult, 'Return to Arena');
  a.equal(ctrl.found, true);
  a.equal(ctrl.bounds.center.x, 580);
});

test('detectScreenState and findControlByDesc safely handle diagnostic failure objects (fail-closed)', () => {
  const mockFailureResult = {
    ok: false,
    xml: null,
    durationMs: 12001,
    tempFile: '/data/local/tmp/dump_failed.xml',
    error: 'UI Automator dump timed out after 12000ms',
    code: 'ETIMEDOUT',
    toString: () => '',
    includes: () => false,
  };
  a.equal(detectScreenState(mockFailureResult), 'unknown');
  const ctrl = findControlByDesc(mockFailureResult, 'Return to Arena');
  a.equal(ctrl.found, false);
});

test('classifyDumpFailure explicitly identifies UI_NOT_IDLE and ETIMEDOUT without masking diagnostics', () => {
  const notIdle = classifyDumpFailure({ message: 'Command failed', stderr: 'ERROR: could not get idle state.' }, 12000);
  a.equal(notIdle.isTimeout, false);
  a.equal(notIdle.code, 'UI_NOT_IDLE');
  a.match(notIdle.error, /could not get idle state/i);

  const timedOut = classifyDumpFailure({ code: 'ETIMEDOUT', message: 'spawnSync adb ETIMEDOUT' }, 12000);
  a.equal(timedOut.isTimeout, true);
  a.equal(timedOut.code, 'ETIMEDOUT');
  a.match(timedOut.error, /timed out after 12000ms/);
});

test('arena-device-navigation source scopes pkill strictly to uniqueName and never terminates all uiautomator processes', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib', 'arena-device-navigation.cjs'), 'utf8');
  a.doesNotMatch(src, /pkill['",\s]+-f['",\s]+uiautomator/i);
  a.match(src, /'pkill',\s*'-f',\s*uniqueName/);
});
