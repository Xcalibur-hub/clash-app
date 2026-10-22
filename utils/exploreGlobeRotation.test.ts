/**
 * Explore E2.9 — the World globe navigates itself.
 *
 * Regression cover for the interaction model: no drag / swipe / momentum /
 * rotation-based pick, selection (picker, rail, Surprise me, Teleport) is the
 * only input, the arc is always the short one, and reduced motion never tweens.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { countryByCode } from '../data/exploreCountries.ts';
import { wrapRotation } from './exploreGeo.ts';
import {
  GLOBE_ALIGN_EPSILON,
  GLOBE_ALIGN_MS,
  globeAlignPlan,
  globeEasedProgress,
  globeHintLabel,
  globeIdleDriftAllowed,
  globeRotationFrame,
  globeShortestArc,
} from './exploreGlobeRotation.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (relative: string): string => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative: string): boolean => fs.existsSync(path.join(root, relative));

describe('E2.9 — shortest-path alignment', () => {
  it('takes the short way round the antimeridian', () => {
    // 20 → -170 is +170, not -190.
    assert.equal(globeShortestArc(20, -170), 170);
    // -170 → 170 is -20, not +340.
    assert.equal(globeShortestArc(-170, 170), -20);
  });

  it('never plans an arc longer than half a turn', () => {
    const angles = [-179, -120, -45, 0, 30, 95, 138, 179];
    for (const from of angles) {
      for (const to of angles) {
        assert.ok(Math.abs(globeShortestArc(from, to)) <= 180, `${from} → ${to}`);
      }
    }
  });

  it('plans a tween for a new selection', () => {
    const plan = globeAlignPlan({ from: 20, targetLng: 138 });
    assert.deepEqual(plan, { kind: 'tween', from: 20, delta: 118, duration: GLOBE_ALIGN_MS });
  });

  it('snaps for reduced motion, for a no-op move and without a target', () => {
    assert.deepEqual(globeAlignPlan({ from: 20, targetLng: 138, reduced: true }), {
      kind: 'snap',
      rotation: 138,
    });
    assert.deepEqual(globeAlignPlan({ from: 138, targetLng: 138 }), {
      kind: 'snap',
      rotation: 138,
    });
    assert.deepEqual(globeAlignPlan({ from: 138, targetLng: 138 + GLOBE_ALIGN_EPSILON / 2 }), {
      kind: 'snap',
      rotation: 138.375,
    });
    assert.equal(globeAlignPlan({ from: 20, targetLng: null }), null);
    assert.equal(globeAlignPlan({ from: 20, targetLng: Number.NaN }), null);
  });
});

describe('E2.9 — tween frames', () => {
  it('eases from the current angle to the target angle', () => {
    assert.equal(globeRotationFrame(0, 90, 0), 0);
    assert.equal(globeRotationFrame(0, 90, 1), 90);
    const halfway = globeRotationFrame(0, 90, globeEasedProgress(280, 560));
    assert.ok(halfway > 45, 'ease-out is ahead of linear');
  });

  it('advances monotonically and never overshoots', () => {
    let previous = globeRotationFrame(0, 60, 0);
    for (let step = 1; step <= 20; step += 1) {
      const next = globeRotationFrame(0, 60, step / 20);
      assert.ok(next >= previous, 'rotation must not reverse');
      assert.ok(next <= 60, 'rotation must not overshoot the target');
      previous = next;
    }
    assert.equal(previous, 60);
  });

  it('clamps progress and wraps the result', () => {
    assert.equal(globeEasedProgress(-50, 560), 0);
    assert.equal(globeEasedProgress(900, 560), 1);
    assert.equal(globeEasedProgress(10, 0), 1);
    assert.equal(wrapRotation(globeRotationFrame(170, 20, 1)), -170);
  });

  it('reaches the selected country exactly', () => {
    for (const code of ['US', 'BR', 'NG', 'IN', 'JP', 'RU', 'AU']) {
      const country = countryByCode(code);
      assert.ok(country, `${code} must be in the catalogue`);
      const plan = globeAlignPlan({ from: 20, targetLng: country.lng });
      assert.ok(plan);
      const end = plan.kind === 'snap' ? plan.rotation : globeRotationFrame(plan.from, plan.delta, 1);
      assert.ok(
        Math.abs(wrapRotation(end - wrapRotation(country.lng))) < 1e-9,
        `${code} ends centered`,
      );
    }
  });
});


describe('E2.9 — idle drift and copy', () => {
  it('drifts only while nothing is selected and nothing is moving', () => {
    const base = { isGlobe: true, reduced: false, busy: false, targetLng: null, moving: false };
    assert.equal(globeIdleDriftAllowed(base), true);
    assert.equal(globeIdleDriftAllowed({ ...base, reduced: true }), false);
    assert.equal(globeIdleDriftAllowed({ ...base, busy: true }), false);
    assert.equal(globeIdleDriftAllowed({ ...base, targetLng: 138 }), false);
    assert.equal(globeIdleDriftAllowed({ ...base, moving: true }), false);
    assert.equal(globeIdleDriftAllowed({ ...base, isGlobe: false }), false);
  });

  it('never tells the reader to drag the globe', () => {
    assert.equal(globeHintLabel({ isGlobe: true, busy: false }), 'Rotation follows your pick');
    assert.equal(globeHintLabel({ isGlobe: true, busy: true }), 'Choosing a country…');
    assert.equal(globeHintLabel({ isGlobe: false, busy: true }), 'Tap a country');
    for (const busy of [true, false]) {
      assert.ok(!/drag|swipe|tap/i.test(globeHintLabel({ isGlobe: true, busy })));
    }
  });
});

describe('E2.9 — the surfaces consume the model', () => {
  it('the globe has no gesture, no tap target and no momentum', () => {
    const globe = read('components/explore/GlobeSurface.tsx');
    const canvas = read('components/explore/ExploreWorldCanvas.tsx');
    for (const source of [globe, canvas]) {
      assert.ok(!source.includes('GestureDetector'), 'no gesture handler on the globe');
      assert.ok(!source.includes('Gesture.Pan'), 'no pan gesture on the globe');
      assert.ok(!source.includes('velocity'), 'no momentum on the globe');
      assert.ok(!source.includes('Drag to explore'), 'no drag affordance');
    }
    assert.ok(!globe.includes('onPress'), 'land paths are not country buttons');
    assert.ok(globe.includes('accessibilityLabel'), 'the angle stays announced for screen readers');
    assert.ok(canvas.includes('useGlobeRotation('), 'rotation comes from the selection hook');
  });

  it('the canvas maps the selection to a longitude instead of a spin token', () => {
    const canvas = read('components/explore/ExploreWorldCanvas.tsx');
    assert.ok(canvas.includes('targetLng: selected?.lng ?? null'));
    assert.ok(!canvas.includes('spinToken'));
    assert.ok(!canvas.includes('Math.random'));
    const hook = read('hooks/useGlobeRotation.ts');
    assert.ok(hook.includes('globeAlignPlan('));
    assert.ok(hook.includes('globeIdleDriftAllowed('));
    assert.ok(hook.includes('cancelAnimationFrame'));
    assert.ok(!hook.includes('Gesture'));
  });

  it('every selection path funnels into one screen action', () => {
    const screen = read('app/(tabs)/explore.tsx');
    assert.ok(screen.includes('const selectCountry = React.useCallback'));
    assert.ok(screen.includes("selectCountry(code, 'explore_picker')"), 'picker rotates the globe');
    assert.ok(screen.includes("selectCountry(code, 'explore_rail')"), 'rail rotates the globe');
    assert.ok(screen.includes("selectCountry(pick.code, 'explore_surprise')"), 'Surprise me rotates');
    assert.ok(screen.includes("selectCountry(candidate.countryCode, 'explore_teleport')"));
    assert.ok(!screen.includes('spinToken'), 'the manual spin token is gone');
    assert.ok(!screen.includes('setSpinLng'), 'the manual spin longitude is gone');
    assert.ok(!screen.includes('Drag to explore'));
  });

  it('the orphan interactive globe is gone', () => {
    assert.equal(exists('components/explore/ExploreGlobe.tsx'), false);
  });
});
