/**
 * LOCAL ONLY — apply supabase/seeds/clash_dev_fixtures.sql to the Clash
 * Docker Postgres container. Refuses any other target.
 *
 * Usage: npm run supabase:seed:clash-dev
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONTAINER = 'supabase_db_clash';
const SQL_FILE = resolve('supabase/seeds/clash_dev_fixtures.sql');

function fail(message) {
  console.error(`clash_dev_fixtures: ${message}`);
  process.exit(1);
}

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

// docker filter name=^/supabase_db_clash$ should match exactly; also accept bare name.
if (!names.includes(CONTAINER)) {
  // Fallback: some Docker versions omit the leading slash in filters.
  const loose = spawnSync(
    'docker',
    ['ps', '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  );
  const all = (loose.stdout ?? '').split(/\r?\n/).map((l) => l.trim());
  if (!all.includes(CONTAINER)) {
    fail(
      `Local container "${CONTAINER}" is not running.\n` +
        'Run: npm run supabase:start\n' +
        'This seed never targets hosted/production projects.',
    );
  }
}

let sql;
try {
  sql = readFileSync(SQL_FILE);
} catch {
  fail(`Missing SQL file at ${SQL_FILE}`);
}

console.log(`Applying Clash dev fixtures via docker exec → ${CONTAINER} …`);

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
  fail(`psql exited with code ${result.status ?? 'unknown'}`);
}

console.log('Done. See supabase/CLASH_DEV_FIXTURES.md for how to use @clash_test Takes.');
