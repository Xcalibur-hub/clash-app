/**
 * Synthetic Drops around Goa for marker / cluster / preview parity tests.
 * Approximate coordinates only — not live World data.
 */

/**
 * @typedef {'image' | 'video'} ProbeMediaType
 * @typedef {object} ProbeDrop
 * @property {string} id
 * @property {number} approxLat
 * @property {number} approxLng
 * @property {ProbeMediaType} mediaType
 * @property {string} [thumbnailLabel]
 * @property {string} [missionId]
 * @property {string} [missionTitle]
 * @property {string} title
 * @property {string} summary
 */

/** @type {readonly ProbeDrop[]} */
export const SYNTHETIC_DROPS = Object.freeze([
  {
    id: 'drop-panaji-1',
    approxLat: 15.4909,
    approxLng: 73.8278,
    mediaType: 'image',
    thumbnailLabel: 'IMG',
    missionId: 'mission-coast',
    missionTitle: 'Coastal Notes',
    title: 'Riverfront mural',
    summary: 'Painted wall near the Mandovi — synthetic fixture.',
  },
  {
    id: 'drop-panaji-2',
    approxLat: 15.4922,
    approxLng: 73.8291,
    mediaType: 'video',
    thumbnailLabel: 'VID',
    title: 'Ferry crossing clip',
    summary: 'Short synthetic video Drop for indicator parity.',
  },
  {
    id: 'drop-panaji-3',
    approxLat: 15.4895,
    approxLng: 73.8265,
    mediaType: 'image',
    thumbnailLabel: 'IMG',
    missionId: 'mission-coast',
    missionTitle: 'Coastal Notes',
    title: 'Fontainhas corner',
    summary: 'Clustered with nearby Panaji fixtures.',
  },
  {
    id: 'drop-miramar-1',
    approxLat: 15.482,
    approxLng: 73.807,
    mediaType: 'video',
    thumbnailLabel: 'VID',
    missionId: 'mission-beach',
    missionTitle: 'Beach Walk',
    title: 'Miramar dusk',
    summary: 'Mission-linked video Drop.',
  },
  {
    id: 'drop-miramar-2',
    approxLat: 15.4832,
    approxLng: 73.8085,
    mediaType: 'image',
    thumbnailLabel: 'IMG',
    title: 'Promenade steps',
    summary: 'Nearby Miramar image for clustering.',
  },
  {
    id: 'drop-donapaula-1',
    approxLat: 15.46,
    approxLng: 73.81,
    mediaType: 'image',
    thumbnailLabel: 'IMG',
    title: 'Viewpoint alone',
    summary: 'Isolated Drop that should remain unclustered when zoomed out moderately.',
  },
  {
    id: 'drop-oldgoa-1',
    approxLat: 15.503,
    approxLng: 73.912,
    mediaType: 'video',
    thumbnailLabel: 'VID',
    missionId: 'mission-heritage',
    missionTitle: 'Heritage Trail',
    title: 'Basilica approach',
    summary: 'Farther east — separate cluster cell.',
  },
  {
    id: 'drop-oldgoa-2',
    approxLat: 15.5045,
    approxLng: 73.9135,
    mediaType: 'image',
    thumbnailLabel: 'IMG',
    missionId: 'mission-heritage',
    missionTitle: 'Heritage Trail',
    title: 'Arch detail',
    summary: 'Pairs with the nearby heritage video Drop.',
  },
]);

/**
 * @param {string} dropId
 * @param {readonly ProbeDrop[]} [drops=SYNTHETIC_DROPS]
 * @returns {ProbeDrop | undefined}
 */
export function findProbeDrop(dropId, drops = SYNTHETIC_DROPS) {
  return drops.find((drop) => drop.id === dropId);
}
