import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import type { TakeMedia as TakeMediaModel } from '../../store';
import { ink, radius, space, typeScale } from '../../theme';
import { PlayIcon } from '../shared/icons';

/**
 * Mock media plate. Real uploads (camera / picker) land in a later phase; the
 * gradient stands in so the card composition is honest and final.
 */
export function TakeMedia({ media }: { media: TakeMediaModel }): React.JSX.Element {
  const isVideo = media.kind === 'video';
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${media.kind}: ${media.caption}`}
    >
      <LinearGradient
        colors={media.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.veil} pointerEvents="none" />
      {isVideo ? (
        <View style={styles.play}>
          <PlayIcon size={20} color={ink.primary} strokeWidth={2.4} />
        </View>
      ) : null}
      <Text allowFontScaling={false} style={styles.caption}>
        {media.caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    /** 16:9 preview plate with clean border radius. */
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 0,
    justifyContent: 'flex-end',
    padding: space.md,
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,11,0.28)',
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
