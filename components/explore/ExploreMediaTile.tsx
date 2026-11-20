/**
 * Media-first Explore tile — edge-to-edge imagery with a restrained type label.
 */
import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from 'react-native-reanimated';
import Animated, { FadeIn } from 'react-native-reanimated';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import type { ExploreMosaicSpan } from '../../utils/exploreMosaic';

export type ExploreTileKind =
  | 'LIVE'
  | 'TAKE'
  | 'CLASH'
  | 'VAULT'
  | 'VAULT PREVIEW'
  | 'CHALLENGE'
  | 'TREASURE'
  | 'CREATOR';

export interface ExploreMediaTileProps {
  kind: ExploreTileKind;
  title: string;
  subtitle?: string | null;
  mediaUrl?: string | null;
  accent?: string | null;
  span?: ExploreMosaicSpan;
  /** Stretch inside a flex row (ignores percentage width). */
  fill?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

const SPAN_HEIGHT: Record<ExploreMosaicSpan, number> = {
  hero: 248,
  half: 118,
  wide: 148,
  portrait: 196,
  square: 152,
};

const FALLBACKS = ['#2A3340', '#3A2E28', '#24362E', '#3A2A38', '#2E3340'];

export function ExploreMediaTile({
  kind,
  title,
  subtitle = null,
  mediaUrl = null,
  accent = null,
  span = 'square',
  fill = false,
  onPress,
  style,
}: ExploreMediaTileProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const height = SPAN_HEIGHT[span];
  const fallback = accent ?? FALLBACKS[Math.abs(title.length) % FALLBACKS.length]!;
  const widthStyle = fill
    ? styles.fill
    : span === 'hero' || span === 'wide'
      ? styles.full
      : span === 'half'
        ? styles.half
        : span === 'portrait'
          ? styles.portrait
          : styles.third;

  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(280)} style={[widthStyle, style]}>
      <Pressable
        onPress={() => {
          hapticTap();
          onPress();
        }}
        style={[
          styles.tile,
          {
            height: fill && (span === 'half' || span === 'hero') ? undefined : height,
            flex: fill && span === 'half' ? 1 : undefined,
            minHeight: fill && span === 'hero' ? 248 : fill && span === 'half' ? 118 : undefined,
            backgroundColor: fallback,
            borderColor: t.scheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${kind}. ${title}${subtitle ? `. ${subtitle}` : ''}`}
      >
        {mediaUrl ? (
          <Image source={{ uri: mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[fallback, t.scheme === 'light' ? '#D8D2C8' : '#121216']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.72)']}
          style={styles.scrim}
        />
        <View style={styles.copy}>
          <Text allowFontScaling={false} style={styles.kind}>
            {kind}
          </Text>
          <Text allowFontScaling={false} style={styles.title} numberOfLines={span === 'hero' ? 3 : 2}>
            {title}
          </Text>
          {subtitle ? (
            <Text allowFontScaling={false} style={styles.sub} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  full: { width: '100%' },
  fill: { flex: 1, minWidth: 0 },
  half: { width: '48.5%' },
  portrait: { width: '48.5%' },
  third: { width: '31.5%' },
  tile: {
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
    height: '58%',
  },
  copy: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: space.sm,
    gap: 2,
  },
  kind: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.78)',
  },
  title: {
    ...typeScale.label,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '800',
    color: '#FAFAF8',
  },
  sub: {
    ...typeScale.meta,
    fontSize: 11,
    color: 'rgba(255,255,255,0.72)',
  },
});
