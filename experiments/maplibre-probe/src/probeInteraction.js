/**
 * Deterministic map feature selection helpers for the stability probe.
 */

/**
 * @typedef {import('./probeDrops.js').ProbeDrop} ProbeDrop
 * @typedef {|
 *   { kind: 'cluster'; id: string; latitude: number; longitude: number; count: number } |
 *   { kind: 'drop'; id: string; drop: ProbeDrop } |
 *   { kind: 'empty' }
 * } ProbeHit
 */

/**
 * Prefer clusters over drops; among equals, lowest id wins for stability.
 * @param {readonly any[]} features
 * @param {readonly ProbeDrop[]} dataset
 * @returns {ProbeHit}
 */
export function resolvePressFeatures(features, dataset) {
  if (!Array.isArray(features) || features.length === 0) {
    return { kind: 'empty' };
  }

  /** @type {any[]} */
  const clusters = [];
  /** @type {any[]} */
  const drops = [];

  for (const feature of features) {
    const props = feature?.properties ?? {};
    if (props.kind === 'cluster') clusters.push(feature);
    else if (props.kind === 'drop') drops.push(feature);
  }

  const ranked = (clusters.length ? clusters : drops).slice().sort((a, b) => {
    const idA = String(a?.properties?.id ?? '');
    const idB = String(b?.properties?.id ?? '');
    return idA.localeCompare(idB);
  });

  const top = ranked[0];
  if (!top) return { kind: 'empty' };

  const props = top.properties ?? {};
  if (props.kind === 'cluster') {
    const coords = top.geometry?.coordinates;
    const longitude = Array.isArray(coords) ? Number(coords[0]) : NaN;
    const latitude = Array.isArray(coords) ? Number(coords[1]) : NaN;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { kind: 'empty' };
    }
    return {
      kind: 'cluster',
      id: String(props.id ?? ''),
      latitude,
      longitude,
      count: Number(props.count) || 0,
    };
  }

  if (props.kind === 'drop' && props.id) {
    const drop = dataset.find((entry) => entry.id === props.id);
    if (!drop) return { kind: 'empty' };
    return { kind: 'drop', id: drop.id, drop };
  }

  return { kind: 'empty' };
}

/**
 * Whether a camera/programmatic window should ignore selection presses.
 * @param {number} nowMs
 * @param {number} blockedUntilMs
 */
export function isSelectionBlocked(nowMs, blockedUntilMs) {
  return nowMs < blockedUntilMs;
}

/**
 * Empty-map taps dismiss an open preview.
 * @param {{ open: boolean }} preview
 * @param {ProbeHit} hit
 */
export function shouldDismissPreviewOnEmptyTap(preview, hit) {
  return Boolean(preview?.open) && hit.kind === 'empty';
}

/**
 * Invalidate selection when the selected Drop leaves the current item set.
 * @param {string | null} selectedId
 * @param {readonly { kind: string; id?: string; drop?: ProbeDrop }[]} items
 */
export function selectionStillValid(selectedId, items) {
  if (!selectedId) return true;
  return items.some(
    (item) =>
      (item.kind === 'drop' && item.drop?.id === selectedId) ||
      (item.kind === 'cluster' && item.drops?.some((drop) => drop.id === selectedId)),
  );
}

/**
 * Stable label for on-device hit logging.
 * @param {ProbeHit} hit
 * @param {string} source
 */
export function formatHitLabel(hit, source) {
  if (hit.kind === 'empty') return `${source}:empty`;
  if (hit.kind === 'cluster') return `${source}:cluster:${hit.id}:${hit.count}`;
  return `${source}:drop:${hit.id}`;
}
