/**
 * Deterministic synthetic Drop datasets for performance probing.
 * Seeded coordinates around Goa — no real user data / Supabase.
 */

/**
 * @typedef {import('./probeDrops.js').ProbeDrop} ProbeDrop
 */

/** @type {readonly number[]} */
export const DATASET_SIZES = Object.freeze([50, 250, 1000, 5000]);

const GOA_LAT = 15.49;
const GOA_LNG = 73.83;
/** Rough half-span degrees for the synthetic cloud (~40km-ish at this latitude). */
const SPAN_LAT = 0.22;
const SPAN_LNG = 0.28;

/**
 * Mulberry32 — small deterministic PRNG.
 * @param {number} seed
 */
export function createSeededRng(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} size
 * @param {number} [seed=1]
 * @returns {ProbeDrop[]}
 */
export function generateProbeDataset(size, seed = 1) {
  if (!Number.isInteger(size) || size < 0) {
    throw new Error(`dataset size must be a non-negative integer, got ${size}`);
  }
  if (size === 0) return [];

  const rand = createSeededRng(seed * 1009 + size);
  /** @type {ProbeDrop[]} */
  const drops = [];
  for (let i = 0; i < size; i += 1) {
    const approxLat = GOA_LAT + (rand() - 0.5) * 2 * SPAN_LAT;
    const approxLng = GOA_LNG + (rand() - 0.5) * 2 * SPAN_LNG;
    const mediaType = rand() > 0.72 ? 'video' : 'image';
    const withMission = rand() > 0.55;
    const missionIndex = Math.floor(rand() * 4) + 1;
    drops.push({
      id: `perf-${size}-${i}`,
      approxLat,
      approxLng,
      mediaType,
      thumbnailLabel: mediaType === 'video' ? 'VID' : 'IMG',
      missionId: withMission ? `mission-${missionIndex}` : undefined,
      missionTitle: withMission ? `Mission ${missionIndex}` : undefined,
      title: `${mediaType === 'video' ? 'Clip' : 'Still'} ${i + 1}`,
      summary: `Synthetic fixture #${i + 1} of ${size} (seed ${seed}).`,
    });
  }
  return drops;
}

/**
 * Cached builders so UI dataset switches are cheap after first build.
 * @type {Map<string, ProbeDrop[]>}
 */
const CACHE = new Map();

/**
 * @param {number} size
 * @param {number} [seed=1]
 */
export function getProbeDataset(size, seed = 1) {
  const key = `${seed}:${size}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const built = generateProbeDataset(size, seed);
  CACHE.set(key, built);
  return built;
}

export function clearProbeDatasetCache() {
  CACHE.clear();
}

/**
 * @param {number} size
 */
export function isSupportedDatasetSize(size) {
  return DATASET_SIZES.includes(size);
}
