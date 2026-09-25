import type { ClashState } from './reducer';
import type {
  Campaign,
  ChallengerComment,
  Clash,
  ClashResult,
  Creator,
  Drop,
  HoodId,
  Judgement,
  Take,
  ThemeMode,
  UnlockStatus,
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

export function selectClashForTake(state: ClashState, takeId: string): Clash | undefined {
  return state.clashes.find((clash) => clash.takeId === takeId);
}

export function selectJudgement(state: ClashState, clashId: string): Judgement | undefined {
  return state.judgements[clashId];
}

export function selectResult(state: ClashState, clashId: string): ClashResult | undefined {
  return state.results[clashId];
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

/** Clashes the viewer called correctly — the Profile "Wins" tab. */
export function selectViewerWins(state: ClashState): WinEntry[] {
  const entries: WinEntry[] = [];
  for (const result of Object.values(state.results)) {
    if (result.alignment !== 'majority') continue;
    const clash = state.clashes.find((item) => item.id === result.clashId);
    const take = clash ? state.takes.find((item) => item.id === clash.takeId) : undefined;
    if (clash && take) entries.push({ clash, take, result });
  }
  return entries.sort((a, b) => b.result.resolvedAt - a.result.resolvedAt);
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

export function selectDrops(state: ClashState): readonly Drop[] {
  return state.drops;
}

export function selectDropsForCreator(state: ClashState, creatorId: string): Drop[] {
  return state.drops.filter((drop) => drop.creatorId === creatorId);
}

export function selectExclusiveDrops(state: ClashState): Drop[] {
  return state.drops.filter((drop) => drop.tier === 'exclusive');
}

export function selectUnlockStatus(state: ClashState, dropId: string): UnlockStatus {
  return state.unlocks[dropId]?.status ?? 'locked';
}

export function selectUnlockedDropIds(state: ClashState): string[] {
  return Object.values(state.unlocks)
    .filter((record) => record.status === 'unlocked')
    .map((record) => record.dropId);
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
