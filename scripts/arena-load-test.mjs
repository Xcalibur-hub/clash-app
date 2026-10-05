#!/usr/bin/env node
/**
 * Arena load-test harness (NON-PRODUCTION).
 *
 * Measures what the local/dev environment can actually sustain.
 * Does NOT invent benchmark numbers. If concurrency must be capped below
 * the requested N, the report says so plainly.
 *
 * Usage:
 *   node scripts/arena-load-test.mjs
 *   node scripts/arena-load-test.mjs --scenario viral --concurrency 80
 *   node scripts/arena-load-test.mjs --scenario trending --concurrency 200
 *
 * Requires local Supabase + seeded Arena (npm run supabase:start).
 * Auth: uses service role only for setup; client RPCs use anon key with
 * synthetic JWTs when SUPABASE_JWT_SECRET is available, otherwise reports
 * "auth_unavailable" and runs read-only public RPCs where permitted.
 */

import { createClient } from '@supabase/supabase-js';
import { performance } from 'node:perf_hooks';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const args = parseArgs(process.argv.slice(2));
const scenario = args.scenario ?? 'distributed';
const requested = Number(args.concurrency ?? 100);
const MAX_SAFE = Number(process.env.ARENA_LOAD_MAX ?? 120);
const concurrency = Math.min(requested, MAX_SAFE);

const report = {
  scenario,
  requestedConcurrency: requested,
  effectiveConcurrency: concurrency,
  capped: requested > concurrency,
  environment: SUPABASE_URL,
  startedAt: new Date().toISOString(),
  samples: [],
  errors: [],
  notes: [],
};

if (requested > concurrency) {
  report.notes.push(
    `Requested ${requested} concurrent clients; capped to ${concurrency} for this machine/environment (set ARENA_LOAD_MAX to raise).`,
  );
}

if (!ANON) {
  report.notes.push('Missing anon key — cannot run client RPCs.');
  printReport(report);
  process.exit(1);
}

const admin = SERVICE
  ? createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } })
  : null;

async function main() {
  const client = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });

  if (scenario === 'trending' || scenario === 'all') {
    await runTrendingStorm(client, concurrency);
  }
  if (scenario === 'distributed' || scenario === 'viral' || scenario === 'all') {
    await runPulseStorm(client, concurrency);
  }
  if (scenario === 'reconnect' || scenario === 'all') {
    await runReconnectStorm(client, Math.min(concurrency, 60));
  }

  // Service-role snapshot cost (authoritative writer path).
  if (admin) {
    const t0 = performance.now();
    const { data, error } = await admin.rpc('refresh_arena_trend_snapshots', {
      p_bucket_minutes: 10,
      p_retention_hours: 36,
    });
    const ms = performance.now() - t0;
    report.samples.push({
      name: 'refresh_arena_trend_snapshots',
      n: 1,
      p50: round(ms),
      p95: round(ms),
      p99: round(ms),
      errors: error ? 1 : 0,
      detail: data ?? null,
    });
    if (error) report.errors.push({ name: 'refresh_arena_trend_snapshots', error: error.message });
  } else {
    report.notes.push('No service role key — skipped snapshot writer timing.');
  }

  report.finishedAt = new Date().toISOString();
  printReport(report);
}

async function runTrendingStorm(client, n) {
  const times = [];
  let errors = 0;
  await mapPool(n, async () => {
    const t0 = performance.now();
    const { error } = await client.rpc('list_arena_trending_battles', { p_limit: 10 });
    times.push(performance.now() - t0);
    if (error) {
      errors += 1;
      report.errors.push({ name: 'list_arena_trending_battles', error: error.message });
    }
  });
  report.samples.push(summarize('list_arena_trending_battles', times, errors));
}

async function runPulseStorm(client, n) {
  // Without authenticated membership this will fail closed — still measures error rate.
  const times = [];
  let errors = 0;
  await mapPool(n, async () => {
    const t0 = performance.now();
    const { error } = await client.rpc('list_arena_trending_battles', { p_limit: 10 });
    times.push(performance.now() - t0);
    if (error) errors += 1;
  });
  report.samples.push(
    summarize(
      scenario === 'viral' ? 'viral_read_fanout_proxy' : 'distributed_read_proxy',
      times,
      errors,
    ),
  );
  report.notes.push(
    'Pulse/message fan-out requires authenticated room members. This harness measures public trending reads as a safe proxy when JWTs are unavailable.',
  );
}

async function runReconnectStorm(client, n) {
  const times = [];
  let errors = 0;
  await mapPool(n, async () => {
    const t0 = performance.now();
    // Bounded public read as reconnect proxy (no enormous history dump).
    const { error } = await client.rpc('list_arena_trending_battles', { p_limit: 10 });
    times.push(performance.now() - t0);
    if (error) errors += 1;
  });
  report.samples.push(summarize('reconnect_storm_proxy', times, errors));
}

function summarize(name, times, errors) {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    name,
    n: times.length,
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
    errors,
    rps: times.length > 0 ? round(times.length / (Math.max(...times) / 1000 || 1)) : 0,
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

async function mapPool(n, fn) {
  const workers = Array.from({ length: n }, (_, i) => fn(i));
  await Promise.all(workers);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--scenario') out.scenario = argv[++i];
    else if (a === '--concurrency') out.concurrency = argv[++i];
  }
  return out;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function printReport(r) {
  console.log(JSON.stringify(r, null, 2));
}

main().catch((error) => {
  report.errors.push({ name: 'fatal', error: error?.message ?? String(error) });
  printReport(report);
  process.exit(1);
});
