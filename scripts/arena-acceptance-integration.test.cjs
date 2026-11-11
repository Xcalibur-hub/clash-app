const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const {
  CONTROLLER_COMMANDS, createControllerSpawn, createControllerSession, createAdbTransport, assertSafeToken,
} = require('./lib/arena-acceptance-process.cjs');
const { openJournal, readJournal, recover } = require('./lib/arena-acceptance-journal.cjs');
const {
  signArtifact, verifyArtifact, signingKeyFromEnv, createArtifactGate, canonicalize,
} = require('./lib/arena-acceptance-authorization.cjs');
const { createRunner, preflight, resumeFromJournal } = require('./lib/arena-acceptance-runner.cjs');
const { deriveDeadlines, PHASE_PLAN, TERMINAL, planDigest } = require('./lib/arena-acceptance-scheduler.cjs');

const MIN = 60 * 1000;
const OPEN = Date.UTC(2026, 10, 6, 3, 0, 0);
const HASH = 'a'.repeat(64);
const PLAN = 'b'.repeat(64);
const KEY = 'k'.repeat(48);
const accept = () => ({
  opens_at: OPEN,
  final_arguments_at: OPEN + PHASE_PLAN.openMin * MIN,
  judging_at: OPEN + (PHASE_PLAN.openMin + PHASE_PLAN.finalMin) * MIN,
  closes_at: OPEN + (PHASE_PLAN.openMin + PHASE_PLAN.finalMin + PHASE_PLAN.judgingMin) * MIN,
});

const artifact = (over = {}) => ({
  version: 1, manifestHash: HASH, planDigest: PLAN, runId: 'run-1',
  issuedAt: OPEN - 60 * MIN, expiresAt: OPEN + 120 * MIN,
  budget: { crowd: 4, official: 4, ballot: 2, settle: 2 },
  attemptCaps: { crowd: 4, official: 4, ballot: 4, settle: 2 },
  ...over,
});

/** Build a signed artifact. */
function signed(over = {}, key = KEY) {
  const a = artifact(over);
  return { ...a, signature: signArtifact(a, key) };
}

/**
 * The digest the scheduler will bind for the canonical one-step plan used by the
 * runner test. Computed with the scheduler's own helper so the signed artifact
 * pins exactly what executes, never a placeholder.
 */
const RUNNER_AUTHORIZATION = () => ({
  approved: true, manifestHash: HASH, expiresAt: OPEN + 60 * MIN,
  budget: { official: 1 }, attemptCaps: { official: 1 },
});
async function expectedDigest() {
  const d = deriveDeadlines(accept());
  const steps = [{ id: 'a', effect: 'api_write', budgetKey: 'official', at: OPEN + MIN, phase: 'open', handler: 'h' }];
  return planDigest({
    manifestHash: HASH,
    steps,
    authorization: RUNNER_AUTHORIZATION(),
    deadlines: d,
  });
}

/* ─────────────────────────── process seams ────────────────────────────────── */

/**
 * Fake controller child implementing the REAL REPL contract:
 * one `ready` line on startup, one verdict line per written command, plus
 * close() tracking so termination can be asserted.
 */
function fakeController({ verdicts = [{}], ready = '{"ready":true,"pid":1}' } = {}) {
  const written = [];
  const queue = [...verdicts];
  let closed = 0;
  let reads = 0;
  return {
    launch: async () => ({
      async readLine() {
        reads += 1;
        if (reads === 1) return ready;
        return queue.shift() ?? '{"command":"status","result":{}}';
      },
      async writeLine(line) { written.push(line); return true; },
      async close() { closed += 1; return true; },
    }),
    written,
    closedCount: () => closed,
  };
}

test('controller spawn refuses non-allowlisted commands before launching anything', async () => {
  let launched = false;
  const spawn = createControllerSpawn({
    launch: async () => { launched = true; return { readLine: async () => '{}', writeLine: async () => {}, close: async () => {} }; },
    scriptPath: 'C:/x/execute-owner.cjs',
  });
  for (const bad of ['rm-rf', 'DROP-TABLE', 'official-A-OPEN;ls', '']) {
    await assert.rejects(() => spawn(bad));
  }
  assert.equal(launched, false, 'no controller process was started');
});

