/**
 * Meet safety copy and reason mapping (E3.2).
 *
 * `MEET_REPORT_REASONS` mirrors the server `report_reason` enum, but the order is
 * chosen for a person in a live conversation, not for the database: the reason
 * that escalates fastest (a possible minor) sits first.
 *
 * Labels are noun phrases because the same string is reused in three places: the
 * picker row, the accessibility label, and the confirmation notice
 * ("Report sent: Harassment or threats."). Pure module: no React, no network.
 * `utils/meetSafety.test.ts` pins the list to the enum, so a server-side addition
 * cannot silently leave the sheet stale.
 */
import type { MeetReportReason } from '../services/meetService';

export interface MeetReportReasonOption {
  value: MeetReportReason;
  label: string;
}

export const MEET_REPORT_REASONS: readonly MeetReportReasonOption[] = [
  { value: 'child_safety', label: 'Child safety (they may be a minor)' },
  { value: 'sexual', label: 'Sexual content' },
  { value: 'harassment', label: 'Harassment or threats' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'violence', label: 'Violence or self-harm' },
  { value: 'spam', label: 'Spam, scam or a bot' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'misinformation', label: 'Deliberately false information' },
  { value: 'copyright', label: 'Stolen content' },
  { value: 'other', label: 'Something else' },
];

/** `other` is the fallback: a stale or unknown value must still be reportable. */
export function meetReportReasonLabel(value: MeetReportReason | null | undefined): string {
  const match = MEET_REPORT_REASONS.find((option) => option.value === value);
  return match ? match.label : 'Something else';
}

/**
 * Confirmation copy. It states what was sent, not what will happen: reports are
 * reviewed asynchronously and the reporter is never told the outcome.
 */
export function meetReportNotice(value: MeetReportReason, target: 'session' | 'message'): string {
  const what = target === 'message' ? 'that message' : 'this conversation';
  return `Report sent: ${meetReportReasonLabel(value)}. Thanks for flagging ${what}.`;
}
