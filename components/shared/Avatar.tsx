import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ink, radius } from '../../theme';
import { withAlpha } from '../../utils/color';
import { initials } from '../../utils/format';

export interface AvatarProps {
  name: string;
  /** Accent hex from the user record — drives the avatar gradient. */
  tint: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** Initials-on-accent avatar. No network images, so it never pops in. */
export function Avatar({ name, tint, size = 40, style }: AvatarProps): React.JSX.Element {
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: withAlpha(tint, 0.55),
        },
        style,
      ]}
    >
      <LinearGradient
        colors={[withAlpha(tint, 0.95), withAlpha(tint, 0.3)]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={[styles.initials, { fontSize: Math.round(size * 0.36) }]} allowFontScaling={false}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  initials: {
    color: ink.inverse,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
