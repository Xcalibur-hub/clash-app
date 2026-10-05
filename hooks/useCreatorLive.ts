import React from 'react';
import { reportCreatorLiveSession, submitCreatorLiveVote } from '../services/creatorLiveService';
import type { CreatorLiveSession } from '../services/creatorLiveMappers';
import { errorText } from '../services/supabaseClient';
import { showNotice, useClash } from '../store';
import type { LiveBanner, LiveInteractionState } from '../utils/creatorLiveEvents';
import type { LiveStatus } from '../utils/creatorLiveState';
import { useCreatorLiveFeed } from './useCreatorLiveFeed';

export interface CreatorLiveController {
  session: CreatorLiveSession | null;
  status: LiveStatus;
  interactions: LiveInteractionState[];
  featured: LiveInteractionState | null;
  banner: LiveBanner | null;
  watching: number;
  loading: boolean;
  error: string | null;
  voting: boolean;
  refresh: () => Promise<void>;
  vote: (interactionId: string, optionId: string | null) => Promise<boolean>;
  report: (reason: Parameters<typeof reportCreatorLiveSession>[1]) => Promise<void>;
  dismissBanner: () => void;
}

/**
 * Viewer controller for one live session: the read model plus the only two
 * things a viewer may do — submit intent, or report.
 */
export function useCreatorLive(sessionId: string | undefined): CreatorLiveController {
  const { dispatch } = useClash();
  const feed = useCreatorLiveFeed(sessionId);
  const [voting, setVoting] = React.useState(false);

  const vote = React.useCallback(
    async (interactionId: string, optionId: string | null): Promise<boolean> => {
      setVoting(true);
      try {
        const result = await submitCreatorLiveVote(interactionId, optionId);
        feed.applyVote(interactionId, {
          tallies: result.tallies,
          total: result.total,
          status: result.status,
          voted: result.accepted || result.alreadyVoted,
          myVote: optionId,
        });
        return true;
      } catch (caught) {
        dispatch(showNotice(errorText(caught)));
        return false;
      } finally {
        setVoting(false);
      }
    },
    [dispatch, feed],
  );

  const report = React.useCallback(
    async (reason: Parameters<typeof reportCreatorLiveSession>[1]): Promise<void> => {
      if (!sessionId) return;
      try {
        await reportCreatorLiveSession(sessionId, reason);
        dispatch(showNotice('Report sent.'));
      } catch (caught) {
        dispatch(showNotice(errorText(caught)));
      }
    },
    [dispatch, sessionId],
  );

  return {
    session: feed.session,
    status: feed.status,
    interactions: feed.interactions,
    featured: feed.featured,
    banner: feed.banner,
    watching: feed.watching,
    loading: feed.loading,
    error: feed.error,
    voting,
    refresh: feed.refresh,
    vote,
    report,
    dismissBanner: feed.dismissBanner,
  };
}
