import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../theme';
import { vaultOfferPriceLabel, type VaultOfferAccess } from '../../utils/vaultMoney';
import { PressableScale } from '../shared/PressableScale';
import { tap as hapticTap } from '../../utils/haptics';

export interface OfferCardProps {
  kind: 'SERVICE' | 'COURSE' | 'PRODUCT';
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  accessType: VaultOfferAccess;
  priceAmountMinor: number | null;
  currency: string | null;
  externalUrl?: string | null;
  onOpen: () => void;
}

/** Editorial commerce card — not a marketplace tile. */
export const OfferCard = React.memo(function OfferCard({
  kind,
  title,
  subtitle,
  coverUrl,
  accessType,
  priceAmountMinor,
  currency,
  externalUrl,
  onOpen,
}: OfferCardProps): React.JSX.Element {
  const t = useThemeColors();
  const price = vaultOfferPriceLabel({
    accessType,
    priceAmountMinor,
    currency,
    externalUrl,
  });
  const kicker = kind === 'COURSE' ? 'COURSE' : kind === 'SERVICE' ? 'SERVICE' : 'PRODUCT';

  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      style={[
        styles.card,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          shadowColor: t.shadowColor,
          shadowOpacity: t.scheme === 'light' ? 0.08 : 0,
        },
      ]}
      accessibilityLabel={`${kicker}: ${title}`}
    >
      <View style={[styles.cover, { backgroundColor: t.surfaceMuted }]}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        <View style={styles.scrim} />
        <Text allowFontScaling={false} style={styles.kicker}>
          {kicker}
        </Text>
        <Text allowFontScaling={false} style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      </View>
      <View style={styles.body}>
        {subtitle ? (
          <Text allowFontScaling={false} style={[styles.sub, { color: t.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        <Text allowFontScaling={false} style={[styles.price, { color: t.textMuted }]}>
          {price}
        </Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cover: {
    aspectRatio: 16 / 10,
    justifyContent: 'flex-end',
    padding: space.lg,
    gap: 4,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.28)',
  },
  kicker: {
    ...typeScale.caption,
    color: 'rgba(250,250,248,0.8)',
    letterSpacing: 0.8,
    zIndex: 1,
  },
  title: {
    ...typeScale.title,
    color: '#FAFAF8',
    zIndex: 1,
  },
  body: {
    gap: 4,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  sub: { ...typeScale.meta },
  price: { ...typeScale.caption, letterSpacing: 0.4 },
});
