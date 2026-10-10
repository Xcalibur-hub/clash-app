/**
 * Selection + preview state helpers for the MapLibre probe.
 */

/**
 * @typedef {import('./probeDrops.js').ProbeDrop} ProbeDrop
 * @typedef {|
 *   { open: false; drop: null } |
 *   { open: true; drop: ProbeDrop }
 * } ProbePreviewState
 */

/**
 * @param {ProbeDrop | null | undefined} drop
 * @returns {ProbePreviewState}
 */
export function previewForDrop(drop) {
  if (!drop) return { open: false, drop: null };
  return { open: true, drop };
}

/**
 * @param {ProbePreviewState} preview
 * @returns {ProbePreviewState}
 */
export function closePreview(preview) {
  if (!preview.open) return preview;
  return { open: false, drop: null };
}

/**
 * @param {string | null} selectedId
 * @param {string} dropId
 */
export function isDropSelected(selectedId, dropId) {
  return Boolean(selectedId) && selectedId === dropId;
}

/**
 * Toggle selection: selecting the same Drop again clears preview.
 *
 * @param {string | null} selectedId
 * @param {ProbeDrop} drop
 * @returns {{ selectedId: string | null; preview: ProbePreviewState }}
 */
export function selectProbeDrop(selectedId, drop) {
  if (selectedId === drop.id) {
    return { selectedId: null, preview: { open: false, drop: null } };
  }
  return { selectedId: drop.id, preview: previewForDrop(drop) };
}
