import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { TakeMedia as TakeMediaModel } from '../../store';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { PlayIcon } from '../shared/icons';
import { MediaViewer } from '../shared/MediaViewer';

export type TakeMediaVariant = 'feed' | 'detail';

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
  const hasUrl = Boolean(media.url);
  const detail = variant === 'detail' || edge;
  const [frameRatio, setFrameRatio] = React.useState(detail ? 4 / 5 : 5 / 4);
  const [viewerOpen, setViewerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!detail || !hasUrl || !media.url) {
      setFrameRatio(detail ? 3 / 4 : 5 / 4);
      return;
    }
    let cancelled = false;
    Image.getSize(
      media.url,
      (w, h) => {
        if (cancelled || w <= 0 || h <= 0) return;
        const r = w / h;
        // Clamp frame so extreme ratios still fit on screen without stretch.
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
  }, [detail, hasUrl, media.url]);

  const fitMode = detail ? 'contain' : 'cover';

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
      {hasUrl ? (
        <>
          {detail || fitMode === 'contain' ? (
            <Image
              source={{ uri: media.url as string }}
              resizeMode="cover"
              blurRadius={24}
              style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
            />
          ) : null}
          <Image
            source={{ uri: media.url as string }}
            resizeMode={fitMode}
            style={StyleSheet.absoluteFill}
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
        <View style={styles.play}>
          <PlayIcon size={20} color="#FAFAF8" strokeWidth={2.4} />
        </View>
      ) : null}
      {media.caption ? (
        <Text allowFontScaling={false} style={[styles.caption, { color: detail ? t.textPrimary : '#FAFAF8' }]}>
          {media.caption}
        </Text>
      ) : null}
    </View>
  );

  if (detail && hasUrl) {
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
          uri={media.url ?? null}
          kind={isVideo ? 'video' : 'image'}
          onClose={() => setViewerOpen(false)}
        />
      </>
    );
  }

  return plate;
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: space.md,
    width: '100%',
  },
  feed: {
    aspectRatio: 5 / 4,
    borderRadius: radius.lg,
  },
  detail: {
    borderRadius: radius.xxl,
    maxHeight: 560,
    minHeight: 220,
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,11,0.12)',
  },
  play: {
    position: 'absolute',
    alignSelf: 'center',
    top: '36%',
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  caption: { ...typeScale.meta },
});
