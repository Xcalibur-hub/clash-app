/**
 * "Surprise me" — focuses a country the viewer has not opened yet.
 * It spins the existing globe; it never invents engagement or content.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { SparklesIcon } from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';

export interface WorldSurpriseCardProps {
  onPress: () => void;
}

export function WorldSurpriseCard({ onPress }: WorldSurpriseCardProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
      accessibilityRole="button"
      accessibilityLabel="Surprise me, focus a country you have not opened yet"
    >
      <View style={[styles.iconWrap, { backgroundColor: t.surfaceMuted }]}>
        <SparklesIcon size={16} color={t.accent} strokeWidth={2.2} />
      </View>
      <View style={styles.copy}>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          Surprise me
        </Text>
        <Text allowFontScaling={false} style={[styles.body, { color: t.textMuted }]}>
          Spin to a country you have not opened yet.
        </Text>
      </View>
      <Text allowFontScaling={false} style={[styles.cta, { color: t.accent }]}>
        Shuffle
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 1 },
  title: { ...typeScale.label, fontSize: 14, fontWeight: '700' },
  body: { ...typeScale.caption, fontSize: 11 },
  cta: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
});
