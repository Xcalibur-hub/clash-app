import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArenaDuelRoom } from './arenaDuelPayload.ts';
const fixture = () => ({ roomId: 'r', roomMode: 'DUEL', clashId: 'c', duel: {
  roomId: 'r', clashId: 'c', status: 'open', fighterA: { id: 'a', name: 'A', handle: 'a' },
  fighterB: { id: 'b', name: 'B', handle: 'b' }, viewerRelationship: 'spectator',
  mayJudge: true, hasJudged: false, verdict: null,
} });
test('legacy payloads remain group rooms', () => {
  assert.deepEqual(parseArenaDuelRoom({ roomId: 'legacy' }), { roomMode: 'GROUP', clashId: null, duel: null });
});
test('canonical fighters are read without roster ordering', () => {
  const result = parseArenaDuelRoom(fixture());
  assert.equal(result.duel?.fighterA.id, 'a'); assert.equal(result.duel?.fighterB.id, 'b');
});
test('mismatched links and unmarked duels fail closed', () => {
  const p = fixture(); p.duel.clashId = 'wrong'; assert.throws(() => parseArenaDuelRoom(p));
  assert.throws(() => parseArenaDuelRoom({ clashId: 'c' }));
});
test('fighters cannot receive spectator judging permission', () => {
  const p = fixture(); p.duel.viewerRelationship = 'fighter_a'; assert.throws(() => parseArenaDuelRoom(p));
});
test('settled requires a canonical verdict and open cannot have one', () => {
  const p = fixture(); p.duel.status = 'settled'; p.duel.mayJudge = false;
  assert.throws(() => parseArenaDuelRoom(p));
  const settled = { ...p, duel: { ...p.duel, verdict: { winnerSide: 'DRAW', jurySize: 2, verdictLabel: 'DRAW' } } };
  assert.equal(parseArenaDuelRoom(settled).duel?.verdict?.winnerSide, 'DRAW');
  settled.duel.status = 'open'; assert.throws(() => parseArenaDuelRoom(settled));
});
test('duplicate fighter identities and invalid verdicts are rejected', () => {
  const p = fixture(); p.duel.fighterB.id = 'a'; assert.throws(() => parseArenaDuelRoom(p));
  assert.throws(() => parseArenaDuelRoom({ ...fixture(), duel: { ...fixture().duel,
    status: 'settled', mayJudge: false, verdict: { winnerSide: 'AGREE', jurySize: 2, verdictLabel: 'bad' } } }));
});
test('existing source and counter-position pass through without invented summaries', () => {
  const p = { ...fixture(), duel: { ...fixture().duel, sideAText: 'Original Take', sideBText: 'Accepted counter-position', fighterA: { id: 'a', name: 'A', handle: 'a', tint: '#aaa' } } };
  assert.equal(parseArenaDuelRoom(p).duel?.sourceText, 'Original Take');
  assert.equal(parseArenaDuelRoom(p).duel?.counterPosition, 'Accepted counter-position');
  assert.equal(parseArenaDuelRoom(p).duel?.fighterA.tint, '#aaa');
  assert.throws(() => parseArenaDuelRoom({ ...p, duel: { ...p.duel, sideBText: { text: 'forged' } } }));
});
test('older Phase 1 payloads have no fabricated positions or score split', () => {
  const d = parseArenaDuelRoom(fixture()).duel!;
  assert.equal(d.sourceText, ''); assert.equal(d.counterPosition, '');
});
test('settled ballot split must be a complete, nonnegative canonical jury tally', () => {
  const p = { ...fixture(), duel: { ...fixture().duel, status: 'settled', mayJudge: false,
    verdict: { winnerSide: 'A', verdictLabel: 'STRONG', jurySize: 3, sideAScore: 2, sideBScore: 1 } } };
  assert.equal(parseArenaDuelRoom(p).duel?.verdict?.sideBScore, 1);
  for (const split of [{ sideAScore: 4 }, { sideAScore: -1 }, { sideAScore: 1.5 }, { sideBScore: undefined }]) {
    assert.throws(() => parseArenaDuelRoom({ ...p, duel: { ...p.duel, verdict: { ...p.duel.verdict, ...split } } }));
  }
});
