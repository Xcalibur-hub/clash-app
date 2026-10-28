import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getPublicMediaImageSource,
  isTrustedPublicStorageObjectUrl,
} from './publicMediaImageSource.ts';

const QA = 'http://127.0.0.1:55481';
const HOSTED = 'https://example.supabase.co';
const KEY = 'qa-anon-test-key';

describe('isTrustedPublicStorageObjectUrl', () => {
  it('accepts public-media and private-media object paths on the configured origin', () => {
    assert.equal(
      isTrustedPublicStorageObjectUrl(
        `${QA}/storage/v1/object/public/public-media/u/m/a.png`,
        QA,
      ),
      true,
    );
    assert.equal(
      isTrustedPublicStorageObjectUrl(
        `${QA}/storage/v1/object/public/private-media/u/m/a.png`,
        QA,
      ),
      true,
    );
  });

  it('rejects foreign hosts, non-storage paths and credentialed URLs', () => {
    assert.equal(
      isTrustedPublicStorageObjectUrl('https://evil.example/storage/v1/object/public/public-media/a.png', QA),
      false,
    );
    assert.equal(isTrustedPublicStorageObjectUrl(`${QA}/rest/v1/profiles`, QA), false);
    assert.equal(
      isTrustedPublicStorageObjectUrl(`${QA}/storage/v1/object/sign/public-media/a.png`, QA),
      false,
    );
    assert.equal(
      isTrustedPublicStorageObjectUrl(`http://user:pass@127.0.0.1:55481/storage/v1/object/public/public-media/a.png`, QA),
      false,
    );
    assert.equal(isTrustedPublicStorageObjectUrl('not-a-url', QA), false);
  });
});

describe('getPublicMediaImageSource', () => {
  it('attaches only the publishable anon key for trusted Storage public URLs', () => {
    const source = getPublicMediaImageSource(
      `${QA}/storage/v1/object/public/public-media/a.png`,
      KEY,
      QA,
    );
    assert.deepEqual(source, {
      uri: `${QA}/storage/v1/object/public/public-media/a.png`,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
      },
    });
  });

  it('omits headers for external or untrusted URLs even when an anon key is present', () => {
    assert.deepEqual(
      getPublicMediaImageSource('https://media.tenor.com/abc.gif', KEY, QA),
      { uri: 'https://media.tenor.com/abc.gif' },
    );
    assert.deepEqual(
      getPublicMediaImageSource(`${HOSTED}/storage/v1/object/public/public-media/a.png`, KEY, QA),
      { uri: `${HOSTED}/storage/v1/object/public/public-media/a.png` },
    );
  });

  it('omits headers when the publishable key is absent', () => {
    assert.deepEqual(
      getPublicMediaImageSource(`${QA}/storage/v1/object/public/public-media/a.png`, '', QA),
      { uri: `${QA}/storage/v1/object/public/public-media/a.png` },
    );
  });

  it('never embeds a service-role or session-shaped secret as a distinct header value beyond the anon key argument', () => {
    const source = getPublicMediaImageSource(
      `${QA}/storage/v1/object/public/public-media/a.png`,
      KEY,
      QA,
    );
    assert.equal(source.headers?.apikey, KEY);
    assert.equal(source.headers?.Authorization, `Bearer ${KEY}`);
    assert.equal(Object.keys(source.headers ?? {}).sort().join(','), 'Authorization,apikey');
  });
});
