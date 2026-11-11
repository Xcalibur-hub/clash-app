'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handleBallotResponse } = require('./lib/arena-ballot-handler.cjs');

/* ───────────────────── 1. Successful HTTP 204 handling ────────────────────── */

test('handleBallotResponse accepts standard PostgREST HTTP 204 No Content', () => {
  const res = handleBallotResponse({ status: 204, data: null });
  assert.equal(res.ok, true);
  assert.equal(res.status, 204);
  assert.equal(res.result, 'ACCEPTED');
});

test('handleBallotResponse accepts HTTP 200 with empty body/null data', () => {
  const res = handleBallotResponse({ status: 200, data: null });
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
  assert.equal(res.result, 'ACCEPTED');
});

test('handleBallotResponse accepts HTTP 200 with truthy payload', () => {
  const res = handleBallotResponse({ status: 200, data: { ok: true } });
  assert.equal(res.ok, true);
  assert.equal(res.result, 'ACCEPTED');
});

/* ────────────────────── 2. Duplicate voting rejection ─────────────────────── */

test('handleBallotResponse classifies Postgres 23505 unique violation as duplicate', () => {
  const res = handleBallotResponse({
    status: 400,
    data: {
      code: '23505',
      message: 'duplicate key value violates unique constraint "judgements_pkey"',
    },
  });
  assert.equal(res.ok, false);
  assert.equal(res.result, 'REJECTED_DUPLICATE');
  assert.equal(res.code, '23505');
});

test('handleBallotResponse classifies HTTP 409 Conflict as duplicate', () => {
  const res = handleBallotResponse({
    status: 409,
    data: { message: 'Conflict: voter has already cast a ballot for this clash' },
  });
  assert.equal(res.ok, false);
  assert.equal(res.result, 'REJECTED_DUPLICATE');
});

test('handleBallotResponse classifies already_judged custom code as duplicate', () => {
  const res = handleBallotResponse({
    status: 400,
    data: { code: 'already_judged', message: 'You have already judged this clash' },
  });
  assert.equal(res.ok, false);
  assert.equal(res.result, 'REJECTED_DUPLICATE');
  assert.equal(res.code, 'already_judged');
});

/* ───────────────────── 3. Phase and permission rejection ───────────────────── */

test('handleBallotResponse classifies P0005 as judging phase rejection', () => {
  const res = handleBallotResponse({
    status: 400,
    data: { code: 'P0005', message: 'Judgement cannot be submitted outside JUDGING phase' },
  });
  assert.equal(res.ok, false);
  assert.equal(res.result, 'REJECTED_PHASE');
  assert.equal(res.code, 'P0005');
});

test('handleBallotResponse classifies P0004 as permission rejection', () => {
  const res = handleBallotResponse({
    status: 400,
    data: { code: 'P0004', message: 'User is not an admitted spectator or debater in room' },
  });
  assert.equal(res.ok, false);
  assert.equal(res.result, 'REJECTED_PHASE');
  assert.equal(res.code, 'P0004');
});

/* ────────────────────────── 4. Unexpected errors ──────────────────────────── */

test('handleBallotResponse classifies internal server error (500) as unexpected error', () => {
  const res = handleBallotResponse({
    status: 500,
    data: { message: 'Internal Server Error' },
  });
  assert.equal(res.ok, false);
  assert.equal(res.result, 'ERROR');
  assert.equal(res.status, 500);
});

test('handleBallotResponse classifies unauthorized (401) as unexpected error', () => {
  const res = handleBallotResponse({
    status: 401,
    data: { message: 'Invalid JWT or expired session' },
  });
  assert.equal(res.ok, false);
  assert.equal(res.result, 'ERROR');
  assert.equal(res.status, 401);
});

test('handleBallotResponse rejects non-object inputs', () => {
  assert.throws(() => handleBallotResponse(null), /response must be an object/);
  assert.throws(() => handleBallotResponse(undefined), /response must be an object/);
  assert.throws(() => handleBallotResponse('204'), /response must be an object/);
});
