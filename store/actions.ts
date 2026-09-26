import type { ChallengerComment, ClashResult, Judgement, Realm, Take, ThemeMode } from './types';
import type { ArenaSnapshot, ClashAction } from './reducer';

/** Typed action creators — screens never build action objects by hand. */

export const markOnboarded = (): ClashAction => ({ type: 'app/onboarded' });

export const switchRealm = (realm: Realm): ClashAction => ({ type: 'realm/switch', realm });

/** Cast the viewer's ballot — the store records it; the jury settles later. */
export const recordBallot = (clashId: string, judgement: Judgement): ClashAction => ({
  type: 'clash/ballot',
  clashId,
  judgement,
});

/** File the final verdict once the end-of-day clock runs out. */
export const settleClash = (result: ClashResult): ClashAction => ({
  type: 'clash/settle',
  result,
});

export const toggleSave = (takeId: string): ClashAction => ({ type: 'take/save', takeId });

export const reactToTake = (takeId: string): ClashAction => ({ type: 'take/react', takeId });

/** Drop a brand-new Take (spec §7) — the store pays the +30 XP creation award. */
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

/** Swap the bundled snapshot for the live Arena built by `hydrationService`. */
export const hydrateArena = (snapshot: ArenaSnapshot): ClashAction => ({
  type: 'data/hydrate',
  snapshot,
});

export const unlockDrop = (dropId: string): ClashAction => ({ type: 'vault/unlock', dropId });

export const setAnalytics = (unlocked: boolean): ClashAction => ({
  type: 'vault/analytics',
  unlocked,
});

export const setThemeMode = (mode: ThemeMode): ClashAction => ({ type: 'theme/mode', mode });

export const showNotice = (message: string): ClashAction => ({ type: 'ui/notice', message });

export const clearNotice = (): ClashAction => ({ type: 'ui/notice', message: null });
