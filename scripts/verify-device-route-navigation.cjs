'use strict';
/**
 * CLASH — Live Device Route & Selector Verification on Samsung Galaxy A50
 *
 * Verifies live on physical device SM-A505F:
 * 1. Actor C session identity on device.
 * 2. Reliable route navigation without retaining stale/historical room state.
 * 3. Proves historical settled room rejects voting selection.
 * 4. Proves target room displays correct spectator state.
 */

const a = require('assert/strict');
const cp = require('child_process');
const {
  selectVotingButton,
  detectVotingState,
  verifyPreVoteGuards
} = require('./lib/arena-native-voting-guard.cjs');

const ADB = 'C:/Users/91962/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const DEVICE_ID = 'RZ8M30DE9NL';

function dumpScreen() {
  cp.execFileSync(ADB, ['-s', DEVICE_ID, 'shell', 'uiautomator', 'dump', '/data/local/tmp/dump.xml']);
  return cp.execFileSync(ADB, ['-s', DEVICE_ID, 'shell', 'cat', '/data/local/tmp/dump.xml'], { encoding: 'utf8' });
}

function adbTap(x, y) {
  cp.execFileSync(ADB, ['-s', DEVICE_ID, 'shell', 'input', 'tap', String(x), String(y)]);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('========================================================================');
  console.log('CLASH — LIVE DEVICE ROUTE & SELECTOR VERIFICATION');
  console.log('========================================================================');

  // 1. Verify Actor C session on device
  console.log('1. Checking Actor C session on Samsung Galaxy A50...');
  const sessionMod = require('../.expo/android-a50-crowd-resolution/read-session.cjs');
  const session = await sessionMod.readSession();
  console.log('   Device session user ID:', session.user?.id);
  console.log('   Device session role:', session.user?.role);
  console.log('   Device session origin:', session.origin);
  a.equal(session.user?.id, '64ad1836-fba1-4aa2-99af-81d0492178af', 'Must be Actor C');
  a.equal(session.user?.role, 'authenticated', 'Must be authenticated');
  console.log('   PASS: Actor C session verified on device.');

  // 2. Navigate back to feed
  console.log('2. Returning to main feed...');
  adbTap(100, 141);
  await sleep(2000);
  let xml = dumpScreen();
  let isFeed = xml.includes('Home destinations') || xml.includes('For You') || xml.includes('Explore live Clashes');
  if (!isFeed) {
    adbTap(100, 141);
    await sleep(1500);
    xml = dumpScreen();
    isFeed = xml.includes('Home destinations') || xml.includes('For You');
  }
  a.ok(isFeed, 'Must return to main feed');
  console.log('   PASS: Screen confirmed at main feed.');

  // 3. Open historical settled Room 1: ar_8bc423eda52a6447
  const room1 = 'ar_8bc423eda52a6447';
  console.log(`3. Navigating to historical settled room ${room1}...`);
  cp.execFileSync(ADB, ['-s', DEVICE_ID, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `clash-dev://arena/room/${room1}`, 'com.clash.v2.dev']);
  await sleep(4000);
  const xmlRoom1 = dumpScreen();
  a.ok(xmlRoom1.includes('Official verdict') || xmlRoom1.includes('View official result'), 'Room 1 must render settled view');
  console.log('   PASS: Room 1 rendered settled view.');

  // Verify voting selector rejects Room 1
  console.log('   Testing voting selector on Room 1 settled view...');
  const selRoom1 = selectVotingButton(xmlRoom1, 'A', 'judging');
  a.equal(selRoom1.found, false, 'Historical settled view must not contain active voting button');
  console.log('   PASS: Historical settled view correctly rejected by voting selector.');

  // 4. Return to feed before opening target room
  console.log('4. Navigating back to feed before opening target room...');
  adbTap(100, 141);
  await sleep(2000);
  const xmlFeed = dumpScreen();
  a.ok(xmlFeed.includes('Home destinations') || xmlFeed.includes('For You'), 'Must return to main feed');
  console.log('   PASS: Returned to feed.');

  // 5. Open target Room 2: ar_8e69cc20e018a7be
  const room2 = 'ar_8e69cc20e018a7be';
  console.log(`5. Navigating to target room ${room2}...`);
  cp.execFileSync(ADB, ['-s', DEVICE_ID, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `clash-dev://arena/room/${room2}`, 'com.clash.v2.dev']);
  await sleep(4000);
  const xmlRoom2 = dumpScreen();

  // Verify target room content
  a.ok(xmlRoom2.includes('Your role: WATCHING') || xmlRoom2.includes('Spectator stage actions'), 'Room 2 must display active spectator view');
  a.ok(xmlRoom2.includes('Broad participation can identify practical concerns'), 'Room 2 must display target challenge position');
  // Verify Room 1 historical settled artifacts are NOT retained
  a.equal(xmlRoom2.includes('Official verdict'), false, 'Room 2 must not retain historical Room 1 settled verdict');
  console.log('   PASS: Room 2 reliably mounted without retaining stale Room 1 state.');

  // 6. Test phase guard on Room 2
  console.log('6. Testing phase guard on Room 2...');
  a.throws(() => {
    selectVotingButton(xmlRoom2, 'A', 'closed');
  }, /room phase is 'closed', must be 'judging'/);
  console.log('   PASS: Phase guard strictly prevents voting selection when phase is closed.');

  // 7. Test Pre-Vote Guard rejection
  console.log('7. Testing Pre-Vote Guard validation against current expired state...');
  a.throws(() => {
    verifyPreVoteGuards({
      actorId: session.user.id,
      expectedActorId: 'u_64ad1836fba14aa299af81d0492178af',
      displayedRoomId: room2,
      targetRoomId: room2,
      serverNow: Date.now(),
      judgingAt: Date.parse('2026-11-09T11:30:01.597Z'),
      closesAt: Date.parse('2026-11-09T11:35:01.597Z'), // expired!
      buttonSelection: { found: false, reason: 'judging expired' }
    });
  }, /PRE_VOTE_GUARD_FAILED: Judging window has expired/);
  console.log('   PASS: Pre-Vote Guard correctly halts execution before issuing any ADB tap.');

  console.log('========================================================================');
  console.log('ALL LIVE DEVICE ROUTE & SELECTOR VERIFICATIONS: PASS');
  console.log('========================================================================');
}

main().catch(err => {
  console.error('FATAL VERIFICATION ERROR:', err);
  process.exitCode = 1;
});
