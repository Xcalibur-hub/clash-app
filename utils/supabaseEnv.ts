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

export function localSupabaseApiUrl(): string {
  return `http://127.0.0.1:${LOCAL_SUPABASE_API_PORT}`;
}
