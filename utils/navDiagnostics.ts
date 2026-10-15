/**
 * Development-only navigation diagnostics for Arena Live entry.
 *
 * Phase 3.2J needed to answer: which route a card press takes, what the auth
 * guard decided, and whether the room screen mounted and asked for its room.
 * These helpers are pure and RN-free so the rules and the redacted payloads are
 * unit-testable; `navLog` below is the only side-effecting part and is a no-op
 * unless a development build opts in.
 *
 * Never logs tokens, credentials, private assists or room message bodies: the
 * payload keys are fixed and only ids/booleans/route strings are accepted.
 */

export const NAV_DIAGNOSTICS_ENV = 'EXPO_PUBLIC_ARENA_NAV_DIAGNOSTICS';

/** Payload keys the diagnostics may emit. Anything else is dropped. */
export const NAV_DIAGNOSTIC_KEYS = [
  'surface',
  'action',
  'destination',
  'roomId',
  'topicId',
  'signedIn',
  'loading',
  'mounted',
  'requested',
] as const;

export type NavDiagnosticKey = (typeof NAV_DIAGNOSTIC_KEYS)[number];
export type NavDiagnosticValue = string | boolean | number | null;
export type NavDiagnosticPayload = Partial<Record<NavDiagnosticKey, NavDiagnosticValue>>;

export interface NavDiagnosticsInput {
  isDev: boolean;
  flag: string | null | undefined;
}

/** On only in a development build that sets the flag to exactly `1`. */
export function navDiagnosticsEnabled({ isDev, flag }: NavDiagnosticsInput): boolean {
  if (isDev !== true) return false;
  return flag === '1';
}

export type GuardDecision = 'allow' | 'redirect:auth' | 'bail:loading';

/** Mirrors `useRequireAuth` exactly, so a logged decision always matches reality. */
export function guardDecision({ signedIn, loading }: { signedIn: boolean; loading: boolean }): GuardDecision {
  if (loading) return 'bail:loading';
  return signedIn ? 'allow' : 'redirect:auth';
}

/**
 * Which route a Live discovery card press should take: the room only when the
 * viewer already holds a room for that topic, otherwise the topic screen.
 */
export function cardDestination(viewerRoomId: string | null | undefined, topicId: string): string {
  return viewerRoomId ? `/arena/room/${viewerRoomId}` : `/arena/topic/${topicId}`;
}

/** Drops unknown keys so a careless call site cannot leak extra state. */
export function redactPayload(payload: NavDiagnosticPayload): NavDiagnosticPayload {
  const out: NavDiagnosticPayload = {};
  for (const key of NAV_DIAGNOSTIC_KEYS) {
    const value = payload[key];
    if (value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' || value === null) {
      out[key] = value;
    }
  }
  return out;
}

export const NAV_DIAGNOSTICS: boolean = navDiagnosticsEnabled({
  isDev: typeof __DEV__ !== 'undefined' && __DEV__ === true,
  flag: typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_ARENA_NAV_DIAGNOSTICS ?? null
    : null,
});

/** No-op unless NAV_DIAGNOSTICS; never throws into a press handler. */
export function navLog(event: string, payload: NavDiagnosticPayload): void {
  if (!NAV_DIAGNOSTICS) return;
  try {
    // eslint-disable-next-line no-console
    console.log('[clash:nav]', event, redactPayload(payload));
  } catch {
    /* diagnostics must never break navigation */
  }
}
