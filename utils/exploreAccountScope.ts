/**
 * Account/route scoping for Explore surfaces (Explore E2.5 D2).
 *
 * Explore screens keep their discovery state — World mode, Map/Globe, selected
 * country — in local React state. An identity change must always reset that
 * state, but a route change must not: pushing a country page (or switching tabs)
 * has to return to the same World context instead of remounting at For You.
 */

export interface ExploreAccountScope {
  userId: string | null | undefined;
  path: string;
  /** Keep screen state when only the route path changes. */
  retainAcrossPaths?: boolean;
}

/** Stable guest identity so signed-out sessions are still scoped by account. */
export function exploreAccountIdentity(userId: string | null | undefined): string {
  const id = (userId ?? '').trim();
  return id || 'guest';
}

/**
 * React `key` for an Explore screen.
 *
 * Signed-in/guest identity is always part of the key — local discovery state must
 * never survive an identity change. The route is only included for screens that
 * should start fresh per path; World opts out so navigation keeps the screen
 * mounted (React Navigation's normal lifecycle) and the selection survives.
 */
export function exploreAccountKey({
  userId,
  path,
  retainAcrossPaths = false,
}: ExploreAccountScope): string {
  const identity = exploreAccountIdentity(userId);
  if (retainAcrossPaths) return identity;
  return `${identity}:${path.trim() || '/'}`;
}
