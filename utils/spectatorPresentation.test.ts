/** Spectator presentation copy and support/reaction distinctions. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  privateAssistPrivacyLabel,
  spectatorCrowdEmptyCopy,
  spectatorReactionHint,
  spectatorSupportHint,
} from './spectatorPresentation.ts';

describe('spectator presentation', () => {
  it('keeps support language distinct from judgement', () => {
    assert.match(spectatorSupportHint(), /NOT A JUDGEMENT/);
    assert.doesNotMatch(spectatorSupportHint(), /\bvote\b/i);
    assert.match(spectatorReactionHint(), /not a vote/i);
  });

  it('labels private assists with recipient and privacy', () => {
    assert.equal(privateAssistPrivacyLabel('Alex Morgan', 'A'), 'Private to Alex Morgan · Fighter A');
    assert.match(privateAssistPrivacyLabel('Priya', 'B'), /Private to Priya/);
  });

  it('describes live, empty, loading and closed crowd states', () => {
    assert.match(
      spectatorCrowdEmptyCopy({
        readOnly: false,
        loading: false,
        hasContext: true,
        hasCrowdModel: true,
      }),
      /No Crowd messages/,
    );
    assert.match(
      spectatorCrowdEmptyCopy({
        readOnly: true,
        loading: false,
        hasContext: true,
        hasCrowdModel: true,
      }),
      /closed/i,
    );
    assert.equal(
      spectatorCrowdEmptyCopy({
        readOnly: false,
        loading: true,
        hasContext: false,
        hasCrowdModel: true,
      }),
      'Loading Crowd…',
    );
    assert.equal(
      spectatorCrowdEmptyCopy({
        readOnly: true,
        loading: false,
        hasContext: false,
        hasCrowdModel: true,
        unavailableReason: 'Crowd chat is unavailable because this Clash was cancelled.',
      }),
      'Crowd chat is unavailable because this Clash was cancelled.',
    );
  });
});
