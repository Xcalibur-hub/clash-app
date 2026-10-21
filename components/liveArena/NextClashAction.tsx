/**
 * One live Clash from the existing bounded discovery snapshot.
 * Renders nothing (or an honest notice) when no eligible Clash exists; the
 * surrounding outcome always offers Return to Arena as the fallback.
 * Visually separated from the verdict announcement above.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../theme';

export interface NextClashSuggestion {
  clashId: string;
  title: string;
}

export interface NextClashActionProps {
  clash: NextClashSuggestion | null;
  busy?: boolean;
  notice?: string | null;
  onOpen: () => void;
}

export function NextClashAction({
  clash,
  busy = false,
  notice = null,
  onOpen,
}: NextClashActionProps): React.JSX.Element | null {
  const t = useThemeColors();
  if (!clash) {
    return notice ? (
      <Text accessibilityRole="alert" style={[styles.notice, { color: t.textSecondary }]}>
        {notice}
      </Text>
    ) : null;
  }
  return (
    <View
      style={[styles.wrap, { borderTopColor: t.border }]}
      accessibilityLabel="Next Clash"
    >
      <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
        NEXT CLASH
      </Text>
      <Text style={[styles.lead, { color: t.textSecondary }]}>
        Continue with another live discussion — separate from this verdict.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Watch ${clash.title}`}
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={onOpen}
        style={[styles.row, { borderColor: t.border, opacity: busy ? 0.6 : 1 }]}
      >
        <Text numberOfLines={2} style={[styles.title, { color: t.textPrimary }]}>
          {clash.title}
        </Text>
        <Text style={[styles.cta, { color: t.textPrimary }]}>
          {busy ? 'Checking…' : 'Watch Clash →'}
        </Text>
      </Pressable>
      {notice ? (
        <Text accessibilityRole="alert" style={[styles.notice, { color: t.textSecondary }]}>
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingTop: space.md,
    marginTop: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  eyebrow: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  lead: { ...typeScale.caption, fontSize: 12, lineHeight: 17 },
  row: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  title: { ...typeScale.label, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  cta: { ...typeScale.caption, fontSize: 12, fontWeight: '700' },
  notice: { ...typeScale.caption, fontSize: 12, lineHeight: 17 },
});
