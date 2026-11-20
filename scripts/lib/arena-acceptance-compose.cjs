const assert = require('node:assert/strict');

const { createControllerSession, CONTROLLER_COMMAND_CLASS } = require('./arena-acceptance-process.cjs');
const { createControllerAdapter, createDeviceAdapter } = require('./arena-acceptance-adapters.cjs');
const { createRunner } = require('./arena-acceptance-runner.cjs');

/**
 * Composition only: joins the existing process session, adapters and runner.
 *
 * This module adds NO scheduling, authorization, budgeting or journaling logic. It
 * builds a handler map keyed by controller command, validates that map against the
 * commands actually scheduled, and hands everything to `createRunner`, which owns
 * the signed gate, budgets, attempt caps and durable journal.
 *
 * Consequences of the binding it enforces:
 *  - an unhandled scheduled command refuses to compose (never silently skipped);
 *  - a command classified `auth` (load-recover) cannot be wired without an explicit
 *    opt-in, so startup cannot accidentally trigger credential recovery;
 *  - `broadcast` stays denied: it is absent from the acceptance plan by design.
 */

/** Commands that perform Auth/credential work and must be opted into explicitly. */
const AUTH_COMMANDS = Object.freeze(['load-recover']);

/** Commands never wired by this composition, with the reason recorded. */
const DENIED = Object.freeze({
  broadcast: 'not required for acceptance; kept denied rather than added to match counts',
});

/**
 * Effect classification for scheduling purposes.
 *
 * `close-actors` closes actor sessions and drops credentials: it is a MUTATION of
 * private session state, not a read, so it carries the mutation effect and a budget.
 */
const STEP_EFFECT = Object.freeze({
  preflight: { effect: 'read' },
  status: { effect: 'read' },
  snapshot: { effect: 'read' },
  'load-recover': { effect: 'api_write', budgetKey: 'authRecovery' },
  create: { effect: 'api_write', budgetKey: 'fixture' },
  accept: { effect: 'api_write', budgetKey: 'fixture' },
  gateway: { effect: 'api_write', budgetKey: 'gateway' },
  'official-A-OPEN': { effect: 'api_write', budgetKey: 'official' },
  'official-B-OPEN': { effect: 'api_write', budgetKey: 'official' },
  'official-A-FINAL': { effect: 'api_write', budgetKey: 'official' },
  'official-B-FINAL': { effect: 'api_write', budgetKey: 'official' },
  'crowd-D-OPEN': { effect: 'api_write', budgetKey: 'crowd' },
  'crowd-D-FINAL': { effect: 'api_write', budgetKey: 'crowd' },
  'watch-D': { effect: 'api_write', budgetKey: 'spectator' },
  'ballot-D': { effect: 'api_write', budgetKey: 'ballot' },
  'settle-first': { effect: 'api_write', budgetKey: 'settle' },
  'settle-idempotency': { effect: 'api_write', budgetKey: 'settle' },
  'close-actors': { effect: 'api_write', budgetKey: 'closeActors' },
});

/** Native device steps are separate from controller commands. */
const DEVICE_STEPS = Object.freeze({
  'device:watch-c': { effect: 'device_write', budgetKey: 'spectator' },
  'device:crowd-c-open': { effect: 'device_write', budgetKey: 'crowd' },
  'device:crowd-c-final': { effect: 'device_write', budgetKey: 'crowd' },
  'device:ballot-c': { effect: 'device_write', budgetKey: 'ballot' },
  'device:capture': { effect: 'device_read' },
});

/**
 * Build the complete handler map.
 *
 * @param {object} options
 * @param {object} options.session                from createControllerSession
 * @param {object} [options.device]               from createDeviceAdapter
 * @param {object} [options.taps]                 map of device step name -> {x, y}
 * @param {boolean} [options.allowAuthCommands]   must be true to wire load-recover
 */
function buildHandlers({ session, device = null, taps = null, allowAuthCommands = false } = {}) {
  assert.ok(session && typeof session.spawn === 'function', 'a controller session is required');
  const controller = createControllerAdapter({ spawn: session.spawn });
  const handlers = {};

  for (const [command, spec] of Object.entries(STEP_EFFECT)) {
    if (DENIED[command]) continue;
    if (AUTH_COMMANDS.includes(command) && allowAuthCommands !== true) continue;
    if (!Object.prototype.hasOwnProperty.call(CONTROLLER_COMMAND_CLASS, command)) continue;
    handlers[command] = spec.effect === 'read'
      ? controller.read(command)
      : controller.apiWrite(command);
  }

  if (device) {
    // Coordinates come from a live screenshot; a device step without them is not wired.
    for (const [name, coords] of Object.entries(taps ?? {})) {
      if (!Object.prototype.hasOwnProperty.call(DEVICE_STEPS, name)) continue;
      if (DEVICE_STEPS[name].effect !== 'device_write') continue;
      assert.ok(Number.isInteger(coords?.x) && Number.isInteger(coords?.y), `tap ${name} needs integer x/y`);
      handlers[name] = device.tap(coords.x, coords.y);
    }
    handlers['device:capture'] = device.capture('capture');
  }
  return handlers;
}

/**
 * Validate that every handler a schedule names exists and matches its declared effect.
 * Refuses on a missing handler rather than letting the run abort mid-window.
 */
function validateCoverage(schedule, handlers) {
  const missing = [];
  const mismatched = [];
  for (const step of schedule) {
    if (!step.handler) continue;
    const handler = handlers[step.handler];
    if (typeof handler !== 'function') { missing.push(step.handler); continue; }
    if (handler.effect !== step.effect) mismatched.push(`${step.handler}: ${handler.effect} != ${step.effect}`);
  }
  if (missing.length) throw new Error(`schedule references unhandled steps: ${[...new Set(missing)].join(', ')}`);
  if (mismatched.length) throw new Error(`handler effect mismatch: ${mismatched.join('; ')}`);
  return { steps: schedule.length };
}

/**
 * Compose a runner around a controller session.
 *
 * The runner owns authorization, budgets, attempt caps and the durable journal; this
 * function only supplies the handler map and validates coverage before arming.
 */
function composeRunner(options = {}) {
  const {
    session,
    device = null,
    taps = null,
    allowAuthCommands = false,
    schedule = null,
    ...runnerOptions
  } = options;

  const handlers = buildHandlers({ session, device, taps, allowAuthCommands });
  if (schedule) validateCoverage(schedule, handlers);

  const runner = createRunner({ ...runnerOptions, handlers });
  return {
    runner,
    handlers,
    /** Commands deliberately absent, with the reason. */
    denied: { ...DENIED },
    /** Handler names present in this composition. */
    wired: Object.keys(handlers).sort(),
  };
}

/** A startup-only preflight plan: no fixture, no Auth, no device. */
function startupPreflightSteps(deadlines) {
  assert.ok(deadlines && Number.isFinite(deadlines.opens_at), 'deadlines required');
  const at = deadlines.opens_at;
  return [
    { id: 'preflight', effect: 'read', phase: 'open', handler: 'preflight', at },
    { id: 'status', effect: 'read', phase: 'open', handler: 'status', at },
    { id: 'snapshot', effect: 'read', phase: 'open', handler: 'snapshot', at },
  ];
}

module.exports = {
  AUTH_COMMANDS,
  DENIED,
  STEP_EFFECT,
  DEVICE_STEPS,
  buildHandlers,
  validateCoverage,
  composeRunner,
  startupPreflightSteps,
};
