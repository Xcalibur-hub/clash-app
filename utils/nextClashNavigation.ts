/**
 * Navigation guard for the Next-Clash action. A pending revalidation may only
 * navigate while its token is still current; blur, unmount, room/account
 * changes and duplicate taps all invalidate it.
 */
export interface NavigationGuard {
  begin(): number;
  invalidate(): void;
  isCurrent(token: number): boolean;
}

export function createNavigationGuard(): NavigationGuard {
  let generation = 0;
  return {
    begin(): number {
      generation += 1;
      return generation;
    },
    invalidate(): void {
      generation += 1;
    },
    isCurrent(token: number): boolean {
      return Number.isFinite(token) && token === generation;
    },
  };
}

export type NextClashResolution = 'accepted' | 'stale' | 'unavailable' | 'failed';

/**
 * Await the room read, then decide. `isCurrent` is checked both before and
 * after the await so a stale response can never be applied.
 */
export async function resolveNextClashTarget<T>(input: {
  token: number;
  isCurrent: (token: number) => boolean;
  fetchRoom: () => Promise<T | null>;
  accept: (room: T | null) => boolean;
}): Promise<NextClashResolution> {
  if (!input.isCurrent(input.token)) return 'stale';
  let room: T | null;
  try {
    room = await input.fetchRoom();
  } catch {
    return input.isCurrent(input.token) ? 'failed' : 'stale';
  }
  if (!input.isCurrent(input.token)) return 'stale';
  return input.accept(room) ? 'accepted' : 'unavailable';
}
