const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createScheduler, runAutonomous, deriveDeadlines, buildSchedule, guardStep,
  phaseAt, verifyAuthorization, clampBudget, planDigest, isMutating,
  EFFECTS, PHASE_PLAN, WRITE_MARGIN_MS, TERMINAL,
} = require('./lib/arena-acceptance-scheduler.cjs');
const { loadScheduleConfig, isLiveCapable } = require('./lib/arena-acceptance-config.cjs');

const MIN = 60 * 1000;
const OPEN = Date.UTC(2026, 10, 6, 3, 0, 0);
const accept = () => ({
  opens_at: OPEN,
  final_arguments_at: OPEN + PHASE_PLAN.openMin * MIN,
  judging_at: OPEN + (PHASE_PLAN.openMin + PHASE_PLAN.finalMin) * MIN,
  closes_at: OPEN + (PHASE_PLAN.openMin + PHASE_PLAN.finalMin + PHASE_PLAN.judgingMin) * MIN,
});
const HASH = 'a'.repeat(64);
const authorization = (over = {}) => ({
  approved: true, manifestHash: HASH, expiresAt: OPEN + 90 * MIN,
  budget: { crowd: 4, official: 4, ballot: 2, settle: 2, fixture: 1 }, ...over,
});

/** Fake clock + handlers + journal. Live tests supply a trusted approval gate (5C-5). */
function harness(opts = {}) {
  let clock = opts.start ?? OPEN - 10 * MIN;
  const journal = [];
  const calls = [];
  const handlers = opts.handlers ?? {};
  const base = {
    now: () => clock,
    authorization: opts.authorization === undefined ? authorization() : opts.authorization,
    handlers,
    journal: (e) => journal.push(e),
    budget: opts.budget,
    health: opts.health,
    serverNow: opts.serverNow,
    stepTimeoutMs: opts.stepTimeoutMs,
    approvalGate: opts.approvalGate === undefined
      // The default artifact mirrors the authorized limits so a valid plan arms;
      // tests that need a refusal supply their own gate.
      ? permissiveGate(
        (opts.authorization === undefined ? authorization() : opts.authorization)?.budget ?? {},
        (opts.authorization === undefined ? authorization() : opts.authorization)?.attemptCaps ?? {},
      )
      : opts.approvalGate,
  };
  if (opts.dryRun) delete base.handlers;
  const scheduler = createScheduler(base);
  return {
    scheduler, journal, calls, handlers,
    set: (t) => { clock = t; },
    get now() { return clock; },
  };
}

/**
 * Default approval gate for tests: returns a verified artifact whose limits the
 * scheduler may compare against. It deliberately mirrors the caller's authorized
 * budget/attempt caps so a correctly-configured run arms, while a run exceeding
 * them is refused.
 */
function permissiveGate(budget, attemptCaps) {
  return async () => ({ ok: true, artifact: { budget, attemptCaps, runId: undefined, signed: true } });
}

/** Register a handler that records its call and satisfies the effect contract. */
function spy(h, name, result = { ok: true }, effect = 'api_write') {
  const fn = async () => { h.calls.push(name); return result; };
  fn.effect = effect;
  // No reconciliation claim: these fakes have no reconciler, and claiming one
  // would defeat the blocked-on-uncertain-write guarantee.
  h.handlers[name] = fn;
}

/** Contract-compliant handler for inline `handlers: {...}` declarations. */
function behaved(impl, effect = 'api_write') {
  const fn = async (...args) => impl(...args);
  fn.effect = effect;
  return fn;
}

const step = (over) => ({
  id: 's', at: OPEN + MIN, phase: 'open', effect: 'api_write', budgetKey: 'official', handler: 'h', ...over,
});

/* ───────────────────────── F1: effect-based restriction ───────────────────────── */

test('F1 device_write is treated as mutating exactly like api_write', () => {
  assert.equal(isMutating('device_write'), true);
  assert.equal(isMutating('api_write'), true);
  assert.equal(isMutating('device_read'), false);
  assert.equal(isMutating('read'), false);
});

test('F1 a device_write step outside its phase is refused', () => {
  const d = deriveDeadlines(accept());
  const s = step({ effect: 'device_write', phase: 'open', budgetKey: 'crowd' });
  const late = guardStep(s, d, d.final_arguments_at + MIN);
  assert.equal(late.allowed, false);
  assert.equal(late.reason, 'phase_deadline_margin');
  const inside = guardStep(s, d, d.opens_at + MIN);
  assert.equal(inside.allowed, true);
});

test('F1 device Crowd submission cannot execute outside its phase', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'crowdCOpen');
  const s = step({ id: 'crowd', effect: 'device_write', budgetKey: 'crowd', handler: 'crowdCOpen', at: d.opens_at + MIN, phase: 'open' });
  await h.scheduler.arm(accept(), [s]);
  h.set(d.final_arguments_at + MIN); // OPEN has closed
  const res = await h.scheduler.tick();
  assert.deepEqual(h.calls, [], 'the device tap must not fire');
  assert.ok([TERMINAL.EXPIRED, TERMINAL.ABORTED].includes(res.terminal));
});

test('F1 a device_write must declare a phase; an undeclared phase is rejected', () => {
  const s = { id: 'x', at: OPEN + MIN, effect: 'device_write', budgetKey: 'crowd', handler: 'h' };
  assert.throws(() => buildSchedule([s]));
});

/* ──────────────────── F2: expiry rechecked before side effects ──────────────── */

test('F2 authorization expiring mid-run blocks the next action', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ authorization: authorization({ expiresAt: d.opens_at + 5 * MIN }) });
  spy(h, 'first'); spy(h, 'second');
  await h.scheduler.arm(accept(), [
    step({ id: 'a', handler: 'first', at: d.opens_at + 1 * MIN }),
    step({ id: 'b', handler: 'second', at: d.opens_at + 10 * MIN }),
  ]);
  h.set(d.opens_at + 2 * MIN);
  await h.scheduler.tick();
  assert.deepEqual(h.calls, ['first']);
  h.set(d.opens_at + 11 * MIN); // past expiry
  const res = await h.scheduler.tick();
  assert.deepEqual(h.calls, ['first'], 'no action after expiry');
  assert.equal(res.terminal, TERMINAL.EXPIRED);
  assert.equal(h.scheduler.status().abortReason, 'authorization_expired');
});

test('F2 body expiry exactly at the boundary is refused', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ authorization: authorization({ expiresAt: d.opens_at + 2 * MIN }) });
  spy(h, 'x');
  await h.scheduler.arm(accept(), [step({ handler: 'x', at: d.opens_at + MIN })]);
  h.set(d.opens_at + 2 * MIN);
  await h.scheduler.tick();
  assert.deepEqual(h.calls, []);
});

/* ───────────────── F3: overrides may only lower approved budget ─────────────── */

