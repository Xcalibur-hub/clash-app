import React from 'react';
import type { Stance, TakeStanceState } from '../services/mindshiftService';
import {
  fetchMindshiftStats,
  fetchMyStance,
  MINDSHIFT_MIN_COMPLETED,
  recordFinalStance,
  recordInitialStance,
  type MindshiftStats,
} from '../services/mindshiftService';
import { errorText } from '../services/supabaseClient';
import { showNotice, useClash } from '../store';
import { useAuth } from '../store/AuthProvider';
import { useRequireAuth } from './useRequireAuth';

export interface MindshiftController {
  stance: TakeStanceState | null;
  stats: MindshiftStats | null;
  busy: boolean;
  recordInitial: (stance: Stance) => Promise<void>;
  recordFinal: (stance: Stance) => Promise<void>;
}

/**
 * Loads the viewer's own stance and, only after a final stance exists, the
 * server aggregate. Stats are never requested before that point (anti-anchoring).
 */
export function useMindshift(takeId: string): MindshiftController {
  const { dispatch } = useClash();
  const { signedIn } = useAuth();
  const requireAuth = useRequireAuth();
  const [stance, setStance] = React.useState<TakeStanceState | null>(null);
  const [stats, setStats] = React.useState<MindshiftStats | null>(null);
  const [busy, setBusy] = React.useState(false);

  const loadStats = React.useCallback(async (id: string): Promise<void> => {
    try {
      setStats(await fetchMindshiftStats(id));
    } catch {
      setStats(null);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setStance(null);
    setStats(null);
    if (!signedIn) return undefined;
    void (async () => {
      try {
        const mine = await fetchMyStance(takeId);
        if (cancelled) return;
        setStance(mine);
        if (mine?.finalStance) await loadStats(takeId);
      } catch {
        if (!cancelled) setStance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [takeId, signedIn, loadStats]);

  const recordInitial = React.useCallback(
    async (next: Stance): Promise<void> => {
      if (!requireAuth() || busy) return;
      setBusy(true);
      try {
        setStance(await recordInitialStance(takeId, next));
      } catch (error) {
        dispatch(showNotice(errorText(error)));
      } finally {
        setBusy(false);
      }
    },
    [busy, dispatch, requireAuth, takeId],
  );

  const recordFinal = React.useCallback(
    async (next: Stance): Promise<void> => {
      if (!requireAuth() || busy) return;
      setBusy(true);
      try {
        const recorded = await recordFinalStance(takeId, next);
        setStance(recorded);
        await loadStats(takeId);
      } catch (error) {
        dispatch(showNotice(errorText(error)));
      } finally {
        setBusy(false);
      }
    },
    [busy, dispatch, loadStats, requireAuth, takeId],
  );

  return { stance, stats, busy, recordInitial, recordFinal };
}

export { MINDSHIFT_MIN_COMPLETED };
