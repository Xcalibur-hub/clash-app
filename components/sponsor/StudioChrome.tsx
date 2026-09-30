/**
 * Shared Sponsor Studio chrome — metrics, status pills, section labels.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';

export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'good' | 'warn';
}): React.JSX.Element {
  const t = useThemeColors();
  const bg =
    tone === 'good' ? t.surfaceMuted : tone === 'warn' ? t.surfaceMuted : t.surfaceMuted;
  const fg = tone === 'good' ? t.accent : tone === 'warn' ? t.textSecondary : t.textMuted;
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: t.border }]}>
      <Text allowFontScaling={false} style={[styles.pillText, { color: fg }]}>
        {label}
      </Text>
    </View>
  );
}

export function MetricCell({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={[styles.metric, { borderColor: t.border }]}>
      <Text allowFontScaling={false} style={[styles.metricValue, { color: t.textPrimary }]}>
        {value}
      </Text>
      <Text allowFontScaling={false} style={[styles.metricLabel, { color: t.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

export function StudioSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.section}>
      <Text allowFontScaling={false} style={[styles.sectionTitle, { color: t.textPrimary }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function statusTone(status: string): 'neutral' | 'good' | 'warn' {
  if (status === 'ACTIVE') return 'good';
  if (status === 'PAUSED' || status === 'DRAFT') return 'warn';
  return 'neutral';
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: {
    ...typeScale.caption,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metric: {
    flex: 1,
    minWidth: '44%',
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    gap: 4,
  },
  metricValue: {
    ...typeScale.title,
    fontWeight: '700',
  },
  metricLabel: {
    ...typeScale.caption,
  },
  section: {
    gap: space.sm,
    marginTop: space.lg,
  },
  sectionTitle: {
    ...typeScale.label,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
