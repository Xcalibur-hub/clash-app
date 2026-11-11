const test = require('node:test');
const assert = require('node:assert/strict');
const {
  makeHandler, createControllerAdapter, createDeviceAdapter,
  createJournalAdapter, createApprovalGate,
} = require('./lib/arena-acceptance-adapters.cjs');
const { createScheduler, deriveDeadlines, PHASE_PLAN, TERMINAL } = require('./lib/arena-acceptance-scheduler.cjs');

const MIN = 60 * 1000;
const OPEN = Date.UTC(2026, 10, 6, 3, 0, 0);
const HASH = 'a'.repeat(64);
const accept = () => ({
  opens_at: OPEN,
  final_arguments_at: OPEN + PHASE_PLAN.openMin * MIN,
  judging_at: OPEN + (PHASE_PLAN.openMin + PHASE_PLAN.finalMin) * MIN,
  closes_at: OPEN + (PHASE_PLAN.openMin + PHASE_PLAN.finalMin + PHASE_PLAN.judgingMin) * MIN,
});

/* ───────────────────────────── handler contract ───────────────────────────── */

test('makeHandler tags effects and never claims reconciliation', () => {
  const r = makeHandler(async () => ({ ok: true }), 'read');
  assert.equal(r.effect, 'read');
  assert.equal(r.reconciles, undefined);
  for (const effect of ['api_write', 'device_write']) {
    const w = makeHandler(async () => ({ ok: true }), effect);
    assert.equal(w.effect, effect);
    // No reconciliation mechanism exists, so no claim may be made.
    assert.equal(w.reconciles, false, `${effect} must not claim reconciliation`);
    assert.equal(typeof w.reconcile, 'undefined');
  }
  assert.throws(() => makeHandler(async () => ({}), 'bogus'), /unknown effect/);
  assert.throws(() => makeHandler(null, 'read'), /must be a function/);
});

/* ─────────────────────────── controller adapter ───────────────────────────── */

test('controller adapter drives one command per step through the spawn seam', async () => {
  const calls = [];
  const adapter = createControllerAdapter({ spawn: async (command) => { calls.push(command); return { ok: true }; } });
  const handler = adapter.apiWrite('official-A-OPEN');
  assert.equal(handler.effect, 'api_write');
  const out = await handler({ id: 'x' });
  assert.deepEqual(calls, ['official-A-OPEN']);
  assert.equal(out.ok, true);
});

test('controller adapter surfaces a refusal as ok:false with a code', async () => {
  const adapter = createControllerAdapter({ spawn: async () => ({ ok: false, code: 'already_judged' }) });
  const out = await adapter.apiWrite('ballot-D')({});
  assert.deepEqual(out, { ok: false, code: 'already_judged' });
});

test('controller adapter rejects unsafe command tokens', async () => {
  const adapter = createControllerAdapter({ spawn: async () => ({ ok: true }) });
  await assert.rejects(() => adapter.apiWrite('rm -rf /')({}), /simple token/);
});

test('controller adapter reads are tagged read-only and not reconcilable', () => {
  const adapter = createControllerAdapter({ spawn: async () => ({ ok: true }) });
  assert.equal(adapter.read('status').effect, 'read');
  assert.equal(adapter.read('status').reconciles, undefined);
});

/* ───────────────────────────── device adapter ─────────────────────────────── */

function fakeAdb({ focused = true } = {}) {
  const calls = [];
  const adb = async (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'shell' && args[1] === 'dumpsys') {
      return focused ? 'mCurrentFocus=Window{1 u0 com.clash.v2.dev/com.clash.v2.dev.MainActivity}' : 'mCurrentFocus=Window{2 u0 com.android.launcher/Launcher}';
    }
    // screencap returns real PNG bytes
    if (args[0] === 'exec-out' && args[1] === 'screencap') return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    return '';
  };
  return { adb, calls };
}

test('device health passes when the CLASH package is focused', async () => {
  const { adb } = fakeAdb({ focused: true });
  const device = createDeviceAdapter({ adb });
  assert.deepEqual(await device.health()(), { ok: true });
});

