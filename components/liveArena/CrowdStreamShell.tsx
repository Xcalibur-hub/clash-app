/**
 * Live Stream / Crowd zone — Instagram/TikTok/Twitch-density presentation shell.
 * Official arguments never appear here. No production fake messages.
 * __DEV__ may show layout-only mock rows; never shipped as real Crowd data.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../theme';
import { CrowdComposerShell } from './CrowdComposerShell';

const DEV_LAYOUT_ROWS: readonly { user: string; body: string }[] = [
  { user: 'lucas', body: 'layout check — density only' },
  { user: 'sam', body: '[media preview]' },
  { user: 'dev_99', body: 'pass the mic already' },
];

export interface CrowdStreamShellProps {
  /** When judging/verdict, crowd prominence is reduced. */
  subdued?: boolean;
  paddingBottom?: number;
}

export function CrowdStreamShell({
  subdued = false,
  paddingBottom = 0,
}: CrowdStreamShellProps): React.JSX.Element {
  const t = useThemeColors();
  const showDevLayout = typeof __DEV__ !== 'undefined' && __DEV__;

  return (
    <View
      style={[
        styles.wrap,
        subdued && styles.subdued,
        { borderTopColor: t.border, paddingBottom },
      ]}
      accessibilityLabel="Live crowd stream"
    >
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          CROWD · LIVE STREAM
        </Text>
        <Text style={[styles.hint, { color: t.textMuted }]}>
          Crowd is entertainment. It never decides the verdict.
        </Text>
      </View>

      <ScrollView
        style={styles.stream}
        contentContainerStyle={styles.streamContent}
        showsVerticalScrollIndicator={false}
      >
        {showDevLayout ? (
          DEV_LAYOUT_ROWS.map((row) => (
            <View key={row.user} style={styles.msg} accessibilityElementsHidden>
              <Text style={[styles.user, { color: t.textPrimary }]}>@{row.user}</Text>
              <Text style={[styles.body, { color: t.textSecondary }]}>{row.body}</Text>
            </View>
          ))
        ) : (
          <Text style={[styles.empty, { color: t.textMuted }]}>
            The crowd layer is warming up. Reactions, jokes, GIFs, and memes will live here.
          </Text>
        )}
        <View style={styles.reactionPreview} accessibilityElementsHidden>
          {['🔥', '😂', '💀', '🤯', '👏'].map((emoji) => (
            <Text key={emoji} style={styles.emoji}>
              {emoji}
            </Text>
          ))}
        </View>
      </ScrollView>

      <CrowdComposerShell />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  subdued: { flex: 0.35, opacity: 0.72 },
  head: { gap: 2, marginBottom: space.xs },
  kicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  hint: { ...typeScale.caption, fontSize: 11, lineHeight: 15 },
  stream: { flex: 1, minHeight: 0 },
  streamContent: { gap: 8, paddingVertical: space.xs, flexGrow: 1 },
  msg: { gap: 2 },
  user: { ...typeScale.caption, fontSize: 12, fontWeight: '800' },
  body: { ...typeScale.body, fontSize: 14, lineHeight: 19 },
  empty: { ...typeScale.meta, fontSize: 13, lineHeight: 19, paddingVertical: space.md },
  reactionPreview: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.sm,
    opacity: 0.45,
  },
  emoji: { fontSize: 18 },
});
