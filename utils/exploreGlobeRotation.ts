/**
 * Explore E2.9 — automatic globe navigation.
 *
 * The World globe is a *visualisation* of the current country selection, not a
 * controller: it is never dragged, swiped, flung or tapped. Every rotation is
 * the shortest arc from the current angle to the selected country's longitude,
 * and reduced-motion users receive the final angle without an animation.
 *
 * All maths lives here so the behaviour is testable without a renderer.
 */
import { wrapRotation } from './exploreGeo.ts';

/** Alignment tween used when the selection changes. */
export const GLOBE_ALIGN_MS = 560;

/** Moves smaller than this snap — an animation that short reads as a jitter. */
export const GLOBE_ALIGN_EPSILON = 0.75;

/** Ambient drift: slow enough to read, a little over one degree per second. */
export const GLOBE_IDLE_DRIFT_DEG = 1.2;
export const GLOBE_IDLE_DRIFT_MS = 900;

/** Signed shortest arc between two longitudes, in degrees. */
export function globeShortestArc(fromDeg: number, targetLng: number): number {
  return wrapRotation(wrapRotation(targetLng) - wrapRotation(fromDeg));
}

export type GlobeAlignPlan =
  | { kind: 'snap'; rotation: number }
  | { kind: 'tween'; from: number; delta: number; duration: number };

/**
 * How the globe should reach `targetLng` from `from`.
 * `null` target means "nothing to align on" — the caller keeps its angle.
 */
export function globeAlignPlan(input: {
  from: number;
  targetLng: number | null;
  reduced?: boolean;
  duration?: number;
  epsilon?: number;
}): GlobeAlignPlan | null {
  const {
    from,
    targetLng,
    reduced = false,
    duration = GLOBE_ALIGN_MS,
    epsilon = GLOBE_ALIGN_EPSILON,
  } = input;
  if (targetLng == null || !Number.isFinite(targetLng)) return null;
  const target = wrapRotation(targetLng);
  const delta = globeShortestArc(from, target);
  if (reduced || Math.abs(delta) <= epsilon) return { kind: 'snap', rotation: target };
  return { kind: 'tween', from: wrapRotation(from), delta, duration };
}

/** Ease-out cubic progress, clamped to [0, 1]. */
export function globeEasedProgress(elapsedMs: number, durationMs: number): number {
  if (!(durationMs > 0)) return 1;
  const p = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return 1 - (1 - p) ** 3;
}

/** Rotation for one frame of a tween; always wrapped to a legal longitude. */
export function globeRotationFrame(from: number, delta: number, progress: number): number {
  return wrapRotation(from + delta * Math.min(1, Math.max(0, progress)));
}

/**
 * The globe may drift only while it represents no country at all — an idle
 * rotation must never move the chosen country out from under the reader.
 */
export function globeIdleDriftAllowed(input: {
  isGlobe: boolean;
  reduced: boolean;
  busy: boolean;
  targetLng: number | null;
  moving: boolean;
}): boolean {
  const { isGlobe, reduced, busy, targetLng, moving } = input;
  return isGlobe && !reduced && !busy && targetLng == null && !moving;
}

/** Copy under the canvas — it never invites a gesture the surface does not have. */
export function globeHintLabel(input: { isGlobe: boolean; busy: boolean }): string {
  if (!input.isGlobe) return 'Tap a country';
  return input.busy ? 'Choosing a country…' : 'Rotation follows your pick';
}
