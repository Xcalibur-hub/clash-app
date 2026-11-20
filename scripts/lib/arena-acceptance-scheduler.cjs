const assert = require('node:assert/strict');
const crypto = require('node:crypto');

/**
 * Deterministic Arena acceptance scheduler — hardened (Phase 5B + 5C).
 *
 * Pure orchestration: no HTTP, database, Auth, gateway, ADB or filesystem access
 * lives here. Every effect is an injected handler, every decision reads an
 * injected clock, every outcome appends to an injected journal sink.
 *
 * Security invariants
 *  F1  side effects are classified by EFFECT, never by free-text `kind`
 *  F2  authorization expiry is rechecked immediately before every side effect
 *  F3  effective allowances can only ever lower the owner-approved budget
 *  F4  every mutating action must name an approved budget category
 *  F5  a `started` action with unknown result blocks the run; never replayed
 *  F6  an autonomous runner drives execution without external ticks
 *  F7  negative assertions must match the explicitly expected rejection
 *  5C-1 scheduled mutating attempts must fit the approved allowance at arm time
 *  5C-2 restart recovery rebuilds budgets from the journal and fails closed
 *  5C-3 a Promise timeout does not cancel the operation: outcome is UNCERTAIN
 *  5C-4 declared effects must be honoured by the handler contract
 *  5C-5 a planning digest is NOT authorization; live arming needs a trusted gate
 */

const MS = { second: 1000, minute: 60 * 1000 };

const PHASE_PLAN = Object.freeze({ openMin: 20, finalMin: 5, judgingMin: 5 });
const WRITE_MARGIN_MS = 10 * 1000;
const DEFAULT_STEP_TIMEOUT_MS = 30 * 1000;

const TERMINAL = Object.freeze({
  COMPLETED: 'completed',
  ABORTED: 'aborted',
  EXPIRED: 'expired',
  REFUSED: 'refused',
  BLOCKED: 'blocked',
});

/** Effect taxonomy. `mutating` governs both phase restriction and budget accounting. */
const EFFECTS = Object.freeze({
  read: Object.freeze({ mutating: false, device: false }),
  device_read: Object.freeze({ mutating: false, device: true }),
  api_write: Object.freeze({ mutating: true, device: false }),
  device_write: Object.freeze({ mutating: true, device: true }),
});

/**
 * A negative assertion (expected rejection) does not consume its category: the
 * server refuses it, so no authorized quantity is spent.
 */
const SPENDS_BUDGET = Object.freeze(['ok']);

const SETTLED = Object.freeze(['ok', 'expected_rejection', 'skipped']);
const UNCERTAIN = Object.freeze(['started', 'timeout']);

function isMutating(effect) {
  return EFFECTS[effect]?.mutating === true;
}

function deriveDeadlines(accept) {
  assert.ok(accept && typeof accept === 'object', 'ACCEPT response required');
  const { opens_at: opens, final_arguments_at: finalAt, judging_at: judgingAt, closes_at: closesAt } = accept;
  for (const [name, v] of Object.entries({ opens_at: opens, final_arguments_at: finalAt, judging_at: judgingAt, closes_at: closesAt })) {
    assert.ok(Number.isFinite(v), `${name} must be a finite epoch ms`);
  }
  assert.ok(finalAt > opens, 'final_arguments_at must be after opens_at');
  assert.ok(judgingAt > finalAt, 'judging_at must be after final_arguments_at');
  assert.ok(closesAt > judgingAt, 'closes_at must be after judging_at');
  const tol = 2 * MS.second;
  assert.ok(Math.abs((finalAt - opens) - PHASE_PLAN.openMin * MS.minute) <= tol, 'OPEN duration mismatch');
  assert.ok(Math.abs((judgingAt - finalAt) - PHASE_PLAN.finalMin * MS.minute) <= tol, 'FINAL duration mismatch');
  assert.ok(Math.abs((closesAt - judgingAt) - PHASE_PLAN.judgingMin * MS.minute) <= tol, 'JUDGING duration mismatch');
  return Object.freeze({ opens_at: opens, final_arguments_at: finalAt, judging_at: judgingAt, closes_at: closesAt });
}

