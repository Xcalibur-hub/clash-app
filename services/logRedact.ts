/**
 * Shared redaction for logger + Sentry sinks.
 * Keys matched case-insensitively; never emit OTP, tokens, GPS, Vault URLs, etc.
 */

const SENSITIVE = new Set([
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'password',
  'otp',
  'otp_code',
  'code',
  'email',
  'secret',
  'apikey',
  'api_key',
  'service_role',
  'service_role_key',
  'dsn',
  'url',
  'path',
  'signed_url',
  'media_url',
  'content_url',
  'location',
  'latitude',
  'longitude',
  'coords',
  'gps',
  'address',
  'stance',
  'mindshift',
  'body',
  'content',
  'message_body',
  'private_content',
]);

/** Deep-redact sensitive keys. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      const sensitive =
        SENSITIVE.has(lower) ||
        lower.includes('token') ||
        lower.includes('password') ||
        lower.includes('secret') ||
        lower.includes('otp') ||
        lower.endsWith('_url');
      out[key] = sensitive ? '[redacted]' : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}
