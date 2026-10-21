/** Compact entry to Live. Home content remains the primary surface. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { layout, useThemeColors } from '../../theme';
import { arenaLiveGatewayCopy } from '../../utils/arenaHomePresentation';
import { tap } from '../../utils/haptics';

export function ArenaLiveGateway({ liveCount, onOpen }: {
  /** Count of returned live topics, not a total viewer or Room count. */
  liveCount: number | null;
  onOpen: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const copy = arenaLiveGatewayCopy(liveCount);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        copy.live
          ? `Explore live Clashes. ${copy.subtitle}`
          : 'Explore live Clashes and debates'
      }
      onPress={() => { tap(); onOpen(); }}
      style={({ pressed }) => [styles.card, {
        backgroundColor: t.surface,
        borderColor: copy.live ? (t.scheme === 'dark' ? 'rgba(215,92,77,0.45)' : 'rgba(183,77,70,0.35)') : t.border,
        opacity: pressed ? 0.76 : 1,
      }]}
    >
      <View style={styles.lead}>
        <View style={[styles.dot, { backgroundColor: copy.live ? '#D75C4D' : t.textMuted }]} />
        {copy.live ? (
          <Text allowFontScaling={false} style={[styles.liveChip, { color: '#D75C4D' }]}>
            LIVE
          </Text>
        ) : null}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: t.textPrimary }]}>{copy.title}</Text>
        <Text style={[styles.sub, { color: t.textSecondary }]} numberOfLines={1}>
          {copy.subtitle}
        </Text>
      </View>
      <Text style={[styles.cta, { color: t.textPrimary }]}>{copy.live ? 'Watch' : 'Browse'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: layout.screenX,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  liveChip: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: -0.25 },
  sub: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  cta: { fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },
});
