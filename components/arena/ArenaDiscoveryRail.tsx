import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { HOODS } from '../../data/hoods';
import type { FeedScope } from '../../store';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

const SCOPES: readonly { key: FeedScope; label: string }[] = [
  { key: 'for-you', label: 'For You' },
  { key: 'following', label: 'Following' },
  { key: 'popular', label: 'Popular' },
  { key: 'new', label: 'New' },
];

export interface ArenaDiscoveryRailProps {
  scope: FeedScope;
  onScopeChange: (scope: FeedScope) => void;
}

/**
 * Quiet discovery rail — high-contrast selected, minimal inactive.
 * Scopes + Hoods share one scroll; a hairline separates purpose.
 */
export function ArenaDiscoveryRail({ scope, onScopeChange }: ArenaDiscoveryRailProps): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="tablist"
        accessibilityLabel="Feed scope and Hoods"
      >
        {SCOPES.map((item) => (
          <ScopeChip
            key={item.key}
            label={item.label}
            active={item.key === scope}
            onPress={() => onScopeChange(item.key)}
          />
        ))}
        <View style={[styles.divider, { backgroundColor: t.borderStrong }]} />
        {HOODS.map((hood) => (
          <Pressable
            key={hood.id}
            onPress={() => {
              hapticTap();
              router.push(`/hood/${hood.id}`);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open ${hood.name}`}
            style={styles.hoodChip}
          >
            <Text allowFontScaling={false} style={[styles.hoodLabel, { color: t.textMuted }]}>
              {hood.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function ScopeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        if (!reduced) {
          scale.value = withSequence(
            withSpring(0.94, { damping: 16, stiffness: 400 }),
            withSpring(1, { damping: 14, stiffness: 280 }),
          );
        }
        onPress();
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Animated.View
        style={[
          styles.pill,
          anim,
          {
            backgroundColor: active ? t.pill : 'transparent',
          },
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[
            styles.label,
            {
              color: active ? t.pillText : t.textMuted,
              fontWeight: active ? '700' : '500',
            },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 4 },
  row: {
    paddingHorizontal: layout.screenX,
    gap: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  label: { ...typeScale.label, fontSize: 13, letterSpacing: -0.15 },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    marginHorizontal: 6,
  },
  hoodChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  hoodLabel: { ...typeScale.label, fontSize: 13, fontWeight: '500', letterSpacing: -0.1 },
});
