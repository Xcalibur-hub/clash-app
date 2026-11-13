/** Font package stand-in for the render check (font loading is native-only). */
module.exports = new Proxy(
  {},
  {
    get: (_t, prop) => (prop === '__esModule' ? true : String(prop)),
  },
);
