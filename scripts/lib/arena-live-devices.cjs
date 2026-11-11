'use strict';
/**
 * Device, Hermes CDP, screenshot, and child-process helpers for live A50 Arena acceptance.
 */
const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const a = require('node:assert/strict');
const { evalInHermes } = require('./arena-hermes-cdp.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wakeDevice(adb, deviceId) {
  try {
    cp.execFileSync(adb, ['-s', deviceId, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'], { windowsHide: true, timeout: 5000 });
  } catch {}
}

function captureDeviceScreen(adb, deviceId, destPath, log) {
  const bytes = cp.execFileSync(adb, ['-s', deviceId, 'exec-out', 'screencap', '-p'], { maxBuffer: 20e6, windowsHide: true });
  a.ok(bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47, 'Invalid PNG screenshot');
  fs.writeFileSync(destPath, bytes);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  log('Captured screen:', { file: destPath, size: bytes.length, sha256 });
  return { size: bytes.length, sha256 };
}

function dispatchDeepLink(adb, deviceId, roomId) {
  wakeDevice(adb, deviceId);
  cp.execFileSync(adb, ['-s', deviceId, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `clash-dev://arena/room/${roomId}`, 'com.clash.v2.dev'], { windowsHide: true });
}

async function verifyRuntimeMotion(evalFn = evalInHermes) {
  const res = await evalFn(`(getMod) => {
    const dm = getMod('utils/decorativeMotion.ts');
    return {
      dev: typeof __DEV__ !== 'undefined' ? __DEV__ : null,
      frozen: dm.DECORATIVE_MOTION_FROZEN,
      countdownPaused: dm.VISUAL_COUNTDOWN_PAUSED,
    };
  }`);
  a.equal(res.dev, true, 'Device bundle must be __DEV__=true');
  a.equal(res.frozen, true, 'STOP: DECORATIVE_MOTION_FROZEN must be true in A50 bundle');
  a.equal(res.countdownPaused, true, 'STOP: VISUAL_COUNTDOWN_PAUSED must be true in A50 bundle');
  return res;
}

function fetchLiveRoomState(roomId, evalFn = evalInHermes) {
  a.equal(typeof roomId, 'string');
  return evalFn(`(getMod) => getMod('services/liveArenaService.ts').fetchRoom(${JSON.stringify(roomId)}).then((r) => ({
    roomId: r.roomId,
    status: r.status,
    phase: r.phase,
    roomMode: r.roomMode,
    clashId: r.duel ? r.duel.clashId : null,
    rel: r.duel ? r.duel.viewerRelationship : null,
  }))`);
}

function postNativeCrowd(roomId, body, requestKey, evalFn = evalInHermes) {
  a.equal(typeof roomId, 'string');
  a.equal(typeof body, 'string');
  a.equal(typeof requestKey, 'string');
  return evalFn(`(getMod) => getMod('services/arenaCrowdService.ts').postCrowd(${JSON.stringify(roomId)}, ${JSON.stringify(body)}, ${JSON.stringify(requestKey)})`);
}

async function waitUntil({ targetTimestamp, phaseName, adb, deviceId, log }) {
  const remaining = targetTimestamp - Date.now();
  log(`Waiting for ${phaseName} phase...`, { target: new Date(targetTimestamp).toISOString(), remainingMin: (remaining / 60000).toFixed(1) });
  while (Date.now() < targetTimestamp) {
    wakeDevice(adb, deviceId);
    const left = targetTimestamp - Date.now();
    if (left > 60000) {
      await sleep(60000);
      log(`Countdown to ${phaseName}: ${((targetTimestamp - Date.now()) / 60000).toFixed(1)} minutes remaining`);
    } else if (left > 5000) {
      await sleep(5000);
    } else {
      await sleep(Math.max(0, left));
      break;
    }
  }
  log(`Arrived at ${phaseName} phase`);
}

async function terminateOwnedController({ child, controllerPid, gatewayStarted, log }) {
  if (child) {
    log('Terminating owned controller process...', { pid: controllerPid });
    try { if (child.stdin) { child.stdin.end(); child.stdin.destroy(); } } catch {}
    try { if (child.stdout) child.stdout.destroy(); } catch {}
    try { if (child.stderr) child.stderr.destroy(); } catch {}
    if (child.exitCode === null) {
      try { child.kill('SIGTERM'); } catch {}
      await sleep(800);
      if (child.exitCode === null) {
        try { child.kill('SIGKILL'); } catch {}
      }
    }
    try { child.unref(); } catch {}
  }
  if (gatewayStarted && controllerPid) {
    try {
      const pidOut = cp.execFileSync('powershell.exe', [
        '-NoProfile', '-Command',
        `(Get-NetTCPConnection -State Listen -LocalPort 55626 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -eq ${controllerPid} }).OwningProcess`,
      ], { encoding: 'utf8', timeout: 5000 }).trim();
      if (pidOut && Number(pidOut) === controllerPid) {
        try { process.kill(controllerPid, 'SIGKILL'); } catch {}
      }
    } catch {}
  }
}

module.exports = {
  sleep,
  wakeDevice,
  captureDeviceScreen,
  dispatchDeepLink,
  verifyRuntimeMotion,
  fetchLiveRoomState,
  postNativeCrowd,
  waitUntil,
  terminateOwnedController,
};
