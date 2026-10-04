import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { packVaultWorldMosaicRows } from './vaultWorldMosaic.ts';

describe('vaultWorldMosaic', () => {
  it('packs feature then pair then single rhythm', () => {
    const items = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: String(n) }));
    const rows = packVaultWorldMosaicRows(items);
    assert.equal(rows[0]?.type, 'feature');
    assert.equal(rows[1]?.type, 'pair');
    assert.equal(rows[2]?.type, 'single');
    assert.equal(rows[0] && rows[0].type === 'feature' ? rows[0].large.id : '', '1');
  });

  it('handles short lists without inventing rows', () => {
    assert.equal(packVaultWorldMosaicRows([{ id: 'a' }])[0]?.type, 'single');
    assert.equal(packVaultWorldMosaicRows([{ id: 'a' }, { id: 'b' }])[0]?.type, 'pair');
  });
});
