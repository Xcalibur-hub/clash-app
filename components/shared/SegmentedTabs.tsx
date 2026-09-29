import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface SegmentedTab<T extends string> {
  key: T;
  label: string;
}

export interface SegmentedTabsProps<T extends string> {
  value: T;
  items: readonly SegmentedTab<T>[];
  onChange: (next: T) => void;
  /** Screen-reader label for the whole group. */
  label: string;
}

/** Theme-aware segmented control used by Profile Appearance and archive tabs. */
export function SegmentedTabs<T extends string>({
  value,
  items,
  onChange,
  label,
}: SegmentedTabsProps<T>): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View
      style={[styles.segment, { borderColor: t.border, backgroundColor: t.surfaceMuted }]}
      accessibilityRole="tablist"
      accessibilityLabel={label}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              hapticTap();
              onChange(item.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            style={[
              styles.item,
              active && {
                backgroundColor: t.scheme === 'light' ? t.surface : 'rgba(255,255,255,0.10)',
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.label,
                { color: active ? t.textPrimary : t.textMuted, fontWeight: active ? '700' : '500' },
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.xs,
  },
  label: { ...typeScale.label },
});
