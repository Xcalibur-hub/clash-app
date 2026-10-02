/**
 * Immersive Take Detail media hero — story/article composition.
 * Large cover plate, take copy + author on the media, tap opens viewer.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HOOD_LABEL } from '../../data/hoods';
import type { Take, User } from '../../store';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { resolveStillUrl } from '../../utils/mediaStill';
import { Avatar } from '../shared/Avatar';
import { PlayIcon } from '../shared/icons';
import { MediaViewer } from '../shared/MediaViewer';

export interface TakeDetailHeroProps {
  take: Take;
  author: User;
  isViewer?: boolean;
}

export function TakeDetailHero({
  take,
  author,
  isViewer = false,
}: TakeDetailHeroProps): React.JSX.Element | null {
  const t = useThemeColors();
  const { width } = useWindowDimensions();
  const media = take.media;
  const [failed, setFailed] = React.useState(false);
  const [viewerOpen, setViewerOpen] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [media?.url, media?.posterUrl]);

  if (!media) return null;

  const still = resolveStillUrl(media);
  const showImage = Boolean(still) && !failed;
  const isVideo = media.kind === 'video';
  const playUrl = media.url;
  const hood = HOOD_LABEL[take.hood] ?? take.hood;
  const cardW = width - space.md * 2;
  const height = Math.min(520, Math.max(360, Math.round(cardW * 1.12)));

  return (
    <>
      <Pressable
        onPress={() => {
          if (playUrl) setViewerOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={isVideo ? 'Play video' : 'View full media'}
        style={[
          styles.card,
          {
            width: cardW,
            height,
            borderRadius: 28,
            shadowColor: t.shadowColor,
            backgroundColor: '#111113',
          },
        ]}
      >
        {showImage ? (
          <Image
            source={{ uri: still as string }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <LinearGradient
            colors={[...(media.colors.length >= 2 ? media.colors : (['#2A2A2E', '#111113'] as const))]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        <LinearGradient
          colors={['transparent', 'rgba(8,8,11,0.28)', 'rgba(8,8,11,0.86)']}
          locations={[0.28, 0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {isVideo ? (
          <View style={styles.playBadge} pointerEvents="none">
            <PlayIcon size={16} color="#FAFAF8" strokeWidth={2.4} />
          </View>
        ) : null}

        <View style={styles.copy}>
          <Text allowFontScaling style={styles.headline} numberOfLines={5}>
            {take.text}
          </Text>
          <View style={styles.authorRow}>
            <Avatar name={author.name} tint={author.tint} size={26} />
            <Text allowFontScaling={false} style={styles.authorMeta} numberOfLines={1}>
              @{author.handle}
              {isViewer ? ' · You' : ''} · {hood}
            </Text>
          </View>
        </View>
      </Pressable>

      {playUrl ? (
        <MediaViewer
          visible={viewerOpen}
          onClose={() => setViewerOpen(false)}
          uri={playUrl}
          kind={isVideo ? 'video' : 'image'}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    alignSelf: 'center',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  playBadge: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(8,8,11,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    paddingTop: space.xxl,
    gap: space.sm,
  },
  headline: {
    color: '#FAFAF8',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.55,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  authorMeta: {
    ...typeScale.meta,
    color: 'rgba(250,250,248,0.78)',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
});