test('F3 a budget override cannot raise the owner allowance', () => {
  const approved = { crowd: 2, ballot: 2 };
  const clamped = clampBudget(approved, { crowd: 100 });
  assert.equal(clamped.crowd, 2, 'override above approval is clamped');
  assert.equal(clampBudget(approved, { crowd: 1 }).crowd, 1, 'a lower override is honoured');
});

test('F3 an override introducing a new category throws', () => {
  assert.throws(() => clampBudget({ crowd: 1 }, { extra: 5 }));
});

test('F3 the scheduler enforces the clamped budget, not the override', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ budget: { crowd: 100 } });
  spy(h, 'c1'); spy(h, 'c2'); spy(h, 'c3');
  const steps = ['c1', 'c2', 'c3'].map((id, i) => step({
    id, handler: id, budgetKey: 'crowd', effect: 'device_write',
    at: d.opens_at + (i + 1) * MIN,
  }));
  const armed = await h.scheduler.arm(accept(), steps);
  assert.equal(armed.budget.crowd, 4, 'clamped to the approved allowance');
});

/* ───────────────────── F4: every mutating step is budgeted ──────────────────── */

test('F4 a mutating step without a budget category is rejected', () => {
  assert.throws(() => buildSchedule([{ id: 'x', at: OPEN + MIN, phase: 'open', effect: 'api_write', handler: 'h' }]),
    /budget category/);
});

test('F4 a budget category absent from the approved budget is rejected', () => {
  assert.throws(() => buildSchedule(
    [{ id: 'x', at: OPEN + MIN, phase: 'open', effect: 'api_write', budgetKey: 'ghost', handler: 'h' }],
    { approvedBudget: { crowd: 1 } },
  ), /unbudgeted/);
});

test('F4 a device_write without a budget category cannot arm', async () => {
  const h = harness();
  const res = await h.scheduler.arm(accept(), [{ id: 'x', at: OPEN + MIN, phase: 'open', effect: 'device_write', handler: 'h' }]);
  assert.equal(res.activated, false);
  assert.match(res.reason, /invalid_configuration/);
});

test('F4 a missing budget category at runtime cannot execute', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'h');
  // Step declares a category the approval omits; buildSchedule refuses at arm.
  const bad = { id: 'x', at: d.opens_at + MIN, phase: 'open', effect: 'api_write', budgetKey: 'invented', handler: 'h' };
  const res = await h.scheduler.arm(accept(), [bad]);
  assert.equal(res.activated, false);
  assert.deepEqual(h.calls, []);
});

/* ───────────── F5: uncertain in-flight writes block, never replay ───────────── */

test('F5 a started action with no outcome blocks the run on resume', () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  const prior = [
    { stepId: null, outcome: 'armed', at: d.opens_at - MIN },
    { stepId: 'a', outcome: 'started', at: d.opens_at + MIN },
  ];
  const res = h.scheduler.resume(prior);
  assert.equal(res.blocked, true);
  assert.equal(res.terminal, TERMINAL.BLOCKED);
});

test('F5 a blocked run refuses further ticks', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'h');
  await h.scheduler.arm(accept(), [step({ id: 'a', handler: 'h', at: d.opens_at + MIN })]);
  h.scheduler.resume([{ stepId: 'a', outcome: 'started', at: d.opens_at }]);
  h.set(d.opens_at + 5 * MIN);
  const out = await h.scheduler.tick();
  assert.equal(out.skipped, true);
  assert.deepEqual(h.calls, [], 'an uncertain write is never replayed');
});

test('F5 a settled action is restored and not repeated', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'a'); spy(h, 'b');
  const armed = await h.scheduler.arm(accept(), [
    step({ id: 'a', handler: 'a', at: d.opens_at + MIN }),
    step({ id: 'b', handler: 'b', at: d.opens_at + 2 * MIN }),
  ]);
  // 5C-2: a valid journal carries the arm record with the bound plan digest.
  const prior = [
    { stepId: null, outcome: 'armed', at: d.opens_at - MIN, planDigest: armed.planDigest, budget: armed.budget },
    { stepId: 'a', outcome: 'started', at: d.opens_at + MIN, effect: 'api_write' },
    { stepId: 'a', outcome: 'ok', at: d.opens_at + MIN, effect: 'api_write' },
  ];
  const res = h.scheduler.resume(prior, { digest: armed.planDigest });
  assert.equal(res.blocked, false);
  h.set(d.opens_at + 3 * MIN);
  await h.scheduler.tick();
  assert.deepEqual(h.calls, ['b'], 'only the unexecuted step runs');
});

/* ───────────────────────── F6: autonomous + concurrency ─────────────────────── */

test('F6 the autonomous runner completes without external ticks', async () => {
  const d = deriveDeadlines(accept());
  let clock = d.opens_at - MIN;
  const journal = [];
  const calls = [];
  const handlers = {
    a: behaved(async () => { calls.push('a'); return { ok: true }; }),
    b: behaved(async () => { calls.push('b'); return { ok: true }; }),
  };
  const scheduler = createScheduler({
    now: () => clock, authorization: authorization(), handlers, journal: (e) => journal.push(e),
    approvalGate: permissiveGate(authorization().budget, authorization().attemptCaps),
  });
  await scheduler.arm(accept(), [
    step({ id: 'a', handler: 'a', at: d.opens_at + MIN }),
    step({ id: 'b', handler: 'b', at: d.opens_at + 2 * MIN }),
  ]);
  const out = await runAutonomous({
    scheduler,
    now: () => clock,
    sleep: async (ms) => { clock += ms * 60; }, // each poll advances a minute
    pollMs: 1,
    stopAt: d.closes_at + MIN,
  });
  assert.deepEqual(calls, ['a', 'b']);
  assert.equal(out.terminal, TERMINAL.COMPLETED);
});

test('F6 the runner stops at its clock deadline', async () => {
  const d = deriveDeadlines(accept());
  let clock = d.opens_at - MIN;
  const scheduler = createScheduler({ now: () => clock, authorization: authorization(), journal: () => {} });
  await scheduler.arm(accept(), [step({ id: 'x', effect: 'read', handler: 'z', at: d.opens_at + 25 * MIN })]);
  const out = await runAutonomous({
    scheduler, now: () => clock, sleep: async () => { clock += MIN; }, pollMs: 1, stopAt: d.opens_at + 5 * MIN,
  });
  assert.equal(out.reason, 'clock_deadline');
  assert.equal(out.terminal, TERMINAL.ABORTED);
});

test('F6 concurrent ticks do not dispatch duplicate actions', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  let release;
  const gate = new Promise((r) => { release = r; });
  h.handlers.slow = behaved(async () => { h.calls.push('slow'); await gate; return { ok: true }; });
  await h.scheduler.arm(accept(), [step({ id: 'a', handler: 'slow', at: d.opens_at + MIN })]);
  h.set(d.opens_at + 2 * MIN);
  const first = h.scheduler.tick();
  const second = await h.scheduler.tick();
  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'tick_in_progress');
  release();
  await first;
  assert.deepEqual(h.calls, ['slow'], 'the handler ran exactly once');
});

