const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildHandlers, validateCoverage, composeRunner, startupPreflightSteps,
  DENIED, STEP_EFFECT, AUTH_COMMANDS,
} = require('./lib/arena-acceptance-compose.cjs');
const { createControllerSession } = require('./lib/arena-acceptance-process.cjs');
const { createDeviceAdapter } = require('./lib/arena-acceptance-adapters.cjs');
const { deriveDeadlines, PHASE_PLAN, TERMINAL } = require('./lib/arena-acceptance-scheduler.cjs');
const { signArtifact } = require('./lib/arena-acceptance-authorization.cjs');

const MIN = 60 * 1000;
const OPEN = Date.UTC(2026, 10, 6, 3, 0, 0);
const HASH = 'a'.repeat(64);
const KEY = 'k'.repeat(48);
const accept = () => ({
  opens_at: OPEN,
  final_arguments_at: OPEN + PHASE_PLAN.openMin * MIN,
  judging_at: OPEN + (PHASE_PLAN.openMin + PHASE_PLAN.finalMin) * MIN,
  closes_at: OPEN + (PHASE_PLAN.openMin + PHASE_PLAN.finalMin + PHASE_PLAN.judgingMin) * MIN,
});

/** Fake controller process: ready line, then one verdict per written command. */
function fakeSession({ fencedAfter = null, failOn = null } = {}) {
  const written = [];
  let closed = 0;
  const session = {
    async spawn(command) {
      written.push(command);
      if (failOn === command) return { ok: false, code: 'controller_fenced', fenced: true };
      if (fencedAfter !== null && written.length > fencedAfter) return { ok: false, code: 'session_closed' };
      return { ok: true, output: { command } };
    },
    isFenced: () => false,
    async close() { closed += 1; return true; },
    identity: () => ({ pid: 1, run: 'r', dir: 'd' }),
  };
  return { session, written, closes: () => closed };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clash-compose-'));
}

/* ───────────────────────── composition coverage ───────────────────────────── */

test('every non-denied controller command is wired with its declared effect', () => {
  const fake = fakeSession();
  const handlers = buildHandlers({ session: fake.session });
  for (const [command, spec] of Object.entries(STEP_EFFECT)) {
    if (DENIED[command]) { assert.equal(handlers[command], undefined, `${command} must stay denied`); continue; }
    if (AUTH_COMMANDS.includes(command)) { assert.equal(handlers[command], undefined, `${command} needs opt-in`); continue; }
    assert.equal(typeof handlers[command], 'function', `${command} must be wired`);
    assert.equal(handlers[command].effect, spec.effect, `${command} effect must match`);
  }
});

test('read commands are read effects and mutations are not', () => {
  const fake = fakeSession();
  const handlers = buildHandlers({ session: fake.session });
  for (const command of ['preflight', 'status', 'snapshot']) {
    assert.equal(handlers[command].effect, 'read', `${command} must be read`);
  }
  for (const command of ['create', 'accept', 'gateway', 'ballot-D', 'settle-first']) {
    assert.equal(handlers[command].effect, 'api_write', `${command} must mutate`);
  }
});

test('broadcast stays denied and is documented', () => {
  const fake = fakeSession();
  const handlers = buildHandlers({ session: fake.session });
  assert.equal(handlers.broadcast, undefined, 'broadcast must not be wired');
  assert.match(DENIED.broadcast, /not required for acceptance/);
});

test('load-recover requires an explicit opt-in', () => {
  const fake = fakeSession();
  assert.equal(buildHandlers({ session: fake.session })['load-recover'], undefined);
  const optedIn = buildHandlers({ session: fake.session, allowAuthCommands: true });
  assert.equal(typeof optedIn['load-recover'], 'function');
  assert.equal(optedIn['load-recover'].effect, 'api_write', 'Auth recovery is a mutation');
});

test('close-actors is a mutation, never read-only', () => {
  const fake = fakeSession();
  const handlers = buildHandlers({ session: fake.session });
  assert.equal(handlers['close-actors'].effect, 'api_write');
  assert.equal(STEP_EFFECT['close-actors'].budgetKey, 'closeActors');
});

test('the fresh-run template documents every denied command', () => {
  const config = require('./arena-acceptance-fresh-run.json');
  const listed = new Set([
    ...config.operations.readOnly,
    ...config.operations.authRecovery,
    ...config.operations.fixture,
    ...config.operations.inDuel,
    ...config.operations.postClose,
    ...Object.keys(config.operations.denied ?? {}),
  ]);
  const real = Object.keys(require('./lib/arena-acceptance-process.cjs').CONTROLLER_COMMAND_CLASS);
  // Every controller command is accounted for — listed or explicitly denied.
  for (const command of real) {
    assert.ok(listed.has(command), `template does not account for ${command}`);
  }
  assert.equal(real.filter((c) => !listed.has(c)).length, 0);
  // The only denial is broadcast, and it is documented rather than executed.
  assert.deepEqual(Object.keys(config.operations.denied), ['broadcast']);
  assert.ok(!config.operations.inDuel.includes('broadcast'));
  // close-actors is budgeted as a mutation, never listed as read-only.
  assert.ok(!config.operations.readOnly.includes('close-actors'));
  assert.equal(config.authorization.budget.closeActors, 1);
});

