#!/usr/bin/env node
/**
 * Disposable local simulation of hosted recovery:
 * apply compatibility artifacts 1..43, then 44..106 in order.
 * Requires DATABASE_URL to a disposable Postgres (never hosted staging).
 * FILE/SQL execution only against the provided URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const artifactDir = process.env.ARTIFACT_DIR || path.join(root, '.expo/migration-compatibility-hosted-5u-final');
const url = process.env.DATABASE_URL;
if (!url || /zrutlrhhvfcsmssjiijl|supabase\.co/i.test(url)) {
  console.error('Refusing: set DATABASE_URL to a disposable local database (not hosted staging).');
  process.exit(2);
}

const mode = process.argv[2] || 'full'; // full | resume
const manifest = JSON.parse(fs.readFileSync(path.join(artifactDir, 'compatibility-manifest.json'), 'utf8'));
const files = manifest.files || manifest.Files || [];
if (files.length !== 106) {
  console.error('expected 106 artifacts, got', files.length);
  process.exit(1);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function ensureLedger(client) {
  await client.query(`create table if not exists public.schema_migrations(
    version text primary key,
    name text not null,
    statements_json jsonb not null
  )`);
}

async function applyOne(client, entry, index) {
  const base = path.basename(entry.path || entry.Path);
  const full = path.join(artifactDir, 'migrations', base);
  const sql = fs.readFileSync(full);
  const hash = sha256(sql);
  const expected = entry.hash || entry.Hash;
  if (hash !== expected) {
    throw new Error(`artifact hash mismatch at ${index + 1}: ${base}`);
  }
  const version = base.slice(0, 14);
  const name = base.slice(15).replace(/\.sql$/, '');
  await client.query('begin');
  try {
    await client.query(sql.toString('utf8'));
    await client.query(
      `insert into public.schema_migrations(version,name,statements_json) values ($1,$2,$3::jsonb)`,
      [version, name, JSON.stringify([sql.toString('utf8')])]
    );
    await client.query('commit');
    return { index: index + 1, version, name, ok: true };
  } catch (e) {
    await client.query('rollback');
    return { index: index + 1, version, name, ok: false, error: String(e.message || e) };
  }
}

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const results = [];
  try {
    await ensureLedger(client);
    const start = mode === 'resume' ? 43 : 0;
    if (mode === 'resume') {
      const { rows } = await client.query(`select count(*)::int as n from public.schema_migrations`);
      if (rows[0].n !== 43) {
        throw new Error(`resume requires exactly 43 ledger rows, found ${rows[0].n}`);
      }
    }
    for (let i = start; i < files.length; i++) {
      const r = await applyOne(client, files[i], i);
      results.push(r);
      if (!r.ok) {
        console.log(JSON.stringify({ mode, stopped_at: r, completed_before_failure: results.filter((x) => x.ok).length, results }, null, 2));
        process.exit(1);
      }
      if ((i + 1) % 10 === 0 || i + 1 === files.length) {
        process.stderr.write(`applied ${i + 1}/${files.length}\n`);
      }
    }
    const { rows } = await client.query(`select count(*)::int as n from public.schema_migrations`);
    console.log(JSON.stringify({ mode, success: true, ledger_count: rows[0].n, applied: results.length }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
