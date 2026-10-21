/**
 * Explore World — geometry shared by the floating modes rail and the selected
 * country panel (Explore E2.5 D1).
 *
 * The modes rail floats above the World scroll content, anchored to the screen's
 * right edge. Both surfaces read their footprint from here so the panel's
 * dismiss control and its CTA can never be painted underneath the rail.
 */

import { layout, space } from '../theme/layout.ts';

/** One rail mode row. */
export const EXPLORE_RAIL_ITEM = 44;

/** Resting, icon-only rail width. */
export const EXPLORE_RAIL_COLLAPSED_W = 52;

/** Width once a mode label is revealed. */
export const EXPLORE_RAIL_EXPANDED_W = 128;

/** Rail distance from the screen's right edge. */
export const EXPLORE_RAIL_RIGHT = layout.screenX;

/** Breathing room kept between the rail and any control it could cover. */
export const EXPLORE_RAIL_GUTTER = space.xs;

/** Right padding of the World scroll content (`screenX` + shelf gutter). */
export const EXPLORE_WORLD_CONTENT_RIGHT = layout.screenX + space.xs;

export interface ExploreHorizontalBand {
  left: number;
  right: number;
}

/** Rail band in screen coordinates. */
export function exploreRailHorizontal(
  screenWidth: number,
  expanded = false,
): ExploreHorizontalBand {
  const width = expanded ? EXPLORE_RAIL_EXPANDED_W : EXPLORE_RAIL_COLLAPSED_W;
  const right = screenWidth - EXPLORE_RAIL_RIGHT;
  return { left: right - width, right };
}

/** Extra right inset the country panel needs to stay clear of the resting rail. */
export function worldPanelRailInset(): number {
  const railLeft = EXPLORE_RAIL_RIGHT + EXPLORE_RAIL_COLLAPSED_W;
  return Math.max(0, railLeft - EXPLORE_WORLD_CONTENT_RIGHT + EXPLORE_RAIL_GUTTER);
}

/** Country panel band once the rail footprint is reserved. */
export function exploreWorldPanelHorizontal(screenWidth: number): ExploreHorizontalBand {
  return {
    left: layout.screenX,
    right: screenWidth - EXPLORE_WORLD_CONTENT_RIGHT - worldPanelRailInset(),
  };
}

/** Dismiss target band inside the panel header (title leading, close trailing). */
export function explorePanelCloseHorizontal(screenWidth: number): ExploreHorizontalBand {
  const panel = exploreWorldPanelHorizontal(screenWidth);
  return { left: panel.right - layout.hit, right: panel.right };
}

/**
 * The rail only reveals labels when its widened band cannot cover panel content.
 * Mode navigation itself — every rail row — stays available either way.
 */
export function exploreRailExpandable(countryPanelOpen: boolean): boolean {
  return !countryPanelOpen;
}
