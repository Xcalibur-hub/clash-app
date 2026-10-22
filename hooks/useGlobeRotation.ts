/**
 * Explore E2.9 — owns the World globe's angle.
 *
 * Selection is the only input: a new country tweens the globe along the
 * shortest arc (or snaps for reduced motion). With nothing selected the globe
 * may drift slowly; it never responds to touch, so there is no drag, no
 * inertia and no rotation-based picking to keep in sync.
 */
import React from 'react';
import { wrapRotation } from '../utils/exploreGeo.ts';
import {
  GLOBE_ALIGN_MS,
  GLOBE_IDLE_DRIFT_DEG,
  GLOBE_IDLE_DRIFT_MS,
  globeAlignPlan,
  globeEasedProgress,
  globeIdleDriftAllowed,
  globeRotationFrame,
} from '../utils/exploreGlobeRotation.ts';

const START_ROTATION = 20;

interface GlobeTween {
  from: number;
  delta: number;
  duration: number;
  startedAt: number;
}

export interface GlobeRotationInput {
  isGlobe: boolean;
  /** Longitude of the selected country, or null when nothing is selected. */
  targetLng: number | null;
  /** A discovery request is in flight — hold the current angle. */
  busy: boolean;
  reduced: boolean;
}

export function useGlobeRotation({
  isGlobe,
  targetLng,
  busy,
  reduced,
}: GlobeRotationInput): { rotation: number } {
  const [rotation, setRotation] = React.useState(START_ROTATION);
  const rotationRef = React.useRef(START_ROTATION);
  const tween = React.useRef<GlobeTween | null>(null);
  const frame = React.useRef<number | null>(null);

  React.useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  const stopTween = React.useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    tween.current = null;
  }, []);

  const tick = React.useCallback(() => {
    const active = tween.current;
    if (!active) return;
    const progress = globeEasedProgress(Date.now() - active.startedAt, active.duration);
    setRotation(globeRotationFrame(active.from, active.delta, progress));
    if (progress >= 1) {
      stopTween();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  }, [stopTween]);

  // A new selection owns the rotation: shortest arc, snap for reduced motion.
  React.useEffect(() => {
    if (!isGlobe) {
      stopTween();
      return;
    }
    const plan = globeAlignPlan({ from: rotationRef.current, targetLng, reduced });
    if (!plan) return;
    stopTween();
    if (plan.kind === 'snap') {
      setRotation(plan.rotation);
      return;
    }
    tween.current = {
      from: plan.from,
      delta: plan.delta,
      duration: plan.duration || GLOBE_ALIGN_MS,
      startedAt: Date.now(),
    };
    frame.current = requestAnimationFrame(tick);
  }, [isGlobe, reduced, stopTween, targetLng, tick]);

  // Subtle ambient drift — only with no selection and never for reduced motion.
  React.useEffect(() => {
    const allowed = globeIdleDriftAllowed({
      isGlobe,
      reduced,
      busy,
      targetLng,
      moving: tween.current != null,
    });
    if (!allowed) return;
    const timer = setInterval(() => {
      if (tween.current) return;
      setRotation((prev) => wrapRotation(prev + GLOBE_IDLE_DRIFT_DEG));
    }, GLOBE_IDLE_DRIFT_MS);
    return () => clearInterval(timer);
  }, [busy, isGlobe, reduced, targetLng]);

  React.useEffect(() => stopTween, [stopTween]);

  return { rotation };
}
