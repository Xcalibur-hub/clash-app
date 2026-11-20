import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mosaicSpanForIndex, rankMosaicItems } from './exploreMosaic.ts';

describe('Explore mosaic layout', () => {
  it('cycles asymmetric spans', () => {
    assert.equal(mosaicSpanForIndex(0), 'hero');
    assert.equal(mosaicSpanForIndex(1), 'half');
    assert.equal(mosaicSpanForIndex(3), 'wide');
  });

  it('ranks media-bearing tiles first', () => {
    const ranked = rankMosaicItems([
      { id: '1', kind: 'TAKE' },
      { id: '2', kind: 'TAKE', mediaUrl: 'https://example.com/a.jpg' },
      { id: '3', kind: 'LIVE' },
    ]);
    assert.equal(ranked[0]?.id, '2');
  });
});
