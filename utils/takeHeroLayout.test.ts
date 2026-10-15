import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { heroCardHeight } from './takeHeroLayout.ts';

/** Copy overlay height for a body of `lines` at `scale` (space, gap, author). */
const copy = (lines: number, scale = 1): number =>
  32 + Math.ceil(lines * 32 * scale) + 12 + 26 + 20;

describe('take detail hero card height', () => {
  it('keeps the editorial plate for short and natural two-line bodies', () => {
    // A 411dp-wide phone: card = 411 - 2 * space.md = 379, plate = round(379 * 1.12) = 424.
    assert.equal(heroCardHeight({ cardWidth: 379, copyHeight: copy(1) }), 424);
    assert.equal(heroCardHeight({ cardWidth: 379, copyHeight: copy(2) }), 424);
  });

  it('keeps the plate at the largest supported font scale (1.3)', () => {
    assert.equal(heroCardHeight({ cardWidth: 379, copyHeight: copy(5, 1.3) }), 424);
    assert.ok(copy(5, 1.3) < 424);
  });

  it('grows instead of clipping when the copy exceeds the plate', () => {
    // 5 lines at 2.5x, or a body longer than the five-line cap.
    const tall = copy(5, 2.5);
    assert.ok(tall > 424);
    assert.equal(heroCardHeight({ cardWidth: 379, copyHeight: tall }), tall);
    assert.equal(heroCardHeight({ cardWidth: 379, copyHeight: 640 }), 640);
  });

  it('bounds the plate itself for implausible widths', () => {
    assert.equal(heroCardHeight({ cardWidth: 100, copyHeight: 0 }), 360);
    assert.equal(heroCardHeight({ cardWidth: 2400, copyHeight: 0 }), 520);
  });

  it('never returns NaN, never shrinks below the plate, and is monotonic', () => {
    assert.equal(heroCardHeight({ cardWidth: Number.NaN, copyHeight: Number.NaN }), 403);
    assert.equal(heroCardHeight({ cardWidth: 0, copyHeight: -50 }), 403);
    const heights = [0, 120, 300, 424, 700].map((h) =>
      heroCardHeight({ cardWidth: 379, copyHeight: h }),
    );
    assert.deepEqual(heights, [424, 424, 424, 424, 700]);
    for (let i = 1; i < heights.length; i += 1) {
      assert.ok((heights[i] as number) >= (heights[i - 1] as number));
    }
  });
});