/* ───────────────────── F7: negative assertions by code ──────────────────────── */

test('F7 the expected rejection code is required by the schedule', () => {
  assert.throws(() => buildSchedule([
    { id: 'n', at: OPEN + MIN, phase: 'open', effect: 'api_write', budgetKey: 'ballot', handler: 'h', expect: 'rejected' },
  ]), /expectCode/);
});

test('F7 a matching rejection is a PASS', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ handlers: { dup: behaved(async () => ({ ok: false, code: 'already_judged' })) } });
  await h.scheduler.arm(accept(), [step({
    id: 'dup', handler: 'dup', budgetKey: 'ballot', phase: 'judging', at: d.judging_at + MIN,
    expect: 'rejected', expectCode: 'already_judged',
  })]);
  h.set(d.judging_at + 2 * MIN);
  const res = await h.scheduler.tick();
  assert.equal(res.terminal, TERMINAL.COMPLETED);
  assert.ok(h.journal.some((e) => e.outcome === 'expected_rejection'));
});

test('F7 a rejection with the WRONG code is a failure', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ handlers: { dup: behaved(async () => ({ ok: false, code: 'network_error' })) } });
  await h.scheduler.arm(accept(), [step({
    id: 'dup', handler: 'dup', budgetKey: 'ballot', phase: 'judging', at: d.judging_at + MIN,
    expect: 'rejected', expectCode: 'already_judged',
  })]);
  h.set(d.judging_at + 2 * MIN);
  const res = await h.scheduler.tick();
  assert.equal(res.terminal, TERMINAL.ABORTED);
  assert.equal(h.scheduler.status().abortReason, 'unexpected_negative_result');
});

test('F7 a generic ok:false does not satisfy a specific expectation', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ handlers: { dup: behaved(async () => ({ ok: false })) } });
  await h.scheduler.arm(accept(), [step({
    id: 'dup', handler: 'dup', budgetKey: 'ballot', phase: 'judging', at: d.judging_at + MIN,
    expect: 'rejected', expectCode: 'already_judged',
  })]);
  h.set(d.judging_at + 2 * MIN);
  await h.scheduler.tick();
  assert.equal(h.scheduler.status().terminal, TERMINAL.ABORTED);
});

test('F7 a success where a rejection was expected is a failure', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ handlers: { dup: behaved(async () => ({ ok: true })) } });
  await h.scheduler.arm(accept(), [step({
    id: 'dup', handler: 'dup', budgetKey: 'ballot', phase: 'judging', at: d.judging_at + MIN,
    expect: 'rejected', expectCode: 'already_judged',
  })]);
  h.set(d.judging_at + 2 * MIN);
  await h.scheduler.tick();
  assert.equal(h.scheduler.status().terminal, TERMINAL.ABORTED);
});

/* ───────────────── device Crowd: three-way combined guarantee ──────────────── */

test('a device Crowd submission is refused with an exhausted budget', async () => {
  const d = deriveDeadlines(accept());
  // 5C-1: two scheduled Crowd attempts against a 1-crowd approval is refused at arm.
  const h = harness({ authorization: authorization({ budget: { crowd: 1, official: 1, ballot: 1, settle: 1, fixture: 1, spectator: 1 } }) });
  spy(h, 'c1'); spy(h, 'c2');
  const armed = await h.scheduler.arm(accept(), [
    step({ id: 'c1', effect: 'device_write', budgetKey: 'crowd', handler: 'c1', at: d.opens_at + MIN }),
    step({ id: 'c2', effect: 'device_write', budgetKey: 'crowd', handler: 'c2', at: d.opens_at + 2 * MIN }),
  ]);
  assert.equal(armed.activated, false);
  assert.match(armed.reason, /exceeds approved budget/);
  assert.deepEqual(h.calls, [], 'no Crowd tap may run when demand exceeds approval');
});

test('a device Crowd submission is refused when the category is missing entirely', async () => {
  const h = harness();
  const res = await h.scheduler.arm(accept(), [
    { id: 'c', at: OPEN + MIN, phase: 'open', effect: 'device_write', handler: 'h' },
  ]);
  assert.equal(res.activated, false);
});

/* ─────────────────────────── timeouts and handlers ─────────────────────────── */

test('a timed-out write blocks the run and never retries', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ stepTimeoutMs: 10 });
  let attempts = 0;
  h.handlers.slow = behaved(async () => { attempts += 1; await new Promise((r) => setTimeout(r, 50)); return { ok: true }; });
  await h.scheduler.arm(accept(), [step({ id: 'w', handler: 'slow', at: d.opens_at + MIN })]);
  h.set(d.opens_at + 2 * MIN);
  const res = await h.scheduler.tick();
  // 5C-3: the promise was abandoned, not cancelled — the outcome is uncertain.
  assert.equal(res.terminal, TERMINAL.BLOCKED);
  assert.equal(h.scheduler.status().abortReason, 'step_timeout');
  await h.scheduler.tick();
  assert.equal(attempts, 1, 'a timed-out write is never replayed');
});

test('arming fails when a named handler is missing', async () => {
  const h = harness({ handlers: {} });
  const res = await h.scheduler.arm(accept(), [step({ id: 'x', handler: 'absent', at: OPEN + MIN })]);
  assert.equal(res.activated, false);
  assert.match(res.reason, /invalid_handler/);
  assert.match(res.reason, /must be a function/);
});

/* ───────────────── manifest / schedule / authorization binding ─────────────── */

test('the plan digest binds manifest, schedule and authorization', () => {
  const d = deriveDeadlines(accept());
  const steps = [step({ id: 'a', handler: 'h' })];
  const base = { manifestHash: HASH, steps, authorization: authorization(), deadlines: d };
  const a = planDigest(base);
  assert.notEqual(a, planDigest({ ...base, manifestHash: 'b'.repeat(64) }));
  assert.notEqual(a, planDigest({ ...base, deadlines: { ...d, closes_at: d.closes_at + 1 } }));
  assert.notEqual(a, planDigest({ ...base, steps: [{ ...steps[0], at: steps[0].at + 1 }] }));
  assert.equal(a, planDigest({ manifestHash: HASH, steps: [step({ id: 'a', handler: 'h' })], authorization: authorization(), deadlines: d }));
});

test('arming records the plan digest and effective budget', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'h');
  const res = await h.scheduler.arm(accept(), [step({ handler: 'h', at: d.opens_at + MIN })]);
  assert.match(res.planDigest, /^[a-f0-9]{64}$/);
  assert.ok(res.budget);
  assert.ok(h.journal.some((e) => e.outcome === 'armed' && e.planDigest === res.planDigest));
});

/* ───────────────────────── authorization activation gates ──────────────────── */

