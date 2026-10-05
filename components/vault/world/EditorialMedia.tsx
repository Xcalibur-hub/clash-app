import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { duration, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { PressableScale } from '../../shared/PressableScale';

export type EditorialMediaShape = 'rect' | 'circle' | 'film';

export interface EditorialMediaProps {
  mediaUrl?: string | null;
  accent?: string | null;
  height: number;
  width?: number | `${number}%`;
  /** Editorial corners — default is deliberately sharper than Explore cards. */
  radius?: number;
  hairline?: boolean;
  /** Soft paper matte around a print (contact sheets). */
  paper?: boolean;
  /** Crop / frame language. */
  shape?: EditorialMediaShape;
  /** Faint grain or blueprint grid over media. */
  texture?: 'grain' | 'grid' | null;
  /** Small index stamp, e.g. "01". */
  badge?: string | null;
  kicker?: string | null;
  title?: string | null;
  meta?: string | null;
  /** Free-form overlay content (quote, chips, CTA). */
  overlay?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Primary media plane — photography first. Containers are optional, not default.
 */
export const EditorialMedia = React.memo(function EditorialMedia({
  mediaUrl,
  accent,
  height,
  width = '100%',
  radius = 10,
  hairline = false,
  paper = false,
  shape = 'rect',
  texture = null,
  badge,
  kicker,
  title,
  meta,
  overlay,
  onPress,
  style,
}: EditorialMediaProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const fallback = accent || (t.scheme === 'light' ? '#2C3340' : '#141418');
  const hasCopy = Boolean(kicker || title || meta);
  const circle = shape === 'circle';
  const film = shape === 'film';
  const outerRadius = circle ? height / 2 : radius;

  const body = (
    <View
      style={[
        styles.tile,
        paper && styles.paper,
        {
          height: paper ? height + 18 : height,
          borderRadius: paper ? Math.max(outerRadius, 4) : outerRadius,
          backgroundColor: paper
            ? t.scheme === 'light'
              ? '#F7F4EE'
              : '#1A1A1E'
            : fallback,
          borderWidth: hairline || paper ? StyleSheet.hairlineWidth : 0,
          borderColor:
            hairline || paper
              ? t.scheme === 'light'
                ? 'rgba(0,0,0,0.08)'
                : 'rgba(255,255,255,0.1)'
              : 'transparent',
          padding: paper ? 8 : 0,
        },
      ]}
    >
      <View
        style={[
          styles.media,
          {
            borderRadius: circle ? 999 : film ? 2 : Math.max(0, outerRadius - (paper ? 4 : 0)),
            backgroundColor: fallback,
            overflow: 'hidden',
            flex: paper ? 1 : undefined,
            height: paper ? undefined : '100%',
          },
        ]}
      >
        {mediaUrl ? (
          <Image source={{ uri: mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[fallback, t.scheme === 'light' ? '#D8D2C8' : '#101014']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {texture === 'grid' ? <View style={styles.grid} pointerEvents="none" /> : null}
        {texture === 'grain' ? <View style={styles.grain} pointerEvents="none" /> : null}
        {film ? (
          <>
            <View style={[styles.sprocketCol, styles.sprocketLeft]} pointerEvents="none">
              {Array.from({ length: 7 }).map((_, i) => (
                <View key={`l-${i}`} style={styles.sprocket} />
              ))}
            </View>
            <View style={[styles.sprocketCol, styles.sprocketRight]} pointerEvents="none">
              {Array.from({ length: 7 }).map((_, i) => (
                <View key={`r-${i}`} style={styles.sprocket} />
              ))}
            </View>
          </>
        ) : null}
        {hasCopy ? (
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.78)']} style={styles.scrim} />
        ) : null}
        {badge ? (
          <View style={styles.badge}>
            <Text allowFontScaling={false} style={styles.badgeText}>
              {badge}
            </Text>
          </View>
        ) : null}
        {hasCopy ? (
          <View style={styles.copy}>
            {kicker ? (
              <Text allowFontScaling={false} style={styles.kicker} numberOfLines={1}>
                {kicker}
              </Text>
            ) : null}
            {title ? (
              <Text allowFontScaling={false} style={styles.title} numberOfLines={2}>
                {title}
              </Text>
            ) : null}
            {meta ? (
              <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
        ) : null}
        {overlay}
      </View>
    </View>
  );

  const sized = Array.isArray(style) ? style : [style];
  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(duration.base)}
      style={[{ width: circle && typeof width === 'number' ? height : width }, ...sized]}
    >
      {onPress ? (
        <PressableScale
          onPress={() => {
            hapticTap();
            onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={`${kicker ?? ''} ${title ?? ''}`.trim()}
        >
          {body}
        </PressableScale>
      ) : (
        body
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  tile: { justifyContent: 'flex-end' },
  paper: {},
  media: { width: '100%', justifyContent: 'flex-end' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '72%' },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  badgeText: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: '#FAFAF8',
  },
  copy: { padding: space.md, gap: 3 },
  kicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.8)',
  },
  title: {
    ...typeScale.label,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: '#FAFAF8',
  },
  meta: { ...typeScale.meta, fontSize: 12, color: 'rgba(255,255,255,0.72)' },
  grain: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.04)',
    opacity: 0.35,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    opacity: 0.55,
  },
  sprocketCol: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    width: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sprocketLeft: { left: 4 },
  sprocketRight: { right: 4 },
  sprocket: {
    width: 7,
    height: 10,
    borderRadius: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