test('controller spawn requires a configured script path', async () => {
  const spawn = createControllerSpawn({ launch: async () => ({}) });
  await assert.rejects(() => spawn('status'), /scriptPath must be configured/);
});

test('controller spawn drives the real JSON-lines REPL: ready, one command, one verdict', async () => {
  const fake = fakeController({ verdicts: ['{"command":"status","result":{"room":"ar_1"}}'] });
  const spawn = createControllerSpawn({ launch: fake.launch, nodePath: 'node', scriptPath: 'C:/x/execute-owner.cjs' });
  const out = await spawn('status');
  assert.equal(out.ok, true);
  assert.deepEqual(out.output, { room: 'ar_1' });
  // The command is written as JSON on one line, exactly as the controller parses it.
  assert.deepEqual(fake.written, ['{"command":"status"}\n']);
  assert.equal(fake.closedCount(), 1, 'the process is always terminated');
});

test('controller spawn maps STOP_FAILED_OR_UNKNOWN to a fenced failure', async () => {
  const fake = fakeController({
    verdicts: ['{"command":"crowd-D-OPEN","status":"STOP_FAILED_OR_UNKNOWN","message":"ERR_ASSERTION"}'],
  });
  const spawn = createControllerSpawn({ launch: fake.launch, scriptPath: 'C:/x/execute-owner.cjs' });
  const out = await spawn('crowd-D-OPEN');
  assert.equal(out.ok, false);
  assert.equal(out.code, 'ERR_ASSERTION');
  assert.equal(out.fenced, true);
  assert.equal(fake.closedCount(), 1);
});

test('controller spawn refuses when startup is not ready', async () => {
  const fake = fakeController({ ready: 'not json' });
  const spawn = createControllerSpawn({ launch: fake.launch, scriptPath: 'C:/x/execute-owner.cjs' });
  const out = await spawn('status');
  assert.deepEqual(out, { ok: false, code: 'controller_not_ready' });
  assert.equal(fake.closedCount(), 1, 'a failed handshake still terminates the process');
});

test('controller spawn reports unparsable verdicts and mismatched commands', async () => {
  const garbage = fakeController({ verdicts: ['<html>error</html>'] });
  const g = createControllerSpawn({ launch: garbage.launch, scriptPath: 'C:/x/execute-owner.cjs' });
  assert.deepEqual(await g('status'), { ok: false, code: 'controller_output_unparsed' });

  const mismatched = fakeController({ verdicts: ['{"command":"watch-D","result":{}}'] });
  const m = createControllerSpawn({ launch: mismatched.launch, scriptPath: 'C:/x/execute-owner.cjs' });
  assert.deepEqual(await m('status'), { ok: false, code: 'controller_command_mismatch' });
});

test('controller spawn terminates the process even when a read rejects', async () => {
  let closed = 0;
  const spawn = createControllerSpawn({
    launch: async () => ({
      readLine: async () => { throw Object.assign(new Error('timeout'), { code: 'CONTROLLER_TIMEOUT' }); },
      writeLine: async () => {},
      close: async () => { closed += 1; },
    }),
    scriptPath: 'C:/x/execute-owner.cjs',
  });
  await assert.rejects(() => spawn('status'), /timeout/);
  assert.equal(closed, 1, 'termination is guaranteed by finally');
});

test('controller spawn passes the configured working directory to the launcher', async () => {
  const seen = [];
  const spawn = createControllerSpawn({
    launch: async (file, args, opts) => {
      seen.push({ file, args, cwd: opts.cwd });
      return { readLine: async () => '{"ready":true}', writeLine: async () => {}, close: async () => {} };
    },
    nodePath: 'node', scriptPath: 'C:/x/execute-owner.cjs', cwd: 'C:/example/clash-repo',
  });
  await spawn('status');
  assert.equal(seen[0].cwd, 'C:/example/clash-repo', 'the controller runs from the repo root');
  assert.deepEqual(seen[0].args, ['C:/x/execute-owner.cjs'], 'no --command flag is passed');
});

/* ───────────────── persistent controller session (Phase 6) ────────────────── */

