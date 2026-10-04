import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  creatorIdentityLine,
  creatorWorldChapterTitle,
  editorialTitleLines,
  vaultAccessMeta,
  vaultTintWash,
  worldHappeningLine,
  worldStackLayout,
} from './vaultPresentation.ts';

describe('vaultPresentation', () => {
  it('assigns featured then alternating wide/portrait stack layouts', () => {
    assert.equal(worldStackLayout(0), 'featured');
    assert.equal(worldStackLayout(1), 'wide');
    assert.equal(worldStackLayout(2), 'portrait');
    assert.equal(worldStackLayout(3), 'wide');
  });

  it('splits titles into editorial lines', () => {
    assert.deepEqual(editorialTitleLines('Midnight Files'), ['MIDNIGHT', 'FILES']);
    assert.deepEqual(editorialTitleLines('Tokyo'), ['TOKYO']);
  });

  it('shortens identity and happening lines without inventing categories', () => {
    assert.equal(creatorIdentityLine('Horror filmmaker and visual storyteller.'), 'Horror filmmaker and visual storyteller');
    assert.equal(creatorIdentityLine(null), 'Creator');
    assert.equal(
      worldHappeningLine({ latestCaption: 'I found this tape behind the wall.', latestAccess: 'free' }),
      'I found this tape behind the wall.',
    );
    assert.equal(
      worldHappeningLine({ latestCaption: null, latestAccess: null, hasCourses: true }),
      'New lessons inside',
    );
  });

  it('keeps access meta tiny and chapter titles editorial', () => {
    assert.equal(vaultAccessMeta('preview'), 'PREVIEW');
    assert.equal(vaultAccessMeta('FREE'), 'FREE');
    assert.equal(creatorWorldChapterTitle('CONTENT', 'Maya'), 'TONIGHT');
    assert.equal(creatorWorldChapterTitle('COURSES', 'Maya'), 'LEARN WITH MAYA');
    assert.equal(creatorWorldChapterTitle('STORE', 'Maya'), 'FROM MAYA');
  });

  it('derives a soft tint wash from creator tint', () => {
    assert.equal(vaultTintWash('#C45C26', 0.2), 'rgba(196,92,38,0.2)');
    assert.match(vaultTintWash('bad', 0.1), /^rgba\(/);
  });
});
