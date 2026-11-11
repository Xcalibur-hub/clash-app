'use strict';
/**
 * CLASH — Canonical Bounded A50 Arena Live Acceptance Runner
 *
 * Uses `scripts/lib/arena-hermes-cdp.cjs`, `arena-device-navigation.cjs`,
 * and `arena-native-voting-guard.cjs`. Must be paired with an owner-authorized,
 * manifest-bound `.expo/active-arena-checkpoint/execution-manifest.json`.
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const readline = require('node:readline');
const a = require('node:assert/strict');
const nav = require('./lib/arena-device-navigation.cjs');
const dev = require('./lib/arena-live-devices.cjs');
const phases = require('./lib/arena-live-phases.cjs');

const ROOT = path.resolve(__dirname, '..');
const ADB = process.env.CLASH_ADB_PATH
  || process.env.ADB_PATH
  || (process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA.replace(/\\/g, '/')}/Android/Sdk/platform-tools/adb.exe` : 'adb');
const DEVICE_ID = process.env.CLASH_ANDROID_SERIAL || process.env.ANDROID_SERIAL || '';

function captureHistoricalRecords(ro, stateMod, pairs) {
  const keys = ['take', 'clash', 'room', 'topic', 'participants', 'messages', 'receipts', 'ballots', 'verdicts', 'rewards'];
  return pairs.map((pair) => {
    const snap = stateMod.snapshot(ro.sql, { clash: pair.clash, room: pair.room, take: pair.take });
    const out = { ids: pair };
    for (const k of keys) out[k] = snap[k];
    out.crowd = ro.sql(`SELECT coalesce(json_agg(m ORDER BY m.id), '[]'::json) FROM public.arena_crowd_messages m WHERE m.room_id = '${pair.room}'`);
    out.challenge = ro.sql(`SELECT to_jsonb(c) FROM public.arena_challenges c WHERE c.id::text = '${pair.challenge}'`);
    return out;
  });
}

function finalizeAcceptanceVerdict({ judgingResult, settledResult, historicalEqual, log = () => {} }) {
  a.equal(historicalEqual, true, 'Historical baseline integrity check must pass');
  a.equal(judgingResult?.postVoteProof?.passed, true, 'Post-vote native proof required for COMPLETE');
  a.equal(settledResult?.passed, true, 'Settled verdict proof required for COMPLETE');
  a.equal(settledResult?.verdictProof?.passed, true, 'Positive settled UI proof required for COMPLETE');
  a.equal(settledResult?.verdictProof?.screenshot?.valid, true, 'Valid settled PNG screenshot required for COMPLETE');
  const dupStatus = judgingResult?.duplicateProbe?.status || 'NOT TESTED';
  log('Acceptance proof gates verified', {
    postVoteProof: judgingResult.postVoteProof,
    duplicateBallotProbe: dupStatus,
    verdictProof: settledResult.verdictProof,
  });
  log('COMPLETE A50 ARENA ACCEPTANCE RUN: PASS');
  return { status: 'PASS', duplicateBallotProbe: dupStatus, verdictProof: settledResult.verdictProof };
}

async function runAcceptance() {
  let child = null, controllerPid = null, gatewayStarted = false, logStream = null;
  const log = (msg, extra = null) => {
    const line = `[${new Date().toISOString()}] ${msg}` + (extra ? ' ' + JSON.stringify(extra) : '');
    console.log(line);
    if (logStream) logStream.write(line + '\n');
  };
  const cleanup = () => dev.terminateOwnedController({ child, controllerPid, gatewayStarted, log });
  process.once('SIGINT', async () => { await cleanup(); process.exit(130); });
  process.once('SIGTERM', async () => { await cleanup(); process.exit(143); });

  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.expo/active-arena-checkpoint/execution-manifest.json'), 'utf8'));
    const ro = require(path.join(ROOT, '.expo/realtime-execution-bridge/live-io.cjs')).readIO();
    const stateMod = require(path.join(ROOT, '.expo/clash-mega-integration/arena-state.cjs'));
    const expectedPrior = manifest.historicalBaseline?.existingDuelCount;
    a.ok(Number.isInteger(expectedPrior) && expectedPrior >= 1, 'Manifest historicalBaseline.existingDuelCount required');

    const existingPairs = ro.sql(`SELECT json_agg(json_build_object('clash', c.id, 'room', r.id, 'take', c.take_id, 'challenge', c.duel_key::text) ORDER BY c.created_at) FROM public.clashes c JOIN public.arena_rooms r ON r.clash_id = c.id`);
    a.equal(existingPairs.length, expectedPrior, `Expected ${expectedPrior} historical clashes before run`);
    const historicalBefore = captureHistoricalRecords(ro, stateMod, existingPairs);
    const historicalBeforeHash = crypto.createHash('sha256').update(JSON.stringify(historicalBefore)).digest('hex');

    a.ok(DEVICE_ID, 'Set CLASH_ANDROID_SERIAL or ANDROID_SERIAL before running live acceptance');
    dev.wakeDevice(ADB, DEVICE_ID);
    await require(path.join(ROOT, '.expo/active-arena-checkpoint/execution-preflight.cjs')).preflight();
    await dev.verifyRuntimeMotion();
    const preFeed = await nav.navigateToFeed({ adb: ADB, deviceId: DEVICE_ID, timeoutMs: 12000 });
    a.equal(preFeed.state, 'main_feed');
    const preDump = nav.dumpHierarchy(ADB, DEVICE_ID, 12000);
    a.ok(preDump.ok && preDump.xml.includes('Home destinations'), 'Pre-duel UI hierarchy dump failed');

    child = cp.spawn(process.execPath, [path.join(ROOT, '.expo/active-arena-checkpoint/execute-owner.cjs')], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let runDir = null, ready = false;
    const pending = new Map();
    readline.createInterface({ input: child.stdout, terminal: false }).on('line', (line) => {
      let msg; try { msg = JSON.parse(line); } catch { return; }
      if (msg.ready) { ready = true; runDir = msg.dir; controllerPid = msg.pid; return; }
      if (msg.command && pending.has(msg.command)) {
        const cb = pending.get(msg.command); pending.delete(msg.command);
        if (msg.status === 'STOP_FAILED_OR_UNKNOWN') cb.reject(new Error(msg.message || 'Controller command failed'));
        else cb.resolve(msg.result);
      }
    });
    const sendCmd = (command) => new Promise((resolve, reject) => {
      pending.set(command, { resolve, reject });
      child.stdin.write(JSON.stringify({ command }) + '\n');
    });
    const waitStart = Date.now();
    while (!ready) { a.ok(Date.now() - waitStart < 30000, 'Controller ready timeout'); await dev.sleep(100); }

    logStream = fs.createWriteStream(path.join(runDir, 'run.log'), { flags: 'a' });
    fs.writeFileSync(path.join(runDir, 'historical-baseline.json'), JSON.stringify({ existingPairs, historicalBefore, sha256: historicalBeforeHash }, null, 2) + '\n');

    await sendCmd('preflight');
    await sendCmd('load-recover');
    await sendCmd('broadcast');
    await sendCmd('create');
    const { ids, deadlines } = await sendCmd('accept');
    await sendCmd('gateway');
    gatewayStarted = true;
    await sendCmd('watch-D');
    await phases.admitSpectatorCAndVerify({ adb: ADB, deviceId: DEVICE_ID, ids, manifest, ro, runDir, log });

    for (const cmd of ['official-A-OPEN', 'official-B-OPEN', 'crowd-D-OPEN']) await sendCmd(cmd);
    const crowdCOpen = await dev.postNativeCrowd(ids.room, manifest.fixture.crowdNativeBodies[0], crypto.randomUUID());
    a.equal(crowdCOpen.body, manifest.fixture.crowdNativeBodies[0]);
    await dev.sleep(3000);
    dev.captureDeviceScreen(ADB, DEVICE_ID, path.join(runDir, 'device-02-open-active.png'), log);

    await dev.waitUntil({ targetTimestamp: deadlines.final_arguments_at + 2000, phaseName: 'FINAL', adb: ADB, deviceId: DEVICE_ID, log });
    dev.dispatchDeepLink(ADB, DEVICE_ID, ids.room);
    await dev.sleep(3500);
    dev.captureDeviceScreen(ADB, DEVICE_ID, path.join(runDir, 'device-03-final-init.png'), log);

    for (const cmd of ['official-A-FINAL', 'official-B-FINAL', 'crowd-D-FINAL']) await sendCmd(cmd);
    const crowdCFinal = await dev.postNativeCrowd(ids.room, manifest.fixture.crowdNativeBodies[1], crypto.randomUUID());
    a.equal(crowdCFinal.body, manifest.fixture.crowdNativeBodies[1]);
    await dev.sleep(3000);
    dev.captureDeviceScreen(ADB, DEVICE_ID, path.join(runDir, 'device-04-final-active.png'), log);

    await dev.waitUntil({ targetTimestamp: deadlines.judging_at + 2000, phaseName: 'JUDGING', adb: ADB, deviceId: DEVICE_ID, log });
    const judgingResult = await phases.executeJudgingAndBallots({ adb: ADB, deviceId: DEVICE_ID, root: ROOT, ids, deadlines, manifest, ro, sendCmd, runDir, log });

    await dev.waitUntil({ targetTimestamp: deadlines.closes_at + 3500, phaseName: 'CLOSED', adb: ADB, deviceId: DEVICE_ID, log });
    const settledResult = await phases.refreshAndCaptureSettledVerdict({
      adb: ADB, deviceId: DEVICE_ID, ids, ro, sendCmd, runDir, log, manifest,
      expectedWinnerSide: manifest.fixture?.expectedWinnerSide || 'DRAW',
      expectedJurySize: manifest.fixture?.expectedJurySize ?? 2,
    });

    await sendCmd('snapshot');
    await sendCmd('status');
    const historicalAfter = captureHistoricalRecords(ro, stateMod, existingPairs);
    a.deepEqual(historicalAfter, historicalBefore, 'Historical duels mutated');
    const historicalHashOk = crypto.createHash('sha256').update(JSON.stringify(historicalAfter)).digest('hex') === historicalBeforeHash;
    a.ok(historicalHashOk, 'Historical digest mismatch');
    await sendCmd('close-actors');
    finalizeAcceptanceVerdict({ judgingResult, settledResult, historicalEqual: historicalHashOk, log });
  } finally {
    await cleanup();
    if (logStream) { try { logStream.end(); } catch {} }
  }
}

if (require.main === module) {
  runAcceptance().then(() => process.exit(0)).catch((err) => {
    console.error('FATAL EXECUTION ERROR:', err);
    process.exit(1);
  });
}

module.exports = { runAcceptance, finalizeAcceptanceVerdict };
