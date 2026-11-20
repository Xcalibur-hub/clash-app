import React from 'react';
import { useAuth } from '../../store/AuthProvider';
import { currentUserId, SupabaseError } from '../../services/supabaseClient';
import { fetchClashView } from '../../services/clashEngineService';

type Side = 'A' | 'B';
type Ballot = { status: 'idle' | 'submitting' | 'unknown' | 'confirmed' | 'rejected'; side?: Side; busy: boolean };
const idle: Ballot = { status: 'idle', busy: false };
// Retain unresolved intent across sheet/route remounts in this process. Never resubmit it.
const ballots = new Map<string, Ballot>();
const listeners = new Set<() => void>();
function publish(key: string, state: Ballot): void {
  ballots.set(key, state); listeners.forEach(listener => listener());
}
function rejected(error: unknown): boolean {
  return error instanceof SupabaseError && ['42501', 'P0002', 'P0003', 'P0004', 'P0005'].includes(error.code);
}

/** SQL acknowledgement alone cannot reveal a prior idempotently retained choice. */
export function useDuelBallot(clashId: string, write: (side: Side) => Promise<void>) {
  const { user } = useAuth(), owner = user?.id ?? null;
  const key = JSON.stringify([owner, clashId]);
  const epoch = React.useRef(0);
  const token = React.useMemo(() => ({}), [key]), scope = React.useRef<object | null>(null);
  React.useLayoutEffect(() => { scope.current = token; epoch.current++; return () => { scope.current = null; epoch.current++; }; }, [token]);
  const state = React.useSyncExternalStore(
    React.useCallback(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, []),
    () => ballots.get(key) ?? idle, () => idle);
  const current = async (generation: number): Promise<boolean> => Boolean(owner)
    && scope.current === token && generation === epoch.current && await currentUserId() === owner
    && scope.current === token && generation === epoch.current;
  const verify = async (generation: number, failure?: unknown): Promise<void> => {
    try {
      if (!await current(generation)) throw Error('Account changed');
      const view = await fetchClashView(clashId);
      if (!await current(generation) || !view || view.clashId !== clashId) throw Error('Read unavailable');
      if (view.myBallot) publish(key, { status: 'confirmed', side: view.myBallot, busy: false });
      else publish(key, { status: rejected(failure) ? 'rejected' : 'unknown', busy: false });
    } catch { publish(key, { status: 'unknown', busy: false }); }
  };
  const submit = async (side: Side): Promise<void> => {
    const generation = epoch.current;
    if (!owner || scope.current !== token || !['idle', 'rejected'].includes((ballots.get(key) ?? idle).status)) return;
    // Reserve synchronously, before the first authentication/read await.
    publish(key, { status: 'submitting', busy: true });
    try {
      if (!await current(generation)) { publish(key, idle); return; }
    } catch { publish(key, { status: 'unknown', busy: false }); return; }
    let failure: unknown;
    try { await write(side); } catch (error) { failure = error; }
    await verify(generation, failure);
  };
  const reconcile = async (): Promise<void> => {
    const generation = epoch.current, previous = ballots.get(key) ?? idle;
    if (previous.status !== 'unknown' || previous.busy || !owner || scope.current !== token) return;
    // Reserve before identity verification; verify also catches Auth read failures.
    publish(key, { status: 'unknown', busy: true });
    await verify(generation);
  };
  return { ...state, submit, reconcile, locked: !owner || !['idle', 'rejected'].includes(state.status) };
}
