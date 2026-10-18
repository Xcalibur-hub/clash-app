/** UI hints only. The server remains authoritative for every write. */
export function takeIsArchived(expiresAt: number, now: number): boolean {
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

type Stack = { index: number; routes: readonly { name: string; params?: object }[] };

/** Pop to the original discussion, preserving its scroll/sort/draft state.
 * A Clash opened directly still pushes a discussion so Back returns to it.
 */
export function discussionEntry(stack: Stack | undefined, takeId: string): 'dismissTo' | 'push' {
  return stack?.routes.slice(0, stack.index).some(route =>
    route.name === 'take/[takeId]' &&
    (route.params as { takeId?: unknown } | undefined)?.takeId === takeId,
  ) ? 'dismissTo' : 'push';
}

export function openTakeDiscussion(
  router: { push(href: `/take/${string}`): void; dismissTo(href: `/take/${string}`): void },
  navigation: { getState(): Stack | undefined },
  takeId: string,
): void {
  // Read the local Stack at press time. Expo's root state wraps it in __root.
  router[discussionEntry(navigation.getState(), takeId)](`/take/${takeId}`);
}
