/**
 * Authoritative deadline display — client timer is display-only.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

export type CountdownUrgency = 'calm' | 'urgent' | 'final' | 'critical' | 'closed';

export function countdownUrgency(closesAt: number, now: number): CountdownUrgency {
  const rem = closesAt - now;
  if (rem <= 0) return 'closed';
  if (rem <= 10_000) return 'critical';
  if (rem <= 60_000) return 'final';
  if (rem <= 5 * 60_000) return 'urgent';
  return 'calm';
}

function formatClock(closesAt: number, now: number): string {
  const rem = Math.max(0, closesAt - now);
  const totalSec = Math.floor(rem / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface ClashCountdownProps {
  closesAt: number;
  now: number;
  settled?: boolean;
  cancelled?: boolean;
}

export function ClashCountdown({
  closesAt,
  now,
  settled = false,
  cancelled = false,
}: ClashCountdownProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const urgency = settled
    ? 'closed'
    : cancelled
      ? 'closed'
      : countdownUrgency(closesAt, now);
  const scale = useSharedValue(1);
  const lastCriticalSec = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (urgency !== 'critical' || reduced) return;
    const sec = Math.floor(Math.max(0, closesAt - now) / 1000);
    if (lastCriticalSec.current !== sec && sec <= 10 && sec > 0) {
      lastCriticalSec.current = sec;
      scale.value = withSequence(
        withTiming(1.06, { duration: 80 }),
        withTiming(1, { duration: 120 }),
      );
      if (sec === 10 || sec <= 3) hapticTap();
    }
  }, [closesAt, now, reduced, scale, urgency]);

  const pulse = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  let label: string;
  if (settled) label = 'Settled';
  else if (cancelled) label = 'No community verdict';
  else if (urgency === 'closed') label = 'Judging closed · result pending';
  else if (urgency === 'final') label = 'FINAL MINUTE';
  else if (urgency === 'critical') label = formatClock(closesAt, now);
  else label = formatClock(closesAt, now);

  const tone =
    urgency === 'critical' || urgency === 'final'
      ? t.accent
      : urgency === 'urgent'
        ? t.textPrimary
        : t.textSecondary;

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          borderColor: urgency === 'calm' ? t.border : t.accent,
          backgroundColor: t.surfaceMuted,
        },
        pulse,
      ]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={
        settled
          ? 'Clash settled'
          : urgency === 'closed'
            ? 'Judging closed, result pending'
            : `Time remaining ${label}`
      }
    >
      <Text allowFontScaling={false} style={[styles.label, { color: tone }]}>
        {label}
      </Text>
      {!settled && !cancelled && urgency !== 'closed' && urgency !== 'final' ? (
        <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
          remaining
        </Text>
      ) : null}
      {urgency === 'urgent' && !settled ? (
        <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
          closing soon
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    ...typeScale.label,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
  hint: { ...typeScale.caption },
});
