/**
 * Client mirror of `public.is_allowed_http_url` (Phase 13 Live Arena).
 *
 * The server is still the authority — evidence links are re-validated inside
 * `submit_arena_evidence` and a rejection there is the one that counts. This
 * copy exists so the composer can disable its own submit button instead of
 * spending a round trip to learn the link was never going to be accepted.
 *
 * Keep the two in lockstep: HTTPS only (so `javascript:`, `data:`, `file:` and
 * plain `http:` all fail on the scheme alone), a host that looks like a real
 * domain, and no loopback / RFC1918 / link-local target that could be used to
 * probe infrastructure through a link unfurler.
 */

const MIN_LENGTH = 12;
const MAX_LENGTH = 2048;

/** Mirrors the server regex: https, labelled host, alphabetic TLD, optional port/path. */
const SHAPE =
  /^https:\/\/[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,24}(:[0-9]{1,5})?(\/[^\s]*)?$/;

/** Loopback, RFC1918 and link-local literals the server refuses outright. */
const PRIVATE_HOST = /^https:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i;
const PRIVATE_172 = /^https:\/\/172\.(1[6-9]|2[0-9]|3[01])\./i;

/** True for a link the Arena may cite. Never weaker than the server rule. */
export function isAllowedHttpUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string') return false;
  if (url.length < MIN_LENGTH || url.length > MAX_LENGTH) return false;
  if (/\s/.test(url)) return false;
  if (!SHAPE.test(url)) return false;
  if (PRIVATE_HOST.test(url)) return false;
  if (PRIVATE_172.test(url)) return false;
  return true;
}

/** Short hostname for an evidence card ("nature.com"), or null when unusable. */
export function evidenceHostLabel(url: string | null | undefined): string | null {
  if (!isAllowedHttpUrl(url)) return null;
  const withoutScheme = (url as string).slice('https://'.length);
  const host = withoutScheme.split('/')[0].split(':')[0];
  return host.replace(/^www\./i, '') || null;
}
