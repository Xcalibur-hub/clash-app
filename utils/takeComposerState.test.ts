import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DUPLICATE_TAKE_COPY,
  canReclaimDraftUpload,
  isDuplicateTakeRejection,
  isPublishEnabled,
  publishCtaLabel,
  publishFailureCopy,
  publishHelperCopy,
  publishPhase,
  type ComposerPublishInput,
} from './takeComposerState.ts';

const ready = (patch: Partial<ComposerPublishInput> = {}): ComposerPublishInput => ({
  kind: 'take',
  hasText: true,
  overLimit: false,
  charsOver: 0,
  choicesValid: true,
  uploading: false,
  publishing: false,
  ...patch,
});

describe('take composer publish state', () => {
  it('treats an empty draft as empty and never as ready', () => {
    const phase = publishPhase(ready({ hasText: false }));
    assert.equal(phase, 'empty');
    assert.equal(isPublishEnabled(phase), false);
    assert.equal(publishHelperCopy(phase, 'take'), 'Write something first.');
  });

  it('reports uploading while media bytes are in flight, even with full text', () => {
    const phase = publishPhase(ready({ uploading: true, publishing: true }));
    assert.equal(phase, 'uploading');
    assert.equal(publishCtaLabel(phase, 'take'), 'Uploading…');
    assert.equal(publishHelperCopy(phase, 'take'), 'Uploading your media…');
    assert.equal(isPublishEnabled(phase), false);
    assert.notEqual(publishHelperCopy(phase, 'take'), 'Write something first.');
  });

  it('reports publishing once the upload has finished', () => {
    const phase = publishPhase(ready({ publishing: true }));
    assert.equal(phase, 'publishing');
    assert.equal(publishCtaLabel(phase, 'take'), 'Publishing…');
    assert.equal(publishHelperCopy(phase, 'take'), 'Publishing your take…');
    assert.equal(publishHelperCopy(phase, 'question'), 'Publishing your question…');
    assert.equal(isPublishEnabled(phase), false);
  });

  it('explains an over-limit draft instead of claiming it is empty', () => {
    const phase = publishPhase(ready({ overLimit: true, charsOver: 12 }));
    assert.equal(phase, 'over_limit');
    assert.equal(publishHelperCopy(phase, 'take', 12), 'Shorten your take by 12 characters.');
    assert.equal(publishHelperCopy(phase, 'take', 0), 'Shorten your take by 1 characters.');
    assert.equal(isPublishEnabled(phase), false);
  });

  it('keeps the ready CTA and copy per post type', () => {
    assert.equal(publishPhase(ready()), 'ready');
    assert.equal(publishCtaLabel('ready', 'take'), 'Drop It');
    assert.equal(publishCtaLabel('ready', 'question'), 'Publish question');
    assert.equal(publishHelperCopy('ready', 'take'), 'Your take self-destructs after 24 hours.');
    assert.equal(publishHelperCopy('ready', 'question'), 'Voting closes after 24 hours.');
    assert.equal(isPublishEnabled('ready'), true);
  });

  it('holds a question back until both choices are distinct', () => {
    const phase = publishPhase(ready({ kind: 'question', choicesValid: false }));
    assert.equal(phase, 'question_incomplete');
    assert.equal(publishHelperCopy(phase, 'question'), 'Add a question and two distinct choices.');
    assert.equal(isPublishEnabled(phase), false);
  });
});

describe('duplicate take rejection', () => {
  const duplicate = { code: 'P0006', message: 'you already dropped this take' };

  it('recognises only the create_take duplicate guard', () => {
    assert.equal(isDuplicateTakeRejection(duplicate), true);
    assert.equal(isDuplicateTakeRejection({ code: 'P0006', message: 'clash has not closed yet' }), false);
    assert.equal(isDuplicateTakeRejection({ code: '23505', message: 'you already dropped this take' }), false);
    assert.equal(isDuplicateTakeRejection(new Error('you already dropped this take')), false);
    assert.equal(isDuplicateTakeRejection(null), false);
    assert.equal(isDuplicateTakeRejection(undefined), false);
    assert.equal(isDuplicateTakeRejection('P0006'), false);
  });

  it('replaces raw server text with friendly copy and passes other failures through', () => {
    assert.equal(publishFailureCopy(duplicate, duplicate.message), DUPLICATE_TAKE_COPY);
    assert.equal(publishFailureCopy({ code: 'network', message: 'lost response' }, 'lost response'), 'lost response');
  });
});

describe('draft upload reclamation', () => {
  it('reclaims only an unpublished draft upload', () => {
    assert.equal(canReclaimDraftUpload(null), false);
    assert.equal(canReclaimDraftUpload({ published: false }), true);
    assert.equal(canReclaimDraftUpload({ published: true }), false);
  });
});
