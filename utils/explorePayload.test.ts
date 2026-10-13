import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  explorePageOutcome,
  explorePayloadMessage,
  explorePayloadNeedsRetry,
  explorePayloadReport,
  explorePayloadState,
} from './explorePayload.ts';

describe('explorePayloadReport', () => {
  it('counts what arrived, what mapped and what was rejected', () => {
    assert.deepEqual(explorePayloadReport(5, 3), { received: 5, mapped: 3, rejected: 2 });
    assert.deepEqual(explorePayloadReport(4, 4), { received: 4, mapped: 4, rejected: 0 });
    assert.deepEqual(explorePayloadReport(0, 0), { received: 0, mapped: 0, rejected: 0 });
  });

  it('clamps impossible counts instead of producing negatives', () => {
    assert.deepEqual(explorePayloadReport(2, 9), { received: 2, mapped: 2, rejected: 0 });
    assert.deepEqual(explorePayloadReport(-3, -1), { received: 0, mapped: 0, rejected: 0 });
    assert.deepEqual(explorePayloadReport(Number.NaN, Number.NaN), { received: 0, mapped: 0, rejected: 0 });
    assert.deepEqual(explorePayloadReport(3.7, 1.2), { received: 3, mapped: 1, rejected: 2 });
  });

  it('carries counts only, so nothing from the payload can travel with it', () => {
    const report = explorePayloadReport(2, 1);
    assert.deepEqual(Object.keys(report).sort(), ['mapped', 'received', 'rejected']);
    assert.equal(Object.values(report).every((value) => typeof value === 'number'), true);
  });
});

describe('explorePayloadState', () => {
  it('calls a genuinely empty result empty, not an error', () => {
    assert.equal(explorePayloadState(explorePayloadReport(0, 0)), 'empty');
  });

  it('calls rows-nobody-could-read all_rejected', () => {
    assert.equal(explorePayloadState(explorePayloadReport(6, 0)), 'all_rejected');
  });

  it('calls a partial read partial and a full read ok', () => {
    assert.equal(explorePayloadState(explorePayloadReport(6, 3)), 'partial');
    assert.equal(explorePayloadState(explorePayloadReport(6, 6)), 'ok');
  });
});

describe('explorePayloadMessage', () => {
  it('stays silent for empty and ok so existing empty and success copy is preserved', () => {
    assert.equal(explorePayloadMessage('empty'), null);
    assert.equal(explorePayloadMessage('ok'), null);
  });

  it('is actionable and retry-oriented for the unreadable states', () => {
    assert.match(explorePayloadMessage('all_rejected'), /could not read what the server sent/);
    assert.match(explorePayloadMessage('all_rejected'), /Try again/);
    assert.match(explorePayloadMessage('partial'), /Some explore items could not be shown/);
    assert.match(explorePayloadMessage('all_rejected', 'Live'), /^Live /);
  });

  it('never includes payload content, only copy', () => {
    for (const state of ['all_rejected', 'partial'] as const) {
      const message = explorePayloadMessage(state) ?? '';
      assert.equal(/[[\]{}"']/.test(message), false, 'no serialized payload may appear in copy');
      assert.equal(message.includes('http'), false);
      assert.equal(message.length < 120, true);
    }
  });
});

describe('explorePayloadNeedsRetry', () => {
  it('marks only an unreadable payload as retryable', () => {
    assert.equal(explorePayloadNeedsRetry('all_rejected'), true);
    assert.equal(explorePayloadNeedsRetry('partial'), false);
    assert.equal(explorePayloadNeedsRetry('empty'), false);
    assert.equal(explorePayloadNeedsRetry('ok'), false);
  });
});

describe('explorePageOutcome', () => {
  it('advances the cursor for a genuinely empty page, with no error copy', () => {
    const outcome = explorePageOutcome(explorePayloadReport(0, 0));
    assert.equal(outcome.advanceCursor, true, 'an empty page is real progress');
    assert.equal(outcome.retryThisPage, false);
    assert.equal(outcome.error, null);
    assert.equal(outcome.notice, null);
  });

  it('keeps the cursor and retries the page when every row was unreadable', () => {
    const outcome = explorePageOutcome(explorePayloadReport(24, 0));
    assert.equal(outcome.advanceCursor, false, 'advancing would skip that data for the session');
    assert.equal(outcome.retryThisPage, true, 'Retry must re-request THIS page, not page 0');
    assert.match(outcome.error, /could not read what the server sent/);
    assert.equal(outcome.notice, null);
  });

  it('advances and notes when only some rows were unreadable', () => {
    const outcome = explorePageOutcome(explorePayloadReport(24, 20));
    assert.equal(outcome.advanceCursor, true, 'usable rows were returned, so paging continues');
    assert.equal(outcome.retryThisPage, false);
    assert.equal(outcome.error, null);
    assert.match(outcome.notice, /could not be shown/);
  });

  it('treats a fully mapped page as a plain success', () => {
    const outcome = explorePageOutcome(explorePayloadReport(24, 24));
    assert.deepEqual(outcome, { advanceCursor: true, retryThisPage: false, error: null, notice: null });
  });

  it('defaults to plain success when a caller has no report', () => {
    assert.deepEqual(explorePageOutcome(undefined), { advanceCursor: true, retryThisPage: false, error: null, notice: null });
    assert.deepEqual(explorePageOutcome(null), { advanceCursor: true, retryThisPage: false, error: null, notice: null });
  });
});
