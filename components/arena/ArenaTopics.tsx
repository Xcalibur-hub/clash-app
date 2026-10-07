/**
 * Arena Topics — interest spaces (not Communities). Content-first, social hierarchy.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOODS } from '../../data/hoods';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export function ArenaTopics(): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();

  return (
    <View style={styles.wrap} accessibilityLabel="Topics">
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        TOPICS
      </Text>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        Interest spaces
      </Text>
      <Text style={[styles.sub, { color: t.textSecondary }]}>
        Topics are places people talk — Takes, live Clashes, and voices. Not a game screen.
      </Text>

      {HOODS.map((hood) => (
        <Pressable
          key={hood.id}
          onPress={() => {
            hapticTap();
            router.push(`/hood/${hood.id}`);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Open topic ${hood.name}`}
          style={[styles.row, { borderColor: t.border }]}
        >
          <Text allowFontScaling style={[styles.name, { color: t.textPrimary }]}>
            {hood.name}
          </Text>
          <Text style={[styles.tagline, { color: t.textMuted }]} numberOfLines={1}>
            {hood.tagline}
          </Text>
          <Text style={[styles.desc, { color: t.textSecondary }]} numberOfLines={2}>
            {hood.description}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    ...typeScale.section,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sub: { ...typeScale.meta, fontSize: 14, lineHeight: 20, marginBottom: space.sm },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.md,
    gap: 4,
  },
  name: { ...typeScale.label, fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  tagline: { ...typeScale.caption, fontSize: 12, fontWeight: '600' },
  desc: { ...typeScale.meta, fontSize: 14, lineHeight: 19 },
});
