import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SYNTHETIC_DROPS } from './probeDrops.js';
import {
  closePreview,
  isDropSelected,
  previewForDrop,
  selectProbeDrop,
} from './probeSelection.js';

describe('probe selection and preview', () => {
  const drop = SYNTHETIC_DROPS[0];

  it('opens a preview for a selected Drop', () => {
    const preview = previewForDrop(drop);
    assert.equal(preview.open, true);
    assert.equal(preview.drop?.id, drop.id);
  });

  it('marks selected state only for the active Drop id', () => {
    assert.equal(isDropSelected(drop.id, drop.id), true);
    assert.equal(isDropSelected(drop.id, 'other'), false);
    assert.equal(isDropSelected(null, drop.id), false);
  });

  it('selects a Drop and clears when the same Drop is selected again', () => {
    const first = selectProbeDrop(null, drop);
    assert.equal(first.selectedId, drop.id);
    assert.equal(first.preview.open, true);

    const second = selectProbeDrop(first.selectedId, drop);
    assert.equal(second.selectedId, null);
    assert.equal(second.preview.open, false);
  });

  it('closes an open preview', () => {
    const closed = closePreview({ open: true, drop });
    assert.deepEqual(closed, { open: false, drop: null });
  });
});
