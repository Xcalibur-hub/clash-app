import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { looksLikeVideoUrl, resolveStillUrl } from './mediaStill.ts';
import type { TakeMedia } from '../store/types.ts';

const colors = ['#111', '#222'] as const;

function media(partial: Partial<TakeMedia> & Pick<TakeMedia, 'kind'>): TakeMedia {
  return {
    caption: '',
    colors: [...colors],
    ...partial,
  };
}

describe('resolveStillUrl', () => {
  it('uses image url for image takes', () => {
    assert.equal(
      resolveStillUrl(media({ kind: 'image', url: 'https://cdn.example/a.jpg' })),
      'https://cdn.example/a.jpg',
    );
  });

  it('never returns an mp4 as a still for video takes', () => {
    assert.equal(
      resolveStillUrl(
        media({
          kind: 'video',
          url: 'https://cdn.example/a.mp4',
        }),
      ),
      undefined,
    );
  });

  it('returns posterUrl for video takes', () => {
    assert.equal(
      resolveStillUrl(
        media({
          kind: 'video',
          url: 'https://cdn.example/a.mp4',
          posterUrl: 'https://cdn.example/a-poster.jpg',
        }),
      ),
      'https://cdn.example/a-poster.jpg',
    );
  });

  it('rejects a posterUrl that itself looks like a video', () => {
    assert.equal(
      resolveStillUrl(
        media({
          kind: 'video',
          url: 'https://cdn.example/a.mp4',
          posterUrl: 'https://cdn.example/a.mp4',
        }),
      ),
      undefined,
    );
  });

  it('rejects image kind whose url is an mp4', () => {
    assert.equal(
      resolveStillUrl(media({ kind: 'image', url: 'https://cdn.example/oops.mp4' })),
      undefined,
    );
  });
});

describe('looksLikeVideoUrl', () => {
  it('detects common video extensions', () => {
    assert.equal(looksLikeVideoUrl('https://x/a.mp4'), true);
    assert.equal(looksLikeVideoUrl('https://x/a.MOV?token=1'), true);
    assert.equal(looksLikeVideoUrl('https://x/a.jpg'), false);
  });
});
