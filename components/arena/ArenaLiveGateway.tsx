/** Always-visible, single-purpose door to Arena Live.
 * Counts represent confirmed topic rooms only; canonical duels are discovered on Live.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { layout, space, useThemeColors } from '../../theme';
import { tap } from '../../utils/haptics';

export function ArenaLiveGateway({
  liveCount,
  onOpen,
}: {
  liveCount: number;
  onOpen: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Explore live clashes and debates"
      onPress={() => { tap(); onOpen(); }}
      style={({ pressed }) => [styles.card, {
        backgroundColor: t.surfaceElevated, borderColor: t.border,
        opacity: pressed ? 0.78 : 1,
      }]}>
      <View style={styles.top}>
        <View style={[styles.dot, { backgroundColor: liveCount > 0 ? '#D75C4D' : t.textMuted }]} />
        <Text style={[styles.kicker, { color: t.textSecondary }]}>ARENA LIVE</Text>
        <Text style={[styles.count, { color: t.textMuted }]}>
          {liveCount > 0 ? `${liveCount} topic ${liveCount === 1 ? 'room' : 'rooms'} live` : 'Explore live Clashes'}
        </Text>
      </View>
      <View style={styles.headlineRow}>
        <Text style={[styles.heading, { color: t.textPrimary }]}>The arena is open.</Text>
        <Text style={[styles.headingArrow, { color: t.textPrimary }]}>↗</Text>
      </View>
      <Text style={[styles.body, { color: t.textSecondary }]}>
        {liveCount > 0
          ? 'Two fighters. One debate. Pick a side and follow every argument.'
          : 'Discover live debates, find your side, and join the conversation.'}
      </Text>
      <Text style={[styles.action, { color: t.textPrimary }]}>EXPLORE LIVE CLASHES  →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: layout.screenX, borderWidth: 1, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 20, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { height: 7, width: 7, borderRadius: 4 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  count: { marginLeft: 'auto', fontSize: 11, fontWeight: '700' },
  headlineRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  heading: { flex: 1, fontSize: 27, lineHeight: 32, fontWeight: '800', letterSpacing: -1 },
  headingArrow: { fontSize: 24, fontWeight: '500' },
  body: { fontSize: 14, lineHeight: 21 },
  action: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, paddingTop: 6 },
});
