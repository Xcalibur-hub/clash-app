import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, space, useThemeColors } from '../../../theme';
import { EmptyState } from '../../shared/EmptyState';
import { VaultIcon } from '../../shared/icons';
import { CommunityActionSheet } from './CommunityActionSheet';
import { CommunityFeed } from './CommunityFeed';
import { CommunityGate } from './CommunityGate';
import { communityActionsFor, communityTargetLabel } from './communityTargets';
import { useCommunityScreen } from './useCommunityScreen';

export interface CommunityScreenProps {
  communityId: string;
}

/** Creator World community home — gate, feed, composer, moderation. */
export function CommunityScreen({ communityId }: CommunityScreenProps): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const model = useCommunityScreen(communityId);

  if (model.phase === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.textMuted} />
      </View>
    );
  }

  const { summary } = model;
  if (model.phase === 'missing' || !summary) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <EmptyState
          icon={VaultIcon}
          title="Community unavailable"
          body="This community is closed, or you can not view it."
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      {summary.viewerAccess ? (
        <CommunityFeed
          summary={summary}
          tint={model.creatorTint}
          posts={model.posts}
          expandedPostId={model.expandedId}
          onToggleExpanded={(id) => model.setExpandedId((prev) => (prev === id ? null : id))}
          onMore={model.setTarget}
          onOpenProfile={(profileId) => router.push(`/profile/${profileId}`)}
          onBack={() => router.back()}
          realName={model.viewerName}
          composeType={model.composeType}
          onChangeComposeType={model.setComposeType}
          composerBusy={model.composerBusy}
          onSubmitPost={model.submitPost}
        />
      ) : (
        <View style={[styles.gate, { paddingTop: insets.top + space.xl }]}>
          <CommunityGate
            accessType={summary.accessType}
            creatorName={model.creatorName}
            signedIn={model.signedIn}
            following={model.following}
            subscribed={false}
            busy={model.gateBusy}
            onFollow={model.onFollow}
            onSubscribe={() => router.push(`/vault/${summary.creatorId}`)}
            onSignIn={() => router.push('/auth')}
          />
        </View>
      )}

      <CommunityActionSheet
        visible={model.target !== null}
        title={model.target ? communityTargetLabel(model.target) : ''}
        actions={model.target ? communityActionsFor(model.target) : []}
        onAction={model.runAction}
        onClose={() => model.setTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: layout.screenX },
  gate: { flex: 1, paddingHorizontal: layout.screenX, gap: space.md },
});