test('activation is refused without usable authorization', async () => {
  const cases = {
    missing: null,
    unapproved: authorization({ approved: false }),
    badHash: authorization({ manifestHash: 'nope' }),
    noExpiry: authorization({ expiresAt: undefined }),
    expired: authorization({ expiresAt: OPEN - 20 * MIN }),
  };
  for (const [name, auth] of Object.entries(cases)) {
    const h = harness({ authorization: auth });
    const res = await h.scheduler.arm(accept(), [step({ at: OPEN + MIN })]);
    assert.equal(res.activated, false, `${name} must refuse`);
    assert.equal(res.terminal, TERMINAL.REFUSED);
  }
});

test('an authorization expiring before the window opens is refused', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ authorization: authorization({ expiresAt: d.opens_at - MIN }) });
  const res = await h.scheduler.arm(accept(), [step({ at: d.opens_at + MIN })]);
  assert.equal(res.activated, false);
});

test('a run may arm after OPEN starts when the remaining plan still fits', async () => {
  const d = deriveDeadlines(accept());
  // One minute into OPEN, with a step due well before FINAL.
  const h = harness({ start: d.opens_at + MIN });
  spy(h, 'h');
  const res = await h.scheduler.arm(accept(), [step({ id: 'a', handler: 'h', at: d.opens_at + 2 * MIN })]);
  assert.equal(res.activated, true, res.reason);
  assert.equal(res.lateStart, true, 'the armed record says the start was inside the window');
  const entry = h.journal.find((e) => e.outcome === 'armed');
  assert.equal(entry.lateStart, true);
});

test('mid-window arming is refused when a step no longer fits its window', async () => {
  const d = deriveDeadlines(accept());
  // Near the end of OPEN, with a write due inside the closing margin.
  const h = harness({ start: d.final_arguments_at - 30 * 1000 });
  spy(h, 'h');
  const res = await h.scheduler.arm(accept(), [step({ id: 'a', handler: 'h', at: d.final_arguments_at - 5 * 1000 })]);
  assert.equal(res.activated, false);
  assert.match(res.reason, /insufficient_window/);
});

test('mid-window arming is refused once the window has closed', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ start: d.closes_at + MIN });
  spy(h, 'h');
  const res = await h.scheduler.arm(accept(), [step({ id: 'a', handler: 'h', at: d.opens_at + MIN })]);
  assert.equal(res.activated, false);
  assert.equal(res.reason, 'window_closed');
});

test('mid-window arming is refused when authorization expires before the plan ends', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({
    start: d.opens_at + 5 * MIN,
    authorization: authorization({ expiresAt: d.opens_at + 10 * MIN }),
  });
  spy(h, 'h');
  const res = await h.scheduler.arm(accept(), [step({ id: 'a', handler: 'h', at: d.opens_at + 12 * MIN })]);
  assert.equal(res.activated, false);
  assert.equal(res.reason, 'authorization_expires_before_plan_end');
});

/* ───────────────────────────── phase lifecycle ─────────────────────────────── */

test('OPEN → FINAL → JUDGING → CLOSED execute in order', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'o'); spy(h, 'f'); spy(h, 'j'); spy(h, 'r');
  await h.scheduler.arm(accept(), [
    step({ id: 'o', handler: 'o', phase: 'open', at: d.opens_at + MIN }),
    step({ id: 'f', handler: 'f', phase: 'final_arguments', at: d.final_arguments_at + MIN }),
    step({ id: 'j', handler: 'j', phase: 'judging', budgetKey: 'ballot', at: d.judging_at + MIN }),
    { id: 'r', effect: 'read', handler: 'r', phase: 'closed', at: d.closes_at + MIN },
  ]);
  for (const t of [d.opens_at + 2 * MIN, d.final_arguments_at + 2 * MIN, d.judging_at + 2 * MIN, d.closes_at + 2 * MIN]) {
    h.set(t);
    await h.scheduler.tick();
  }
  assert.deepEqual(h.calls, ['o', 'f', 'j', 'r']);
  assert.equal(h.scheduler.status().terminal, TERMINAL.COMPLETED);
});

test('a read after close is permitted; a write is not', () => {
  const d = deriveDeadlines(accept());
  assert.equal(guardStep({ effect: 'read', phase: 'closed' }, d, d.closes_at + MIN).allowed, true);
  assert.equal(guardStep({ effect: 'device_read', phase: 'closed' }, d, d.closes_at + MIN).allowed, true);
  assert.equal(guardStep({ effect: 'api_write', phase: 'judging' }, d, d.closes_at + MIN).allowed, false);
});

test('a write inside the margin is refused', () => {
  const d = deriveDeadlines(accept());
  const s = { effect: 'api_write', phase: 'open' };
  assert.equal(guardStep(s, d, d.final_arguments_at - WRITE_MARGIN_MS - 1).allowed, true);
  assert.equal(guardStep(s, d, d.final_arguments_at - 1).reason, 'phase_deadline_margin');
});

test('phase mapping is correct at every boundary', () => {
  const d = deriveDeadlines(accept());
  assert.equal(phaseAt(d, d.opens_at - 1), 'before_open');
  assert.equal(phaseAt(d, d.opens_at), 'open');
  assert.equal(phaseAt(d, d.final_arguments_at), 'final_arguments');
  assert.equal(phaseAt(d, d.judging_at), 'judging');
  assert.equal(phaseAt(d, d.closes_at), 'closed');
});

test('invalid ACCEPT boundaries are rejected', () => {
  for (const bad of [{}, { ...accept(), final_arguments_at: OPEN - 1 }, { ...accept(), judging_at: OPEN + 21 * MIN }]) {
    assert.throws(() => deriveDeadlines(bad));
  }
});

/* ───────────────────────── failure, health, journal ────────────────────────── */

test('an unexpected handler failure aborts without retry', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  let attempts = 0;
  h.handlers.boom = behaved(async () => { attempts += 1; const e = new Error('down'); e.code = 'WRITE_FAILED'; throw e; });
  await h.scheduler.arm(accept(), [step({ id: 'b', handler: 'boom', at: d.opens_at + MIN })]);
  h.set(d.opens_at + 2 * MIN);
  await h.scheduler.tick();
  await h.scheduler.tick();
  assert.equal(attempts, 1);
});

test('device-not-foreground health failure aborts before the tap', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ health: async () => ({ ok: false, reason: 'device_not_foreground' }) });
  spy(h, 'tap');
  await h.scheduler.arm(accept(), [step({ id: 't', effect: 'device_write', budgetKey: 'crowd', handler: 'tap', requiresHealth: true, at: d.opens_at + MIN })]);
  h.set(d.opens_at + 2 * MIN);
  await h.scheduler.tick();
  assert.deepEqual(h.calls, []);
  assert.equal(h.scheduler.status().abortReason, 'device_not_foreground');
});

test('gateway health failure aborts before the write', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ health: async () => ({ ok: false, reason: 'gateway_unreachable' }) });
  spy(h, 'w');
  await h.scheduler.arm(accept(), [step({ id: 'w', handler: 'w', requiresHealth: true, at: d.opens_at + MIN })]);
  h.set(d.opens_at + 2 * MIN);
  await h.scheduler.tick();
  assert.deepEqual(h.calls, []);
});

