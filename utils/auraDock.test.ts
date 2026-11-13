/**
 * Dock geometry and affordance contract (Phase 1 blocker 6).
 *
 * Phase 1 shipped a 56dp plate whose two smallest targets were 40dp (realm
 * switch) and 34dp (Create disc), both under the 48dp minimum, and whose
 * docstring promised an active label that `renderTab` never drew.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CREATE_DISC,
  DOCK_LABEL_LINE,
  MIN_TOUCH_TARGET,
  PLATE_HEIGHT,
  SHIFT_WIDTH,
  dockLabelVisible,
} from '../components/navigation/dockMetrics.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('AURA dock', () => {
  it('meets the 48dp minimum on every affordance', () => {
    assert.ok(SHIFT_WIDTH >= MIN_TOUCH_TARGET, `realm switch is ${SHIFT_WIDTH}dp`);
    assert.ok(CREATE_DISC >= MIN_TOUCH_TARGET, `create disc is ${CREATE_DISC}dp`);
  });

  it('keeps the plate tall enough for a full-height tab target', () => {
    assert.ok(PLATE_HEIGHT >= MIN_TOUCH_TARGET, `plate is ${PLATE_HEIGHT}dp`);
    // Glyph (26) + label line (13) + breathing room must fit inside the plate.
    assert.ok(PLATE_HEIGHT >= 26 + DOCK_LABEL_LINE + 12, 'plate too short for glyph + label');
  });

  it('derives the dock height from the plate instead of restating it', () => {
    // `dockConfig` is app code that pulls in icons and React Native, so it cannot
    // be imported under Node's type stripper. Asserting the derivation on the
    // source is the honest option: Phase 1 had 56 written in two files that could
    // drift, which is the actual defect.
    const src = readFileSync(
      fileURLToPath(new URL('../components/navigation/dockConfig.ts', import.meta.url)),
      'utf8',
    );
    assert.match(src, /export const DOCK_HEIGHT = PLATE_HEIGHT;/);
    assert.doesNotMatch(src, /export const DOCK_HEIGHT = \d+;/, 'a literal height can drift');
    assert.match(src, /DOCK_SCROLL_CLEARANCE = DOCK_HEIGHT \+ DOCK_TOP_GAP/);
  });

  it('marks the active destination instead of leaving it implicit', () => {
    assert.equal(dockLabelVisible(true), true, 'the active tab must name itself');
    assert.equal(dockLabelVisible(false), false, 'inactive tabs stay glyph-only');
    assert.equal(dockLabelVisible(true, true), false, 'Create is a disc, not a labelled tab');
  });
});
