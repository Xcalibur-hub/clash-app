import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';

/**
 * The single Supabase client for CLASH.
 *
 * Sessions live in AsyncStorage and refresh themselves in the background; the
 * refresh is paused while the app is backgrounded so a stale token is never
 * rotated on a frozen JS thread. `detectSessionInUrl` stays off — there is no
 * browser URL to parse, deep-link auth is a Phase 4 concern.
 *
 * `EXPO_PUBLIC_*` values are inlined at build time and are safe to ship: the
 * publishable key only grants what Row Level Security allows.
 */

export type ClashSupabaseClient = SupabaseClient<Database>;

/** Raised for transport/config failures so callers never see a raw PostgrestError. */
export class SupabaseError extends Error {
  /** Postgres/PostgREST code when the failure came from the server. */
  readonly code: string;

  constructor(message: string, code = 'unexpected') {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
  }
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False when `.env` is missing — the app then keeps running on seed data. */
export const isSupabaseConfigured: boolean = url.length > 0 && anonKey.length > 0;

/** Postgres codes worth explaining rather than echoing verbatim. */
const RLS_REFUSED = '42501';

/** Turns a raw PostgREST failure into the typed error the UI shows. */
export function requestError(error: PostgrestError): SupabaseError {
  const hint =
    error.code === RLS_REFUSED
      ? ' — refused by row level security. Is this profile linked to your session?'
      : '';
  return new SupabaseError(`${error.message}${hint}`, error.code);
}

/** Message for a caught value that may not be an Error (toasts, notices). */
export function errorText(error: unknown): string {
  if (error instanceof SupabaseError) return error.message;
  if (error instanceof Error) return error.message;
  return 'That did not reach the server. Try again.';
}

function buildClient(): ClashSupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  const client = createClient<Database>(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  AppState.addEventListener('change', (status: AppStateStatus): void => {
    if (status === 'active') void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  });

  return client;
}

/** Null when the environment variables are absent. Prefer `requireSupabase()`. */
export const supabase: ClashSupabaseClient | null = buildClient();

/** One anonymous sign-in attempt per app launch (see `ensureSession`). */
let anonymousAttempted = false;

/** The configured client, or a typed error explaining what is missing. */
export function requireSupabase(): ClashSupabaseClient {
  if (!supabase) {
    throw new SupabaseError(
      'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env and restart the bundler.',
      'not_configured',
    );
  }
  return supabase;
}

/**
 * The signed-in user id, or null — reads-only, never creates a session
 * (unlike `ensureSession`). Use it when a query needs the uid but a write
 * must not mint a throwaway user, e.g. resolving the linked profile at launch.
 */
export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the signed-in user's id, signing in anonymously when the app has no
 * session. RLS grants writes to `authenticated` only, so this is what makes the
 * insert policies reachable while CLASH still has no login screen. Returns null
 * when anonymous sign-in is disabled on the project — reads keep working.
 */
export async function ensureSession(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const existing = await currentUserId();
    if (existing) return existing;
    // Anonymous sign-in needs to be enabled in the dashboard; try once per launch
    // so a disabled project does not pay a round trip on every write.
    if (anonymousAttempted) return null;
    anonymousAttempted = true;
    const { data: created, error } = await supabase.auth.signInAnonymously();
    if (error) return null;
    return created.user?.id ?? null;
  } catch {
    return null;
  }
}
