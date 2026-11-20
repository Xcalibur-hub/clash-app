/**
 * Compact media plate for threaded replies — preserves aspect ratio,
 * clamps extremes, opens MediaViewer on tap. No autoplay for video.
 * GIFs animate via RN Image using the Tenor tinygif URL (no VideoPlayer).
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { TakeMedia as TakeMediaModel } from '../../store';
import { radius, useThemeColors } from '../../theme';
import { PlayIcon } from '../shared/icons';
import { MediaViewer } from '../shared/MediaViewer';

const MAX_H = 280;
const MIN_RATIO = 0.55;
const MAX_RATIO = 1.85;

export function CommentMedia({
  media,
  compact = false,
  /** When false, GIF previews stay static (off-screen / perf). */
  animateGif = true,
}: {
  media: TakeMediaModel;
  /** Deeper nest levels use a slightly shorter max height. */
  compact?: boolean;
  animateGif?: boolean;
}): React.JSX.Element | null {
  const t = useThemeColors();
  const reducedMotion = useReducedMotion();
  const playGif = animateGif && !reducedMotion;
  const hasUrl = Boolean(media.url);
  const isVideo = media.kind === 'video';
  const isGif = media.kind === 'gif';
  const [ratio, setRatio] = React.useState(isGif ? 1.2 : 1);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const maxH = compact ? 200 : MAX_H;

  React.useEffect(() => {
    if (!hasUrl || !media.url || isVideo) {
      setRatio(isVideo ? 16 / 9 : isGif ? 1.2 : 1);
      return;
    }
    let cancelled = false;
    Image.getSize(
      media.url,
      (w, h) => {
        if (cancelled || w <= 0 || h <= 0) return;
        setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, w / h)));
      },
      () => {
        if (!cancelled) setRatio(isGif ? 1.2 : 1);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hasUrl, isGif, isVideo, media.url]);

  if (!hasUrl) return null;

  const plate = (
    <View
      style={[
        styles.plate,
        {
          aspectRatio: ratio,
          maxHeight: maxH,
          backgroundColor: t.surfaceMuted,
          borderColor: t.border,
        },
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={isVideo ? 'Video reply' : isGif ? 'GIF reply' : 'Image reply'}
    >
      {isGif && !playGif ? (
        <View style={[StyleSheet.absoluteFill, styles.gifPaused, { backgroundColor: t.surfaceMuted }]}>
          <Text allowFontScaling={false} style={[styles.gifPausedText, { color: t.textMuted }]}>
            GIF
          </Text>
        </View>
      ) : (
        <Image
          source={{ uri: media.url as string }}
          resizeMode="contain"
          style={StyleSheet.absoluteFill}
        />
      )}
      {isVideo ? (
        <View style={styles.play} pointerEvents="none">
          <PlayIcon size={22} color="#FAFAF8" strokeWidth={2.4} />
        </View>
      ) : null}
      {isGif ? (
        <View style={styles.gifBadge} pointerEvents="none">
          <Text allowFontScaling={false} style={styles.gifBadgeText}>
            GIF
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <Pressable
        onPress={() => setViewerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={isVideo ? 'Open video' : isGif ? 'View GIF' : 'View full image'}
        style={styles.press}
      >
        {plate}
      </Pressable>
      <MediaViewer
        visible={viewerOpen}
        uri={media.url ?? null}
        kind={isVideo ? 'video' : 'image'}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  press: { alignSelf: 'stretch', maxWidth: '100%' },
  plate: {
    width: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  play: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.28)',
  },
  gifBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(8,8,11,0.55)',
  },
  gifBadgeText: {
    color: '#FAFAF8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  gifPaused: { alignItems: 'center', justifyContent: 'center' },
  gifPausedText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
});
