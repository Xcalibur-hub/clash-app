/**
 * Explore E2.8 D4 + D8 — the country picker must never clip its last row under
 * the navigation bar, and must stay above the keyboard while typing.
 *
 * Geometry is expressed the way the sheet receives it on device: a measured
 * full-screen modal surface, the safe-area insets and RN's keyboard height
 * (which Android reports against `Dimensions.window`, i.e. without the system
 * bars).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { layout, space } from '../theme/layout.ts';
import {
  EXPLORE_PICKER_BOTTOM_BREATHING,
  EXPLORE_PICKER_CHROME,
  EXPLORE_PICKER_IME_GAP,
  EXPLORE_PICKER_MIN_ROWS,
  EXPLORE_PICKER_ROW_MIN,
  EXPLORE_PICKER_VIEWPORT_RATIO,
  exploreKeyboardOverlap,
  explorePickerBackdropLift,
  explorePickerBottomInset,
  explorePickerSheetHeight,
  explorePickerUsableHeight,
  type ExplorePickerViewport,
} from './explorePickerLayout.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string): string =>
  fs.readFileSync(path.join(here, '..', relative), 'utf8');

/** Samsung Galaxy A50 (reported device): 1080x2340px @ 420dpi. */
const A50_SURFACE = 2340 / 2.625;
const A50_WINDOW = 2131 / 2.625;
const A50_STATUS_BAR = 83 / 2.625;
const A50_NAV_BAR = 126 / 2.625;
/** Honeyboard keyboard as reported by RN on this device. */
const A50_KEYBOARD = 855 / 2.625;

const viewport = (
  overrides: Partial<ExplorePickerViewport> = {},
): ExplorePickerViewport => ({
  surfaceHeight: A50_SURFACE,
  topInset: A50_STATUS_BAR,
  bottomInset: A50_NAV_BAR,
  keyboardOverlap: 0,
  ...overrides,
});

describe('E2.8 D4 — the picker sheet fits the real viewport', () => {
  it('keeps touch targets at or above the 44dp minimum', () => {
    assert.ok(EXPLORE_PICKER_ROW_MIN >= layout.hit);
    assert.ok(EXPLORE_PICKER_ROW_MIN >= 44);
  });

  it('pads the sheet bottom past the navigation bar with breathing room', () => {
    assert.equal(
      explorePickerBottomInset(0),
      space.xxl + EXPLORE_PICKER_BOTTOM_BREATHING,
    );
    assert.equal(explorePickerBottomInset(-10), space.xxl + EXPLORE_PICKER_BOTTOM_BREATHING);
    assert.equal(
      explorePickerBottomInset(A50_NAV_BAR),
      A50_NAV_BAR + EXPLORE_PICKER_BOTTOM_BREATHING,
    );
    assert.ok(explorePickerBottomInset(A50_NAV_BAR) > A50_NAV_BAR, 'rows never touch the bar');
  });

  it('reserves the navigation bar when it is the bottom obstruction', () => {
    assert.equal(
      explorePickerUsableHeight(viewport()),
      A50_SURFACE - A50_STATUS_BAR - A50_NAV_BAR,
    );
  });

  it('caps the sheet below the viewport and above the minimum row count', () => {
    const height = explorePickerSheetHeight(viewport());
    const usable = explorePickerUsableHeight(viewport());
    assert.ok(height <= usable);
    assert.equal(height, Math.floor(usable * EXPLORE_PICKER_VIEWPORT_RATIO));
    assert.ok(height >= EXPLORE_PICKER_CHROME + EXPLORE_PICKER_MIN_ROWS * EXPLORE_PICKER_ROW_MIN);
    assert.ok(height < A50_SURFACE, 'sheet must leave the backdrop visible');
  });

  it('never renders outside a very short surface', () => {
    const short = viewport({ surfaceHeight: 420, topInset: 24, bottomInset: 48 });
    const height = explorePickerSheetHeight(short);
    const usable = explorePickerUsableHeight(short);
    assert.ok(height > 0 && height <= usable);
    assert.ok(
      height >= Math.min(
        EXPLORE_PICKER_CHROME + EXPLORE_PICKER_MIN_ROWS * EXPLORE_PICKER_ROW_MIN,
        usable,
      ),
    );
  });

  it('never returns a negative height', () => {
    const crushed = viewport({ surfaceHeight: 200, keyboardOverlap: 900 });
    assert.equal(explorePickerUsableHeight(crushed), 0);
    assert.equal(explorePickerSheetHeight(crushed), 0);
  });
});

