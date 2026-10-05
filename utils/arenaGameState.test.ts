import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARENA_REACTIONS,
  arrivalBanner,
  backupPolicyLabel,
  battleEventToRoomEvent,
  callSecondsLeft,
  candidateSubtitle,
  expiredCallCopy,
  incomingCallBody,
  incomingCallHeadline,
  latestBattleEvent,
  optOutCopy,
  reputationIsNotKarmaCopy,
  roomFullCopy,
  standingLabel,
} from './arenaGameState.ts';

describe('arena standing copy', () => {
  it('names every rung of the ladder', () => {
    assert.equal(standingLabel('NEWCOMER'), 'Newcomer');
    assert.equal(standingLabel('CONTRIBUTOR'), 'Contributor');
    assert.equal(standingLabel('DEBATER'), 'Debater');
    assert.equal(standingLabel('VETERAN'), 'Veteran');
  });

  it('says a standing never overrides the rules', () => {
    const copy = reputationIsNotKarmaCopy();
    assert.match(copy, /never bypasses/);
    assert.match(copy, /capacity/);
  });
});

describe('backup candidates', () => {
  it('leads with a real reason, then the standing', () => {
    assert.equal(
      candidateSubtitle({ standing: 'DEBATER', reasons: ['Strong debater', 'From this Hood'] }),
      'Strong debater · Debater',
    );
  });

  it('falls back to the standing alone when there is no reason yet', () => {
    assert.equal(candidateSubtitle({ standing: 'VETERAN', reasons: [] }), 'Veteran');
  });
});

describe('incoming call copy', () => {
  it('names the room the way the room is labelled', () => {
    assert.equal(incomingCallHeadline(7), 'ROOM 7 NEEDS YOU');
    assert.equal(incomingCallHeadline(0), 'YOUR ROOM NEEDS YOU');
  });

  it('names the caller and the battle', () => {
    assert.equal(
      incomingCallBody('Pixel takes better photos than iPhone', 'Arena Caller'),
      'Arena Caller called you into "Pixel takes better photos than iPhone".',
    );
  });

  it('counts the live window down, never below zero', () => {
    assert.equal(callSecondsLeft(60_000, 30_000), 30);
    assert.equal(callSecondsLeft(60_000, 90_000), 0);
    assert.equal(callSecondsLeft(Number.NaN, 0), null);
  });

  it('states the truth about a full room and about opting out', () => {
    assert.match(roomFullCopy(), /full/);
    assert.match(roomFullCopy(), /watch/);
    assert.match(expiredCallCopy(), /expired/);
    assert.match(optOutCopy(), /off/);
  });

  it('labels the three preference choices', () => {
    assert.equal(backupPolicyLabel('EVERYONE'), 'Everyone eligible');
    assert.equal(backupPolicyLabel('FOLLOWING'), 'People I follow');
    assert.equal(backupPolicyLabel('NOBODY'), 'Nobody');
  });
});

describe('battle events become room banners', () => {
  it('renders an arrival with the person who came', () => {
    const event = battleEventToRoomEvent({
      kind: 'BACKUP_ARRIVED',
      actorName: 'cameraNerd',
      payload: {},
    });
    assert.equal(event?.kind, 'backup_arrived');
    assert.equal(event?.label, arrivalBanner('cameraNerd'));
  });

  it('counts a real evidence surge', () => {
    const event = battleEventToRoomEvent({
      kind: 'EVIDENCE_SURGED',
      actorName: null,
      payload: { recentCount: 4 },
    });
    assert.equal(event?.label, '4 receipts just landed');
  });

  it('maps phase and judging moments onto the existing vocabulary', () => {
    assert.equal(battleEventToRoomEvent({ kind: 'JUDGING_STARTED', actorName: null, payload: {} })?.kind, 'judging');
    assert.equal(battleEventToRoomEvent({ kind: 'RESULT_SETTLED', actorName: null, payload: {} })?.kind, 'result');
  });

  it('stays silent for a decline, which is private', () => {
    assert.equal(battleEventToRoomEvent({ kind: 'BACKUP_DECLINED', actorName: null, payload: {} }), null);
  });

  it('shows the newest moment that has something to say', () => {
    const event = latestBattleEvent([
      { kind: 'BACKUP_CALLED', actorName: 'a', payload: {} },
      { kind: 'BACKUP_DECLINED', actorName: 'a', payload: {} },
    ]);
    assert.equal(event?.kind, 'backup_called');
    assert.equal(latestBattleEvent([{ kind: 'BACKUP_DECLINED', actorName: 'a', payload: {} }]), null);
  });
});

describe('reaction palette', () => {
  it('stays compact and expressive', () => {
    assert.equal(ARENA_REACTIONS.length, 7);
    assert.equal(ARENA_REACTIONS[0].emoji, '🔥');
    assert.ok(ARENA_REACTIONS.some((entry) => entry.label === 'Receipts'));
  });

  it('offers no emoji twice', () => {
    const unique = new Set(ARENA_REACTIONS.map((entry) => entry.emoji));
    assert.equal(unique.size, ARENA_REACTIONS.length);
  });
});
