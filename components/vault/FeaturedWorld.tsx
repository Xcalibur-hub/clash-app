import React from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import type { VaultCreatorWorldCard } from '../../services/vaultHomeService';
import {
  creatorIdentityLine,
  worldHappeningLine,
} from '../../utils/vaultPresentation';
import { duration, radius, space, typeScale, useThemeColors } from '../../theme';
import { PressableScale } from '../shared/PressableScale';
import { tap as hapticTap } from '../../utils/haptics';

export interface FeaturedWorldProps {
  creator: VaultCreatorWorldCard;
  onEnter: () => void;
}

/** Featured Creator World — Explore hero language: rounded media, gradient scrim, layered type. */
export const FeaturedWorld = React.memo(function FeaturedWorld({
  creator,
  onEnter,
}: FeaturedWorldProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const height = Math.round(Math.min(width * 1.05, 420));
  const identity = creatorIdentityLine(creator.bio, 'Creator');
  const happening = worldHappeningLine(creator);
  const fallback = creator.tint || (t.scheme === 'light' ? '#2C3340' : '#1A1A20');

  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.slow)}>
      <PressableScale
        onPress={() => {
          hapticTap();
          onEnter();
        }}
        style={[
          styles.wrap,
          {
            height,
            borderColor: t.scheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
            backgroundColor: fallback,
          },
        ]}
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
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.82)']} style={styles.scrim} />
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
          <View style={styles.ctaPill}>
            <Text allowFontScaling={false} style={styles.cta}>
              ENTER →
            </Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: radius.xxl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '72%',
  },
  copy: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: space.lg,
    gap: 4,
  },
  kind: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.78)',
  },
  name: {
    ...typeScale.display,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -1.1,
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
  ctaPill: {
    alignSelf: 'flex-start',
    marginTop: space.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  cta: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: '#FAFAF8',
  },
});
