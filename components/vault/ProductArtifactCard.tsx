import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { editorialTitleLines } from '../../utils/vaultPresentation';
import { vaultOfferPriceLabel, type VaultOfferAccess } from '../../utils/vaultMoney';
import { space, typeScale, useThemeColors } from '../../theme';
import { PressableScale } from '../shared/PressableScale';
import { tap as hapticTap } from '../../utils/haptics';

export interface ProductArtifactCardProps {
  title: string;
  coverUrl?: string | null;
  accessType: VaultOfferAccess;
  priceAmountMinor: number | null;
  currency: string | null;
  externalUrl?: string | null;
  creatorName?: string | null;
  onOpen: () => void;
}

/** Creator artifact — not an ecommerce grid tile. */
export const ProductArtifactCard = React.memo(function ProductArtifactCard({
  title,
  coverUrl,
  accessType,
  priceAmountMinor,
  currency,
  externalUrl,
  creatorName,
  onOpen,
}: ProductArtifactCardProps): React.JSX.Element {
  const t = useThemeColors();
  const lines = editorialTitleLines(title, 2);
  const price = vaultOfferPriceLabel({ accessType, priceAmountMinor, currency, externalUrl });

  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      style={styles.wrap}
      accessibilityLabel={`Product: ${title}`}
    >
      <View style={[styles.media, { backgroundColor: t.surfaceMuted }]}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
      </View>
      <View style={styles.copy}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          {creatorName ? `FROM ${creatorName.toUpperCase()}` : 'ARTIFACT'}
        </Text>
        {lines.map((line) => (
          <Text key={line} allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
            {line}
          </Text>
        ))}
        <View style={styles.footer}>
          <Text allowFontScaling={false} style={[styles.price, { color: t.textSecondary }]}>
            {price}
          </Text>
          <Text allowFontScaling={false} style={[styles.cta, { color: t.textPrimary }]}>
            View →
          </Text>
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  media: {
    aspectRatio: 1,
    width: '72%',
    borderRadius: 2,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  copy: { gap: 2 },
  kicker: { ...typeScale.caption, letterSpacing: 1 },
  title: {
    fontFamily: typeScale.display.fontFamily,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
    maxWidth: 280,
  },
  price: { ...typeScale.label },
  cta: { ...typeScale.label, fontWeight: '600' },
});
