import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diversifyVaultByCreator, vaultFreshnessScore } from './vaultHomeRank.ts';

describe('Vault home ranking', () => {
  it('avoids stacking the same creator when alternatives exist', () => {
    const out = diversifyVaultByCreator([
      { id: '1', creatorId: 'maya', score: 10 },
      { id: '2', creatorId: 'maya', score: 9 },
      { id: '3', creatorId: 'leo', score: 8 },
    ]);
    assert.equal(out[0]?.id, '1');
    assert.equal(out[1]?.id, '3');
    assert.ok(out.some((x) => x.id === '2'));
  });

  it('scores fresher drops higher', () => {
    const now = 1_000_000;
    assert.ok(vaultFreshnessScore(now - 3_600_000, now) > vaultFreshnessScore(now - 48 * 3_600_000, now));
  });
});