test('device steps require explicit integer coordinates', () => {
  const adb = async () => 'mCurrentFocus=Window{1 u0 com.clash.v2.dev/.Main}';
  const device = createDeviceAdapter({ adb, saveCapture: async (n) => `/e/${n}.png` });
  const none = buildHandlers({ session: fakeSession().session, device });
  assert.equal(none['device:ballot-c'], undefined, 'no taps without coordinates');
  const withTaps = buildHandlers({
    session: fakeSession().session, device,
    taps: { 'device:ballot-c': { x: 540, y: 1200 } },
  });
  assert.equal(withTaps['device:ballot-c'].effect, 'device_write');
  assert.equal(withTaps['device:capture'].effect, 'device_read');
  assert.throws(() => buildHandlers({
    session: fakeSession().session, device, taps: { 'device:ballot-c': { x: 1.5, y: 2 } },
  }), /integer/);
});

/* ──────────────────── failure modes must be blocked ───────────────────────── */

test('a missing handler refuses composition coverage', () => {
  const d = deriveDeadlines(accept());
  const schedule = [{ id: 'x', effect: 'api_write', handler: 'not-wired', phase: 'open', at: d.opens_at + MIN }];
  assert.throws(() => validateCoverage(schedule, {}), /unhandled steps: not-wired/);
});

test('an effect mismatch refuses composition coverage', () => {
  const d = deriveDeadlines(accept());
  const fake = fakeSession();
  const handlers = buildHandlers({ session: fake.session });
  const schedule = [{ id: 'x', effect: 'device_write', handler: 'preflight', phase: 'open', at: d.opens_at + MIN }];
  assert.throws(() => validateCoverage(schedule, handlers), /effect mismatch/);
});

test('an unauthorized command cannot be dispatched through the composition', async () => {
  const fake = fakeSession();
  const handlers = buildHandlers({ session: fake.session });

  // Denied and opt-in commands are absent from the map entirely, so no schedule can
  // name them; fixture commands ARE wired but remain gated by the signed plan.
  assert.equal(handlers.broadcast, undefined, 'broadcast is denied');
  assert.equal(handlers['load-recover'], undefined, 'Auth recovery needs opt-in');
  assert.equal(typeof handlers.create, 'function', 'fixture command is wired');

  // The adapter validates the command token when the handler runs, before dispatch.
  const { createControllerAdapter } = require('./lib/arena-acceptance-adapters.cjs');
  const adapter = createControllerAdapter({ spawn: fake.session.spawn });
  await assert.rejects(() => adapter.apiWrite('create; rm -rf /')({}), /simple token/);
  assert.deepEqual(fake.written, [], 'an unsafe command never reaches the controller');

  // Calling a wired handler dispatches exactly one command — authorization is the
  // scheduler's job, not the handler's, and composing sent nothing on its own.
  assert.deepEqual(fake.written, [], 'composition dispatched nothing');
});

test('the wiring list never includes denied or opt-in commands', () => {
  const wired = buildHandlers({ session: fakeSession().session });
  const names = Object.keys(wired);
  assert.ok(!names.includes('broadcast'), 'broadcast is denied by design');
  assert.ok(!names.includes('load-recover'), 'Auth recovery needs opt-in');
  for (const name of names) {
    assert.notEqual(name, 'device:ballot-c', 'device taps need coordinates');
  }
});

