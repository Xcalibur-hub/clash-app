/**
 * Explore E2.8 — country picker sheet geometry (D4 + D8).
 *
 * The sheet used a percentage `maxHeight`, so a long result list overflowed past
 * the sheet's padding and the last rows were painted under the Android
 * navigation bar. It also ignored the IME, so the whole sheet slid behind the
 * keyboard while typing.
 *
 * Everything here derives from the reported window height, the safe-area insets
 * and the keyboard height — never from device-specific pixel offsets — so any
 * screen height or nav-bar shape resolves correctly.
 */
import { layout, space } from '../theme/layout.ts';

/** Share of the usable viewport the sheet is allowed to cover. */
export const EXPLORE_PICKER_VIEWPORT_RATIO = 0.78;

/** Minimum height of one country row; also the sheet's touch-target floor. */
export const EXPLORE_PICKER_ROW_MIN = 48;

/** Rows that must fit before the sheet is allowed to grow to the ratio cap. */
export const EXPLORE_PICKER_MIN_ROWS = 4;

/** Breathing room kept between the sheet and the IME. */
export const EXPLORE_PICKER_IME_GAP = space.sm;

/** Header row + search field + the paddings and gaps around them. */
export const EXPLORE_PICKER_CHROME =
  space.lg /* top padding */ + layout.hit /* title row */ + space.sm /* gap */ +
  48 /* search field */ + space.sm /* gap */;

export interface ExplorePickerViewport {
  /** Height of the modal surface the sheet lives in (measured, dp). */
  surfaceHeight: number;
  /** Status-bar inset above the sheet. */
  topInset: number;
  /** Navigation-bar inset below the sheet. */
  bottomInset: number;
  /** How much of the IME actually covers the modal surface. */
  keyboardOverlap: number;
}

/** Breathing room kept between the last row and the navigation bar. */
export const EXPLORE_PICKER_BOTTOM_BREATHING = space.xs;

/**
 * Keyboard height plus any part of the modal surface the keyboard height does
 * not describe.
 *
 * Android reports the IME against `Dimensions.window`, which excludes the
 * system bars, while a full-screen modal surface spans them. The difference is
 * read from the measured surface and the status-bar inset, so no per-device
 * constant is involved. If the platform instead resizes the window
 * (`adjustResize`) the shrink is already accounted for and is removed again.
 */
export function exploreKeyboardOverlap(input: {
  keyboardHeight: number;
  windowHeight: number;
  surfaceHeight: number;
  topInset: number;
  baselineHeight: number;
}): number {
  const keyboard = Math.max(0, input.keyboardHeight);
  if (keyboard === 0) return 0;
  const beyondWindow = Math.max(
    0,
    input.surfaceHeight - input.windowHeight - Math.max(0, input.topInset),
  );
  const shrunk = Math.max(0, input.baselineHeight - input.windowHeight);
  return Math.max(0, Math.min(input.surfaceHeight, keyboard + beyondWindow - shrunk));
}

/** Distance the sheet is lifted off the window's bottom edge. */
export function explorePickerBackdropLift(viewport: ExplorePickerViewport): number {
  const overlap = Math.max(0, viewport.keyboardOverlap);
  return overlap > 0 ? overlap + EXPLORE_PICKER_IME_GAP : 0;
}

/**
 * Space the sheet may occupy between the status bar and whatever covers the
 * bottom edge of the modal surface (navigation bar or IME).
 */
export function explorePickerUsableHeight(viewport: ExplorePickerViewport): number {
  const bottom = Math.max(
    Math.max(0, viewport.bottomInset),
    explorePickerBackdropLift(viewport),
  );
  return Math.max(
    0,
    Math.max(0, viewport.surfaceHeight) - Math.max(0, viewport.topInset) - bottom,
  );
}

/**
 * Fixed sheet height: tall enough for a real list, short enough to keep the
 * header and search field above the IME. A fixed height means opening or
 * closing the keyboard resizes the sheet smoothly instead of collapsing it to
 * the height of the current result set.
 */
export function explorePickerSheetHeight(viewport: ExplorePickerViewport): number {
  const usable = explorePickerUsableHeight(viewport);
  if (usable <= 0) return 0;
  const preferred = Math.floor(usable * EXPLORE_PICKER_VIEWPORT_RATIO);
  const floor = EXPLORE_PICKER_CHROME + EXPLORE_PICKER_MIN_ROWS * EXPLORE_PICKER_ROW_MIN;
  return Math.min(usable, Math.max(preferred, Math.min(floor, usable)));
}

/** Bottom padding inside the sheet — always clears the navigation bar. */
export function explorePickerBottomInset(bottomInset: number): number {
  return Math.max(Math.max(0, bottomInset), space.xxl) + EXPLORE_PICKER_BOTTOM_BREATHING;
}
