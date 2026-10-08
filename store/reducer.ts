import { COMMENTS } from '../data/mockComments';
import { CAMPAIGNS } from '../data/mockCampaigns';
import { CREATORS } from '../data/mockCreators';
import { TAKES } from '../data/mockTakes';
import { GUEST_VIEWER, USER_BY_ID } from '../data/mockUsers';
import { isSupabaseConfigured } from '../services/supabaseClient';
import type {
  Campaign,
  ChallengerComment,
  Creator,
  Realm,
  Take,
  ThemeMode,
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
  /** Server ranking snapshot, independent of the unchanged general feed batch. */
  forYouTakeIds?: readonly string[];
  generalTakeIds?: readonly string[];
  comments: readonly ChallengerComment[];
  users: readonly User[];
  /** Null when the viewer row is unreachable — keep the current signed-in/guest viewer. */
  viewer: User | null;
  upvotedCommentIds: readonly string[];
  /** The viewer's server-side Take reactions (the feed's authority for "did I react?"). */
  reactedTakeIds: readonly string[];
}

/** Cold-start / live Arena load lifecycle when Supabase is configured. */
export type ArenaStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ClashState {
  hasOnboarded: boolean;
  /** Active product realm — drives which tab group owns the screen (spec §16). */
  realm: Realm;
  viewer: User;
  users: Readonly<Record<string, User>>;
  takes: readonly Take[];
  forYouTakeIds?: readonly string[];
  generalTakeIds?: readonly string[];
  savedTakeIds: readonly string[];
  reactedTakeIds: readonly string[];
  comments: readonly ChallengerComment[];
  upvotedCommentIds: readonly string[];
  creators: readonly Creator[];
  campaigns: readonly Campaign[];
  analyticsUnlocked: boolean;
  /** Appearance preference — drives system chrome (toggle pass). */
  themeMode: ThemeMode;
  notice: Notice | null;
  noticeSeq: number;
  /** Live Arena load status (configured backend path). */
  arenaStatus: ArenaStatus;
  /** User-facing cold-start error; null when healthy or still loading. */
  arenaError: string | null;
  /** True after at least one successful live hydrate — refresh failures keep data. */
  arenaLive: boolean;
}

export type ClashAction =
  | { type: 'app/onboarded' }
  | { type: 'realm/switch'; realm: Realm }
  | { type: 'arena/loading' }
  | { type: 'arena/error'; message: string }
  | { type: 'data/hydrate'; snapshot: ArenaSnapshot }
  | { type: 'viewer/set'; viewer: User }
  | { type: 'take/save'; takeId: string }
  | { type: 'take/react'; takeId: string }
  | { type: 'take/reaction/sync'; takeId: string; reacted: boolean; reactions: number }
  | { type: 'take/create'; take: Take }
  | { type: 'comment/create'; comment: ChallengerComment }
  | { type: 'comment/upvote'; commentId: string }
  | { type: 'comment/upvote/sync'; commentId: string; upvoted: boolean; upvotes: number }
  | { type: 'vault/analytics'; unlocked: boolean }
  | { type: 'theme/mode'; mode: ThemeMode }
  | { type: 'ui/notice'; message: string | null };

function guestUsers(viewer: User = GUEST_VIEWER): Readonly<Record<string, User>> {
  return { [viewer.id]: viewer };
}

/** Empty live shell — never includes mock Takes/comments as production content. */
function createEmptyLiveState(): ClashState {
  return {
    hasOnboarded: false,
    realm: 'arena',
    viewer: GUEST_VIEWER,
    users: guestUsers(),
    takes: [],
    savedTakeIds: [],
    reactedTakeIds: [],
    comments: [],
    upvotedCommentIds: [],
    creators: [],
    campaigns: [],
    analyticsUnlocked: false,
    themeMode: 'system',
    notice: null,
    noticeSeq: 0,
    arenaStatus: 'idle',
    arenaError: null,
    arenaLive: false,
  };
}

/**
 * Explicit __DEV__ fixture only — used when Supabase is not configured locally.
 * Production builds never take this path.
 */
function createDevFixtureState(): ClashState {
  return {
    ...createEmptyLiveState(),
    viewer: GUEST_VIEWER,
    users: { ...USER_BY_ID, [GUEST_VIEWER.id]: GUEST_VIEWER },
    takes: TAKES,
    comments: COMMENTS,
    creators: CREATORS,
    campaigns: CAMPAIGNS,
    arenaStatus: 'ready',
    arenaError: null,
    arenaLive: false,
  };
}

