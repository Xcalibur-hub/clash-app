/**
 * Short, event-driven microanimations for real battle events.
 * No particles, no loops — transform/opacity only. Respects reduced motion.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { BattleBurstKind } from '../../utils/battleMoment';
import { typeScale, useThemeColors } from '../../theme';
import { CrossedSwords } from '../clash/CrossedSwords';
import { notify as hapticNotify, tap as hapticTap } from '../../utils/haptics';

export interface BattleEventBurstProps {
  kind: BattleBurstKind | null;
  /** Change to replay. */
  triggerKey: string | number | null;
}

export function BattleEventBurst({
  kind,
  triggerKey,
}: BattleEventBurstProps): React.JSX.Element | null {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);
  const rise = useSharedValue(0);
  const [swordKey, setSwordKey] = React.useState(0);
  const lastKey = React.useRef<string | number | null>(null);

  React.useEffect(() => {
    if (triggerKey == null || !kind) return;
    if (lastKey.current === triggerKey) return;
    lastKey.current = triggerKey;

    if (reduced) {
      opacity.value = withSequence(
        withTiming(1, { duration: 80 }),
        withDelay(900, withTiming(0, { duration: 120 })),
      );
      scale.value = 1;
      rise.value = 0;
      return;
    }

    opacity.value = 0;
    scale.value = 0.88;
    rise.value = 0;

    opacity.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
      withDelay(720, withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) })),
    );
    scale.value = withSequence(
      withTiming(1.04, { duration: 200, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 160 }),
    );

    if (kind === 'fast_rising') {
      rise.value = withSequence(
        withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 280 }),
      );
    }

    if (kind === 'clash' || kind === 'backup_called') {
      setSwordKey((k) => k + 1);
      hapticTap();
    } else if (kind === 'result' || kind === 'judging') {
      hapticNotify(kind === 'result' ? 'success' : 'warning');
    } else {
      hapticTap();
    }
  }, [kind, opacity, reduced, rise, scale, triggerKey]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateY: kind === 'fast_rising' ? (1 - rise.value) * 8 : 0 },
    ],
  }));

  if (!kind || triggerKey == null) return null;

  const mark = markFor(kind);

  return (
    <View pointerEvents="none" style={styles.wrap} accessibilityElementsHidden>
      <Animated.View style={[styles.burst, style]}>
        {kind === 'clash' || kind === 'backup_called' ? (
          <CrossedSwords
            triggerKey={swordKey || null}
            size={36}
            color={t.textPrimary}
            cooldownMs={400}
          />
        ) : (
          <Text allowFontScaling={false} style={[styles.mark, { color: t.textPrimary }]}>
            {mark}
          </Text>
        )}
        <Text allowFontScaling={false} style={[styles.label, { color: t.textSecondary }]}>
          {labelFor(kind)}
        </Text>
      </Animated.View>
    </View>
  );
}

function markFor(kind: BattleBurstKind): string {
  switch (kind) {
    case 'backup_arrived':
      return '🛡';
    case 'receipts':
      return '🧾';
    case 'fast_rising':
      return '↑';
    case 'judging':
      return '⚖';
    case 'result':
      return '◆';
    case 'mindshift':
      return '↻';
    default:
      return '⚔';
  }
}

function labelFor(kind: BattleBurstKind): string {
  switch (kind) {
    case 'backup_called':
      return 'BACKUP SIGNAL';
    case 'backup_arrived':
      return 'BACKUP ARRIVED';
    case 'receipts':
      return 'RECEIPTS';
    case 'fast_rising':
      return 'FAST RISING';
    case 'judging':
      return 'JUDGING';
    case 'result':
      return 'DECIDED';
    case 'mindshift':
      return 'MINDSHIFT';
    default:
      return 'CLASH';
  }
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
  },
  burst: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  mark: { fontSize: 28, fontWeight: '800' },
  label: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
});
