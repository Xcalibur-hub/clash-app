import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { editorialTitleLines } from '../../utils/vaultPresentation';
import { vaultOfferPriceLabel, type VaultOfferAccess } from '../../utils/vaultMoney';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { PressableScale } from '../shared/PressableScale';
import { tap as hapticTap } from '../../utils/haptics';

export interface CourseMasterclassCardProps {
  title: string;
  lessonCount?: number | null;
  coverUrl?: string | null;
  accessType: VaultOfferAccess;
  priceAmountMinor: number | null;
  currency: string | null;
  creatorName?: string | null;
  onOpen: () => void;
}

/** Masterclass presentation — not a Udemy tile. */
export const CourseMasterclassCard = React.memo(function CourseMasterclassCard({
  title,
  lessonCount,
  coverUrl,
  accessType,
  priceAmountMinor,
  currency,
  creatorName,
  onOpen,
}: CourseMasterclassCardProps): React.JSX.Element {
  const t = useThemeColors();
  const lines = editorialTitleLines(title, 2);
  const price = vaultOfferPriceLabel({ accessType, priceAmountMinor, currency });
  const lessons =
    lessonCount != null && lessonCount > 0
      ? `${lessonCount} LESSON${lessonCount === 1 ? '' : 'S'}`
      : null;

  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      style={[styles.wrap, { marginHorizontal: -layout.screenX }]}
      accessibilityLabel={`Course: ${title}`}
    >
      <View style={[styles.media, { backgroundColor: t.surfaceMuted }]}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        <View style={styles.scrim} />
        <View style={styles.copy}>
          {creatorName ? (
            <Text allowFontScaling={false} style={styles.kicker}>
              LEARN WITH {creatorName.toUpperCase()}
            </Text>
          ) : (
            <Text allowFontScaling={false} style={styles.kicker}>
              MASTERCLASS
            </Text>
          )}
          {lines.map((line) => (
            <Text key={line} allowFontScaling={false} style={styles.title}>
              {line}
            </Text>
          ))}
          <View style={styles.metaRow}>
            {lessons ? (
              <Text allowFontScaling={false} style={styles.meta}>
                {lessons}
              </Text>
            ) : null}
            <Text allowFontScaling={false} style={styles.meta}>
              {price}
            </Text>
          </View>
          <Text allowFontScaling={false} style={styles.cta}>
            Continue →
          </Text>
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  media: {
    aspectRatio: 4 / 5,
    width: '100%',
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.4)',
  },
  copy: {
    gap: 4,
    paddingHorizontal: layout.screenX + 4,
    paddingBottom: space.xxl,
    paddingTop: space.xxxl,
  },
  kicker: {
    ...typeScale.caption,
    color: 'rgba(250,250,248,0.72)',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontFamily: typeScale.display.fontFamily,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -1.2,
    color: '#FAFAF8',
  },
  metaRow: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  meta: {
    ...typeScale.caption,
    color: 'rgba(250,250,248,0.78)',
    letterSpacing: 0.8,
  },
  cta: {
    ...typeScale.label,
    color: '#FAFAF8',
    marginTop: space.md,
    fontWeight: '600',
  },
});
