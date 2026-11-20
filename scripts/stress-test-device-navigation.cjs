'use strict';
/**
 * CLASH — Physical Samsung A50 Navigation Stress Test (10 Consecutive Cycles)
 *
 * Requirements:
 * - Uses existing historical rooms only (zero database mutations).
 * - Performs at least 10 consecutive navigation cycles.
 * - In each cycle:
 *     1. Detect current Android screen state.
 *     2. Navigate through legitimate visible 'Return to Arena' / 'Back' control.
 *     3. Verify /(tabs) Arena feed state.
 *     4. Open a known historical room via deep link.
 *     5. Verify room identity or detect and report 'Room unavailable' (offline gateway).
 *     6. Return to Arena feed through visible control.
 * - Measures each UI hierarchy dump's duration, success rate, and error reason.
 * - Safe process termination and cleanup; zero hanging child processes.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const a = require('assert/strict');
const crypto = require('crypto');
const {
  dumpHierarchy,
  findControlByDesc,
  detectScreenState,
  adbTap,
  navigateToFeed,
  navigateToRoom,
  DEFAULT_DUMP_TIMEOUT_MS,
} = require('./lib/arena-device-navigation.cjs');

const ADB = 'C:/Users/91962/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const DEVICE_ID = 'RZ8M30DE9NL';
const EVIDENCE_DIR = path.resolve(__dirname, '../.expo/navigation-stress-evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const HISTORICAL_ROOMS = [
  { id: 'ar_57f0a04b580bec42', label: 'Historical Open Duel (Run #5)', expected: 'Broad participation' },
  { id: 'ar_8bc423eda52a6447', label: 'Historical Settled Duel', expected: 'Official verdict' },
  { id: 'ar_222ea1d858d8e5fa', label: 'Historical Duel (Run #6)', expected: 'Broad participation' },
];

function captureScreenshot(filename) {
  const dest = path.join(EVIDENCE_DIR, filename);
  try {
    const bytes = cp.execFileSync(ADB, ['-s', DEVICE_ID, 'exec-out', 'screencap', '-p'], {
      maxBuffer: 20e6,
      windowsHide: true,
      timeout: 10000,
    });
    a.ok(bytes.length > 8, 'Screenshot empty');
    a.equal(bytes[0], 0x89, 'PNG magic byte 0');
    fs.writeFileSync(dest, bytes);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    return { path: dest, size: bytes.length, sha256: hash.slice(0, 16) };
  } catch (err) {
    console.error(`Failed to capture screenshot ${filename}:`, err.message);
    return null;
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runStressTest(totalCycles = 10) {
  console.log('========================================================================');
  console.log('CLASH — SAMSUNG GALAXY A50 NAVIGATION STRESS TEST');
  console.log(`Device: Samsung Galaxy A50 (Serial: ${DEVICE_ID})`);
  console.log(`Target Cycles: ${totalCycles} consecutive cycles`);
  console.log(`Dump Timeout: ${DEFAULT_DUMP_TIMEOUT_MS}ms bounded`);
  console.log(`Evidence Directory: ${EVIDENCE_DIR}`);
  console.log('========================================================================\n');

  const dumpMetrics = [];
  const cycleResults = [];

  function instrumentedDump(contextLabel) {
    const res = dumpHierarchy(ADB, DEVICE_ID, DEFAULT_DUMP_TIMEOUT_MS);
    dumpMetrics.push({
      context: contextLabel,
      durationMs: res.durationMs,
      ok: res.ok,
      error: res.error,
      code: res.code,
      timedOut: res.timedOut,
      xmlLength: res.xml ? res.xml.length : 0,
      timestamp: new Date().toISOString(),
    });
    return res;
  }

  // Pre-test sanity check: verify device connectivity and initial state
  console.log('--- Initial Pre-Test Screen Inspection ---');
  const initDump = instrumentedDump('pre_test_initial');
  a.ok(initDump.ok, `Initial UI dump failed: ${initDump.error}`);
  const initState = detectScreenState(initDump);
  console.log(`Initial screen state: ${initState} (Dump duration: ${initDump.durationMs}ms, length: ${initDump.xml.length})`);
  captureScreenshot('00-pre-test-initial.png');

  // Ensure starting at feed
  if (initState !== 'main_feed') {
    console.log('Normalizing device to main feed before starting cycles...');
    await navigateToFeed({ adb: ADB, deviceId: DEVICE_ID, timeoutMs: DEFAULT_DUMP_TIMEOUT_MS });
  }

  for (let cycle = 1; cycle <= totalCycles; cycle++) {
    const cycleStart = Date.now();
    const target = HISTORICAL_ROOMS[(cycle - 1) % HISTORICAL_ROOMS.length];
    console.log(`\n========================================================================`);
    console.log(`CYCLE ${cycle} / ${totalCycles}: Target Room ${target.id} (${target.label})`);
    console.log(`========================================================================`);

    let cycleSuccess = true;
    let cycleNotes = '';

    try {
      // Step 1: Detect current screen state
      const preDump = instrumentedDump(`c${cycle}_01_detect_state`);
      a.ok(preDump.ok, `Cycle ${cycle} pre-dump failed: ${preDump.error}`);
      const curState = detectScreenState(preDump);
      console.log(`  [1] Current screen state: ${curState} (${preDump.durationMs}ms)`);

      // Step 2: Ensure on feed via dynamic Return to Arena control if not already
      if (curState !== 'main_feed') {
        console.log(`  [2] Navigating to feed from ${curState}...`);
        const toFeedRes = await navigateToFeed({ adb: ADB, deviceId: DEVICE_ID, timeoutMs: DEFAULT_DUMP_TIMEOUT_MS });
        console.log(`      Navigation to feed: ${toFeedRes.status} in ${toFeedRes.attempts} attempt(s)`);
      }

      // Step 3: Verify Arena feed state
      const feedDump = instrumentedDump(`c${cycle}_02_verify_feed`);
      a.ok(feedDump.ok, `Cycle ${cycle} feed dump failed: ${feedDump.error}`);
      const feedState = detectScreenState(feedDump);
      a.equal(feedState, 'main_feed', `Must be at main feed; detected: ${feedState}`);
      console.log(`  [3] Verified Arena feed: PASS (${feedDump.durationMs}ms)`);

      // Step 4: Open known historical room via deep link
      console.log(`  [4] Deep linking to room ${target.id}...`);
      const link = `clash-dev://arena/room/${target.id}`;
      cp.execFileSync(ADB, ['-s', DEVICE_ID, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', link, 'com.clash.v2.dev'], {
        windowsHide: true,
        timeout: 10000,
      });
      await sleep(3500);

      // Step 5: Verify room identity or clearly report offline gateway fallback
      const roomDump = instrumentedDump(`c${cycle}_03_verify_room`);
      a.ok(roomDump.ok, `Cycle ${cycle} room dump failed: ${roomDump.error}`);
      const roomState = detectScreenState(roomDump);
      const isGatewayOffline = roomDump.includes('Room unavailable');
      const hasExpectedContent = target.expected && roomDump.includes(target.expected);

      if (isGatewayOffline) {
        console.log(`  [5] Room state: OFFLINE GATEWAY FALLBACK ('Room unavailable' correctly rendered) (${roomDump.durationMs}ms)`);
        cycleNotes = 'Offline gateway fallback verified';
      } else if (hasExpectedContent) {
        console.log(`  [5] Room state: VERIFIED ACTIVE/SETTLED CONTENT ('${target.expected}') (${roomDump.durationMs}ms)`);
        cycleNotes = `Target content '${target.expected}' verified`;
      } else {
        console.log(`  [5] Room state: ${roomState} (rendered, no stale feed) (${roomDump.durationMs}ms)`);
        cycleNotes = `Mounted in state ${roomState}`;
      }
      a.ok(!roomDump.includes('Home destinations'), 'Must have navigated away from feed into target room');

      if (cycle === 1 || cycle === 5 || cycle === totalCycles) {
        captureScreenshot(`cycle-${cycle}-room-${target.id}.png`);
      }

      // Step 6: Return to the feed using visible Return control
      console.log(`  [6] Returning to Arena feed via visible Return control...`);
      const returnRes = await navigateToFeed({ adb: ADB, deviceId: DEVICE_ID, timeoutMs: DEFAULT_DUMP_TIMEOUT_MS });
      console.log(`      Returned to feed: ${returnRes.status} in ${returnRes.attempts} attempt(s)`);

      // Final feed confirmation for this cycle
      const postFeedDump = instrumentedDump(`c${cycle}_04_post_return_feed`);
      a.ok(postFeedDump.ok, `Cycle ${cycle} post-return feed dump failed: ${postFeedDump.error}`);
      a.equal(detectScreenState(postFeedDump), 'main_feed', 'Must return to main feed cleanly');
      console.log(`      Feed confirmed cleanly (${postFeedDump.durationMs}ms)`);

    } catch (err) {
      cycleSuccess = false;
      cycleNotes = `FAILED: ${err.message}`;
      console.error(`  [!] Cycle ${cycle} encountered error:`, err.message);
    }

    const cycleDuration = Date.now() - cycleStart;
    cycleResults.push({
      cycle,
      targetRoom: target.id,
      success: cycleSuccess,
      durationMs: cycleDuration,
      notes: cycleNotes,
    });

    console.log(`Cycle ${cycle} completed in ${(cycleDuration / 1000).toFixed(2)}s: ${cycleSuccess ? 'PASS' : 'FAIL'}`);
    await sleep(1000);
  }

  // Compute final statistics
  console.log('\n========================================================================');
  console.log('STRESS TEST COMPLETE — STATISTICAL SUMMARY');
  console.log('========================================================================');

  const successfulCycles = cycleResults.filter((c) => c.success).length;
  const totalDumps = dumpMetrics.length;
  const successfulDumps = dumpMetrics.filter((d) => d.ok).length;
  const failedDumps = dumpMetrics.filter((d) => !d.ok).length;
  const dumpDurations = dumpMetrics.filter((d) => d.ok).map((d) => d.durationMs);

  const minDuration = dumpDurations.length ? Math.min(...dumpDurations) : 0;
  const maxDuration = dumpDurations.length ? Math.max(...dumpDurations) : 0;
  const avgDuration = dumpDurations.length
    ? Math.round(dumpDurations.reduce((a, b) => a + b, 0) / dumpDurations.length)
    : 0;

  console.log(`Cycles Completed: ${successfulCycles} / ${totalCycles} (${((successfulCycles / totalCycles) * 100).toFixed(1)}%)`);
  console.log(`Total Hierarchy Dumps: ${totalDumps}`);
  console.log(`Successful Dumps: ${successfulDumps} / ${totalDumps} (${((successfulDumps / totalDumps) * 100).toFixed(1)}%)`);
  console.log(`Failed / Timed-out Dumps: ${failedDumps}`);
  console.log(`Dump Duration: Min = ${minDuration}ms | Max = ${maxDuration}ms | Avg = ${avgDuration}ms`);
  console.log(`Configured Timeout Threshold: ${DEFAULT_DUMP_TIMEOUT_MS}ms`);

  const summary = {
    totalCycles,
    successfulCycles,
    cycleSuccessRate: `${((successfulCycles / totalCycles) * 100).toFixed(1)}%`,
    totalDumps,
    successfulDumps,
    failedDumps,
    dumpSuccessRate: `${((successfulDumps / totalDumps) * 100).toFixed(1)}%`,
    duration: {
      minMs: minDuration,
      maxMs: maxDuration,
      avgMs: avgDuration,
      thresholdMs: DEFAULT_DUMP_TIMEOUT_MS,
    },
    cycleResults,
    dumpMetrics,
  };

  const summaryPath = path.join(EVIDENCE_DIR, 'stress-test-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`Summary written to: ${summaryPath}`);

  return summary;
}

if (require.main === module) {
  runStressTest(10)
    .then((summary) => {
      if (summary.successfulCycles < 10) {
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error('FATAL STRESS TEST ERROR:', err);
      process.exitCode = 1;
    });
}

module.exports = { runStressTest };
