const assert = require('node:assert/strict');

/**
 * Minimal adapters binding the Arena acceptance scheduler to the EXISTING
 * controllers. Nothing here is a second scheduler: each adapter is a thin,
 * injectable wrapper that turns one controller call into one handler.
 *
 * No adapter performs I/O on its own. Every process, filesystem and device
 * operation arrives through an injected seam, so the whole surface is testable
 * offline with mocks and inert by default.
 *
 * Effect contract (see scheduler 5C-4): every returned handler declares
 * `effect`, and mutating handlers declare `reconciles: true`.
 */

/** Wrap a function as a contract-compliant handler. */
function makeHandler(impl, effect) {
  assert.equal(typeof impl, 'function', 'handler implementation must be a function');
  assert.ok(['read', 'device_read', 'api_write', 'device_write'].includes(effect), `unknown effect: ${effect}`);
  const handler = async (step) => impl(step);
  handler.effect = effect;
  if (effect === 'api_write' || effect === 'device_write') {
    // Deliberately NO `reconciles: true`. No reconciliation mechanism exists yet,
    // and claiming one would let a timed-out write be treated as benign. Uncertain
    // writes must remain blocked until a real reconciler is implemented.
    handler.reconciles = false;
  }
  return handler;
}

/**
 * Adapter over the existing `execute-owner.cjs` controller.
 *
 * That script is not importable (no module.exports, own readline REPL), so the
 * adapter drives it as a one-command subprocess. `spawn` is injected.
 */
function createControllerAdapter({ spawn, commandTimeoutMs = 30 * 1000 } = {}) {
  assert.equal(typeof spawn, 'function', 'spawn seam required');

  function run(command) {
    return async (step) => {
      assert.match(command, /^[A-Za-z0-9-]+$/, 'controller command must be a simple token');
      const result = await spawn(command, { timeoutMs: Number.isFinite(step?.timeoutMs) ? step.timeoutMs : commandTimeoutMs });
      // A controller refusal is a response, not a transport failure.
      if (result && result.ok === false) return { ok: false, code: result.code ?? 'controller_refused' };
      return { ok: true, output: result?.output ?? null };
    };
  }

  /** API write handlers keyed by controller command. */
  function apiWrite(command) {
    return makeHandler(run(command), 'api_write');
  }

  /** Read-only controller query. */
  function read(command) {
    return makeHandler(run(command), 'read');
  }

  return { apiWrite, read, commands: () => ['official-A-OPEN', 'watch-D', 'ballot-D', 'settle-first', 'settle-idempotency'] };
}

/**
 * Adapter over the existing `device-evidence.cjs` automation.
 *
 * The controller is also a non-importable CLI with a hard-coded run directory
 * and ADB serial, so the adapter shells out through an injected `adb` seam and
 * never assumes a serial of its own.
 */
function createDeviceAdapter({ adb, packageId = 'com.clash.v2.dev', saveCapture = null } = {}) {
  assert.equal(typeof adb, 'function', 'adb seam required');
  assert.equal(typeof packageId, 'string', 'package id required');
  assert.ok(saveCapture === null || typeof saveCapture === 'function', 'saveCapture seam must be a function when supplied');

  /**
   * Resolve the focused component from a `dumpsys window` dump.
   *
   * Returns {focused: string|null, ambiguous: boolean}. Only a single
   * `mCurrentFocus=` entry naming a package/component counts; a missing entry, an
   * entry without a slash-delimited component, or more than one distinct mention
   * is ambiguous and must never be treated as foreground.
   */
  function parseFocusedComponent(dump) {
    const text = String(dump ?? '');
    const hits = [...text.matchAll(/(?:mCurrentFocus|mFocusedApp)=Window\{[^}]*?\b([A-Za-z][\w.]*\/[\w.$]+)\}/g)]
      .map((m) => m[1]);
    if (hits.length === 0) return { focused: null, ambiguous: false };
    const distinct = [...new Set(hits)];
    if (distinct.length > 1) return { focused: null, ambiguous: true };
    return { focused: distinct[0], ambiguous: false };
  }

  /** True only when the focused component's package is exactly `packageId`. */
  function isForeground(dump, pkg = packageId) {
    const { focused, ambiguous } = parseFocusedComponent(dump);
    if (ambiguous || !focused) return false;
    return focused.slice(0, focused.indexOf('/')) === pkg;
  }

  /** Foreground check used as the scheduler's health probe. */
  async function deviceForeground() {
    return isForeground(await adb(['shell', 'dumpsys', 'window']));
  }

  /** Health probe: the device must be foreground before any tap. */
  function health() {
    return async () => {
      try {
        const ok = await deviceForeground();
        return ok ? { ok: true } : { ok: false, reason: 'device_not_foreground' };
      } catch {
        return { ok: false, reason: 'device_unreachable' };
      }
    };
  }

  /** Device write: a tap or a text entry that submits content. */
  function tap(x, y) {
    return makeHandler(async () => {
      assert.ok(Number.isInteger(x) && Number.isInteger(y), 'tap coordinates must be integers');
      const ok = await deviceForeground();
      if (!ok) return { ok: false, reason: 'device_not_foreground' };
      await adb(['shell', 'input', 'tap', String(x), String(y)]);
      return { ok: true };
    }, 'device_write');
  }

  /**
   * Device read: capture a screenshot and PRESERVE the PNG bytes.
   *
   * A capture is evidence. It succeeds only when bytes were actually returned and
   * were written through the injected `saveCapture` seam; otherwise it reports a
   * failure so a missing artifact can never be mistaken for a passing check.
   */
  function capture(name) {
    return makeHandler(async () => {
      assert.match(name, /^[a-z0-9-]+$/, 'capture name must be a simple token');
      const ok = await deviceForeground();
      if (!ok) return { ok: false, reason: 'device_not_foreground' };
      const bytes = await adb(['exec-out', 'screencap', '-p'], { encoding: 'buffer' });
      if (!bytes || bytes.length === 0) return { ok: false, reason: 'capture_empty' };
      // Verify binary PNG magic header: 0x89 0x50 0x4E 0x47
      if (!Buffer.isBuffer(bytes) || bytes.length < 4 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
        return { ok: false, reason: 'capture_invalid_png' };
      }
      if (typeof saveCapture !== 'function') return { ok: false, reason: 'capture_store_unconfigured' };
      const file = await saveCapture(name, bytes);
      if (!file) return { ok: false, reason: 'capture_not_persisted' };
      return { ok: true, evidence: { name, file, bytes: bytes.length } };
    }, 'device_read');
  }

  return { health, tap, capture, parseFocusedComponent, isForeground };
}

