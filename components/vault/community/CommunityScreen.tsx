import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { layout, space, useThemeColors } from '../../../theme';
import { EmptyState } from '../../shared/EmptyState';
import { VaultIcon } from '../../shared/icons';
import { CommunityActionSheet, type CommunityActionKind } from './CommunityActionSheet';
import { CommunityFeed } from './CommunityFeed';
import { CommunityGate } from './CommunityGate';
import { communityActionsFor, communityTargetLabel, type CommunityTarget } from './communityTargets';

type Phase = 'loading' | 'ready' | 'missing';

export interface CommunityScreenProps {
  communityId: string;
}

/** Creator World community home — gate, feed, composer, moderation. */
export function CommunityScreen({ communityId }: CommunityScreenProps): React.JSX.Element {
  const { dispatch } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();

  const [phase, setPhase] = React.useState<Phase>('loading');
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

  if (phase === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.textMuted} />
      </View>
    );
  }

  if (phase === 'missing' || !summary) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <EmptyState
          icon={VaultIcon}
          title="Community unavailable"
          body="This community is closed, or you can't view it."
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      {summary.viewerAccess ? (
        <CommunityFeed
          summary={summary}
          tint={creatorTint}
          posts={posts}
          expandedPostId={expandedId}
          onToggleExpanded={(id) => setExpandedId((prev) => (prev === id ? null : id))}
          onMore={setTarget}
          onOpenProfile={(profileId) => router.push(`/profile/${profileId}`)}
          onBack={() => router.back()}
          realName={viewerName}
          composeType={composeType}
          onChangeComposeType={setComposeType}
          composerBusy={composerBusy}
          onSubmitPost={(input) => void submitPost(input)}
        />
      ) : (
        <View style={[styles.gate, { paddingTop: insets.top + space.xl }]}>
          <CommunityGate
            accessType={summary.accessType}
            creatorName={creatorName}
            signedIn={signedIn}
            following={following}
            subscribed={false}
            busy={gateBusy}
            onFollow={() => void onFollow()}
            onSubscribe={() => router.push(`/vault/${summary.creatorId}`)}
            onSignIn={() => router.push('/auth')}
          />
        </View>
      )}

      <CommunityActionSheet
        visible={target !== null}
        title={target ? communityTargetLabel(target) : ''}
        actions={target ? communityActionsFor(target) : []}
        onAction={(kind) => void runAction(kind)}
        onClose={() => setTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: layout.screenX },
  gate: { flex: 1, paddingHorizontal: layout.screenX, gap: space.md },
});
