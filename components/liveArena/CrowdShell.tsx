/**
 * Crowd tab shell — ready for future spectator interaction.
 * Does NOT expose send controls while spectator posting remains denied.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../theme';

export function CrowdShell(): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: t.textPrimary }]}>CROWD</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>
        The crowd layer is warming up. Reactions, jokes, GIFs, and memes will live here —
        without ever deciding the official verdict.
      </Text>
      <Text style={[styles.note, { color: t.textMuted }]}>
        Spectator posting isn’t open yet. Watch the Arguments and judge when voting opens.
      </Text>
      <View style={styles.previewRow}>
        {['🔥', '😂', '💀', '👏', '🤯'].map((emoji) => (
          <Text key={emoji} style={styles.previewEmoji} accessibilityElementsHidden>
            {emoji}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: space.xl,
    gap: space.sm,
    alignItems: 'flex-start',
  },
  title: {
    ...typeScale.label,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  body: {
    ...typeScale.body,
    fontSize: 16,
    lineHeight: 23,
  },
  note: {
    ...typeScale.caption,
    fontSize: 13,
    lineHeight: 18,
  },
  previewRow: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.md,
    opacity: 0.55,
  },
  previewEmoji: { fontSize: 22 },
});
