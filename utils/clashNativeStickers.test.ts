import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLASH_NATIVE_STICKERS,
  clashStickerBySlug,
  encodeClashStickerBody,
  filterClashStickers,
  parseClashStickerBody,
} from './clashNativeStickers.ts';

describe('CLASH native stickers', () => {
  it('ships a real starter pack', () => {
    assert.ok(CLASH_NATIVE_STICKERS.length >= 12);
    assert.ok(clashStickerBySlug('bro'));
    assert.ok(clashStickerBySlug('let-him-cook'));
  });

  it('round-trips sticker body tokens', () => {
    const body = encodeClashStickerBody('cooked', 'he ate');
    const parsed = parseClashStickerBody(body);
    assert.equal(parsed?.sticker.slug, 'cooked');
    assert.equal(parsed?.text, 'he ate');
  });

  it('filters locally without a GIF provider', () => {
    const hits = filterClashStickers('ratio');
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.slug, 'ratio');
  });
});
