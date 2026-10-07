/**
 * Live Crowd layer — lightweight chat density, not a dashboard card.
 * Production: truthful unavailable shell. __DEV__: layout-only mocks (never shipped as real).
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FloatingReaction } from './ReactionBurst';
import { CrowdComposerShell } from './CrowdComposerShell';
import { crowdDevLayoutEnabled } from '../../utils/crowdLayerGate';
import { layout, space, typeScale, useThemeColors } from '../../theme';

type DevRow =
  | { kind: 'text'; user: string; body: string }
  | { kind: 'media'; user: string; label: string };

/** Layout densification only — impossible to confuse with production Crowd. */
const DEV_LAYOUT_ROWS: readonly DevRow[] = [
  { kind: 'text', user: 'sam', body: 'nah that actually changed my mind' },
  { kind: 'text', user: 'maya_builds', body: 'BRO 💀' },
  { kind: 'media', user: 'joel', label: 'DEV · meme preview' },
  { kind: 'text', user: 'ria', body: 'alex needs to answer that' },
  { kind: 'text', user: 'dev_layout_only', body: '🔥🔥 layout density check' },
  { kind: 'media', user: 'pixel_farm', label: 'DEV · gif-sized item' },
  { kind: 'text', user: 'k', body: 'pass the mic already' },
];

export interface LiveCrowdLayerProps {
  subdued?: boolean;
  paddingBottom?: number;
  /** When true (and __DEV__), show density mocks + sample float reaction. */
  showDevLayout?: boolean;
}

export function LiveCrowdLayer({
  subdued = false,
  paddingBottom = 0,
  showDevLayout = crowdDevLayoutEnabled(
    typeof __DEV__ !== 'undefined' ? __DEV__ : false,
  ),
}: LiveCrowdLayerProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View
      style={[
        styles.wrap,
        subdued && styles.subdued,
        { paddingBottom },
      ]}
      accessibilityLabel="Live crowd"
    >
      <View style={[styles.fade, { backgroundColor: t.background }]} />

      {showDevLayout ? (
        <Text
          allowFontScaling={false}
          style={[styles.devBadge, { color: t.textMuted, borderColor: t.border }]}
          accessibilityLabel="Development crowd layout preview"
        >
          DEV LAYOUT · NOT LIVE CROWD
        </Text>
      ) : null}

      <ScrollView
        style={styles.stream}
        contentContainerStyle={styles.streamContent}
        showsVerticalScrollIndicator={false}
      >
        {showDevLayout ? (
          DEV_LAYOUT_ROWS.map((row, i) => (
            <View
              key={`${row.user}-${i}`}
              style={styles.msg}
              accessibilityElementsHidden
            >
              <Text style={styles.line}>
                <Text style={[styles.user, { color: t.textPrimary }]}>@{row.user}</Text>
                <Text style={[styles.body, { color: t.textSecondary }]}>
                  {'  '}
                  {row.kind === 'text' ? row.body : `[${row.label}]`}
                </Text>
              </Text>
              {row.kind === 'media' ? (
                <View
                  style={[
                    styles.media,
                    { backgroundColor: t.surfaceMuted, borderColor: t.border },
                  ]}
                />
              ) : null}
            </View>
          ))
        ) : (
          <Text style={[styles.empty, { color: t.textMuted }]}>
            Crowd reactions will appear here. Spectator posting isn’t open yet.
          </Text>
        )}
      </ScrollView>

      {showDevLayout ? (
        <View style={styles.floatZone} pointerEvents="none" accessibilityElementsHidden>
          <FloatingReaction emoji="🔥" burstKey="dev-layout" drift={-8} />
        </View>
      ) : null}

      <CrowdComposerShell />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: layout.screenX,
    paddingTop: space.xs,
  },
  subdued: { opacity: 0.55 },
  fade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    opacity: 0.85,
    zIndex: 1,
  },
  devBadge: {
    ...typeScale.caption,
    alignSelf: 'flex-start',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginBottom: 6,
  },
  stream: { flex: 1, minHeight: 0 },
  streamContent: {
    gap: 7,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  msg: { gap: 4 },
  line: { flexDirection: 'row', flexWrap: 'wrap' },
  user: { ...typeScale.caption, fontSize: 13, fontWeight: '800' },
  body: { ...typeScale.body, fontSize: 14, lineHeight: 19 },
  media: {
    width: 96,
    height: 64,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.65,
  },
  empty: {
    ...typeScale.meta,
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: space.md,
  },
  floatZone: {
    position: 'absolute',
    left: 24,
    bottom: 72,
    width: 40,
    height: 40,
  },
});
