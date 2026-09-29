/**
 * Logging / crash-reporting seam for CLASH.
 *
 * One abstraction (info / warn / error / captureException) so the rest of the
 * app never calls a vendor SDK directly. Errors always reach the device console;
 * info/warn are development-only to keep production output quiet.
 *
 * SENTRY SEAM — intentionally dependency-free so local builds and `expo export`
 * never require the SDK. To enable Sentry in production:
 *   1. `npx expo install @sentry/react-native`
 *   2. set `EXPO_PUBLIC_SENTRY_DSN` (see `.env.example`)
 *   3. replace the two `// Sentry hook` markers below with
 *      `Sentry.captureMessage(message, { extra: safe })` and
 *      `Sentry.captureException(error, { extra: safe })`.
 *
 * NEVER log: OTP codes, access/refresh tokens, emails, private Vault content
 * URLs, exact location, or service keys. `redact()` scrubs those keys defensively
 * before anything is emitted.
 */

type LogLevel = 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

const isDev = process.env.NODE_ENV !== 'production';

/** Keys that must never reach a log sink, matched case-insensitively. */
const SENSITIVE = new Set([
  'token', 'access_token', 'refresh_token', 'authorization', 'password', 'otp',
  'code', 'email', 'secret', 'apikey', 'api_key', 'dsn', 'url', 'path',
  'location', 'latitude', 'longitude', 'address',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      out[key] = SENSITIVE.has(lower)
        ? '[redacted]'
        : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const safe = context ? (redact(context) as LogContext) : undefined;
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(`[clash:${level}]`, message, safe ?? '');
    // Sentry hook: captureMessage(message, { extra: safe })
    return;
  }
  if (isDev) {
    // eslint-disable-next-line no-console
    const sink = level === 'warn' ? console.warn : console.info;
    sink(`[clash:${level}]`, message, safe ?? '');
  }
}

export const logger = {
  info(message: string, context?: LogContext): void {
    emit('info', message, context);
  },
  warn(message: string, context?: LogContext): void {
    emit('warn', message, context);
  },
  error(message: string, context?: LogContext): void {
    emit('error', message, context);
  },
  captureException(error: unknown, context?: LogContext): void {
    const safe = context ? (redact(context) as LogContext) : undefined;
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error('[clash:error]', message, safe ?? '');
    // Sentry hook: captureException(error, { extra: safe })
  },
};