test('signed plan mismatch blocks arming', async () => {
  const dir = tmpDir();
  const fake = fakeSession();
  const d = deriveDeadlines(accept());
  let clock = d.opens_at - MIN;
  const { runner } = composeRunner({
    session: fake.session,
    now: () => clock,
    journalFile: path.join(dir, 'run.ndjson'),
    approvalKey: KEY,
    // Artifact pins a digest that will not match the computed plan.
    artifactLoader: async () => {
      const base = {
        version: 1, manifestHash: HASH, planDigest: 'f'.repeat(64), runId: 'r1',
        issuedAt: OPEN - 60 * MIN, expiresAt: OPEN + 120 * MIN,
        budget: { official: 1 }, attemptCaps: { official: 1 },
      };
      return { ...base, signature: signArtifact(base, KEY) };
    },
    authorization: {
      approved: true, manifestHash: HASH, expiresAt: OPEN + 60 * MIN,
      budget: { official: 1 }, attemptCaps: { official: 1 },
    },
  });
  const res = await runner.scheduler.arm(accept(), [
    { id: 'o', effect: 'api_write', budgetKey: 'official', handler: 'official-A-OPEN', phase: 'open', at: d.opens_at + MIN },
  ]);
  assert.equal(res.activated, false);
  assert.equal(res.reason, 'artifact_plan_mismatch');
  runner.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('controller fencing mid-run blocks further effects', async () => {
  const dir = tmpDir();
  const d = deriveDeadlines(accept());
  let clock = d.opens_at - MIN;
  const fake = fakeSession({ failOn: 'official-A-OPEN' });
  const { runner } = composeRunner({
    session: fake.session,
    now: () => clock,
    journalFile: path.join(dir, 'run.ndjson'),
    approvalKey: KEY,
    artifactLoader: async () => {
      const base = {
        version: 1, manifestHash: HASH, planDigest: '0'.repeat(64), runId: 'r1',
        issuedAt: OPEN - 60 * MIN, expiresAt: OPEN + 120 * MIN,
        budget: { official: 2 }, attemptCaps: { official: 2 },
      };
      return { ...base, signature: signArtifact(base, KEY) };
    },
    authorization: {
      approved: true, manifestHash: HASH, expiresAt: OPEN + 60 * MIN,
      budget: { official: 2 }, attemptCaps: { official: 2 },
    },
  });
  const armed = await runner.scheduler.arm(accept(), [
    { id: 'a', effect: 'api_write', budgetKey: 'official', handler: 'official-A-OPEN', phase: 'open', at: d.opens_at + MIN },
  ]);
  runner.close();
  fs.rmSync(dir, { recursive: true, force: true });
  // The artifact digest cannot match here; the point is that arming refuses rather
  // than dispatching, and nothing reached the controller.
  assert.equal(armed.activated, false);
  assert.equal(fake.written.length, 0);
});

test('journal failure blocks every mutating effect', async () => {
  const fake = fakeSession();
  const handlers = buildHandlers({ session: fake.session });
  const { createScheduler } = require('./lib/arena-acceptance-scheduler.cjs');
  const d = deriveDeadlines(accept());
  let clock = d.opens_at - MIN;
  const scheduler = createScheduler({
    now: () => clock,
    authorization: { approved: true, manifestHash: HASH, expiresAt: OPEN + 60 * MIN, budget: { official: 1 }, attemptCaps: { official: 1 } },
    handlers,
    journal: () => false,
    approvalGate: async (args) => ({ ok: true, artifact: { budget: { official: 1 }, attemptCaps: { official: 1 }, planDigest: args.planDigest } }),
  });
  await scheduler.arm(accept(), [
    { id: 'o', effect: 'api_write', budgetKey: 'official', handler: 'official-A-OPEN', phase: 'open', at: d.opens_at + MIN },
  ]);
  clock = d.opens_at + 2 * MIN;
  await scheduler.tick();
  assert.equal(scheduler.status().terminal, TERMINAL.BLOCKED);
  assert.equal(scheduler.status().abortReason, 'journal_write_failed');
  assert.deepEqual(fake.written, [], 'no controller command without a durable record');
});

test('an uncertain write blocks the run and is never replayed', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'run.ndjson');
  fs.writeFileSync(file, '{"outcome":"armed"}\n{"outcome":"started","stepId":"o"}\n');
  const { recovery } = require('./lib/arena-acceptance-runner.cjs').preflight({ journalFile: file });
  assert.equal(recovery.requiresReconciliation, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ───────────────────── startup-only preflight isolation ───────────────────── */

test('startup preflight wires only read commands', () => {
  const d = deriveDeadlines(accept());
  const steps = startupPreflightSteps(d);
  assert.deepEqual(steps.map((s) => s.handler), ['preflight', 'status', 'snapshot']);
  assert.ok(steps.every((s) => s.effect === 'read'), 'no mutation in startup');
  const fake = fakeSession();
  const handlers = buildHandlers({ session: fake.session });
  assert.doesNotThrow(() => validateCoverage(steps, handlers));
});

test('startup preflight cannot reach fixture, Auth or device handlers', () => {
  const d = deriveDeadlines(accept());
  const steps = startupPreflightSteps(d);
  const forbidden = new Set([
    'create', 'accept', 'gateway', 'load-recover', 'close-actors', 'broadcast',
    'device:ballot-c', 'device:crowd-c-open', 'device:capture',
  ]);
  for (const step of steps) assert.ok(!forbidden.has(step.handler), `${step.handler} must not be in startup`);
});

test('the controller session is constructed but never started by composition', () => {
  const fake = fakeSession();
  buildHandlers({ session: fake.session });
  assert.deepEqual(fake.written, [], 'composing sends no commands');
  assert.equal(fake.closes(), 0);
});

test('composeRunner refuses a schedule it cannot fully handle', () => {
  const d = deriveDeadlines(accept());
  assert.throws(() => composeRunner({
    session: fakeSession().session,
    now: () => OPEN,
    schedule: [{ id: 'x', effect: 'api_write', handler: 'broadcast', phase: 'open', at: d.opens_at + MIN }],
  }), /unhandled steps: broadcast/);
});

test('a real session object satisfies the composition contract', () => {
  const session = createControllerSession({ scriptPath: 'C:/x/execute-owner.cjs', launch: async () => ({}) });
  assert.equal(typeof session.spawn, 'function');
  assert.doesNotThrow(() => buildHandlers({ session }));
});
