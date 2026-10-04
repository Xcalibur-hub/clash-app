import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CommunitySummary } from '../../../services/vaultCommunityMappers';
import type { WorldRow } from '../../../utils/vaultWorldRows';
import type { WorldPersonality } from '../../../utils/vaultWorldPersonality';
import { personalityRadius, personalityScatter } from '../../../utils/vaultWorldPersonality';
import { space } from '../../../theme';
import { EmptyState } from '../../shared/EmptyState';
import { VaultIcon } from '../../shared/icons';
import { ChapterHeading } from './ChapterHeading';
import { DropComposition } from './DropComposition';
import { EditorialMedia } from './EditorialMedia';
import { GalleryShelf } from './GalleryShelf';
import { SeriesComposition } from './SeriesComposition';
import { SessionInvite } from './SessionInvite';
import { CommunityChapterCard } from '../community/CommunityChapterCard';

export interface WorldChapterProps {
  row: WorldRow;
  personality: WorldPersonality;
  creatorName: string;
  creatorTint: string | null;
  community: CommunitySummary | null;
  isSelf: boolean;
  onOpenDrop: (id: string) => void;
  onOpenCollection: (id: string) => void;
  onOpenService: (id: string) => void;
  onOpenCourse: (id: string) => void;
  onOpenProduct: (id: string) => void;
  onOpenCommunity: () => void;
  onCreate: () => void;
}

/** Renders a single world chapter with its own composition. */
export const WorldChapter = React.memo(function WorldChapter({
  row,
  personality,
  creatorName,
  creatorTint,
  community,
  isSelf,
  onOpenDrop,
  onOpenService,
  onOpenCourse,
  onOpenProduct,
  onOpenCommunity,
  onCreate,
}: WorldChapterProps): React.JSX.Element | null {
  const radius = personalityRadius(personality);
  const scatter = [0, 1, 2, 3, 4, 5, 6, 7].map((index) => personalityScatter(personality, index));

  switch (row.kind) {
    case 'chapter':
      return <ChapterHeading index={row.index} title={row.title} count={row.count} />;
    case 'drops':
      return (
        <DropComposition
          drops={row.drops}
          personality={row.personality}
          radius={radius}
          accent={creatorTint}
          onOpen={onOpenDrop}
        />
      );
    case 'collections':
      return (
        <SeriesComposition
          collections={row.collections}
          radius={radius}
          scatter={scatter}
          onOpen={onOpenDrop}
        />
      );
    case 'services':
      return (
        <SessionInvite
          items={row.items.map((service) => ({
            id: service.id,
            title: service.title,
            subtitle: service.subtitle,
            mediaUrl: service.mediaUrl,
            tint: creatorTint,
            meta: service.meta,
          }))}
          creatorName={creatorName}
          radius={radius}
          onOpen={onOpenService}
        />
      );
    case 'courses':
      return (
        <View style={styles.stack}>
          {row.items.map((course, index) => (
            <EditorialMedia
              key={course.id}
              mediaUrl={course.mediaUrl}
              accent={creatorTint}
              height={300}
              radius={radius}
              badge={String(index + 1).padStart(2, '0')}
              kicker="MASTERCLASS"
              title={course.title}
              meta={course.meta}
              onPress={() => onOpenCourse(course.id)}
            />
          ))}
        </View>
      );
    case 'products':
      return (
        <GalleryShelf
          items={row.items.map((product) => ({
            id: product.id,
            title: product.title,
            mediaUrl: product.mediaUrl,
            tint: creatorTint,
            meta: product.meta,
          }))}
          radius={radius}
          onOpen={onOpenProduct}
        />
      );
    case 'community':
      if (!community) return null;
      return (
        <CommunityChapterCard
          summary={community}
          creatorName={creatorName}
          tint={creatorTint}
          onEnter={onOpenCommunity}
        />
      );
    case 'empty':
      return (
        <EmptyState
          icon={VaultIcon}
          title={isSelf ? 'Your Vault is ready' : 'Nothing inside yet'}
          body={isSelf ? 'Share something your followers will not find in Arena.' : 'This creator has not posted a Drop yet.'}
          actionLabel={isSelf ? 'Create first Drop' : undefined}
          onAction={isSelf ? onCreate : undefined}
        />
      );

    default:
      return null;
  }
});
const styles = StyleSheet.create({
  stack: { gap: space.lg },
});