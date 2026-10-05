import React from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import type { VaultCreatorWorldCard } from '../../services/vaultHomeService';
import { creatorIdentityLine, worldHappeningLine } from '../../utils/vaultPresentation';
import {
  personalityHasTexture,
  personalityMediaShape,
  personalityRadius,
  worldPersonality,
} from '../../utils/vaultWorldPersonality';
import { duration, layout, space, typeScale, useThemeColors } from '../../theme';
import { PressableScale } from '../shared/PressableScale';
import { tap as hapticTap } from '../../utils/haptics';
import { EditorialMedia } from './world/EditorialMedia';

export interface FeaturedWorldProps {
  creator: VaultCreatorWorldCard;
  onEnter: () => void;
}

/** Featured world — magazine opener, not a rounded feed card. */
export const FeaturedWorld = React.memo(function FeaturedWorld({
  creator,
  onEnter,
}: FeaturedWorldProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const height = Math.round(Math.min(width * 1.12, 460));
  const personality = worldPersonality({
    creatorId: creator.creatorId,
    handle: creator.handle,
    name: creator.name,
  });
  const identity = creatorIdentityLine(creator.bio, 'Creator');
  const happening = worldHappeningLine(creator);
  const fallback = creator.tint || (t.scheme === 'light' ? '#2C3340' : '#1A1A20');
  const texture = personalityHasTexture(personality)
    ? personality === 'blueprint'
      ? 'grid'
      : 'grain'
    : null;
  const shape = personalityMediaShape(personality);

  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.slow)} style={styles.wrap}>
      <PressableScale
        onPress={() => {
          hapticTap();
          onEnter();
        }}
        style={[styles.bleed, { height, backgroundColor: fallback }]}
        accessibilityLabel={`Enter ${creator.name}'s world`}
      >
        {creator.mediaUrl ? (
          <Image source={{ uri: creator.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[fallback, t.scheme === 'light' ? '#D8D2C8' : '#121216']}
            style={StyleSheet.absoluteFill}
          />
        )}
        {texture === 'grain' ? <View style={styles.grain} pointerEvents="none" /> : null}
        {texture === 'grid' ? <View style={styles.grid} pointerEvents="none" /> : null}
        <LinearGradient colors={['rgba(0,0,0,0.18)', 'transparent', 'rgba(0,0,0,0.88)']} style={StyleSheet.absoluteFill} />

        <View style={styles.copy}>
          <Text allowFontScaling={false} style={styles.kind}>
            FEATURED WORLD
          </Text>
          <Text allowFontScaling={false} style={styles.name} numberOfLines={1}>
            {creator.name}
          </Text>
          {happening ? (
            <Text allowFontScaling={false} style={styles.happening} numberOfLines={2}>
              {happening}
            </Text>
          ) : null}
          <Text allowFontScaling={false} style={styles.identity} numberOfLines={1}>
            {identity}
          </Text>
          <Text allowFontScaling={false} style={styles.enter}>
            ENTER →
          </Text>
        </View>
      </PressableScale>

      {creator.mediaUrl ? (
        <Animated.View
          entering={reduced ? undefined : FadeInUp.delay(80).duration(duration.base)}
          style={styles.floatPoster}
        >
          <EditorialMedia
            mediaUrl={creator.mediaUrl}
            accent={creator.tint}
            height={shape === 'circle' ? 120 : 138}
            width={shape === 'circle' ? 120 : 104}
            radius={personalityRadius(personality)}
            shape={shape === 'circle' ? 'circle' : shape === 'film' ? 'film' : 'rect'}
            paper={personality === 'contact'}
            texture={texture}
            badge="01"
            onPress={onEnter}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md },
  bleed: {
    width: 'auto',
    marginHorizontal: -layout.screenX,
    overflow: 'hidden',
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  grain: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.04)', opacity: 0.4 },
  grid: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    opacity: 0.5,
  },
  copy: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: space.lg,
    paddingBottom: space.xl + 28,
    gap: 4,
  },
  kind: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.78)',
  },
  name: {
    ...typeScale.display,
    fontSize: 40,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: -1.3,
    color: '#FAFAF8',
  },
  happening: {
    ...typeScale.label,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: 'rgba(250,250,248,0.92)',
    marginTop: 2,
  },
  identity: {
    ...typeScale.meta,
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
  },
  enter: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#FAFAF8',
    marginTop: space.sm,
  },
  floatPoster: {
    position: 'absolute',
    right: layout.screenX * 0.2,
    bottom: -18,
    zIndex: 3,
    transform: [{ rotate: '3deg' }],
  },
});
