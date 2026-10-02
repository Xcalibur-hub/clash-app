/**
 * Auth actions for CLASH — the only place the app talks to `supabase.auth`.
 * Screens call these through the `AuthProvider` hook.
 */

import {
  currentUserId,
  isLocalSupabase,
  requireSupabase,
  supabase,
  SupabaseError,
} from './supabaseClient';

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

/**
 * LOCAL STACK ONLY — password sign-in for the seeded `dev@clash.local` user.
 * Throws if the client is pointed at hosted Supabase (no production password path).
 */
export async function signInWithPasswordLocal(email: string, password: string): Promise<void> {
  if (!isLocalSupabase) {
    throw new SupabaseError('Password sign-in is only available against local Supabase.', 'local_only');
  }
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw new SupabaseError(error.message, error.code ?? 'password_sign_in');
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