test('server clock drift mid-run aborts before the next write', async () => {
  const d = deriveDeadlines(accept());
  let skew = 0;
  const h = harness({ serverNow: async () => h.now + skew });
  spy(h, 'a'); spy(h, 'b');
  await h.scheduler.arm(accept(), [
    step({ id: 'a', handler: 'a', at: d.opens_at + MIN }),
    step({ id: 'b', handler: 'b', at: d.final_arguments_at + MIN }),
  ]);
  h.set(d.opens_at + 2 * MIN);
  await h.scheduler.tick();
  skew = MIN;
  h.set(d.final_arguments_at + 2 * MIN);
  await h.scheduler.tick();
  assert.deepEqual(h.calls, ['a']);
});

test('interruption freezes the run', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'a');
  await h.scheduler.arm(accept(), [step({ id: 'a', handler: 'a', at: d.opens_at + MIN })]);
  h.scheduler.interrupt('usage_limit');
  h.set(d.opens_at + 2 * MIN);
  await h.scheduler.tick();
  assert.deepEqual(h.calls, []);
});

test('the journal records every transition immutably', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'a');
  await h.scheduler.arm(accept(), [step({ id: 'a', handler: 'a', at: d.opens_at + MIN })]);
  h.set(d.opens_at + 2 * MIN);
  await h.scheduler.tick();
  h.set(d.closes_at + MIN);
  await h.scheduler.tick();
  const outcomes = h.journal.map((e) => e.outcome);
  assert.equal(outcomes[0], 'armed');
  assert.ok(outcomes.includes('started'));
  assert.ok(outcomes.includes('ok'));
  assert.equal(outcomes[outcomes.length - 1], 'completed');
  for (const e of h.journal) {
    assert.equal(typeof e.at, 'number');
    assert.ok(Object.isFrozen(e));
  }
});

/* ───────────────────────────── dry run + config ────────────────────────────── */

test('dry run never invokes handlers and is the default mode', async () => {
  const d = deriveDeadlines(accept());
  const journal = [];
  let clock = d.opens_at - MIN;
  const scheduler = createScheduler({ now: () => clock, authorization: authorization(), journal: (e) => journal.push(e) });
  const res = await scheduler.arm(accept(), [step({ handler: 'h', at: d.opens_at + MIN })]);
  assert.equal(res.mode, 'dry-run');
  clock = d.opens_at + 2 * MIN;
  await scheduler.tick();
  assert.ok(journal.some((e) => e.outcome === 'skipped'));
});

test('the scheduler exposes no adapter surface', () => {
  const s = createScheduler({ now: () => 0 });
  assert.deepEqual(Object.keys(s).sort(), ['PHASE_PLAN', 'arm', 'interrupt', 'resume', 'status', 'tick']);
});

test('the example JSON loads through the real loader and cannot authorize a live run', () => {
  const config = require('./arena-acceptance-schedule.example.json');
  const d = deriveDeadlines(accept());
  const loaded = loadScheduleConfig(config, d);
  assert.equal(config.authorization.approved, false, 'the example never grants approval');
  assert.equal(loaded.authorizationUsable, false, 'the loader reports it unusable');
  assert.equal(isLiveCapable(config), false, 'it cannot become a live run');
  assert.equal(loaded.schedule.length, config.steps.length);
  assert.equal(loaded.schedule.filter((s) => s.expect === 'rejected').length, 2, 'both duplicate assertions present');
  assert.ok(loaded.schedule.every((s) => isMutating(s.effect) ? typeof s.budgetKey === 'string' : true),
    'every mutating step is budgeted');
});

test('the example uses only effects the engine knows', () => {
  const config = require('./arena-acceptance-schedule.example.json');
  for (const s of config.steps) assert.ok(Object.prototype.hasOwnProperty.call(EFFECTS, s.effect), s.id);
});

test('a config whose override exceeds approval is clamped by the loader', () => {
  const d = deriveDeadlines(accept());
  const config = {
    authorization: authorization({ budget: { crowd: 2 } }),
    steps: [{ id: 'c', offsetMin: 1, phase: 'open', effect: 'api_write', budgetKey: 'crowd', handler: 'h' }],
  };
  const loaded = loadScheduleConfig(config, d);
  assert.equal(loaded.budget.crowd, 2);
});

/* ═══════════════════════ Phase 5C regression tests ═══════════════════════ */

const { validateDemand, assertHandlerContract } = require('./lib/arena-acceptance-scheduler.cjs');

/* ── 5C-1: demand must fit the approved allowance ────────────────────────── */

test('5C-1 demand counts only spending actions, not expected rejections', () => {
  const d = deriveDeadlines(accept());
  const steps = [
    step({ id: 'b1', budgetKey: 'ballot', at: d.judging_at + MIN, phase: 'judging' }),
    step({ id: 'b2', budgetKey: 'ballot', at: d.judging_at + MIN, phase: 'judging' }),
    step({ id: 'dup1', budgetKey: 'ballot', at: d.judging_at + 2 * MIN, phase: 'judging', expect: 'rejected', expectCode: 'already_judged' }),
    step({ id: 'dup2', budgetKey: 'ballot', at: d.judging_at + 3 * MIN, phase: 'judging', expect: 'rejected', expectCode: 'already_judged' }),
  ];
  const { demand } = validateDemand(buildSchedule(steps), { ballot: 2, official: 4, crowd: 4, settle: 2, fixture: 1, spectator: 2 }, { ballot: 4 });
  assert.equal(demand.ballot, 2, 'four attempts, two spend the allowance');
});

test('5C-1 a schedule exceeding its allowance is refused before arming', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({
    authorization: authorization({ budget: { ballot: 2, official: 4, crowd: 4, settle: 2, fixture: 1, spectator: 2 } }),
  });
  const steps = ['b1', 'b2', 'b3'].map((id, i) => step({ id, budgetKey: 'ballot', handler: id, at: d.judging_at + (i + 1) * MIN, phase: 'judging' }));
  const res = await h.scheduler.arm(accept(), steps);
  assert.equal(res.activated, false);
  assert.match(res.reason, /exceeds approved budget/);
});

test('5C-1 an unbudgeted category is refused at validation', () => {
  const schedule = buildSchedule([step({ id: 'x', budgetKey: 'ghost' })]);
  assert.throws(() => validateDemand(schedule, { official: 4 }), /no approval/);
});

