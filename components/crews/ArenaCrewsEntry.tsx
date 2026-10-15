import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { layout, space, spring, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

/**
 * Quiet Arena Home entry — Crews exist and matter, without taking over the feed.
 */
export function ArenaCrewsEntry(): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          hapticTap();
          router.push('/arena/crews');
        }}
        onPressIn={() => {
          if (!reduced) scale.value = withSpring(0.985, spring.press);
        }}
        onPressOut={() => {
          if (!reduced) scale.value = withSpring(1, spring.settle);
        }}
        accessibilityRole="button"
        accessibilityLabel="Explore Crews"
        accessibilityHint="Discover competitive Crews in Arena"
      >
        <Animated.View
          style={[
            styles.row,
            anim,
            { borderColor: t.border, backgroundColor: t.surface },
          ]}
        >
          <View style={styles.copy}>
            <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
              CREWS
            </Text>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              Make your Crew famous
            </Text>
            <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
              Find your people. Put a name behind your takes.
            </Text>
          </View>
          <Text allowFontScaling={false} style={[styles.cta, { color: t.textPrimary }]}>
            Explore
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, gap: 3 },
  eyebrow: {
    ...typeScale.meta,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  title: {
    ...typeScale.cardTitle,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  body: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  cta: {
    ...typeScale.label,
    fontSize: 13,
    fontWeight: '700',
  },
});