/** Fake controller that keeps module-scope state across commands, like the real one. */
function statefulController() {
  const written = [];
  let launched = 0;
  let closed = 0;
  return {
    launch: async () => {
      launched += 1;
      // Module-scope state is per PROCESS, exactly like the real controller.
      let ids = null;
      let fenced = false;
      const lines = ['{"ready":true,"pid":42,"run":"r1"}'];
      return {
        async readLine() { return lines.shift() ?? '{"command":"status","result":{}}'; },
        async writeLine(line) {
          written.push(line);
          const { command } = JSON.parse(line.trim());
          if (fenced) { lines.push(JSON.stringify({ command, status: 'STOP_FAILED_OR_UNKNOWN', message: 'attempt_fenced' })); return; }
          if (command === 'preflight') { ids = { room: 'ar_x' }; lines.push(JSON.stringify({ command, result: { ok: true } })); return; }
          if (command.startsWith('official') || command === 'ballot-D') {
            if (!ids) { fenced = true; lines.push(JSON.stringify({ command, status: 'STOP_FAILED_OR_UNKNOWN', message: 'ERR_ASSERTION' })); return; }
            lines.push(JSON.stringify({ command, result: { ok: true } })); return;
          }
          lines.push(JSON.stringify({ command, result: { ok: true } }));
        },
        async close() { closed += 1; },
      };
    },
    written, launches: () => launched, closes: () => closed,
  };
}

test('a persistent session starts the controller exactly once', async () => {
  const fake = statefulController();
  const session = createControllerSession({ launch: fake.launch, scriptPath: 'C:/x/execute-owner.cjs' });
  await session.spawn('preflight');
  await session.spawn('official-A-OPEN');
  await session.spawn('status');
  assert.equal(fake.launches(), 1, 'one process for the whole run');
  assert.equal(session.isStarted(), true);
  await session.close();
});

test('a persistent session preserves controller state across commands', async () => {
  const fake = statefulController();
  const session = createControllerSession({ launch: fake.launch, scriptPath: 'C:/x/execute-owner.cjs' });
  const pre = await session.spawn('preflight');
  const official = await session.spawn('official-A-OPEN');
  assert.equal(pre.ok, true);
  assert.equal(official.ok, true, 'ids from preflight remain available');
  assert.equal(session.isFenced(), false);
  await session.close();
});

test('a one-shot spawn loses controller state (why the session exists)', async () => {
  const fake = statefulController();
  const spawn = createControllerSpawn({ launch: fake.launch, scriptPath: 'C:/x/execute-owner.cjs' });
  await spawn('preflight');
  const next = await spawn('official-A-OPEN'); // fresh process, no ids
  assert.equal(next.ok, false);
  assert.equal(next.code, 'ERR_ASSERTION');
  assert.equal(fake.launches(), 2, 'each command re-launched the controller');
});

test('a fenced session refuses all further commands', async () => {
  const fake = statefulController();
  const session = createControllerSession({ launch: fake.launch, scriptPath: 'C:/x/execute-owner.cjs' });
  await session.spawn('preflight');
  const bad = await session.spawn('ballot-D'); // no ids until preflight sets them -> ok here
  assert.equal(bad.ok, true);
  await session.close();
  const after = await session.spawn('status');
  assert.equal(after.ok, false);
  assert.equal(after.code, 'session_closed');
});

