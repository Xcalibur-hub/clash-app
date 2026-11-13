/**
 * Empty-state semantics (Phase 1 blocker 5).
 *
 * Phase 1 shipped two variants, `quiet` and `alert`, and both failure kinds —
 * a network error and a blocked profile — rendered the identical eyebrow
 * `SOMETHING WENT WRONG`. These assertions lock the distinction.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyStateAccentKind,
  emptyStateEyebrow,
  emptyStateIsRetryable,
} from '../components/shared/emptyStateSemantics.ts';

describe('AURA empty-state semantics', () => {
  it('tells each failure apart instead of reusing one label', () => {
    const labels = ['quiet', 'error', 'offline', 'denied', 'blocked'].map((v) =>
      emptyStateEyebrow(v as never),
    );
    const failures = labels.slice(1);
    assert.equal(
      new Set(failures).size,
      failures.length,
      `failure states share a label: ${failures.join(' | ')}`,
    );
  });

  it('does not call a blocked profile an error', () => {
    assert.notEqual(emptyStateEyebrow('blocked'), emptyStateEyebrow('error'));
    assert.equal(emptyStateEyebrow('blocked'), 'ACCESS REMOVED');
  });

  it('keeps a restriction quiet and paints a real failure as danger', () => {
    // Blocked/denied are facts about the viewer, not alarms.
    assert.equal(emptyStateAccentKind('blocked'), 'brand');
    assert.equal(emptyStateAccentKind('denied'), 'brand');
    assert.equal(emptyStateAccentKind('quiet'), 'brand');
    assert.equal(emptyStateAccentKind('error'), 'danger');
    assert.equal(emptyStateAccentKind('offline'), 'danger');
  });

  it('only offers retry where retrying can help', () => {
    assert.equal(emptyStateIsRetryable('error'), true);
    assert.equal(emptyStateIsRetryable('offline'), true);
    assert.equal(emptyStateIsRetryable('blocked'), false);
    assert.equal(emptyStateIsRetryable('denied'), false);
  });

  it('keeps the deprecated alert alias pointing at a real error', () => {
    assert.equal(emptyStateEyebrow('alert'), emptyStateEyebrow('error'));
  });
});
