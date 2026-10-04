import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import type { VaultCreatorWorldCard } from '../../services/vaultHomeService';
import {
  creatorIdentityLine,
  editorialTitleLines,
  vaultTintWash,
  worldHappeningLine,
  type WorldTileLayout,
} from '../../utils/vaultPresentation';
import { duration, space, typeScale, useThemeColors } from '../../theme';
import { PressableScale } from '../shared/PressableScale';
import { tap as hapticTap } from '../../utils/haptics';

export interface EditorialWorldTileProps {
  creator: VaultCreatorWorldCard;
  layout: Exclude<WorldTileLayout, 'featured'>;
  onEnter: () => void;
}

/** World-stack tile — wide cinematic or offset portrait, not a generic card. */
export const EditorialWorldTile = React.memo(function EditorialWorldTile({
  creator,
  layout,
  onEnter,
}: EditorialWorldTileProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const portrait = layout === 'portrait';
  const lines = editorialTitleLines(creator.latestCaption ?? creator.name, 2);
  const identity = creatorIdentityLine(creator.bio);
  const happening = worldHappeningLine(creator);
  const wash = vaultTintWash(creator.tint, 0.16);

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInUp.duration(duration.slow).delay(40)}
      style={[styles.shell, portrait && styles.shellPortrait]}
    >
      <PressableScale
        onPress={() => {
          hapticTap();
          onEnter();
        }}
        style={[styles.tile, portrait ? styles.portrait : styles.wide]}
        accessibilityLabel={`Enter ${creator.name}'s world`}
      >
        <View
          style={[
            styles.media,
            portrait ? styles.mediaPortrait : styles.mediaWide,
            { backgroundColor: t.surfaceMuted },
          ]}
        >
          {creator.mediaUrl ? (
            <Image source={{ uri: creator.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : null}
          <View style={[styles.tint, { backgroundColor: wash }]} />
          <View style={styles.scrim} />
          <View style={[styles.copy, portrait && styles.copyPortrait]}>
            <Text allowFontScaling={false} style={styles.name}>
              {creator.name.toUpperCase()}
            </Text>
            {lines.map((line) => (
              <Text key={line} allowFontScaling={false} style={styles.titleLine} numberOfLines={1}>
                {line}
              </Text>
            ))}
            <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
              {happening ?? identity}
            </Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  shell: { width: '100%' },
  shellPortrait: { paddingLeft: '18%' },
  tile: { overflow: 'hidden', borderRadius: 4 },
  wide: { width: '100%' },
  portrait: { width: '82%' },
  media: { width: '100%', justifyContent: 'flex-end' },
  mediaWide: { aspectRatio: 16 / 9 },
  mediaPortrait: { aspectRatio: 3 / 4 },
  tint: { ...StyleSheet.absoluteFillObject },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.32)',
  },
  copy: {
    gap: 2,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    paddingTop: space.xxl,
  },
  copyPortrait: { paddingHorizontal: space.md },
  name: {
    ...typeScale.caption,
    color: 'rgba(250,250,248,0.75)',
    letterSpacing: 1.2,
  },
  titleLine: {
    fontFamily: typeScale.title.fontFamily,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: '#FAFAF8',
  },
  meta: {
    ...typeScale.meta,
    color: 'rgba(250,250,248,0.8)',
    marginTop: 4,
  },
});
