import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WorldMission } from '../../services/worldService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { ArrowRightIcon } from '../shared/icons';
import { durationLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';

export interface WorldMissionBeaconProps {
  mission: WorldMission;
  now?: number;
  onPress: () => void;
}

/** Compact floating This Week discovery chip — not a quest HUD. */
export function WorldMissionBeacon({
  mission,
  now = Date.now(),
  onPress,
}: WorldMissionBeaconProps): React.JSX.Element {
  const t = useThemeColors();
  const left = durationLabel(mission.endsAt, now);
  const light = t.scheme === 'light';

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={[
        styles.pill,
        {
          backgroundColor: light ? 'rgba(255,255,255,0.94)' : 'rgba(30,30,34,0.94)',
          borderColor: light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
          shadowColor: t.shadowColor,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`This week's Mission: ${mission.title}`}
    >
      <View style={styles.copy}>
        <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
          THIS WEEK
        </Text>
        <Text
          allowFontScaling={false}
          style={[styles.title, { color: t.textPrimary }]}
          numberOfLines={1}
        >
          {mission.title}
        </Text>
      </View>
      <Text allowFontScaling={false} style={[styles.time, { color: t.textSecondary }]}>
        {left}
      </Text>
      <ArrowRightIcon size={16} color={t.textMuted} strokeWidth={2.1} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 12,
    paddingHorizontal: space.md,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  copy: { flex: 1, gap: 2 },
  eyebrow: { ...typeScale.caption, letterSpacing: 0.7 },
  title: { ...typeScale.label, fontWeight: '600' },
  time: { ...typeScale.meta },
});
