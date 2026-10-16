/** Compact entry to Live. Home content remains the primary surface. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { layout, useThemeColors } from '../../theme';
import { tap } from '../../utils/haptics';

export function ArenaLiveGateway({ liveCount, onOpen }: {
  liveCount: number;
  onOpen: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Explore live Clashes and debates"
      onPress={() => { tap(); onOpen(); }}
      style={({ pressed }) => [styles.card, {
        backgroundColor: t.surfaceElevated, borderColor: t.border,
        opacity: pressed ? 0.76 : 1,
      }]}
    >
      <View style={[styles.dot, { backgroundColor: liveCount > 0 ? '#D75C4D' : t.textMuted }]} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: t.textPrimary }]}>
          {liveCount > 0 ? 'Live in the Arena' : 'Watch a Clash'}
        </Text>
        <Text style={[styles.sub, { color: t.textSecondary }]} numberOfLines={1}>
          {liveCount > 0
            ? `${liveCount} ${liveCount === 1 ? 'room' : 'rooms'} happening now`
            : 'Duels, challenges and verdicts'}
        </Text>
      </View>
      <Text style={[styles.arrow, { color: t.textPrimary }]}>↗</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: layout.screenX, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14,
    minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  arrow: { fontSize: 23, fontWeight: '500' },
});
