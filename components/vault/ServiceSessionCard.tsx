import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { editorialTitleLines } from '../../utils/vaultPresentation';
import { vaultOfferPriceLabel, type VaultOfferAccess } from '../../utils/vaultMoney';
import { space, typeScale, useThemeColors } from '../../theme';
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

/** Personal session invite — not a Fiverr listing. */
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
  const lines = editorialTitleLines(title, 2);
  const price = vaultOfferPriceLabel({ accessType, priceAmountMinor, currency });

  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      style={styles.wrap}
      accessibilityLabel={`Service: ${title}`}
    >
      <View style={styles.row}>
        <View style={[styles.thumb, { backgroundColor: t.surfaceMuted }]}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : null}
        </View>
        <View style={styles.copy}>
          <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
            {creatorName ? `WORK WITH ${creatorName.toUpperCase()}` : 'SESSION'}
          </Text>
          {lines.map((line) => (
            <Text key={line} allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              {line}
            </Text>
          ))}
          {subtitle ? (
            <Text allowFontScaling={false} style={[styles.sub, { color: t.textSecondary }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
            {price}
          </Text>
          <Text allowFontScaling={false} style={[styles.cta, { color: t.textPrimary }]}>
            Request a session →
          </Text>
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingVertical: space.sm },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'stretch' },
  thumb: {
    width: 96,
    minHeight: 128,
    borderRadius: 2,
    overflow: 'hidden',
  },
  copy: { flex: 1, gap: 3, justifyContent: 'center' },
  kicker: { ...typeScale.caption, letterSpacing: 1 },
  title: {
    fontFamily: typeScale.title.fontFamily,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  sub: { ...typeScale.meta, marginTop: 2 },
  meta: { ...typeScale.caption, letterSpacing: 0.4, marginTop: 4 },
  cta: { ...typeScale.label, fontWeight: '600', marginTop: space.sm },
});