function phaseAt(deadlines, now) {
  if (now < deadlines.opens_at) return 'before_open';
  if (now < deadlines.final_arguments_at) return 'open';
  if (now < deadlines.judging_at) return 'final_arguments';
  if (now < deadlines.closes_at) return 'judging';
  return 'closed';
}

function guardStep(step, deadlines, now) {
  const phase = phaseAt(deadlines, now);
  const effect = EFFECTS[step.effect];
  if (!effect) return { allowed: false, reason: 'unknown_effect', phase };
  if (now < deadlines.opens_at) return { allowed: false, reason: 'before_open', phase };
  if (!effect.mutating) return { allowed: true, reason: 'read_only', phase };

  if (step.phase === 'closed') {
    return phase === 'closed'
      ? { allowed: true, reason: 'post_close_window', phase }
      : { allowed: false, reason: 'wrong_phase', phase };
  }
  const limit = step.phase === 'judging' ? deadlines.closes_at
    : step.phase === 'final_arguments' ? deadlines.judging_at
      : deadlines.final_arguments_at;
  if (now >= limit - WRITE_MARGIN_MS) return { allowed: false, reason: 'phase_deadline_margin', phase };
  if (phase !== step.phase) return { allowed: false, reason: 'wrong_phase', phase };
  return { allowed: true, reason: 'within_window', phase };
}

const guardWrite = guardStep;

function buildSchedule(steps, options = {}) {
  const { approvedBudget = null } = options;
  assert.ok(Array.isArray(steps) && steps.length > 0, 'steps required');
  const seen = new Set();
  const out = steps.map((s, index) => {
    assert.ok(typeof s.id === 'string' && s.id, `step ${index} needs an id`);
    assert.ok(!seen.has(s.id), `duplicate step id: ${s.id}`);
    seen.add(s.id);
    assert.ok(Object.prototype.hasOwnProperty.call(EFFECTS, s.effect), `step ${s.id} must declare a known effect`);
    assert.ok(Number.isFinite(s.at), `step ${s.id} needs a finite due time`);
    assert.ok(['open', 'final_arguments', 'judging', 'closed'].includes(s.phase), `step ${s.id} has unknown phase`);
    if (isMutating(s.effect)) {
      assert.ok(typeof s.budgetKey === 'string' && s.budgetKey, `mutating step ${s.id} must name a budget category`);
      if (approvedBudget) {
        assert.ok(Object.prototype.hasOwnProperty.call(approvedBudget, s.budgetKey), `step ${s.id} uses unbudgeted category ${s.budgetKey}`);
      }
      assert.ok(typeof s.handler === 'string' && s.handler, `mutating step ${s.id} must name a handler`);
    }
    if (s.expect === 'rejected') {
      assert.ok(typeof s.expectCode === 'string' && s.expectCode, `negative step ${s.id} must name expectCode`);
    }
    return Object.freeze({ ...s, index });
  });
  for (let i = 1; i < out.length; i += 1) {
    assert.ok(out[i].at >= out[i - 1].at, `step ${out[i].id} is scheduled before ${out[i - 1].id}`);
  }
  return Object.freeze(out);
}

function validateBudget(budget) {
  assert.ok(budget && typeof budget === 'object', 'action budget required');
  const out = {};
  for (const [name, cap] of Object.entries(budget)) {
    assert.ok(Number.isSafeInteger(cap) && cap >= 0, `budget ${name} must be a non-negative safe integer`);
    out[name] = cap;
  }
  assert.ok(Object.keys(out).length > 0, 'budget must declare at least one category');
  return Object.freeze(out);
}

/** Count scheduled spending actions per budget category. */
function countDemand(schedule) {
  const demand = {};
  for (const s of schedule) {
    if (!isMutating(s.effect)) continue;
    // A negative assertion is refused by the server and spends nothing.
    if (s.expect === 'rejected') continue;
    demand[s.budgetKey] = (demand[s.budgetKey] ?? 0) + 1;
  }
  return Object.freeze(demand);
}

