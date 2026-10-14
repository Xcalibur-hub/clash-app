/** Always-visible, single-purpose door to Arena Live.
 * Live counts use only confirmed live topics; never fabricate watchers or rooms.
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
    <Pressable accessibilityRole="button" accessibilityLabel="Open Arena Live"
      onPress={() => { tap(); onOpen(); }}
      style={({ pressed }) => [styles.card, {
        backgroundColor: t.surfaceElevated, borderColor: t.border,
        opacity: pressed ? 0.78 : 1,
      }]}>
      <View style={styles.top}>
        <View style={[styles.dot, { backgroundColor: liveCount > 0 ? '#D75C4D' : t.textMuted }]} />
        <Text style={[styles.kicker, { color: t.textSecondary }]}>ARENA LIVE</Text>
        <Text style={[styles.count, { color: t.textMuted }]}>
          {liveCount > 0 ? `${liveCount} live` : 'No active rooms'}
        </Text>
      </View>
      <Text style={[styles.heading, { color: t.textPrimary }]}>Watch a Clash <Text>↗</Text></Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>
        {liveCount > 0
          ? 'Step into the live stage: two fighters, real-time arguments, and the crowd.'
          : 'The stage opens here when a debate goes live. Explore upcoming matches and challenges.'}
      </Text>
      <Text style={[styles.action, { color: t.textPrimary }]}>OPEN LIVE STAGE  →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: layout.screenX, borderWidth: 1, borderRadius: 20, padding: space.md, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { height: 7, width: 7, borderRadius: 4 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  count: { marginLeft: 'auto', fontSize: 11, fontWeight: '700' },
  heading: { fontSize: 23, fontWeight: '800', letterSpacing: -0.7 },
  body: { fontSize: 13, lineHeight: 19 },
  action: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5, paddingTop: 4 },
});
