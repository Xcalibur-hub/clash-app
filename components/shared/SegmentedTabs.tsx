import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ink, radius, space, typeScale } from '../../theme';
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

/**
 * The app's single segmented control (reference screens 13 & 14). Each screen
 * declares its own segments, so the Profile, the Vault profile and the Hall of
 * Fame filters all feel identical without sharing a tab union.
 */
export function SegmentedTabs<T extends string>({
  value,
  items,
  onChange,
  label,
}: SegmentedTabsProps<T>): React.JSX.Element {
  return (
    <View style={styles.segment} accessibilityRole="tablist" accessibilityLabel={label}>
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
            style={[styles.item, active ? styles.itemOn : null]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.label, active ? styles.labelOn : null]}
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
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
  },
  itemOn: { backgroundColor: 'rgba(255,255,255,0.12)' },
  label: { ...typeScale.label, color: ink.tertiary },
  labelOn: { color: ink.primary, fontWeight: '800' },
});