import React from 'react';
import { Platform, Text, type TextProps, type TextStyle } from 'react-native';
import { useThemeColors } from '../../theme';
import { resolveFontScaling } from './textScaling';

/**
 * AURA text primitive.
 *
 * The app previously set `` on ~1,200 Text nodes to stop
 * the OS font scale from breaking dense layouts. The side effect was that the
 * accessibility "Larger Text" setting did nothing for most of the interface —
 * the one setting low-vision users reach for first.
 *
 * AURA resolves this with two explicit intents instead of a blanket override:
 *
 *   <AppText>        scales with the OS (default). Body copy, titles, labels.
 *   <AppText fixed>  never scales. Reserved for glyph/metric text where scaling
 *                    would break the layout contract, e.g. a countdown inside a
 *                    fixed-height ring, or a single-character badge.
 *
 * `fixed` is opt-in and deliberate, so it can be audited: grep for `fixed`.
 */

export type AppTextScale = 'display' | 'title' | 'body' | 'label' | 'meta' | 'none';

export interface AppTextProps extends TextProps {
  /**
   * Opt out of OS font scaling. Only for text whose layout cannot reflow:
   * numeric counters in fixed chrome, single-glyph badges. Never body copy.
   */
  fixed?: boolean;
  /**
   * Cap how far this node will grow under the OS text scale. Long-form prose
   * in a constrained media overlay can otherwise push controls off-screen.
   * Ignored when `fixed` is set.
   */
  maxFontSizeMultiplier?: number;
  /** Convenience colour shorthand resolved against the live theme. */
  tone?: 'primary' | 'secondary' | 'muted' | 'inverse';
}

/** Merge a colour shorthand into a style without allocating per render. */
function toneColor(
  tone: AppTextProps['tone'],
  colors: { textPrimary: string; textSecondary: string; textMuted: string; textInverse: string },
): string | undefined {
  switch (tone) {
    case 'primary':
      return colors.textPrimary;
    case 'secondary':
      return colors.textSecondary;
    case 'muted':
      return colors.textMuted;
    case 'inverse':
      return colors.textInverse;
    default:
      return undefined;
  }
}

/** Static style carries no colour: colour always comes from the live theme. */
const base: TextStyle = Platform.select({
  // Android applies its own font padding that shifts baselines inside fixed rows.
  android: { textAlignVertical: 'center' },
  default: {},
}) as TextStyle;

/**
 * Forwarding component. Intentionally not memoised: `style` is usually a fresh
 * array at call sites, so a memo comparator would cost more than it saves.
 */
export const AppText = React.forwardRef<Text, AppTextProps>(function AppText(
  { fixed, maxFontSizeMultiplier, tone, style, ...rest },
  ref,
) {
  const colors = useThemeColors();
  const scaling = resolveFontScaling(fixed, maxFontSizeMultiplier);
  const color = toneColor(tone, colors);
  return <Text ref={ref} {...scaling} {...rest} style={[base, color ? { color } : null, style]} />;
});
