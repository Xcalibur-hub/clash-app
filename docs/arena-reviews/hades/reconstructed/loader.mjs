/**
 * HADES (reconstructed) — migration loader for a DISPOSABLE PostgreSQL instance.
 *
 * Applies the 119 baseline migrations (commit 36dccade) in order, one transaction
 * per file, after bootstrapping the Supabase-managed roles and helper functions
 * that a bare PostgreSQL does not have.
 *
 * The migration files are used BYTE-IDENTICAL to the baseline. Nothing is edited.
 * The three unavailable extensions are declared as stub extension packages
 * installed into the server's extension directory (see fixtures/README.md), and
 * the `realtime` schema is created here as a documented shim.
 *
 * NEVER run this against a database you care about: it truncates and recreates
 * schemas.
 *
 * Usage: node fabricate-artifacts/reconstructed/loader.mjs <migrationsDir>
 */
import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const CFG = {
  // Point at your disposable instance. PGHOST may be a unix-socket directory or a
  // hostname; PGPORT/PGUSER/PGDATABASE are honoured by the pg driver defaults.
  host: process.env.PGHOST || '/tmp/hades-pg',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'postgres',
};

const SCHEMAS = ['public', 'auth', 'extensions', 'realtime', 'storage'];

// Supabase-managed bootstrap. A bare PostgreSQL lacks these; without them the
// migration chain cannot even parse its own policies.
const BOOT = [
  `do $boot$ begin
     begin create role anon nologin noinherit; exception when duplicate_object then null; end;
     begin create role authenticated nologin noinherit; exception when duplicate_object then null; end;
     begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end;
     begin create role supabase_admin nologin noinherit; exception when duplicate_object then null; end;
   end $boot$`,
  `grant anon, authenticated, service_role to postgres`,

  `create schema if not exists auth`,
  `create schema if not exists extensions`,
  `create schema if not exists storage`,
  `create schema if not exists realtime`,

  // Supabase creates this publication; migrations add tables to it.
  `do $pub$ begin
     if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
       create publication supabase_realtime;
     end if;
   end $pub$`,

  // ── auth shims ───────────────────────────────────────────────────────────
  `create table if not exists auth.users (
     id uuid primary key default gen_random_uuid(),
     email text,
     created_at timestamptz not null default now())`,

  `create or replace function auth.uid() returns uuid
     language sql stable as $$
       select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid
     $$`,
  `create or replace function auth.role() returns text
     language sql stable as $$
       select coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb->>'role',''),
                       current_user::text)
     $$`,
  `create or replace function auth.jwt() returns jsonb
     language sql stable as $$
       select coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb)
     $$`,

  // ── storage shims (object metadata only; the storage SERVICE is absent) ──
  // Shape mirrors hosted Supabase's storage schema closely enough for the
  // migration chain's own bucket bootstrap to run unmodified.
  `create table if not exists storage.buckets (
     id text primary key, name text not null, owner uuid,
     public boolean default false, avif_autodetection boolean default false,
     file_size_limit bigint, allowed_mime_types text[],
     created_at timestamptz default now(), updated_at timestamptz default now())`,
  `create table if not exists storage.objects (
     id uuid primary key default gen_random_uuid(),
     bucket_id text references storage.buckets(id),
     name text, owner uuid, owner_id text, metadata jsonb,
     path_tokens text[] generated always as (string_to_array(name,'/')) stored,
     version text, created_at timestamptz default now(),
     updated_at timestamptz default now(), last_accessed_at timestamptz default now())`,
  `alter table storage.objects enable row level security`,
  `create or replace function storage.foldername(name text) returns text[]
     language sql immutable as $$
       select (string_to_array(name, '/'))[1 : greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
     $$`,

  // ── realtime shim ────────────────────────────────────────────────────────
  // The Realtime SERVER is not installed. `messages` exists so policies compile;
  // `topic()` returns the session topic realtime would set; `send()` is a no-op.
  `create table if not exists realtime.messages (
     id uuid primary key default gen_random_uuid(),
     topic text not null,
     extension text not null,
     event text,
     payload jsonb,
     inserted_at timestamptz not null default now())`,
  `alter table realtime.messages enable row level security`,
  `create or replace function realtime.topic() returns text
     language sql stable as $$
       select coalesce(nullif(current_setting('realtime.topic', true),''), '__none__')
     $$`,
  `create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
     returns void language plpgsql as $$ begin
       -- Realtime server absent: delivery is intentionally a no-op here.
       return;
     end $$`,
];

/** Load stub extensions from fixtures/ before any migration runs. */
async function installStubs(c) {
  for (const f of ['stub_extensions.sql']) {
    const p = resolve(HERE, '..', 'fixtures', f);
    if (existsSync(p)) {
      try { await c.query(readFileSync(p, 'utf8')); }
      catch (e) { if (!/already exists|duplicate/i.test(e.message)) console.log('FIXTURE', f, e.message.slice(0, 100)); }
    }
  }
}

export async function loadSchema(migDir, { quiet = false } = {}) {
  const c = new pg.Client(CFG);
  await c.connect();
  try {
    for (const s of SCHEMAS) {
      await c.query(`drop schema if exists ${s} cascade`).catch(() => {});
      await c.query(`create schema if not exists ${s}`);
    }
    for (const stmt of BOOT) {
      try { await c.query(stmt); }
      catch (e) { if (!quiet) console.log('BOOT warn:', e.message.slice(0, 110)); }
    }
    await installStubs(c);

    const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    const failed = [];
    for (const f of files) {
      try {
        await c.query('begin');
        await c.query(readFileSync(`${migDir}/${f}`, 'utf8'));
        await c.query('commit');
      } catch (e) {
        await c.query('rollback').catch(() => {});
        failed.push([f, e.message.split('\n')[0].slice(0, 120)]);
      }
    }
    return { total: files.length, applied: files.length - failed.length, failed };
  } finally {
    await c.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('loader.mjs')) {
  const dir = process.argv[2] || resolve(HERE, '..', '..', 'mig');
  const r = await loadSchema(dir);
  for (const [f, m] of r.failed) console.log(`  FAIL ${f} -> ${m}`);
  console.log(`applied ${r.applied}/${r.total}`);
  process.exit(r.failed.length ? 1 : 0);
}