test('device health reports not-foreground when another app is focused', async () => {
  const { adb } = fakeAdb({ focused: false });
  const device = createDeviceAdapter({ adb });
  assert.deepEqual(await device.health()(), { ok: false, reason: 'device_not_foreground' });
});

test('device health reports unreachable when adb throws', async () => {
  const device = createDeviceAdapter({ adb: async () => { throw new Error('no devices'); } });
  assert.deepEqual(await device.health()(), { ok: false, reason: 'device_unreachable' });
});

test('a device tap refuses to fire when the app is not foreground', async () => {
  const { adb, calls } = fakeAdb({ focused: false });
  const device = createDeviceAdapter({ adb });
  const out = await device.tap(540, 1200)({});
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'device_not_foreground');
  assert.ok(!calls.some((c) => c.includes('input tap')), 'no tap was issued');
});

test('a device tap issues exactly one tap when foreground', async () => {
  const { adb, calls } = fakeAdb({ focused: true });
  const device = createDeviceAdapter({ adb });
  const out = await device.tap(540, 1200)({});
  assert.equal(out.ok, true);
  assert.equal(calls.filter((c) => c.includes('input tap')).length, 1);
  assert.ok(calls.includes('shell input tap 540 1200'));
});

test('device tap requires integer coordinates', async () => {
  const { adb } = fakeAdb();
  const device = createDeviceAdapter({ adb });
  await assert.rejects(() => device.tap(1.5, 2)({}), /integers/);
});

test('device capture is a read effect and uses a safe name', async () => {
  const { adb } = fakeAdb();
  const saved = [];
  const device = createDeviceAdapter({ adb, saveCapture: async (name, bytes) => { saved.push({ name, bytes }); return `/evidence/${name}.png`; } });
  const shot = device.capture('open-c-draft');
  assert.equal(shot.effect, 'device_read');
  const out = await shot({});
  assert.equal(out.ok, true);
  assert.equal(saved.length, 1, 'the PNG bytes are persisted, not discarded');
  assert.equal(out.evidence.file, '/evidence/open-c-draft.png');
  assert.ok(out.evidence.bytes > 0);
  await assert.rejects(() => device.capture('../escape')({}), /simple token/);
});

test('a capture without a store fails rather than claiming success', async () => {
  const { adb } = fakeAdb();
  const device = createDeviceAdapter({ adb });
  const out = await device.capture('open')({});
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'capture_store_unconfigured');
});

test('an empty capture is a failure, not evidence', async () => {
  const adb = async (args) => (args[1] === 'dumpsys' ? 'mCurrentFocus=Window{1 u0 com.clash.v2.dev/.Main}' : '');
  const device = createDeviceAdapter({ adb, saveCapture: async () => '/x.png' });
  const out = await device.capture('open')({});
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'capture_empty');
});

test('a capture that was not persisted is a failure', async () => {
  const device = createDeviceAdapter({ adb: fakeAdb().adb, saveCapture: async () => null });
  const out = await device.capture('open')({});
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'capture_not_persisted');
});

/* ──────────────────────────── journal adapter ─────────────────────────────── */

test('journal appends one NDJSON line per entry', () => {
  const lines = [];
  const journal = createJournalAdapter({ append: (l) => lines.push(l) });
  journal.write({ stepId: 'a', outcome: 'started' });
  journal.write({ stepId: 'a', outcome: 'ok' });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].trim().split('\n').length, 1);
  assert.equal(JSON.parse(lines[0]).outcome, 'started');
});

test('journal records a failure instead of throwing', () => {
  const journal = createJournalAdapter({ append: () => { const e = new Error('disk'); e.code = 'ENOSPC'; throw e; } });
  assert.equal(journal.write({ stepId: 'a' }), false);
  assert.equal(journal.stats().failure, 'ENOSPC');
});

test('journal confirms a synchronous durable append without probing', () => {
  const lines = [];
  const journal = createJournalAdapter({ append: (l) => { lines.push(l); } });
  assert.equal(journal.isAsyncAppend(), false, 'no probe write by default');
  assert.equal(journal.write({ stepId: 'a', outcome: 'ok' }), true);
  assert.equal(lines.length, 1, 'exactly one durable line, written before return');
  assert.deepEqual(journal.stats(), { records: 1, failure: null });
});

