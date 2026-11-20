'use strict';
const assert = require('node:assert/strict');

/**
 * Classifies an HTTP/RPC response for a ballot submission (`submit_judgement`).
 *
 * Recognized contracts:
 * - Success: HTTP 204 No Content (PostgREST void RPC return).
 * - Duplicate rejection: HTTP 400 or 409 with Postgres unique violation ('23505')
 *   or application rejection code ('already_judged', 'duplicate_judgement').
 * - Phase/permission rejection: HTTP 400/403 with phase violation code ('P0005', 'P0004').
 * - Unexpected error: Any unexpected status or unstructured failure.
 */
function handleBallotResponse(response) {
  assert.ok(response && typeof response === 'object', 'response must be an object');
  const status = response.status;
  const data = response.data;

  // 1. Successful submission: HTTP 204 No Content (standard PostgREST RPC void return)
  // Also tolerate HTTP 200 with empty body/null data.
  if (status === 204 || (status === 200 && (!data || data.ok !== false))) {
    return { ok: true, status, result: 'ACCEPTED' };
  }

  const code = data?.code ?? data?.error?.code ?? response.code ?? null;
  const message = String(data?.message ?? data?.error?.message ?? response.message ?? '');

  // 2. Duplicate rejection
  const isDuplicate = status === 409
    || code === '23505'
    || code === 'already_judged'
    || code === 'duplicate_judgement'
    || /duplicate|unique|already/i.test(message);

  if (isDuplicate) {
    return { ok: false, status, code: code || 'DUPLICATE_BALLOT', result: 'REJECTED_DUPLICATE', message };
  }

  // 3. Phase or admission rejection
  const isPhaseRejection = code === 'P0005' || code === 'P0004' || /phase|not in judging|closed/i.test(message);
  if (isPhaseRejection) {
    return { ok: false, status, code: code || 'PHASE_REJECTION', result: 'REJECTED_PHASE', message };
  }

  // 4. Unexpected error
  return { ok: false, status, code: code || 'UNEXPECTED_ERROR', result: 'ERROR', message };
}

module.exports = { handleBallotResponse };
