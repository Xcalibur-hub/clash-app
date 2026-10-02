import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pulseLabel, takePulse } from './takePulse.ts';
import type { Take } from '../store/types.ts';

const NOW = 1_700_000_000_000;

function take(partial: Partial<Take>): Take {
  return {
    id: 't1',
    authorId: 'u1',
    text: 'hello',
    hood: 'techtakes',
    createdAt: NOW - 60 * 60 * 1000,
    expiresAt: NOW + 20 * 60 * 60 * 1000,
    clashes: 0,
    reactions: 0,
    ...partial,
  };
}

describe('takePulse', () => {
  it('marks clash only when clashes > 0', () => {
    assert.equal(takePulse(take({ clashes: 1 }), NOW), 'clash');
    assert.equal(takePulse(take({ clashes: 0, reactions: 20 }), NOW), 'hot');
  });

  it('marks HOT from real heat, not fabricated counts', () => {
    assert.equal(takePulse(take({ reactions: 12, createdAt: NOW - 5 * 60 * 60 * 1000 }), NOW), 'hot');
    assert.equal(takePulse(take({ reactions: 3, createdAt: NOW - 5 * 60 * 60 * 1000 }), NOW), null);
  });

  it('marks RISING for young Takes with reactions', () => {
    assert.equal(
      takePulse(take({ createdAt: NOW - 30 * 60 * 1000, reactions: 1 }), NOW),
      'rising',
    );
  });

  it('never labels a 1v1 Clash as LIVE', () => {
    assert.equal(pulseLabel('clash'), 'IN A CLASH');
    assert.notEqual(pulseLabel('clash'), 'CLASH LIVE');
  });
});
