import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import { clashReducer, createInitialState, type ClashAction, type ClashState } from './reducer';
import type { User } from './types';

interface ClashContextValue {
  state: ClashState;
  dispatch: Dispatch<ClashAction>;
}

const ClashContext = createContext<ClashContextValue | null>(null);

const NOTICE_MS = 2400;

/**
 * Single store for the prototype. Phase 4 swaps the reducer wiring for
 * AsyncStorage hydration + Supabase sync; the context API stays identical.
 */
export function ClashProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(clashReducer, undefined, createInitialState);
  const noticeId = state.notice?.id ?? null;

  useEffect(() => {
    if (noticeId === null) return undefined;
    const timer = setTimeout(() => dispatch({ type: 'ui/notice', message: null }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [noticeId]);

  const value = useMemo<ClashContextValue>(() => ({ state, dispatch }), [state]);

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
