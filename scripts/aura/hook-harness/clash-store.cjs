/* Clash store boundary: the hook only needs a dispatch + viewer identity. */
const fakes = require('./fakes.cjs');
module.exports = {
  useClash: fakes.useClash,
  showNotice: fakes.showNotice,
  __esModule: true,
};
