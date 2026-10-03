/**
 * Extremely subtle Hood/topic wash + faint doodle field.
 * Never competes with message readability.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { arenaAccentForHood, arenaAccentForId, useThemeColors } from '../../theme';

export interface LiveRoomAtmosphereProps {
  topicId: string;
  hood?: string | null;
}

export function LiveRoomAtmosphere({
  topicId,
  hood = null,
}: LiveRoomAtmosphereProps): React.JSX.Element {
  const t = useThemeColors();
  const accent = hood
    ? arenaAccentForHood(hood, t.scheme, topicId)
    : arenaAccentForId(topicId, t.scheme);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[accent.soft, 'transparent', t.background]}
        locations={[0, 0.45, 1]}
        style={styles.wash}
      />
      <Svg width="100%" height={220} style={styles.doodles}>
        <Circle cx="18%" cy="42" r="28" fill={accent.ink} opacity={0.04} />
        <Circle cx="82%" cy="70" r="40" fill={accent.ink} opacity={0.035} />
        <Path
          d="M40 150 C80 120, 120 180, 160 140"
          stroke={accent.ink}
          strokeWidth={1.2}
          fill="none"
          opacity={0.05}
        />
        <Path
          d="M220 40 C250 70, 280 30, 320 55"
          stroke={accent.ink}
          strokeWidth={1}
          fill="none"
          opacity={0.045}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wash: { ...StyleSheet.absoluteFillObject, height: 340 },
  doodles: { position: 'absolute', top: 0, left: 0, right: 0 },
});