/**
 * Count scheduled request attempts per category.
 *
 * Attempts differ from successes: a duplicate ballot is a REQUEST against the
 * server even though the server refuses it and nothing is spent. Without a
 * separate attempt allowance, a plan could fire unlimited duplicate ballots.
 */
function countAttempts(schedule) {
  const attempts = {};
  for (const s of schedule) {
    if (!isMutating(s.effect)) continue;
    attempts[s.budgetKey] = (attempts[s.budgetKey] ?? 0) + 1;
  }
  return Object.freeze(attempts);
}

/** 5C-1: total scheduled mutating attempts must fit every approved category. */
function validateDemand(schedule, budget, attemptCaps = null) {
  const demand = countDemand(schedule);
  const over = [];
  for (const [key, count] of Object.entries(demand)) {
    const cap = budget[key];
    if (cap === undefined) over.push(`${key}: ${count} scheduled, no approval`);
    else if (count > cap) over.push(`${key}: ${count} scheduled, ${cap} approved`);
  }
  // Request attempts (including expected rejections) need their own explicit cap.
  // A category that schedules more requests than it may spend MUST declare a cap;
  // otherwise duplicate ballots could be hammered without limit.
  const attempts = countAttempts(schedule);
  for (const [key, count] of Object.entries(attempts)) {
    const cap = attemptCaps ? attemptCaps[key] : undefined;
    const spendAllowance = budget[key] ?? 0;
    if (cap === undefined) {
      if (count > spendAllowance) over.push(`${key}: ${count} attempts, no attempt cap`);
    } else if (count > cap) {
      over.push(`${key}: ${count} attempts, ${cap} attempt cap`);
    }
  }
  if (over.length) throw new Error(`schedule exceeds approved budget — ${over.join('; ')}`);
  return Object.freeze({ demand, attempts: countAttempts(schedule) });
}

/** Validate an explicit per-category request-attempt allowance. */
function validateAttemptCaps(caps) {
  if (caps === null || caps === undefined) return null;
  assert.ok(typeof caps === 'object' && !Array.isArray(caps), 'attemptCaps must be an object');
  const out = {};
  for (const [name, cap] of Object.entries(caps)) {
    assert.ok(Number.isSafeInteger(cap) && cap >= 0, `attemptCap ${name} must be a non-negative safe integer`);
    out[name] = cap;
  }
  return Object.freeze(out);
}

/** F3: a configuration budget may only LOWER the owner-approved allowance. */
function clampBudget(authorized, requested) {
  if (!requested) return authorized;
  validateBudget(requested);
  const out = {};
  for (const [name, cap] of Object.entries(authorized)) {
    const want = requested[name];
    out[name] = typeof want === 'number' ? Math.min(cap, want) : cap;
  }
  for (const name of Object.keys(requested)) {
    if (!Object.prototype.hasOwnProperty.call(authorized, name)) {
      throw new Error(`budget override introduces unauthorized category: ${name}`);
    }
  }
  return Object.freeze(out);
}

/**
 * 5C-5: a planning digest describes a plan. It is NOT approval.
 * The digest deliberately excludes expiry-dependent state so it can be quoted
 * in an approval artifact without changing on every reload.
 */
