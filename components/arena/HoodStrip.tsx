import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { HOODS } from '../../data/hoods';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';

/** Horizontally scrollable Hood pills — soft neutral, no thick borders. */
export function HoodStrip(): React.JSX.Element {
  const router = useRouter();
  const t = useThemeColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      {HOODS.map((hood) => (
        <Pressable
          key={hood.id}
          onPress={() => router.push(`/hood/${hood.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${hood.name}`}
          style={[
            styles.chip,
            {
              backgroundColor: t.pillInactive,
              borderColor: t.border,
            },
          ]}
        >
          <Text allowFontScaling={false} style={[styles.label, { color: t.pillInactiveText }]}>
            {hood.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: layout.screenX, gap: space.xs, paddingBottom: space.xs },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { ...typeScale.meta, fontSize: 13, fontWeight: '500' },
});
