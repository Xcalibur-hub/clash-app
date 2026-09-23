import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { glassBorder, glassFill, ink, radius, space, typeScale } from '../../theme';
import { GlowButton } from './GlowButton';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Shared empty / error surface (spec §36). Copy stays human — raw errors are
 * never rendered to the user.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Icon size={26} color={ink.secondary} strokeWidth={2} />
      </View>
      <Text allowFontScaling={false} style={styles.title}>
        {title}
      </Text>
      <Text allowFontScaling={false} style={styles.body}>
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
    backgroundColor: glassFill.strong,
    borderWidth: 1,
    borderColor: glassBorder.regular,
    marginBottom: space.xs,
  },
  title: { ...typeScale.cardTitle, color: ink.primary, textAlign: 'center' },
  body: { ...typeScale.body, color: ink.tertiary, textAlign: 'center', maxWidth: 300 },
  cta: { marginTop: space.sm },
});
