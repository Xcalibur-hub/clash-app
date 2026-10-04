import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { vaultOfferPriceLabel, type VaultOfferAccess } from '../../utils/vaultMoney';
import { duration, radius, space, typeScale, useThemeColors } from '../../theme';
import { PressableScale } from '../shared/PressableScale';
import { tap as hapticTap } from '../../utils/haptics';

export interface ServiceSessionCardProps {
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  accessType: VaultOfferAccess;
  priceAmountMinor: number | null;
  currency: string | null;
  creatorName?: string | null;
  onOpen: () => void;
}

/**
 * Creator-led session invite — immersive media plane, not a marketplace listing.
 */
export const ServiceSessionCard = React.memo(function ServiceSessionCard({
  title,
  subtitle,
  coverUrl,
  accessType,
  priceAmountMinor,
  currency,
  creatorName,
  onOpen,
}: ServiceSessionCardProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const price = vaultOfferPriceLabel({ accessType, priceAmountMinor, currency });
  const fallback = t.scheme === 'light' ? '#2C3340' : '#141418';
  const metaLine = [subtitle?.trim() || null, price].filter(Boolean).join(' · ');

  return (
    <Animated.View entering={reduced ? undefined : FadeInUp.duration(duration.base)}>
      <PressableScale
        onPress={() => {
          hapticTap();
          onOpen();
        }}
        style={[
          styles.wrap,
          {
            backgroundColor: fallback,
            borderColor: t.scheme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)',
          },
        ]}
        accessibilityLabel={`Session: ${title}`}
      >
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[fallback, t.scheme === 'light' ? '#3A322C' : '#0E0E12']}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.82)']} style={styles.scrim} />

        <View style={styles.copy}>
          <Text allowFontScaling={false} style={styles.kind}>
            {creatorName ? `SESSION · ${creatorName.toUpperCase()}` : 'SESSION'}
          </Text>
          <Text allowFontScaling={false} style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {metaLine ? (
            <Text allowFontScaling={false} style={styles.meta} numberOfLines={2}>
              {metaLine}
            </Text>
          ) : null}
          <View style={styles.ctaPill}>
            <Text allowFontScaling={false} style={styles.cta}>
              REQUEST →
            </Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    height: 240,
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
  title: {
    ...typeScale.label,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: '#FAFAF8',
  },
  meta: {
    ...typeScale.meta,
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
    maxWidth: 300,
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
