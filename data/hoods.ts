import type { Hood, HoodId } from '../store/types';

/**
 * Hoods are the local / interest communities of the Arena (spec §14).
 * Phase 2 adds the full discovery screen; Phase 1 only needs the feed selector.
 */
export const HOODS: readonly Hood[] = [
  {
    id: 'techtakes',
    name: 'TechTakes',
    tagline: 'Phones, chips and firmware wars',
    members: 48_200,
    liveClashes: 64,
  },
  {
    id: 'campushustle',
    name: 'CampusHustle',
    tagline: 'Degrees, internships, side income',
    members: 31_700,
    liveClashes: 41,
  },
  {
    id: 'goatalk',
    name: 'GoaTalk',
    tagline: 'Coast, traffic and monsoon opinions',
    members: 12_400,
    liveClashes: 27,
  },
  {
    id: 'movies',
    name: 'Movies',
    tagline: 'Trailers, sequels and spoiler fights',
    members: 55_900,
    liveClashes: 58,
  },
  {
    id: 'gaming',
    name: 'Gaming',
    tagline: 'Ranked, remakes and refunds',
    members: 62_300,
    liveClashes: 73,
  },
  {
    id: 'startups',
    name: 'Startups',
    tagline: 'Founders arguing about founders',
    members: 22_800,
    liveClashes: 35,
  },
  {
    id: 'football',
    name: 'FootballHotTakes',
    tagline: 'Ninety minutes of disagreement',
    members: 76_500,
    liveClashes: 88,
  },
];

export const HOOD_LABEL: Record<HoodId, string> = {
  'for-you': 'For You',
  techtakes: 'TechTakes',
  campushustle: 'CampusHustle',
  goatalk: 'GoaTalk',
  movies: 'Movies',
  gaming: 'Gaming',
  startups: 'Startups',
  football: 'FootballHotTakes',
};

/**
 * Selector order — the reference "Arena Home" leads with For You and the three
 * flagship hoods. The remaining hoods stay one swipe away.
 */
export const FEED_SCOPES: readonly HoodId[] = [
  'for-you',
  'techtakes',
  'campushustle',
  'startups',
  ...HOODS.map((hood) => hood.id).filter(
    (id) => id !== 'techtakes' && id !== 'campushustle' && id !== 'startups',
  ),
];

export function hoodById(id: HoodId): Hood | undefined {
  return HOODS.find((hood) => hood.id === id);
}

/** Real hoods only — the set a Take can actually be dropped into (no feed scope). */
export const HOOD_IDS: readonly Exclude<HoodId, 'for-you'>[] = HOODS.map((hood) => hood.id);

/**
 * The database stores real hoods only, so a viewer whose home hood is the For You
 * feed still needs a concrete hood to publish into.
 */
export function toDbHood(hood: HoodId): Exclude<HoodId, 'for-you'> {
  if (hood !== 'for-you') return hood;
  const [fallback] = HOODS;
  return fallback ? fallback.id : 'techtakes';
}
