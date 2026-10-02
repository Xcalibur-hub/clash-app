import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { TakeMedia as TakeMediaModel } from '../../store';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { PlayIcon } from '../shared/icons';
import { MediaViewer } from '../shared/MediaViewer';

export type TakeMediaVariant = 'feed' | 'detail';

/** Image URL safe for <Image>. Never returns an mp4/mov/video URL. */
function stillUrl(media: TakeMediaModel): string | undefined {
  if (media.kind === 'video') return media.posterUrl;
  return media.url;
}

/**
 * Bounded media plate.
 * Feed: editorial cover crop (5:4).
 * Detail: preserve full image (contain) with intelligent frame — no blind cover-crop.
 * Video: static poster/frame only until MediaViewer opens (never autoplay here).
 */
export function TakeMedia({
  media,
  edge = false,
  variant = 'feed',
}: {
  media: TakeMediaModel;
  /** @deprecated Prefer variant="detail". Kept for older call sites. */
  edge?: boolean;
  variant?: TakeMediaVariant;
}): React.JSX.Element {
  const t = useThemeColors();
  const isVideo = media.kind === 'video';
  const poster = stillUrl(media);
  const hasStill = Boolean(poster);
  const playUrl = media.url;
  const detail = variant === 'detail' || edge;
  const [frameRatio, setFrameRatio] = React.useState(detail ? 4 / 5 : 5 / 4);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [poster]);

  React.useEffect(() => {
    if (!detail || !poster || imageFailed) {
      setFrameRatio(detail ? 3 / 4 : 5 / 4);
      return;
    }
    let cancelled = false;
    Image.getSize(
      poster,
      (w, h) => {
        if (cancelled || w <= 0 || h <= 0) return;
        const r = w / h;
        const clamped = Math.min(1.85, Math.max(0.55, r));
        setFrameRatio(clamped);
      },
      () => {
        if (!cancelled) setFrameRatio(3 / 4);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [detail, imageFailed, poster]);

  const fitMode = detail ? 'contain' : 'cover';
  const showImage = hasStill && !imageFailed;

  const plate = (
    <View
      style={[
        styles.wrap,
        detail ? styles.detail : styles.feed,
        detail && { aspectRatio: frameRatio, backgroundColor: t.surfaceMuted },
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${media.kind}${media.caption ? `: ${media.caption}` : ''}`}
    >
      {showImage ? (
        <>
          {detail || fitMode === 'contain' ? (
            <Image
              source={{ uri: poster as string }}
              resizeMode="cover"
              blurRadius={24}
              style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
              onError={() => setImageFailed(true)}
            />
          ) : null}
          <Image
            source={{ uri: poster as string }}
            resizeMode={fitMode}
            style={StyleSheet.absoluteFill}
            onError={() => setImageFailed(true)}
          />
        </>
      ) : (
        <LinearGradient
          colors={media.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {!detail ? <View style={styles.veil} pointerEvents="none" /> : null}
      {isVideo ? (
        <View style={styles.play} pointerEvents="none">
          <PlayIcon size={20} color="#FAFAF8" strokeWidth={2.4} />
          {!showImage ? (
            <Text allowFontScaling={false} style={styles.videoLabel}>
              VIDEO
            </Text>
          ) : null}
        </View>
      ) : null}
      {media.caption ? (
        <Text allowFontScaling={false} style={[styles.caption, { color: detail ? t.textPrimary : '#FAFAF8' }]}>
          {media.caption}
        </Text>
      ) : null}
    </View>
  );

  if (detail && playUrl) {
    return (
      <>
        <Pressable
          onPress={() => setViewerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={isVideo ? 'Play video' : 'View full media'}
        >
          {plate}
        </Pressable>
        <MediaViewer
          visible={viewerOpen}
          onClose={() => setViewerOpen(false)}
          uri={playUrl}
          kind={media.kind === 'video' ? 'video' : 'image'}
        />
      </>
    );
  }

  return plate;
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: '#111113',
  },
  feed: {
    aspectRatio: 5 / 4,
  },
  detail: {
    width: '100%',
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,11,0.12)',
  },
  play: {
    position: 'absolute',
    right: space.md,
    bottom: space.md,
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(8,8,11,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
  },
  videoLabel: {
    ...typeScale.caption,
    color: '#FAFAF8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  caption: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.md,
    ...typeScale.caption,
    fontWeight: '700',
  },
});
