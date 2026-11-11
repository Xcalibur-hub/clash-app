const assert = require('node:assert/strict');
const crypto = require('node:crypto');

/**
 * Real process seams for the Arena acceptance adapters — without executing them.
 *
 * Each factory returns a callable seam (`spawn` / `adb`) built over an injected
 * `execFile`-style function. The default transport uses `node:child_process`, so
 * importing this module never spawns anything; a process runs only when a caller
 * actually invokes the returned function.
 *
 * All argument validation happens before the transport is touched, so an unsafe
 * command can never reach a shell.
 */

/** Allowlist of controller commands the executor accepts. */
/**
 * Controller commands and their real side-effect class.
 *
 * `read`       — no persistent effect.
 * `mutation`   — creates or changes Arena state (a fixture or a running service).
 * `auth`       — performs credential load and Auth recovery: magic links and OTP
 *                exchanges for actors A/B/D. NOT read-only, despite running before
 *                the fixture is created. Requires its own explicit authorization.
 */
const CONTROLLER_COMMAND_CLASS = Object.freeze({
  preflight: 'read',
  status: 'read',
  snapshot: 'read',
  broadcast: 'mutation',
  'load-recover': 'auth',
  create: 'mutation',
  accept: 'mutation',
  gateway: 'mutation',
  'official-A-OPEN': 'mutation',
  'official-B-OPEN': 'mutation',
  'official-A-FINAL': 'mutation',
  'official-B-FINAL': 'mutation',
  'crowd-D-OPEN': 'mutation',
  'crowd-D-FINAL': 'mutation',
  'watch-D': 'mutation',
  'ballot-D': 'mutation',
  'settle-first': 'mutation',
  'settle-idempotency': 'mutation',
  'close-actors': 'mutation',
});

const CONTROLLER_COMMANDS = Object.freeze(Object.keys(CONTROLLER_COMMAND_CLASS));

/** True when the command may be issued without a fresh owner authorization. */
function isReadOnlyCommand(command) {
  return CONTROLLER_COMMAND_CLASS[command] === 'read';
}

