import React from 'react';
import { FlatList, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';
import type { CommunityPostCard, CommunitySummary } from '../../../services/vaultCommunityMappers';
import { communityCoverUrl } from '../../../services/vaultCommunityService';
import { space, typeScale, useThemeColors } from '../../../theme';
import { ExploreHeading } from '../../explore/ExploreHeading';
import { CommunityAnnouncementCard } from './CommunityAnnouncementCard';
import { CommunityComposerSection } from './CommunityComposerSection';
import { CommunityHero } from './CommunityHero';
import { CommunityThread } from './CommunityThread';
import type { CommunityTarget } from './communityTargets';

type FeedRow =
  | { kind: 'hero' }
  | { kind: 'announcement'; post: CommunityPostCard }
  | { kind: 'heading' }
  | { kind: 'post'; post: CommunityPostCard }
  | { kind: 'empty' }
  | { kind: 'composer' };

export interface CommunityFeedProps {
  summary: CommunitySummary;
  tint?: string | null;
  creatorName?: string | null;
  posts: readonly CommunityPostCard[];
  expandedPostId: string | null;
  onToggleExpanded: (postId: string) => void;
  onMore: (target: CommunityTarget) => void;
  onOpenProfile: (profileId: string) => void;
  onBack: () => void;
  realName: string;
  composeType: 'discussion' | 'announcement';
  onChangeComposeType: (type: 'discussion' | 'announcement') => void;
  composerBusy: boolean;
  onSubmitPost: (input: { body: string; pseudonymous: boolean }) => void;
  onEndReached?: () => void;
}

/** Community home: hero, pinned announcement, discussions, composer. */
export function CommunityFeed({
  summary,
  tint,
  creatorName,
  posts,
  expandedPostId,
  onToggleExpanded,
  onMore,
  onOpenProfile,
  onBack,
  realName,
  composeType,
  onChangeComposeType,
  composerBusy,
  onSubmitPost,
  onEndReached,
}: CommunityFeedProps): React.JSX.Element {
  const t = useThemeColors();
  const announcement = summary.latestAnnouncement;

  const rows: FeedRow[] = [
    { kind: 'hero' },
    ...(announcement ? [{ kind: 'announcement', post: announcement } as FeedRow] : []),
    { kind: 'heading' },
    ...(posts.length > 0
      ? posts.map((post): FeedRow => ({ kind: 'post', post }))
      : [{ kind: 'empty' } as FeedRow]),
    ...(summary.viewerCanPost ? [{ kind: 'composer' } as FeedRow] : []),
  ];

  const renderItem = ({ item }: ListRenderItemInfo<FeedRow>): React.JSX.Element => {
    switch (item.kind) {
      case 'hero':
        return (
          <CommunityHero
            name={summary.name}
            creatorName={creatorName}
            description={summary.description}
            accessType={summary.accessType}
            memberCount={summary.memberCount}
            activeToday={summary.activeToday}
            coverUrl={communityCoverUrl(summary.iconMedia)}
            tint={tint}
            onBack={onBack}
          />
        );
      case 'announcement':
        return (
          <CommunityAnnouncementCard
            post={item.post}
            creatorName={summary.name}
            onMore={
              item.post.canDelete || item.post.canModerate
                ? () => onMore({ kind: 'post', post: item.post })
                : undefined
            }
          />
        );
      case 'heading':
        return <ExploreHeading title="DISCUSSIONS" />;
      case 'post':
        return (
          <CommunityThread
            post={item.post}
            expanded={expandedPostId === item.post.id}
            pseudonymEnabled={summary.pseudonymousEnabled}
            pseudonym={summary.viewerPseudonym}
            realName={realName}
            onToggleExpanded={() => onToggleExpanded(item.post.id)}
            onMore={onMore}
            onOpenProfile={onOpenProfile}
          />
        );
      case 'empty':
        return (
          <Text allowFontScaling={false} style={[styles.empty, { color: t.textMuted }]}>
            No discussions yet. Start the first one.
          </Text>
        );
      case 'composer':
        return (
          <CommunityComposerSection
            canAnnounce={summary.viewerCanAnnounce}
            pseudonymous={summary.pseudonymousEnabled}
            pseudonym={summary.viewerPseudonym}
            realName={realName}
            composeType={composeType}
            onChangeComposeType={onChangeComposeType}
            busy={composerBusy}
            onSubmit={onSubmitPost}
          />
        );
      default:
        return <View />;
    }
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(row, index) => `${row.kind}:${'post' in row ? row.post.id : index}`}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xxxl, gap: space.md },
  empty: { ...typeScale.meta, paddingVertical: space.lg, textAlign: 'center' },
});
