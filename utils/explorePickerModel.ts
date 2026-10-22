/**
 * Explore E2.8 — country picker model (D5).
 *
 * The sheet kept its previous `query` after closing, so reopening it showed a
 * filtered list instead of the full catalogue. Visibility is part of the model
 * here: a hidden sheet forgets the search, which also resets the filtered
 * results because they are derived from the query.
 *
 * Countries with real eligible engagement lead (server order), then the curated
 * catalogue order. Search always spans every country, so a quiet place is still
 * one tap away.
 */
import {
  EXPLORE_COUNTRIES,
  searchCountries,
  type ExploreCountry,
} from '../data/exploreCountries.ts';
import {
  orderCountriesByEngagement,
  type WorldCountryActivity,
} from './exploreWorldModel.ts';

/** Rows the list may render at once — the full curated catalogue fits. */
export const PICKER_MAX_RESULTS = 60;

/** Countries surfaced in "Happening now". */
export const PICKER_MAX_ACTIVE = 6;

/** Depth of the search pool before engagement ordering is applied. */
const SEARCH_POOL = 60;

export interface ExplorePickerSections {
  searching: boolean;
  recent: readonly ExploreCountry[];
  activeList: readonly WorldCountryActivity[];
  results: readonly ExploreCountry[];
}

export interface ExplorePickerInput {
  query: string;
  recentCodes?: readonly string[];
  active?: readonly WorldCountryActivity[];
}

/** Whitespace alone is not a search. */
export function pickerSearching(query: string): boolean {
  return query.trim().length > 0;
}

/** D5 — a closed sheet always reopens with an empty search. */
export function pickerQueryAfterVisibility(query: string, visible: boolean): string {
  return visible ? query : '';
}

/** Recent + Happening now + the country list, all derived from one query. */
export function pickerSections({
  query,
  recentCodes = [],
  active = [],
}: ExplorePickerInput): ExplorePickerSections {
  const searching = pickerSearching(query);
  const activeList = active.slice(0, PICKER_MAX_ACTIVE);
  const counts = new Set(activeList.map((country) => country.code));
  const found = searchCountries(query, SEARCH_POOL);
  const pool = searching ? found : found.filter((country) => !counts.has(country.code));
  const results = orderCountriesByEngagement(
    pool,
    activeList.map((country) => country.code),
  ).slice(0, PICKER_MAX_RESULTS);

  const recent = recentCodes
    .map((code) => EXPLORE_COUNTRIES.find((country) => country.code === code))
    .filter((country): country is ExploreCountry => Boolean(country));

  return { searching, recent, activeList, results };
}
