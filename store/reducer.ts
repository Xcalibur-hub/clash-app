import { COMMENTS } from '../data/mockComments';
import { CAMPAIGNS } from '../data/mockCampaigns';
import { CLASHES } from '../data/mockClashes';
import { CREATORS } from '../data/mockCreators';
import { DROPS } from '../data/mockDrops';
import { TAKES } from '../data/mockTakes';
import { USER_BY_ID, VIEWER_SEED } from '../data/mockUsers';
import { XP } from '../utils/reputation';
import type {
  Campaign,
  ChallengerComment,
  Clash,
  ClashResult,
  Creator,
  Drop,
  Judgement,
  Realm,
  Take,
  ThemeMode,
  UnlockRecord,
  User,
} from './types';

export interface Notice {
  /** Monotonic key so an identical message still re-triggers the toast. */
  id: number;
  message: string;
}

/**
 * One live Arena, straight from the database. `services/hydrationService.ts`
 * builds it; the reducer applies it atomically so the feed can never show takes
 * from one moment and rebuttals from another.
 */
export interface ArenaSnapshot {
  takes: readonly Take[];
  comments: readonly ChallengerComment[];
  users: readonly User[];
  /** Null when the viewer row is unreachable — the bundled snapshot then stays. */
  viewer: User | null;
  upvotedCommentIds: readonly string[];
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
  comments: readonly ChallengerComment[];
  upvotedCommentIds: readonly string[];
  creators: readonly Creator[];
  drops: readonly Drop[];
  campaigns: readonly Campaign[];
  /** Exclusive-drop checkout state, keyed by drop id. */
  unlocks: Readonly<Record<string, UnlockRecord>>;
  analyticsUnlocked: boolean;
  /** Appearance preference — drives system chrome (toggle pass). */
  themeMode: ThemeMode;
  notice: Notice | null;
  noticeSeq: number;
}

export type ClashAction =
  | { type: 'app/onboarded' }
  | { type: 'realm/switch'; realm: Realm }
  | { type: 'data/hydrate'; snapshot: ArenaSnapshot }
  | { type: 'clash/ballot'; clashId: string; judgement: Judgement }
  | { type: 'clash/settle'; result: ClashResult }
  | { type: 'take/save'; takeId: string }
  | { type: 'take/react'; takeId: string }
  | { type: 'take/create'; take: Take }
  | { type: 'comment/create'; comment: ChallengerComment }
  | { type: 'comment/upvote'; commentId: string }
  | { type: 'comment/upvote/sync'; commentId: string; upvoted: boolean; upvotes: number }
  | { type: 'vault/unlock'; dropId: string }
  | { type: 'vault/analytics'; unlocked: boolean }
  | { type: 'theme/mode'; mode: ThemeMode }
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
    comments: COMMENTS,
    upvotedCommentIds: [],
    creators: CREATORS,
    drops: DROPS,
    campaigns: CAMPAIGNS,
    unlocks: {},
    analyticsUnlocked: false,
    themeMode: 'system',
    notice: null,
    noticeSeq: 0,
  };
}

function withNotice(state: ClashState, message: string): ClashState {
  const id = state.noticeSeq + 1;
  return { ...state, notice: { id, message }, noticeSeq: id };
}

/**
 * Settle a clash: the jury verdict is written and the economy pays out against
 * the viewer's alignment. A missing ballot counts as an abstention, and a
 * second settle is ignored so results can never be farmed (spec §8).
 */
function settleViewer(state: ClashState, result: ClashResult): ClashState {
  if (state.results[result.clashId]) return state;

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
  return {
    ...state,
    viewer,
    judgements: state.judgements[result.clashId]
      ? state.judgements
      : { ...state.judgements, [result.clashId]: 'UNDECIDED' },
    results: { ...state.results, [result.clashId]: result },
  };
}

export function clashReducer(state: ClashState, action: ClashAction): ClashState {
  switch (action.type) {
    case 'app/onboarded':
      return { ...state, hasOnboarded: true };

    case 'realm/switch':
      return action.realm === state.realm ? state : { ...state, realm: action.realm };

    case 'data/hydrate': {
      // One atomic swap: takes, rebuttals, people and the viewer's own vote state
      // land together, and nobody's id survives without its profile row.
      const users: Readonly<Record<string, User>> = {
        ...state.users,
        ...Object.fromEntries(action.snapshot.users.map((user) => [user.id, user])),
      };
      return {
        ...state,
        users,
        takes: action.snapshot.takes,
        comments: action.snapshot.comments,
        viewer: action.snapshot.viewer ?? state.viewer,
        upvotedCommentIds: action.snapshot.upvotedCommentIds,
      };
    }

    case 'clash/ballot': {
      // One ballot per clash (spec §8). The ballot alone never settles anything —
      // the jury files the verdict when the end-of-day clock runs out.
      if (state.judgements[action.clashId]) return state;
      return withNotice(
        { ...state, judgements: { ...state.judgements, [action.clashId]: action.judgement } },
        '✓ Your vote is locked in. The 9-person jury deliberates at 9:00 PM.',
      );
    }

    case 'clash/settle':
      return withNotice(
        settleViewer(state, action.result),
        `Final verdict filed · +${action.result.reputation} reputation`,
      );

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

    case 'comment/create': {
      const viewer: User = {
        ...state.viewer,
        reputation: state.viewer.reputation + XP.participate,
      };
      return withNotice(
        { ...state, viewer, comments: [action.comment, ...state.comments] },
        `Rebuttal posted · +${XP.participate} XP`,
      );
    }

    case 'comment/upvote': {
      const upvoted = state.upvotedCommentIds.includes(action.commentId);
      const delta = upvoted ? -1 : 1;
      return {
        ...state,
        upvotedCommentIds: upvoted
          ? state.upvotedCommentIds.filter((id) => id !== action.commentId)
          : [...state.upvotedCommentIds, action.commentId],
        comments: state.comments.map((comment) =>
          comment.id === action.commentId
            ? { ...comment, upvotes: Math.max(0, comment.upvotes + delta) }
            : comment,
        ),
      };
    }

    case 'comment/upvote/sync': {
      // The server's word on a flip: idempotent, so an optimistic toggle followed
      // by this reconcile always ends on the database tally — and a failed RPC can
      // roll the optimistic flip straight back.
      const already = state.upvotedCommentIds.includes(action.commentId);
      return {
        ...state,
        upvotedCommentIds:
          action.upvoted === already
            ? state.upvotedCommentIds
            : action.upvoted
              ? [...state.upvotedCommentIds, action.commentId]
              : state.upvotedCommentIds.filter((id) => id !== action.commentId),
        comments: state.comments.map((comment) =>
          comment.id === action.commentId ? { ...comment, upvotes: action.upvotes } : comment,
        ),
      };
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

    case 'theme/mode':
      return action.mode === state.themeMode ? state : { ...state, themeMode: action.mode };

    case 'ui/notice':
      return action.message === null
        ? { ...state, notice: null }
        : withNotice(state, action.message);

    default:
      return state;
  }
}
