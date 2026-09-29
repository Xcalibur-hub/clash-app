import type { ChallengerComment, Realm, Take, ThemeMode, User } from './types';
import type { ArenaSnapshot, ClashAction } from './reducer';

/** Typed action creators — screens never build action objects by hand. */

export const markOnboarded = (): ClashAction => ({ type: 'app/onboarded' });

export const switchRealm = (realm: Realm): ClashAction => ({ type: 'realm/switch', realm });

export const toggleSave = (takeId: string): ClashAction => ({ type: 'take/save', takeId });

export const reactToTake = (takeId: string): ClashAction => ({ type: 'take/react', takeId });

/** Drop a brand-new Take (spec §7) — reputation is server-authoritative. */
export const createTake = (take: Take): ClashAction => ({ type: 'take/create', take });

export const createComment = (comment: ChallengerComment): ClashAction => ({
  type: 'comment/create',
  comment,
});

export const toggleCommentUpvote = (commentId: string): ClashAction => ({
  type: 'comment/upvote',
  commentId,
});

/** Land the server tally after an RPC flip — or roll an optimistic flip back. */
export const syncCommentUpvote = (
  commentId: string,
  upvoted: boolean,
  upvotes: number,
): ClashAction => ({
  type: 'comment/upvote/sync',
  commentId,
  upvoted,
  upvotes,
});

/** Land the server tally after `toggle_take_reaction` — or roll a flip back. */
export const syncTakeReaction = (
  takeId: string,
  reacted: boolean,
  reactions: number,
): ClashAction => ({
  type: 'take/reaction/sync',
  takeId,
  reacted,
  reactions,
});

/** Swap the bundled snapshot for the live Arena built by `hydrationService`. */
export const hydrateArena = (snapshot: ArenaSnapshot): ClashAction => ({
  type: 'data/hydrate',
  snapshot,
});

/** Cold-start Arena load begins (no-op for UI once live data exists). */
export const arenaLoading = (): ClashAction => ({ type: 'arena/loading' });

/** Arena hydrate failed — cold start clears feed; refresh keeps live data. */
export const arenaFailed = (message: string): ClashAction => ({
  type: 'arena/error',
  message,
});

/** Swap the signed-in viewer (or back to the guest identity). */
export const setViewer = (viewer: User): ClashAction => ({ type: 'viewer/set', viewer });

/**
 * Analytics is a local unlock stub: it flips a UI flag only. It deliberately
 * grants no Vault content — entitlements live in `vault_subscriptions`, which the
 * client cannot write (see `services/vaultService.ts`).
 */
export const setAnalytics = (unlocked: boolean): ClashAction => ({
  type: 'vault/analytics',
  unlocked,
});

export const setThemeMode = (mode: ThemeMode): ClashAction => ({ type: 'theme/mode', mode });

export const showNotice = (message: string): ClashAction => ({ type: 'ui/notice', message });

export const clearNotice = (): ClashAction => ({ type: 'ui/notice', message: null });
