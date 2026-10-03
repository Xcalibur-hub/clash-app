/**
 * Subtle round / phase progress — editorial, not a gaming HUD.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ArenaRoomStatus } from '../../services/liveArenaService';
import { space, typeScale, useThemeColors } from '../../theme';

const STEPS: readonly { key: ArenaRoomStatus; label: string }[] = [
  { key: 'OPEN', label: 'Open' },
  { key: 'FINAL_ARGUMENTS', label: 'Final' },
  { key: 'JUDGING', label: 'Judge' },
  { key: 'SETTLED', label: 'Result' },
];

function stepIndex(status: ArenaRoomStatus): number {
  if (status === 'CANCELLED') return -1;
  const i = STEPS.findIndex((s) => s.key === status);
  return i >= 0 ? i : 0;
}

export interface LiveRoomPhaseRailProps {
  status: ArenaRoomStatus;
}

export function LiveRoomPhaseRail({ status }: LiveRoomPhaseRailProps): React.JSX.Element | null {
  const t = useThemeColors();
  const active = stepIndex(status);
  if (active < 0) return null;

  return (
    <View style={styles.wrap} accessibilityRole="text" accessibilityLabel={`Phase: ${STEPS[active]?.label}`}>
      {STEPS.map((step, index) => {
        const done = index < active;
        const current = index === active;
        return (
          <React.Fragment key={step.key}>
            {index > 0 ? (
              <View
                style={[
                  styles.rail,
                  { backgroundColor: done || current ? t.textPrimary : t.borderStrong },
                  (done || current) && styles.railHot,
                ]}
              />
            ) : null}
            <View style={styles.step}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: current || done ? t.textPrimary : 'transparent',
                    borderColor: current || done ? t.textPrimary : t.borderStrong,
                  },
                ]}
              >
                {step.key === 'SETTLED' && (current || done) ? (
                  <Text allowFontScaling={false} style={styles.check}>
                    ✓
                  </Text>
                ) : null}
              </View>
              <Text
                allowFontScaling={false}
                style={[
                  styles.label,
                  {
                    color: current ? t.textPrimary : done ? t.textSecondary : t.textMuted,
                    fontWeight: current ? '800' : '600',
                  },
                ]}
              >
                {step.label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  step: { alignItems: 'center', gap: 4, minWidth: 44 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { color: '#FAFAF8', fontSize: 7, fontWeight: '800', lineHeight: 9 },
  label: { ...typeScale.caption, fontSize: 10, letterSpacing: 0.2 },
  rail: { flex: 1, height: StyleSheet.hairlineWidth, marginHorizontal: 4, marginBottom: 14 },
  railHot: { height: 1.5 },
});
