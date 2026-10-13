/**
 * Staging Edge Function deployment (Phase 11 Steps 12–13) — HARDENED.
 *
 * DRY-RUN BY DEFAULT. Nothing is deployed without `--execute`.
 *
 * Gates, in order, before ANY mutation:
 *   1. project identity (`--confirm-project` must repeat the pinned ref, and the
 *      remote project is read back before touching it);
 *   2. selection: every `--only` name must be in the reviewed APPROVED set;
 *   3. commit pin: `--commit <sha>` must equal HEAD, with a clean working tree;
 *   4. pinned CLI: `supabase@2.40.7`, version asserted before use;
 *   5. manifest ↔ supabase/config.toml verify_jwt cross-check for all functions;
 *   6. required secrets for the SELECTED SET ONLY, by name, presence-checked.
 *
 * After deployment: strict inventory verification (verify_jwt must be a boolean
 * equal to the expectation), partial-deployment check, then negative-auth smoke
 * tests. Every captured string is redacted before it can reach a log or evidence.
 *
 * The access token travels in the child ENVIRONMENT only — never argv, never
 * evidence, never logs. No secret value is ever read, printed, generated or
 * uploaded.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_DEPLOYMENT_SET, CLI_SPEC, FUNCTIONS, JWT_EXEMPT, PINNED_CLI_VERSION, PLATFORM_INJECTED, PROJECT_HOST, PROJECT_REF,
} from './staging-functions.manifest.mjs';
import {
  checkCliVersion, checkCommitPin, checkInventory, checkPartialDeployment, checkProjectRef,
  checkSecretPrereqs, checkSmoke, evidenceIsSanitized, redact, requiredSecretsForSet, selectFunctions,
} from './staging-functions.lib.mjs';
import { fetchFunctionsInventory, fetchSecretNames } from './staging-functions.api.mjs';

export const TOKEN_ENV = 'SUPABASE_ACCESS_TOKEN';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const out = {
    execute: false, only: [], commit: '', confirmProject: '',
    evidence: path.join(ROOT, '.expo', 'staging-deploy', String(Date.now())),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--execute') out.execute = true;
    else if (a === '--only') out.only = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--commit') out.commit = String(argv[++i] ?? '').trim();
    else if (a === '--confirm-project') out.confirmProject = String(argv[++i] ?? '').trim();
    else if (a === '--evidence-dir') out.evidence = path.resolve(String(argv[++i] ?? ''));
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!out.only.length) throw new Error('--only <comma separated function names> is required');
  return out;
}

/** Runs the PINNED CLI. Output is captured and redacted by the caller. */
export function cli(args) {
  try {
    return { ok: true, out: execFileSync('npx', ['--yes', CLI_SPEC, ...args], { cwd: ROOT, encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    // Both streams can contain the CLI's own diagnostics; they are redacted here
    // so a token can never be persisted to a log or to evidence.
    const out = `${e?.stdout ?? ''}${e?.stderr ?? ''}`.trim() || String(e?.message ?? e);
    return { ok: false, out: redact(out) };
  }
}

export function gitState() {
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim();
  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    branch: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    clean: dirty.length === 0,
    dirtyPaths: dirty ? dirty.split('\n') : [],
  };
}

export function validateRepositoryInputs(manifest) {
  for (const f of manifest) {
    if (!existsSync(path.join(ROOT, 'supabase', 'functions', f.name, 'index.ts'))) throw new Error(`refusing: missing ${f.name}/index.ts`);
  }
  const config = readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8');
  for (const f of manifest) {
    const block = config.match(new RegExp(`\\[functions\\.${f.name}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
    const declared = block ? /verify_jwt\s*=\s*(true|false)/.exec(block[1])?.[1] : undefined;
    if (declared !== String(f.verifyJwt)) throw new Error(`refusing: config.toml verify_jwt for ${f.name} is ${declared}, manifest says ${f.verifyJwt}`);
  }
  if (JWT_EXEMPT.length !== 1 || JWT_EXEMPT[0] !== 'arena-editorial') throw new Error('refusing: JWT exemption set changed');
}

export async function fetchDeployed(token) {
  // Inventory MUST come from the Management API: the pinned CLI's `functions
  // list` has no machine-readable output and never reports verify_jwt.
  return fetchFunctionsInventory(token);
}

export async function readSecretNames(token) {
  // NAMES ONLY. Secret values are never requested, read, printed or uploaded.
  return fetchSecretNames(token);
}

export function writeEvidence(dir, payload) {
  if (!evidenceIsSanitized(payload)) throw new Error('refusing: evidence would contain a credential-like value');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'deploy-evidence.json');
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
  return file;
}

export async function smokeTests(names) {
  const results = [];
  for (const name of names) {
    const url = `https://${PROJECT_HOST}/functions/v1/${name}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal });
      clearTimeout(timer);
      results.push({ name, status: res.status, expected: 401 });
    } catch (e) {
      results.push({ name, status: 'error', expected: 401, detail: String(e?.name ?? e) });
    }
  }
  return results;
}

function invokedDirectly() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

export async function run(argv = process.argv.slice(2)) {
  const evidence = { step: 'phase-11-13', mode: 'dry-run', project_ref: PROJECT_REF, started_at: new Date().toISOString(), checks: [] };
  let evidenceDir = null;
  const note = (name, res) => evidence.checks.push({ check: name, ok: res.ok, detail: res.reason });
  const stop = (reason) => { evidence.result = 'STOPPED'; evidence.reason = redact(reason); return evidence; };
  try {
    const args = parseArgs(argv);
    evidenceDir = args.evidence;
    evidence.mode = args.execute ? 'execute' : 'dry-run';
    evidence.requested = args.only;
    const token = process.env[TOKEN_ENV] ?? '';
    evidence.token_present = token.length > 0;

    // 1. project identity — before anything else.
    const proj = checkProjectRef(PROJECT_REF, args.confirmProject);
    note('project_identity', proj);
    if (!proj.ok) { if (args.execute) return stop(proj.reason); }

    // 2. selection must stay inside the reviewed set.
    const sel = selectFunctions({ requested: args.only, approved: APPROVED_DEPLOYMENT_SET, manifest: FUNCTIONS });
    note('function_allowlist', sel);
    if (!sel.ok) return stop(sel.reason);
    evidence.approved_set = sel.selected;

    // 3. pinned commit + clean tree.
    const g = gitState();
    const pin = checkCommitPin({ expected: args.commit, actual: g.commit, clean: g.clean, dirtyPaths: g.dirtyPaths });
    note('commit_pin', pin);
    evidence.source = { commit: g.commit, branch: g.branch };
    if (args.execute && !pin.ok) return stop(pin.reason);

    // 4. repository inputs (files + config.toml parity).
    validateRepositoryInputs(FUNCTIONS);
    note('repository_inputs', { ok: true, reason: 'six functions present; config.toml verify_jwt matches the manifest' });

    // 5. pinned CLI version — asserted before any mutation (execute only; the
    //    plan run stays fully offline).
    if (args.execute) {
      const version = cli(['--version']);
      const cliCheck = version.ok ? checkCliVersion(version.out, PINNED_CLI_VERSION) : { ok: false, reason: 'CLI not runnable' };
      note('pinned_cli', cliCheck);
      if (!cliCheck.ok) return stop(cliCheck.reason);
    } else {
      note('pinned_cli', { ok: true, reason: `pinned spec ${CLI_SPEC} (asserted only on --execute)` });
    }

    // 6. secrets required for the SELECTED SET ONLY.
    const required = requiredSecretsForSet(sel.selected, FUNCTIONS);
    evidence.required_secrets_for_set = required;
    if (args.execute) {
      if (!token) return stop(`missing credential: set ${TOKEN_ENV} in this shell only (never a file, argv or log)`);
      if (required.length === 0) {
        // Step 13 rule: check required secrets only for the selected set. With an
        // empty requirement the secrets API is not called at all.
        note('secret_prereqs', { ok: true, reason: 'no required secret for the selected set; secrets API not called' });
      } else {
        const present = await readSecretNames(token);
        const sec = checkSecretPrereqs({ required, present });
        note('secret_prereqs', sec);
        if (!sec.ok) return stop(sec.reason);
      }
    } else {
      note('secret_prereqs', { ok: true, reason: `plan: ${required.length} required secret(s) for the selected set` });
    }

    if (!args.execute) {
      evidence.result = 'PLAN ONLY - re-run with --execute, --commit and --confirm-project after authorization';
      evidence.evidence_file = writeEvidence(evidenceDir, evidence);
      return evidence;
    }

    // Pre-mutation read-back of the target project (Management API).
    const before = await fetchDeployed(token);
    evidence.inventory_before = before;
    note('target_read_back', { ok: true, reason: `${before.length} function(s) already deployed` });

    const deployed = [];
    for (const name of sel.selected) {
      const started = Date.now();
      const r = cli(['functions', 'deploy', name, '--project-ref', PROJECT_REF]);
      if (!r.ok) return stop(`deploy failed for ${name}: ${r.out}`);
      deployed.push({ name, ms: Date.now() - started });
      evidence.deployed = deployed;
    }

    const after = await fetchDeployed(token);
    evidence.inventory = after;
    const selectedManifest = FUNCTIONS.filter((f) => sel.selected.includes(f.name));
    const inv = checkInventory({ manifest: selectedManifest, actual: after, requireAll: true });
    note('inventory_strict', inv);
    if (!inv.ok) return stop(inv.reason);
    const partial = checkPartialDeployment({ requested: sel.selected, actual: after });
    note('partial_deployment', partial);
    if (!partial.ok) return stop(partial.reason);

    const smoke = await smokeTests(sel.selected);
    evidence.smoke = smoke;
    const sm = checkSmoke(smoke);
    note('negative_auth_smoke', sm);
    if (!sm.ok) return stop(sm.reason);

    evidence.result = 'DEPLOYED AND VERIFIED';
    evidence.functions = sel.selected.map((n) => {
      const f = FUNCTIONS.find((x) => x.name === n);
      return { name: f.name, verify_jwt: f.verifyJwt, required: f.required, optional: f.optional };
    });
    evidence.secrets_read = false;
    evidence.secret_values_present = false;
    evidence.generated_at = new Date().toISOString();
    evidence.evidence_file = writeEvidence(evidenceDir, evidence);
    return evidence;
  } catch (e) {
    const stopped = stop(String(e?.message ?? e));
    try { stopped.evidence_file = writeEvidence(evidenceDir ?? path.join(ROOT, '.expo', 'staging-deploy', String(Date.now())), stopped); } catch { /* nothing further to do */ }
    return stopped;
  }
}

if (invokedDirectly()) {
  const result = await run();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.result === 'STOPPED' ? 1 : 0);
}

export { APPROVED_DEPLOYMENT_SET, FUNCTIONS, PINNED_CLI_VERSION, PLATFORM_INJECTED, PROJECT_REF, requiredSecretsForSet };

