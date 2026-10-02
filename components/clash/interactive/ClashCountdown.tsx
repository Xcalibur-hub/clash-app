/**
 * Authoritative deadline display — client timer is display-only.
 * Supports compact inline status under the Clash title.
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
  /** Inline under the Clash title: LIVE · 21:35:48 */
  compact?: boolean;
}

export function ClashCountdown({
  closesAt,
  now,
  settled = false,
  cancelled = false,
  compact = false,
}: ClashCountdownProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const urgency = settled || cancelled ? 'closed' : countdownUrgency(closesAt, now);
  const scale = useSharedValue(1);
  const lastCriticalSec = React.useRef<number | null>(null);
  const remSec = Math.max(0, Math.floor((closesAt - now) / 1000));

  React.useEffect(() => {
    if (urgency !== 'critical' || reduced) return;
    if (lastCriticalSec.current !== remSec && remSec <= 10 && remSec > 0) {
      lastCriticalSec.current = remSec;
      scale.value = withSequence(
        withTiming(1.08, { duration: 70 }),
        withTiming(1, { duration: 140 }),
      );
      if (remSec === 10 || remSec <= 3) hapticTap();
    }
  }, [closesAt, reduced, remSec, scale, urgency]);

  const pulse = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (urgency === 'critical' && !settled && !cancelled) {
    if (compact) {
      return (
        <Animated.View style={pulse} accessibilityLiveRegion="polite" accessibilityLabel={`${remSec} seconds remaining`}>
          <Text allowFontScaling={false} style={[styles.compact, { color: t.accent }]}>
            Final · {remSec}
          </Text>
        </Animated.View>
      );
    }
    return (
      <Animated.View
        style={[styles.criticalWrap, pulse]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${remSec} seconds remaining`}
      >
        <Text allowFontScaling={false} style={[styles.criticalNum, { color: t.textPrimary }]}>
          {remSec}
        </Text>
        <Text allowFontScaling={false} style={[styles.criticalHint, { color: t.accent }]}>
          Final seconds
        </Text>
      </Animated.View>
    );
  }

  if (compact) {
    let status: string;
    if (settled) status = 'Settled';
    else if (cancelled) status = 'No verdict';
    else if (urgency === 'closed') status = 'Settling';
    else if (urgency === 'final') status = `Final minute · ${formatClock(closesAt, now)}`;
    else status = `Live · ${formatClock(closesAt, now)}`;

    const tone =
      urgency === 'final' || urgency === 'urgent' ? t.accent : t.textMuted;

    return (
      <Text
        allowFontScaling={false}
        style={[styles.compact, { color: tone }]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={status}
      >
        {status}
      </Text>
    );
  }

  let label: string;
  if (settled) label = 'Settled';
  else if (cancelled) label = 'No community verdict';
  else if (urgency === 'closed') label = 'Judging closed · result pending';
  else if (urgency === 'final') label = `FINAL MINUTE  ${formatClock(closesAt, now)}`;
  else label = formatClock(closesAt, now);

  const tone =
    urgency === 'final' || urgency === 'urgent' ? t.accent : t.textSecondary;

  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor: urgency === 'calm' || urgency === 'closed' ? t.border : t.accent,
          backgroundColor: t.surfaceMuted,
        },
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
    </View>
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
  compact: {
    ...typeScale.caption,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  criticalWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: space.sm,
    gap: 2,
  },
  criticalNum: {
    ...typeScale.display,
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1.5,
  },
  criticalHint: {
    ...typeScale.caption,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
});
