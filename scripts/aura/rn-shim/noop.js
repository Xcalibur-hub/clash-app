/** No-op stand-in for native-only modules in the AURA render check. */
const handler = {
  get: (_t, prop) => {
    if (prop === '__esModule') return true;
    if (prop === 'default') return new Proxy(function () {}, handler);
    if (prop === 'then') return undefined;
    return new Proxy(function () {}, handler);
  },
  apply: () => new Proxy(function () {}, handler),
  construct: () => new Proxy({}, handler),
};
module.exports = new Proxy({}, handler);