function planDigest({ manifestHash, steps, authorization: auth, deadlines }) {
  const canonical = JSON.stringify({
    manifestHash,
    authorization: {
      approved: auth?.approved === true,
      manifestHash: auth?.manifestHash,
      budget: auth?.budget ?? null,
    },
    deadlines: deadlines ?? null,
    steps: (steps ?? []).map((s) => ({
      id: s.id, effect: s.effect, at: s.at, phase: s.phase,
      budgetKey: s.budgetKey ?? null, handler: s.handler ?? null,
      expect: s.expect ?? null, expectCode: s.expectCode ?? null,
      timeoutMs: s.timeoutMs ?? null,
    })),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function verifyAuthorization(auth, now) {
  if (!auth || typeof auth !== 'object') return { ok: false, reason: 'missing_authorization' };
  if (auth.approved !== true) return { ok: false, reason: 'not_approved' };
  if (typeof auth.manifestHash !== 'string' || !/^[a-f0-9]{64}$/.test(auth.manifestHash)) {
    return { ok: false, reason: 'invalid_manifest_hash' };
  }
  if (!Number.isFinite(auth.expiresAt)) return { ok: false, reason: 'missing_expiry' };
  if (now >= auth.expiresAt) return { ok: false, reason: 'authorization_expired' };
  if (!auth.budget || typeof auth.budget !== 'object') return { ok: false, reason: 'missing_budget' };
  return { ok: true, reason: 'authorized', budget: validateBudget(auth.budget), manifestHash: auth.manifestHash };
}

function withTimeout(promise, ms, onTimeout) {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(onTimeout), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 5C-4: validate that an injected handler honours the effect it claims.
 * A handler must declare `effect`; `read`/`device_read` may not perform side
 * effects, and mutating handlers must document a reconciliation contract.
 */
function assertHandlerContract(name, handler) {
  assert.equal(typeof handler, 'function', `handler ${name} must be a function`);
  assert.ok(Object.prototype.hasOwnProperty.call(EFFECTS, handler.effect), `handler ${name} must declare a known effect`);
  if (!EFFECTS[handler.effect].mutating) {
    assert.notEqual(handler.sideEffects, true, `handler ${name} is declared read-only but performs side effects`);
  } else {
    // A reconciliation CLAIM is only valid when a mechanism is actually supplied.
    // Declaring `reconciles: true` with no callable reconciler is a false claim and
    // would let a timed-out write be treated as benign.
    if (handler.reconciles === true) {
      assert.equal(typeof handler.reconcile, 'function',
        `handler ${name} claims reconciles:true without a reconcile() mechanism`);
    }
  }
  return handler.effect;
}

function createScheduler(options = {}) {
  const {
    now,
    serverNow = null,
    authorization = null,
    handlers = null,
    journal = () => {},
    budget = null,
    maxClockDriftMs = 5 * MS.second,
    health = null,
    stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS,
    approvalGate = null,
  } = options;

  assert.ok(typeof now === 'function', 'an injected clock is required');

  const mode = handlers ? 'live' : 'dry-run';
  const outcomes = new Map();
  const spent = {};
  let terminal = null;
  let armed = false;
  let deadlines = null;
  let schedule = null;
  let abortReason = null;
  let effectiveBudget = null;
  let boundDigest = null;
  let inFlight = false;
  let demand = null;
  let armedLateStart = false;

  function record(entry) {
    const frozen = Object.freeze({ mode, at: now(), ...entry });
    const written = journal(frozen);
    // A journal that explicitly reports failure is a safety failure: no further
    // side effect may proceed without a durable record of what already happened.
    if (written === false) {
      if (!terminal) {
        terminal = TERMINAL.BLOCKED;
        abortReason = 'journal_write_failed';
      }
    }
    return written !== false;
  }

  function refuse(reason) {
    terminal = TERMINAL.REFUSED;
    abortReason = reason;
    record({ stepId: null, outcome: 'refused', reason });
    return { activated: false, reason, terminal };
  }

  function stop(state, reason, stepId = null, extra = {}) {
    if (terminal) return terminal;
    terminal = state;
    abortReason = reason;
    record({ stepId, outcome: state, reason, ...extra });
    return terminal;
  }

  function capFor(key) {
    return effectiveBudget && Object.prototype.hasOwnProperty.call(effectiveBudget, key) ? effectiveBudget[key] : undefined;
  }

  async function arm(accept, steps) {
    if (armed) return { activated: false, reason: 'already_armed' };
    if (terminal) return { activated: false, reason: 'already_terminal', terminal };

    const auth = verifyAuthorization(authorization, now());
    if (!auth.ok) return refuse(auth.reason);

    // The approval gate is consulted AFTER the plan digest exists (see finishArm),
    // so the artifact can bind the actual computed plan rather than a placeholder.
    if (mode === 'live' && typeof approvalGate !== 'function') return refuse('missing_approval_gate');

    let derived;
    try {
      derived = deriveDeadlines(accept);
    } catch (error) {
      return refuse(`invalid_deadlines: ${error.message}`);
    }
    // Arming before OPEN is the normal case. Arming AFTER it opened is allowed only
    // when the plan still fits inside the server's windows — never by moving a clock
    // or extending a phase. The decision is deferred until the schedule is built so
    // the remaining steps can be measured against real boundaries.

    if (serverNow) {
      const server = await serverNow();
      if (!Number.isFinite(server)) return refuse('server_clock_unreadable');
      if (Math.abs(server - now()) > maxClockDriftMs) return refuse('server_clock_mismatch');
    }

    let clamped;
    let built;
    let validatedDemand;
    try {
      clamped = clampBudget(auth.budget, budget);
      built = buildSchedule(steps, { approvedBudget: clamped });
      validatedDemand = validateDemand(built, clamped, authorization?.attemptCaps ?? null);
    } catch (error) {
      return refuse(`invalid_configuration: ${error.message}`);
    }

    if (mode === 'live') {
      for (const s of built) {
        const name = s.handler;
        try {
          if (typeof name === 'string' && name) {
            assertHandlerContract(name, handlers[name]);
          } else {
            assertHandlerContract('__default', handlers.__default);
          }
        } catch (error) {
          return refuse(`invalid_handler: ${error.message}`);
        }
      }
    }

    if (authorization.expiresAt <= derived.opens_at) return refuse('authorization_expires_before_open');

    // Mid-window arming (after OPEN already started). Permitted only when every
    // remaining mutating step still fits inside its own server window and the
    // authorization outlives the plan. Clocks and phases are never adjusted.
    if (now() >= derived.opens_at) {
      const nowMs = now();
      if (nowMs >= derived.closes_at) return refuse('window_closed');

      const pending = built.filter((s) => s.at >= nowMs);
      if (pending.length === 0) return refuse('window_closed');

      const lastDue = pending[pending.length - 1].at;
      for (const step of pending) {
        if (!isMutating(step.effect)) continue;
        const limit = step.phase === 'final_arguments' ? derived.judging_at
          : step.phase === 'judging' ? derived.closes_at
            : step.phase === 'closed' ? Infinity
              : derived.final_arguments_at;
        if (step.at >= limit - WRITE_MARGIN_MS) return refuse(`insufficient_window: ${step.id}`);
      }
      if (!(authorization.expiresAt > lastDue)) return refuse('authorization_expires_before_plan_end');
      armedLateStart = true;
    }

    return await finishArm({ derived, built, clamped, validatedDemand, auth });
  }

  /** Freeze the run: digest, gate verification, budgets, deadlines and the armed record. */
  async function finishArm({ derived, built, clamped, validatedDemand, auth }) {
    const digest = planDigest({ manifestHash: auth.manifestHash, steps: built, authorization, deadlines: derived });

    // The artifact must bind the plan that will actually execute.
    if (mode === 'live') {
      let gate;
      try {
        gate = await approvalGate({ manifestHash: auth.manifestHash, planDigest: digest, now: now() });
      } catch {
        return refuse('approval_gate_error');
      }
      if (!gate || gate.ok !== true) return refuse(gate?.reason ?? 'approval_gate_refused');
      // The executed plan must never exceed what the artifact signed.
      const signed = gate.artifact ?? null;
      if (!signed) return refuse('artifact_missing');
      if (signed.runId !== authorization?.runId && authorization?.runId) return refuse('artifact_run_mismatch');
      for (const [name, cap] of Object.entries(clamped)) {
        const signedCap = signed.budget?.[name];
        if (signedCap !== undefined && cap > signedCap) return refuse(`artifact_budget_exceeds_signed: ${name}`);
      }
      for (const [name, attempts] of Object.entries(validatedDemand.attempts ?? {})) {
        const signedCap = signed.attemptCaps?.[name];
        if (signedCap !== undefined && attempts > signedCap) return refuse(`artifact_attempts_exceed_signed: ${name}`);
      }
    }

    effectiveBudget = clamped;
    for (const name of Object.keys(clamped)) spent[name] = 0;
    deadlines = derived;
    schedule = built;
    demand = validatedDemand.demand;
    boundDigest = digest;
    armed = true;
    abortReason = null;
    record({
      stepId: null, outcome: 'armed', reason: 'authorization_verified',
      opensAt: derived.opens_at, closesAt: derived.closes_at,
      budget: clamped, demand, planDigest: boundDigest,
      lateStart: armedLateStart,
      note: 'planDigest identifies the plan; it is not an approval',
    });
    return { activated: true, mode, deadlines: derived, steps: schedule.length, budget: clamped, demand, planDigest: boundDigest, lateStart: armedLateStart };
  }

  function resolveUnknown(extraSteps = []) {
    const unknown = [...outcomes.entries()].filter(([, v]) => UNCERTAIN.includes(v.status));
    for (const id of extraSteps) if (!outcomes.has(id)) unknown.push([id, { status: 'unknown' }]);
    if (unknown.length === 0) return null;
    return stop(TERMINAL.BLOCKED, 'unknown_inflight_write', unknown[0][0], {
      requiresReconciliation: true,
      message: 'A write was in flight with an unknown result. Reconcile independently; do not replay.',
    });
  }

  async function precheck(step) {
    if (isMutating(step.effect) && now() >= authorization.expiresAt) {
      return { ok: false, state: TERMINAL.EXPIRED, reason: 'authorization_expired' };
    }
    if (serverNow && isMutating(step.effect)) {
      const server = await serverNow();
      if (!Number.isFinite(server) || Math.abs(server - now()) > maxClockDriftMs) {
        return { ok: false, state: TERMINAL.ABORTED, reason: 'server_clock_mismatch' };
      }
    }
    const guard = guardStep(step, deadlines, now());
    if (!guard.allowed) return { ok: false, state: TERMINAL.EXPIRED, reason: guard.reason };

    if (isMutating(step.effect)) {
      const cap = capFor(step.budgetKey);
      if (cap === undefined) return { ok: false, state: TERMINAL.ABORTED, reason: 'budget_category_missing' };
      // A negative assertion is refused by the server and spends nothing, so it is
      // not gated by the remaining allowance — only by having a category at all.
      if (step.expect !== 'rejected' && (spent[step.budgetKey] ?? 0) >= cap) {
        return { ok: false, state: TERMINAL.ABORTED, reason: 'budget_exhausted' };
      }
      if (health && step.requiresHealth) {
        const h = await health();
        if (!h || h.ok !== true) return { ok: false, state: TERMINAL.ABORTED, reason: h?.reason ?? 'health_check_failed' };
      }
    }
    return { ok: true };
  }

  async function runStep(step) {
    const check = await precheck(step);
    if (!check.ok) {
      stop(check.state, check.reason, step.id);
      return { id: step.id, status: 'refused', reason: check.reason };
    }

    if (mode === 'dry-run') {
      outcomes.set(step.id, { status: 'skipped', at: now() });
      record({ stepId: step.id, outcome: 'skipped', reason: 'dry_run', effect: step.effect });
      return { id: step.id, status: 'skipped' };
    }

    outcomes.set(step.id, { status: 'started', at: now() });
    record({ stepId: step.id, outcome: 'started', reason: step.phase, effect: step.effect });

    let result;
    try {
      const handler = handlers[step.handler] ?? handlers.__default;
      result = await withTimeout(
        Promise.resolve().then(() => handler(step)),
        Number.isFinite(step.timeoutMs) ? step.timeoutMs : stepTimeoutMs,
        Object.assign(new Error('step timed out'), { code: 'STEP_TIMEOUT' }),
      );
    } catch (error) {
      const code = error?.code ?? 'handler_error';
      if (code === 'STEP_TIMEOUT' && isMutating(step.effect)) {
        // 5C-3: the promise was abandoned, not cancelled. The operation may still
        // have completed server-side, so the outcome is UNCERTAIN and the run stops.
        outcomes.set(step.id, { status: 'timeout', at: now() });
        record({ stepId: step.id, outcome: 'timeout', reason: 'step_timeout', effect: step.effect, requiresReconciliation: true });
        stop(TERMINAL.BLOCKED, 'step_timeout', step.id, { requiresReconciliation: true });
        return { id: step.id, status: 'timeout', uncertain: true };
      }
      outcomes.set(step.id, { status: 'failed', at: now() });
      record({ stepId: step.id, outcome: 'failed', reason: code, effect: step.effect });
      stop(code === 'STEP_TIMEOUT' ? TERMINAL.ABORTED : TERMINAL.ABORTED, code, step.id);
      return { id: step.id, status: 'failed', reason: code };
    }

    if (step.expect === 'rejected') {
      const observed = result?.code ?? result?.reason;
      if (result?.ok !== false || observed !== step.expectCode) {
        outcomes.set(step.id, { status: 'failed', at: now() });
        record({ stepId: step.id, outcome: 'failed', reason: 'unexpected_negative_result', expected: step.expectCode, observed: observed ?? null });
        stop(TERMINAL.ABORTED, 'unexpected_negative_result', step.id);
        return { id: step.id, status: 'failed', reason: 'unexpected_negative_result' };
      }
      outcomes.set(step.id, { status: 'expected_rejection', at: now() });
      record({ stepId: step.id, outcome: 'expected_rejection', reason: step.expectCode });
      return { id: step.id, status: 'expected_rejection' };
    }

    if (result && result.ok === false) {
      outcomes.set(step.id, { status: 'failed', at: now() });
      record({ stepId: step.id, outcome: 'failed', reason: result.reason ?? 'step_refused' });
      stop(TERMINAL.ABORTED, result.reason ?? 'step_refused', step.id);
      return { id: step.id, status: 'failed' };
    }

    if (isMutating(step.effect)) spent[step.budgetKey] = (spent[step.budgetKey] ?? 0) + 1;
    outcomes.set(step.id, { status: 'ok', at: now() });
    record({ stepId: step.id, outcome: 'ok', reason: step.phase, effect: step.effect });
    return { id: step.id, status: 'ok' };
  }

  async function tick() {
    if (inFlight) return { terminal, skipped: true, reason: 'tick_in_progress' };
    if (terminal) return { terminal, skipped: true };
    if (!armed) return { terminal: null, skipped: true, reason: 'not_armed' };

    inFlight = true;
    try {
      const blocked = resolveUnknown();
      if (blocked) return { terminal: blocked, skipped: true };

      const results = [];
      for (const step of schedule) {
        if (terminal) break;
        if (now() < step.at) break;
        if (outcomes.has(step.id)) continue;
        results.push(await runStep(step));
      }
      if (!terminal && outcomes.size === schedule.length) {
        stop(TERMINAL.COMPLETED, 'schedule_finished');
      }
      return { terminal, results };
    } finally {
      inFlight = false;
    }
  }

  function interrupt(reason = 'interrupted') {
    if (terminal) return terminal;
    return stop(TERMINAL.ABORTED, reason);
  }

  /**
   * 5C-2: restart recovery is fail-closed. The journal is replayed to rebuild
   * spent budgets, and any inconsistency blocks the run.
   */
  function resume(previousJournal, { digest = null } = {}) {
    assert.ok(Array.isArray(previousJournal), 'previous journal required');
    const known = new Set((schedule ?? []).map((s) => s.id));
    const lastOutcome = new Map();
    let seenArmed = false;
    let journalDigest = null;

    for (const entry of previousJournal) {
      if (!entry || typeof entry !== 'object') return blockResume('malformed_journal_entry');
      if (!Number.isFinite(entry.at)) return blockResume('journal_missing_timestamp');
      if (typeof entry.outcome !== 'string') return blockResume('journal_missing_outcome');

      if (entry.outcome === 'armed') {
        if (seenArmed) return blockResume('duplicate_arm_record');
        seenArmed = true;
        journalDigest = entry.planDigest ?? null;
        if (entry.budget) for (const k of Object.keys(entry.budget)) spent[k] = spent[k] ?? 0;
      }
      if (!entry.stepId) continue;
      if (!known.has(entry.stepId)) return blockResume(`unknown_step: ${entry.stepId}`);
      if (entry.outcome === 'ok' && entry.effect && !isMutating(entry.effect)) {
        return blockResume(`journal_effect_mismatch: ${entry.stepId}`);
      }
      lastOutcome.set(entry.stepId, entry);
    }

    if (!seenArmed) return blockResume('journal_missing_arm_record');

    // 5C-5/5C-2: the plan must be the one this run was armed against.
    const expected = digest ?? boundDigest;
    if (!expected || journalDigest !== expected) return blockResume('plan_digest_mismatch');
    if (boundDigest && boundDigest !== expected) return blockResume('plan_digest_mismatch');

    // Rebuild consumed budget from journaled successes only.
    for (const [id, entry] of lastOutcome) {
      if (entry.outcome !== 'ok') continue;
      const step = schedule.find((s) => s.id === id);
      if (!step) return blockResume(`unknown_step: ${id}`);
      if (!isMutating(step.effect)) return blockResume(`journal_effect_mismatch: ${id}`);
      outcomes.set(id, { status: 'ok', at: entry.at });
      spent[step.budgetKey] = (spent[step.budgetKey] ?? 0) + 1;
    }

    // Records settled without spending are restored as-is.
    for (const [id, entry] of lastOutcome) {
      if (SETTLED.includes(entry.outcome) && !outcomes.has(id)) outcomes.set(id, { status: entry.outcome, at: entry.at });
    }

    // Uncertain records (started/timeout without a settled successor) block.
    const uncertain = [...lastOutcome.entries()]
      .filter(([, e]) => UNCERTAIN.includes(e.outcome))
      .map(([id]) => id);
    const blocked = resolveUnknown(uncertain);
    return { resumed: armed && !blocked, restored: outcomes.size, blocked: Boolean(blocked), terminal };
  }

  function blockResume(reason) {
    stop(TERMINAL.BLOCKED, reason, null, { requiresReconciliation: true });
    return { resumed: false, restored: outcomes.size, blocked: true, terminal, reason };
  }

  return Object.freeze({
    arm,
    tick,
    interrupt,
    resume,
    status: () => ({
      mode, armed, terminal, abortReason, deadlines,
      budget: effectiveBudget, spent: { ...spent }, demand, planDigest: boundDigest,
      completed: [...outcomes.entries()].filter(([, v]) => SETTLED.includes(v.status)).map(([k]) => k),
    }),
    PHASE_PLAN,
  });
}

/**
 * Autonomous runner (F6). Drives the scheduler on a real timer without any
 * external `tick()`. Injected clock/sleep keep it fully offline testable.
 */
async function runAutonomous(options = {}) {
  const {
    scheduler,
    now,
    sleep,
    pollMs = 1000,
    stopAt = null,
    maxIterations = 10_000,
  } = options;
  assert.ok(scheduler && typeof scheduler.tick === 'function', 'scheduler required');
  assert.ok(typeof now === 'function', 'injected clock required');
  assert.ok(typeof sleep === 'function', 'injected sleep required');

  for (let i = 0; i < maxIterations; i += 1) {
    const status = scheduler.status();
    if (status.terminal) return { terminal: status.terminal, iterations: i, reason: status.abortReason };
    if (stopAt !== null && now() >= stopAt) {
      scheduler.interrupt('clock_deadline');
      return { terminal: scheduler.status().terminal, iterations: i, reason: 'clock_deadline' };
    }
    const out = await scheduler.tick();
    if (out.terminal) return { terminal: out.terminal, iterations: i, reason: scheduler.status().abortReason };
    await sleep(pollMs);
  }
  return { terminal: scheduler.status().terminal, iterations: maxIterations, reason: 'max_iterations' };
}

module.exports = {
  createScheduler,
  runAutonomous,
  deriveDeadlines,
  buildSchedule,
  guardStep,
  guardWrite,
  phaseAt,
  verifyAuthorization,
  validateBudget,
  validateDemand,
  countDemand,
  countAttempts,
  validateAttemptCaps,
  clampBudget,
  planDigest,
  assertHandlerContract,
  isMutating,
  EFFECTS,
  SPENDS_BUDGET,
  PHASE_PLAN,
  WRITE_MARGIN_MS,
  DEFAULT_STEP_TIMEOUT_MS,
  TERMINAL,
};
