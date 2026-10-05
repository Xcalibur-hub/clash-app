import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  fetchCreatorLiveEventsSince,
  fetchCreatorLiveInteractions,
  fetchCreatorLiveSession,
  subscribeCreatorLive,
  touchCreatorLiveViewer,
} from '../services/creatorLiveService';
import type { CreatorLiveSession } from '../services/creatorLiveMappers';
import { errorText } from '../services/supabaseClient';
import {
  activeInteraction,
  applyLiveEvents,
  mergeEvents,
  type LiveBanner,
  type LiveEvent,
  type LiveInteractionState,
  type LiveScreenState,
} from '../utils/creatorLiveEvents';
import type { LiveStatus } from '../utils/creatorLiveState';

/** Realtime bursts are coalesced into one applied batch. */
const EVENT_DEBOUNCE_MS = 250;
/** Heartbeat cadence for the watch count (bounded, never per-frame). */
const HEARTBEAT_MS = 25_000;
/** Slow tally safety net while an interaction is open. */
const TALLY_POLL_MS = 8_000;
/** How long a crowd-action banner stays on screen. */
const BANNER_MS = 6_000;

export interface CreatorLiveFeed {
  session: CreatorLiveSession | null;
  status: LiveStatus;
  interactions: LiveInteractionState[];
  featured: LiveInteractionState | null;
  banner: LiveBanner | null;
  watching: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Locally apply a server-confirmed vote result. */
  applyVote: (
    interactionId: string,
    next: {
      tallies: LiveInteractionState['tallies'];
      total: number;
      status: LiveInteractionState['status'];
      voted: boolean;
      myVote: string | null;
    },
  ) => void;
  applyEvents: (events: readonly LiveEvent[]) => void;
  dismissBanner: () => void;
}

type FetchedInteraction = Awaited<ReturnType<typeof fetchCreatorLiveInteractions>>[number];

function emptyState(status: LiveStatus = 'SCHEDULED'): LiveScreenState {
  return { status, interactions: [], banner: null };
}

function toInteractionState(item: FetchedInteraction): LiveInteractionState {
  return {
    id: item.id,
    type: item.type,
    prompt: item.prompt,
    options: item.options,
    actionKind: item.actionKind,
    threshold: item.threshold,
    status: item.status,
    tallies: item.tallies,
    totalVotes: item.totalVotes,
    result: item.result,
    openedAt: item.openedAt,
    closesAt: item.closesAt,
    voted: item.voted,
    myVote: item.myVote,
    canParticipate: item.canParticipate,
  };
}

/**
 * Read model for one live session: hydrate, subscribe, resync, heartbeat.
 * Realtime is transport only — the database stays authoritative.
 */
export function useCreatorLiveFeed(sessionId: string | undefined): CreatorLiveFeed {
  const [session, setSession] = React.useState<CreatorLiveSession | null>(null);
  const [state, setState] = React.useState<LiveScreenState>(() => emptyState());
  const [watching, setWatching] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const seenEvents = React.useRef<LiveEvent[]>([]);
  const lastEventAt = React.useRef<number | null>(null);
  const pending = React.useRef<LiveEvent[]>([]);
  const flushTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyEvents = React.useCallback((events: readonly LiveEvent[]): void => {
    if (events.length === 0) return;
    seenEvents.current = mergeEvents(seenEvents.current, events);
    lastEventAt.current = seenEvents.current.reduce(
      (max, event) => (event.createdAt > max ? event.createdAt : max),
      lastEventAt.current ?? 0,
    );
    setState((current) => applyLiveEvents(current, events));
  }, []);

  const enqueue = React.useCallback(
    (event: LiveEvent): void => {
      pending.current = [...pending.current, event];
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => {
        const batch = pending.current;
        pending.current = [];
        applyEvents(batch);
      }, EVENT_DEBOUNCE_MS);
    },
    [applyEvents],
  );

  const load = React.useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    try {
      const [next, interactions] = await Promise.all([
        fetchCreatorLiveSession(sessionId),
        fetchCreatorLiveInteractions(sessionId, 20),
      ]);
      if (!next) {
        setSession(null);
        setState(emptyState());
        setError('This live session is not available to you.');
        return;
      }
      setError(null);
      setSession(next);
      setWatching(next.watching);
      setState({
        status: next.status,
        interactions: interactions.map(toInteractionState),
        banner: null,
      });
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const refresh = React.useCallback(async (): Promise<void> => {
    await load();
    if (!sessionId) return;
    try {
      applyEvents(await fetchCreatorLiveEventsSince(sessionId, lastEventAt.current, 60));
    } catch {
      // A resync failure is not fatal: the next foreground or tick retries.
    }
  }, [applyEvents, load, sessionId]);

  React.useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!sessionId || session === null || !session.viewerAccess) return undefined;
    return subscribeCreatorLive(sessionId, enqueue);
  }, [enqueue, sessionId, session?.viewerAccess]);

  React.useEffect(() => {
    if (!sessionId) return undefined;
    const onChange = (next: AppStateStatus): void => {
      if (next === 'active') void refresh();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [refresh, sessionId]);

  React.useEffect(() => {
    if (!sessionId || session?.status !== 'LIVE' || !session.viewerAccess) return undefined;
    let alive = true;
    const beat = async (): Promise<void> => {
      try {
        const count = await touchCreatorLiveViewer(sessionId);
        if (alive) setWatching(count);
      } catch {
        // Blocked or offline mid-session: keep the last known count.
      }
    };
    void beat();
    const beatTimer = setInterval(() => void beat(), HEARTBEAT_MS);
    const tallyTimer = setInterval(() => {
      void fetchCreatorLiveInteractions(sessionId, 20)
        .then((list) => {
          if (!alive) return;
          const byId = new Map(list.map((item) => [item.id, item]));
          setState((current) => ({
            ...current,
            interactions: current.interactions.map((item) => {
              const fresh = byId.get(item.id);
              return fresh
                ? {
                    ...item,
                    tallies: fresh.tallies,
                    totalVotes: fresh.totalVotes,
                    status: fresh.status,
                    result: fresh.result,
                  }
                : item;
            }),
          }));
        })
        .catch(() => undefined);
    }, TALLY_POLL_MS);
    return () => {
      alive = false;
      clearInterval(beatTimer);
      clearInterval(tallyTimer);
    };
  }, [sessionId, session?.status, session?.viewerAccess]);

  React.useEffect(() => {
    if (state.banner === null) return undefined;
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => {
      setState((current) => ({ ...current, banner: null }));
    }, BANNER_MS);
    return () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, [state.banner]);

  React.useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    },
    [],
  );

  const applyVote = React.useCallback<CreatorLiveFeed['applyVote']>((interactionId, next) => {
    setState((current) => ({
      ...current,
      interactions: current.interactions.map((item) =>
        item.id === interactionId
          ? {
              ...item,
              tallies: next.tallies,
              totalVotes: next.total,
              status: next.status,
              voted: next.voted,
              myVote: next.myVote,
            }
          : item,
      ),
    }));
  }, []);

  return {
    session,
    status: state.status,
    interactions: state.interactions,
    featured: activeInteraction(state.interactions),
    banner: state.banner,
    watching,
    loading,
    error,
    refresh,
    applyVote,
    applyEvents,
    dismissBanner: () => setState((current) => ({ ...current, banner: null })),
  };
}

