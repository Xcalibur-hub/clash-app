/** Compact entry to Live. Home content remains the primary surface. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { layout, useThemeColors } from '../../theme';
import { tap } from '../../utils/haptics';

export function ArenaLiveGateway({ liveCount, onOpen }: {
  /** Count of returned live topics, not a total viewer or Room count. */
  liveCount: number | null;
  onOpen: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Explore live Clashes and debates"
      onPress={() => { tap(); onOpen(); }}
      style={({ pressed }) => [styles.card, {
        backgroundColor: t.surface, borderColor: t.border,
        opacity: pressed ? 0.76 : 1,
      }]}
    >
      <View style={[styles.dot, { backgroundColor: liveCount !== null && liveCount > 0 ? '#D75C4D' : t.textMuted }]} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: t.textPrimary }]}>
          {liveCount !== null && liveCount > 0 ? 'Conversations are happening' : 'Find your next debate'}
        </Text>
        <Text style={[styles.sub, { color: t.textSecondary }]} numberOfLines={1}>
          {liveCount !== null && liveCount > 0
            ? `${liveCount} live ${liveCount === 1 ? 'discussion' : 'discussions'} to explore`
            : 'Two perspectives. Find a duel to watch.'}
        </Text>
      </View>
      <Text style={[styles.arrow, { color: t.textPrimary }]}>↗</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: layout.screenX, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  arrow: { fontSize: 23, fontWeight: '500' },
});
