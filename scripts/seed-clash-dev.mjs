/**
 * LOCAL ONLY — apply Clash fixtures + local developer auth to supabase_db_clash.
 * Refuses any other Docker container / host.
 *
 * Usage: npm run supabase:seed:clash-dev
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONTAINER = 'supabase_db_clash';
const FILES = [
  resolve('supabase/seeds/clash_dev_fixtures.sql'),
  resolve('supabase/seeds/local_dev_auth.sql'),
];

function fail(message) {
  console.error(`clash_dev_fixtures: ${message}`);
  process.exit(1);
}

function ensureContainer() {
  const listed = spawnSync(
    'docker',
    ['ps', '--filter', `name=^/${CONTAINER}$`, '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  );
  if (listed.status !== 0) {
    fail('Docker is unavailable. Start Docker, then: npm run supabase:start');
  }
  const names = (listed.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (names.includes(CONTAINER)) return;
  const loose = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
  const all = (loose.stdout ?? '').split(/\r?\n/).map((l) => l.trim());
  if (!all.includes(CONTAINER)) {
    fail(
      `Local container "${CONTAINER}" is not running.\n` +
        'Run: npm run supabase:start\n' +
        'This seed never targets hosted/production projects.',
    );
  }
}

function applySql(filePath) {
  let sql;
  try {
    sql = readFileSync(filePath);
  } catch {
    fail(`Missing SQL file at ${filePath}`);
  }
  console.log(`Applying ${filePath} → ${CONTAINER} …`);
  const result = spawnSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    {
      input: sql,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    fail(`psql exited with code ${result.status ?? 'unknown'} for ${filePath}`);
  }
}

ensureContainer();
for (const file of FILES) applySql(file);
console.log('Done. Sign in locally as dev@clash.local / clash-local-dev');
console.log('See docs/LOCAL_DEVICE_SUPABASE.md');
