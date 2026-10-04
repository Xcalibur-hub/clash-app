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
import { space, typeScale, useThemeColors } from '../../../theme';
import { duration } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { PressableScale } from '../../shared/PressableScale';

export interface EditorialMediaProps {
  mediaUrl?: string | null;
  accent?: string | null;
  height: number;
  width?: number | `${number}%`;
  /** Editorial corners — default is deliberately sharper than Explore cards. */
  radius?: number;
  hairline?: boolean;
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
 * The world's primary media block: content supplies colour, the primitive adds
 * only a faint scrim and an optional hairline. Not a rounded card by default.
 */
export const EditorialMedia = React.memo(function EditorialMedia({
  mediaUrl,
  accent,
  height,
  width = '100%',
  radius = 10,
  hairline = false,
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

  const body = (
    <View
      style={[
        styles.tile,
        {
          height,
          borderRadius: radius,
          backgroundColor: fallback,
          borderWidth: hairline ? StyleSheet.hairlineWidth : 0,
          borderColor: hairline
            ? t.scheme === 'light'
              ? 'rgba(0,0,0,0.06)'
              : 'rgba(255,255,255,0.08)'
            : 'transparent',
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
  );

  const sized = Array.isArray(style) ? style : [style];
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.base)} style={[{ width }, ...sized]}>
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
  tile: { overflow: 'hidden', justifyContent: 'flex-end' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '72%' },
  badge: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' },
  badgeText: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 0.9, color: '#FAFAF8' },
  copy: { padding: space.md, gap: 3 },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.8)' },
  title: { ...typeScale.label, fontSize: 19, lineHeight: 23, fontWeight: '800', letterSpacing: -0.4, color: '#FAFAF8' },
  meta: { ...typeScale.meta, fontSize: 12, color: 'rgba(255,255,255,0.72)' },
});
