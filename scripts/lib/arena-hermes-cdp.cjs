'use strict';
/**
 * Fail-closed Chrome DevTools Protocol (CDP) evaluator for React Native Hermes.
 *
 * Guarantees per-evaluation isolation and strict request/response correlation:
 * - Rejects async/unsupported syntax immediately via matching `exceptionDetails`.
 * - Uses monotonically unique CDP request IDs across all evaluations.
 * - Initializes and deletes a unique `globalThis[slotKey]` slot per invocation.
 * - Ignores mismatched/stale CDP response IDs and rejects incomplete payloads.
 */
const a = require('node:assert/strict');
const crypto = require('node:crypto');
const WebSocket = require('ws');

let globalRequestSeq = 1;
const nextRequestId = () => globalRequestSeq++;

function findBridgelessPeer(peers) {
  if (!Array.isArray(peers)) return null;
  return peers.find(p => p && p.title === 'com.clash.v2.dev (SM-A505F)' && String(p.description || '').includes('Bridgeless')) || null;
}

async function fetchBridgelessPeer({ metroUrl = 'http://127.0.0.1:8081', fetchImpl = globalThis.fetch } = {}) {
  a.equal(typeof fetchImpl, 'function', 'fetch implementation required');
  const res = await fetchImpl(`${metroUrl}/json/list`);
  a.ok(res && res.ok, `Metro debugger discovery failed (${res?.status ?? 'no response'})`);
  const peer = findBridgelessPeer(await res.json());
  a.ok(peer && peer.webSocketDebuggerUrl, 'Hermes Bridgeless debugger target unavailable');
  return peer;
}

function formatCdpException(details) {
  if (!details || typeof details !== 'object') return 'Unknown Hermes evaluation exception';
  const desc = details.exception?.description ?? details.exception?.value;
  const text = details.text;
  if (desc && text && !String(desc).includes(String(text))) return `${text}: ${desc}`;
  return String(desc || text || 'Unknown Hermes evaluation exception');
}

function buildRunExpression(slotKey, fnBodyString) {
  const keyLit = JSON.stringify(slotKey);
  return `(function () {
    globalThis[${keyLit}] = { done: false, res: null, err: null };
    var getMod = function (suffix) {
      if (!globalThis.__r || typeof globalThis.__r.getModules !== 'function') {
        throw new Error('Metro module registry globalThis.__r is unavailable');
      }
      for (var pair of globalThis.__r.getModules().entries()) {
        var id = pair[0];
        var m = pair[1];
        if (m && m.verboseName && m.verboseName.replaceAll('\\\\', '/').endsWith(suffix)) {
          return globalThis.__r(id);
        }
      }
      throw new Error('Module not found: ' + suffix);
    };
    Promise.resolve()
      .then(function () { return (${fnBodyString})(getMod); })
      .then(function (val) {
        var cur = globalThis[${keyLit}];
        if (cur) { cur.res = val === undefined ? null : val; cur.done = true; }
      })
      .catch(function (err) {
        var cur = globalThis[${keyLit}];
        if (cur) {
          cur.err = err ? (err.message ? String(err.message) : String(err)) : 'Unknown Hermes evaluation error';
          cur.done = true;
        }
      });
    return true;
  })()`;
}

function buildPollExpression(slotKey) {
  const keyLit = JSON.stringify(slotKey);
  return `(function () {
    var k = ${keyLit};
    var s = globalThis[k];
    if (!s || typeof s !== 'object') return JSON.stringify({ missing: true });
    if (s.done === true) {
      try { delete globalThis[k]; } catch (e) {}
    }
    return JSON.stringify({
      done: s.done === true,
      res: s.res === undefined ? null : s.res,
      err: s.err === undefined ? null : s.err
    });
  })()`;
}

