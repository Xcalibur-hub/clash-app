import type { ClashState } from './reducer';
import type {
  Campaign,
  ChallengerComment,
  Clash,
  ClashResult,
  CommentSort,
  Creator,
  FeedScope,
  HoodFilter,
  HoodId,
  HoodSort,
  Take,
  ThemeMode,
  User,
} from './types';

/** Pure read helpers. Screens stay declarative and the shapes stay typed. */

export interface WinEntry {
  clash: Clash;
  take: Take;
  result: ClashResult;
}

export function selectViewer(state: ClashState): User {
  return state.viewer;
}

export function selectThemeMode(state: ClashState): ThemeMode {
  return state.themeMode;
}

export function selectAuthor(state: ClashState, authorId: string): User | undefined {
  return authorId === state.viewer.id ? state.viewer : state.users[authorId];
}

export function selectLiveTakes(state: ClashState, now: number = Date.now()): readonly Take[] {
  return state.takes.filter((take) => take.expiresAt > now);
}

/** Heat ranks the For You feed: clashes weigh more than reactions. */
function heat(take: Take): number {
  return take.clashes * 3 + take.reactions;
}

export function selectFeed(state: ClashState, hood: HoodId, now: number = Date.now()): Take[] {
  const live = selectLiveTakes(state, now);
  if (hood === 'for-you') {
    return [...live].sort((a, b) => heat(b) - heat(a));
  }
  return live
    .filter((take) => take.hood === hood)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** The Hood page feed: Hot (heat), New (created_at) or Top (engagement). */
export function selectHoodFeed(
  state: ClashState,
  hood: Exclude<HoodId, 'for-you'>,
  sort: HoodSort,
  now: number = Date.now(),
): Take[] {
  const live = selectLiveTakes(state, now).filter((take) => take.hood === hood);
  if (sort === 'new') return live.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (sort === 'top') return live.slice().sort((a, b) => engagement(b) - engagement(a));
  return live.slice().sort((a, b) => heat(b) - heat(a));
}

/** A node in the threaded rebuttal tree. */
export interface CommentNode {
  comment: ChallengerComment;
  children: CommentNode[];
}

/**
 * Builds the thread tree. Children are ordered oldest-first; top-level rebuttals
 * are ordered by the chosen sort. A reply whose parent is unavailable (removed)
 * is promoted to top-level so its descendants are never orphaned.
 */
export function buildCommentTree(
  comments: readonly ChallengerComment[],
  sort: CommentSort,
): CommentNode[] {
  const byId = new Map<string, ChallengerComment>();
  for (const comment of comments) byId.set(comment.id, comment);

  const children = new Map<string, ChallengerComment[]>();
  for (const comment of comments) {
    if (!comment.parentId || !byId.has(comment.parentId)) continue;
    const list = children.get(comment.parentId) ?? [];
    list.push(comment);
    children.set(comment.parentId, list);
  }

  const build = (comment: ChallengerComment): CommentNode => {
    const kids = (children.get(comment.id) ?? []).slice().sort((a, b) => a.createdAt - b.createdAt);
    return { comment, children: kids.map(build) };
  };

  const tops = comments.filter((comment) => !comment.parentId || !byId.has(comment.parentId));
  tops.sort((a, b) =>
    sort === 'new' ? b.createdAt - a.createdAt : b.upvotes - a.upvotes || b.createdAt - a.createdAt,
  );
  return tops.map(build);
}

/** "Popular" ranks by total engagement; clashes stay slightly weighted. */
function engagement(take: Take): number {
  return take.clashes * 2 + take.reactions;
}

/** Featured stack candidates — media preferred, text Takes fill so the deck can fan. */
export function selectFeaturedMediaTakes(
  state: ClashState,
  now: number = Date.now(),
  limit = 8,
): Take[] {
  const ranked = selectLiveTakes(state, now)
    .slice()
    .sort((a, b) => engagement(b) - engagement(a) || b.createdAt - a.createdAt);
  const media = ranked.filter((take) => take.media != null);
  if (media.length >= limit) return media.slice(0, limit);
  const mediaIds = new Set(media.map((take) => take.id));
  const textFill = ranked.filter((take) => !mediaIds.has(take.id));
  return [...media, ...textFill].slice(0, limit);
}

/**
 * The Arena home feed for a given scope + community filter.
 *   for-you    → heat (clash-weighted relevance)
 *   following  → live takes from followed authors, newest first
 *   popular    → engagement-weighted live takes
 *   new        → newest live takes first
 */
export function selectFeedForScope(
  state: ClashState,
  scope: FeedScope,
  hood: HoodFilter,
  now: number = Date.now(),
  followingIds: ReadonlySet<string>,
): Take[] {
  const live = selectLiveTakes(state, now);
  const inScope = hood === 'all' ? live : live.filter((take) => take.hood === hood);
  if (scope === 'for-you' && state.forYouTakeIds) {
    const byId = new Map(inScope.map(take => [take.id, take]));
    return state.forYouTakeIds.flatMap(id => { const take = byId.get(id); return take ? [take] : []; });
  }
  const generalIds = state.generalTakeIds ? new Set(state.generalTakeIds) : null;
  const general = generalIds ? inScope.filter(take => generalIds.has(take.id)) : inScope;

  if (scope === 'following') {
    return general
      .filter((take) => followingIds.has(take.authorId))
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  const list = general.slice();
  if (scope === 'new') return list.sort((a, b) => b.createdAt - a.createdAt);
  if (scope === 'popular') return list.sort((a, b) => engagement(b) - engagement(a));
  return list.sort((a, b) => heat(b) - heat(a));
}

export function selectIsSaved(state: ClashState, takeId: string): boolean {
  return state.savedTakeIds.includes(takeId);
}

export function selectCommentsForTake(state: ClashState, takeId: string): ChallengerComment[] {
  return state.comments.filter((comment) => comment.takeId === takeId);
}

export function selectTopComment(state: ClashState, takeId: string): ChallengerComment | undefined {
  const list = selectCommentsForTake(state, takeId);
  if (list.length === 0) return undefined;
  return list.reduce((best, next) => (next.upvotes > best.upvotes ? next : best), list[0] as ChallengerComment);
}

export function selectHasReacted(state: ClashState, takeId: string): boolean {
  return state.reactedTakeIds.includes(takeId);
}

export function selectViewerTakes(state: ClashState): Take[] {
  return state.takes
    .filter((take) => take.authorId === state.viewer.id)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ── Vault selectors (spec §17–§22) ────────────────────────────

export function selectCreators(state: ClashState): readonly Creator[] {
  return state.creators;
}

export function selectCreator(state: ClashState, creatorId: string): Creator | undefined {
  return state.creators.find((creator) => creator.id === creatorId);
}

export function selectTrendingCreators(state: ClashState, limit = 3): Creator[] {
  return [...state.creators].sort((a, b) => b.followers - a.followers).slice(0, limit);
}

export function selectCampaigns(state: ClashState): readonly Campaign[] {
  return state.campaigns;
}

export function selectCampaign(state: ClashState, campaignId: string): Campaign | undefined {
  return state.campaigns.find((campaign) => campaign.id === campaignId);
}

export function selectHeroCampaign(state: ClashState): Campaign {
  return state.campaigns[0] as Campaign;
}
