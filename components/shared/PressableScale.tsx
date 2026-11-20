/**
 * Tiny motion helpers for Phase 1 product chrome.
 * Transform/opacity only; skip when Reduce Motion is on.
 */

import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { duration, ease, scale, spring } from '../../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Subtle press scale for CTAs and judgement buttons. */
export function PressableScale({ children, style, onPressIn, onPressOut, ...rest }: PressableScaleProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scale.press) * pressed.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animated]}
      onPressIn={(event) => {
        if (!reduced) pressed.value = withSpring(1, spring.press);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!reduced) pressed.value = withSpring(0, spring.press);
        onPressOut?.(event);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Fade+slide in for Clash panels and result reveals. */
export function FadeRise({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  React.useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: duration.slow, easing: ease.out }),
    );
  }, [delay, progress, reduced]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 10 }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
