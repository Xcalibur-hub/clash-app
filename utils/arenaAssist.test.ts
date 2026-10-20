/** Private assist presentation guards — permissions are never widened in the UI. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assistAvailability } from './arenaAssist.ts';

describe('private assist availability', () => {
  it('hides the flow from staff and from a locked thread', () => {
    assert.equal(assistAvailability({ viewerRelationship: 'staff', status: 'open', phase: 'open' }), 'hidden');
    assert.equal(
      assistAvailability({ viewerRelationship: 'spectator', status: 'open', phase: 'open', threadLocked: true }),
      'hidden',
    );
  });

  it('gives fighters an inbox and spectators a composer while the floor is open', () => {
    assert.equal(assistAvailability({ viewerRelationship: 'fighter_a', status: 'open', phase: 'open' }), 'inbox');
    assert.equal(assistAvailability({ viewerRelationship: 'spectator', status: 'open', phase: 'final_arguments' }), 'compose');
  });

  it('closes the flow outside open and final-argument phases', () => {
    assert.equal(assistAvailability({ viewerRelationship: 'spectator', status: 'open', phase: 'judging' }), 'closed');
    assert.equal(assistAvailability({ viewerRelationship: 'spectator', status: 'open', phase: 'closed' }), 'closed');
    assert.equal(assistAvailability({ viewerRelationship: 'spectator', status: 'settled', phase: 'closed' }), 'closed');
    assert.equal(assistAvailability({ viewerRelationship: 'spectator', status: 'cancelled', phase: 'closed' }), 'closed');
  });

  it('never turns a closed room into an open composer', () => {
    for (const phase of ['open', 'final_arguments'] as const) {
      assert.equal(assistAvailability({ viewerRelationship: 'spectator', status: 'settled', phase }), 'closed');
    }
  });
});
