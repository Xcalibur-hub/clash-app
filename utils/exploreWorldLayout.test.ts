/**
 * Explore E2.6 D1 — the selected-country panel's dismiss control and CTA must never
 * sit underneath the floating modes rail.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { layout } from '../theme/layout.ts';
import {
  EXPLORE_RAIL_COLLAPSED_W,
  EXPLORE_RAIL_EXPANDED_W,
  EXPLORE_RAIL_GUTTER,
  EXPLORE_WORLD_CONTENT_RIGHT,
  explorePanelCloseHorizontal,
  exploreRailExpandable,
  exploreRailHorizontal,
  exploreWorldPanelHorizontal,
  worldPanelRailInset,
} from './exploreWorldLayout.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string): string =>
  fs.readFileSync(path.join(here, '..', relative), 'utf8');

/** Samsung Galaxy A50 (reported device): 1080px @ 420dpi ≈ 411dp wide. */
const A50_WIDTH = 1080 / 2.625;

describe('E2.6 D1 — country panel clears the floating Explore modes rail', () => {
  it('reserves exactly the rail footprint minus the content gutter', () => {
    assert.equal(EXPLORE_WORLD_CONTENT_RIGHT, layout.screenX + 8);
    assert.equal(
      worldPanelRailInset(),
      layout.screenX + EXPLORE_RAIL_COLLAPSED_W - EXPLORE_WORLD_CONTENT_RIGHT + EXPLORE_RAIL_GUTTER,
    );
    assert.ok(worldPanelRailInset() > 0, 'panel would otherwise run under the rail');
  });

  it('keeps the panel a full gutter left of the resting rail on every width', () => {
    for (const width of [320, 360, A50_WIDTH, 393, 768]) {
      const rail = exploreRailHorizontal(width);
      const panel = exploreWorldPanelHorizontal(width);
      assert.ok(panel.left < panel.right, `panel collapsed at ${width}dp`);
      assert.ok(
        panel.right + EXPLORE_RAIL_GUTTER <= rail.left + 1e-9,
        `panel edge ${panel.right.toFixed(1)} reaches rail edge ${rail.left.toFixed(1)} at ${width}dp`,
      );
    }
  });

  it('keeps the dismiss target accessible after the inset', () => {
    const rail = exploreRailHorizontal(A50_WIDTH);
    const close = explorePanelCloseHorizontal(A50_WIDTH);
    assert.ok(close.right - close.left >= layout.hit, 'dismiss target below 44dp');
    assert.ok(close.right <= rail.left, 'dismiss target overlaps the rail band');
  });

  it('keeps the panel body readable on the reported device', () => {
    const panel = exploreWorldPanelHorizontal(A50_WIDTH);
    assert.ok(panel.right - panel.left >= 280, 'panel too narrow for its CTA copy');
  });

  it('suspends rail label expansion while the panel is open', () => {
    assert.equal(exploreRailExpandable(true), false);
    assert.equal(exploreRailExpandable(false), true);
    // An expanded rail would reach past the inset panel edge — which is exactly why
    // the panel state suspends label expansion instead of widening under it.
    const expanded = exploreRailHorizontal(A50_WIDTH, true);
    const panel = exploreWorldPanelHorizontal(A50_WIDTH);
    assert.ok(EXPLORE_RAIL_EXPANDED_W > EXPLORE_RAIL_COLLAPSED_W);
    assert.ok(expanded.left < panel.right, 'expanded rail would overlap the panel — hence the gate');
  });

  it('wires the reserve and the expansion gate into the World surface', () => {
    const experience = read('components/explore/WorldExperience.tsx');
    assert.match(experience, /worldPanelRailInset\(\)/);

    const rail = read('components/explore/ExploreModeRail.tsx');
    assert.match(rail, /expandable = true/);
    assert.match(rail, /if \(!expandable\) \{/);

    const screen = read('app/(tabs)/explore.tsx');
    assert.match(screen, /const countryPanelOpen = mode === 'world' && selectedCountry !== null/);
    assert.match(screen, /expandable=\{exploreRailExpandable\(countryPanelOpen\)\}/);
    assert.match(screen, /paddingRight: EXPLORE_WORLD_CONTENT_RIGHT/);

    const panel = read('components/explore/WorldCountryPanel.tsx');
    assert.match(panel, /width: layout\.hit/, 'dismiss control must keep its 44dp target');
  });
});
