import React from 'react';
import type { Take } from '../store/types';
import { reactToTake, selectHasReacted, showNotice, syncTakeReaction, useClash } from '../store';
import { toggleTakeReaction } from '../services/apiService';
import { errorText } from '../services/supabaseClient';
import { tap as hapticTap } from '../utils/haptics';
import { useRequireAuth } from './useRequireAuth';
import { useAuth } from '../store/AuthProvider';
import { useOperationScope } from './useOperationScope';

/**
 * Reusable optimistic Take-reaction handler: auth gate → optimistic flip → RPC →
 * reconcile (or roll back), with an in-flight guard per Take.
 */
export function useTakeReaction(): (take: Take) => Promise<void> {
  const { state, dispatch } = useClash();
  const requireAuth = useRequireAuth();
  const inFlight = React.useRef<Set<string>>(new Set());
  const {user}=useAuth(),isCurrent=useOperationScope(user?.id??'guest');
  React.useEffect(()=>{inFlight.current=new Set();},[user?.id]);

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
        if(!isCurrent())return;
        dispatch(syncTakeReaction(result.takeId, result.reacted, result.reactionsCount));
      } catch (error) {
        if(!isCurrent())return;
        dispatch(syncTakeReaction(take.id, wasReacted, baseline));
        dispatch(showNotice(errorText(error)));
      } finally {
        if(isCurrent())inFlight.current.delete(take.id);
      }
    },
    [dispatch, requireAuth, state,isCurrent],
  );
}