test('journal async detection uses a caller-supplied probe that never persists', () => {
  const lines = [];
  const journal = createJournalAdapter({ append: (l) => { lines.push(l); } });
  assert.equal(journal.isAsyncAppend(async () => {}), true);
  assert.equal(lines.length, 0, 'the probe wrote nothing');
});

test('journal rejects an asynchronous append seam (no false durability)', () => {
  const journal = createJournalAdapter({ append: async () => {} });
  assert.equal(journal.write({ stepId: 'a', outcome: 'ok' }), false);
  assert.equal(journal.stats().failure, 'journal_append_async_unsupported');
  assert.equal(journal.stats().records, 0, 'an unresolved promise is never counted as written');
});

test('journal reports a synchronous failure and stays failed', () => {
  const journal = createJournalAdapter({ append: () => { const e = new Error('disk'); e.code = 'ENOSPC'; throw e; } });
  assert.equal(journal.write({ stepId: 'a' }), false);
  assert.equal(journal.stats().failure, 'ENOSPC');
  assert.equal(journal.write({ stepId: 'b' }), false, 'a failed journal never resumes silently');
});

/* ──────────────────────────── approval gate ───────────────────────────────── */

test('approval gate refuses a config-only claim', async () => {
  const gate = createApprovalGate({ verifier: async () => null, now: () => OPEN });
  const res = await gate({ manifestHash: HASH });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'artifact_missing');
});

test('approval gate refuses an unverified artifact', async () => {
  const gate = createApprovalGate({
    verifier: async () => ({ manifestHash: HASH, verified: false, expiresAt: OPEN + MIN }),
    now: () => OPEN,
  });
  assert.equal((await gate({ manifestHash: HASH })).reason, 'artifact_unverified');
});

test('approval gate refuses a manifest mismatch', async () => {
  const gate = createApprovalGate({
    verifier: async () => ({ manifestHash: 'b'.repeat(64), verified: true, expiresAt: OPEN + MIN }),
    now: () => OPEN,
  });
  assert.equal((await gate({ manifestHash: HASH })).reason, 'artifact_manifest_mismatch');
});

test('approval gate refuses an expired artifact', async () => {
  const gate = createApprovalGate({
    verifier: async () => ({ manifestHash: HASH, verified: true, expiresAt: OPEN - MIN }),
    now: () => OPEN,
  });
  assert.equal((await gate({ manifestHash: HASH })).reason, 'artifact_expired');
});

test('approval gate refuses a plan mismatch when the artifact pins a digest', async () => {
  const gate = createApprovalGate({
    verifier: async () => ({ manifestHash: HASH, verified: true, expiresAt: OPEN + MIN, planDigest: 'c'.repeat(64) }),
    now: () => OPEN,
  });
  assert.equal((await gate({ manifestHash: HASH, planDigest: 'd'.repeat(64) })).reason, 'artifact_plan_mismatch');
});

test('approval gate accepts a verified, matching, unexpired artifact', async () => {
  const gate = createApprovalGate({
    verifier: async () => ({ manifestHash: HASH, verified: true, expiresAt: OPEN + MIN }),
    now: () => OPEN,
  });
  const res = await gate({ manifestHash: HASH });
  assert.equal(res.ok, true);
  assert.equal(res.reason, 'artifact_verified');
});

test('approval gate refuses an artifact with NO plan digest when the scheduler pins one', async () => {
  const gate = createApprovalGate({
    verifier: async () => ({ manifestHash: HASH, verified: true, expiresAt: OPEN + MIN }),
    now: () => OPEN,
  });
  const res = await gate({ manifestHash: HASH, planDigest: 'd'.repeat(64) });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'artifact_missing_plan_digest');
});

test('approval gate accepts an artifact pinning the exact plan digest', async () => {
  const pin = 'e'.repeat(64);
  const gate = createApprovalGate({
    verifier: async () => ({ manifestHash: HASH, verified: true, expiresAt: OPEN + MIN, planDigest: pin }),
    now: () => OPEN,
  });
  const res = await gate({ manifestHash: HASH, planDigest: pin });
  assert.equal(res.ok, true);
});

