/**
 * npm run supabase:reset
 *
 * Local-only reset that survives CLI ≥2.x Storage bootstrap ordering:
 *   1. supabase db reset
 *      - migrations (media_storage Storage section no-ops if tables missing)
 *      - SQL seeds (00_storage_bootstrap soft-skips if Storage not ready yet)
 *   2. supabase seed buckets
 *      - upserts [storage.buckets.*] via the Storage service
 *   3. re-apply 00_storage_bootstrap.sql
 *      - guarantees buckets + Storage RLS once Storage owns its schema
 *
 * Never targets hosted / linked projects.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapSql = path.join(root, 'supabase', 'seeds', '00_storage_bootstrap.sql');

function run(args) {
  const result = spawnSync('npx', ['supabase', ...args], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
    cwd: root,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(['db', 'reset']);
run(['seed', 'buckets', '--local']);
run(['db', 'query', '--local', '-f', bootstrapSql]);

// Vault Creator World posters (local Storage). SQL seeds insert media_objects;
// this uploads matching public-media bytes so Discover cards are visual.
const media = spawnSync(process.execPath, [path.join(root, 'scripts', 'upload-vault-fixture-media.mjs')], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});
if (media.status !== 0) {
  process.exit(media.status ?? 1);
}