/**
 * Persistent execution journal.
 *
 * Append-only NDJSON. The scheduler already owns step/outcome decisions; this
 * adapter only persists them. Writes are injected so tests never touch disk.
 */
/**
 * Persistent execution journal.
 *
 * The scheduler's journal interface is SYNCHRONOUS: it calls `write()` and moves
 * immediately to the side effect. Therefore `append` must be a genuinely durable
 * synchronous append (e.g. fs.appendFileSync with an open fd), never a promise.
 *
 * A promise-returning append is rejected outright: treating an unresolved write as
 * completed would let a mutation proceed with no durable record.
 */
function createJournalAdapter({ append } = {}) {
  assert.equal(typeof append, 'function', 'append seam required');

  let records = 0;
  let failure = null;

  /**
   * Inspect the seam's return shape WITHOUT persisting anything.
   *
   * `probe` is an optional caller-supplied throwaway sink used only to learn
   * whether the seam is synchronous. When absent we assume synchronous, which is
   * the scheduler's contract, and any asynchronous result is caught at write time.
   */
  function isAsyncAppend(probe = null) {
    if (typeof probe !== 'function') return false;
    try {
      const r = probe('');
      if (r && typeof r.then === 'function') { Promise.resolve(r).catch(() => {}); return true; }
      return false;
    } catch {
      return false;
    }
  }

  function write(entry) {
    if (failure) return false;
    let result;
    try {
      result = append(JSON.stringify(entry) + '\n');
    } catch (error) {
      // Synchronous failure: the append did not land.
      failure = error?.code ?? 'journal_write_failed';
      return false;
    }
    if (result && typeof result.then === 'function') {
      // Asynchronous seam used where a synchronous durability guarantee is required.
      Promise.resolve(result).catch(() => {});
      failure = 'journal_append_async_unsupported';
      return false;
    }
    records += 1;
    return true;
  }

  return {
    write,
    isAsyncAppend,
    /** Entries persisted for restart recovery. */
    replay: () => [],
    stats: () => ({ records, failure }),
  };
}

/**
 * Trusted approval gate.
 *
 * A digest is not approval, and neither is a JSON `approved: true`. This gate
 * requires a separately supplied authorization artifact whose digest matches
 * the plan's bound manifest, and whose expiry covers the run. It cannot be
 * satisfied by editing configuration alone: the verifier seam must return a
 * signed/independently-obtained artifact.
 */
function createApprovalGate({ verifier, now } = {}) {
  assert.equal(typeof verifier, 'function', 'artifact verifier seam required');
  assert.equal(typeof now, 'function', 'clock required');

  return async ({ manifestHash, planDigest: digest = null } = {}) => {
    if (typeof manifestHash !== 'string' || !/^[a-f0-9]{64}$/.test(manifestHash)) {
      return { ok: false, reason: 'invalid_manifest_hash' };
    }
    let artifact;
    try {
      artifact = await verifier();
    } catch {
      return { ok: false, reason: 'artifact_unavailable' };
    }
    if (!artifact || typeof artifact !== 'object') return { ok: false, reason: 'artifact_missing' };
    if (artifact.verified !== true) return { ok: false, reason: 'artifact_unverified' };
    if (artifact.manifestHash !== manifestHash) return { ok: false, reason: 'artifact_manifest_mismatch' };
    // When the scheduler binds a plan digest, the artifact must pin EXACTLY that
    // digest. A missing or mismatched digest fails closed: an artifact cannot
    // authorize an unpinned plan.
    if (digest !== null && digest !== undefined) {
      if (typeof artifact.planDigest !== 'string' || !artifact.planDigest) {
        return { ok: false, reason: 'artifact_missing_plan_digest' };
      }
      if (artifact.planDigest !== digest) return { ok: false, reason: 'artifact_plan_mismatch' };
    }
    if (!Number.isFinite(artifact.expiresAt)) return { ok: false, reason: 'artifact_missing_expiry' };
    if (now() >= artifact.expiresAt) return { ok: false, reason: 'artifact_expired' };
    return { ok: true, reason: 'artifact_verified' };
  };
}

module.exports = {
  makeHandler,
  createControllerAdapter,
  createDeviceAdapter,
  createJournalAdapter,
  createApprovalGate,
};
