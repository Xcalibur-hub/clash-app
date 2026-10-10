#!/usr/bin/env node
/**
 * Capture Android gfxinfo / meminfo for com.clash.mapprobe.
 * Does not invent numbers — prints raw dumpsys excerpts for the operator log.
 *
 * Usage:
 *   node scripts/device-profile.mjs
 *   node scripts/device-profile.mjs --label "50-run1"
 *   node scripts/device-profile.mjs --reset
 */
import { execFileSync } from 'node:child_process';

const PKG = 'com.clash.mapprobe';
const args = process.argv.slice(2);
const labelIdx = args.indexOf('--label');
const label = labelIdx >= 0 ? args[labelIdx + 1] : new Date().toISOString();
const reset = args.includes('--reset');

function adb(adbArgs) {
  return execFileSync('adb', adbArgs, { encoding: 'utf8' });
}

function section(title, body) {
  console.log(`\n=== ${title} ===`);
  console.log(body.trimEnd());
}

console.log(`device-profile · package=${PKG} · label=${label}`);

try {
  const devices = adb(['devices']);
  section('devices', devices);
} catch (error) {
  console.error('adb not available:', error.message);
  process.exit(1);
}

if (reset) {
  try {
    section('gfxinfo reset', adb(['shell', 'dumpsys', 'gfxinfo', PKG, 'reset']));
  } catch (error) {
    section('gfxinfo reset', String(error.stdout || error.message));
  }
}

try {
  const gfx = adb(['shell', 'dumpsys', 'gfxinfo', PKG]);
  const lines = gfx.split(/\r?\n/);
  const keep = [];
  let capture = false;
  for (const line of lines) {
    if (
      /Graphics info|Janky frames|Total frames rendered|Number Missed Vsync|50th|90th|95th|99th|HISTOGRAM|Pipeline=/i.test(
        line,
      )
    ) {
      capture = true;
    }
    if (capture) {
      keep.push(line);
      if (keep.length > 80) break;
    }
  }
  section('gfxinfo (trimmed)', keep.length ? keep.join('\n') : gfx.slice(0, 4000));
} catch (error) {
  section('gfxinfo error', String(error.stdout || error.message));
}

try {
  const mem = adb(['shell', 'dumpsys', 'meminfo', PKG]);
  const interesting = mem
    .split(/\r?\n/)
    .filter((line) =>
      /App Summary|TOTAL PSS|TOTAL RSS|Java Heap|Native Heap|Graphics|Private Other|System|TOTAL\s+:/i.test(
        line,
      ),
    )
    .slice(0, 40);
  section('meminfo (trimmed)', interesting.join('\n') || mem.slice(0, 3000));
} catch (error) {
  section('meminfo error', String(error.stdout || error.message));
}

console.log('\nNote: gfxinfo requires the process to have rendered frames after reset.');
console.log('JS pipeline timings remain separate (on-screen panel / performance.now).');
