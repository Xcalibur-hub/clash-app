/**
 * Soft animated mesh field for Arena discovery + Clash stages.
 * Reanimated only — no Skia. Respects reduced motion. Never encodes a winner.
 */
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  atmospherePalette,
  type ArenaAtmosphereMood,
} from '../../utils/arenaAtmosphere';
import { useThemeColors } from '../../theme';

export interface ArenaAtmosphereProps {
  mood?: ArenaAtmosphereMood;
  /** Optional pulse bump from local interactions (0–1). Never from scores. */
  energy?: number;
  style?: object;
}

function AtmosphereBlob({
  color,
  size,
  left,
  top,
  opacity,
  tempo,
  index,
  reduced,
  energy,
}: {
  color: string;
  size: number;
  left: number;
  top: number;
  opacity: number;
  tempo: number;
  index: number;
  reduced: boolean;
  energy: number;
}): React.JSX.Element {
  const drift = useSharedValue(0);
  const breathe = useSharedValue(1);

  React.useEffect(() => {
    if (reduced) {
      drift.value = 0;
      breathe.value = 1;
      return;
    }
    const duration = Math.round((14_000 + index * 2_200) * tempo);
    drift.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    breathe.value = withRepeat(
      withTiming(1.08 + energy * 0.04, {
        duration: Math.round(duration * 0.7),
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [breathe, drift, energy, index, reduced, tempo]);

  const animated = useAnimatedStyle(() => {
    const t = drift.value;
    const ox = Math.sin((t + index * 0.25) * Math.PI * 2) * (18 + index * 4);
    const oy = Math.cos((t + index * 0.33) * Math.PI * 2) * (14 + index * 3);
    return {
      opacity: opacity * (0.85 + energy * 0.15),
      transform: [
        { translateX: ox },
        { translateY: oy },
        { scale: breathe.value },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.blob,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          left,
          top,
        },
        animated,
      ]}
    />
  );
}

export function ArenaAtmosphere({
  mood = 'discovery',
  energy = 0,
  style,
}: ArenaAtmosphereProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const palette = atmospherePalette(mood);
  const clampedEnergy = Math.max(0, Math.min(1, energy));

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <LinearGradient
        colors={[t.background, t.background]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.field, { opacity: palette.intensity }]}>
        {palette.blobs.map((blob, index) => (
          <AtmosphereBlob
            key={`${mood}-${index}`}
            color={blob.color}
            size={blob.size * (width < 380 ? 0.85 : 1)}
            left={blob.x * width}
            top={blob.y * Math.min(height, 820)}
            opacity={blob.opacity}
            tempo={palette.tempo}
            index={index}
            reduced={reduced}
            energy={clampedEnergy}
          />
        ))}
      </View>
      {/* Soft veil so typography stays readable over moving color. */}
      <LinearGradient
        colors={[
          t.scheme === 'dark' ? 'rgba(9,9,11,0.35)' : 'rgba(250,250,248,0.45)',
          t.scheme === 'dark' ? 'rgba(9,9,11,0.72)' : 'rgba(250,250,248,0.78)',
          t.background,
        ]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Fine grain substitute — very light speckles via opacity wash. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor:
              t.scheme === 'dark' ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.02)',
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
  },
});
