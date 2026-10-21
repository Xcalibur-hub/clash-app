import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { HOODS } from '../../data/hoods';
import type { FeedScope } from '../../store';
import { layout, typeScale, useThemeColors } from '../../theme';
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
 * Quiet discovery rail — scopes first, then topic Hoods.
 * Selection is high-contrast; inactive chips stay calm for A50 density.
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

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: active ? t.pill : 'transparent',
          borderColor: active ? t.pill : t.border,
          opacity: pressed && !reduced ? 0.82 : 1,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.label,
          {
            color: active ? t.pillText : t.textSecondary,
            fontWeight: active ? '700' : '500',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 2 },
  row: {
    paddingHorizontal: layout.screenX,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  label: { ...typeScale.label, fontSize: 13, letterSpacing: -0.15 },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    marginHorizontal: 4,
  },
  hoodChip: {
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  hoodLabel: { ...typeScale.label, fontSize: 13, fontWeight: '500', letterSpacing: -0.1 },
});
