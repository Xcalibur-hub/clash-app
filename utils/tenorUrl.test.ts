import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAllowedTenorUrl } from '../services/tenorService.ts';

describe('isAllowedTenorUrl', () => {
  it('allows https tenor CDN hosts', () => {
    assert.equal(isAllowedTenorUrl('https://media.tenor.com/abc/tiny.gif'), true);
    assert.equal(isAllowedTenorUrl('https://c.tenor.com/x/tinys.gif'), true);
    assert.equal(isAllowedTenorUrl('https://media1.tenor.com/n/a.gif'), true);
  });

  it('rejects http, non-tenor, and malformed urls', () => {
    assert.equal(isAllowedTenorUrl('http://media.tenor.com/x.gif'), false);
    assert.equal(isAllowedTenorUrl('https://evil.example/x.gif'), false);
    assert.equal(isAllowedTenorUrl('not-a-url'), false);
  });
});
