import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useThemeColors } from '../../theme';
import { radius, rhythm, space, typeScale } from '../../theme';
import { AppText } from './AppText';

/**
 * AURA editorial primitives.
 *
 * These exist so screens compose *hierarchy* instead of re-deriving it. Before
 * AURA there were 200 distinct hex literals and a dozen ad-hoc "section title"
 * styles across the app; a screen now picks one of three levels.
 */

/* ── Section header ──────────────────────────────────────────────────────── */

export interface SectionHeaderProps {
  /** Small uppercase kicker above the title. Optional. */
  kicker?: string;
  title: string;
  /** Right-aligned action, e.g. "See all". */
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

/**
 * One section heading: quiet kicker, editorial serif title, optional action.
 * The rule under the title is drawn only when a kicker is present, so repeated
 * sections on a long screen do not turn into a ladder of lines.
 */
export function SectionHeader({
  kicker,
  title,
  actionLabel,
  onAction,
  style,
}: SectionHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={[styles.headerRow, style]}>
      <View style={styles.headerText}>
        {kicker ? (
          <AppText style={[typeScale.kicker, { color: t.textMuted }]} numberOfLines={1}>
            {kicker}
          </AppText>
        ) : null}
        <AppText style={[typeScale.section, { color: t.textPrimary }]} accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={{ top: space.sm, bottom: space.sm, left: space.sm, right: space.sm }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={styles.headerAction}
        >
          <AppText style={[typeScale.label, { color: t.textSecondary }]}>{actionLabel}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ── Surface card ─────────────────────────────────────────────────────────── */

export interface EditorialCardProps {
  children: React.ReactNode;
  /** `plate` = hairline surface; `sunken` = recessed; `bare` = no chrome. */
  variant?: 'plate' | 'sunken' | 'bare';
  padding?: number;
  style?: ViewStyle;
  /** Pressable card. Renders a Pressable wrapper with a scale-free opacity cue. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * A surface, not a decoration. Depth comes from a hairline plus one tone step;
 * there is no gradient, glow or heavy shadow, which keeps scroll performance
 * honest on mid-range Android.
 */
export function EditorialCard({
  children,
  variant = 'plate',
  padding = space.md,
  style,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: EditorialCardProps): React.JSX.Element {
  const t = useThemeColors();
  const background =
    variant === 'plate' ? t.surface : variant === 'sunken' ? t.surfaceSunken : 'transparent';
  const borderColor = variant === 'bare' ? 'transparent' : t.border;

  const body = (
    <View
      style={[
        styles.card,
        { backgroundColor: background, borderColor, padding },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/* ── Stat pair ───────────────────────────────────────────────────────────── */

export interface EditorialStatProps {
  value: string;
  label: string;
  /** Accent colour for the numeral. Defaults to primary text. */
  tone?: string;
}

/** A quiet oversized numeral over a kicker — the app's stat idiom. */
export function EditorialStat({ value, label, tone }: EditorialStatProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.stat}>
      <AppText style={[typeScale.numeral, { color: tone ?? t.textPrimary }]}>{value}</AppText>
      <AppText style={[typeScale.kicker, { color: t.textMuted }]} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    marginBottom: rhythm.headingGap,
  },
  headerText: { flexShrink: 1, gap: 2 },
  headerAction: { paddingBottom: 1 },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.86 },
  stat: { gap: 2 },
});
