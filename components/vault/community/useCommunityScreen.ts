import React from 'react';
import { currentViewerProfileId, fetchViewerProfile } from '../../../services/apiService';
import { fetchProfileById } from '../../../services/profileService';
import { fetchFollowState, followUser } from '../../../services/socialService';
import { blockProfile, reportContent } from '../../../services/safetyService';
import {
  createCommunityPost,
  deleteCommunityPost,
  deleteCommunityReply,
  enterCommunity,
  fetchCommunity,
  fetchCommunityPosts,
  hideCommunityPost,
} from '../../../services/vaultCommunityService';
import type { CommunityPostCard, CommunitySummary } from '../../../services/vaultCommunityMappers';
import { errorText } from '../../../services/supabaseClient';
import { showNotice, useClash } from '../../../store';
import type { CommunityActionKind } from './CommunityActionSheet';
import type { CommunityTarget } from './communityTargets';

export type CommunityPhase = 'loading' | 'ready' | 'missing';

export interface CommunityScreenModel {
  phase: CommunityPhase;
  summary: CommunitySummary | null;
  posts: CommunityPostCard[];
  creatorName: string;
  creatorTint: string | null;
  viewerName: string;
  following: boolean;
  signedIn: boolean;
  expandedId: string | null;
  setExpandedId: React.Dispatch<React.SetStateAction<string | null>>;
  composeType: 'discussion' | 'announcement';
  setComposeType: (type: 'discussion' | 'announcement') => void;
  composerBusy: boolean;
  gateBusy: boolean;
  target: CommunityTarget | null;
  setTarget: (target: CommunityTarget | null) => void;
  submitPost: (input: { body: string; pseudonymous: boolean }) => void;
  runAction: (kind: CommunityActionKind) => void;
  onFollow: () => void;
}

/**
 * All data + actions for the community screen, kept out of the render so each
 * file stays small. Access is only ever read from the server summary — the
 * client never decides who may enter.
 */
export function useCommunityScreen(communityId: string): CommunityScreenModel {
  const { dispatch } = useClash();
  const [phase, setPhase] = React.useState<CommunityPhase>('loading');
  const [summary, setSummary] = React.useState<CommunitySummary | null>(null);
  const [posts, setPosts] = React.useState<CommunityPostCard[]>([]);
  const [creatorName, setCreatorName] = React.useState('this creator');
  const [creatorTint, setCreatorTint] = React.useState<string | null>(null);
  const [viewerName, setViewerName] = React.useState('You');
  const [following, setFollowing] = React.useState(false);
  const [signedIn, setSignedIn] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [composeType, setComposeType] = React.useState<'discussion' | 'announcement'>('discussion');
  const [composerBusy, setComposerBusy] = React.useState(false);
  const [gateBusy, setGateBusy] = React.useState(false);
  const [target, setTarget] = React.useState<CommunityTarget | null>(null);

  const refreshPosts = React.useCallback(async (): Promise<void> => {
    setPosts(await fetchCommunityPosts(communityId));
  }, [communityId]);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const [viewer, initial] = await Promise.all([
        currentViewerProfileId(),
        fetchCommunity(communityId),
      ]);
      setSignedIn(viewer !== null);
      if (!initial) {
        setPhase('missing');
        return;
      }
      setSummary(initial);
      const [creator, me, follow] = await Promise.all([
        fetchProfileById(initial.creatorId).catch(() => null),
        fetchViewerProfile().catch(() => null),
        fetchFollowState(initial.creatorId).catch(() => null),
      ]);
      if (creator) {
        setCreatorName(creator.name);
        setCreatorTint(creator.tint);
      }
      if (me) setViewerName(me.name);
      if (follow) setFollowing(follow.following);

      if (initial.viewerAccess) {
        setSummary(await enterCommunity(communityId));
        await refreshPosts();
      }
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setPhase('ready');
    }
  }, [communityId, dispatch, refreshPosts]);

  React.useEffect(() => {
    setPhase('loading');
    void load();
  }, [load]);

  const submitPost = async (input: { body: string; pseudonymous: boolean }): Promise<void> => {
    setComposerBusy(true);
    try {
      await createCommunityPost({
        communityId,
        type: composeType,
        body: input.body,
        pseudonymous: input.pseudonymous,
      });
      setComposeType('discussion');
      setSummary(await fetchCommunity(communityId));
      await refreshPosts();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setComposerBusy(false);
    }
  };

  const runAction = async (kind: CommunityActionKind): Promise<void> => {
    const current = target;
    setTarget(null);
    if (!current) return;
    const node = current.kind === 'post' ? current.post : current.reply;
    try {
      if (kind === 'report') {
        await reportContent(
          current.kind === 'post' ? 'community_post' : 'community_reply',
          node.id,
          'other',
          'Reported from community',
        );
        dispatch(showNotice('Report sent.'));
      } else if (kind === 'delete') {
        if (current.kind === 'post') await deleteCommunityPost(current.post.id);
        else await deleteCommunityReply(current.reply.id);
        dispatch(showNotice('Removed.'));
        await refreshPosts();
      } else if (kind === 'hide') {
        await hideCommunityPost(current.post.id, true);
        dispatch(showNotice('Hidden from the community.'));
        await refreshPosts();
      } else if (kind === 'block' && node.identity.profileId) {
        await blockProfile(node.identity.profileId);
        dispatch(showNotice('Blocked.'));
        await refreshPosts();
      }
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  };

  const onFollow = async (): Promise<void> => {
    if (!summary) return;
    setGateBusy(true);
    try {
      await followUser(summary.creatorId);
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setGateBusy(false);
    }
  };

  return {
    phase,
    summary,
    posts,
    creatorName,
    creatorTint,
    viewerName,
    following,
    signedIn,
    expandedId,
    setExpandedId,
    composeType,
    setComposeType,
    composerBusy,
    gateBusy,
    target,
    setTarget,
    submitPost: (input) => void submitPost(input),
    runAction: (kind) => void runAction(kind),
    onFollow: () => void onFollow(),
  };
}
