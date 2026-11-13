/** React Native runtime globals that the bundler normally injects. */
globalThis.__DEV__ = false;
globalThis.__METRO_GLOBAL_PREFIX__ = '';
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
globalThis.ErrorUtils = globalThis.ErrorUtils ?? {
  getGlobalHandler: () => () => {},
  setGlobalHandler: () => {},
};
