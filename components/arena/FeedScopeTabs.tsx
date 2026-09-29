import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { FeedScope } from '../../store';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

const SCOPES: readonly { key: FeedScope; label: string }[] = [
  { key: 'for-you', label: 'For You' },
  { key: 'following', label: 'Following' },
  { key: 'popular', label: 'Popular' },
  { key: 'new', label: 'New' },
];

export interface FeedScopeTabsProps {
  value: FeedScope;
  onChange: (scope: FeedScope) => void;
}

/** Compact premium pill scope selector — active = high contrast fill. */
export function FeedScopeTabs({ value, onChange }: FeedScopeTabsProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
      accessibilityLabel="Feed scope"
    >
      {SCOPES.map((scope) => {
        const active = scope.key === value;
        return (
          <Pressable
            key={scope.key}
            onPress={() => {
              hapticTap();
              onChange(scope.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[
              styles.pill,
              {
                backgroundColor: active ? t.pill : t.pillInactive,
                borderColor: active ? t.pill : t.border,
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.label,
                { color: active ? t.pillText : t.pillInactiveText, fontWeight: active ? '700' : '500' },
              ]}
            >
              {scope.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: layout.screenX,
    paddingVertical: space.sm,
    gap: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { ...typeScale.label, fontSize: 13, letterSpacing: -0.1 },
});
