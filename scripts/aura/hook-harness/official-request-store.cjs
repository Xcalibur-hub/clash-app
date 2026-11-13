/* Official-request store boundary: single-flight is irrelevant to admission. */
const acquire = async () => ({ ok: true });
const confirm = async () => ({ ok: true });
module.exports = {
  acquireOfficialRequest: acquire,
  confirmOfficialRequest: confirm,
  __esModule: true,
};
