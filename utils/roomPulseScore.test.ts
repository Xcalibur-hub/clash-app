import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPulseLeaders,
  fastRisingScore,
  pickBestEvidence,
  pickBestRebuttal,
  pickFastRising,
  pickTopArgument,
  pulseAccessibilitySummary,
  pulseLeaderChanges,
  type PulseCandidateInput,
  type PulseEvidenceInput,
} from './roomPulseScore.ts';

function candidate(
  id: string,
  opts: Partial<PulseCandidateInput> & { nonSelf?: number; parent?: string | null } = {},
): PulseCandidateInput {
  return {
    id,
    authorId: opts.authorId ?? id,
    authorHandle: opts.authorHandle ?? id,
    authorName: opts.authorName ?? id,
    authorTint: '#111',
    parentMessageId: opts.parent ?? null,
    createdAt: opts.createdAt ?? Date.now() - 120_000,
    reactionTotal: opts.reactionTotal ?? opts.nonSelf ?? 0,
    nonSelfReactionTotal: opts.nonSelf ?? 0,
    hidden: opts.hidden ?? false,
    bodyPreview: opts.bodyPreview ?? 'arg',
  };
}

describe('Pulse eligibility', () => {
  it('omits Top Argument below threshold', () => {
    assert.equal(pickTopArgument([candidate('a', { nonSelf: 2 })]), null);
  });

  it('picks Top Argument by non-self reactions', () => {
    const top = pickTopArgument([
      candidate('weak', { nonSelf: 3, authorName: 'Weak' }),
      candidate('strong', { nonSelf: 9, authorName: 'Riya' }),
    ]);
    assert.equal(top?.authorName, 'Riya');
  });

  it('excludes moderated/hidden content', () => {
    assert.equal(
      pickTopArgument([candidate('gone', { nonSelf: 99, hidden: true })]),
      null,
    );
  });

  it('picks Best Evidence by useful count', () => {
    const evidence: PulseEvidenceInput[] = [
      {
        id: 'e1',
        authorId: 'dev',
        authorHandle: 'dev',
        authorName: 'Dev',
        authorTint: '#222',
        usefulCount: 4,
        hidden: false,
        title: 'Study',
      },
      {
        id: 'e0',
        authorId: 'x',
        authorHandle: 'x',
        authorName: 'X',
        authorTint: '#222',
        usefulCount: 0,
        hidden: false,
        title: 'Weak',
      },
    ];
    assert.equal(pickBestEvidence(evidence)?.authorName, 'Dev');
  });

  it('picks Best Rebuttal among replies only', () => {
    const top = pickBestRebuttal([
      candidate('root', { nonSelf: 20 }),
      candidate('reb', { nonSelf: 5, parent: 'root', authorName: 'Maya' }),
    ]);
    assert.equal(top?.authorName, 'Maya');
  });

  it('protects Fast Rising tiny-sample explosions', () => {
    assert.equal(fastRisingScore(1, 5), 0);
    assert.ok(fastRisingScore(4, 30) >= 2);
    const rising = pickFastRising(
      [candidate('sam', { nonSelf: 4, authorName: 'Sam', createdAt: Date.now() - 60_000 })],
      Date.now(),
    );
    assert.equal(rising?.authorName, 'Sam');
  });

  it('builds settled Pulse with Crowd Favorite only when author exists', () => {
    const leaders = buildPulseLeaders({
      messages: [candidate('best', { nonSelf: 8, authorName: 'Riya' })],
      evidence: [],
      now: Date.now(),
      settled: true,
      settledBestMessageId: 'best',
      settledBestAuthor: {
        id: 'best',
        handle: 'riya',
        name: 'Riya',
        tint: '#1',
      },
    });
    assert.ok(leaders.some((l) => l.category === 'TOP_ARGUMENT'));
    assert.ok(leaders.some((l) => l.category === 'CROWD_FAVORITE'));
  });

  it('exposes an accessibility summary', () => {
    const leaders = buildPulseLeaders({
      messages: [candidate('a', { nonSelf: 5, authorName: 'Riya' })],
      evidence: [],
      now: Date.now(),
      settled: false,
      settledBestMessageId: null,
      settledBestAuthor: null,
    });
    assert.match(pulseAccessibilitySummary(leaders), /Room Pulse/);
    assert.match(pulseAccessibilitySummary(leaders), /Riya/);
  });

  it('detects leader changes without fabricating momentum', () => {
    const a = [candidate('a', { nonSelf: 5, authorName: 'Riya' })];
    const first = buildPulseLeaders({
      messages: a,
      evidence: [],
      now: Date.now(),
      settled: false,
      settledBestMessageId: null,
      settledBestAuthor: null,
    });
    const second = buildPulseLeaders({
      messages: [candidate('b', { nonSelf: 9, authorName: 'Dev' })],
      evidence: [],
      now: Date.now(),
      settled: false,
      settledBestMessageId: null,
      settledBestAuthor: null,
    });
    const changes = pulseLeaderChanges(first, second);
    assert.equal(changes[0]?.authorName, 'Dev');
  });
});
