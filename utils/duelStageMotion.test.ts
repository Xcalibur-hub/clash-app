/** Stage motion / terminal label gates for UI Phase 2. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  duelCrowdChrome,
  duelSpeakingCue,
  stageEntranceKey,
} from './duelStageMotion.ts';
import { duelArgumentPreview, isNewOfficialMoment } from './duelPresentation.ts';

describe('duel stage motion gates', () => {
  it('builds a stable one-shot Stage entrance key', () => {
    assert.equal(stageEntranceKey('clash-1', 'room:0'), 'stage-entrance:clash-1:room:0');
    assert.equal(stageEntranceKey('clash-1', ''), 'stage-entrance:clash-1:clash-1');
    assert.equal(stageEntranceKey('', 'scope'), '');
  });

  it('shows SPEAKING only while the Clash is live', () => {
    assert.equal(
      duelSpeakingCue({ live: true, terminal: null, focusSide: 'B', side: 'B' }),
      true,
    );
    assert.equal(
      duelSpeakingCue({ live: true, terminal: null, focusSide: 'B', side: 'A' }),
      false,
    );
    assert.equal(
      duelSpeakingCue({ live: false, terminal: null, focusSide: 'B', side: 'B' }),
      false,
    );
    assert.equal(
      duelSpeakingCue({ live: true, terminal: 'settled', focusSide: 'B', side: 'B' }),
      false,
    );
    assert.equal(
      duelSpeakingCue({ live: true, terminal: 'cancelled', focusSide: 'A', side: 'A' }),
      false,
    );
  });

  it('drops Live crowd chrome in terminal and history modes', () => {
    assert.deepEqual(duelCrowdChrome(false), { label: 'LIVE CROWD', idleState: 'Live' });
    assert.deepEqual(duelCrowdChrome(true), { label: 'CROWD', idleState: 'Closed' });
  });

  it('treats historical hydration as non-arrival and newer ids as arrivals', () => {
    const first = { id: 'a1', createdAt: 10, preciseCreatedAt: null, kind: 'text' as const };
    const next = { id: 'b1', createdAt: 20, preciseCreatedAt: null, kind: 'text' as const };
    assert.equal(isNewOfficialMoment(null, first), false);
    assert.equal(isNewOfficialMoment(first, first), false);
    assert.equal(isNewOfficialMoment(first, next), true);
  });

  it('keeps long argument previews on word boundaries with full-access cue', () => {
    const long =
      'The counterpoint is about access and context. Different people need different tools, and the trade-offs deserve attention across communities.';
    const { preview, truncated } = duelArgumentPreview(long, 60);
    assert.equal(truncated, true);
    assert.match(preview, /…$/);
    assert.ok(preview.length < long.length);
    // Soft break should not leave a dangling partial like "differen…".
    assert.doesNotMatch(preview, /differen…$/);
  });
});
