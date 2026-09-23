import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { duration, ease } from '../../theme';

interface Particle {
  angle: number;
  distance: number;
  size: number;
  delay: number;
}

export interface ParticlesProps {
  count?: number;
  color: string;
  /** Diameter of the burst area. */
  spread?: number;
  size?: number;
  /** Re-fires the burst whenever this changes. */
  trigger?: number;
}

/**
 * Restrained particle burst for the verdict reveal (spec §10: "avoid excessive
 * confetti"). Runs entirely on the UI thread and stays off when the user has
 * reduced motion enabled.
 */
export function Particles({
  count = 14,
  color,
  spread = 220,
  size = 46,
  trigger = 0,
}: ParticlesProps): React.JSX.Element {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  const particles = React.useMemo<Particle[]>(
    () =>
      Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2 + (index % 3) * 0.21;
        return {
          angle,
          distance: spread * (0.55 + ((index * 37) % 40) / 100),
          size: 3 + ((index * 13) % 4),
          delay: (index % 5) * 40,
        };
      }),
    [count, spread],
  );

  React.useEffect(() => {
    if (reduced) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: duration.cinematic, easing: ease.out });
  }, [progress, reduced, trigger]);

  const center = Math.min(spread, width * 0.7);

  return (
    <View style={[styles.wrap, { width: center, height: size }]} pointerEvents="none">
      {reduced
        ? null
        : particles.map((particle, index) => (
            <Particle key={index} particle={particle} progress={progress} color={color} />
          ))}
    </View>
  );
}

function Particle({
  particle,
  progress,
  color,
}: {
  particle: Particle;
  progress: SharedValue<number>;
  color: string;
}): React.JSX.Element {
  const style = useAnimatedStyle(() => {
    const value = progress.value;
    const eased = 1 - (1 - value) ** 3;
    return {
      opacity: value === 0 ? 0 : Math.max(0, 1 - value) * 0.9,
      transform: [
        { translateX: Math.cos(particle.angle) * particle.distance * eased },
        { translateY: Math.sin(particle.angle) * particle.distance * eased * 0.7 },
        { scale: 1 - value * 0.4 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: particle.size,
          height: particle.size,
          borderRadius: particle.size / 2,
          backgroundColor: color,
          marginLeft: -particle.size / 2,
          marginTop: -particle.size / 2,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', position: 'absolute', top: 44, alignSelf: 'center' },
  particle: { position: 'absolute' },
});
