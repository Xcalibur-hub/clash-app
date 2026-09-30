/**
 * Logging / crash-reporting seam for CLASH.
 *
 * One abstraction (info / warn / error / captureException) so the rest of the
 * app never calls a vendor SDK directly. Errors always reach the device console;
 * info/warn are development-only to keep production output quiet.
 *
 * Meaningful `error` / `captureException` calls are forwarded to Sentry when
 * reporting is enabled (see `services/sentry.ts`). Do not capture every
 * harmless API failure — prefer warn for expected client errors.
 *
 * NEVER log: OTP codes, access/refresh tokens, emails, private Vault content
 * URLs, exact location, Mindshift stance, private content bodies, or service
 * keys. `redact()` scrubs those keys defensively before anything is emitted.
 */

import { redact } from './logRedact';
import {
  captureLoggerException,
  captureLoggerMessage,
} from './sentry';

type LogLevel = 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

const isDev = process.env.NODE_ENV !== 'production';

export { redact };

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const safe = context ? (redact(context) as LogContext) : undefined;
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(`[clash:${level}]`, message, safe ?? '');
    captureLoggerMessage(message, safe);
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
    captureLoggerException(error, safe);
  },
};
