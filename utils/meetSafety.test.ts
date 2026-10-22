import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MEET_REPORT_REASONS, meetReportNotice, meetReportReasonLabel } from './meetSafety.ts';
import type { MeetReportReason } from '../services/meetService.ts';

/**
 * Compile-time pin. If the server enum gains a value, this map stops type
 * checking, and the failures below point at the sheet that needs the new row.
 */
const ENUM: Record<MeetReportReason, true> = {
  child_safety: true,
  sexual: true,
  harassment: true,
  hate: true,
  violence: true,
  spam: true,
  impersonation: true,
  misinformation: true,
  copyright: true,
  other: true,
};

const values = MEET_REPORT_REASONS.map((option) => option.value);

describe('MEET_REPORT_REASONS', () => {
  it('covers the server enum exactly once per reason', () => {
    assert.deepEqual([...values].sort(), Object.keys(ENUM).sort());
    assert.equal(new Set(values).size, values.length);
  });

  it('leads with the reason that has to escalate fastest', () => {
    assert.equal(values[0], 'child_safety');
  });

  it('ends with a catch-all so nothing is unreportable', () => {
    assert.equal(values[values.length - 1], 'other');
    assert.equal(meetReportReasonLabel('other'), 'Something else');
  });

  it('labels every row short enough for a 320pt sheet', () => {
    for (const option of MEET_REPORT_REASONS) {
      assert.equal(option.label, option.label.trim(), `${option.value} has loose whitespace`);
      assert.ok(option.label.length > 2, `${option.value} label is too short`);
      assert.ok(option.label.length <= 40, `${option.value} label overflows the row`);
      assert.ok(!option.label.endsWith('.'), `${option.value} label is a sentence`);
    }
  });

  it('keeps labels distinct so two rows never read the same', () => {
    const labels = MEET_REPORT_REASONS.map((option) => option.label);
    assert.equal(new Set(labels).size, labels.length);
  });
});

describe('meetReportReasonLabel', () => {
  it('returns the sheet label for every selectable reason', () => {
    for (const option of MEET_REPORT_REASONS) {
      assert.equal(meetReportReasonLabel(option.value), option.label);
    }
  });

  it('falls back instead of returning empty copy', () => {
    assert.equal(meetReportReasonLabel(null), 'Something else');
    assert.equal(meetReportReasonLabel(undefined), 'Something else');
    assert.equal(meetReportReasonLabel('not_a_reason' as MeetReportReason), 'Something else');
  });
});

describe('meetReportNotice', () => {
  it('names the reason so the user can see what was filed', () => {
    assert.equal(
      meetReportNotice('harassment', 'session'),
      'Report sent: Harassment or threats. Thanks for flagging this conversation.',
    );
    assert.equal(
      meetReportNotice('sexual', 'message'),
      'Report sent: Sexual content. Thanks for flagging that message.',
    );
  });

  it('distinguishes a message report from a session report', () => {
    assert.notEqual(meetReportNotice('spam', 'message'), meetReportNotice('spam', 'session'));
  });

  it('never promises a moderation outcome or names the stranger', () => {
    for (const reason of values) {
      const notice = meetReportNotice(reason, 'session');
      assert.ok(!/deleted|removed|banned|suspended|blocked|will be|you will/i.test(notice), notice);
      assert.ok(!notice.includes('\n'), 'notice must fit one line');
      assert.ok(!/peer|alias/i.test(notice), notice);
    }
  });
});
