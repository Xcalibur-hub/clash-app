/**
 * Future Crowd input architecture — text / GIF / meme / sticker.
 * Disabled until spectator posting is supported. Never fakes a send.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';

export function CrowdComposerShell(): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View
      style={[styles.wrap, { borderColor: t.border }]}
      accessibilityLabel="Crowd composer unavailable"
      accessibilityState={{ disabled: true }}
    >
      <View style={[styles.field, { backgroundColor: t.surfaceMuted }]}>
        <Text style={[styles.placeholder, { color: t.textMuted }]}>Say something…</Text>
      </View>
      <View style={styles.tools}>
        <Text style={[styles.tool, { color: t.textMuted }]}>GIF</Text>
        <Text style={[styles.tool, { color: t.textMuted }]}>Meme</Text>
      </View>
      <Text style={[styles.note, { color: t.textMuted }]}>Coming soon · read-only</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
    gap: 6,
  },
  field: {
    minHeight: 40,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    opacity: 0.72,
  },
  placeholder: { ...typeScale.body, fontSize: 15 },
  tools: { flexDirection: 'row', gap: space.md, paddingHorizontal: 2 },
  tool: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    opacity: 0.55,
  },
  note: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 2,
  },
});
