import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  duelActiveSpeakers,
  duelCurrentArguments,
  duelEmptyText,
  duelEvidence,
  duelFighterSide,
  duelPresentation,
  duelResultTitle,
  duelTimestamp,
  duelTranscript,
  isCanonicalDuel,
} from './duelPresentation.ts';
import { parseArenaDuelRoom } from './arenaDuelPayload.ts';
import { removeUnavailableMessages } from './liveRoomThread.ts';
import type { ArenaDuel } from './arenaDuelPayload';
import type { ArenaMessage, ArenaEvidence } from '../services/liveArenaService';
const duel = (): ArenaDuel => ({ clashId: 'cl', status: 'open', fighterA: { id: 'author', name: 'Kevin', handle: 'kevin' },
  fighterB: { id: 'challenger', name: 'Rohan', handle: 'rohan' }, viewerRelationship: 'spectator', mayJudge: false, hasJudged: false, verdict: null });
function message(id: string, author: string | null, time: number, parent: string | null = null): ArenaMessage {
  return { id, roomId: 'r', kind: 'text', body: `Argument ${id}`, createdAt: time, parentMessageId: parent,
    author: author ? { id: author, name: author, handle: author, avatarTint: '#aaa', rank: 'Rookie' } : null,
    mediaUrl: null, mediaKind: null, gifProvider: null, gifExternalId: null, isOwn: false, reactions: [], replyCount: 0, argumentVotes: null };
}
function proof(id: string, author: string, parent: string | null): ArenaEvidence {
  return { id, roomId: 'r', topicId: 't', messageId: parent, kind: 'link', title: 'Citation', sourceUrl: 'https://example.com', mediaUrl: null,
    createdAt: 2, isOwn: false, author: message('m', author, 1).author, usefulCount: 0, viewerMarkedUseful: false };
}
test('specialized screen requires both marker and matching canonical link', () => {
  assert.equal(isCanonicalDuel({ roomMode: 'GROUP', clashId: null, duel: null }), false);
  assert.equal(isCanonicalDuel({ roomMode: 'DUEL', clashId: 'cl', duel: duel() }), true);
  assert.equal(isCanonicalDuel({ roomMode: 'DUEL', clashId: 'wrong', duel: duel() }), false);
  assert.equal(isCanonicalDuel({ roomMode: 'DUEL', clashId: 'cl', duel: null }), false);
});
test('fighter identities do not depend on arrival or participant ordering', () => {
  assert.equal(duelFighterSide(duel(), 'challenger'), 'B'); assert.equal(duelFighterSide(duel(), 'author'), 'A');
  assert.equal(duelFighterSide(duel(), 'spectator'), null); assert.equal(duelFighterSide(duel(), null), null);
});
test('exactly two active speakers — invited users never become Fighter C', () => {
  const speakers = duelActiveSpeakers(duel());
  assert.equal(speakers.length, 2);
  assert.equal(speakers[0].id, 'author');
  assert.equal(speakers[1].id, 'challenger');
});
test('Stage shows only the latest official argument per side', () => {
  const rows = [
    message('a1', 'author', 10),
    message('b1', 'challenger', 20),
    message('crowd', 'spectator', 25),
    message('a2', 'author', 30),
  ];
  const current = duelCurrentArguments(duel(), rows);
  assert.equal(current.a?.id, 'a2');
  assert.equal(current.b?.id, 'b1');
});
test('fighter role cannot self-judge even if a permission flag is stale', () => {
  for (const viewerRelationship of ['fighter_a','fighter_b'] as const) {
    const d = { ...duel(), viewerRelationship, mayJudge: true };
    assert.match(duelPresentation(d, 'open').role, /YOU'RE FIGHTING/);
    assert.equal(duelPresentation(d, 'open').canPublish, true);
    assert.equal(duelPresentation(d, 'judging').canJudge, false);
    assert.equal(duelPresentation(d, 'judging').canPublish, false);
  }
});
test('spectators watch and only judge within the canonical voting window', () => {
  const d = { ...duel(), mayJudge: true };
  assert.equal(duelPresentation(d, 'judging').role, 'JUDGING OPEN');
  assert.equal(duelPresentation(d, 'open').role, 'WATCHING');
  assert.equal(duelPresentation(d, 'open').canPublish, false);
  for (const phase of ['scheduled','open','final_arguments','closed'] as const) assert.equal(duelPresentation(d, phase).canJudge, false);
  assert.equal(duelPresentation(d, 'judging').canJudge, true);
  assert.equal(duelPresentation({ ...d, hasJudged: true }, 'judging').canJudge, false);
});
test('staff is a watching moderator with no fighter publishing rights', () => {
  const p = duelPresentation({ ...duel(), viewerRelationship: 'staff' }, 'open');
  assert.equal(p.canPublish, false); assert.match(p.role, /MODERATOR/);
});
test('server-supported progression has no invented opening/counter round', () => {
  assert.equal(duelPresentation(duel(), 'scheduled').stage, 'Waiting');
  assert.equal(duelPresentation(duel(), 'open').stage, 'Live');
  assert.equal(duelPresentation(duel(), 'final_arguments').stage, 'Final arguments');
  assert.equal(duelPresentation(duel(), 'judging').stage, 'Judging');
  assert.equal(duelPresentation(duel(), 'closed').stage, 'Awaiting verdict');
});
test('canonical cancellation and settlement override stale Room phase', () => {
  const cancelled = { ...duel(), status: 'cancelled' as const, mayJudge: true };
  assert.equal(duelPresentation(cancelled, 'open').stage, 'Cancelled'); assert.equal(duelPresentation(cancelled, 'judging').canJudge, false);
  const settled = { ...duel(), status: 'settled' as const, verdict: { winnerSide: 'DRAW' as const, verdictLabel: 'DRAW', jurySize: 2 } };
  assert.equal(duelPresentation(settled, 'open').stage, 'Complete'); assert.equal(duelResultTitle(settled), 'Draw');
  assert.equal(duelResultTitle(cancelled), 'Clash cancelled'); assert.equal(duelResultTitle(duel()), null);
});
test('winner comes exclusively from canonical verdict, never reactions', () => {
  const d = { ...duel(), status: 'settled' as const, verdict: { winnerSide: 'B' as const, verdictLabel: 'STRONG', jurySize: 3, sideAScore: 1, sideBScore: 2 } };
  assert.equal(duelResultTitle(d), 'Rohan made the stronger case');
});
test('transcript keeps fighter replies in actual chronological sequence', () => {
  const rows = [message('last','author',52,'counter'), message('crowd','spectator',30), message('counter','challenger',28,'first'), message('first','author',12)];
  assert.deepEqual(duelTranscript(duel(), rows).map(row => row.id), ['first','counter','last']);
  assert.equal(rows[0].id, 'last', 'input stream is not mutated');
});
test('system notices survive but unknown authors cannot masquerade as fighters', () => {
  const system = { ...message('notice',null,1), kind: 'system' as const };
  assert.deepEqual(duelTranscript(duel(), [message('missing',null,2), system]).map(row => row.id), ['notice']);
});
test('moderation eviction removes fighter text and its attached evidence', () => {
  const visible = removeUnavailableMessages([message('hidden','author',1), message('visible','challenger',2,'hidden')], ['hidden'], []);
  const transcript = duelTranscript(duel(), visible);
  assert.deepEqual(transcript.map(row => row.id), ['visible']);
  assert.deepEqual(duelEvidence(duel(), [proof('hidden-proof','author','hidden'), proof('visible-proof','challenger','visible'), proof('standalone','author',null)], transcript).map(row => row.id), ['standalone','visible-proof']);
});
test('muted/blocked authors and missing parent citations are not reintroduced by the presentation', () => {
  assert.deepEqual(duelEvidence(duel(), [proof('audience','spectator',null), proof('orphan','author','unavailable')], []), []);
});
test('timestamps use actual created time and omit invalid dates', () => {
  assert.equal(duelTimestamp(0), null); assert.equal(duelTimestamp(NaN), null); assert.equal(duelTimestamp(Infinity), null);
  assert.equal(typeof duelTimestamp(Date.UTC(2026,9,7,12,28)), 'string');
});
test('empty states do not claim a removed fighter never posted', () => {
  assert.match(duelEmptyText(duel(), 'open', 'transcript'), /FLOOR IS OPEN/);
  assert.match(duelEmptyText(duel(), 'open', 'transcript'), /first argument/);
  assert.match(duelEmptyText(duel(), 'scheduled', 'transcript'), /when the Clash opens/);
  assert.match(duelEmptyText({ ...duel(), status: 'cancelled' }, 'closed', 'transcript'), /No visible arguments/);
  assert.match(duelEmptyText(duel(), 'open', 'evidence'), /No visible evidence/);
});
test('a leaked group result cannot supply or override a canonical duel verdict', () => {
  const payload = { roomId: 'r', roomMode: 'DUEL', clashId: 'cl', result: { winningSide: 'AGREE', agreeVotes: 999 }, duel: { ...duel(), roomId: 'r' } };
  assert.equal(parseArenaDuelRoom(payload).duel?.verdict, null);
  assert.equal(duelResultTitle(parseArenaDuelRoom(payload).duel!), null);
});
