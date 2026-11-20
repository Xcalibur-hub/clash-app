/** Local Supabase + USB Android. --background keeps Metro independent of this terminal. */
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { writeLocalEnv, adbReverseSupabase } from './local-supabase-env.mjs';

const root = resolve('.');
const background = process.argv.includes('--background');
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('expo/package.json')), 'bin', 'cli');

const backend = await fetch('http://127.0.0.1:55321/auth/v1/health', {
  signal: AbortSignal.timeout(5000),
}).catch(() => null);
if (!backend?.ok) {
  throw new Error('Local Supabase is unavailable on 55321. Start the existing stack with supabase start.');
}
writeLocalEnv();
adbReverseSupabase();

// Keep the existing debug package and its data. Older installations use
// com.clash.v2; forcing clash-dev would target an app that is not installed.
const packages = spawnSync('adb', ['shell', 'pm', 'list', 'packages'], { encoding: 'utf8' });
if (packages.status !== 0) throw new Error('Unable to inspect installed Android packages.');
const installed = new Set(packages.stdout.trim().split(/\r?\n/));
const variant = process.env.APP_VARIANT ??
  (installed.has('package:com.clash.v2.dev') ? 'development' : 'production');
const packageId = variant === 'development' ? 'com.clash.v2.dev' : 'com.clash.v2';
if (!installed.has(`package:${packageId}`)) {
  throw new Error(`Install the matching Android debug build first: ${packageId}`);
}
const details = spawnSync('adb', ['shell', 'dumpsys', 'package', packageId], { encoding: 'utf8' });
if (details.status !== 0 || !details.stdout.includes('DEBUGGABLE')) {
  throw new Error(`${packageId} is not an Android debug build; it cannot load this Metro bundle.`);
}
console.log(`Local Android target: ${packageId} (${variant})`);

async function metroReady() {
  try {
    const response = await fetch('http://127.0.0.1:8081/', {
      headers: { accept: 'application/expo+json', 'expo-platform': 'android' },
      signal: AbortSignal.timeout(3000),
    });
    const manifest = await response.json();
    const servedRoot = manifest.extra?.expoClient?._internal?.projectRoot;
    if (!servedRoot || resolve(servedRoot).toLowerCase() !== root.toLowerCase()) {
      throw new Error('Port 8081 is serving another project. Stop that server explicitly first.');
    }
    return true;
  } catch (error) {
    if (error.message.includes('another project')) throw error;
    return false;
  }
}

if (await metroReady()) {
  console.log('Reusing current repository Metro on 8081.');
} else {
  // Metro sizes its jest-worker pool to the CPU count by default. Each fork
  // opens its own console window on Windows when Metro has no inherited console
  // (background/detached launch), which produced a burst of black windows.
  // Cap it: a single worker keeps transforms in-band and forks nothing.
  const workers = process.env.CLASH_METRO_WORKERS ?? '1';
  const args = [cli, 'start', '--dev-client', '--localhost', '--port', '8081', '--max-workers', workers];
  const options = { cwd: root, env: { ...process.env, APP_VARIANT: variant } };
  if (background) {
    mkdirSync(join(root, '.expo'), { recursive: true });
    const logPath = join(root, '.expo', 'metro-local.log');
    const log = openSync(logPath, 'a');
    const child = spawn(process.execPath, args, {
      ...options, detached: true, windowsHide: true, stdio: ['ignore', log, log],
    });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.unref();
    closeSync(log);
    console.log(`Detached Metro PID ${child.pid}; log: ${logPath}`);
    let ready = false;
    for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      ready = await metroReady();
    }
    if (!ready) throw new Error('Metro did not become ready. Inspect .expo/metro-local.log.');
  } else {
    const child = spawn(process.execPath, args, { ...options, stdio: 'inherit' });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => process.exit(code ?? 1));
  }
}

if (background) {
  const launch = spawnSync('adb', ['shell', 'am', 'start', '-n', `${packageId}/.MainActivity`], {
    encoding: 'utf8',
  });
  if (launch.status !== 0) throw new Error(launch.stderr || 'Android app launch failed.');
  console.log('Opened the installed app. Metro stays running after this command exits.');
  console.log('Run this command again to restore USB forwarding after reconnecting the phone.');
}
