'use strict';
/**
 * CLASH — State-Aware Android Native Navigation
 *
 * Implements dynamic, accessibility-driven navigation for Samsung Galaxy A50:
 * - Detects settled outcome, active arena room, or main feed from UI hierarchy XML.
 * - Extracts dynamic bounds for 'Return to Arena' or 'Back' controls; never hard-codes coordinates.
 * - Confirms /(tabs) feed state before mounting new deep links.
 * - Verifies rendered room content, topic, and absence of stale room artifacts.
 * - Configurable bounded dump timeout (default 12000ms), explicit diagnostic returns,
 *   strict stale-file rejection, safe process termination, and fail-closed safety guards.
 */

const a = require('assert/strict');
const cp = require('child_process');
const crypto = require('crypto');

const ADB_DEFAULT = process.env.CLASH_ADB_PATH
  || process.env.ADB_PATH
  || (process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA.replace(/\\/g, '/')}/Android/Sdk/platform-tools/adb.exe` : 'adb');
const DEVICE_DEFAULT = process.env.CLASH_ANDROID_SERIAL || process.env.ANDROID_SERIAL || '';

function adbTargetArgs(deviceId) {
  return deviceId ? ['-s', deviceId] : [];
}

const DEFAULT_DUMP_TIMEOUT_MS = 12000;
const MIN_DUMP_TIMEOUT_MS = 1000;
const MAX_DUMP_TIMEOUT_MS = 60000;

function normalizeTimeout(timeoutMs) {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_DUMP_TIMEOUT_MS;
  }
  return Math.min(Math.max(Math.round(timeoutMs), MIN_DUMP_TIMEOUT_MS), MAX_DUMP_TIMEOUT_MS);
}

function classifyDumpFailure(err, timeoutMs) {
  const errMsg = [err?.message, err?.stderr, err?.stdout]
    .filter(Boolean)
    .map(s => String(s).trim())
    .join(' | ');
  const isTimeout = Boolean(
    err && (
      err.code === 'ETIMEDOUT' ||
      err.killed ||
      /timed? ?out/i.test(err.message || '')
    )
  );
  const notIdle = /could not get idle state/i.test(errMsg);
  const code = isTimeout ? 'ETIMEDOUT' : notIdle ? 'UI_NOT_IDLE' : (err?.code || 'DUMP_FAILED');
  return {
    isTimeout,
    code,
    error: isTimeout
      ? `UI Automator dump timed out after ${timeoutMs}ms`
      : (errMsg || 'Invalid or empty UI hierarchy XML'),
  };
}

function dumpHierarchy(adb = ADB_DEFAULT, deviceId = DEVICE_DEFAULT, optionsOrTimeout = DEFAULT_DUMP_TIMEOUT_MS) {
  const opts = typeof optionsOrTimeout === 'object' && optionsOrTimeout !== null
    ? optionsOrTimeout
    : { timeoutMs: optionsOrTimeout };

  const timeoutMs = normalizeTimeout(opts.timeoutMs);
  const throwOnError = Boolean(opts.throwOnError);
  const compressed = Boolean(opts.compressed);

  const args = [...adbTargetArgs(deviceId), 'shell'];
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const uniqueName = `/data/local/tmp/dump_${Date.now()}_${randomSuffix}.xml`;

  const startTime = Date.now();
  let dumpSuccess = false;
  let xml = null;
  let lastError = null;

  // Strict stale-file prevention: guarantee destination path is vacant
  try {
    cp.execFileSync(adb, [...args, 'rm', '-f', uniqueName], { timeout: 2000, windowsHide: true });
  } catch {
    // Best-effort pre-cleanup
  }

  try {
    const dumpArgs = compressed
      ? [...args, 'uiautomator', 'dump', '--compressed', uniqueName]
      : [...args, 'uiautomator', 'dump', uniqueName];

    const dumpOut = cp.execFileSync(adb, dumpArgs, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
    if (typeof dumpOut === 'string' && /ERROR:/i.test(dumpOut)) {
      const notIdle = /could not get idle state/i.test(dumpOut);
      const err = new Error(dumpOut.trim());
      err.code = notIdle ? 'UI_NOT_IDLE' : 'DUMP_FAILED';
      throw err;
    }
    dumpSuccess = true;

    xml = cp.execFileSync(adb, [...args, 'cat', uniqueName], {
      encoding: 'utf8',
      timeout: Math.min(timeoutMs, 5000),
      windowsHide: true,
    });

    a.ok(xml && xml.includes('<?xml'), 'UI Automator dump returned invalid or empty XML');
  } catch (err) {
    lastError = err;
  } finally {
    // Strict cleanup: never leave temporary XML dump files on device
    try {
      cp.execFileSync(adb, [...args, 'rm', '-f', uniqueName], { timeout: 2000, windowsHide: true });
    } catch {
      // Best-effort cleanup
    }
  }

  const durationMs = Date.now() - startTime;

  if (!dumpSuccess || !xml || !xml.includes('<?xml')) {
    const failure = classifyDumpFailure(lastError, timeoutMs);

    // Scoped device process cleanup on timeout: terminate ONLY the process holding this call's unique temp filename
    if (failure.isTimeout) {
      try {
        cp.execFileSync(adb, [...args, 'pkill', '-f', uniqueName], { timeout: 2000, windowsHide: true });
      } catch {
        // Best-effort termination
      }
    }

    const diagnostic = {
      ok: false,
      xml: null,
      durationMs,
      tempFile: uniqueName,
      timedOut: failure.isTimeout,
      code: failure.code,
      error: failure.error,
      toString: () => '',
      includes: () => false,
    };

    if (throwOnError) {
      const err = new Error(diagnostic.error);
      err.code = diagnostic.code;
      err.diagnostic = diagnostic;
      throw err;
    }

    return diagnostic;
  }

  return {
    ok: true,
    xml,
    durationMs,
    tempFile: uniqueName,
    timedOut: false,
    code: null,
    error: null,
    toString: () => xml,
    includes: (str) => xml.includes(str),
  };
}

function parseBounds(boundsStr) {
  if (typeof boundsStr !== 'string') return null;
  const m = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!m) return null;
  const left = parseInt(m[1], 10);
  const top = parseInt(m[2], 10);
  const right = parseInt(m[3], 10);
  const bottom = parseInt(m[4], 10);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    center: {
      x: Math.round((left + right) / 2),
      y: Math.round((top + bottom) / 2),
    },
  };
}

function findControlByDesc(xml, matcher) {
  const rawXml = (xml && typeof xml === 'object' && 'xml' in xml) ? (xml.xml || '') : String(xml || '');
  if (!rawXml) return { found: false };

  const regex = /content-desc="([^"]*)"[^>]*bounds="(\[\d+,\d+\]\[\d+,\d+\])"/gi;
  let match;
  while ((match = regex.exec(rawXml)) !== null) {
    const desc = match[1];
    const boundsStr = match[2];
    const isMatch = typeof matcher === 'string'
      ? desc.trim().toLowerCase() === matcher.trim().toLowerCase()
      : matcher.test(desc);
    if (isMatch) {
      const bounds = parseBounds(boundsStr);
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        return { found: true, desc, boundsStr, bounds, center: bounds.center };
      }
    }
  }
  return { found: false };
}

function detectScreenState(xml) {
  const rawXml = (xml && typeof xml === 'object' && 'xml' in xml) ? (xml.xml || '') : String(xml || '');
  if (!rawXml) return 'unknown';

  if (
    rawXml.includes('What gets you talking?') ||
    rawXml.includes('Choose 3–5 interests') ||
    rawXml.includes('Continue read-only without saving interests')
  ) {
    return 'onboarding_gate';
  }

  if (
    rawXml.includes('content-desc="Return to Arena"') ||
    rawXml.includes('content-desc="BACK TO ARENA"') ||
    rawXml.includes('Official verdict') ||
    rawXml.includes('Refresh official result') ||
    rawXml.includes('Room unavailable')
  ) {
    return 'settled_outcome';
  }
  if (rawXml.includes('Home destinations') || rawXml.includes('For You') || rawXml.includes('Explore live Clashes')) {
    return 'main_feed';
  }
  if (rawXml.includes('content-desc="Expand Crowd conversation"') || rawXml.includes('Spectator stage actions') || rawXml.includes('Your role:')) {
    return 'active_arena_room';
  }
  return 'unknown';
}

function adbTap(x, y, adb = ADB_DEFAULT, deviceId = DEVICE_DEFAULT) {
  a.ok(Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0, `Invalid tap coordinates (${x}, ${y})`);
  cp.execFileSync(adb, [...adbTargetArgs(deviceId), 'shell', 'input', 'tap', String(x), String(y)], { windowsHide: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function navigateToFeed({
  adb = ADB_DEFAULT,
  deviceId = DEVICE_DEFAULT,
  timeoutMs = DEFAULT_DUMP_TIMEOUT_MS,
  maxAttempts = 4,
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const dump = dumpHierarchy(adb, deviceId, timeoutMs);
    if (!dump.ok) {
      // Fail-closed: Never tap using unverified or missing UI data!
      if (attempt < maxAttempts) {
        await sleep(1000);
        continue;
      }
      a.fail(`Failed to dump UI hierarchy after ${maxAttempts} attempts: ${dump.error} (${dump.code})`);
    }

    const state = detectScreenState(dump);
    if (state === 'main_feed') {
      return { status: 'PASS', state: 'main_feed', attempts: attempt };
    }

    if (state === 'onboarding_gate') {
      const dismissBtn = findControlByDesc(dump, /^(Continue read-only without saving interests|Skip for now)$/i);
      if (dismissBtn.found) {
        adbTap(dismissBtn.center.x, dismissBtn.center.y, adb, deviceId);
        await sleep(3000);
        continue;
      }
    }

    if (state === 'settled_outcome') {
      const returnBtn = findControlByDesc(dump, /^(Return to Arena|Back to Arena)$/i);
      if (returnBtn.found) {
        adbTap(returnBtn.center.x, returnBtn.center.y, adb, deviceId);
        await sleep(3000);
        continue;
      }
    }

    if (state === 'active_arena_room') {
      const backBtn = findControlByDesc(dump, /^Back$/i);
      if (backBtn.found) {
        adbTap(backBtn.center.x, backBtn.center.y, adb, deviceId);
        await sleep(3000);
        continue;
      }
    }

    // Fallback: only if state is unknown AND dump succeeded, try system keyevent back
    cp.execFileSync(adb, [...adbTargetArgs(deviceId), 'shell', 'input', 'keyevent', '4'], { windowsHide: true });
    await sleep(2000);
  }

  const finalDump = dumpHierarchy(adb, deviceId, timeoutMs);
  a.ok(finalDump.ok, `Final dump failed: ${finalDump.error}`);
  const finalState = detectScreenState(finalDump);
  a.equal(finalState, 'main_feed', `Failed to navigate to /(tabs) main feed. Current state: ${finalState}`);
  return { status: 'PASS', state: 'main_feed', attempts: maxAttempts };
}

async function navigateToRoom(roomId, {
  expectedText = null,
  rejectedText = null,
  adb = ADB_DEFAULT,
  deviceId = DEVICE_DEFAULT,
  timeoutMs = DEFAULT_DUMP_TIMEOUT_MS,
} = {}) {
  a.ok(roomId && typeof roomId === 'string', 'roomId required');

  // 1. Ensure clean main feed state first
  await navigateToFeed({ adb, deviceId, timeoutMs });

  // 2. Dispatch deep link
  const link = `clash-dev://arena/room/${roomId}`;
  cp.execFileSync(adb, [...adbTargetArgs(deviceId), 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', link, 'com.clash.v2.dev'], { windowsHide: true });
  await sleep(4000);

  // 3. Verify screen rendered the requested room
  const dump = dumpHierarchy(adb, deviceId, timeoutMs);
  a.ok(dump.ok, `Failed to dump room UI hierarchy: ${dump.error}`);
  const xml = dump.xml;
  a.ok(!xml.includes('Home destinations'), 'Device must have navigated away from feed into room');

  if (expectedText) {
    a.ok(xml.includes(expectedText), `Target room ${roomId} must display expected text: "${expectedText}"`);
  }
  if (rejectedText) {
    a.ok(!xml.includes(rejectedText), `Target room ${roomId} must NOT contain stale text: "${rejectedText}"`);
  }

  return {
    status: 'PASS',
    roomId,
    screenState: detectScreenState(xml),
    xmlLength: xml.length,
    dumpDurationMs: dump.durationMs,
  };
}

module.exports = {
  DEFAULT_DUMP_TIMEOUT_MS,
  MIN_DUMP_TIMEOUT_MS,
  MAX_DUMP_TIMEOUT_MS,
  normalizeTimeout,
  classifyDumpFailure,
  dumpHierarchy,
  parseBounds,
  findControlByDesc,
  detectScreenState,
  adbTap,
  navigateToFeed,
  navigateToRoom,
};
