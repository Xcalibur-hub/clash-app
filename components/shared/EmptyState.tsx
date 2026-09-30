import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { GlowButton } from './GlowButton';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Shared empty / error surface. Theme-aware so Light Mode stays readable.
 * Copy stays human — raw errors are never rendered to the user.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.badge,
          {
            backgroundColor: t.surfaceMuted,
            borderColor: t.border,
          },
        ]}
      >
        <Icon size={26} color={t.textSecondary} strokeWidth={2} />
      </View>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        {title}
      </Text>
      <Text allowFontScaling={false} style={[styles.body, { color: t.textMuted }]}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <GlowButton label={actionLabel} onPress={onAction} tone="glass" compact style={styles.cta} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    paddingVertical: 48,
    gap: space.md,
    minHeight: 320,
  },
  badge: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.xs,
  },
  title: { ...typeScale.cardTitle, textAlign: 'center' },
  body: { ...typeScale.body, textAlign: 'center', maxWidth: 300 },
  cta: { marginTop: space.sm },
});
