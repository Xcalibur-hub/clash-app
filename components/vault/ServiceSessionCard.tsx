import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { vaultOfferPriceLabel, type VaultOfferAccess } from '../../utils/vaultMoney';
import { radius, space, typeScale, useThemeColors } from '../../theme';
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

/** Personal session invite — portrait + copy, Explore density. */
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
  const price = vaultOfferPriceLabel({ accessType, priceAmountMinor, currency });
  const fallback = t.scheme === 'light' ? '#2C3340' : '#1A1A20';

  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      style={[
        styles.wrap,
        {
          borderColor: t.scheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
          backgroundColor: t.surface,
        },
      ]}
      accessibilityLabel={`Service: ${title}`}
    >
      <View style={[styles.thumb, { backgroundColor: fallback }]}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={[fallback, '#121216']} style={StyleSheet.absoluteFill} />
        )}
      </View>
      <View style={styles.copy}>
        <Text allowFontScaling={false} style={[styles.kind, { color: t.textMuted }]}>
          {creatorName ? `SESSION · ${creatorName.toUpperCase()}` : 'SESSION'}
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text allowFontScaling={false} style={[styles.sub, { color: t.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {price}
        </Text>
        <Text allowFontScaling={false} style={[styles.cta, { color: t.textPrimary }]}>
          Request session →
        </Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: space.md,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: space.sm,
  },
  thumb: {
    width: 108,
    minHeight: 132,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  copy: { flex: 1, gap: 3, justifyContent: 'center', paddingVertical: 4 },
  kind: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  title: {
    ...typeScale.label,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  sub: { ...typeScale.meta, fontSize: 13 },
  meta: { ...typeScale.caption, fontWeight: '600', marginTop: 2 },
  cta: { ...typeScale.label, fontWeight: '700', marginTop: space.xs },
});
