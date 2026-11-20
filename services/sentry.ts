/**
 * Sentry bootstrap for CLASH.
 *
 * Initializes once at app start. Reporting is gated: requires
 * `EXPO_PUBLIC_SENTRY_DSN`, a preview/production app variant, and a non-dev
 * runtime. Missing DSN leaves the app fully functional with console-only logs.
 *
 * Privacy: never send OTP, tokens, emails, Vault media URLs, GPS, Mindshift
 * stance, or private content bodies. Prefer `logger.captureException` from
 * app code — do not call Sentry APIs from feature screens.
 */

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { redact } from './logRedact';

const dsn = (process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();

type AppVariant = 'development' | 'preview' | 'production';

function resolveVariant(): AppVariant {
  const fromExtra = Constants.expoConfig?.extra?.appVariant;
  if (fromExtra === 'development' || fromExtra === 'preview' || fromExtra === 'production') {
    return fromExtra;
  }
  return 'production';
}

const variant = resolveVariant();

/** True when this build is allowed to ship events (preview/production, release). */
export const sentryReportingEnabled =
  Boolean(dsn) && (variant === 'preview' || variant === 'production') && !__DEV__;

let initialized = false;

function scrubEvent<T extends Record<string, unknown>>(value: T): T {
  return redact(value) as T;
}

/**
 * Call once from the root layout before the tree mounts.
 * Safe to call when DSN is empty — SDK stays disabled.
 */
export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  Sentry.init({
    dsn: dsn || undefined,
    enabled: sentryReportingEnabled,
    environment: variant,
    sendDefaultPii: false,
    enableLogs: false,
    tracesSampleRate: 0,
    // Scrub breadcrumbs that might carry form fields, URLs, or auth noise.
    beforeBreadcrumb(breadcrumb) {
      if (!breadcrumb) return null;
      const data = breadcrumb.data
        ? (redact(breadcrumb.data) as Record<string, unknown>)
        : undefined;
      const message =
        typeof breadcrumb.message === 'string'
          ? scrubBreadcrumbMessage(breadcrumb.message)
          : breadcrumb.message;
      // Drop console breadcrumbs in production noise; keep navigation/error.
      if (breadcrumb.category === 'console' && breadcrumb.level !== 'error') {
        return null;
      }
      return { ...breadcrumb, data, message };
    },
    beforeSend(event) {
      if (!event) return null;
      if (event.user) {
        event.user = { id: event.user.id };
      }
      if (event.extra) {
        event.extra = scrubEvent(event.extra as Record<string, unknown>);
      }
      if (event.contexts) {
        // Scrub nested context bags without widening Sentry's Contexts type.
        for (const [key, ctx] of Object.entries(event.contexts)) {
          if (ctx && typeof ctx === 'object') {
            event.contexts[key] = scrubEvent(ctx as Record<string, unknown>);
          }
        }
      }
      if (event.request) {
        // Never forward bodies / headers that may hold OTP or tokens.
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          event.request.headers = scrubEvent(
            event.request.headers as Record<string, unknown>,
          ) as typeof event.request.headers;
        }
      }
      return event;
    },
  });
}

function scrubBreadcrumbMessage(message: string): string {
  // Defensive: obscure anything that looks like a long token or email.
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, '[redacted-token]');
}

/** Attach only the opaque auth/profile id. Clears for guests. */
export function setSentryUser(userId: string | null): void {
  if (!sentryReportingEnabled) return;
  if (userId) {
    Sentry.setUser({ id: userId });
  } else {
    Sentry.setUser(null);
  }
}

export function captureLoggerMessage(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (!sentryReportingEnabled) return;
  Sentry.captureMessage(message, {
    level: 'error',
    extra: context ? (redact(context) as Record<string, unknown>) : undefined,
  });
}

export function captureLoggerException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentryReportingEnabled) return;
  const err = error instanceof Error ? error : new Error(String(error));
  Sentry.captureException(err, {
    extra: context ? (redact(context) as Record<string, unknown>) : undefined,
  });
}

export { Sentry };
