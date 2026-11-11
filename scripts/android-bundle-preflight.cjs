// No database operations, login, account changes, or guessed coordinates.
// Requires diagnostic Metro preloaded with android-bundle-trace.cjs.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const APP = 'com.clash.v2.dev';

function evaluate({ connected, reachable, events, since, log, xml, screen }) {
  const bundle = events.find(e => e.event === 'bundle_served' && e.android === true &&
    e.started >= since && e.status === 200);
  const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map(m => m[0])
    .filter(n => n.includes(`package="${APP}"`));
  const action = label => nodes.some(n => n.includes(`content-desc="${label}"`) &&
    n.includes('clickable="true"') && n.includes('enabled="true"') &&
    !n.includes('bounds="[0,0][0,0]"'));
  const readable = screen === 'profile'
    ? action('More profile actions') && action('Edit profile')
    : ['Home', 'Live', 'Groups', 'Discover'].every(label =>
      nodes.some(n => n.includes(`text="${label}"`) || n.includes(`content-desc="${label}"`))) && action('Create a take');
  const checks = {
    device_connected: connected === true,
    metro_reachable: reachable === true,
    real_android_bundle_served: Boolean(bundle),
    bundle_executed: /ReactNativeJS: Running "main"/.test(log),
    usable_clash_ui: Boolean(readable) && !/Reloading(?:…|\.\.\.)/.test(xml),
  };
  return { checks, pass: Object.values(checks).every(Boolean), screen,
    bundle_build_ms: bundle ? bundle.at - bundle.started : null };
}

async function main() {
  const [portText, trace, evidence, screen = 'arena'] = process.argv.slice(2);
  assert.equal(portText, '8083', 'This gate targets diagnostic Metro 8083 only');
  assert.ok(['arena', 'profile'].includes(screen));
  assert.ok(path.isAbsolute(trace) && path.isAbsolute(evidence));
  assert.ok(!fs.existsSync(evidence), 'Use a new private evidence directory for each launch');
  fs.mkdirSync(evidence);
  const adb = (args, timeout = 15000) => {
    const r = spawnSync('adb', ['-d', ...args], { encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
    if (r.status !== 0) throw Error('Bounded ADB operation failed: ' + args[0]);
    return r.stdout;
  };
  let result = { pass: false, failure: 'prerequisite' };
  let stage = 'device_connection';
  try {
    assert.equal(adb(['get-state']).trim(), 'device');
    stage = 'adb_reverse';
    assert.ok(adb(['reverse', '--list']).includes('tcp:8083 tcp:8083'), '8083 ADB reverse missing');
    stage = 'host_preference';
    const prefs = adb(['exec-out', 'run-as', APP, 'cat', `shared_prefs/${APP}_preferences.xml`]);
    assert.match(prefs, /<string name="debug_http_host">(?:localhost|127\.0\.0\.1):8083<\/string>/);
    stage = 'metro_status';
    const response = await fetch('http://127.0.0.1:8083/status', { signal: AbortSignal.timeout(5000) });
    assert.equal(await response.text(), 'packager-status:running');
    // A new PID and trace timestamp exclude stale bundle/log evidence.
    stage = 'native_launch';
    adb(['shell', 'am', 'force-stop', APP]);
    const since = Date.now();
    adb(['shell', 'am', 'start', '-n', APP + '/.MainActivity']);
    let log = '', events = [], xml = '', linked = false;
    const deadline = since + 150000;
    while (Date.now() < deadline) {
      events = fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
      stage = 'native_process';
      // am start can return before the new process has a PID.
      const probe = spawnSync('adb', ['-d', 'shell', 'pidof', APP], { encoding: 'utf8', timeout: 10000 });
      if (probe.status === 1 && !probe.stdout.trim()) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      assert.equal(probe.status, 0);
      const pid = probe.stdout.trim();
      assert.match(pid, /^\d+$/);
      stage = 'bundle_and_runtime';
      log = adb(['logcat', '-d', '--pid=' + pid, '-t', '600']);
      result = evaluate({ connected: true, reachable: true, events, since, log, xml, screen });
      if (result.checks.real_android_bundle_served && result.checks.bundle_executed) {
        if (screen === 'profile' && !linked && !/ReactNativeJS:.*arena_viewed/.test(log)) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        if (screen === 'profile' && !linked) {
          // Explicit static-screen check; never substitutes for an Arena accessibility pass.
          adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'clash-dev://profile']);
          linked = true;
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        stage = 'accessibility';
        for (let i = 0; i < 3 && Date.now() < deadline; i++) {
          adb(['shell', 'rm', '-f', '/sdcard/clash-bundle-gate.xml']);
          try {
            adb(['shell', 'uiautomator', 'dump', '/sdcard/clash-bundle-gate.xml'], 15000);
            xml = adb(['exec-out', 'cat', '/sdcard/clash-bundle-gate.xml']);
          } catch { xml = ''; }
          result = evaluate({ connected: true, reachable: true, events, since, log, xml, screen });
          if (result.pass) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    result = { ...result, failure: result.pass ? null : 'launch_gate_incomplete' };
  } catch {
    // Never print arbitrary subprocess output, preferences, SQL, or app logs.
    result = { ...result, pass: false, failure: 'launch_gate_prerequisite_failed', stage };
  } finally {
    spawnSync('adb', ['-d', 'shell', 'rm', '-f', '/sdcard/clash-bundle-gate.xml'], { timeout: 10000 });
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result));
  process.exitCode = result.pass ? 0 : 1;
}

module.exports = { evaluate };
if (require.main === module) main().catch(() => { console.error('Launch gate failed'); process.exitCode = 1; });
