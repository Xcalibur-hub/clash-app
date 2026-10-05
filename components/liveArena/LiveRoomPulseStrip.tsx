/**
 * Compact Room Pulse story strip — "what is happening in this battle".
 * Real pulse leaders only; categories omitted when empty.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ArenaPulseLeader, ArenaRoomPulse } from '../../services/liveArenaService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface LiveRoomPulseStripProps {
  pulse: ArenaRoomPulse | null;
  onOpen: () => void;
}

const STORY: Record<string, string> = {
  FAST_RISING: '🔥 FAST RISING',
  TOP_ARGUMENT: '⚔ TOP ARGUMENT',
  BEST_EVIDENCE: '🧾 BEST EVIDENCE',
  BEST_REBUTTAL: '↩ BEST REBUTTAL',
  CROWD_FAVORITE: '★ CROWD FAVORITE',
};

function storyLabel(leader: ArenaPulseLeader): string {
  return STORY[leader.category] ?? leader.label.toUpperCase();
}

export function LiveRoomPulseStrip({
  pulse,
  onOpen,
}: LiveRoomPulseStripProps): React.JSX.Element | null {
  const t = useThemeColors();
  const leaders = pulse?.leaders ?? [];
  if (leaders.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          hapticTap();
          onOpen();
        }}
        accessibilityRole="button"
        accessibilityLabel="Open Room Pulse"
        style={styles.head}
      >
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          ROOM PULSE
        </Text>
        <Text allowFontScaling={false} style={[styles.more, { color: t.textSecondary }]}>
          See all →
        </Text>
      </Pressable>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {leaders.slice(0, 4).map((leader) => (
          <Pressable
            key={leader.category}
            onPress={() => {
              hapticTap();
              onOpen();
            }}
            style={[
              styles.card,
              {
                backgroundColor: t.scheme === 'dark' ? 'rgba(255,255,255,0.05)' : t.surfaceMuted,
                borderColor: t.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${storyLabel(leader)}. ${leader.author?.name ?? 'Someone'}`}
          >
            <Text allowFontScaling={false} style={[styles.cat, { color: t.textMuted }]} numberOfLines={1}>
              {storyLabel(leader)}
            </Text>
            <Text allowFontScaling={false} style={[styles.who, { color: t.textPrimary }]} numberOfLines={1}>
              {leader.author?.name ?? 'Someone'}
            </Text>
            {leader.preview ? (
              <Text allowFontScaling={false} style={[styles.preview, { color: t.textSecondary }]} numberOfLines={2}>
                {leader.preview}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingTop: space.xs, paddingBottom: space.sm },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  more: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  row: { gap: space.sm, paddingHorizontal: space.md },
  card: {
    width: 168,
    minHeight: 92,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.sm,
    gap: 3,
  },
  cat: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  who: { ...typeScale.label, fontSize: 14, fontWeight: '800' },
  preview: { ...typeScale.meta, fontSize: 12, lineHeight: 16 },
});
