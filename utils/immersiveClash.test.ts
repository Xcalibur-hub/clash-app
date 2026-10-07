/**
 * Immersive Clash IA guards — presentation rules only.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  duelActiveSpeakers,
  duelLatestMoment,
  duelPresentation,
  duelTranscript,
} from './duelPresentation.ts';
import {
  crowdDevLayoutEnabled,
  crowdLayerUsesProductionMocks,
} from './crowdLayerGate.ts';
import type { ArenaDuel } from './arenaDuelPayload';
import type { ArenaMessage } from '../services/liveArenaService';

const here = path.dirname(fileURLToPath(import.meta.url));

const duel = (): ArenaDuel => ({
  clashId: 'cl',
  status: 'open',
  fighterA: { id: 'a', name: 'Kevin', handle: 'kevin' },
  fighterB: { id: 'b', name: 'Alex', handle: 'alex' },
  viewerRelationship: 'spectator',
  mayJudge: false,
  hasJudged: false,
  verdict: null,
});

function message(id: string, author: string, time: number): ArenaMessage {
  return {
    id,
    roomId: 'r',
    kind: 'text',
    body: `Body ${id}`,
    createdAt: time,
    parentMessageId: null,
    author: {
      id: author,
      name: author,
      handle: author,
      avatarTint: '#aaa',
      rank: 'Rookie',
    },
    mediaUrl: null,
    mediaKind: null,
    gifProvider: null,
    gifExternalId: null,
    isOwn: false,
    reactions: [],
    replyCount: 0,
    argumentVotes: null,
  };
}

describe('immersive Clash rules', () => {
  it('keeps exactly two active speakers', () => {
    assert.equal(duelActiveSpeakers(duel()).length, 2);
  });

  it('focuses the newest canonical fighter argument', () => {
    const rows = [message('a1', 'a', 1), message('b1', 'b', 2), message('a2', 'a', 3)];
    assert.equal(duelLatestMoment(duel(), rows).message?.id, 'a2');
    assert.equal(duelLatestMoment(duel(), rows).side, 'A');
  });

  it('keeps spectator jokes out of canonical argument history', () => {
    const rows = [message('a1', 'a', 1), message('joke', 'crowd', 2), message('b1', 'b', 3)];
    assert.deepEqual(
      duelTranscript(duel(), rows).map((m) => m.id),
      ['a1', 'b1'],
    );
  });

  it('does not treat backing as judging', () => {
    assert.equal(duelPresentation(duel(), 'open').canJudge, false);
    assert.equal(duelPresentation({ ...duel(), mayJudge: true }, 'judging').canJudge, true);
  });

  it('spectators cannot publish official fighter arguments', () => {
    assert.equal(duelPresentation(duel(), 'open').canPublish, false);
    assert.equal(
      duelPresentation({ ...duel(), viewerRelationship: 'fighter_a' }, 'open').canPublish,
      true,
    );
  });

  it('omits fabricating live vote splits in DuelRoomExperience', () => {
    const src = fs.readFileSync(
      path.join(here, '../components/liveArena/DuelRoomExperience.tsx'),
      'utf8',
    );
    assert.doesNotMatch(src, /52%\s*\|\s*48%/);
    assert.doesNotMatch(src, /SegmentedTabs/);
    assert.doesNotMatch(src, /Clash content/);
    assert.match(src, /ImmersiveClash/);
  });

  it('never activates Crowd production mocks unless explicitly requested', () => {
    assert.equal(crowdLayerUsesProductionMocks(false), false);
    assert.equal(crowdDevLayoutEnabled(false), false);
  });

  it('LiveCrowdLayer gates __DEV__ mocks and labels them as layout-only', () => {
    const src = fs.readFileSync(
      path.join(here, '../components/liveArena/LiveCrowdLayer.tsx'),
      'utf8',
    );
    assert.match(src, /DEV LAYOUT · NOT LIVE CROWD/);
    assert.match(src, /showDevLayout/);
    assert.doesNotMatch(src, /fetchCrowd|postCrowd|sendCrowd/);
  });
});
