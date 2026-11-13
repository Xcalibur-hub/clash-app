/**
 * WCAG AA contrast contract for the AURA palette.
 *
 * Phase 1 blocker 8: `textMuted` was `#71717A` in both schemes, which measures
 * 3.45–4.40:1 against the app's real surfaces — below the 4.5:1 minimum for body
 * text — while being used for kickers and labels, i.e. the smallest type on
 * screen. Nobody noticed because contrast was never asserted; it was eyeballed
 * against a default white background instead of the warm-white surface the app
 * actually paints.
 *
 * These assertions are deliberately about the *worst* pairing, not the average
 * one: a token that passes on the background but fails on `surfaceElevated` is
 * still broken wherever a card is raised.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { darkTheme, lightTheme } from '../theme/palettes.ts';

/** Relative luminance, sRGB per WCAG 2.x. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Flatten a possibly-translucent colour onto an opaque backdrop.
 *
 * Dark `surfaceSunken` is `rgba(255,255,255,0.02)` — a 2% wash, not a real
 * colour. Measuring it directly gives NaN, and treating it as opaque would
 * report a contrast the user never sees. It only becomes a surface once
 * composited over the screen behind it.
 */
function flatten(color: string, backdrop: string): string {
  if (!color.startsWith('rgba')) return color;
  const [r, g, b, a] = color
    .replace(/^rgba?\(|\)$/g, '')
    .split(',')
    .map((v) => Number(v.trim()));
  const base = backdrop.replace('#', '');
  const [br, bg, bb] = [0, 2, 4].map((i) => parseInt(base.slice(i, i + 2), 16));
  const mix = (f: number, k: number) => Math.round(f * a + k * (1 - a));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r, br))}${toHex(mix(g, bg))}${toHex(mix(b, bb))}`;
}

function contrast(a: string, b: string, backdrop: string): number {
  const bg = flatten(b, backdrop);
  const fg = flatten(a, bg);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_BODY = 4.5;
const AA_LARGE = 3;

/** Every opaque surface text can land on, per scheme. */
function surfaces(theme: typeof lightTheme): string[] {
  return [theme.background, theme.surface, theme.surfaceElevated, theme.surfaceSunken];
}

describe('AURA text contrast (WCAG AA)', () => {
  for (const [name, theme] of [
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const) {
    it(`${name}: body text tokens clear 4.5:1 on every surface`, () => {
      for (const token of ['textPrimary', 'textSecondary', 'textMuted', 'textOnSunken'] as const) {
        const fg = theme[token];
        for (const bg of surfaces(theme)) {
          const ratio = contrast(fg, bg, theme.background);
          assert.ok(
            ratio >= AA_BODY,
            `${name}.${token} (${fg}) on ${bg} is ${ratio.toFixed(2)}:1, needs ${AA_BODY}:1`,
          );
        }
      }
    });

    it(`${name}: accent tokens used for text clear 3:1 on every surface`, () => {
      for (const token of ['brand', 'sideA', 'sideB', 'signature'] as const) {
        const fg = theme[token];
        for (const bg of surfaces(theme)) {
          const ratio = contrast(fg, bg, theme.background);
          assert.ok(
            ratio >= AA_LARGE,
            `${name}.${token} (${fg}) on ${bg} is ${ratio.toFixed(2)}:1, needs ${AA_LARGE}:1`,
          );
        }
      }
    });

    it(`${name}: textMuted is dimmer than secondary but still legible`, () => {
      // Ordering matters visually: muted must read as quieter, or the hierarchy
      // flattens. It must not be so quiet that it drops below AA.
      const muted = contrast(theme.textMuted, theme.surface, theme.background);
      const secondary = contrast(theme.textSecondary, theme.surface, theme.background);
      assert.ok(muted < secondary, `${name}: textMuted should be quieter than textSecondary`);
      assert.ok(muted >= AA_BODY, `${name}: textMuted is ${muted.toFixed(2)}:1`);
    });
  }
});