test('5C-1 the shipped example fits every approved category exactly', () => {
  const config = require('./arena-acceptance-schedule.example.json');
  const d = deriveDeadlines(accept());
  const loaded = loadScheduleConfig(config, d);
  for (const [key, count] of Object.entries(loaded.demand)) {
    assert.ok(count <= loaded.budget[key], `${key}: ${count} scheduled vs ${loaded.budget[key]} approved`);
  }
  assert.equal(loaded.demand.spectator, 2, 'two spectator admissions (not one fixture)');
  assert.equal(loaded.demand.ballot, 2, 'two ballots; the duplicates are rejections');
  assert.equal(loaded.demand.official, 4);
  assert.equal(loaded.demand.crowd, 4);
  assert.equal(loaded.demand.settle, 2);
});

/* ── 5C-2: restart recovery is fail-closed ───────────────────────────────── */

test('5C-2 recovery blocks when the plan digest does not match', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'a');
  const armed = await h.scheduler.arm(accept(), [step({ id: 'a', handler: 'a', at: d.opens_at + MIN })]);
  const res = h.scheduler.resume(
    [{ stepId: null, outcome: 'armed', at: d.opens_at - MIN, planDigest: 'f'.repeat(64) }],
    { digest: armed.planDigest },
  );
  assert.equal(res.blocked, true);
  assert.equal(res.terminal, TERMINAL.BLOCKED);
});

test('5C-2 recovery blocks on a journal with no arm record', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'a');
  await h.scheduler.arm(accept(), [step({ id: 'a', handler: 'a', at: d.opens_at + MIN })]);
  const res = h.scheduler.resume([{ stepId: 'a', outcome: 'ok', at: d.opens_at + MIN }]);
  assert.equal(res.blocked, true);
});

test('5C-2 recovery blocks on an unknown step id', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'a');
  const armed = await h.scheduler.arm(accept(), [step({ id: 'a', handler: 'a', at: d.opens_at + MIN })]);
  const res = h.scheduler.resume([
    { stepId: null, outcome: 'armed', at: d.opens_at - MIN, planDigest: armed.planDigest },
    { stepId: 'not-in-plan', outcome: 'ok', at: d.opens_at + MIN },
  ], { digest: armed.planDigest });
  assert.equal(res.blocked, true);
});

test('5C-2 recovery blocks on malformed journal entries', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'a');
  const armed = await h.scheduler.arm(accept(), [step({ id: 'a', handler: 'a', at: d.opens_at + MIN })]);
  for (const bad of [null, { outcome: 'ok' }, { stepId: 'a', at: d.opens_at }]) {
    const g = harness();
    spy(g, 'a');
    const a = await g.scheduler.arm(accept(), [step({ id: 'a', handler: 'a', at: d.opens_at + MIN })]);
    const res = g.scheduler.resume([{ stepId: null, outcome: 'armed', at: d.opens_at - MIN, planDigest: a.planDigest }, bad], { digest: a.planDigest });
    assert.equal(res.blocked, true, `malformed entry ${JSON.stringify(bad)} must block`);
  }
  assert.ok(armed.planDigest);
});

test('5C-2 recovery rebuilds spent budget from the journal and refuses overspend', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ authorization: authorization({ budget: { crowd: 2, official: 4, ballot: 2, settle: 2, fixture: 1, spectator: 2 } }) });
  spy(h, 'c1'); spy(h, 'c2');
  const steps = [
    step({ id: 'c1', effect: 'device_write', budgetKey: 'crowd', handler: 'c1', at: d.opens_at + MIN }),
    step({ id: 'c2', effect: 'device_write', budgetKey: 'crowd', handler: 'c2', at: d.opens_at + 2 * MIN }),
  ];
  const armed = await h.scheduler.arm(accept(), steps);
  // Journal claims BOTH crowd sends already spent.
  const res = h.scheduler.resume([
    { stepId: null, outcome: 'armed', at: d.opens_at - MIN, planDigest: armed.planDigest, budget: armed.budget },
    { stepId: 'c1', outcome: 'ok', at: d.opens_at + MIN, effect: 'device_write' },
    { stepId: 'c2', outcome: 'ok', at: d.opens_at + 2 * MIN, effect: 'device_write' },
  ], { digest: armed.planDigest });
  assert.equal(res.blocked, false);
  assert.equal(h.scheduler.status().spent.crowd, 2, 'spent budget reconstructed from the journal');
});

/* ── 5C-3: timeout is an uncertain side effect ───────────────────────────── */

test('5C-3 a timed-out mutating step yields BLOCKED with a reconciliation flag', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ stepTimeoutMs: 5 });
  h.handlers.slow = behaved(async () => { await new Promise((r) => setTimeout(r, 40)); return { ok: true }; });
  await h.scheduler.arm(accept(), [step({ id: 'w', handler: 'slow', at: d.opens_at + MIN })]);
  h.set(d.opens_at + 2 * MIN);
  await h.scheduler.tick();
  const blocked = h.journal.find((e) => e.outcome === 'timeout');
  assert.ok(blocked, 'journal records an uncertain timeout');
  assert.equal(blocked.requiresReconciliation, true);
  assert.equal(h.scheduler.status().terminal, TERMINAL.BLOCKED);
});

test('5C-3 recovery treats a journaled timeout as uncertain and blocks', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'w');
  const armed = await h.scheduler.arm(accept(), [step({ id: 'w', handler: 'w', at: d.opens_at + MIN })]);
  const res = h.scheduler.resume([
    { stepId: null, outcome: 'armed', at: d.opens_at - MIN, planDigest: armed.planDigest },
    { stepId: 'w', outcome: 'timeout', at: d.opens_at + MIN, effect: 'api_write' },
  ], { digest: armed.planDigest });
  assert.equal(res.blocked, true);
});

test('5C-3 a read-only timeout is an abort, not an uncertain write', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ stepTimeoutMs: 5 });
  h.handlers.slowRead = behaved(async () => { await new Promise((r) => setTimeout(r, 40)); return { ok: true }; }, 'read');
  await h.scheduler.arm(accept(), [{ id: 'r', effect: 'read', handler: 'slowRead', phase: 'open', at: d.opens_at + MIN }]);
  h.set(d.opens_at + 2 * MIN);
  await h.scheduler.tick();
  assert.equal(h.scheduler.status().terminal, TERMINAL.ABORTED);
});

/* ── 5C-4: handler contract ──────────────────────────────────────────────── */

test('5C-4 a read-only handler that performs side effects is rejected', () => {
  const fake = async () => ({ ok: true });
  fake.effect = 'read';
  fake.sideEffects = true;
  assert.throws(() => assertHandlerContract('fake', fake), /declared read-only/);
});

test('5C-4 a mutating handler without a reconciliation contract is allowed but claims nothing', () => {
  const fake = async () => ({ ok: true });
  fake.effect = 'api_write';
  // No claim is made, so the contract passes; the run still blocks on uncertainty.
  assert.equal(assertHandlerContract('fake', fake), 'api_write');
  assert.notEqual(fake.reconciles, true);
});

test('5C-4 claiming reconciles:true without a mechanism is rejected', () => {
  const fake = async () => ({ ok: true });
  fake.effect = 'api_write';
  fake.reconciles = true;
  assert.throws(() => assertHandlerContract('fake', fake), /without a reconcile\(\) mechanism/);
});

