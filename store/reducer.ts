import { CAMPAIGNS } from '../data/mockCampaigns';
import { CLASHES } from '../data/mockClashes';
import { CREATORS } from '../data/mockCreators';
import { DROPS } from '../data/mockDrops';
import { TAKES } from '../data/mockTakes';
import { USER_BY_ID, VIEWER_SEED } from '../data/mockUsers';
import { XP } from '../utils/reputation';
import type {
  Campaign,
  Clash,
  ClashResult,
  Creator,
  Drop,
  Judgement,
  Realm,
  Take,
  UnlockRecord,
  User,
} from './types';

export interface Notice {
  /** Monotonic key so an identical message still re-triggers the toast. */
  id: number;
  message: string;
}

export interface ClashState {
  hasOnboarded: boolean;
  /** Active product realm — drives which tab group owns the screen (spec §16). */
  realm: Realm;
  viewer: User;
  users: Readonly<Record<string, User>>;
  takes: readonly Take[];
  clashes: readonly Clash[];
  /** Viewer ballots keyed by clash id. */
  judgements: Readonly<Record<string, Judgement>>;
  /** Settled verdicts keyed by clash id. */
  results: Readonly<Record<string, ClashResult>>;
  savedTakeIds: readonly string[];
  reactedTakeIds: readonly string[];
  creators: readonly Creator[];
  drops: readonly Drop[];
  campaigns: readonly Campaign[];
  /** Exclusive-drop checkout state, keyed by drop id. */
  unlocks: Readonly<Record<string, UnlockRecord>>;
  analyticsUnlocked: boolean;
  notice: Notice | null;
  noticeSeq: number;
}

export type ClashAction =
  | { type: 'app/onboarded' }
  | { type: 'realm/switch'; realm: Realm }
  | { type: 'clash/resolve'; clashId: string; judgement: Judgement; result: ClashResult }
  | { type: 'take/save'; takeId: string }
  | { type: 'take/react'; takeId: string }
  | { type: 'take/create'; take: Take }
  | { type: 'vault/unlock'; dropId: string }
  | { type: 'vault/analytics'; unlocked: boolean }
  | { type: 'ui/notice'; message: string | null };

export function createInitialState(): ClashState {
  return {
    hasOnboarded: false,
    realm: 'arena',
    viewer: VIEWER_SEED,
    users: USER_BY_ID,
    takes: TAKES,
    clashes: CLASHES,
    judgements: {},
    results: {},
    savedTakeIds: [],
    reactedTakeIds: [],
    creators: CREATORS,
    drops: DROPS,
    campaigns: CAMPAIGNS,
    unlocks: {},
    analyticsUnlocked: false,
    notice: null,
    noticeSeq: 0,
  };
}

function withNotice(state: ClashState, message: string): ClashState {
  const id = state.noticeSeq + 1;
  return { ...state, notice: { id, message }, noticeSeq: id };
}

function applyResult(
  state: ClashState,
  clashId: string,
  judgement: Judgement,
  result: ClashResult,
): ClashState {
  // One ballot per clash: a second dispatch for the same clash is ignored, so
  // reputation can never be farmed by re-revealing a settled result (spec §8).
  if (state.results[clashId]) return state;

  const won = result.alignment === 'majority';
  const viewer: User = {
    ...state.viewer,
    rank: result.rankAfter,
    reputation: state.viewer.reputation + result.reputation,
    coins: state.viewer.coins + result.coins,
    clashes: state.viewer.clashes + 1,
    wins: state.viewer.wins + (won ? 1 : 0),
    streak: won ? state.viewer.streak + 1 : 0,
  };
  return withNotice(
    {
      ...state,
      viewer,
      judgements: { ...state.judgements, [clashId]: judgement },
      results: { ...state.results, [clashId]: result },
    },
    `Judgement filed · +${result.reputation} reputation`,
  );
}

export function clashReducer(state: ClashState, action: ClashAction): ClashState {
  switch (action.type) {
    case 'app/onboarded':
      return { ...state, hasOnboarded: true };

    case 'realm/switch':
      return action.realm === state.realm ? state : { ...state, realm: action.realm };

    case 'clash/resolve':
      return applyResult(state, action.clashId, action.judgement, action.result);

    case 'take/save': {
      const saved = state.savedTakeIds.includes(action.takeId);
      return withNotice(
        {
          ...state,
          savedTakeIds: saved
            ? state.savedTakeIds.filter((id) => id !== action.takeId)
            : [...state.savedTakeIds, action.takeId],
        },
        saved ? 'Removed from saved.' : 'Saved to your shelf.',
      );
    }

    case 'take/react': {
      if (state.reactedTakeIds.includes(action.takeId)) {
        return withNotice(state, 'One reaction per take.');
      }
      return withNotice(
        {
          ...state,
          reactedTakeIds: [...state.reactedTakeIds, action.takeId],
          takes: state.takes.map((take) =>
            take.id === action.takeId ? { ...take, reactions: take.reactions + 1 } : take,
          ),
        },
        'Reaction counted.',
      );
    }

    case 'take/create': {
      const viewer: User = {
        ...state.viewer,
        reputation: state.viewer.reputation + XP.popularTake,
      };
      return withNotice(
        { ...state, viewer, takes: [action.take, ...state.takes] },
        `Take is live · +${XP.popularTake} XP`,
      );
    }

    case 'vault/unlock': {
      // One purchase per drop: a second dispatch is a no-op, mirroring §19.
      if (state.unlocks[action.dropId]?.status === 'unlocked') return state;
      return withNotice(
        {
          ...state,
          unlocks: {
            ...state.unlocks,
            [action.dropId]: { dropId: action.dropId, status: 'unlocked' },
          },
        },
        '✓ Unlocked · mock receipt saved.',
      );
    }

    case 'vault/analytics': {
      if (state.analyticsUnlocked === action.unlocked) return state;
      return withNotice(
        { ...state, analyticsUnlocked: action.unlocked },
        action.unlocked ? 'Pro Analytics unlocked.' : 'Pro Analytics locked.',
      );
    }

    case 'ui/notice':
      return action.message === null
        ? { ...state, notice: null }
        : withNotice(state, action.message);

    default:
      return state;
  }
}
