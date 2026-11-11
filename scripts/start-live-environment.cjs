'use strict';
/**
 * CLASH — Live / Dev Acceptance Environment Launcher
 *
 * - Sets EXPO_PUBLIC_ARENA_DISABLE_DECORATIVE_MOTION=1 before Metro starts.
 * - Passes --clear to Metro so no cached bundle omits the motion-freeze setting.
 * - Waits until Metro /status reports packager-status:running BEFORE launching A50.
 * - Reverses ADB ports 8081 (and 55626 in full mode), launches com.clash.v2.dev,
 *   and verifies via Hermes CDP that utils/decorativeMotion.ts DECORATIVE_MOTION_FROZEN === true.
 * - Supports `--metro-only` for non-mutating device UI preview without credentials/DB/gateway.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const a = require('assert/strict');
const { fetchBridgelessPeer, evaluateHermes } = require('./lib/arena-hermes-cdp.cjs');

const root = path.resolve(__dirname, '..');
const metroOnly = process.argv.includes('--metro-only');
const disableMotion = process.env.EXPO_PUBLIC_ARENA_DISABLE_DECORATIVE_MOTION === '0' ? '0' : '1';
const adb = process.env.CLASH_ADB_PATH
  || process.env.ADB_PATH
  || (process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA.replace(/\\/g, '/')}/Android/Sdk/platform-tools/adb.exe` : 'adb');
const deviceId = process.env.CLASH_ANDROID_SERIAL || process.env.ANDROID_SERIAL || '';
const deviceArgs = deviceId ? ['-s', deviceId] : [];

let routerChild = null;
let gatewayChild = null;
let metroChild = null;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function loadPrivateAnonKey() {
  const issuance = JSON.parse(fs.readFileSync(path.join(root, '.expo/fresh-issuance-result.json'), 'utf8'));
  const s = require(path.join(root, '.expo/realtime-execution-bridge/security.cjs'));
  const c = require(path.join(root, '.expo/realtime-control-plane/contract.cjs'));
  const store = require(path.join(root, '.expo/realtime-execution-bridge/private-store.cjs'));
  const live = require(path.join(root, '.expo/realtime-execution-bridge/live-io.cjs'));

  const receipt = JSON.parse(fs.readFileSync(path.join(root, '.expo/duel9-live-20261110/security-receipt.json'), 'utf8'));
  const activeOwnerText = fs.readFileSync(path.join(root, '.expo/active-arena-checkpoint/owner-authorization.txt'), 'utf8');
  a.equal(activeOwnerText, receipt.ownerMessage, 'Active owner-authorization.txt must match Duel #9 receipt ownerMessage');
  const digest = s.hash(path.join(root, '.expo/realtime-execution-bridge/bridge-lock.json'));
  const approval = {
    ownerSid: receipt.ownerSid || c.T.owner,
    project: receipt.project || c.T.project,
    db: receipt.db || c.T.db,
    system: receipt.system || c.T.system,
    network: receipt.network || c.T.network,
    bridgeSha256: digest,
    originalCandidateSha256: receipt.originalCandidateSha256 || 'd9ed47fcf6dbe9379b8cf7715ad7008ef98f63161c949aa8163dae166490b4a6',
    centralManifestSha256: receipt.centralManifestSha256 || '8c0d6e47f7c997527ddde6ded9d9e0e2d057bba9113d958a6c5f46ebdf061cde',
    scopes: ['credentials', 'sessions', 'central', 'tenant', 'runtime', 'websocket'],
    decisionSource: receipt.decisionSource || 'explicit subsequent owner message',
    ownerMessage: receipt.ownerMessage,
    ownerMessageSha256: receipt.ownerMessageSha256,
    approvedAt: receipt.approvedAt,
    validUntil: receipt.validUntil,
    prohibitionOverrides: false,
  };

  const permit = s.authorize(approval, 'sessions', digest);
  const provider = store.adapter(live.privateIO());
  const material = provider.load(
    path.join(root, '.expo/live-connect-b4-run/bridge-generations', issuance.generation),
    issuance.receiptSha256,
    permit,
    issuance.execution
  );
  console.log('1. Loaded material for B4_ANON_KEY successfully.');
  return material.B4_ANON_KEY;
}

async function waitForMetroReady(metroProc, metroLogs, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (metroProc && metroProc.exitCode !== null) {
      throw new Error(`Metro exited prematurely (code ${metroProc.exitCode}): ${metroLogs.slice(-10).join('\n')}`);
    }
    try {
      const res = await fetch('http://127.0.0.1:8081/status');
      const txt = await res.text();
      if (txt.includes('packager-status:running')) return true;
    } catch {}
    await sleep(500);
  }
  throw new Error(`Metro failed to report packager-status:running within ${timeoutMs}ms`);
}

async function verifyDeviceDecorativeMotionFrozen(expectedFrozen, timeoutMs = 45000) {
  const start = Date.now();
  let peer = null;
  while (Date.now() - start < timeoutMs) {
    try {
      peer = await fetchBridgelessPeer();
      break;
    } catch {}
    await sleep(1000);
  }
  a.ok(peer, 'Hermes Bridgeless target unavailable after app launch');

  const fnExpr = `(function () {
    if (!globalThis.__r || typeof globalThis.__r.getModules !== 'function') return { booted: false };
    let layout = null, dmEntry = null;
      for (const [id, m] of globalThis.__r.getModules().entries()) {
        if (!m || !m.verboseName) continue;
        const n = m.verboseName.replaceAll('\\\\', '/');
        if (n.endsWith('app/_layout.tsx')) layout = m;
        if (n.endsWith('utils/decorativeMotion.ts')) dmEntry = [id, m];
      }
      if (!layout || !layout.isInitialized) return { booted: false };
      if (!dmEntry) return { booted: true, found: false };
      const [dmId, dm] = dmEntry;
      const exp = globalThis.__r(dmId);
      return {
        booted: true,
        found: true,
        id: dmId,
        isInitialized: dm.isInitialized,
        dev: typeof __DEV__ !== 'undefined' ? __DEV__ : null,
        frozen: exp?.DECORATIVE_MOTION_FROZEN,
        countdownPaused: exp?.VISUAL_COUNTDOWN_PAUSED,
        envName: exp?.DECORATIVE_MOTION_ENV,
        envVal: typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_ARENA_DISABLE_DECORATIVE_MOTION ?? null : 'no-process'
      };
  })`;

  while (Date.now() - start < timeoutMs) {
    const val = await evaluateHermes({
      wsUrl: peer.webSocketDebuggerUrl,
      fnBodyString: fnExpr,
      timeoutMs: Math.max(5000, timeoutMs - (Date.now() - start)),
      pollIntervalMs: 100,
    });
    if (val && val.booted && val.found && val.frozen !== undefined && val.countdownPaused !== undefined) {
      a.equal(val.dev, true, 'Device bundle must be __DEV__=true');
      a.equal(val.frozen, expectedFrozen, `Expected DECORATIVE_MOTION_FROZEN=${expectedFrozen}, got ${val.frozen}`);
      a.equal(val.countdownPaused, expectedFrozen, `Expected VISUAL_COUNTDOWN_PAUSED=${expectedFrozen}, got ${val.countdownPaused}`);
      return val;
    }
    await sleep(500);
  }
  throw new Error(`Hermes motion check timed out after ${timeoutMs}ms waiting for DECORATIVE_MOTION_FROZEN=${expectedFrozen}`);
}

function shutdownOwned(exitCode = 0) {
  for (const child of [gatewayChild, routerChild, metroChild]) {
    if (child && child.exitCode === null) {
      try { child.kill('SIGTERM'); } catch {}
    }
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdownOwned(130));
process.on('SIGTERM', () => shutdownOwned(143));

async function main() {
  // Unsigned non-secret placeholder JWT structure (`{"alg":"none"}.{"role":"anon"}.`) for offline preview
  let anonKey = 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.';
  if (!metroOnly) {
    anonKey = loadPrivateAnonKey();
    routerChild = cp.fork(path.join(root, '.expo/live-integration-execution/router.cjs'), [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    });
    routerChild.send({ type: 'configure', anon: anonKey });
    routerChild.on('message', m => { if (m?.ready) console.log('2. Router ready on port 55621 (PID ' + m.pid + ')'); });

    gatewayChild = cp.fork(path.join(root, '.expo/android-a50-integration/gateway.cjs'), [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    });
    gatewayChild.send({ type: 'configure', anon: anonKey, email: 'integration-ed3babb6-c@example.invalid' });
    gatewayChild.on('message', m => { if (m?.type === 'gateway-ready') console.log('3. Gateway ready on port 55626 (PID ' + m.pid + ')'); });
  } else {
    console.log('1. Metro-only mode: skipping credentials, router, and gateway.');
  }

  // Stop existing Metro listener on 8081 if any
  try {
    const netstat = cp.execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue).OwningProcess'], { encoding: 'utf8' }).trim();
    if (netstat) {
      const oldPid = Number(netstat);
      console.log('Stopping old Metro on port 8081 (PID ' + oldPid + ')...');
      try { process.kill(oldPid); } catch {}
      await sleep(800);
    }
  } catch {}

  const preloadScript = path.join(root, '.expo/android-a50-integration/preload-mobile.cjs');
  const metroEnv = Object.assign({}, process.env, {
    APP_VARIANT: 'development',
    EXPO_NO_DOTENV: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55626',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    EXPO_PUBLIC_ARENA_DISABLE_DECORATIVE_MOTION: disableMotion,
    NODE_OPTIONS: '--require "' + preloadScript.replaceAll('\\', '/') + '"',
  });

  metroChild = cp.spawn(process.execPath, [
    path.join(root, 'node_modules/expo/bin/cli'),
    'start',
    '--localhost',
    '--port',
    '8081',
    '--dev-client',
    '--clear',
  ], {
    cwd: root,
    env: metroEnv,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const metroLogs = [];
  const collectLog = chunk => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      metroLogs.push(line);
      if (metroLogs.length > 50) metroLogs.shift();
    }
  };
  metroChild.stdout.on('data', collectLog);
  metroChild.stderr.on('data', collectLog);

  console.log(`4. Metro spawned on port 8081 (PID ${metroChild.pid}) with EXPO_PUBLIC_ARENA_DISABLE_DECORATIVE_MOTION=${disableMotion} --clear`);
  await waitForMetroReady(metroChild, metroLogs, 60000);
  console.log('4b. Metro confirmed running on http://127.0.0.1:8081/status.');

  cp.execFileSync(adb, [...deviceArgs, 'reverse', 'tcp:8081', 'tcp:8081'], { encoding: 'utf8' });
  if (!metroOnly) {
    cp.execFileSync(adb, [...deviceArgs, 'reverse', 'tcp:55626', 'tcp:55626'], { encoding: 'utf8' });
  }
  console.log('5. ADB port forwards ready.');

  console.log('6. Relaunching com.clash.v2.dev on Samsung A50 to load fresh bundle...');
  cp.execFileSync(adb, [...deviceArgs, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'], { encoding: 'utf8' });
  cp.execFileSync(adb, [...deviceArgs, 'shell', 'am', 'force-stop', 'com.clash.v2.dev'], { encoding: 'utf8' });
  await sleep(500);
  cp.execFileSync(adb, [...deviceArgs, 'shell', 'am', 'start', '-n', 'com.clash.v2.dev/.MainActivity'], { encoding: 'utf8' });
  await sleep(1500);
  cp.execFileSync(adb, [...deviceArgs, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'clash-dev://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081', 'com.clash.v2.dev'], { encoding: 'utf8' });

  const runtimeCheck = await verifyDeviceDecorativeMotionFrozen(disableMotion === '1', 300000);
  console.log('7. Verified A50 runtime bundle state:', runtimeCheck);

  fs.writeFileSync(path.join(root, '.expo/services-runtime.json'), JSON.stringify({
    metroOnly,
    routerPid: routerChild?.pid ?? null,
    gatewayPid: gatewayChild?.pid ?? null,
    metroPid: metroChild.pid,
    decorativeMotionFrozen: runtimeCheck.frozen,
    startedAt: new Date().toISOString(),
  }, null, 2) + '\n');

  console.log('SERVICES AND ENVIRONMENT INITIALIZED SUCCESSFULLY!');
  setInterval(() => {}, 60000);
}

main().catch(err => {
  console.error('Failed to start environment:', err);
  shutdownOwned(1);
});
