/*
 * Mounted-hook harness.
 *
 * The hook is imported for real and mounted with react-test-renderer (React 19
 * still supports it; `react-dom/client` needs a DOM this repo does not ship).
 * Only module boundaries are aliased away — Supabase, Expo Router, the crash
 * reporter, AsyncStorage. No hook code is stubbed or reimplemented, which is the
 * distinction between this and a source-scanning test.
 */
const React = require('react');
const TestRenderer = require('react-test-renderer');

const fakes = require('./fakes.cjs');

// React 19 warns unless the act environment flag is set before rendering.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const act = TestRenderer.act;

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
  // Let the hook's initial load settle.
  await act(async () => {
    await Promise.resolve();
  });

  handle.unmount = async () => {
    await act(async () => {
      handle.renderer.unmount();
    });
    handle.unmounted = true;
  };

  /**
   * Invoke a controller method inside `act` and flush what it triggered.
   *
   * State updates outside `act` are dropped by React 19, which would make a
   * passing test meaningless, so every interaction goes through here.
   */
  handle.call = async (name, ...args) => {
    let result;
    await act(async () => {
      result = await handle.current[name](...args);
      // Two microtask turns: the hook awaits the RPC, then its refresh chain.
      await Promise.resolve();
      await Promise.resolve();
    });
    return result;
  };

  return handle;
}

module.exports = { mountRoom, act, fakes, React };
