/**
 * Staging Edge Function deployment (Phase 11 Step 12).
 *
 * DRY-RUN BY DEFAULT. Nothing is deployed without `--execute`.
 *
 * Safety properties:
 *   · refuses any project ref other than the approved staging ref;
 *   · validates repository inputs (clean tree, expected files) before deploying;
 *   · requires an access token via ENVIRONMENT ONLY (never argv, never logged);
 *   · NEVER passes `--no-verify-jwt`; JWT policy comes from supabase/config.toml;
 *   · deploys only the functions explicitly named in `--only`;
 *   · re-reads the deployed inventory and refuses on any mismatch;
 *   · runs negative-authentication smoke tests and writes sanitized evidence.
 *
 * Usage:
 *   node scripts/staging-functions-deploy.mjs --only vault-media-access            # plan
 *   node scripts/staging-functions-deploy.mjs --only vault-media-access --execute   # deploy
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FUNCTIONS, JWT_EXEMPT, PROJECT_REF, PROJECT_HOST, PLATFORM_INJECTED, requiredSecretNames } from './staging-functions.manifest.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN_ENV = 'SUPABASE_ACCESS_TOKEN';

export function parseArgs(argv) {
  const out = { execute: false, only: [], evidence: path.join(ROOT, '.expo', 'staging-deploy', String(Date.now())) };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--execute') out.execute = true;
    else if (argv[i] === '--only') out.only = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === '--evidence-dir') out.evidence = path.resolve(String(argv[++i] ?? ''));
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (out.only.length === 0) throw new Error('--only <comma separated function names> is required');
  return out;
}

export function supabase(args) {
  // The token travels in the child ENVIRONMENT only; it is never an argument.
  return execFileSync('npx', ['supabase', ...args], { cwd: ROOT, encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function assertProjectIdentity() {
  if (PROJECT_REF !== 'zrutlrhhvfcsmssjiijl') throw new Error('refusing: unexpected project reference');
}

export function assertCleanInputs() {
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (dirty) throw new Error(`refusing: working tree is not clean (${dirty.split('\n').length} path(s))`);
  for (const f of FUNCTIONS) {
    if (!existsSync(path.join(ROOT, 'supabase', 'functions', f.name, 'index.ts'))) throw new Error(`refusing: missing ${f.name}/index.ts`);
  }
  const config = readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8');
  for (const f of FUNCTIONS) {
    const block = config.match(new RegExp(`\\[functions\\.${f.name}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
    const declared = block ? /verify_jwt\s*=\s*(true|false)/.exec(block[1])?.[1] : undefined;
    if (declared !== String(f.verifyJwt)) throw new Error(`refusing: config.toml verify_jwt for ${f.name} is ${declared}, manifest says ${f.verifyJwt}`);
  }
  if (JWT_EXEMPT.length !== 1 || JWT_EXEMPT[0] !== 'arena-editorial') throw new Error('refusing: JWT exemption set changed');
  return { commit, branch };
}

export function checkToken() {
  return {
    present: (process.env[TOKEN_ENV] ?? '').length > 0,
    hint: `set ${TOKEN_ENV} in this shell only (never in a file, argv or log); the CLI reads it from the environment`,
  };
}

export function checkSecretNames() {
  const raw = supabase(['secrets', 'list', '--project-ref', PROJECT_REF, '-o', 'json']);
  const names = new Set((JSON.parse(raw) ?? []).map((r) => String(r.name ?? r.Name ?? '')));
  // NAMES ONLY — secret values are never requested, read or printed.
  return { present: [...names].sort(), missing: requiredSecretNames().filter((n) => !names.has(n)) };
}

export function deployOne(name) {
  const fn = FUNCTIONS.find((f) => f.name === name);
  if (!fn) throw new Error(`refusing: ${name} is not a known function`);
  if (!fn.verifyJwt && !JWT_EXEMPT.includes(name)) throw new Error(`refusing: unexpected JWT exemption for ${name}`);
  const started = Date.now();
  supabase(['functions', 'deploy', name, '--project-ref', PROJECT_REF]);
  return { name, ms: Date.now() - started };
}

export function fetchDeployed() {
  const raw = supabase(['functions', 'list', '--project-ref', PROJECT_REF, '-o', 'json']);
  return (JSON.parse(raw) ?? []).map((r) => ({
    name: String(r.name ?? r.slug ?? ''),
    verify_jwt: r.verify_jwt ?? r.verifyJwt ?? null,
    version: r.version ?? null,
    updated_at: r.updated_at ?? null,
  }));
}

export async function smokeTests(deployedNames) {
  const results = [];
  for (const name of deployedNames) {
    const url = `https://${PROJECT_HOST}/functions/v1/${name}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal });
      clearTimeout(timer);
      // Every function must reject an unauthenticated call: JWT-enforced ones at
      // the gateway, arena-editorial at its own missing-secret check.
      results.push({ name, status: res.status, expected: 401, pass: res.status === 401 });
    } catch (e) {
      results.push({ name, status: 'error', expected: 401, pass: false, detail: String(e?.name ?? e) });
    }
  }
  return results;
}

export function writeEvidence(dir, payload) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'deploy-evidence.json');
  // Sanitized by construction: names, versions, statuses, timings, commit only.
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
  return file;
}

export { FUNCTIONS, JWT_EXEMPT, PLATFORM_INJECTED, PROJECT_HOST, PROJECT_REF, requiredSecretNames };


function invokedDirectly() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (invokedDirectly()) {
  const evidence = { step: 'phase-11-12', mode: 'dry-run', project_ref: PROJECT_REF, started_at: new Date().toISOString() };
  let evidenceDir = null;
  try {
    const args = parseArgs(process.argv.slice(2));
    evidenceDir = args.evidence;
    evidence.mode = args.execute ? 'execute' : 'dry-run';
    evidence.approved = args.only;
    assertProjectIdentity();
    evidence.source = assertCleanInputs();
    evidence.functions = FUNCTIONS.map((f) => ({ name: f.name, verify_jwt: f.verifyJwt, required: f.required, optional: f.optional, platform_injected: PLATFORM_INJECTED }));
    const unknown = args.only.filter((n) => !FUNCTIONS.some((f) => f.name === n));
    if (unknown.length) throw new Error(`refusing: not an approved function: ${unknown.join(', ')}`);
    const token = checkToken();
    evidence.token_present = token.present;
    if (!args.execute) {
      evidence.result = 'PLAN ONLY — re-run with --execute after authorization';
      evidence.evidence_file = writeEvidence(args.evidence, evidence);
      console.log(JSON.stringify(evidence, null, 2));
      process.exit(0);
    }
    if (!token.present) {
      evidence.result = 'BLOCKED';
      evidence.reason = 'missing credential';
      evidence.how_to_fix = token.hint;
      evidence.evidence_file = writeEvidence(args.evidence, evidence);
      console.log(JSON.stringify(evidence, null, 2));
      process.exit(2);
    }
    evidence.secrets = checkSecretNames();
    if (evidence.secrets.missing.length) throw new Error(`refusing: missing required function secret(s): ${evidence.secrets.missing.join(', ')}`);
    evidence.deployed = args.only.map((n) => deployOne(n));
    const inventory = fetchDeployed();
    evidence.inventory = inventory;
    const bad = args.only.filter((n) => {
      const row = inventory.find((r) => r.name === n);
      const want = FUNCTIONS.find((f) => f.name === n).verifyJwt;
      return !row || (row.verify_jwt !== null && Boolean(row.verify_jwt) !== want);
    });
    if (bad.length) throw new Error(`deployed inventory mismatch for: ${bad.join(', ')}`);
    evidence.smoke = await smokeTests(args.only);
    if (evidence.smoke.some((s) => !s.pass)) throw new Error('negative-authentication smoke test failed');
    evidence.result = 'DEPLOYED AND VERIFIED';
    evidence.evidence_file = writeEvidence(args.evidence, evidence);
    console.log(JSON.stringify(evidence, null, 2));
  } catch (e) {
    evidence.result = 'STOPPED';
    evidence.reason = String(e?.message ?? e);
    evidence.evidence_file = writeEvidence(evidenceDir ?? path.join(ROOT, '.expo', 'staging-deploy', String(Date.now())), evidence);
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(1);
  }
}