test('approval gate still accepts an unpinned artifact when no digest is supplied', async () => {
  const gate = createApprovalGate({
    verifier: async () => ({ manifestHash: HASH, verified: true, expiresAt: OPEN + MIN }),
    now: () => OPEN,
  });
  assert.equal((await gate({ manifestHash: HASH })).ok, true);
});

/* ────────────────────── device foreground parsing (review #2) ─────────────── */

test('foreground parsing extracts the actual component, not a substring', () => {
  const device = createDeviceAdapter({ adb: fakeAdb().adb });
  const dump = 'mCurrentFocus=Window{9a8b7 u0 com.clash.v2.dev/com.clash.v2.dev.MainActivity}';
  assert.deepEqual(device.parseFocusedComponent(dump), { focused: 'com.clash.v2.dev/com.clash.v2.dev.MainActivity', ambiguous: false });
  assert.equal(device.isForeground(dump), true);
});

test('a different package containing the target name is NOT foreground', () => {
  const device = createDeviceAdapter({ adb: fakeAdb().adb });
  // A package merely mentioning com.clash.v2.dev must not match.
  assert.equal(device.isForeground('mCurrentFocus=Window{1 u0 com.android.chrome/com.clash.v2.dev.Web}'), false);
  assert.equal(device.isForeground('mCurrentFocus=Window{1 u0 com.evil.com.clash.v2.dev/.Main}'), false);
});

test('ambiguous or missing focus is never treated as foreground', () => {
  const device = createDeviceAdapter({ adb: fakeAdb().adb });
  const ambiguous = 'mCurrentFocus=Window{1 u0 com.a/com.a.Main}\nmCurrentFocus=Window{2 u0 com.clash.v2.dev/.Main}';
  assert.deepEqual(device.parseFocusedComponent(ambiguous), { focused: null, ambiguous: true });
  assert.equal(device.isForeground(ambiguous), false);
  assert.equal(device.isForeground(''), false);
  assert.equal(device.isForeground('mCurrentFocus=null'), false);
});

test('a tap is refused when focus is ambiguous', async () => {
  const calls = [];
  const adb = async (args) => {
    calls.push(args.join(' '));
    if (args[1] === 'dumpsys') return 'mCurrentFocus=Window{1 u0 com.a/.Main}\nmCurrentFocus=Window{2 u0 com.clash.v2.dev/.Main}';
    return '';
  };
  const device = createDeviceAdapter({ adb });
  const out = await device.tap(540, 1200)({});
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'device_not_foreground');
  assert.ok(!calls.some((c) => c.includes('input tap')));
});

/* ───────────────────── adapters inside the real scheduler ─────────────────── */

