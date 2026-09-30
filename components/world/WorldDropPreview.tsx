import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useReducedMotion,
} from 'react-native-reanimated';
import type { WorldDrop } from '../../services/worldService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { ArrowRightIcon, PlayIcon } from '../shared/icons';
import { tap as hapticTap } from '../../utils/haptics';

export interface WorldDropPreviewProps {
  drop: WorldDrop;
  onView: (drop: WorldDrop) => void;
  onDismiss?: () => void;
}

/** Floating Drop preview over the map — visual first, privacy-safe meta only. */
export function WorldDropPreview({ drop, onView, onDismiss }: WorldDropPreviewProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const handle = drop.author?.handle ? `@${drop.author.handle}` : drop.author?.name ?? 'Someone';
  const distance = drop.distanceBand ?? 'Nearby';
  const isVideo = drop.media?.kind === 'video';
  const imageUrl = drop.media?.kind === 'image' ? drop.media.url : null;
  const title = drop.mission?.title ?? (drop.caption.trim() || 'World Drop');

  const entering = reduced ? undefined : FadeInDown.springify().damping(18).stiffness(210);
  const exiting = reduced ? undefined : FadeOutDown.duration(150);

  return (
    <Animated.View
      entering={entering}
      exiting={exiting}
      style={[
        styles.wrap,
        {
          backgroundColor: t.scheme === 'light' ? 'rgba(255,255,255,0.97)' : 'rgba(30,30,34,0.97)',
          borderColor: t.scheme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
          shadowColor: t.shadowColor,
        },
      ]}
      accessibilityViewIsModal
    >
      <Pressable
        onPress={onDismiss}
        style={styles.handleHit}
        accessibilityRole="button"
        accessibilityLabel="Dismiss preview"
      >
        <View
          style={[
            styles.handle,
            { backgroundColor: t.scheme === 'light' ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.2)' },
          ]}
        />
      </Pressable>

      <View style={[styles.media, { backgroundColor: t.surfaceMuted }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.mediaFallback]}>
            <PlayIcon size={28} color={t.textPrimary} strokeWidth={2.2} />
          </View>
        )}
        {isVideo ? (
          <View style={styles.videoChip}>
            <PlayIcon size={11} color="#F5F5F7" strokeWidth={2.4} />
            <Text allowFontScaling={false} style={styles.videoChipText}>
              Video
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {handle} · {distance}
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        {drop.mission && drop.caption.trim() ? (
          <Text allowFontScaling={false} style={[styles.caption, { color: t.textSecondary }]} numberOfLines={2}>
            {drop.caption}
          </Text>
        ) : null}

        <Pressable
          onPress={() => {
            hapticTap();
            onView(drop);
          }}
          style={[
            styles.openRow,
            { backgroundColor: t.scheme === 'light' ? '#111113' : '#F5F5F7' },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open Drop"
        >
          <Text
            allowFontScaling={false}
            style={[
              styles.openText,
              { color: t.scheme === 'light' ? '#F5F5F7' : '#111113' },
            ]}
          >
            Open
          </Text>
          <ArrowRightIcon
            size={16}
            color={t.scheme === 'light' ? '#F5F5F7' : '#111113'}
            strokeWidth={2.2}
          />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  handleHit: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: {
    width: 34,
    height: 4,
    borderRadius: 2,
  },
  media: {
    width: '100%',
    aspectRatio: 16 / 10,
  },
  mediaFallback: { alignItems: 'center', justifyContent: 'center' },
  videoChip: {
    position: 'absolute',
    left: space.sm,
    bottom: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  videoChipText: {
    ...typeScale.caption,
    color: '#F5F5F7',
    fontSize: 10,
  },
  body: {
    gap: 6,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    paddingTop: space.sm,
  },
  meta: { ...typeScale.meta },
  title: { ...typeScale.section },
  caption: { ...typeScale.meta },
  openRow: {
    marginTop: space.xs,
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  openText: { ...typeScale.button, fontSize: 14 },
});
