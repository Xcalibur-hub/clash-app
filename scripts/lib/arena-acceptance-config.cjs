const assert = require('node:assert/strict');
const { buildSchedule, validateBudget, validateDemand, countDemand, countAttempts, verifyAuthorization, EFFECTS } = require('./arena-acceptance-scheduler.cjs');

const MIN = 60 * 1000;

/**
 * Load a schedule configuration file into scheduler-ready inputs.
 *
 * The loader is intentionally strict: it validates the same invariants the
 * scheduler enforces, so a malformed or over-reaching example fails here rather
 * than mid-run. It performs no I/O; the caller supplies already-parsed JSON.
 */
function loadScheduleConfig(config, deadlines) {
  assert.ok(config && typeof config === 'object', 'configuration object required');
  assert.ok(deadlines && Number.isFinite(deadlines.opens_at), 'server deadlines required');
  assert.ok(Array.isArray(config.steps) && config.steps.length > 0, 'configuration must declare steps');

  const authorization = config.authorization;
  const authCheck = verifyAuthorization(authorization, deadlines.opens_at - 1);
  const approvedBudget = authorization?.budget ? validateBudget(authorization.budget) : null;

  const steps = config.steps.map((step, index) => {
    assert.ok(Number.isFinite(step.offsetMin) && step.offsetMin >= 0, `step ${index} needs a non-negative offsetMin`);
    assert.ok(Object.prototype.hasOwnProperty.call(EFFECTS, step.effect), `step ${index} has an unknown effect: ${step.effect}`);
    return {
      ...step,
      at: deadlines.opens_at + step.offsetMin * MIN,
    };
  });

  const schedule = buildSchedule(steps, { approvedBudget });
  // 5C-1 / consolidated fix: demand is ALWAYS computed from the schedule, and it
  // is ALWAYS checked against an approval when one exists. A configuration with no
  // approved budget previously reported `demand: {}` — silently claiming zero
  // mutating actions and skipping validation entirely. That was fail-open.
  const demand = countDemand(schedule);
  const attempts = countAttempts(schedule);
  const attemptCaps = authorization?.attemptCaps ?? null;
  if (approvedBudget) {
    validateDemand(schedule, approvedBudget, attemptCaps);
  } else if (Object.keys(demand).length > 0) {
    // Steps mutate but nothing authorizes them: the plan is not loadable for a run.
    return {
      mode: 'dry-run',
      authorization,
      authorizationUsable: false,
      authorizationReason: 'missing_budget',
      budget: null,
      demand,
      attempts,
      attemptCaps,
      schedule,
      loadable: false,
    };
  }

  return {
    mode: 'dry-run',
    authorization,
    authorizationUsable: authCheck.ok,
    authorizationReason: authCheck.reason,
    budget: approvedBudget,
    demand,
    attempts,
    attemptCaps,
    schedule,
    loadable: true,
  };
}

/**
 * A configuration is only live-capable when it carries a real approval AND every
 * mutating step has a handler. The example ships `approved: false`.
 */
function isLiveCapable(config) {
  if (!config?.authorization || config.authorization.approved !== true) return false;
  return config.steps.every((s) => {
    const mutating = EFFECTS[s.effect]?.mutating === true;
    return !mutating || (typeof s.handler === 'string' && s.handler.length > 0);
  });
}

module.exports = { loadScheduleConfig, isLiveCapable };
