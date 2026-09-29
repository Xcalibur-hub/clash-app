import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import type { WorldDrop } from '../../services/worldService';
import { card, ink, radius, space, typeScale } from '../../theme';
import { GlowButton } from '../shared/GlowButton';
import { PlayIcon } from '../shared/icons';
import { tap as hapticTap } from '../../utils/haptics';

export interface WorldDropPreviewProps {
  drop: WorldDrop;
  onView: (drop: WorldDrop) => void;
  onDismiss?: () => void;
}

/** Bottom sheet preview over the map — springy enter, content-first. */
export function WorldDropPreview({ drop, onView, onDismiss }: WorldDropPreviewProps): React.JSX.Element {
  const author = drop.author?.name ?? (drop.author ? `@${drop.author.handle}` : 'Someone');
  const distance = drop.distanceBand ?? 'Nearby';

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18).stiffness(180)}
      exiting={FadeOutDown.duration(160)}
      style={styles.wrap}
      accessibilityViewIsModal
    >
      <Pressable
        onPress={onDismiss}
        style={styles.handleHit}
        accessibilityRole="button"
        accessibilityLabel="Dismiss preview"
      >
        <View style={styles.handle} />
      </Pressable>

      <View style={styles.media}>
        {drop.media?.kind === 'image' && drop.media.url ? (
          <Image source={{ uri: drop.media.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.mediaFallback]}>
            <PlayIcon size={28} color={ink.primary} strokeWidth={2.2} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text allowFontScaling={false} style={styles.meta}>
          {author} · {distance}
        </Text>
        {drop.mission ? (
          <Text allowFontScaling={false} style={styles.mission}>{drop.mission.title}</Text>
        ) : null}
        {drop.caption ? (
          <Text allowFontScaling={false} style={styles.caption} numberOfLines={3}>
            {drop.caption}
          </Text>
        ) : null}
        <GlowButton
          label="View Drop"
          tone="light"
          compact
          onPress={() => {
            hapticTap();
            onView(drop);
          }}
          style={styles.cta}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: 'rgba(12,12,15,0.96)',
    overflow: 'hidden',
  },
  handleHit: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  media: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  mediaFallback: { alignItems: 'center', justifyContent: 'center' },
  body: { gap: 6, paddingHorizontal: space.md, paddingBottom: space.md, paddingTop: space.sm },
  meta: { ...typeScale.meta, color: ink.secondary },
  mission: { ...typeScale.caption, color: ink.tertiary },
  caption: { ...typeScale.body, color: ink.primary },
  cta: { alignSelf: 'flex-start', marginTop: space.xs },
});
