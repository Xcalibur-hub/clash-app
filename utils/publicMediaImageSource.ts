/**
 * RN Image `source` for a public Storage object URL.
 *
 * Hosted Supabase serves `/object/public/...` without headers; the local QA
 * gateway (and some proxies) require the publishable `apikey`. Headers are
 * attached only for intended trusted Storage public-object URLs on the
 * configured Supabase origin — never for arbitrary external images, and never
 * with a session JWT or service-role key.
 */

const PUBLIC_OBJECT_PATH =
  /^\/storage\/v1\/object\/public\/(public-media|private-media)(?:\/|$)/i;

function configuredSupabaseOrigin(
  supabaseUrl: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
): string | null {
  const raw = supabaseUrl.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/** True when `url` is a public Storage object on the configured Supabase origin. */
export function isTrustedPublicStorageObjectUrl(
  url: string,
  supabaseUrl: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
): boolean {
  const origin = configuredSupabaseOrigin(supabaseUrl);
  if (!origin) return false;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== origin) return false;
    if (parsed.username || parsed.password) return false;
    return PUBLIC_OBJECT_PATH.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function getPublicMediaImageSource(
  url: string,
  anonKey: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseUrl: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
): { uri: string; headers?: { [key: string]: string } } {
  if (!anonKey || !isTrustedPublicStorageObjectUrl(url, supabaseUrl)) {
    return { uri: url };
  }
  return {
    uri: url,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  };
}
