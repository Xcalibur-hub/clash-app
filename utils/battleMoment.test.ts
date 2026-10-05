import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  battleEventBurstKind,
  liveEventToMoment,
  pulseLeaderToMoment,
  selectFeaturedPulseMoments,
} from './battleMoment.ts';
import type { ArenaPulseLeader } from '../services/liveArenaService.ts';

function leader(
  category: ArenaPulseLeader['category'],
  preview = 'hello',
): ArenaPulseLeader {
  return {
    category,
    label: category,
    messageId: `${category}-msg`,
    evidenceId: null,
    author: {
      id: '1',
      handle: 'alex',
      name: 'Alex',
      avatarTint: '#aaa',
      rank: 'Rookie',
    },
    score: 4,
    preview,
  };
}

describe('selectFeaturedPulseMoments', () => {
  it('prefers Fast Rising and Crowd over equal cards', () => {
    const moments = selectFeaturedPulseMoments(
      [
        leader('TOP_ARGUMENT'),
        leader('FAST_RISING'),
        leader('BEST_EVIDENCE'),
        leader('CROWD_FAVORITE'),
      ],
      2,
    );
    assert.equal(moments.length, 2);
    assert.equal(moments[0].kind, 'FAST_RISING');
    assert.equal(moments[1].kind, 'CROWD_FAVORITE');
    assert.equal(moments[1].entertainment, true);
    assert.match(moments[1].kicker, /CROWD LOST IT/);
  });

  it('returns empty when there are no leaders', () => {
    assert.deepEqual(selectFeaturedPulseMoments([]), []);
  });
});

describe('pulseLeaderToMoment', () => {
  it('marks crowd favorite as entertainment', () => {
    const m = pulseLeaderToMoment(leader('CROWD_FAVORITE', 'usb-c joke'));
    assert.equal(m.entertainment, true);
    assert.equal(m.who, '@alex');
    assert.equal(m.preview, 'usb-c joke');
  });
});

describe('liveEventToMoment', () => {
  it('maps backup arrival', () => {
    const m = liveEventToMoment({ kind: 'backup_arrived', label: 'Backup arrived · @cam' });
    assert.equal(m?.kind, 'BACKUP');
    assert.match(m!.kicker, /BACKUP ARRIVED/);
  });

  it('ignores plain new_arguments', () => {
    assert.equal(liveEventToMoment({ kind: 'new_arguments', label: '2 new' }), null);
  });
});

describe('battleEventBurstKind', () => {
  it('maps known battle events', () => {
    assert.equal(battleEventBurstKind('BACKUP_ARRIVED'), 'backup_arrived');
    assert.equal(battleEventBurstKind('EVIDENCE_SURGED'), 'receipts');
    assert.equal(battleEventBurstKind('FAST_RISING_CHANGED'), 'fast_rising');
    assert.equal(battleEventBurstKind('BACKUP_DECLINED'), null);
  });
});
