/**
 * Take composer publish state and copy (spec §7).
 *
 * Pure rules so the footer can never describe an empty draft while an upload or
 * a publish is actually in flight — the Android keyboard made that wrong copy
 * visible, hiding the primary action behind the IME. No React Native imports:
 * unit-testable with `node --test`.
 */

export type ComposerKind = 'take' | 'question';

export type PublishPhase =
  | 'uploading'
  | 'publishing'
  | 'empty'
  | 'over_limit'
  | 'question_incomplete'
  | 'ready';

export interface ComposerPublishInput {
  kind: ComposerKind;
  /** Trimmed text is present. */
  hasText: boolean;
  overLimit: boolean;
  /** Characters past the limit, used for precise copy. */
  charsOver: number;
  /** Both A/B question choices are present and distinct. */
  choicesValid: boolean;
  uploading: boolean;
  publishing: boolean;
}

/** A publish already in flight outranks draft validation: show progress. */
export function publishPhase(input: ComposerPublishInput): PublishPhase {
  if (input.uploading) return 'uploading';
  if (input.publishing) return 'publishing';
  if (!input.hasText) return 'empty';
  if (input.overLimit) return 'over_limit';
  if (input.kind === 'question' && !input.choicesValid) return 'question_incomplete';
  return 'ready';
}

export function isPublishEnabled(phase: PublishPhase): boolean {
  return phase === 'ready';
}

export function publishCtaLabel(phase: PublishPhase, kind: ComposerKind): string {
  if (phase === 'uploading') return 'Uploading…';
  if (phase === 'publishing') return 'Publishing…';
  return kind === 'question' ? 'Publish question' : 'Drop It';
}

export function publishHelperCopy(
  phase: PublishPhase,
  kind: ComposerKind,
  charsOver = 0,
): string {
  switch (phase) {
    case 'uploading':
      return 'Uploading your media…';
    case 'publishing':
      return kind === 'question' ? 'Publishing your question…' : 'Publishing your take…';
    case 'over_limit':
      return `Shorten your take by ${Math.max(1, charsOver)} characters.`;
    case 'question_incomplete':
      return 'Add a question and two distinct choices.';
    case 'ready':
      return kind === 'question'
        ? 'Voting closes after 24 hours.'
        : 'Your take self-destructs after 24 hours.';
    case 'empty':
    default:
      return 'Write something first.';
  }
}

/**
 * `create_take` refuses an identical second Take with P0006. Matched on both the
 * code and the phrase so other P0006 guards (Clash/Rebuttal/Vault) never borrow
 * this copy.
 */
export const DUPLICATE_TAKE_COPY = 'You already dropped this take. Edit it, then publish again.';

const DUPLICATE_TAKE_PHRASE = 'already dropped this take';

export function isDuplicateTakeRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === 'P0006' &&
    typeof message === 'string' &&
    message.toLowerCase().includes(DUPLICATE_TAKE_PHRASE)
  );
}

/** Friendly copy for a rejected publish; the caller keeps the draft either way. */
export function publishFailureCopy(error: unknown, fallback: string): string {
  return isDuplicateTakeRejection(error) ? DUPLICATE_TAKE_COPY : fallback;
}

export interface DraftUpload {
  published: boolean;
}

/**
 * A draft upload may be reclaimed only while this composer session still owns it
 * and it never reached a published Take.
 *
 * Deliberately not applied to a duplicate rejection: the corrected retry reuses
 * the same uploaded object, so deleting it there would break the user's retry.
 * Reclamation runs only when the draft itself is abandoned.
 */
export function canReclaimDraftUpload(upload: DraftUpload | null): boolean {
  return upload !== null && !upload.published;
}
