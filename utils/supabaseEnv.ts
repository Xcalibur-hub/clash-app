/**
 * Detect whether the app is pointed at the LOCAL Supabase Docker stack.
 * Used for storage-key isolation, LOCAL badge, and local-only password sign-in.
 * Never true for hosted HTTPS projects.
 */
export function isLocalSupabaseUrl(url: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    );
  } catch {
    return false;
  }
}

/** This project's local API port (see supabase/config.toml [api].port). */
export const LOCAL_SUPABASE_API_PORT = 55321;

/** Canonical backend identity; never derive it from a key or an existing session. */
export function supabaseProjectScope(url: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''): string {
  if (!url) return 'unconfigured';
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Invalid Supabase origin.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Invalid Supabase origin.');
  }
  return parsed.origin;
}

/** A backend/account change remounts stores even when Auth UUIDs were preserved. */
export function backendAccountKey(account: string | null | undefined): string {
  return JSON.stringify([supabaseProjectScope(), account ?? null]);
}

/** Versioned project/account keys leave all legacy pending work and media untouched. */
export function backendCacheKey(namespace: string, account: string | null, ...parts: string[]): string {
  return JSON.stringify([namespace, supabaseProjectScope(), account, ...parts]);
}

/** Never read, migrate or delete the shared legacy hosted session. */
export function supabaseAuthStorageKey(url: string): string {
  const origin = supabaseProjectScope(url);
  if (origin === 'unconfigured') throw new Error('Invalid Supabase origin.');
  if (!isLocalSupabaseUrl(url)) return `sb-clash-project:${encodeURIComponent(origin)}:auth-token`;
  return new URL(url).port === String(LOCAL_SUPABASE_API_PORT)
    ? 'sb-clash-local-auth-token'
    : `sb-clash-local:${origin}:auth-token`;
}

export function localSupabaseApiUrl(): string {
  return `http://127.0.0.1:${LOCAL_SUPABASE_API_PORT}`;
}
