/**
 * Auth actions for CLASH — the only place the app talks to `supabase.auth` for
 * email OTP. Screens call these through the `AuthProvider` hook, so Google /
 * Apple sign-in can be added later by extending this file, not by replacing it.
 */

import { currentUserId, requireSupabase, supabase, SupabaseError } from './supabaseClient';

/** Sends a one-time code to `email`, creating the account on first use. */
export async function requestOtp(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw new SupabaseError(error.message, error.code ?? 'otp_request');
}

/** Exchanges the emailed code for a session. */
export async function verifyOtp(email: string, token: string): Promise<void> {
  const { error } = await requireSupabase().auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error) throw new SupabaseError(error.message, error.code ?? 'otp_verify');
}

/** Ends the session. A signed-out user is a guest again. */
export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new SupabaseError(error.message, error.code ?? 'sign_out');
}

/**
 * The signed-in user's id, throwing when there is no session. This is the
 * service-layer gate: write paths call it (via `requireViewerProfileId`) so a
 * signed-out caller fails loudly instead of being minted a throwaway identity.
 */
export async function requireUserId(): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new SupabaseError('Sign in to do that.', 'auth_required');
  return uid;
}