export function createInitialState(): ClashState {
  if (isSupabaseConfigured) {
    return {
      ...createEmptyLiveState(),
      // Sponsor prototype catalogues stay available for isolated campaign routes;
      // they are not Arena feed content.
      creators: CREATORS,
      campaigns: CAMPAIGNS,
      arenaStatus: 'loading',
    };
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return createDevFixtureState();
  }
  return {
    ...createEmptyLiveState(),
    arenaStatus: 'error',
    arenaError: "Couldn't load Arena.",
  };
}

function withNotice(state: ClashState, message: string): ClashState {
  const id = state.noticeSeq + 1;
  return { ...state, notice: { id, message }, noticeSeq: id };
}

export function clashReducer(state: ClashState, action: ClashAction): ClashState {
  switch (action.type) {
    case 'app/onboarded':
      return { ...state, hasOnboarded: true };

    case 'realm/switch':
      return action.realm === state.realm ? state : { ...state, realm: action.realm };

    case 'arena/loading':
      // Refresh after a live hydrate keeps the feed visible; only cold start shows loading.
      if (state.arenaLive) return { ...state, arenaError: null };
      return { ...state, arenaStatus: 'loading', arenaError: null };

    case 'arena/error':
      // After live data exists, keep it and surface a soft refresh error.
      if (state.arenaLive) {
        return withNotice(
          { ...state, arenaError: null, arenaStatus: 'ready' },
          action.message,
        );
      }
      return {
        ...state,
        takes: [],
        comments: [],
        users: guestUsers(state.viewer.id === GUEST_VIEWER.id ? GUEST_VIEWER : state.viewer),
        reactedTakeIds: [],
        upvotedCommentIds: [],
        arenaStatus: 'error',
        arenaError: action.message,
        arenaLive: false,
      };

    case 'data/hydrate': {
      // One atomic swap: takes, rebuttals, people and the viewer's own vote state
      // land together. Live hydrate replaces Arena content — it does not merge
      // leftover mock Takes from a prior fixture boot.
      const users: Readonly<Record<string, User>> = {
        ...Object.fromEntries(action.snapshot.users.map((user) => [user.id, user])),
        ...(action.snapshot.viewer
          ? { [action.snapshot.viewer.id]: action.snapshot.viewer }
          : { [state.viewer.id]: state.viewer }),
      };
      return {
        ...state,
        users,
        takes: action.snapshot.takes,
        forYouTakeIds: action.snapshot.forYouTakeIds,
        generalTakeIds: action.snapshot.generalTakeIds,
        comments: action.snapshot.comments,
        viewer: action.snapshot.viewer ?? state.viewer,
        upvotedCommentIds: action.snapshot.upvotedCommentIds,
        reactedTakeIds: action.snapshot.reactedTakeIds,
        arenaStatus: 'ready',
        arenaError: null,
        arenaLive: true,
      };
    }

    case 'viewer/set': {
      if (action.viewer.id === state.viewer.id) return state;
      // Switching identity clears everything scoped to the previous viewer, so a
      // guest's saves, reactions and votes never leak into a signed-in account.
      return {
        ...state,
        viewer: action.viewer,
        users: { ...state.users, [action.viewer.id]: action.viewer },
        savedTakeIds: [],
        reactedTakeIds: [],
        upvotedCommentIds: [],
      };
    }

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
      const reacted = state.reactedTakeIds.includes(action.takeId);
      const delta = reacted ? -1 : 1;
      return {
        ...state,
        reactedTakeIds: reacted
          ? state.reactedTakeIds.filter((id) => id !== action.takeId)
          : [...state.reactedTakeIds, action.takeId],
        takes: state.takes.map((take) =>
          take.id === action.takeId
            ? { ...take, reactions: Math.max(0, take.reactions + delta) }
            : take,
        ),
      };
    }

    case 'take/reaction/sync': {
      const already = state.reactedTakeIds.includes(action.takeId);
      return {
        ...state,
        reactedTakeIds:
          action.reacted === already
            ? state.reactedTakeIds
            : action.reacted
              ? [...state.reactedTakeIds, action.takeId]
              : state.reactedTakeIds.filter((id) => id !== action.takeId),
        takes: state.takes.map((take) =>
          take.id === action.takeId ? { ...take, reactions: action.reactions } : take,
        ),
      };
    }

    case 'take/create':
      return withNotice(
        { ...state, takes: [action.take, ...state.takes],
          forYouTakeIds: state.forYouTakeIds ? [action.take.id, ...state.forYouTakeIds] : undefined,
          generalTakeIds: state.generalTakeIds ? [action.take.id, ...state.generalTakeIds] : undefined },
        'Take is live.',
      );

    case 'comment/create':
      return withNotice(
        { ...state, comments: [action.comment, ...state.comments] },
        'Rebuttal posted.',
      );

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
