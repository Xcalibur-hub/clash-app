import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { TakeMedia as TakeMediaModel } from '../../store';
import { ink, radius, space, typeScale } from '../../theme';
import { PlayIcon } from '../shared/icons';

/**
 * Bounded media plate for feed / detail.
 *
 * Feed (default): inset frame with rounded clipping and a fixed 4:5 aspect —
 * large, but never an uncontrolled full-bleed giant. Images use cover so
 * portrait and landscape both fill the frame without absurd height or tiny strips.
 *
 * `edge` is reserved for rare full-bleed contexts (e.g. detail hero); prefer inset.
 */
export function TakeMedia({
  media,
  edge = false,
}: {
  media: TakeMediaModel;
  /** Full-bleed treatment — no horizontal radius, still aspect-capped. */
  edge?: boolean;
}): React.JSX.Element {
  const isVideo = media.kind === 'video';
  const hasImage = media.kind === 'image' && Boolean(media.url);
  return (
    <View
      style={[styles.wrap, edge ? styles.edge : styles.inset]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${media.kind}${media.caption ? `: ${media.caption}` : ''}`}
    >
      {hasImage ? (
        <Image source={{ uri: media.url as string }} resizeMode="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient
          colors={media.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={styles.veil} pointerEvents="none" />
      {isVideo ? (
        <View style={styles.play}>
          <PlayIcon size={20} color={ink.primary} strokeWidth={2.4} />
        </View>
      ) : null}
      {media.caption ? (
        <Text allowFontScaling={false} style={styles.caption}>
          {media.caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: space.md,
    width: '100%',
  },
  /** Feed / default — controlled geometry inside screen margins. */
  inset: {
    aspectRatio: 5 / 4,
    borderRadius: radius.lg,
  },
  /** Detail-style full bleed — still aspect-capped, never intrinsic image height. */
  edge: {
    aspectRatio: 4 / 5,
    borderRadius: 0,
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,11,0.18)',
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
  caption: { ...typeScale.meta, color: ink.primary },
});
