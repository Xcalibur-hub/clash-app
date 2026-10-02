import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { typeScale } from '../../theme';
import { LIVE_TINT, PULSE_MAX, PULSE_MIN } from './liveArenaStyles';

export interface LivePulseProps {
  /** Hide the wordmark and keep only the dot (tight headers). */
  dotOnly?: boolean;
  size?: number;
}

/**
 * The one piece of motion in the Live Arena: a slow breathing dot.
 * Honours Reduce Motion by holding the dot steady rather than fading it out.
 */
export function LivePulse({ dotOnly = false, size = 7 }: LivePulseProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(PULSE_MAX);

  React.useEffect(() => {
    if (reduced) {
      pulse.value = PULSE_MAX;
      return;
    }
    pulse.value = withRepeat(
      withTiming(PULSE_MIN, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse, reduced]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={styles.row} accessibilityLabel="Live now">
      <Animated.View
        style={[
          { width: size, height: size, borderRadius: size / 2, backgroundColor: LIVE_TINT },
          animated,
        ]}
      />
      {dotOnly ? null : (
        <Text allowFontScaling={false} style={[styles.label, { color: LIVE_TINT }]}>
          LIVE
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
