import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CommunitySummary } from '../../../services/vaultCommunityMappers';
import type { WorldRow } from '../../../utils/vaultWorldRows';
import type { WorldPersonality } from '../../../utils/vaultWorldPersonality';
import { personalityRadius, personalityScatter } from '../../../utils/vaultWorldPersonality';
import { space, typeScale, useThemeColors } from '../../../theme';
import { EmptyState } from '../../shared/EmptyState';
import { VaultIcon } from '../../shared/icons';
import { ChapterHeading } from './ChapterHeading';
import { DropComposition } from './DropComposition';
import { EditorialMedia } from './EditorialMedia';
import { GalleryShelf } from './GalleryShelf';
import { SeriesComposition } from './SeriesComposition';
import { SessionInvite } from './SessionInvite';
import { CommunityChapterCard } from '../community/CommunityChapterCard';
import { WorldDropsChapter } from './WorldDropsChapter';

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
  onOpenWorldDrop: (dropId: string) => void;
  onManageWorldDrops: () => void;
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
  onOpenWorldDrop,
  onManageWorldDrops,
}: WorldChapterProps): React.JSX.Element | null {
  const t = useThemeColors();
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
            <View key={course.id} style={styles.course}>
              <EditorialMedia
                mediaUrl={course.mediaUrl}
                accent={creatorTint}
                height={personality === 'studio' ? 240 : 280}
                width={personality === 'studio' ? 240 : '100%'}
                radius={radius}
                shape={personality === 'cinematic' ? 'film' : personality === 'studio' ? 'circle' : 'rect'}
                texture={personality === 'blueprint' ? 'grid' : personality === 'cinematic' ? 'grain' : null}
                style={personality === 'studio' ? styles.courseCircle : undefined}
                onPress={() => onOpenCourse(course.id)}
              />
              <View style={styles.courseCopy}>
                <Text allowFontScaling={false} style={[styles.courseIndex, { color: t.textMuted }]}>
                  {String(index + 1).padStart(2, '0')}
                </Text>
                <View style={styles.courseText}>
                  <Text allowFontScaling={false} style={[styles.courseKicker, { color: t.textMuted }]}>
                    MASTERCLASS
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[styles.courseTitle, { color: t.textPrimary }]}
                    numberOfLines={2}
                  >
                    {course.title}
                  </Text>
                  {course.meta ? (
                    <Text allowFontScaling={false} style={[styles.courseMeta, { color: t.textMuted }]} numberOfLines={1}>
                      {course.meta}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
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
    case 'worldDrops':
      return (
        <WorldDropsChapter
          items={row.items}
          isSelf={isSelf}
          tint={creatorTint}
          onOpen={onOpenWorldDrop}
          onFind={() => {
            const firstDrop = row.items[0];
            if (firstDrop) onOpenWorldDrop(firstDrop.id);
          }}
          onManage={onManageWorldDrops}
        />
      );

    case 'empty':
      return (
        <EmptyState
          icon={VaultIcon}
          title={isSelf ? 'Your Vault is ready' : 'Nothing inside yet'}
          body={
            isSelf
              ? 'Share something your followers will not find in Arena.'
              : 'This creator has not posted a Drop yet.'
          }
          actionLabel={isSelf ? 'Create first Drop' : undefined}
          onAction={isSelf ? onCreate : undefined}
        />
      );

    default:
      return null;
  }
});

const styles = StyleSheet.create({
  stack: { gap: space.xl },
  course: { gap: space.md },
  courseCircle: { alignSelf: 'center' },
  courseCopy: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  courseIndex: {
    fontFamily: typeScale.display.fontFamily,
    fontSize: 36,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -1,
    width: 58,
  },
  courseText: { flex: 1, gap: 3, paddingTop: 4 },
  courseKicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  courseTitle: {
    ...typeScale.title,
    fontSize: 24,
    lineHeight: 27,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  courseMeta: { ...typeScale.caption, letterSpacing: 0.3 },
});