test('the real scheduler runs with adapters and gates live arming on the artifact', async () => {
  const d = deriveDeadlines(accept());
  let clock = d.opens_at - MIN;
  const adbCalls = [];
  const { adb } = fakeAdb({ focused: true });
  const evidence = [];
  const device = createDeviceAdapter({ adb, saveCapture: async (name, bytes) => { evidence.push({ name, bytes }); return `/evidence/${name}.png`; } });
  const controller = createControllerAdapter({
    spawn: async (cmd) => { adbCalls.push(cmd); return { ok: true }; },
  });
  const lines = [];
  const journalAdapter = createJournalAdapter({ append: (l) => lines.push(l) });
  // A real owner signs the plan before arming, so the artifact already pins the
  // digest. Here the digest is only known once the scheduler computes it, so the
  // fake echoes it back and returns the signed limits for the scheduler to compare.
  const approvalGate = async (args) => ({
    ok: true,
    artifact: {
      manifestHash: HASH, planDigest: args.planDigest, expiresAt: OPEN + 90 * MIN,
      budget: { official: 1, crowd: 1, ballot: 1, settle: 1, fixture: 1, spectator: 1 },
      attemptCaps: { official: 1, crowd: 1, ballot: 1 },
    },
  });

  const handlers = {
    'official-A-OPEN': controller.apiWrite('official-A-OPEN'),
    'crowd-C-OPEN': device.tap(540, 1200),
    'ballot-D': controller.apiWrite('ballot-D'),
    'shot-open': device.capture('open'),
  };

  const scheduler = createScheduler({
    now: () => clock,
    authorization: {
      approved: true, manifestHash: HASH, expiresAt: OPEN + 90 * MIN,
      budget: { official: 1, crowd: 1, ballot: 1, settle: 1, fixture: 1, spectator: 1 },
      attemptCaps: { official: 1, crowd: 1, ballot: 1 },
    },
    handlers,
    journal: (e) => journalAdapter.write(e),
    approvalGate,
  });

  const armed = await scheduler.arm(accept(), [
    { id: 'o', effect: 'api_write', budgetKey: 'official', handler: 'official-A-OPEN', phase: 'open', at: d.opens_at + MIN },
    { id: 'c', effect: 'device_write', budgetKey: 'crowd', handler: 'crowd-C-OPEN', phase: 'open', at: d.opens_at + 2 * MIN, requiresHealth: device.health() },
    { id: 'b', effect: 'api_write', budgetKey: 'ballot', handler: 'ballot-D', phase: 'judging', at: d.judging_at + MIN },
    { id: 's', effect: 'device_read', handler: 'shot-open', phase: 'closed', at: d.closes_at + MIN },
  ]);
  assert.equal(armed.activated, true, armed.reason);
  assert.match(armed.planDigest, /^[a-f0-9]{64}$/);

  clock = d.opens_at + 3 * MIN;
  await scheduler.tick();
  clock = d.judging_at + 2 * MIN;
  await scheduler.tick();
  clock = d.closes_at + 2 * MIN;
  const out = await scheduler.tick();

  assert.equal(out.terminal, TERMINAL.COMPLETED, scheduler.status().abortReason);
  assert.deepEqual(journalAdapter.stats(), { records: lines.length, failure: null });
  assert.ok(lines.length > 0, 'journal persisted every transition');
  assert.ok(adbCalls.includes('official-A-OPEN'));
  assert.ok(adbCalls.includes('ballot-D'));
});

test('the scheduler refuses live arming when the approval artifact is missing', async () => {
  const d = deriveDeadlines(accept());
  let clock = d.opens_at - MIN;
  const device = createDeviceAdapter({ adb: fakeAdb().adb });
  const gate = createApprovalGate({ verifier: async () => null, now: () => clock });
  const scheduler = createScheduler({
    now: () => clock,
    authorization: {
      approved: true, manifestHash: HASH, expiresAt: OPEN + 90 * MIN,
      budget: { crowd: 1 }, attemptCaps: { crowd: 1 },
    },
    handlers: { c: device.tap(1, 1) },
    journal: () => {},
    approvalGate: gate,
  });
  const res = await scheduler.arm(accept(), [    { id: 'c', effect: 'device_write', budgetKey: 'crowd', handler: 'c', phase: 'open', at: d.opens_at + MIN },
  ]);
  assert.equal(res.activated, false);
  assert.equal(res.reason, 'artifact_missing');
});

test('the scheduler refuses a device write when the app is backgrounded', async () => {
  const d = deriveDeadlines(accept());
  let clock = d.opens_at - MIN;
  const device = createDeviceAdapter({ adb: fakeAdb({ focused: false }).adb });
  const gate = async (args) => ({
    ok: true,
    artifact: { manifestHash: HASH, planDigest: args.planDigest, expiresAt: OPEN + 90 * MIN, budget: { crowd: 1 }, attemptCaps: { crowd: 1 } },
  });
  const scheduler = createScheduler({
    now: () => clock,
    authorization: {
      approved: true, manifestHash: HASH, expiresAt: OPEN + 90 * MIN,
      budget: { crowd: 1 }, attemptCaps: { crowd: 1 },
    },
    handlers: { c: device.tap(540, 1200) },
    journal: () => {},
    approvalGate: gate,
    health: device.health(),
  });
  await scheduler.arm(accept(), [
    { id: 'c', effect: 'device_write', budgetKey: 'crowd', handler: 'c', phase: 'open', at: d.opens_at + MIN, requiresHealth: true },
  ]);
  clock = d.opens_at + 2 * MIN;
  await scheduler.tick();
  assert.equal(scheduler.status().terminal, TERMINAL.ABORTED);
  assert.equal(scheduler.status().abortReason, 'device_not_foreground');
});
