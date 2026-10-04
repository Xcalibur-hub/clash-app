/**
 * Explore-aligned Vault media tile — radius.xxl, gradient scrim, compact type.
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
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export type VaultTileSpan = 'hero' | 'half' | 'wide' | 'portrait' | 'square';

export interface VaultMediaTileProps {
  kind: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  mediaUrl?: string | null;
  accent?: string | null;
  span?: VaultTileSpan;
  fill?: boolean;
  height?: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

const SPAN_HEIGHT: Record<VaultTileSpan, number> = {
  hero: 248,
  half: 118,
  wide: 156,
  portrait: 196,
  square: 168,
};

export const VaultMediaTile = React.memo(function VaultMediaTile({
  kind,
  title,
  subtitle = null,
  meta = null,
  mediaUrl = null,
  accent = null,
  span = 'square',
  fill = false,
  height: heightOverride,
  onPress,
  style,
}: VaultMediaTileProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const height = heightOverride ?? SPAN_HEIGHT[span];
  const fallback = accent ?? (t.scheme === 'light' ? '#2C3340' : '#1A1A20');
  const widthStyle = fill
    ? styles.fill
    : span === 'hero' || span === 'wide'
      ? styles.full
      : span === 'half' || span === 'portrait'
        ? styles.half
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
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.78)']} style={styles.scrim} />
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
          {meta ? (
            <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  full: { width: '100%' },
  fill: { flex: 1, minWidth: 0 },
  half: { width: '48.5%' },
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
    height: '68%',
  },
  copy: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    paddingTop: space.sm,
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
  meta: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.62)',
  },
});