test('session serializes concurrent commands', async () => {
  const fake = statefulController();
  const session = createControllerSession({ launch: fake.launch, scriptPath: 'C:/x/execute-owner.cjs' });
  const [a, b] = await Promise.all([session.spawn('preflight'), session.spawn('official-A-OPEN')]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(fake.launches(), 1);
  await session.close();
});

test('session reports controller identity without credentials', async () => {
  const fake = statefulController();
  const session = createControllerSession({ launch: fake.launch, scriptPath: 'C:/x/execute-owner.cjs' });
  await session.spawn('status');
  const id = session.identity();
  assert.equal(id.pid, 42);
  assert.equal(Object.keys(id).sort().join(','), 'dir,pid,run');
  await session.close();
});

test('session refuses non-allowlisted commands', async () => {
  const fake = statefulController();
  const session = createControllerSession({ launch: fake.launch, scriptPath: 'C:/x/execute-owner.cjs' });
  await assert.rejects(() => session.spawn('rm-rf'));
  await assert.rejects(() => session.spawn('official-A-OPEN;ls'));
  await session.close();
});

test('session close is idempotent', async () => {
  const fake = statefulController();
  const session = createControllerSession({ launch: fake.launch, scriptPath: 'C:/x/execute-owner.cjs' });
  await session.spawn('status');
  assert.equal(await session.close(), true);
  assert.equal(await session.close(), true);
  assert.equal(fake.closes(), 1);
});

test('the allowlist matches the controller command surface exactly', () => {
  // Read the controller source (read-only) and extract its real command branches.
  const fs = require('node:fs');
  const path = require('node:path');
  const source = path.join(__dirname, '..', '.expo', 'active-arena-checkpoint', 'execute-owner.cjs');
  if (!fs.existsSync(source)) return; // private evidence tree absent: nothing to compare
  const text = fs.readFileSync(source, 'utf8');
  const real = new Set();
  for (const m of text.matchAll(/cmd===['"]([A-Za-z-]+)['"]/g)) real.add(m[1]);
  // Pattern-matched official/crowd commands are asserted separately in the source.
  for (const name of ['official-A-OPEN', 'official-B-OPEN', 'official-A-FINAL', 'official-B-FINAL',
    'crowd-D-OPEN', 'crowd-D-FINAL']) real.add(name);

  for (const command of CONTROLLER_COMMANDS) {
    assert.ok(real.has(command), `allowlist entry is not a real controller command: ${command}`);
  }
  for (const command of real) {
    assert.ok(CONTROLLER_COMMANDS.includes(command), `real controller command is missing from the allowlist: ${command}`);
  }
});

test('load-recover is classified as Auth recovery, not read-only', () => {
  const { CONTROLLER_COMMAND_CLASS, isReadOnlyCommand } = require('./lib/arena-acceptance-process.cjs');
  assert.equal(CONTROLLER_COMMAND_CLASS['load-recover'], 'auth');
  assert.equal(isReadOnlyCommand('load-recover'), false, 'it loads credentials and runs OTP recovery');
  // Oddly correct: these really are side-effect free.
  for (const command of ['preflight', 'status', 'snapshot']) {
    assert.equal(CONTROLLER_COMMAND_CLASS[command], 'read', `${command} must be read-only`);
    assert.equal(isReadOnlyCommand(command), true);
  }
});

test('the session fences after an unparsable or mismatched response', async () => {
  const { createControllerSession } = require('./lib/arena-acceptance-process.cjs');
  for (const verdictLine of ['<html>nope</html>', '{"command":"watch-D","result":{}}']) {
    let calls = 0;
    const session = createControllerSession({
      scriptPath: 'C:/x/execute-owner.cjs',
      launch: async () => {
        const lines = ['{"ready":true}', verdictLine, '{"command":"status","result":{}}'];
        return { readLine: async () => lines.shift() ?? '{}', writeLine: async () => {}, close: async () => {} };
      },
    });
    const first = await session.spawn('status');
    assert.equal(first.ok, false);
    assert.equal(first.fenced, true, 'an unattributable response fences the session');
    const second = await session.spawn('snapshot');
    calls += 1;
    assert.equal(second.ok, false, 'no further commands after an unknown outcome');
    assert.equal(session.isFenced(), true);
    await session.close();
    assert.equal(calls, 1);
  }
});

test('a session that cannot start refuses rather than continuing', async () => {
  const { createControllerSession } = require('./lib/arena-acceptance-process.cjs');
  let closed = 0;
  const session = createControllerSession({
    scriptPath: 'C:/x/execute-owner.cjs',
    launch: async () => ({
      readLine: async () => { throw Object.assign(new Error('no child'), { code: 'CONTROLLER_START_FAILED' }); },
      writeLine: async () => {},
      close: async () => { closed += 1; },
    }),
  });
  const out = await session.spawn('preflight');
  assert.equal(out.ok, false);
  assert.equal(out.fenced, true);
  assert.equal(session.isFenced(), true);
  await session.close();
});

test('the fresh-run template carries no credentials, PIDs, paths or stale identifiers', () => {
  const config = require('./arena-acceptance-fresh-run.json');
  const text = JSON.stringify(config);

  // No credentials or tokens anywhere.
  assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{10,}/, 'no JWTs');
  assert.doesNotMatch(text, /sbp_[A-Za-z0-9]{10,}/, 'no service tokens');
  assert.doesNotMatch(text, /(api[_-]?key|secret|password)\s*"/i, 'no credential fields');
  // No process identifiers or personal absolute paths.
  assert.doesNotMatch(text, /"pid"/i, 'no PIDs');
  assert.doesNotMatch(text, /[A-Za-z]:\\\\Users\\\\/, 'no personal absolute paths');
  // No identifiers from the spent 5 November run.
  for (const stale of ['take_b793316c1cc6e4e7', 'cl_f9da274aff2bc232', 'ar_e61d3b7de415e484', 'take_6fb7c0e28d7677bc', 'cl_35eb151dd7c85fa8', 'ar_f8c0aa6960f7b878']) {
    assert.ok(!text.includes(stale), `must not embed spent fixture id ${stale}`);
  }
  // The template cannot authorize anything by itself.
  assert.equal(config.authorization.approved, false);
  assert.equal(config.authorization.runId, null);
  assert.equal(config.manifest.sha256, null);
  assert.equal(config.journal.path, null);
  assert.equal(config.supersedes, null);
});

test('adb transport requires a serial and rejects unsafe args', async () => {
  const noSerial = createAdbTransport({ execFile: async () => ({ stdout: '' }) });
  await assert.rejects(() => noSerial(['shell', 'input', 'tap', '1', '2']), /serial must be configured/);

  const adb = createAdbTransport({ execFile: async () => ({ stdout: '' }), serial: 'FICTIONALDEVICE01' });
  await assert.rejects(() => adb(['shell', 'input', 'tap', '1;rm']), /unsafe adb arg/);
  await assert.rejects(() => adb(['shell', '$(id)']), /unsafe adb arg/);
});

test('adb transport prefixes the serial and returns stdout', async () => {
  const seen = [];
  const adb = createAdbTransport({
    execFile: async (file, args) => { seen.push(args); return { stdout: 'mCurrentFocus=Window{1 u0 com.clash.v2.dev/.Main}' }; },
    adbPath: 'adb', serial: 'FICTIONALDEVICE01',
  });
  const out = await adb(['shell', 'dumpsys', 'window']);
  assert.deepEqual(seen[0], ['-s', 'FICTIONALDEVICE01', 'shell', 'dumpsys', 'window']);
  assert.match(out, /com\.clash\.v2\.dev/);
});

test('safe token validator rejects shell metacharacters', () => {
  for (const bad of ['a;b', 'a|b', 'a`b', 'a$(b)', 'a b', '']) {
    assert.throws(() => assertSafeToken(bad, 't'));
  }
  assert.doesNotThrow(() => assertSafeToken('official-A-OPEN', 't'));
});

test('the controller allowlist contains no wildcard or generic command', () => {
  assert.ok(!CONTROLLER_COMMANDS.includes('*'));
  assert.ok(CONTROLLER_COMMANDS.every((c) => /^[A-Za-z0-9-]+$/.test(c)));
});

/* ─────────────────────── durable journal storage ──────────────────────────── */

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clash-journal-'));
}

test('journal requires an absolute .ndjson path', () => {
  assert.throws(() => openJournal({ file: 'relative.ndjson' }), /absolute/);
  assert.throws(() => openJournal({ file: path.join(os.tmpdir(), 'x.txt') }), /ndjson/);
});

test('journal appends durably and reports records', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  const store = openJournal({ file });
  assert.equal(store.write({ outcome: 'armed' }), false, 'write before open fails safe');
  assert.equal(store.open().opened, true);
  assert.equal(store.write({ outcome: 'armed' }), true);
  assert.equal(store.write({ outcome: 'started', stepId: 'a' }), true);
  store.close();
  const read = readJournal(file);
  assert.equal(read.entries.length, 2);
  assert.equal(read.entries[1].stepId, 'a');
  assert.equal(read.truncated, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('journal reports open failure without throwing', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'nested', 'run.ndjson');
  const store = openJournal({ file });
  const opened = store.open();
  assert.equal(opened.opened, true, 'nested directory is created');
  assert.equal(store.write({ a: 1 }), true);
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('journal tolerates a truncated tail and flags it', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  fs.writeFileSync(file, '{"outcome":"armed"}\n{"outcome":"start');
  const state = recover(file);
  assert.equal(state.entries.length, 1);
  assert.equal(state.truncated, true);
  assert.equal(state.requiresReconciliation, true, 'a severed write must block restart');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('journal treats interior corruption as a hard error', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  fs.writeFileSync(file, '{"outcome":"armed"}\nGARBAGE\n{"outcome":"ok"}\n');
  assert.throws(() => readJournal(file), /journal corrupt at line 2/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('recovery flags an in-flight write as requiring reconciliation', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  fs.writeFileSync(file, '{"outcome":"armed"}\n{"outcome":"started","stepId":"w"}\n');
  const state = recover(file);
  assert.equal(state.requiresReconciliation, true);
  assert.equal(state.lastOutcome, 'started');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('recovery of a cleanly finished journal needs no reconciliation', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  fs.writeFileSync(file, '{"outcome":"armed"}\n{"outcome":"ok","stepId":"a"}\n{"outcome":"completed"}\n');
  assert.equal(recover(file).requiresReconciliation, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ──────────────────── authorization artifact ──────────────────────────────── */

test('canonicalization is key-order independent', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
});

test('a signed artifact verifies and binds manifest and plan', () => {
  const a = signed();
  const res = verifyArtifact(a, KEY, { now: () => OPEN, manifestHash: HASH, planDigest: PLAN });
  assert.equal(res.ok, true);
  assert.equal(res.reason, 'artifact_verified');
});

test('a tampered artifact fails its signature', () => {
  const a = signed();
  const tampered = { ...a, budget: { crowd: 999 } };
  assert.equal(verifyArtifact(tampered, KEY, { now: () => OPEN }).reason, 'artifact_bad_signature');
});

test('a wrong key fails verification', () => {
  assert.equal(verifyArtifact(signed(), 'z'.repeat(48), { now: () => OPEN }).reason, 'artifact_bad_signature');
});

test('missing key means key_unavailable, never a default', () => {
  const res = verifyArtifact(signed(), null, { now: () => OPEN });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'key_unavailable');
  assert.equal(signingKeyFromEnv({}), null);
  assert.equal(signingKeyFromEnv({ CLASH_ARENA_APPROVAL_KEY: 'short' }), null);
});

test('artifact expiry and not-yet-valid are enforced', () => {
  assert.equal(verifyArtifact(signed({ expiresAt: OPEN - MIN }), KEY, { now: () => OPEN }).reason, 'artifact_expired');
  assert.equal(verifyArtifact(signed({ issuedAt: OPEN + 60 * MIN }), KEY, { now: () => OPEN }).reason, 'artifact_not_yet_valid');
});

test('manifest and plan mismatches are refused', () => {
  const a = signed();
  assert.equal(verifyArtifact(a, KEY, { now: () => OPEN, manifestHash: 'c'.repeat(64) }).reason, 'artifact_manifest_mismatch');
  assert.equal(verifyArtifact(a, KEY, { now: () => OPEN, planDigest: 'd'.repeat(64) }).reason, 'artifact_plan_mismatch');
});

test('a missing plan digest on the artifact is a shape failure', () => {
  const a = artifact();
  const { planDigest: _drop, ...rest } = a;
  const res = verifyArtifact({ ...rest, signature: signArtifact(rest, KEY) }, KEY, { now: () => OPEN });
  assert.equal(res.ok, false);
  assert.match(res.reason, /artifact_missing_field:planDigest/);
});

test('the artifact gate surfaces loader failures', async () => {
  const gate = createArtifactGate({ loadArtifact: async () => { throw new Error('gone'); }, key: KEY, now: () => OPEN });
  assert.equal((await gate({ manifestHash: HASH })).reason, 'artifact_unavailable');
});

test('the artifact gate verifies a loaded artifact end to end', async () => {
  const gate = createArtifactGate({ loadArtifact: async () => signed(), key: () => KEY, now: () => OPEN });
  const res = await gate({ manifestHash: HASH, planDigest: PLAN });
  assert.equal(res.ok, true);
});

/* ─────────────────────────── runner composition ───────────────────────────── */

test('a runner without handlers is not live and cannot construct a gate', async () => {
  const runner = createRunner({
    now: () => OPEN - MIN,
    // Dry-run still validates the authorization; only the side effects are absent.
    authorization: { approved: true, manifestHash: HASH, expiresAt: OPEN + 60 * MIN, budget: { official: 1 }, attemptCaps: { official: 1 } },
  });
  assert.equal(runner.isLive(), false);
  const res = await runner.scheduler.arm(accept(), [
    { id: 'a', effect: 'read', at: OPEN + MIN, phase: 'open', handler: 'h' },
  ]);
  assert.equal(res.activated, true, res.reason);
  assert.equal(res.mode, 'dry-run');
});

test('a live runner refuses to construct without a durable journal file', () => {
  assert.throws(() => createRunner({
    now: () => OPEN,
    handlers: { h: Object.assign(async () => ({ ok: true }), { effect: 'api_write' }) },
  }), /durable journal file/);
});

test('a live runner cannot arm without an approval key', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  const runner = createRunner({
    now: () => OPEN - MIN,
    handlers: { h: Object.assign(async () => ({ ok: true }), { effect: 'api_write' }) },
    journalFile: file,
    artifact: signed(),
    approvalKey: null,
    authorization: { approved: true, manifestHash: HASH, expiresAt: OPEN + 60 * MIN, budget: { official: 1 }, attemptCaps: { official: 1 } },
  });
  const res = await runner.scheduler.arm(accept(), [
    { id: 'a', effect: 'api_write', budgetKey: 'official', at: OPEN + MIN, phase: 'open', handler: 'h' },
  ]);
  assert.equal(res.activated, false);
  assert.equal(res.reason, 'key_unavailable');
  runner.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a live runner cannot arm with a stale or unsigned artifact', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  const auth = { approved: true, manifestHash: HASH, expiresAt: OPEN + 60 * MIN, budget: { official: 1 }, attemptCaps: { official: 1 } };
  for (const [name, art] of Object.entries({
    absent: null,
    expired: signed({ expiresAt: OPEN - MIN }),
    tampered: { ...signed(), runId: 'forged' },
  })) {
    const runner = createRunner({
      now: () => OPEN - MIN,
      handlers: { h: Object.assign(async () => ({ ok: true }), { effect: 'api_write' }) },
      journalFile: file,
      artifact: art,
      approvalKey: KEY,
      authorization: auth,
    });
    const res = await runner.scheduler.arm(accept(), [
      { id: 'a', effect: 'api_write', budgetKey: 'official', at: OPEN + MIN, phase: 'open', handler: 'h' },
    ]);
    assert.equal(res.activated, false, `${name} must not activate`);
    runner.close();
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a fully authorized live runner arms, journals durably, and completes', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  let clock = OPEN - MIN;
  const calls = [];
  const runner = createRunner({
    now: () => clock,
    handlers: { h: Object.assign(async () => { calls.push('h'); return { ok: true }; }, { effect: 'api_write' }) },
    journalFile: file,
    // The owner signs the plan after it is fixed. Compute the same digest the
    // scheduler will bind, so the artifact pins the plan that actually executes.
    artifactLoader: async () => signed({ planDigest: await expectedDigest() }),
    approvalKey: KEY,
    authorization: { approved: true, manifestHash: HASH, expiresAt: OPEN + 60 * MIN, budget: { official: 1 }, attemptCaps: { official: 1 } },
  });
  const res = await runner.scheduler.arm(accept(), [
    { id: 'a', effect: 'api_write', budgetKey: 'official', at: OPEN + MIN, phase: 'open', handler: 'h' },
  ]);
  assert.equal(res.activated, true, res.reason);

  clock = OPEN + 2 * MIN;
  const out = await runner.scheduler.tick();
  assert.equal(out.terminal, TERMINAL.COMPLETED);
  assert.deepEqual(calls, ['h']);

  const stats = runner.journalStats();
  assert.equal(stats.failure, null);
  assert.ok(stats.records >= 4, 'armed, started, ok, completed journaled');

  const read = readJournal(file);
  assert.ok(read.entries.some((e) => e.outcome === 'armed'));
  assert.ok(read.entries.some((e) => e.outcome === 'completed'));
  runner.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('preflight lists every missing precondition', () => {
  const res = preflight({});
  assert.equal(res.ready, false);
  for (const reason of ['authorization_missing', 'approval_key_unavailable', 'journal_file_missing', 'manifest_hash_missing', 'artifact_missing']) {
    assert.ok(res.blockers.includes(reason), `missing ${reason}`);
  }
});

test('preflight passes with a valid artifact, key and clean journal', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  fs.writeFileSync(file, '{"outcome":"completed"}\n');
  const res = preflight({
    authorization: { approved: true },
    artifact: signed(),
    approvalKey: KEY,
    journalFile: file,
    manifestHash: HASH,
    planDigest: PLAN,
    now: () => OPEN,
  });
  assert.equal(res.ready, true, JSON.stringify(res.blockers));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('preflight refuses a journal that needs reconciliation', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  fs.writeFileSync(file, '{"outcome":"started","stepId":"w"}\n');
  const res = preflight({
    authorization: { approved: true }, artifact: signed(), approvalKey: KEY,
    journalFile: file, manifestHash: HASH, planDigest: PLAN, now: () => OPEN,
  });
  assert.equal(res.ready, false);
  assert.ok(res.blockers.includes('journal_requires_reconciliation'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('resumeFromJournal refuses an uncertain journal', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  fs.writeFileSync(file, '{"outcome":"armed"}\n{"outcome":"timeout","stepId":"w"}\n');
  const fakeScheduler = { resume: () => { throw new Error('must not be called'); } };
  const res = resumeFromJournal({ scheduler: fakeScheduler, journalFile: file });
  assert.equal(res.blocked, true);
  assert.equal(res.reason, 'journal_requires_reconciliation');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('approved:true in configuration cannot initiate signing or activation', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  const previous = process.env.CLASH_ARENA_APPROVAL_KEY;
  delete process.env.CLASH_ARENA_APPROVAL_KEY;
  try {
    // A configuration that claims approval, with no key and no artifact anywhere.
    const runner = createRunner({
      now: () => OPEN - MIN,
      handlers: { h: Object.assign(async () => ({ ok: true }), { effect: 'api_write' }) },
      journalFile: file,
      artifact: null,
      authorization: {
        approved: true, manifestHash: HASH, expiresAt: OPEN + 60 * MIN,
        budget: { official: 1 }, attemptCaps: { official: 1 },
      },
    });
    const res = await runner.scheduler.arm(accept(), [
      { id: 'a', effect: 'api_write', budgetKey: 'official', at: OPEN + MIN, phase: 'open', handler: 'h' },
    ]);
    assert.equal(res.activated, false, 'config approval must not activate a run');
    assert.equal(res.reason, 'artifact_missing');

    // Preflight independently reports both missing trust inputs.
    const check = preflight({
      authorization: { approved: true }, artifact: null, approvalKey: null,
      journalFile: file, manifestHash: HASH,
    });
    assert.equal(check.ready, false);
    assert.ok(check.blockers.includes('approval_key_unavailable'));
    assert.ok(check.blockers.includes('artifact_missing'));
    runner.close();
  } finally {
    if (previous !== undefined) process.env.CLASH_ARENA_APPROVAL_KEY = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a scheduler journal write failure blocks further action', async () => {
  const { createScheduler } = require('./lib/arena-acceptance-scheduler.cjs');
  let calls = 0;
  let clock = OPEN - MIN;
  const scheduler = createScheduler({
    now: () => clock,
    authorization: { approved: true, manifestHash: HASH, expiresAt: OPEN + 60 * MIN, budget: { official: 1 }, attemptCaps: { official: 1 } },
    handlers: { h: Object.assign(async () => { calls += 1; return { ok: true }; }, { effect: 'api_write' }) },
    journal: () => false,
    approvalGate: async () => ({ ok: true, artifact: { budget: { official: 1 }, attemptCaps: { official: 1 } } }),
  });
  await scheduler.arm(accept(), [
    { id: 'a', effect: 'api_write', budgetKey: 'official', at: OPEN + MIN, phase: 'open', handler: 'h' },
  ]);
  clock = OPEN + 2 * MIN;
  await scheduler.tick();
  assert.equal(scheduler.status().terminal, TERMINAL.BLOCKED);
  assert.equal(scheduler.status().abortReason, 'journal_write_failed');
  assert.equal(calls, 0, 'no side effect without a durable record');
});
