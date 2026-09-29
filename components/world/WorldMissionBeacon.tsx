import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WorldMission } from '../../services/worldService';
import { card, ink, radius, space, typeScale } from '../../theme';
import { durationLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';

export interface WorldMissionBeaconProps {
  mission: WorldMission;
  now?: number;
  onPress: () => void;
}

/** Compact persistent This Week control — recognizable, not a quest glow. */
export function WorldMissionBeacon({
  mission,
  now = Date.now(),
  onPress,
}: WorldMissionBeaconProps): React.JSX.Element {
  const left = durationLabel(mission.endsAt, now);
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={styles.pill}
      accessibilityRole="button"
      accessibilityLabel={`This week's Mission: ${mission.title}`}
    >
      <View style={styles.copy}>
        <Text allowFontScaling={false} style={styles.eyebrow}>THIS WEEK</Text>
        <Text allowFontScaling={false} style={styles.title} numberOfLines={1}>
          {mission.title}
        </Text>
      </View>
      <Text allowFontScaling={false} style={styles.time}>{left} left</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: 'rgba(12,12,15,0.92)',
  },
  copy: { flex: 1, gap: 2 },
  eyebrow: { ...typeScale.caption, color: ink.tertiary, letterSpacing: 0.6 },
  title: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  time: { ...typeScale.meta, color: ink.secondary },
});
