import type { SemanticTheme } from './palettes';
import { family } from './typography';
import { space, radius, layout } from './layout';

/** Arena v1: an editorial layer on the existing theme, not a second theme. */
export const arena = {
  space, radius, hit: layout.hit,
  measure: 680,
  type: {
    statement: { fontFamily: family.semibold, fontSize: 23, lineHeight: 31, fontWeight: '600' as const, letterSpacing: -0.6 },
    heading: { fontFamily: family.semibold, fontSize: 17, lineHeight: 23, fontWeight: '600' as const, letterSpacing: -0.25 },
    body: { fontFamily: family.regular, fontSize: 15, lineHeight: 23, fontWeight: '400' as const },
    label: { fontFamily: family.medium, fontSize: 13, lineHeight: 19, fontWeight: '500' as const },
    meta: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, fontWeight: '400' as const },
    eyebrow: { fontFamily: family.semibold, fontSize: 10, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 1.2 },
  },
  input: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 12, minHeight: layout.hit },
  sheet: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: space.lg },
  motion: { pressScale: 0.985, duration: 160, easing: 'cubic-bezier(0.22,1,0.36,1)' },
} as const;

/** Small metadata must remain readable on both the page and raised surfaces. */
export function arenaColors(t: SemanticTheme) {
  return {
    page: t.background, surface: t.surface, raised: t.surfaceElevated,
    inset: t.inputBackground, ink: t.textPrimary, secondary: t.textSecondary,
    muted: t.scheme === 'dark' ? '#A1A1AA' : '#62626D',
    line: t.border, strongLine: t.borderStrong, fill: t.clashFill, onFill: t.clashText,
  };
}
