/**
 * Local pgTAP staging builder (Phase 11 Step 8, deliverable D).
 *
 * `supabase db reset` applies `supabase/migrations/*.sql` verbatim. Three
 * committed migrations carry a UTF-8 BOM that PostgreSQL rejects (42601), so a
 * fresh clone cannot run the pgTAP suite. This builder stages a disposable
 * Supabase project whose migrations are the REVIEWED compatibility artifacts
 * (the same BOM-stripped, pgcrypto-asserted bytes that were migrated to hosted).
 * Frozen migration bytes are never modified.
 *
 * Usage:  node scripts/local-pgtap-staging.mjs <absolute-target-dir>
 * Then (see the printed `next` list):
 *   1. locally alias a storage-api image that includes migration
 *      0055-prevent-direct-deletes.sql onto the CLI-pinned tag (001 #23);
 *   2. supabase start / db reset;
 *   3. elevate the disposable `postgres` role and pre-install dblink so the 10
 *      committed-concurrency suites can open independent TCP sessions;
 *   4. supabase test db.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(process.argv[2] ?? '');
if (process.argv.length !== 3 || !path.isAbsolute(target)) {
  console.error('usage: node scripts/local-pgtap-staging.mjs <absolute-target-dir>');
  process.exit(1);
}
if (fs.existsSync(target)) {
  console.error('target directory already exists; refusing to overwrite');
  process.exit(1);
}
const project = 'clash_p11_pgtap';
const ports = { api: 57751, db: 57752, studio: 57753, inbucket: 57754, analytics: 57757, pooler: 57759, shadow: 57750 };
const { generate } = require('./migration-compatibility-artifact.cjs');
const { hash, CONCURRENCY_PREFIXES } = require('../tools/isolated-supabase/prepare.cjs');

fs.mkdirSync(target, { recursive: true });
const artifactDir = path.join(target, 'migration-compatibility-local');
const manifest = generate(target, artifactDir);
if (manifest.files.length !== 106) throw new Error('expected 106 artifacts');
const manifestHash = hash(fs.readFileSync(path.join(artifactDir, 'compatibility-manifest.json')));
if (manifestHash !== '5c39f97c62559b1f5ed175be409480fb3515fded61a16f0b1b33cc3e22768110') {
  throw new Error('unexpected compatibility manifest: ' + manifestHash);
}

const supabase = path.join(target, 'supabase');
fs.mkdirSync(path.join(supabase, 'migrations'), { recursive: true });
fs.mkdirSync(path.join(supabase, 'tests'), { recursive: true });
fs.mkdirSync(path.join(supabase, 'seeds'), { recursive: true });
for (const f of fs.readdirSync(path.join(artifactDir, 'migrations'))) {
  fs.copyFileSync(path.join(artifactDir, 'migrations', f), path.join(supabase, 'migrations', f));
}
const repoRoot = root;
const testSrc = path.join(repoRoot, 'supabase', 'tests');
let suites = 0;
for (const f of fs.readdirSync(testSrc).filter((n) => n.endsWith('.sql'))) {
  fs.copyFileSync(path.join(testSrc, f), path.join(supabase, 'tests', f));
  suites++;
}

fs.writeFileSync(path.join(supabase, 'config.toml'), `project_id = "${project}"

[api]
enabled = true
port = ${ports.api}
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = ${ports.db}
shadow_port = ${ports.shadow}
major_version = 17

[db.pooler]
enabled = false
port = ${ports.pooler}

[db.seed]
enabled = true
sql_paths = ["./seeds/00_harness_prereqs.sql"]

[realtime]
enabled = true

[storage]
enabled = true
file_size_limit = "50MiB"

[auth]
enabled = true
site_url = "http://127.0.0.1:3000"
enable_signup = true

[studio]
enabled = false

[inbucket]
enabled = false

[analytics]
enabled = false

[edge_runtime]
enabled = false
`);

// Harness-only prerequisites (never a migration, never applied to hosted).
fs.writeFileSync(path.join(supabase, 'seeds', '00_harness_prereqs.sql'), `-- Local pgTAP harness prerequisites. Not a migration; never applied to hosted.
-- Suite 066 #20 asserts that an account which existed when
-- 20261008134000_arena_interest_preferences ran still has a completed row.
-- A fresh database has zero users at that moment, so simulate one returning
-- account here (documented precondition, not a test relaxation).
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000c0001')
  on conflict (id) do nothing;
insert into public.arena_interest_preferences (auth_user_id, skipped)
  values ('00000000-0000-0000-0000-0000000c0001', true)
  on conflict (auth_user_id) do nothing;
`);

console.log(JSON.stringify({
  target,
  project,
  artifact_manifest_sha256: manifestHash,
  migrations: manifest.files.length,
  suites,
  concurrency_suites: CONCURRENCY_PREFIXES.length,
  frozen_migration_bytes_modified: false,
  next: [
    `cd ${target}`,
    '# storage-api fix (local, disposable): the CLI-pinned tag lacks migration 0055-prevent-direct-deletes.sql',
    'docker tag public.ecr.aws/supabase/storage-api:v1.69.11 public.ecr.aws/supabase/storage-api:v1.26.5',
    'supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,postgres-meta',
    'supabase db reset',
    '# dblink concurrency prerequisite (disposable only; never on hosted):',
    `docker exec -e PGPASSWORD=postgres supabase_db_${project} psql -U supabase_admin -d postgres -c "alter role postgres superuser"`,
    'supabase test db',
    '# restore the pinned storage-api image afterwards:',
    'docker tag <original-image-id> public.ecr.aws/supabase/storage-api:v1.26.5',
  ],
}, null, 2));
