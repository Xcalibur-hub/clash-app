import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evidenceHostLabel, isAllowedHttpUrl } from './liveArenaUrl.ts';

describe('isAllowedHttpUrl', () => {
  it('allows public https citations', () => {
    assert.equal(isAllowedHttpUrl('https://www.nature.com/articles/d41586-024-01000-x'), true);
    assert.equal(isAllowedHttpUrl('https://arxiv.org/abs/2401.12345'), true);
    assert.equal(isAllowedHttpUrl('https://example.co.uk:8443/report?year=2026'), true);
  });

  it('rejects any scheme other than https', () => {
    assert.equal(isAllowedHttpUrl('http://example.com/a'), false);
    assert.equal(isAllowedHttpUrl('javascript:alert(1)//example.com'), false);
    assert.equal(isAllowedHttpUrl('data:text/html;base64,PHA+'), false);
    assert.equal(isAllowedHttpUrl('file:///etc/passwd'), false);
  });

  it('rejects loopback, RFC1918 and link-local hosts', () => {
    assert.equal(isAllowedHttpUrl('https://localhost/admin'), false);
    assert.equal(isAllowedHttpUrl('https://127.0.0.1:54321/health'), false);
    assert.equal(isAllowedHttpUrl('https://10.0.0.8/internal'), false);
    assert.equal(isAllowedHttpUrl('https://192.168.1.4/router'), false);
    assert.equal(isAllowedHttpUrl('https://169.254.169.254/latest/meta-data'), false);
    assert.equal(isAllowedHttpUrl('https://172.16.4.9/private'), false);
    assert.equal(isAllowedHttpUrl('https://172.31.255.1/private'), false);
  });

  it('allows 172.x hosts outside the private range', () => {
    assert.equal(isAllowedHttpUrl('https://172.32.0.1.nip.io/page'), true);
  });

  it('rejects malformed, bare-host, whitespace and oversized urls', () => {
    assert.equal(isAllowedHttpUrl('not-a-url'), false);
    assert.equal(isAllowedHttpUrl('https://nodot/page'), false);
    assert.equal(isAllowedHttpUrl('https://example.com/a b'), false);
    assert.equal(isAllowedHttpUrl('https://a.c'), false, 'under the 12 char floor');
    assert.equal(isAllowedHttpUrl(`https://example.com/${'x'.repeat(2048)}`), false);
    assert.equal(isAllowedHttpUrl(null), false);
    assert.equal(isAllowedHttpUrl(undefined), false);
  });
});

describe('evidenceHostLabel', () => {
  it('returns a bare host for an allowed url', () => {
    assert.equal(evidenceHostLabel('https://www.nature.com/articles/x'), 'nature.com');
    assert.equal(evidenceHostLabel('https://arxiv.org:443/abs/1'), 'arxiv.org');
  });

  it('returns null for a url the server would refuse', () => {
    assert.equal(evidenceHostLabel('http://example.com/a'), null);
    assert.equal(evidenceHostLabel('https://127.0.0.1/a'), null);
  });
});