/** Shell-special characters that must never appear in any argument. */
const UNSAFE = /[;&|`$<>(){}[\]!*?~\n\r"'\\]/;

function assertSafeToken(value, what) {
  assert.equal(typeof value, 'string', `${what} must be a string`);
  assert.ok(value.length > 0 && value.length <= 128, `${what} must be 1..128 chars`);
  assert.match(value, /^[A-Za-z0-9._\-/:]+$/, `${what} contains an unsafe character`);
  assert.ok(!UNSAFE.test(value), `${what} contains a shell-special character`);
}

/** Parse one JSON line, returning null for blank or malformed input. */
function parseJsonLine(text) {
  const line = String(text ?? '').trim();
  if (!line) return null;
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Default process transport: starts the node script and exposes a strict
 * line-reader, a writer, and an idempotent `close()` that always terminates.
 * Importing this module starts nothing; a process exists only after `launch()`.
 */
function defaultLaunch() {
  const { spawn: spawnProcess } = require('node:child_process');
  return async function launch(file, args, { cwd = null, timeoutMs = 30_000 } = {}) {
    let child;
    try {
      child = spawnProcess(file, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      // Startup failure: nothing to clean up, but never leave a half-built handle.
      throw Object.assign(new Error('controller failed to start'), { code: 'CONTROLLER_START_FAILED', cause: error });
    }
    let buffer = '';
    let stderr = '';
    const pending = [];
    // Lines read before a caller awaits them are buffered, so a fast controller
    // that prints `ready` immediately cannot lose early output.
    const buffered = [];
    let closed = false;

    const pump = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        const waiter = pending.shift();
        if (waiter) waiter.resolve(line);
        else buffered.push(line);
        index = buffer.indexOf('\n');
      }
    };

    child.stdout.on('error', (error) => {
      closed = true;
      while (pending.length) pending.shift().reject(Object.assign(new Error('controller stdout error'), { code: 'CONTROLLER_IO_ERROR', cause: error }));
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { buffer += chunk; pump(); });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', () => { closed = true; });
    child.on('exit', () => {
      closed = true;
      // A final unterminated line is still a complete answer in most CLIs; keep it.
      if (buffer.trim()) { const line = buffer.trim(); buffer = ''; const waiter = pending.shift(); if (waiter) waiter.resolve(line); else buffered.push(line); }
      while (pending.length) pending.shift().reject(Object.assign(new Error('controller exited early'), { code: 'CONTROLLER_EXITED' }));
    });

    return {
      readLine() {
        if (buffered.length) return Promise.resolve(buffered.shift());
        if (closed) return Promise.reject(Object.assign(new Error('controller closed'), { code: 'CONTROLLER_EXITED' }));
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Object.assign(new Error('controller read timeout'), { code: 'CONTROLLER_TIMEOUT' })), timeoutMs);
          pending.push({
            resolve: (line) => { clearTimeout(timer); resolve(line); },
            reject: (error) => { clearTimeout(timer); reject(error); },
          });
        });
      },
      writeLine(line) {
        if (closed) return Promise.reject(Object.assign(new Error('controller closed'), { code: 'CONTROLLER_EXITED' }));
        return new Promise((resolve, reject) => {
          child.stdin.write(line, (error) => (error ? reject(error) : resolve()));
        });
      },
      async close() {
        if (closed) return true;
        closed = true;
        try { child.stdin.end(); } catch { /* already closed */ }
        try { child.stdin.destroy(); } catch { /* ignore */ }
        try { child.stdout.destroy(); } catch { /* ignore */ }
        try { child.stderr.destroy(); } catch { /* ignore */ }
        if (child.exitCode === null) {
          try { child.kill('SIGTERM'); } catch { /* already gone */ }
        }
        try { child.unref(); } catch { /* ignore */ }
        return true;
      },
      stderr: () => stderr,
    };
  };
}

/** Default one-shot transport: a non-shelling wrapper over child_process.execFile (used by ADB). */
function defaultExecFile() {
  const { execFile } = require('node:child_process');
  return (file, args, options) => new Promise((resolve, reject) => {
    const encoding = options?.encoding ?? 'utf8';
    execFile(file, args, {
      timeout: options?.timeoutMs ?? 30_000,
      maxBuffer: 20e6,
      windowsHide: true,
      encoding,
    },
    (error, stdout, stderr) => {
      if (error) {
        const err = new Error(String(stderr || error.message || 'process failed'));
        err.code = error.code ?? 'PROCESS_FAILED';
        err.killed = error.killed;
        reject(err);
        return;
      }
      resolve({
        stdout: encoding === 'buffer' ? stdout : String(stdout ?? ''),
        stderr: String(stderr ?? ''),
      });
    });
  });
}

/**
 * Controller executor seam.
 *
 * `execute-owner.cjs` is a **JSON-lines stdin REPL**, not a flag-driven CLI: it
 * reads `process.argv` zero times. Its real contract is:
 *
 *   startup  → one line:  {"ready":true,"run":..,"dir":..,"pid":..}
 *   input    → per line:  {"command":"<name>"}\n
 *   success  → one line:  {"command":"<name>","result":..}
 *   failure  → one line:  {"command":"<name>","status":"STOP_FAILED_OR_UNKNOWN",
 *                          "message":..,"locations":[..]}
 *
 * Each `spawn(command)` therefore starts the controller, waits for `ready`, writes
 * exactly one command line, reads exactly one verdict, and always terminates the
 * process. The controller is driven through its own interface — never rewritten.
 *
 * ⚠ STATE: the controller keeps `material`, `actors`, `ids`, `deadlines`,
 * `gateway`, `done` and `fenced` in module scope for its process lifetime. A
 * one-shot spawn therefore loses all of it: every command after `preflight`
 * dereferences `ids`/`deadlines` and fails. Use `createControllerSession` for a
 * real run; this one-shot form is only valid for stateless commands.
 */
function createControllerSpawn({
  launch = defaultLaunch(),
  nodePath = process.execPath,
  scriptPath = null,
  cwd = null,
} = {}) {
  assert.equal(typeof launch, 'function', 'launch transport required');
  if (scriptPath !== null) assert.match(String(scriptPath), /execute-owner\.cjs$/, 'controller script expected');

  return async function spawn(command, { timeoutMs = 30_000 } = {}) {
    assert.ok(CONTROLLER_COMMANDS.includes(command), `controller command not allowlisted: ${command}`);
    assertSafeToken(command, 'command');
    assert.ok(scriptPath, 'controller scriptPath must be configured before use');

    const child = await launch(nodePath, [scriptPath], { cwd, timeoutMs });
    try {
      const ready = await child.readLine();
      const readyLine = parseJsonLine(ready);
      if (!readyLine || readyLine.ready !== true) return { ok: false, code: 'controller_not_ready' };

      // The REPL assigns a line handler, so the command must be written after ready.
      await child.writeLine(JSON.stringify({ command }) + '\n');
      const verdict = parseJsonLine(await child.readLine());
      if (!verdict) return { ok: false, code: 'controller_output_unparsed' };

      // A fenced controller reports STOP_FAILED_OR_UNKNOWN rather than {ok:false}.
      if (verdict.status === 'STOP_FAILED_OR_UNKNOWN') {
        return { ok: false, code: verdict.message ?? 'controller_failed', fenced: true };
      }
      if (verdict.command !== command) return { ok: false, code: 'controller_command_mismatch' };
      return { ok: true, output: verdict.result ?? null };
    } finally {
      // Never leave a controller process running.
      await child.close();
    }
  };
}

/**
 * Persistent controller session — the correct adapter for a real run.
 *
 * The controller is **intentionally stateful**: `preflight` loads credentials into
 * module scope and populates `ids`/`deadlines`; `official-*`, `crowd-D-*`,
 * `ballot-D` and settlement all dereference that state, and `reserve()` dedupes via
 * an in-process `done` set. Re-launching per command would lose all of it and
 * re-run startup side effects.
 *
 * One session = one controller process, used sequentially. Commands are serialized
 * so a verdict can never be attributed to the wrong command line.
 */
function createControllerSession({
  launch = defaultLaunch(),
  nodePath = process.execPath,
  scriptPath = null,
  cwd = null,
  readyTimeoutMs = 60_000,
} = {}) {
  assert.equal(typeof launch, 'function', 'launch transport required');
  if (scriptPath !== null) assert.match(String(scriptPath), /execute-owner\.cjs$/, 'controller script expected');

  let child = null;
  let ready = null;
  let queue = Promise.resolve();
  let closed = false;
  let lastError = null;

  async function ensureStarted() {
    if (ready) return ready;
    assert.ok(scriptPath, 'controller scriptPath must be configured before use');
    const handle = await launch(nodePath, [scriptPath], { cwd, timeoutMs: readyTimeoutMs });
    const line = await handle.readLine();
    const readyLine = parseJsonLine(line);
    if (!readyLine || readyLine.ready !== true) {
      await handle.close();
      throw Object.assign(new Error('controller not ready'), { code: 'controller_not_ready' });
    }
    child = handle;
    ready = readyLine;
    return readyLine;
  }

  /** Send exactly one command; returns a scheduler-compatible result. */
  function send(command, { timeoutMs = 30_000 } = {}) {
    const task = queue.then(async () => {
      if (closed || lastError) return { ok: false, code: lastError ?? 'session_closed' };
      assert.ok(CONTROLLER_COMMANDS.includes(command), `controller command not allowlisted: ${command}`);
      assertSafeToken(command, 'command');
      try {
        await ensureStarted();
        await child.writeLine(JSON.stringify({ command }) + '\n');
        const verdict = parseJsonLine(await child.readLine());
        // Any response we cannot attribute to this command leaves the controller's
        // state unknown: fence the session so no further effect can be sent.
        if (!verdict) {
          lastError = 'controller_output_unparsed';
          return { ok: false, code: lastError, fenced: true };
        }
        if (verdict.status === 'STOP_FAILED_OR_UNKNOWN') {
          // The controller fences itself after a failure: no further writes.
          lastError = 'controller_fenced';
          return { ok: false, code: verdict.message ?? 'controller_failed', fenced: true };
        }
        if (verdict.command !== command) {
          lastError = 'controller_command_mismatch';
          return { ok: false, code: lastError, fenced: true };
        }
        return { ok: true, output: verdict.result ?? null };
      } catch (error) {
        // Transport failure or timeout: the outcome is unknown, so fence and terminate child.
        lastError = error?.code ?? 'CONTROLLER_UNAVAILABLE';
        if (child) {
          try { await child.close(); } catch { /* ignore */ }
        }
        return { ok: false, code: lastError, fenced: true };
      }
    });
    queue = task.catch(() => undefined);
    return task;
  }

  return {
    spawn: send,
    /** True once the controller reported ready. */
    isStarted: () => Boolean(ready),
    /** Controller identity from the ready line (pid/run/dir) — never credentials. */
    identity: () => (ready ? { pid: ready.pid ?? null, run: ready.run ?? null, dir: ready.dir ?? null } : null),
    /** Terminate the controller. Idempotent and always safe. */
    async close() {
      if (closed) return true;
      closed = true;
      if (child) await child.close();
      return true;
    },
    /** A fenced or failed session refuses further commands. */
    isFenced: () => Boolean(lastError),
  };
}

/**
 * ADB transport seam.
 *
 * `device-evidence.cjs` hard-codes its run directory and serial, so the seam
 * speaks to adb directly. The serial is required and validated; every arg is
 * checked before invocation.
 */
function createAdbTransport({
  execFile = defaultExecFile(),
  adbPath = 'adb',
  serial = null,
  timeoutMs = 10_000,
} = {}) {
  assert.equal(typeof execFile, 'function', 'execFile transport required');

  return async function adb(args, options = {}) {
    assert.ok(serial, 'device serial must be configured before use');
    assertSafeToken(serial, 'serial');
    assert.match(serial, /^[A-Za-z0-9]+$/, 'serial must be alphanumeric');
    assert.ok(Array.isArray(args) && args.length > 0, 'adb args required');
    assert.ok(args.length <= 16, 'adb args too long');
    for (const arg of args) {
      assert.equal(typeof arg, 'string', 'adb args must be strings');
      assert.ok(!/[;&|`$<>\n\r]/.test(arg), `unsafe adb arg: ${arg}`);
    }
    const isBinary = args.includes('screencap') || options?.encoding === 'buffer';
    const execOptions = {
      timeoutMs,
      ...options,
      encoding: isBinary ? 'buffer' : (options?.encoding ?? 'utf8'),
    };
    const { stdout } = await execFile(adbPath, ['-s', serial, ...args], execOptions);
    return stdout;
  };
}

module.exports = {
  CONTROLLER_COMMANDS,
  CONTROLLER_COMMAND_CLASS,
  isReadOnlyCommand,
  assertSafeToken,
  parseJsonLine,
  defaultExecFile,
  defaultLaunch,
  createControllerSpawn,
  createControllerSession,
  createAdbTransport,
};
