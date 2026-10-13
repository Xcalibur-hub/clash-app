import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
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
