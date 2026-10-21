/**
 * Explore For You shelves — projections over EXISTING server rankings.
 *
 * No parallel ranking lives here: Arena trending comes from
 * `list_arena_trending_battles`, Vault cards from `list_explore_vault_previews`,
 * and Live cards from the already-fetched `get_explore_live` feed.
 */

import type { ArenaTrendingBattle } from '../services/arenaTrendService';
import type { ExploreLiveFeed, ExploreVaultPreview } from '../services/exploreService';
import { formatRankDelta } from './arenaTrendRank.ts';

export type ExploreShelfKind = 'CLASH' | 'VAULT' | 'LIVE' | 'TAKE';

export interface ExploreShelfItem {
  id: string;
  kind: ExploreShelfKind;
  title: string;
  subtitle: string | null;
  meta: string | null;
  mediaUrl: string | null;
  href: string;
}

/** A lone card reads as a layout bug, so shelves only render at two or more. */
export const EXPLORE_SHELF_MIN_ITEMS = 2;

export function shelfIsVisible(items: readonly ExploreShelfItem[]): boolean {
  return items.length >= EXPLORE_SHELF_MIN_ITEMS;
}

export function arenaTopicHref(topicId: string): string {
  return `/arena/topic/${encodeURIComponent(topicId)}`;
}

export function vaultDropHref(dropId: string): string {
  return `/vault/drop/${encodeURIComponent(dropId)}`;
}

function metaLine(parts: readonly (string | null)[]): string | null {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join(' · ') : null;
}

/** Rank race → For You card. Tap-through stays on the canonical topic route. */
export function trendingShelfItems(
  battles: readonly ArenaTrendingBattle[],
  max = 6,
): ExploreShelfItem[] {
  const seen = new Set<string>();
  const out: ExploreShelfItem[] = [];
  for (const battle of battles) {
    if (!battle.topicId || seen.has(battle.topicId)) continue;
    seen.add(battle.topicId);
    const delta = formatRankDelta(battle.rankDeltaKind, battle.rankDelta);
    out.push({
      id: battle.topicId,
      kind: 'CLASH',
      title: battle.title,
      subtitle: battle.hood,
      meta: metaLine([
        `#${battle.rank}`,
        delta === '—' ? null : delta,
        battle.participantCount > 0 ? `${battle.participantCount} joined` : null,
      ]),
      mediaUrl: null,
      href: arenaTopicHref(battle.topicId),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** FREE + PREVIEW only — the service already dropped anything else. */
export function vaultShelfItems(
  previews: readonly ExploreVaultPreview[],
  max = 8,
): ExploreShelfItem[] {
  const seen = new Set<string>();
  const out: ExploreShelfItem[] = [];
  for (const preview of previews) {
    if (!preview.dropId || seen.has(preview.dropId)) continue;
    seen.add(preview.dropId);
    out.push({
      id: preview.dropId,
      kind: 'VAULT',
      title: preview.title,
      subtitle: preview.authorHandle
        ? `@${preview.authorHandle}`
        : preview.authorName || null,
      meta: preview.accessLevel === 'preview' ? 'PREVIEW' : 'FREE',
      mediaUrl: preview.mediaUrl,
      href: vaultDropHref(preview.dropId),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Live topics first, then hot takes — same feed the Live mode renders. */
export function liveShelfItems(
  feed: ExploreLiveFeed | null,
  max = 8,
): ExploreShelfItem[] {
  if (!feed) return [];
  const seen = new Set<string>();
  const out: ExploreShelfItem[] = [];
  for (const topic of feed.topics) {
    if (!topic.id || seen.has(`LIVE:${topic.id}`)) continue;
    seen.add(`LIVE:${topic.id}`);
    out.push({
      id: topic.id,
      kind: 'LIVE',
      title: topic.title,
      subtitle: topic.hood,
      meta: null,
      mediaUrl: null,
      href: topic.href,
    });
    if (out.length >= max) return out;
  }
  for (const take of feed.takes) {
    if (!take.id || seen.has(`TAKE:${take.id}`)) continue;
    seen.add(`TAKE:${take.id}`);
    out.push({
      id: take.id,
      kind: 'TAKE',
      title: take.title,
      subtitle: take.subtitle,
      meta: take.heat > 0 ? `Heat ${take.heat}` : null,
      mediaUrl: take.mediaUrl,
      href: take.href,
    });
    if (out.length >= max) break;
  }
  return out;
}
