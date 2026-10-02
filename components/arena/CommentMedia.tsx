/**
 * Compact media plate for threaded replies — preserves aspect ratio,
 * clamps extremes, opens MediaViewer on tap. No autoplay for video.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
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
}: {
  media: TakeMediaModel;
  /** Deeper nest levels use a slightly shorter max height. */
  compact?: boolean;
}): React.JSX.Element | null {
  const t = useThemeColors();
  const hasUrl = Boolean(media.url);
  const isVideo = media.kind === 'video';
  const [ratio, setRatio] = React.useState(1);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const maxH = compact ? 200 : MAX_H;

  React.useEffect(() => {
    if (!hasUrl || !media.url || isVideo) {
      setRatio(isVideo ? 16 / 9 : 1);
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
        if (!cancelled) setRatio(1);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hasUrl, isVideo, media.url]);

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
      accessibilityLabel={isVideo ? 'Video reply' : 'Image reply'}
    >
      <Image
        source={{ uri: media.url as string }}
        resizeMode="contain"
        style={StyleSheet.absoluteFill}
      />
      {isVideo ? (
        <View style={styles.play} pointerEvents="none">
          <PlayIcon size={22} color="#FAFAF8" strokeWidth={2.4} />
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <Pressable
        onPress={() => setViewerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={isVideo ? 'Open video' : 'View full image'}
        style={styles.press}
      >
        {plate}
      </Pressable>
      <MediaViewer
        visible={viewerOpen}
        uri={media.url ?? null}
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
});
