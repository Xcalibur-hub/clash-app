import React from 'react';
import {
  closeCreatorLiveInteraction,
  createCreatorLiveInteraction,
  endCreatorLiveSession,
  startCreatorLiveSession,
} from '../services/creatorLiveService';
import { errorText } from '../services/supabaseClient';
import { showNotice, useClash } from '../store';
import type { CreateLiveInteractionInput } from '../services/creatorLiveService';
import { assertReleaseAdmission } from '../utils/releaseScope';

export interface CreatorLiveHost {
  busy: boolean;
  start: () => Promise<void>;
  end: () => Promise<void>;
  openInteraction: (
    draft: Omit<CreateLiveInteractionInput, 'sessionId'>,
  ) => Promise<void>;
  closeInteraction: (interactionId: string) => Promise<void>;
}

/**
 * The creator's own mutations for one session. Only the owning creator (or
 * staff, server-side) can do any of this; the server re-checks every call.
 */
export function useCreatorLiveHost(
  sessionId: string | undefined,
  onChanged: () => Promise<unknown>,
  context: { isCurrent: () => boolean; isOwner: boolean },
): CreatorLiveHost {
  const { dispatch } = useClash();
  const gate = React.useMemo(() => ({ busy: false }), [context.isCurrent]);
  const latest = React.useRef(context); latest.current = context;
  const current = React.useRef(gate); current.current = gate;
  const [pending, setPending] = React.useState<object | null>(null);
  const active = (): boolean => current.current === gate && context.isCurrent() && latest.current.isOwner;
  const busy = pending === gate && gate.busy;

  const run = React.useCallback(
    async (work: () => Promise<unknown>, notice?: string): Promise<void> => {
      if (!active() || gate.busy) return;
      gate.busy = true; setPending(gate);
      try {
        await work();
        if (active()) {
          if (notice) dispatch(showNotice(notice));
          await onChanged();
        }
      } catch (caught) {
        if (active()) dispatch(showNotice(errorText(caught)));
      } finally {
        gate.busy = false;
        if (active()) setPending(null);
      }
    },
    [dispatch, onChanged, gate, context.isCurrent],
  );

  return {
    busy,
    start: () =>
      run(
        () => { assertReleaseAdmission('live'); return sessionId ? startCreatorLiveSession(sessionId) : Promise.resolve(); },
        'You are live.',
      ),
    end: () =>
      run(
        () => (sessionId ? endCreatorLiveSession(sessionId) : Promise.resolve()),
        'Session ended.',
      ),
    openInteraction: (draft) =>
      run(
        () => {
          assertReleaseAdmission('live');
          return sessionId
            ? createCreatorLiveInteraction({ ...draft, sessionId })
            : Promise.resolve(); },
        'Interaction opened.',
      ),
    closeInteraction: (interactionId) =>
      run(() => closeCreatorLiveInteraction(interactionId), 'Interaction closed.'),
  };
}
