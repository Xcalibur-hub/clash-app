import React from 'react';
import type { Take } from '../store/types';
import { reactToTake, selectHasReacted, showNotice, syncTakeReaction, useClash } from '../store';
import { toggleTakeReaction } from '../services/apiService';
import { errorText } from '../services/supabaseClient';
import { tap as hapticTap } from '../utils/haptics';
import { useRequireAuth } from './useRequireAuth';

/**
 * Reusable optimistic Take-reaction handler: auth gate → optimistic flip → RPC →
 * reconcile (or roll back), with an in-flight guard per Take.
 */
export function useTakeReaction(): (take: Take) => Promise<void> {
  const { state, dispatch } = useClash();
  const requireAuth = useRequireAuth();
  const inFlight = React.useRef<Set<string>>(new Set());

  return React.useCallback(
    async (take: Take): Promise<void> => {
      if (inFlight.current.has(take.id)) return;
      const wasReacted = selectHasReacted(state, take.id);
      const baseline = take.reactions;
      if (!requireAuth()) return;
      inFlight.current.add(take.id);
      hapticTap();
      dispatch(reactToTake(take.id));
      try {
        const result = await toggleTakeReaction(take.id);
        dispatch(syncTakeReaction(result.takeId, result.reacted, result.reactionsCount));
      } catch (error) {
        dispatch(syncTakeReaction(take.id, wasReacted, baseline));
        dispatch(showNotice(errorText(error)));
      } finally {
        inFlight.current.delete(take.id);
      }
    },
    [dispatch, requireAuth, state],
  );
}
