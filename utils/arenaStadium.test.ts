/**
 * Stadium / Stage IA guards — presentation rules only.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ARENA_MODES, DEFAULT_ARENA_MODE } from './arenaNav.ts';
import {
  duelActiveSpeakers,
  duelCurrentArguments,
  duelPresentation,
  duelTranscript,
} from './duelPresentation.ts';
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

function message(
  id: string,
  author: string,
  time: number,
): ArenaMessage {
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

describe('Arena IA', () => {
  it('organizes Arena as For You / Clashes / Community / Topics / Trending', () => {
    assert.equal(DEFAULT_ARENA_MODE, 'for_you');
    assert.deepEqual(
      ARENA_MODES.map((m) => m.id),
      ['for_you', 'clashes', 'community', 'topics', 'trending'],
    );
  });
});

describe('Stadium speaker model', () => {
  it('keeps exactly two active speakers', () => {
    assert.equal(duelActiveSpeakers(duel()).length, 2);
  });

  it('separates official transcript from crowd authors', () => {
    const rows = [
      message('a1', 'a', 1),
      message('joke', 'crowd1', 2),
      message('b1', 'b', 3),
    ];
    const transcript = duelTranscript(duel(), rows);
    assert.deepEqual(
      transcript.map((m) => m.id),
      ['a1', 'b1'],
    );
    const current = duelCurrentArguments(duel(), rows);
    assert.equal(current.a?.id, 'a1');
    assert.equal(current.b?.id, 'b1');
  });

  it('does not treat live backing as judging', () => {
    const open = duelPresentation(duel(), 'open');
    assert.equal(open.canJudge, false);
    assert.equal(open.role, 'WATCHING');
    const judging = duelPresentation({ ...duel(), mayJudge: true }, 'judging');
    assert.equal(judging.canJudge, true);
    assert.match(judging.hint, /stronger case/i);
  });

  it('reveals verdict role only after settlement', () => {
    const settled = {
      ...duel(),
      status: 'settled' as const,
      verdict: {
        winnerSide: 'A' as const,
        verdictLabel: 'STRONG',
        jurySize: 10,
        sideAScore: 6,
        sideBScore: 4,
      },
    };
    assert.equal(duelPresentation(settled, 'closed').stage, 'Complete');
  });
});

describe('Trending graph vs list', () => {
  it('documents that Top 10 list under the graph is disallowed', () => {
    // Structural guard: TrendingBattlesSection must not render styles.list rows.
    const src = fs.readFileSync(
      path.join(here, '../components/arena/TrendingBattlesSection.tsx'),
      'utf8',
    );
    assert.doesNotMatch(src, /styles\.list/);
    assert.doesNotMatch(src, /TOP 10/);
    assert.match(src, /no duplicate Top 10 list/i);
  });
});

