/**
 * World discovery projections over EXISTING server data.
 *
 * Ordering always comes from `get_explore_world_summary` (activity desc, with the
 * server's privacy floor already applied). Nothing here re-ranks countries or
 * invents engagement numbers — this file only trims, labels, and filters.
 */

import type {
  ExploreChallenge,
  ExploreCountrySummary,
  ExploreTreasure,
} from '../services/exploreService';
import { countryByCode } from '../data/exploreCountries.ts';

/** Mirrors the SQL privacy floor: aggregates below this are never surfaced. */
export const WORLD_ACTIVITY_FLOOR = 3;

/** How many activity-ordered countries the discovery rail shows. */
export const WORLD_ACTIVITY_LIMIT = 8;

export interface WorldCountryActivity {
  code: string;
  name: string;
  activityCount: number | null;
  hasChallenge: boolean;
  hasTreasure: boolean;
}

export interface WorldCountryContent {
  challenges: ExploreChallenge[];
  treasures: ExploreTreasure[];
}

/** Server-ordered countries that actually have eligible engagement. */
export function worldActivityCountries(
  countries: readonly ExploreCountrySummary[] | null | undefined,
  limit = WORLD_ACTIVITY_LIMIT,
): WorldCountryActivity[] {
  if (!countries) return [];
  return countries.slice(0, Math.max(0, limit)).map((country) => ({
    code: country.countryCode,
    name: country.name || countryByCode(country.countryCode)?.name || country.countryCode,
    activityCount: country.activityCount,
    hasChallenge: country.hasChallenge,
    hasTreasure: country.hasTreasure,
  }));
}

/**
 * Surprise me — picks from the server's activity order, avoiding the country
 * already open. No new ranking and no new RPC: the pool is what the summary
 * returned, only the starting point is randomised.
 */
export function surpriseCountry<T extends { code: string }>(
  pool: readonly T[],
  selectedCode: string | null,
  random: () => number = Math.random,
): T | null {
  if (pool.length === 0) return null;
  const fresh = pool.filter((country) => country.code !== selectedCode);
  const candidates = fresh.length > 0 ? fresh : pool;
  const index = Math.min(
    candidates.length - 1,
    Math.max(0, Math.floor(random() * candidates.length)),
  );
  return candidates[index] ?? null;
}

/**
 * Plain-language activity line. A hidden aggregate reads as "quiet" rather than
 * as a guess, so a country is never described with numbers the server withheld.
 */
export function worldActivityLabel(
  activityCount: number | null | undefined,
): string {
  if (activityCount == null || activityCount < WORLD_ACTIVITY_FLOOR) {
    return 'Quiet right now';
  }
  return `${activityCount.toLocaleString()} public profiles`;
}

/** Country-scoped challenges and treasure hunts from the world summary. */
export function worldCountryContent(
  challenges: readonly ExploreChallenge[] | null | undefined,
  treasures: readonly ExploreTreasure[] | null | undefined,
  code: string | null | undefined,
): WorldCountryContent {
  const target = (code ?? '').toUpperCase();
  if (!target) return { challenges: [], treasures: [] };
  return {
    challenges: (challenges ?? []).filter(
      (challenge) => (challenge.countryCode ?? '').toUpperCase() === target,
    ),
    treasures: (treasures ?? []).filter(
      (treasure) => (treasure.countryCode ?? '').toUpperCase() === target,
    ),
  };
}

export function worldContentCount(content: WorldCountryContent): number {
  return content.challenges.length + content.treasures.length;
}

/**
 * Active countries first (in server order), then the untouched catalogue order.
 * Used by the country sheet so real engagement leads without a second ranking.
 */
export function orderCountriesByEngagement<T extends { code: string }>(
  items: readonly T[],
  activeCodes: readonly string[],
): T[] {
  const byCode = new Map<string, T>();
  for (const item of items) byCode.set(item.code.toUpperCase(), item);

  const placed = new Set<string>();
  const ordered: T[] = [];
  for (const code of activeCodes) {
    const key = code.toUpperCase();
    const match = byCode.get(key);
    if (!match || placed.has(key)) continue;
    placed.add(key);
    ordered.push(match);
  }
  for (const item of items) {
    const key = item.code.toUpperCase();
    if (placed.has(key)) continue;
    placed.add(key);
    ordered.push(item);
  }
  return ordered;
}
