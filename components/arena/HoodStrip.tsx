import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { HOODS } from '../../data/hoods';
import { ink, layout, radius, space, typeScale } from '../../theme';

/** A restrained horizontal community selector — tapping opens the Hood page. */
export function HoodStrip(): React.JSX.Element {
  const router = useRouter();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      {HOODS.map((hood) => (
        <Pressable
          key={hood.id}
          onPress={() => router.push(`/hood/${hood.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${hood.name}`}
          style={styles.chip}
        >
          <Text allowFontScaling={false} style={styles.label}>
            {hood.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: layout.screenX, gap: space.xs, paddingVertical: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  label: { ...typeScale.meta, fontSize: 13, color: ink.secondary },
});