test('5C-4 claiming reconciles:true WITH a mechanism is accepted', () => {
  const fake = async () => ({ ok: true });
  fake.effect = 'api_write';
  fake.reconciles = true;
  fake.reconcile = async () => ({ outcome: 'confirmed' });
  assert.equal(assertHandlerContract('fake', fake), 'api_write');
});

test('5C-4 a handler with no declared effect is rejected', () => {
  assert.throws(() => assertHandlerContract('bare', async () => ({ ok: true })), /declare a known effect/);
});

test('5C-4 arming refuses when a handler violates the contract', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ handlers: { bad: async () => ({ ok: true }) } });
  const res = await h.scheduler.arm(accept(), [step({ id: 'x', handler: 'bad', at: d.opens_at + MIN })]);
  assert.equal(res.activated, false);
  assert.match(res.reason, /invalid_handler/);
});

/* ── 5C-5: digest is not authorization ───────────────────────────────────── */

test('5C-5 live arming is refused without a trusted approval gate', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ approvalGate: null });
  spy(h, 'x');
  const res = await h.scheduler.arm(accept(), [step({ id: 'x', handler: 'x', at: d.opens_at + MIN })]);
  assert.equal(res.activated, false);
  assert.equal(res.reason, 'missing_approval_gate');
});

test('5C-5 a refusing approval gate blocks activation', async () => {
  const d = deriveDeadlines(accept());
  const h = harness({ approvalGate: async () => ({ ok: false, reason: 'artifact_not_signed' }) });
  spy(h, 'x');
  const res = await h.scheduler.arm(accept(), [step({ id: 'x', handler: 'x', at: d.opens_at + MIN })]);
  assert.equal(res.activated, false);
  assert.equal(res.reason, 'artifact_not_signed');
});

test('5C-5 the plan digest is labelled as identification, not approval', async () => {
  const d = deriveDeadlines(accept());
  const h = harness();
  spy(h, 'x');
  const res = await h.scheduler.arm(accept(), [step({ id: 'x', handler: 'x', at: d.opens_at + MIN })]);
  const armEntry = h.journal.find((e) => e.outcome === 'armed');
  assert.match(armEntry.note, /not an approval/);
  assert.equal(typeof res.planDigest, 'string');
});

test('5C-5 the digest is stable across expiry changes', () => {
  const d = deriveDeadlines(accept());
  const steps = [step({ id: 'a', handler: 'h' })];
  const a = planDigest({ manifestHash: HASH, steps, authorization: authorization({ expiresAt: OPEN + 60 * MIN }), deadlines: d });
  const b = planDigest({ manifestHash: HASH, steps, authorization: authorization({ expiresAt: OPEN + 90 * MIN }), deadlines: d });
  assert.equal(a, b, 'expiry is not part of the plan identity');
});

/* ── Consolidated: loader/demand integration + ballot accounting ─────────── */

test('loader always computes demand, even without an approved budget', () => {
  const d = deriveDeadlines(accept());
  const config = {
    authorization: { approved: false, manifestHash: HASH, expiresAt: OPEN + 90 * MIN },
    steps: [{ id: 'c', offsetMin: 1, phase: 'open', effect: 'api_write', budgetKey: 'crowd', handler: 'h' }],
  };
  const loaded = loadScheduleConfig(config, d);
  // Must not silently report zero mutations and skip validation.
  assert.deepEqual(loaded.demand, { crowd: 1 });
  assert.equal(loaded.loadable, false, 'mutations without an approval are not loadable');
  assert.equal(loaded.authorizationReason, 'missing_budget');
});

test('loader keeps a read-only plan loadable without a budget', () => {
  const d = deriveDeadlines(accept());
  const config = {
    authorization: { approved: false, manifestHash: HASH, expiresAt: OPEN + 90 * MIN },
    steps: [{ id: 'r', offsetMin: 1, phase: 'open', effect: 'read', handler: 'h' }],
  };
  const loaded = loadScheduleConfig(config, d);
  assert.deepEqual(loaded.demand, {});
  assert.equal(loaded.loadable, true);
  assert.equal(loaded.authorizationUsable, false);
});

test('loader rejects a schedule exceeding its approved allowance', () => {
  const d = deriveDeadlines(accept());
  const config = {
    authorization: authorization({ budget: { crowd: 1 } }),
    steps: [
      { id: 'a', offsetMin: 1, phase: 'open', effect: 'api_write', budgetKey: 'crowd', handler: 'h' },
      { id: 'b', offsetMin: 2, phase: 'open', effect: 'api_write', budgetKey: 'crowd', handler: 'h' },
    ],
  };
  assert.throws(() => loadScheduleConfig(config, d), /exceeds approved budget/);
});

test('ballot accounting separates successes from attempts', () => {
  const d = deriveDeadlines(accept());
  const steps = [
    step({ id: 'b1', effect: 'device_write', budgetKey: 'ballot', handler: 'a', phase: 'judging', at: d.judging_at + MIN }),
    step({ id: 'b2', budgetKey: 'ballot', handler: 'a', phase: 'judging', at: d.judging_at + MIN }),
    step({ id: 'd1', budgetKey: 'ballot', handler: 'a', phase: 'judging', at: d.judging_at + 2 * MIN, expect: 'rejected', expectCode: 'already_judged' }),
    step({ id: 'd2', effect: 'device_write', budgetKey: 'ballot', handler: 'a', phase: 'judging', at: d.judging_at + 3 * MIN, expect: 'rejected', expectCode: 'already_judged' }),
  ];
  const { demand, attempts } = validateDemand(buildSchedule(steps),
    { ballot: 2, official: 4, crowd: 4, settle: 2, fixture: 1, spectator: 2 }, { ballot: 4 });
  assert.equal(demand.ballot, 2, 'four attempts, two authorized successes');
  assert.equal(attempts.ballot, 4, 'four request attempts, capped at 4');
});

test('three successful ballots against a two-ballot approval are refused at arm', () => {
  const d = deriveDeadlines(accept());
  const steps = ['b1', 'b2', 'b3'].map((id, i) => step({ id, budgetKey: 'ballot', handler: 'h', phase: 'judging', at: d.judging_at + (i + 1) * MIN }));
  assert.throws(() => validateDemand(buildSchedule(steps), { ballot: 2, official: 4, crowd: 4, settle: 2, fixture: 1, spectator: 2 }),
    /ballot: 3 scheduled, 2 approved/);
});

/* ── Complete 35-minute simulation ───────────────────────────────────────── */

