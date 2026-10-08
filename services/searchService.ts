/**
 * Explore search + discovery. Search is bounded and typed: `ilike`-based people /
 * takes over the live Arena, and Hoods over the fixed catalogue. Discovery is
 * honest — "Active people" are real profiles ranked by reputation, "Popular
 * takes" are the live Takes by real heat. No fake personalisation.
 */

import type { Hood, HoodId, Take, User } from '../store/types';
import { toTake, toUser, PUBLIC_PROFILE_FIELDS } from './arenaMappers';
import { HOODS } from '../data/hoods';
import { requestError, requireSupabase } from './supabaseClient';

/** The trimmed search needle. */
export type SearchQuery = string;

export interface SearchResults {
  people: readonly User[];
  hoods: readonly Hood[];
  takes: readonly Take[];
}

/** Escape `%`, `_` and `\` so `ilike` reads the needle as a literal substring. */
function literalLike(needle: string): string {
  const escaped = needle.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

/** People whose handle or name matches, most reputable first (bounded). */
export async function searchPeople(query: string, limit = 12): Promise<User[]> {
  const like = literalLike(query.trim());
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select(PUBLIC_PROFILE_FIELDS)
    .or(`handle.ilike.${like},name.ilike.${like}`)
    .order('reputation', { ascending: false })
    .limit(limit);
  if (error) throw requestError(error);
  return data.map(toUser);
}

/** Hoods whose name, tagline or description matches (fixed catalogue, on-device). */
export function searchHoods(query: string): Hood[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  const matches = (text: string): boolean => text.toLowerCase().includes(needle);
  return HOODS.filter((hood) => matches(hood.name) || matches(hood.tagline) || matches(hood.description));
}

/** Live Takes whose text matches, hottest first (bounded). */
export async function searchTakes(query: string, limit = 12): Promise<Take[]> {
  const like = literalLike(query.trim());
  const { data, error } = await requireSupabase()
    .from('takes')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .ilike('text', like)
    .order('heat', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw requestError(error);
  return data.map(toTake);
}

/** One combined search across people, hoods and takes. */
export async function searchAll(query: string): Promise<SearchResults> {
  const [people, takes] = await Promise.all([searchPeople(query), searchTakes(query)]);
  return { people, hoods: searchHoods(query), takes };
}

/** Real profiles ranked by reputation — an honest "active people" shelf. */
export async function fetchActivePeople(limit = 8): Promise<User[]> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select(PUBLIC_PROFILE_FIELDS)
    .order('reputation', { ascending: false })
    .order('handle', { ascending: true })
    .limit(limit);
  if (error) throw requestError(error);
  return data.map(toUser);
}

/** Live Takes by real heat (clashes + reactions) — a compact "popular" shelf. */
export async function fetchPopularTakes(limit = 8): Promise<Take[]> {
  const { data, error } = await requireSupabase()
    .from('takes')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('heat', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw requestError(error);
  return data.map(toTake);
}
