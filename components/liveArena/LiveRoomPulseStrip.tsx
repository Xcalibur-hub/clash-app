/**
 * Cinematic "What's happening" — one featured moment + optional secondary.
 * Tap opens full Room Pulse. Not a horizontal analytics dashboard.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaRoomPulse } from '../../services/liveArenaService';
import {
  liveEventToMoment,
  selectFeaturedPulseMoments,
  type BattleMomentModel,
} from '../../utils/battleMoment';
import type { LiveRoomEvent } from '../../utils/liveRoomEvents';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { BattleMoment } from './BattleMoment';

export interface LiveRoomPulseStripProps {
  pulse: ArenaRoomPulse | null;
  /** Brief event that can temporarily take the featured slot. */
  liveEvent?: LiveRoomEvent | null;
  onOpen: () => void;
}

export function LiveRoomPulseStrip({
  pulse,
  liveEvent = null,
  onOpen,
}: LiveRoomPulseStripProps): React.JSX.Element | null {
  const t = useThemeColors();
  const pulseMoments = React.useMemo(
    () => selectFeaturedPulseMoments(pulse?.leaders ?? [], 2),
    [pulse?.leaders],
  );
  const eventMoment = liveEvent ? liveEventToMoment(liveEvent) : null;

  const featured: BattleMomentModel | null = eventMoment ?? pulseMoments[0] ?? null;
  const secondary: BattleMomentModel | null =
    eventMoment && pulseMoments[0]
      ? pulseMoments[0]
      : pulseMoments[1] ?? null;

  if (!featured) return null;

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
          LIVE BATTLE
        </Text>
        <Text allowFontScaling={false} style={[styles.more, { color: t.textSecondary }]}>
          Full pulse →
        </Text>
      </Pressable>

      <View style={styles.stack}>
        <BattleMoment moment={featured} prominence="primary" onPress={onOpen} />
        {secondary ? (
          <BattleMoment moment={secondary} prominence="secondary" onPress={onOpen} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingTop: space.xs,
    paddingBottom: space.sm,
    paddingHorizontal: layout.screenX,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  more: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  stack: { gap: 6 },
});
