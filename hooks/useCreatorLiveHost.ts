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
  onChanged: () => Promise<void>,
): CreatorLiveHost {
  const { dispatch } = useClash();
  const [busy, setBusy] = React.useState(false);

  const run = React.useCallback(
    async (work: () => Promise<unknown>, notice?: string): Promise<void> => {
      setBusy(true);
      try {
        await work();
        if (notice) dispatch(showNotice(notice));
        await onChanged();
      } catch (caught) {
        dispatch(showNotice(errorText(caught)));
      } finally {
        setBusy(false);
      }
    },
    [dispatch, onChanged],
  );

  return {
    busy,
    start: () =>
      run(
        () => (sessionId ? startCreatorLiveSession(sessionId) : Promise.resolve()),
        'You are live.',
      ),
    end: () =>
      run(
        () => (sessionId ? endCreatorLiveSession(sessionId) : Promise.resolve()),
        'Session ended.',
      ),
    openInteraction: (draft) =>
      run(
        () =>
          sessionId
            ? createCreatorLiveInteraction({ ...draft, sessionId })
            : Promise.resolve(),
        'Interaction opened.',
      ),
    closeInteraction: (interactionId) =>
      run(() => closeCreatorLiveInteraction(interactionId), 'Interaction closed.'),
  };
}
