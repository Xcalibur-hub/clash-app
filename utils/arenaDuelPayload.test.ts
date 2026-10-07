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
