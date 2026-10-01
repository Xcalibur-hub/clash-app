/**
 * Pure Clash-start helpers — validation, mode contract, user-facing errors.
 * Kept free of React / Supabase client so Node can unit-test the press path.
 */

export const CLASH_MODES = ['STANDARD', 'BLIND'] as const;
export type ClashStartMode = (typeof CLASH_MODES)[number];

export function isClashStartMode(value: string): value is ClashStartMode {
  return value === 'STANDARD' || value === 'BLIND';
}

function errorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** Returns a human validation message, or null when the start may proceed. */
export function validateClashStart(input: {
  takeId: string | null | undefined;
  commentId: string | null | undefined;
  signedIn: boolean;
  authLoading?: boolean;
}): string | null {
  if (input.authLoading) return 'Still signing in…';
  if (!input.signedIn) return 'You need to sign in to start a Clash.';
  if (!input.takeId) return "Couldn't start this Clash. Try again.";
  if (!input.commentId) return 'Choose an opposing side first.';
  return null;
}

/** Map RPC / client failures to concise UI copy (never raw Postgres text). */
export function clashStartErrorMessage(error: unknown): string {
  const code = errorCode(error);
  switch (code) {
    case '42501':
      return 'You need to sign in to start a Clash.';
    case 'P0001':
      return "You can't Clash your own Take.";
    case 'P0002':
    case 'P0003':
      return 'This Take is no longer live.';
    case 'P0004':
      return 'Choose an opposing side first.';
    case 'P0005':
      return 'You already have an open Clash on this Take.';
    case 'not_configured':
      return "Couldn't start this Clash. Try again.";
    default:
      return "Couldn't start this Clash. Try again.";
  }
}

/**
 * Whether an already-open Clash should open the Clash route instead of failing.
 * P0005 = duplicate open clash for this challenger on this take.
 */
export function shouldOpenExistingClash(error: unknown): boolean {
  return errorCode(error) === 'P0005';
}
