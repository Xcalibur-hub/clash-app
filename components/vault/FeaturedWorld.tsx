import React from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import type { VaultCreatorWorldCard } from '../../services/vaultHomeService';
import {
  creatorIdentityLine,
  editorialTitleLines,
  vaultTintWash,
  worldHappeningLine,
} from '../../utils/vaultPresentation';
import { duration, layout, space, typeScale, useThemeColors } from '../../theme';
import { PressableScale } from '../shared/PressableScale';
import { tap as hapticTap } from '../../utils/haptics';

export interface FeaturedWorldProps {
  creator: VaultCreatorWorldCard;
  onEnter: () => void;
}

/** Dominant Discover hero — image is the surface, not a bordered card. */
export const FeaturedWorld = React.memo(function FeaturedWorld({
  creator,
  onEnter,
}: FeaturedWorldProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const height = Math.round(Math.min(width * 1.18, width * 0.92 + 120));
  const lines = editorialTitleLines(creator.latestCaption ?? creator.name, 2);
  const identity = creatorIdentityLine(creator.bio, creator.name);
  const happening = worldHappeningLine(creator);
  const wash = vaultTintWash(creator.tint, t.scheme === 'dark' ? 0.22 : 0.12);

  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.reveal)}>
      <PressableScale
        onPress={() => {
          hapticTap();
          onEnter();
        }}
        style={[styles.wrap, { height, marginHorizontal: -layout.screenX }]}
        accessibilityLabel={`Enter ${creator.name}'s world`}
      >
        <View style={[styles.media, { backgroundColor: t.surfaceMuted }]}>
          {creator.mediaUrl ? (
            <Image source={{ uri: creator.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : null}
          <View style={[styles.tint, { backgroundColor: wash }]} />
          <View style={styles.scrim} />
          <View style={styles.copy}>
            <Text allowFontScaling={false} style={styles.name}>
              {creator.name.toUpperCase()}
            </Text>
            <View style={styles.titleBlock}>
              {lines.map((line) => (
                <Text key={line} allowFontScaling={false} style={styles.titleLine}>
                  {line}
                </Text>
              ))}
            </View>
            <Text allowFontScaling={false} style={styles.identity} numberOfLines={1}>
              {identity}
            </Text>
            {happening ? (
              <Text allowFontScaling={false} style={styles.happening} numberOfLines={1}>
                {happening}
              </Text>
            ) : null}
            <Text allowFontScaling={false} style={styles.cta}>
              ENTER WORLD →
            </Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: undefined,
    overflow: 'hidden',
  },
  media: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.38)',
  },
  copy: {
    gap: 6,
    paddingHorizontal: layout.screenX + 4,
    paddingBottom: space.xxl,
    paddingTop: space.xxxl,
  },
  name: {
    ...typeScale.caption,
    color: 'rgba(250,250,248,0.78)',
    letterSpacing: 1.4,
  },
  titleBlock: { gap: 0, marginTop: 2 },
  titleLine: {
    fontFamily: typeScale.display.fontFamily,
    fontSize: 40,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: -1.4,
    color: '#FAFAF8',
  },
  identity: {
    ...typeScale.meta,
    color: 'rgba(250,250,248,0.78)',
    marginTop: 4,
  },
  happening: {
    ...typeScale.body,
    color: 'rgba(250,250,248,0.9)',
    marginTop: 2,
  },
  cta: {
    ...typeScale.caption,
    color: '#FAFAF8',
    letterSpacing: 1.1,
    marginTop: space.md,
    fontWeight: '600',
  },
});