describe('E2.8 D8 — the sheet stays usable above the IME', () => {
  const closeTo = (actual: number, expected: number): void =>
    assert.ok(Math.abs(actual - expected) < 0.01, `${actual} != ${expected}`);
  const overlapFor = (input: {
    keyboardHeight: number;
    windowHeight?: number;
    surfaceHeight?: number;
    topInset?: number;
    baselineHeight?: number;
  }): number =>
    exploreKeyboardOverlap({
      keyboardHeight: input.keyboardHeight,
      windowHeight: input.windowHeight ?? A50_WINDOW,
      surfaceHeight: input.surfaceHeight ?? A50_SURFACE,
      topInset: input.topInset ?? A50_STATUS_BAR,
      baselineHeight: input.baselineHeight ?? A50_WINDOW,
    });

  it('adds the part of the surface the Android keyboard height omits', () => {
    // 855 px keyboard + 48 dp of navigation bar the modal surface still covers.
    closeTo(overlapFor({ keyboardHeight: A50_KEYBOARD }), A50_KEYBOARD + A50_NAV_BAR);
    closeTo(
      overlapFor({ keyboardHeight: A50_KEYBOARD, surfaceHeight: A50_WINDOW }),
      A50_KEYBOARD,
    );
    assert.equal(overlapFor({ keyboardHeight: 0 }), 0);
  });

  it('does not compensate twice when the platform already resized', () => {
    assert.equal(
      overlapFor({
        keyboardHeight: 320,
        windowHeight: 480,
        surfaceHeight: 480,
        baselineHeight: 800,
      }),
      0,
    );
    assert.equal(
      overlapFor({
        keyboardHeight: 320,
        windowHeight: 640,
        surfaceHeight: 640,
        baselineHeight: 800,
      }),
      160,
    );
  });

  it('never lifts the sheet past the top of the surface', () => {
    assert.equal(
      overlapFor({ keyboardHeight: 900, baselineHeight: A50_WINDOW }),
      A50_SURFACE,
    );
  });

  it('lifts the sheet above the keyboard and leaves a breathing gap', () => {
    const v = viewport({ keyboardOverlap: A50_KEYBOARD + A50_NAV_BAR });
    assert.equal(
      explorePickerBackdropLift(v),
      A50_KEYBOARD + A50_NAV_BAR + EXPLORE_PICKER_IME_GAP,
    );
    assert.equal(explorePickerBackdropLift(viewport()), 0, 'no lift without a keyboard');
  });

  it('keeps header, search field and results above the IME', () => {
    const overlap = A50_KEYBOARD + A50_NAV_BAR;
    const v = viewport({ keyboardOverlap: overlap });
    const height = explorePickerSheetHeight(v);
    const lift = explorePickerBackdropLift(v);
    const sheetTop = A50_SURFACE - lift - height;
    const sheetBottom = A50_SURFACE - lift;
    const keyboardTop = A50_SURFACE - overlap;

    assert.ok(sheetTop >= A50_STATUS_BAR, 'sheet must not run under the status bar');
    closeTo(keyboardTop - sheetBottom, EXPLORE_PICKER_IME_GAP);
    assert.ok(height > EXPLORE_PICKER_CHROME, 'chrome plus rows must still fit');
    assert.ok(
      height >= EXPLORE_PICKER_MIN_ROWS * EXPLORE_PICKER_ROW_MIN,
      'the list keeps several tappable rows while typing',
    );
  });

  it('grows back when the keyboard closes instead of collapsing', () => {
    const typing = explorePickerSheetHeight(
      viewport({ keyboardOverlap: A50_KEYBOARD + A50_NAV_BAR }),
    );
    const settled = explorePickerSheetHeight(viewport());
    assert.ok(settled > typing);
  });
});

describe('E2.8 — the sheet consumes the viewport helpers', () => {
  it('sizes from the layout module, not from a percentage cap', () => {
    const sheet = read('components/explore/CountryPickerSheet.tsx');
    const hook = read('hooks/usePickerViewport.ts');
    const styles = read('components/explore/countryPickerStyles.ts');
    assert.ok(hook.includes('explorePickerSheetHeight('));
    assert.ok(hook.includes('useSafeAreaInsets'));
    assert.ok(hook.includes('Keyboard.addListener'));
    assert.ok(sheet.includes('usePickerViewport('));
    assert.ok(sheet.includes('height: sheetHeight'), 'height comes from the viewport, not content');
    assert.ok(sheet.includes('onLayout'), 'the modal surface height is measured, not assumed');
    assert.ok(!/maxHeight:\s*'78%'/.test(styles), 'no percentage cap may return');
    assert.ok(/list:\s*\{\s*flex:\s*1\s*\}/.test(styles), 'the list must shrink inside the sheet');
  });
});
