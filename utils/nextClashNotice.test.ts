/** A failed next-Clash revalidation must stay visible without its CTA. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextClashActionVisible } from './nextClashNotice.ts';

describe('next Clash notice visibility', () => {
  it('shows the notice after the suggestion was cleared', () => {
    assert.equal(nextClashActionVisible({ hasVerdict: true, hasSuggestion: false, notice: 'No longer live.' }), true);
  });

  it('shows the actionable suggestion while it exists', () => {
    assert.equal(nextClashActionVisible({ hasVerdict: true, hasSuggestion: true, notice: null }), true);
    assert.equal(nextClashActionVisible({ hasVerdict: true, hasSuggestion: true, notice: 'Checking' }), true);
  });

  it('renders nothing without a verdict or without content', () => {
    assert.equal(nextClashActionVisible({ hasVerdict: false, hasSuggestion: false, notice: 'x' }), false);
    assert.equal(nextClashActionVisible({ hasVerdict: true, hasSuggestion: false, notice: null }), false);
  });
});
