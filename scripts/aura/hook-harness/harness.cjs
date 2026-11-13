/*
 * Mounted-hook harness.
 *
 * The hook is imported for real and mounted with react-test-renderer (React 19
 * still supports it; `react-dom/client` needs a DOM this repo does not ship).
 * Only module boundaries are aliased away — Supabase, Expo Router, the crash
 * reporter, AsyncStorage. No hook code is stubbed or reimplemented, which is the
 * distinction between this and a source-scanning test.
 *
 * Every mount and every controller call is followed by `settle()`, which spins
 * the microtask queue until the hook reports no load in flight. Without that,
 * an assertion could read state from the middle of `load()` and call it a pass.
 */
/*
 * React 19 prints a deprecation notice for the test renderer on every render.
 * It is about the harness itself, not the code under test, and it buries the
 * pass/fail lines. Only that exact message is filtered; every other warning
 * still reaches the console.
 */
const consoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('react-test-renderer is deprecated')) return;
  consoleError(...args);
};

const React = require('react');
const TestRenderer = require('react-test-renderer');

const fakes = require('./fakes.cjs');

// React 19 warns unless the act environment flag is set before rendering.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const act = TestRenderer.act;

/** Microtask turns granted per round before the settled-ness check. */
const TURNS_PER_ROUND = 8;
/** Rounds before giving up. A hook that never settles is a harness failure. */
const MAX_ROUNDS = 60;

/**
 * Run queued work until the controller reports nothing loading or refreshing.
 *
 * `act` flushes React work; the awaits between rounds let the hook's promise
 * chain (RPC → refresh → publish) run to completion.
 */
async function settle(handle, label) {
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    await act(async () => {
      for (let turn = 0; turn < TURNS_PER_ROUND; turn += 1) await Promise.resolve();
    });
    const controller = handle.current;
    if (controller && !controller.loading && !controller.refreshing) return;
  }
  throw new Error(`${label}: the mounted hook never settled`);
}

/**
 * A plain copy of the controller's observable state.
 *
 * Tests assert against this rather than against live controller objects, so a
 * later render cannot retroactively change what a test already checked. Rows are
 * copied because the transcript store freezes the live ones.
 */
function snapshot(controller) {
  const rows = (list) => list.map((row) => ({ ...row }));
  return {
    room: controller.room
      ? { ...controller.room, viewer: controller.room.viewer ? { ...controller.room.viewer } : null }
      : null,
    messages: rows(controller.messages),
    evidence: rows(controller.evidence),
    stats: controller.stats,
    error: controller.error,
    threadLocked: controller.threadLocked,
    watchFailed: controller.watchFailed,
    hasOlder: controller.hasOlder,
    loading: controller.loading,
    refreshing: controller.refreshing,
  };
}

/**
 * Mount the real hook for `roomId` and return a live handle.
 *
 * `handle.current` is refreshed on every render, so callers always act on the
 * newest controller object — exactly what a screen would hold in a ref.
 */
async function mountRoom(roomId, viewerAuthor = null) {
  const handle = { current: null, renders: 0, unmounted: false };

  function Probe() {
    const controller = require('../../../hooks/useLiveArenaRoom.ts').useLiveArenaRoom(
      roomId,
      viewerAuthor,
    );
    handle.current = controller;
    handle.renders += 1;
    return React.createElement('Probe', null);
  }

  await act(async () => {
    handle.renderer = TestRenderer.create(React.createElement(Probe));
  });
  await settle(handle, `mount ${roomId}`);

  handle.snapshot = () => snapshot(handle.current);

  /**
   * Invoke a controller method inside `act`, then wait for its whole async
   * chain to finish. The returned promise is the method's own value.
   */
  handle.call = async (name, ...args) => {
    let result;
    await act(async () => {
      result = await handle.current[name](...args);
    });
    await settle(handle, `${name}(${roomId})`);
    return result;
  };

  handle.unmount = async () => {
    await act(async () => {
      handle.renderer.unmount();
    });
    handle.unmounted = true;
  };

  return handle;
}

module.exports = { mountRoom, settle, snapshot, act, fakes, React };
