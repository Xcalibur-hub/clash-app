import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { GlowButton } from './GlowButton';
import { AppText } from './AppText';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Visual register. `quiet` for genuinely-empty lists (first run, no results);
   * `alert` for error surfaces so the two never look identical.
   */
  variant?: 'quiet' | 'alert';
}

/**
 * Shared empty / error surface.
 *
 * AURA treatment: one editorial serif line over calm supporting copy, set on a
 * hairline plate. Deliberately not a big centred icon in a coloured circle —
 * that reads as a placeholder rather than a considered state.
 *
 * Accessibility: title and body **scale with the OS text setting**. The previous
 * revision pinned them with ``, which silently disabled
 * Larger Text on every empty state in the app.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
  variant = 'quiet',
}: EmptyStateProps): React.JSX.Element {
  const t = useThemeColors();
  const accent = variant === 'alert' ? t.danger : t.brand;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.rule,
          // A short accent rule is the whole decoration: it marks the state
          // without a badge, glow or illustration.
          { backgroundColor: accent },
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.iconRow}>
        <Icon size={18} color={t.textMuted} strokeWidth={1.75} />
        <AppText style={[typeScale.kicker, { color: t.textMuted }]}>
          {variant === 'alert' ? 'SOMETHING WENT WRONG' : 'NOTHING HERE YET'}
        </AppText>
      </View>

      <AppText style={[styles.title, { color: t.textPrimary }]} accessibilityRole="header">
        {title}
      </AppText>
      <AppText style={[styles.body, { color: t.textSecondary }]}>{body}</AppText>

      {actionLabel && onAction ? (
        <GlowButton label={actionLabel} onPress={onAction} tone="glass" compact style={styles.cta} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: 56,
    gap: space.sm,
    minHeight: 340,
    maxWidth: 520,
  },
  rule: {
    width: 28,
    height: 2,
    borderRadius: 1,
    marginBottom: space.md,
    opacity: 0.9,
  },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  title: {
    ...typeScale.editorial,
    marginTop: space.xxs,
  },
  body: {
    ...typeScale.body,
    maxWidth: 380,
    marginTop: space.xxs,
  },
  cta: { marginTop: space.md },
});

/** Registers the surface radius so the plate matches cards elsewhere. */
export const EMPTY_STATE_RADIUS = radius.card;
