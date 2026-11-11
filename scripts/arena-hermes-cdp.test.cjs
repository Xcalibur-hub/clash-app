'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { WebSocketServer } = require('ws');
const cdp = require('./lib/arena-hermes-cdp.cjs');
const liveDevices = require('./lib/arena-live-devices.cjs');

function startMockCdpServer(onConnection) {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    wss.on('connection', (ws) => onConnection(ws));
    wss.on('listening', () => {
      const addr = wss.address();
      resolve({
        url: `ws://127.0.0.1:${addr.port}`,
        close: () => new Promise((done) => wss.close(done)),
      });
    });
  });
}

function createHermesVmContext() {
  const mods = new Map([
    [1, { verboseName: 'C:\\app\\services\\liveArenaService.ts' }],
  ]);
  const modExports = {
    1: {
      fetchRoom: (id) => new Promise((r) => setTimeout(() => r({ roomId: id, clashId: 'cl_demo', duel: { viewerRelationship: 'spectator' } }), 25)),
    },
  };
  const ctx = vm.createContext({
    Promise,
    JSON,
    Error,
    setTimeout,
    globalThis: null,
    __r: Object.assign((id) => modExports[id], { getModules: () => mods }),
  });
  ctx.globalThis = ctx;
  return ctx;
}

function attachVmHandler(ws, ctx, opts = {}) {
  const seenIds = [];
  const evalExpressions = [];
  ws.on('message', (raw) => {
    const req = JSON.parse(String(raw));
    seenIds.push(req.id);
    if (req.method === 'Runtime.enable') {
      ws.send(JSON.stringify({ id: req.id, result: {} }));
      return;
    }
    if (req.method === 'Runtime.evaluate') {
      const expr = req.params.expression;
      evalExpressions.push({ id: req.id, expr });
      if (opts.onBeforeEval && opts.onBeforeEval(req, ws, evalExpressions) === 'handled') {
        return;
      }
      // Mimic Hermes rejecting ES async functions
      if (/\basync\s*\(/.test(expr) || /\basync\s+function\b/.test(expr)) {
        ws.send(JSON.stringify({
          id: req.id,
          result: { exceptionDetails: { text: 'Compiling JS failed: 14:15:async functions are unsupported' } },
        }));
        return;
      }
      try {
        const value = vm.runInContext(expr, ctx, { timeout: 500 });
        ws.send(JSON.stringify({ id: req.id, result: { result: { type: typeof value, value } } }));
      } catch (err) {
        ws.send(JSON.stringify({
          id: req.id,
          result: {
            exceptionDetails: {
              text: 'Uncaught',
              exception: { description: `${err.name}: ${err.message}` },
            },
          },
        }));
      }
    }
  });
  return { seenIds, evalExpressions };
}

test('synchronous evaluation resolves exact object via vm CDP server', async () => {
  const ctx = createHermesVmContext();
  let trace;
  const srv = await startMockCdpServer((ws) => { trace = attachVmHandler(ws, ctx); });
  try {
    const res = await cdp.evaluateHermes({
      wsUrl: srv.url,
      fnBodyString: '(getMod) => ({ ok: true, count: 42, hasSvc: typeof getMod("services/liveArenaService.ts").fetchRoom })',
      timeoutMs: 3000,
      pollIntervalMs: 10,
    });
    assert.deepEqual(res, { ok: true, count: 42, hasSvc: 'function' });
    assert.equal(new Set(trace.seenIds).size, trace.seenIds.length);
  } finally {
    await srv.close();
  }
});

test('Promise .then() evaluation resolves asynchronously and cleans up global slot', async () => {
  const ctx = createHermesVmContext();
  const srv = await startMockCdpServer((ws) => attachVmHandler(ws, ctx));
  try {
    const res = await cdp.evaluateHermes({
      wsUrl: srv.url,
      fnBodyString: `(getMod) => getMod('services/liveArenaService.ts').fetchRoom('ar_8').then((r) => ({ roomId: r.roomId, rel: r.duel.viewerRelationship }))`,
      timeoutMs: 3000,
      pollIntervalMs: 10,
    });
    assert.deepEqual(res, { roomId: 'ar_8', rel: 'spectator' });
    const leftoverSlots = Object.keys(ctx).filter((k) => k.startsWith('__clashHermesEval_'));
    assert.deepEqual(leftoverSlots, []);
  } finally {
    await srv.close();
  }
});

test('unsupported async syntax produces an immediate explicit error before polling', async () => {
  const ctx = createHermesVmContext();
  let trace;
  const srv = await startMockCdpServer((ws) => { trace = attachVmHandler(ws, ctx); });
  try {
    await assert.rejects(
      cdp.evaluateHermes({
        wsUrl: srv.url,
        fnBodyString: 'async (getMod) => { return await getMod("services/liveArenaService.ts").fetchRoom("ar_1"); }',
        timeoutMs: 3000,
        pollIntervalMs: 10,
      }),
      /async functions are unsupported/
    );
    // Only Runtime.enable + Runtime.evaluate(run) were sent; zero poll requests ran
    assert.equal(trace.evalExpressions.length, 1);
  } finally {
    await srv.close();
  }
});

test('stale result in globalThis from an earlier run cannot satisfy a later evaluation', async () => {
  const ctx = createHermesVmContext();
  ctx.__evalDone = true;
  ctx.__evalRes = { stale: 'from_step_1b' };
  const allSeenIds = [];
  const srv = await startMockCdpServer((ws) => {
    const t = attachVmHandler(ws, ctx);
    ws.on('close', () => allSeenIds.push(...t.seenIds));
  });
  try {
    const first = await cdp.evaluateHermes({
      wsUrl: srv.url,
      fnBodyString: '() => ({ seq: 1 })',
      timeoutMs: 3000,
      pollIntervalMs: 10,
    });
    const second = await cdp.evaluateHermes({
      wsUrl: srv.url,
      fnBodyString: '() => ({ seq: 2 })',
      timeoutMs: 3000,
      pollIntervalMs: 10,
    });
    assert.deepEqual(first, { seq: 1 });
    assert.deepEqual(second, { seq: 2 });
    assert.equal(new Set(allSeenIds).size, allSeenIds.length);
  } finally {
    await srv.close();
  }
});

test('mismatched CDP response IDs and push notifications are ignored until real response arrives', async () => {
  const ctx = createHermesVmContext();
  const srv = await startMockCdpServer((ws) => {
    attachVmHandler(ws, ctx, {
      onBeforeEval(req, sock) {
        if (req.params.expression.includes('__clashHermesEval_') && req.params.expression.includes('missing: true')) {
          sock.send(JSON.stringify({ method: 'Runtime.consoleAPICalled', params: { type: 'log' } }));
          sock.send(JSON.stringify({
            id: req.id + 7777,
            result: { result: { type: 'string', value: JSON.stringify({ done: true, res: { hijacked: true } }) } },
          }));
        }
        return null;
      },
    });
  });
  try {
    const res = await cdp.evaluateHermes({
      wsUrl: srv.url,
      fnBodyString: '() => ({ genuine: true })',
      timeoutMs: 3000,
      pollIntervalMs: 10,
    });
    assert.deepEqual(res, { genuine: true });
  } finally {
    await srv.close();
  }
});

test('wrong-ID-only response and unresponsive server both fail closed on timeout', async () => {
  const srv = await startMockCdpServer((ws) => {
    ws.on('message', (raw) => {
      const req = JSON.parse(String(raw));
      if (req.method === 'Runtime.enable') {
        ws.send(JSON.stringify({ id: req.id + 500, result: {} }));
      }
    });
  });
  try {
    await assert.rejects(
      cdp.evaluateHermes({ wsUrl: srv.url, fnBodyString: '() => 1', timeoutMs: 80, pollIntervalMs: 10 }),
      /timed out after 80ms/
    );
  } finally {
    await srv.close();
  }
});

test('debugger disconnection before completion fails closed explicitly', async () => {
  const srv = await startMockCdpServer((ws) => {
    ws.on('message', (raw) => {
      const req = JSON.parse(String(raw));
      if (req.method === 'Runtime.enable') {
        ws.send(JSON.stringify({ id: req.id, result: {} }));
        setTimeout(() => ws.close(), 15);
      }
    });
  });
  try {
    await assert.rejects(
      cdp.evaluateHermes({ wsUrl: srv.url, fnBodyString: '() => 1', timeoutMs: 2000, pollIntervalMs: 10 }),
      /disconnected before evaluation completed/
    );
  } finally {
    await srv.close();
  }
});

test('rejected Promise and thrown errors reject with explicit error message', async () => {
  const ctx = createHermesVmContext();
  const srv = await startMockCdpServer((ws) => attachVmHandler(ws, ctx));
  try {
    await assert.rejects(
      cdp.evaluateHermes({
        wsUrl: srv.url,
        fnBodyString: '() => Promise.reject(new Error("deliberate_smoke_error"))',
        timeoutMs: 2000,
        pollIntervalMs: 10,
      }),
      /deliberate_smoke_error/
    );
  } finally {
    await srv.close();
  }
});

test('findBridgelessPeer locates physical SM-A505F Bridgeless target and fails closed when absent', () => {
  assert.equal(cdp.findBridgelessPeer([]), null);
  const target = cdp.findBridgelessPeer([
    { title: 'other', description: 'Bridgeless', webSocketDebuggerUrl: 'ws://x' },
    { title: 'com.clash.v2.dev (SM-A505F)', description: 'React Native Bridgeless [Hermes]', webSocketDebuggerUrl: 'ws://127.0.0.1:8081/inspector/debug?page=1' },
  ]);
  assert.equal(target?.webSocketDebuggerUrl, 'ws://127.0.0.1:8081/inspector/debug?page=1');
});

test('live acceptance runner and device scripts integrate arena-hermes-cdp without async CDP expressions', () => {
  const requiredConsumerFiles = [
    path.join(__dirname, 'start-live-environment.cjs'),
    path.join(__dirname, 'refresh-device-session.cjs'),
    path.join(__dirname, 'inspect-device-storage.cjs'),
    path.join(__dirname, 'lib/arena-live-devices.cjs'),
    path.join(__dirname, 'lib/arena-live-phases.cjs'),
    path.join(__dirname, 'run-live-arena-acceptance.cjs'),
  ];
  for (const file of requiredConsumerFiles) {
    assert.ok(fs.existsSync(file), `Missing integrated script: ${file}`);
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /arena-hermes-cdp\.cjs|arena-live-devices\.cjs/);
    assert.doesNotMatch(src, /evalInHermes\s*\(\s*`?\s*async\b/);
    assert.doesNotMatch(src, /evaluateHermes\s*\([^)]*async\b/);
  }
});

test('live runner helpers (verifyRuntimeMotion, fetchLiveRoomState, postNativeCrowd) execute through Promise chains', async () => {
  const mods = new Map([
    [1, { verboseName: 'C:\\app\\utils\\decorativeMotion.ts' }],
    [2, { verboseName: 'C:\\app\\services\\liveArenaService.ts' }],
    [3, { verboseName: 'C:\\app\\services\\arenaCrowdService.ts' }],
  ]);
  const modExports = {
    1: { DECORATIVE_MOTION_FROZEN: true, VISUAL_COUNTDOWN_PAUSED: true },
    2: { fetchRoom: (roomId) => Promise.resolve({ roomId, status: 'open', phase: 'open', roomMode: 'duel', duel: { clashId: 'cl_99', viewerRelationship: 'spectator' } }) },
    3: { postCrowd: (roomId, body, key) => Promise.resolve({ id: 'cm_1', roomId, body, requestKey: key }) },
  };
  const ctx = vm.createContext({
    Promise,
    JSON,
    Error,
    setTimeout,
    __DEV__: true,
    globalThis: null,
    __r: Object.assign((id) => modExports[id], { getModules: () => mods }),
  });
  ctx.globalThis = ctx;

  const srv = await startMockCdpServer((ws) => attachVmHandler(ws, ctx));
  try {
    const boundEval = (fnBodyString) => cdp.evaluateHermes({ wsUrl: srv.url, fnBodyString, timeoutMs: 3000, pollIntervalMs: 10 });
    const motion = await liveDevices.verifyRuntimeMotion(boundEval);
    assert.deepEqual(motion, { dev: true, frozen: true, countdownPaused: true });
    const room = await liveDevices.fetchLiveRoomState('ar_99', boundEval);
    assert.deepEqual(room, { roomId: 'ar_99', status: 'open', phase: 'open', roomMode: 'duel', clashId: 'cl_99', rel: 'spectator' });
    const crowd = await liveDevices.postNativeCrowd('ar_99', 'hello', 'req_1', boundEval);
    assert.deepEqual(crowd, { id: 'cm_1', roomId: 'ar_99', body: 'hello', requestKey: 'req_1' });
  } finally {
    await srv.close();
  }
});
