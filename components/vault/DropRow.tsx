/** Public vs exclusive drop rows on the Vault home + creator profile. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LockIcon } from '../shared/icons';
import { accent, ink, radius, space, typeScale } from '../../theme';
import type { Drop } from '../../store/types';
import { compact } from '../../utils/format';
import { withAlpha } from '../../utils/color';
import { press as hapticPress } from '../../utils/haptics';

export interface DropRowProps {
  drop: Drop;
  locked: boolean;
  onOpen: () => void;
}

export function DropRow({ drop, locked, onOpen }: DropRowProps): React.JSX.Element {
  const exclusive = drop.tier === 'exclusive';
  return (
    <Pressable
      onPress={() => { hapticPress(); onOpen(); }}
      accessibilityRole="button"
      accessibilityLabel={exclusive && locked ? `Unlock ${drop.title} for ₹${drop.price}` : drop.title}
      style={({ pressed }) => [styles.drop, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <Text allowFontScaling={false} style={styles.title} numberOfLines={2}>{drop.title}</Text>
        <Text allowFontScaling={false} style={styles.blurb} numberOfLines={2}>{drop.blurb}</Text>
        <Text allowFontScaling={false} style={styles.meta}>
          {exclusive ? `${compact(drop.unlocks)} unlocks · ★ ${drop.rating.toFixed(1)}` : 'FREE ACCESS'}
        </Text>
      </View>
      {exclusive ? (
        <View style={[styles.price, locked && { borderColor: withAlpha(accent.gold, 0.5) }]}>
          {locked ? <LockIcon size={13} color={accent.gold} strokeWidth={2.6} /> : null}
          <Text allowFontScaling={false} style={styles.priceText}>{locked ? `₹${drop.price}` : 'OPEN'}</Text>
        </View>
      ) : (
        <View style={styles.open}>
          <Text allowFontScaling={false} style={styles.openText}>READ</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  drop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  pressed: { opacity: 0.72 },
  main: { flex: 1, gap: 4 },
  title: { ...typeScale.bodyStrong, color: ink.primary },
  blurb: { ...typeScale.body, color: ink.tertiary, fontSize: 13 },
  meta: { ...typeScale.data, color: ink.tertiary, fontSize: 11 },
  price: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,200,97,0.12)',
  },
  priceText: { ...typeScale.label, color: accent.gold },
  open: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(67,214,160,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(67,214,160,0.35)',
  },
  openText: { ...typeScale.label, color: accent.mint, fontSize: 12 },
});