test('a complete 35-minute schedule runs through every phase and completes', async () => {
  const d = deriveDeadlines(accept());
  let clock = d.opens_at - MIN;
  const calls = [];
  const journal = [];
  const handlers = {};
  const names = [
    'watchC', 'watchD', 'officialAOpen', 'officialBOpen', 'shotOpen', 'crowdCOpen', 'crowdDOpen', 'shotRemote',
    'officialAFinal', 'officialBFinal', 'shotFinal', 'crowdCFinal', 'crowdDFinal',
    'shotJudging', 'ballotC', 'ballotD', 'ballotDDup', 'ballotCDup',
    'settleFirst', 'settleReplay', 'shotVerdict', 'shotReentry', 'inspectFinal',
  ];
  for (const n of names) {
    handlers[n] = behaved(async () => {
      calls.push({ name: n, at: clock });
      if (n.endsWith('Dup')) return { ok: false, code: 'already_judged' };
      return { ok: true };
    });
  }
  const budget = { fixture: 1, spectator: 2, official: 4, crowd: 4, ballot: 2, settle: 2, gateway: 1 };
  const attemptCaps = { official: 4, crowd: 4, ballot: 4, settle: 2, spectator: 2 };
  const scheduler = createScheduler({
    now: () => clock,
    authorization: authorization({ budget, attemptCaps, expiresAt: d.opens_at + 90 * MIN }),
    handlers,
    journal: (e) => journal.push(e),
    approvalGate: permissiveGate(budget, attemptCaps),
  });
  const steps = [
    step({ id: 'w-c', effect: 'device_write', budgetKey: 'spectator', handler: 'watchC', at: d.opens_at + 0.5 * MIN }),
    step({ id: 'w-d', budgetKey: 'spectator', handler: 'watchD', at: d.opens_at + 0.5 * MIN }),
    step({ id: 'o-a', budgetKey: 'official', handler: 'officialAOpen', at: d.opens_at + 2 * MIN }),
    step({ id: 'o-b', budgetKey: 'official', handler: 'officialBOpen', at: d.opens_at + 2 * MIN }),
    { id: 'cap-open', effect: 'device_read', handler: 'shotOpen', phase: 'open', at: d.opens_at + 3 * MIN },
    step({ id: 'c-c', effect: 'device_write', budgetKey: 'crowd', handler: 'crowdCOpen', at: d.opens_at + 4 * MIN }),
    step({ id: 'c-d', budgetKey: 'crowd', handler: 'crowdDOpen', at: d.opens_at + 10 * MIN }),
    { id: 'cap-remote', effect: 'device_read', handler: 'shotRemote', phase: 'open', at: d.opens_at + 10.5 * MIN },
    step({ id: 'of-a', budgetKey: 'official', handler: 'officialAFinal', phase: 'final_arguments', at: d.final_arguments_at + 0.5 * MIN }),
    step({ id: 'of-b', budgetKey: 'official', handler: 'officialBFinal', phase: 'final_arguments', at: d.final_arguments_at + 0.5 * MIN }),
    { id: 'cap-final', effect: 'device_read', handler: 'shotFinal', phase: 'final_arguments', at: d.final_arguments_at + 1.5 * MIN },
    step({ id: 'cf-c', effect: 'device_write', budgetKey: 'crowd', handler: 'crowdCFinal', phase: 'final_arguments', at: d.final_arguments_at + 2.5 * MIN }),
    step({ id: 'cf-d', budgetKey: 'crowd', handler: 'crowdDFinal', phase: 'final_arguments', at: d.final_arguments_at + 3.5 * MIN }),
    { id: 'cap-judging', effect: 'device_read', handler: 'shotJudging', phase: 'judging', at: d.judging_at + 0.5 * MIN },
    step({ id: 'b-c', effect: 'device_write', budgetKey: 'ballot', handler: 'ballotC', phase: 'judging', at: d.judging_at + MIN }),
    step({ id: 'b-d', budgetKey: 'ballot', handler: 'ballotD', phase: 'judging', at: d.judging_at + MIN }),
    step({ id: 'b-dd', budgetKey: 'ballot', handler: 'ballotDDup', phase: 'judging', at: d.judging_at + 2 * MIN, expect: 'rejected', expectCode: 'already_judged' }),
    step({ id: 'b-cd', effect: 'device_write', budgetKey: 'ballot', handler: 'ballotCDup', phase: 'judging', at: d.judging_at + 3 * MIN, expect: 'rejected', expectCode: 'already_judged' }),
    step({ id: 'settle', budgetKey: 'settle', handler: 'settleFirst', phase: 'closed', at: d.closes_at + 0.1 * MIN }),
    step({ id: 'settle-2', budgetKey: 'settle', handler: 'settleReplay', phase: 'closed', at: d.closes_at + 0.3 * MIN }),
    { id: 'cap-verdict', effect: 'device_read', handler: 'shotVerdict', phase: 'closed', at: d.closes_at + MIN },
    { id: 'cap-reentry', effect: 'device_read', handler: 'shotReentry', phase: 'closed', at: d.closes_at + 3 * MIN },
    { id: 'inspect', effect: 'read', handler: 'inspectFinal', phase: 'closed', at: d.closes_at + 5 * MIN },
  ];
  const armed = await scheduler.arm(accept(), steps);
  assert.equal(armed.activated, true, armed.reason);

  const out = await runAutonomous({
    scheduler,
    now: () => clock,
    sleep: async () => { clock += 30 * 1000; }, // poll every simulated 30 s
    pollMs: 30 * 1000,
    stopAt: d.closes_at + 40 * MIN,
  });


  assert.equal(out.terminal, TERMINAL.COMPLETED, `aborted: ${scheduler.status().abortReason}`);
  assert.equal(calls.length, names.length, 'every step executed exactly once');

  // Phase discipline: each write happened inside its declared window.
  const byName = Object.fromEntries(calls.map((c) => [c.name, c.at]));
  assert.ok(byName.officialAOpen < d.final_arguments_at - WRITE_MARGIN_MS, 'OPEN writes before FINAL');
  assert.ok(byName.officialAFinal >= d.final_arguments_at, 'FINAL writes after FINAL opens');
  assert.ok(byName.officialAFinal < d.judging_at - WRITE_MARGIN_MS, 'FINAL writes end before JUDGING');
  assert.ok(byName.ballotC >= d.judging_at, 'ballots after JUDGING opens');
  assert.ok(byName.ballotC < d.closes_at - WRITE_MARGIN_MS, 'ballots end before close');
  assert.ok(byName.settleFirst >= d.closes_at, 'settlement only after close');

  // Budgets consumed exactly to their approved limits, never beyond.
  const spent = scheduler.status().spent;
  assert.equal(spent.crowd, 4);
  assert.equal(spent.official, 4);
  assert.equal(spent.ballot, 2, 'duplicate ballots spend nothing');
  assert.equal(spent.settle, 2);
  assert.equal(spent.spectator, 2);

  // Negative assertions were recorded as passes, not failures.
  assert.equal(journal.filter((e) => e.outcome === 'expected_rejection').length, 2);
  assert.equal(journal.filter((e) => e.outcome === 'failed').length, 0);
  assert.equal(journal.filter((e) => e.outcome === 'blocked').length, 0);
});
