import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { TakeMedia as TakeMediaModel } from '../../store';
import { ink, space, typeScale } from '../../theme';
import { PlayIcon } from '../shared/icons';

/**
 * Media plate. A real image upload renders its URL; videos (and seed rows without
 * a URL) fall back to the gradient plate — video playback is deferred until a
 * player is wired in, so the play affordance stays honest about what it is.
 */
export function TakeMedia({
  media,
  edge = false,
}: {
  media: TakeMediaModel;
  /** Edge-to-edge feed treatment — square-ish crop, no radius. */
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
  },
  inset: {
    aspectRatio: 16 / 9,
    borderRadius: 14,
  },
  edge: {
    aspectRatio: 4 / 5,
    borderRadius: 0,
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,11,0.22)',
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