function evaluateHermes({ wsUrl, fnBodyString, timeoutMs = 30000, pollIntervalMs = 150, WebSocketClass = WebSocket } = {}) {
  a.equal(typeof wsUrl, 'string', 'wsUrl must be a string');
  a.ok(wsUrl.length > 0, 'wsUrl must be non-empty');
  a.equal(typeof fnBodyString, 'string', 'fnBodyString must be a string');
  a.ok(fnBodyString.trim().length > 0, 'fnBodyString must be non-empty');
  a.ok(Number.isFinite(timeoutMs) && timeoutMs > 0, 'timeoutMs must be positive');

  const slotKey = '__clashHermesEval_' + crypto.randomUUID().replaceAll('-', '');
  const enableId = nextRequestId();
  const runId = nextRequestId();

  return new Promise((resolve, reject) => {
    const ws = new WebSocketClass(wsUrl);
    let settled = false;
    let stage = 'enable';
    let expectedId = enableId;
    let pollTimer = null;

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      try { if (ws.readyState === 1 || ws.readyState === 0) ws.close(); } catch {}
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      try { if (ws.terminate) ws.terminate(); } catch {}
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const succeed = (val) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(val);
    };

    const sendJson = (obj) => ws.send(JSON.stringify(obj));
    const sendPoll = () => {
      if (settled || ws.readyState !== 1) return;
      expectedId = nextRequestId();
      sendJson({ id: expectedId, method: 'Runtime.evaluate', params: { expression: buildPollExpression(slotKey), returnByValue: true } });
    };

    const timeoutTimer = setTimeout(() => fail(new Error(`Hermes CDP evaluation timed out after ${timeoutMs}ms`)), timeoutMs);

    ws.on('open', () => {
      sendJson({ id: enableId, method: 'Runtime.enable' });
    });

    ws.on('message', (raw) => {
      if (settled) return;
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return fail(new Error('Malformed CDP WebSocket frame')); }
      if (!msg || typeof msg !== 'object') return fail(new Error('Invalid CDP payload object'));
      if (msg.id === undefined || msg.id === null) return; // Ignore push notifications (e.g. consoleAPICalled)
      if (msg.id !== expectedId) return; // Strict correlation: ignore mismatched or stale CDP IDs

      if (msg.error) return fail(new Error(`CDP error: ${msg.error.message || JSON.stringify(msg.error)}`));
      if (msg.result?.exceptionDetails) return fail(new Error(formatCdpException(msg.result.exceptionDetails)));

      if (stage === 'enable') {
        stage = 'run';
        expectedId = runId;
        sendJson({ id: runId, method: 'Runtime.evaluate', params: { expression: buildRunExpression(slotKey, fnBodyString), returnByValue: true } });
        return;
      }

      if (stage === 'run') {
        if (msg.result?.result?.value !== true) {
          return fail(new Error(`Ambiguous Runtime.evaluate start acknowledgement: ${JSON.stringify(msg.result?.result)}`));
        }
        stage = 'poll';
        pollTimer = setTimeout(sendPoll, 0);
        return;
      }

      const rawVal = msg.result?.result?.value;
      if (typeof rawVal !== 'string') return fail(new Error(`Incomplete CDP poll result: ${JSON.stringify(msg.result?.result)}`));
      let parsed;
      try { parsed = JSON.parse(rawVal); } catch { return fail(new Error(`Malformed JSON in CDP poll payload: ${rawVal}`)); }
      if (!parsed || typeof parsed !== 'object') return fail(new Error('Invalid CDP poll state object'));
      if (parsed.missing === true) return fail(new Error(`Evaluation slot '${slotKey}' missing during poll`));
      if (typeof parsed.done !== 'boolean') return fail(new Error('Ambiguous CDP poll state: missing boolean done flag'));

      if (parsed.done) {
        if (parsed.err !== null && parsed.err !== undefined) return fail(new Error(String(parsed.err)));
        return succeed(parsed.res);
      }
      pollTimer = setTimeout(sendPoll, pollIntervalMs);
    });

    ws.on('error', (err) => fail(err || new Error('Hermes CDP WebSocket error')));
    ws.on('close', () => {
      if (!settled) fail(new Error('Hermes CDP WebSocket disconnected before evaluation completed'));
    });
  });
}

async function evalInHermes(fnBodyString, options = {}) {
  const peer = await fetchBridgelessPeer(options);
  return evaluateHermes({ ...options, wsUrl: peer.webSocketDebuggerUrl, fnBodyString });
}

module.exports = {
  findBridgelessPeer,
  fetchBridgelessPeer,
  formatCdpException,
  buildRunExpression,
  buildPollExpression,
  evaluateHermes,
  evalInHermes,
};
