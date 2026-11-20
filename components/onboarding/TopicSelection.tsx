import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap } from '../../utils/haptics';
import { toggleInterest, type ArenaInterest } from '../../utils/arenaInterests';

/** Shared selection grid for first-time onboarding and explicit Settings edits. */
export function TopicSelection({ catalogue, selected, disabled = false, onChange }: {
  catalogue: readonly ArenaInterest[]; selected: readonly string[]; disabled?: boolean; onChange: (ids: string[]) => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return <Animated.View entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)} style={styles.grid}>
    {catalogue.map(topic => {
      const chosen = selected.includes(topic.id);
      const locked = disabled || (!chosen && selected.length >= 5);
      return <Pressable key={topic.id} accessibilityRole="checkbox" accessibilityLabel={topic.name}
        accessibilityHint={topic.description} accessibilityState={{ checked: chosen, disabled: locked }} disabled={locked}
        onPress={() => { tap(); onChange(toggleInterest(selected, topic.id)); }}
        style={({ pressed }) => [styles.card, { backgroundColor: chosen ? t.textPrimary : t.surface,
          borderColor: chosen ? t.textPrimary : t.borderStrong, opacity: locked ? 0.5 : pressed ? 0.8 : 1 }]}>
        <View style={styles.row}>
          <Text style={[styles.name, { color: chosen ? t.textInverse : t.textPrimary }]}>{topic.name}</Text>
          <Text accessibilityElementsHidden importantForAccessibility="no" style={{ color: chosen ? t.textInverse : t.textMuted }}>{chosen ? '✓' : '+'}</Text>
        </View>
        <Text style={[styles.description, { color: chosen ? t.textInverse : t.textSecondary }]}>{topic.description}</Text>
      </Pressable>;
    })}
  </Animated.View>;
}
const styles = StyleSheet.create({
  grid: { gap: space.sm }, card: { padding: space.md, minHeight: 80, borderRadius: radius.lg, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  name: { ...typeScale.cardTitle, flex: 1 }, description: { ...typeScale.caption, marginTop: space.xs },
});
