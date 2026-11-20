import React from 'react';
import { reportCreatorLiveSession, submitCreatorLiveVote, type CreatorLiveReadSnapshot } from '../services/creatorLiveService';
import type { CreatorLiveSession } from '../services/creatorLiveMappers';
import { errorText } from '../services/supabaseClient';
import { showNotice, useClash } from '../store';
import type { LiveBanner, LiveInteractionState } from '../utils/creatorLiveEvents';
import type { LiveStatus, LiveVoteIntent } from '../utils/creatorLiveState';
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
  voteIntent: LiveVoteIntent;
  isCurrent: () => boolean;
  refresh: () => Promise<CreatorLiveReadSnapshot | null>;
  vote: (interactionId: string, optionId: string | null) => Promise<boolean>;
  report: (reason: Parameters<typeof reportCreatorLiveSession>[1]) => Promise<void>;
  dismissBanner: () => void;
}

/** Intent never updates the read model optimistically or resubmits on timeout. */
export function useCreatorLive(sessionId: string | undefined): CreatorLiveController {
  const { dispatch } = useClash();
  const feed = useCreatorLiveFeed(sessionId);
  const latest = React.useRef(feed); latest.current = feed;
  const owner = React.useMemo(() => ({ busy: false, cancel: null as (() => void) | null }), [feed.isCurrent]);
  const current = React.useRef(owner); current.current = owner;
  const [intent, setIntent] = React.useState<{ owner: object; value: LiveVoteIntent } | null>(null);
  const active = React.useCallback(() => current.current === owner && feed.isCurrent(), [owner, feed.isCurrent]);
  React.useEffect(() => () => owner.cancel?.(), [owner]);
  const vote = React.useCallback(async (interactionId: string, optionId: string | null): Promise<boolean> => {
    if (!active() || owner.busy) return false;
    const row = latest.current.interactions.find(item => item.id === interactionId);
    if (latest.current.source !== 'snapshot' || !latest.current.session?.canParticipate || !row?.canParticipate
      || latest.current.session?.isOwner || row.status !== 'OPEN' || row.voted) return false;
    owner.busy = true; // synchronous: a second tap before rendering cannot publish again
    setIntent({ owner, value: { kind: 'pending', interactionId } });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await new Promise<Awaited<ReturnType<typeof submitCreatorLiveVote>>>((resolve, reject) => {
        const controller = new AbortController();
        owner.cancel = () => { if (timer) clearTimeout(timer); controller.abort(); reject(new Error('Vote request cancelled; outcome unknown.')); };
        timer = setTimeout(() => { controller.abort(); reject(new Error('Vote delivery timed out; outcome unknown.')); }, 10_000);
        void submitCreatorLiveVote(interactionId, optionId, controller.signal).then(resolve, reject);
      });
      if (timer) clearTimeout(timer); owner.cancel = null;
      if (!active()) return false;
      const snapshot = await feed.refresh();
      if (!active()) return false;
      const recorded = snapshot?.interactions.find(item => item.id === interactionId);
      const returned = result.myVote !== undefined ? result.myVote : recorded?.voted ? recorded.myVote : undefined;
      const myVote = (returned === null && row.type === 'CROWD_ACTION') || row.options?.some(option => option.id === returned) ? returned : undefined;
      const kind = result.alreadyVoted ? 'replayed' : !result.accepted ? 'rejected' : myVote !== undefined ? 'confirmed' : 'ambiguous';
      setIntent({ owner, value: { kind, interactionId, myVote } });
      return result.accepted && (kind === 'confirmed' || kind === 'replayed');
    } catch (caught) {
      if (timer) clearTimeout(timer); owner.cancel = null;
      if (!active()) return false;
      const code = caught && typeof caught === 'object' && 'code' in caught ? caught.code : null;
      const rejected = ['42501','P0001','P0003','P0004','P0006','401','403'].includes(String(code));
      // One authorized read after an uncertain write, never an automatic retry.
      const snapshot = await feed.refresh();
      if (!active()) return false;
      const recorded = snapshot?.interactions.find(item => item.id === interactionId);
      setIntent({ owner, value: { kind: rejected ? 'rejected' : 'ambiguous', interactionId,
        ...(recorded?.voted ? { myVote: recorded.myVote } : {}) } });
      dispatch(showNotice(errorText(caught)));
      return false;
    } finally {
      if (timer) clearTimeout(timer); owner.cancel = null;
      owner.busy = false;
    }
  }, [active, dispatch, feed.refresh, owner]);
  const report = React.useCallback(async (reason: Parameters<typeof reportCreatorLiveSession>[1]): Promise<void> => {
    if (!sessionId || !active() || !latest.current.session?.viewerAccess) return;
    try {
      await reportCreatorLiveSession(sessionId, reason);
      if (active()) dispatch(showNotice('Report sent.'));
    } catch (caught) { if (active()) dispatch(showNotice(errorText(caught))); }
  }, [active, dispatch, sessionId]);
  const voteIntent: LiveVoteIntent = active() && intent?.owner === owner ? intent.value : { kind: 'idle', interactionId: null };
  return { ...feed, voting: voteIntent.kind === 'pending', voteIntent, vote, report };
}
