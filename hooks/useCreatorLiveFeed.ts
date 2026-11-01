import React from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../store/AuthProvider';
import { fetchCreatorLiveReadSnapshot, subscribeCreatorLive, type CreatorLiveReadSnapshot } from '../services/creatorLiveService';
import { errorText } from '../services/supabaseClient';
import { activeInteraction, type LiveEvent } from '../utils/creatorLiveEvents';

type ReadResult = { owner: object; data: CreatorLiveReadSnapshot | null; error: string | null; loading: boolean };

/** Account/session/focus epochs own every read, timer and subscription. Events are hints only. */
export function useCreatorLiveFeed(sessionId: string | undefined) {
  const { user, session: authSession, loading: authLoading } = useAuth();
  const accountId = user?.id ?? null;
  const [focused, setFocused] = React.useState(false);
  const [foreground, setForeground] = React.useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useFocusEffect(React.useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const enabled = focused && foreground && !authLoading && !!sessionId;
  const owner = React.useMemo(() => ({ alive: true, pending: null as Promise<CreatorLiveReadSnapshot | null> | null, cancel: null as (() => void) | null }),
    [accountId, user, authSession, sessionId, focused, foreground, authLoading]);
  const current = React.useRef(owner); current.current = owner;
  const [result, setResult] = React.useState<ReadResult | null>(null);
  const isCurrent = React.useCallback(() => enabled && owner.alive && current.current === owner, [enabled, owner]);
  const refresh = React.useCallback((): Promise<CreatorLiveReadSnapshot | null> => {
    if (!isCurrent() || !sessionId) return Promise.resolve(null);
    if (owner.pending) return owner.pending;
    owner.pending = Promise.resolve().then(async () => {
      if (!isCurrent()) return null;
      setResult(previous => ({ owner, data: previous?.owner === owner ? previous.data : null, loading: true, error: null }));
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const data = await new Promise<CreatorLiveReadSnapshot | null>((resolve, reject) => {
          owner.cancel = () => { if (timer) clearTimeout(timer); controller.abort(); reject(new Error('Live read cancelled.')); };
          timer = setTimeout(() => { controller.abort(); reject(new Error('Live read timed out. Refresh to try again.')); }, 10_000);
          void fetchCreatorLiveReadSnapshot(sessionId, accountId, controller.signal).then(resolve, reject);
        });
        if (!isCurrent()) return null;
        setResult({ owner, data, loading: false, error: data ? null : 'This live session is not available to you.' });
        return data;
      } catch (caught) {
        if (isCurrent()) setResult({ owner, data: null, loading: false, error: errorText(caught) });
        return null;
      } finally { if (timer) clearTimeout(timer); owner.cancel = null; owner.pending = null; }
    });
    return owner.pending;
  }, [accountId, isCurrent, owner, sessionId]);
  React.useEffect(() => {
    owner.alive = true;
    void refresh();
    return () => { owner.alive = false; owner.cancel?.(); };
  }, [owner, refresh]);
  React.useEffect(() => {
    const listener = AppState.addEventListener('change', next => setForeground(next === 'active'));
    return () => listener.remove();
  }, []);
  const data = isCurrent() && result?.owner === owner ? result.data : null;
  React.useEffect(() => {
    if (!isCurrent() || !sessionId || !data?.session.viewerAccess) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = true;
    const invalidate = (): void => {
      if (!active || !isCurrent() || timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        void (owner.pending ?? Promise.resolve()).then(() => { if (active && isCurrent()) void refresh(); });
      }, 250);
    };
    const dispose = subscribeCreatorLive(sessionId, invalidate, { isCurrent, onStatus: invalidate });
    return () => { active = false; if (timer !== null) clearTimeout(timer); dispose(); };
  }, [data?.session.viewerAccess, isCurrent, refresh, sessionId]);
  const interactions = data?.interactions ?? [];
  return {
    session: data?.session ?? null, status: data?.session.status ?? 'SCHEDULED' as const,
    interactions, featured: activeInteraction(interactions), banner: null, watching: data?.session.watching ?? 0,
    loading: enabled && (result?.owner !== owner || result.loading),
    error: result?.owner === owner ? result.error : null,
    source: data?.source ?? null, isCurrent, refresh,
    // Compatibility entry: no raw delta may change authority or tallies.
    applyEvents: (_events: readonly LiveEvent[]) => { if (isCurrent()) void refresh(); },
    dismissBanner: () => undefined,
  };
}
