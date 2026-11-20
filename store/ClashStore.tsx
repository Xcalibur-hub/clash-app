import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from 'react';
import { clashReducer, createInitialState, type ClashAction, type ClashState } from './reducer';
import { arenaFailed, arenaLoading, hydrateArena, setThemeMode } from './actions';
import { loadArena } from '../services/hydrationService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { loadThemeMode, saveThemeMode } from '../services/themePreference';
import type { User } from './types';

interface ClashContextValue {
  state: ClashState;
  dispatch: Dispatch<ClashAction>;
  /** Re-run Arena hydration (feed + comments + safety/reaction/upvote state). */
  reloadArena: () => Promise<void>;
}

const ClashContext = createContext<ClashContextValue | null>(null);

const NOTICE_MS = 2400;

/**
 * Application store. When Supabase is configured, the Arena boots empty/loading
 * and only shows server data. Hydration failures never fall back to mock Takes.
 * Bundled fixtures load only in __DEV__ when Supabase is not configured.
 */
export function ClashProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(clashReducer, undefined, createInitialState);
  const noticeId = state.notice?.id ?? null;
  const reloadSeq = useRef(0);

  // Restore appearance preference before paint settles — local only, no auth.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadThemeMode();
      if (!cancelled && saved) dispatch(setThemeMode(saved));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every Appearance change so System/Light/Dark survive restarts.
  useEffect(() => {
    void saveThemeMode(state.themeMode);
  }, [state.themeMode]);

  useEffect(() => {
    if (noticeId === null) return undefined;
    const timer = setTimeout(() => dispatch({ type: 'ui/notice', message: null }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [noticeId]);

  /**
   * Rehydrates the live Arena. Sequence numbers drop stale in-flight responses.
   * Configured backend failures surface as error/empty (or a soft notice after
   * live data exists) — never as silent mock content.
   */
  const reloadArena = useCallback(async (): Promise<void> => {
    const seq = ++reloadSeq.current;

    if (!isSupabaseConfigured) {
      // Keep explicit __DEV__ fixtures; production-without-config stays on error.
      if (typeof __DEV__ !== 'undefined' && __DEV__) return;
      if (seq !== reloadSeq.current) return;
      dispatch(arenaFailed("Couldn't load Arena."));
      return;
    }

    dispatch(arenaLoading());
    const result = await loadArena();
    if (seq !== reloadSeq.current) return;

    if (result.ok) {
      dispatch(hydrateArena(result.snapshot));
      return;
    }

    dispatch(arenaFailed(result.message));
  }, [dispatch]);

  // Cold start: attempt live hydrate when configured (or leave __DEV__ fixtures).
  useEffect(() => {
    void reloadArena();
  }, [reloadArena]);

  const value = useMemo<ClashContextValue>(
    () => ({ state, dispatch, reloadArena }),
    [state, reloadArena],
  );

  return <ClashContext.Provider value={value}>{children}</ClashContext.Provider>;
}

export function useClash(): ClashContextValue {
  const value = useContext(ClashContext);
  if (!value) {
    throw new Error('useClash must be used inside <ClashProvider>.');
  }
  return value;
}

/** Convenience selector hook for the signed-in viewer. */
export function useViewer(): User {
  return useClash().state.viewer;
}
