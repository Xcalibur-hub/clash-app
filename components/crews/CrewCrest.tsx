/**
 * Reusable Crew crest — uploaded artwork or deterministic geometric identity.
 * Designed to work later in matchups ("ByteClub VS Droid Army") and leaderboards.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { spring, useTheme } from '../../theme';
import { arenaAccentPalette } from '../../theme/arenaAccents';
import { withAlpha } from '../../utils/color';
import { crewAccentKeyFor, crewCrestInitials } from '../../utils/arenaCrewIdentity';
import { tap as hapticTap } from '../../utils/haptics';

export interface CrewCrestProps {
  id: string;
  name: string;
  slug?: string;
  specialties?: readonly string[];
  avatarUrl?: string | null;
  size?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function CrewCrest({
  id,
  name,
  slug,
  specialties,
  avatarUrl,
  size = 56,
  onPress,
  style,
  accessibilityLabel,
}: CrewCrestProps): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const accent = arenaAccentPalette(scheme === 'light' ? 'light' : 'dark')[
    crewAccentKeyFor({ id, slug, specialties })
  ];
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const mark = crewCrestInitials(name);
  const radius = Math.round(size * 0.28);

  const body = (
    <Animated.View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderColor: withAlpha(accent.ink, 0.45),
          backgroundColor: colors.surfaceElevated,
        },
        anim,
        style,
      ]}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius: radius }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <>
          <LinearGradient
            colors={[withAlpha(accent.ink, 0.88), withAlpha(accent.ink, 0.28)]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.95, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.geometry,
              {
                borderColor: withAlpha('#FFFFFF', 0.22),
                width: size * 0.62,
                height: size * 0.62,
                borderRadius: radius * 0.7,
              },
            ]}
          />
          <Text
            allowFontScaling={false}
            style={[styles.mark, { fontSize: Math.round(size * 0.34), color: colors.background }]}
          >
            {mark}
          </Text>
        </>
      )}
    </Animated.View>
  );

  if (!onPress) {
    return (
      <View accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? `${name} crest`}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      onPressIn={() => {
        if (!reduced) scale.value = withSpring(0.94, spring.press);
      }}
      onPressOut={() => {
        if (!reduced) scale.value = withSpring(1, spring.settle);
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${name} crest`}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  geometry: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
  },
  mark: {
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
