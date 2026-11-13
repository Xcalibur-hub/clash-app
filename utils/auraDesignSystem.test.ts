/**
 * AURA design-system contract.
 *
 * Locks the decisions that make the visual identity recognisable, so a later
 * change cannot quietly reintroduce the problems AURA removed:
 *   · no neon blue/green and no purple-blue gradients
 *   · Side A / Side B separable in both schemes and light enough for AA text
 *   · an editorial serif voice that Inter cannot express
 *   · every semantic token present in *both* schemes
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { accent, duel, gradient } from '../theme/colors.ts';
import { family, typeScale } from '../theme/typeRamp.ts';
import { darkTheme, lightTheme } from '../theme/palettes.ts';
import { arenaSidesForTheme } from '../theme/arenaSides.ts';

/** Relative luminance, sRGB per WCAG 2.x. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Hue in degrees, so "is this blue/neon?" is answerable. */
function hue(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let hDeg = 0;
  if (max === r) hDeg = ((g - b) / d) % 6;
  else if (max === g) hDeg = (b - r) / d + 2;
  else hDeg = (r - g) / d + 4;
  return (hDeg * 60 + 360) % 360;
}

function saturation(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

describe('AURA colour identity', () => {
  it('keeps Side A warm and Side B cool in both schemes', () => {
    assert.ok(hue(lightTheme.sideA) < 45, 'light A should be a warm clay/ember hue');
    assert.ok(hue(darkTheme.sideA) < 45, 'dark A should be a warm clay/ember hue');
    assert.ok(hue(lightTheme.sideB) > 180 && hue(lightTheme.sideB) < 260, 'light B should be steel blue');
    assert.ok(hue(darkTheme.sideB) > 180 && hue(darkTheme.sideB) < 260, 'dark B should be steel blue');
  });

  it('avoids neon: no fully saturated blue or green accents', () => {
    for (const [name, value] of Object.entries({ ...accent, ...duel })) {
      if (typeof value !== 'string' || !value.startsWith('#')) continue;
      const [h, s] = [hue(value), saturation(value)];
      const neonBlue = h > 200 && h < 260 && s > 0.85;
      const neonGreen = h > 120 && h < 170 && s > 0.75;
      assert.ok(!neonBlue, `${name} (${value}) reads as neon blue`);
      assert.ok(!neonGreen, `${name} (${value}) reads as neon green`);
    }
  });

  it('has no purple-blue gradient pairs left', () => {
    for (const [name, stops] of Object.entries(gradient)) {
      const purpleBlue = stops.filter((stop) => {
        if (!stop.startsWith('#')) return false;
        const h = hue(stop);
        return (h > 220 && h < 290);
      });
      assert.ok(purpleBlue.length < 2, `${name} is a purple/blue gradient: ${stops.join(' ')}`);
    }
  });

  it('keeps primary text at AA contrast on its canvas', () => {
    assert.ok(contrast(lightTheme.textPrimary, lightTheme.background) >= 7, 'light primary text');
    assert.ok(contrast(darkTheme.textPrimary, darkTheme.background) >= 7, 'dark primary text');
    assert.ok(contrast(lightTheme.textSecondary, lightTheme.background) >= 4.5, 'light secondary');
    assert.ok(contrast(darkTheme.textSecondary, darkTheme.background) >= 4.5, 'dark secondary');
  });

  it('separates Side A and Side B visibly, not just nominally', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const tones = arenaSidesForTheme(scheme === 'light' ? lightTheme : darkTheme);
      assert.notEqual(tones.a.ink, tones.b.ink);
      // A and B must differ by hue, so they read apart to more than one form of
      // colour vision than a pure lightness difference would give.
      assert.ok(Math.abs(hue(tones.a.ink) - hue(tones.b.ink)) > 40, `${scheme} A/B hue separation`);
    }
  });
});

describe('AURA semantic completeness', () => {
  it('defines every token in both schemes', () => {
    const lightKeys = Object.keys(lightTheme).sort();
    const darkKeys = Object.keys(darkTheme).sort();
    assert.deepEqual(darkKeys, lightKeys, 'light and dark must expose identical token sets');
  });

  it('ships the AURA additions on both schemes', () => {
    const required = [
      'brand',
      'signature',
      'gold',
      'sideA',
      'sideB',
      'focusRing',
      'divider',
      'surfaceSunken',
    ];
    for (const theme of [lightTheme, darkTheme]) {
      for (const key of required) {
        assert.ok(typeof theme[key], `${theme.scheme} is missing ${key}`);
      }
    }
  });
});

describe('AURA typography voice', () => {
  it('has an editorial serif distinct from the UI sans', () => {
    assert.ok(family.serif);
    assert.notEqual(family.serif, family.regular);
  });

  it('uses the serif for display and keeps the sans for controls', () => {
    assert.equal(typeScale.display.fontFamily, family.serif);
    assert.equal(typeScale.displayLg.fontFamily, family.serif);
    assert.equal(typeScale.editorial.fontFamily, family.serif);
    assert.equal(typeScale.button.fontFamily, family.semibold);
    assert.equal(typeScale.body.fontFamily, family.regular);
  });

  it('keeps the scale ordered from display down to caption', () => {
    const ordered = [
      typeScale.displayLg.fontSize!,
      typeScale.display.fontSize!,
      typeScale.editorialLg.fontSize!,
      typeScale.title.fontSize!,
      typeScale.body.fontSize!,
      typeScale.label.fontSize!,
      typeScale.meta.fontSize!,
    ];
    for (let i = 1; i < ordered.length; i += 1) {
      assert.ok(ordered[i] <= ordered[i - 1], `type scale not monotonic at index ${i}`);
    }
  });
});
