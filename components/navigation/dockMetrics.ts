/**
 * Dock geometry — pure, testable, no React.
 *
 * Phase 1 blocker 6: the plate was 56dp tall and two of its five affordances were
 * under the minimum touch target — the realm switch was `width: 40` and the
 * Create disc `34×34`. The 44pt iOS / 48dp Android minimums exist because thumbs
 * are not pointers, and the two smallest targets were the two most important
 * actions in the dock.
 */

/**
 * Minimum interactive size, in dp.
 *
 * 48 is the larger of the two platform minimums (iOS 44pt, Android 48dp), so one
 * number satisfies both. Targets may be visually smaller than this — the *hit
 * area* is what has to meet it, which is why the plate grew rather than the glyphs.
 */
export const MIN_TOUCH_TARGET = 48;

/**
 * Vertical space the dock reserves: the plate plus its own padding.
 *
 * Raised from 56 to 60 so a full-height tab can be a 48dp touch target with
 * label room around it, without the icon being vertically squeezed.
 */
export const PLATE_HEIGHT = 60;

/**
 * Width reserved for the realm-switch affordance.
 *
 * Was 40 — under the minimum. 48 keeps the edge affordance visually quieter than
 * a tab while making it as easy to hit.
 */
export const SHIFT_WIDTH = MIN_TOUCH_TARGET;

/**
 * Diameter of the Create disc.
 *
 * Was 34. The disc is the product's primary action, so it now carries the
 * platform minimum in its own right rather than relying on the surrounding
 * `Pressable` being padded out to it — a 44dp disc inside a 48dp hit area still
 * *looks* untappable even when it is not.
 */
export const CREATE_DISC = MIN_TOUCH_TARGET;

/**
 * Height of the active label.
 *
 * Reserving the line height in every tab — not just the active one — keeps the
 * glyph row from jumping vertically as focus moves. `dockLabelVisible` decides
 * whether the text is drawn; this decides how much room it always occupies.
 */
export const DOCK_LABEL_LINE = 13;

/**
 * Whether a tab shows its text label.
 *
 * Blocker 6 also covered the missing label: the component docstring promised
 * "the active destination is a filled plate with its label revealed" while
 * `renderTab` drew no label at all, so the distinction existed only in prose and
 * in `accessibilityLabel`. The active tab now names itself, which is what makes
 * the dock scannable rather than a row of symbols.
 */
export function dockLabelVisible(focused: boolean, isCreate = false): boolean {
  return focused && !isCreate;
}

/** Total height a dock tab needs to hold a 48dp target and a label line. */
export function dockTabHeight(plateHeight: number = PLATE_HEIGHT): number {
  return plateHeight;
}
