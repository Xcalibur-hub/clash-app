'use strict';
/**
 * CLASH — Live Device State-Aware Navigation Proof on Samsung Galaxy A50
 *
 * Executes Task 2 transitions without creating any duels:
 * 1. Navigate from settled room to Arena feed via dynamic 'Return to Arena' control.
 * 2. Open room ar_57f0a04b580bec42 and verify requested content (counter-position).
 * 3. Return to feed.
 * 4. Open settled room ar_8bc423eda52a6447 and verify settled content.
 * 5. Repeat transitions to detect stale Expo Router state.
 * 6. Save binary screenshots and UI hierarchy XMLs.
 */

const fs = require('fs');
const path = require('path');
const a = require('assert/strict');
const cp = require('child_process');
const crypto = require('crypto');
const {
  dumpHierarchy,
  findControlByDesc,
  detectScreenState,
  navigateToFeed,
  navigateToRoom,
} = require('./lib/arena-device-navigation.cjs');

const ADB = 'C:/Users/91962/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const DEVICE_ID = 'RZ8M30DE9NL';
const EVIDENCE_DIR = path.resolve(__dirname, '../.expo/navigation-evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function captureScreenshot(filename) {
  const dest = path.join(EVIDENCE_DIR, filename);
  const bytes = cp.execFileSync(ADB, ['-s', DEVICE_ID, 'exec-out', 'screencap', '-p'], { maxBuffer: 20e6 });
  a.ok(bytes.length > 8, 'Screenshot empty');
  a.equal(bytes[0], 0x89, 'PNG magic byte 0');
  a.equal(bytes[1], 0x50, 'PNG magic byte 1');
  a.equal(bytes[2], 0x4e, 'PNG magic byte 2');
  a.equal(bytes[3], 0x47, 'PNG magic byte 3');
  fs.writeFileSync(dest, bytes);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  console.log(`   [Screenshot] ${filename} (${bytes.length} bytes, sha256: ${hash.slice(0, 16)}...)`);
  return { path: dest, size: bytes.length, sha256: hash };
}

function saveXml(filename, xml) {
  const dest = path.join(EVIDENCE_DIR, filename);
  fs.writeFileSync(dest, xml, 'utf8');
  console.log(`   [XML Dump] ${filename} (${xml.length} characters)`);
  return dest;
}

async function main() {
  console.log('========================================================================');
  console.log('CLASH — LIVE DEVICE STATE-AWARE NAVIGATION PROOF');
  console.log('Device: Samsung Galaxy A50 (RZ8M30DE9NL)');
  console.log('========================================================================\n');

  // 1. Initial State Inspection
  console.log('Step 1: Inspecting initial device screen state...');
  const initXml = dumpHierarchy(ADB, DEVICE_ID);
  const initState = detectScreenState(initXml);
  console.log(`   Initial screen state detected: ${initState}`);
  saveXml('00-initial-state.xml', initXml);
  captureScreenshot('00-initial-state.png');

  // 2. Navigate from Settled Room to Main Feed
  console.log('\nStep 2: Navigating from settled room to /(tabs) main feed...');
  const feed1Res = await navigateToFeed({ adb: ADB, deviceId: DEVICE_ID });
  console.log(`   Navigation to feed result: ${feed1Res.status} in ${feed1Res.attempts} attempt(s)`);
  const feed1Xml = dumpHierarchy(ADB, DEVICE_ID);
  a.equal(detectScreenState(feed1Xml), 'main_feed', 'Must be at main feed');
  saveXml('01-feed-from-settled.xml', feed1Xml);
  captureScreenshot('01-feed-from-settled.png');

  // 3. Open Room ar_57f0a04b580bec42
  const room57f0 = 'ar_57f0a04b580bec42';
  const expectedText57f0 = 'Broad participation can identify practical concerns';
  console.log(`\nStep 3: Opening target room ${room57f0}...`);
  const room1Res = await navigateToRoom(room57f0, {
    expectedText: expectedText57f0,
    rejectedText: 'Official verdict',
    adb: ADB,
    deviceId: DEVICE_ID,
  });
  console.log(`   Room ${room57f0} mounted and verified:`, room1Res);
  const room1Xml = dumpHierarchy(ADB, DEVICE_ID);
  saveXml('02-room-57f0.xml', room1Xml);
  captureScreenshot('02-room-57f0.png');

  // 4. Navigate from Room ar_57f0a04b580bec42 back to Feed
  console.log(`\nStep 4: Navigating from room ${room57f0} back to feed...`);
  const feed2Res = await navigateToFeed({ adb: ADB, deviceId: DEVICE_ID });
  console.log(`   Navigation to feed result: ${feed2Res.status} in ${feed2Res.attempts} attempt(s)`);
  const feed2Xml = dumpHierarchy(ADB, DEVICE_ID);
  a.equal(detectScreenState(feed2Xml), 'main_feed', 'Must be at main feed');
  saveXml('03-feed-from-57f0.xml', feed2Xml);
  captureScreenshot('03-feed-from-57f0.png');

  // 5. Open Settled Room ar_8bc423eda52a6447
  const room8bc4 = 'ar_8bc423eda52a6447';
  console.log(`\nStep 5: Opening historical settled room ${room8bc4}...`);
  const room2Res = await navigateToRoom(room8bc4, {
    expectedText: 'Official verdict',
    rejectedText: expectedText57f0,
    adb: ADB,
    deviceId: DEVICE_ID,
  });
  console.log(`   Room ${room8bc4} mounted and verified:`, room2Res);
  const room2Xml = dumpHierarchy(ADB, DEVICE_ID);
  saveXml('04-room-8bc4.xml', room2Xml);
  captureScreenshot('04-room-8bc4.png');

  // 6. Repeat Transition: Return to Feed and Re-open ar_57f0a04b580bec42
  console.log('\nStep 6: Repeating transitions to verify stale state avoidance...');
  await navigateToFeed({ adb: ADB, deviceId: DEVICE_ID });
  const room3Res = await navigateToRoom(room57f0, {
    expectedText: expectedText57f0,
    rejectedText: 'Official verdict',
    adb: ADB,
    deviceId: DEVICE_ID,
  });
  console.log(`   Repeated navigation to ${room57f0} verified:`, room3Res);
  const room3Xml = dumpHierarchy(ADB, DEVICE_ID);
  saveXml('05-repeated-room-57f0.xml', room3Xml);
  captureScreenshot('05-repeated-room-57f0.png');

  // Final cleanup: return to feed
  console.log('\nStep 7: Returning device to main feed...');
  await navigateToFeed({ adb: ADB, deviceId: DEVICE_ID });
  const finalXml = dumpHierarchy(ADB, DEVICE_ID);
  a.equal(detectScreenState(finalXml), 'main_feed', 'Must leave device on clean main feed');
  captureScreenshot('06-final-feed.png');

  console.log('\n========================================================================');
  console.log('ALL LIVE NAVIGATION PROOFS PASSED WITH ZERO CORRUPTED STATE!');
  console.log('========================================================================');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nFATAL PROOF ERROR:', err);
    process.exitCode = 1;
  });
}
