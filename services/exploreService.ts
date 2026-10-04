/**
 * Explore discovery — globe/country/viral/teleport/search.
 * Country geography uses profiles.public_country_code only (explicit, public).
 * Vault shelf is FREE + PREVIEW (intentional public teaser) only — never subscriber source paths.
 */
import { countryByCode } from '../data/exploreCountries';
import {
  isExploreVaultVisible,
  normalizeExploreVaultAccess,
} from '../utils/exploreVaultVisibility';
import { getPublicMediaUrl } from './mediaService';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';

function publicVaultMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  try {
    return getPublicMediaUrl('public-media', path);
  } catch {
    return null;
  }
}

function client() {
  return requireSupabase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function millis(value: unknown): number | null {
  if (typeof value === 'string') {
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface ExploreCountrySummary {
  countryCode: string;
  name: string;
  activityCount: number | null;
  hasChallenge: boolean;
  hasTreasure: boolean;
  lat: number;
  lng: number;
}

export interface ExploreChallenge {
  id: string;
  title: string;
  description: string | null;
  challengeType: 'GLOBAL' | 'COUNTRY' | 'CREATOR';
  countryCode: string | null;
  status: string;
  entryCount: number;
  endsAt: number;
  coverUrl: string | null;
}

export interface ExploreTreasure {
  id: string;
  title: string;
  description: string | null;
  countryCode: string | null;
  status: string;
  clue: string;
  giftsRemaining: number | null;
  endsAt: number;
  rewardType: string;
  coverUrl: string | null;
}

export interface ExploreWorldSummary {
  countries: ExploreCountrySummary[];
  liveTopicCount: number;
  challenges: ExploreChallenge[];
  treasures: ExploreTreasure[];
  generatedAt: number;
}

export type ExploreViralKind =
  | 'LIVE_ARENA'
  | 'TAKE'
  | 'VAULT_PREVIEW'
  | 'CHALLENGE'
  | 'CLASH';

export interface ExploreViralItem {
  kind: ExploreViralKind;
  id: string;
  title: string;
  subtitle: string | null;
  score: number;
  countryCode: string | null;
  href: string | null;
  mediaUrl?: string | null;
  accessLevel?: 'free' | 'preview' | null;
}

export interface ExploreTeleportCandidate {
  kind: ExploreViralKind;
  id: string;
  title: string;
  countryCode: string | null;
  href: string | null;
  mediaUrl?: string | null;
  accessLevel?: 'free' | 'preview' | null;
}

export interface ExploreVaultPreview {
  dropId: string;
  vaultId: string;
  creatorId: string;
  title: string;
  accessLevel: 'free' | 'preview';
  publicMediaPath: string | null;
  mediaUrl: string | null;
  mediaKind: string | null;
  authorHandle: string;
  authorName: string;
  authorTint: string;
  countryCode?: string | null;
}

export interface ExploreCountryPage {
  countryCode: string;
  name: string;
  activityCount: number | null;
  creators: {
    id: string;
    handle: string;
    name: string;
    avatarTint: string;
    homeHood: string | null;
    rank: string;
  }[];
  takes: {
    id: string;
    text: string;
    heat: number;
    authorId: string;
    authorHandle: string;
    authorName: string;
    mediaUrl: string | null;
    mediaKind: string | null;
    createdAt: number;
  }[];
  vaultPreviews: ExploreVaultPreview[];
  challenges: ExploreChallenge[];
  treasures: ExploreTreasure[];
  liveTopics: {
    id: string;
    title: string;
    hood: string | null;
    status: string;
    closesAt: number;
  }[];
}

export interface ExploreSearchResults {
  countries: { countryCode: string; name: string }[];
  people: {
    id: string;
    handle: string;
    name: string;
    avatarTint: string;
    countryCode: string | null;
  }[];
  takes: {
    id: string;
    text: string;
    heat: number;
    authorHandle: string;
    mediaUrl: string | null;
  }[];
  topics: { id: string; title: string; status: string }[];
  vault: {
    dropId: string;
    title: string;
    creatorHandle: string;
    accessLevel: 'free' | 'preview';
    mediaUrl: string | null;
  }[];
  hoods: { hood: string; label: string }[];
}

export interface ExploreForYouItem {
  kind: ExploreViralKind;
  id: string;
  title: string;
  subtitle: string | null;
  creatorId: string | null;
  countryCode: string | null;
  mediaUrl: string | null;
  href: string | null;
  score: number;
  accessLevel?: 'free' | 'preview' | null;
}

export interface ExploreForYouPage {
  items: ExploreForYouItem[];
  nextCursor: number | null;
}

export interface ExploreLiveFeed {
  topics: {
    id: string;
    title: string;
    hood: string | null;
    status: string;
    closesAt: number;
    href: string;
  }[];
  takes: {
    id: string;
    title: string;
    subtitle: string | null;
    heat: number;
    mediaUrl: string | null;
    creatorId: string | null;
    countryCode: string | null;
    href: string;
  }[];
}

function toChallenge(raw: unknown): ExploreChallenge | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = str(r.id);
  const title = str(r.title);
  const endsAt = millis(r.endsAt);
  if (!id || !title || endsAt == null) return null;
  const type = str(r.challengeType);
  return {
    id,
    title,
    description: str(r.description),
    challengeType:
      type === 'COUNTRY' || type === 'CREATOR' || type === 'GLOBAL' ? type : 'GLOBAL',
    countryCode: str(r.countryCode),
    status: str(r.status) ?? 'active',
    entryCount: num(r.entryCount) ?? 0,
    endsAt,
    coverUrl: str(r.coverUrl),
  };
}

function toTreasure(raw: unknown): ExploreTreasure | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = str(r.id);
  const title = str(r.title);
  const clue = str(r.clue);
  const endsAt = millis(r.endsAt);
  if (!id || !title || !clue || endsAt == null) return null;
  return {
    id,
    title,
    description: str(r.description),
    countryCode: str(r.countryCode),
    status: str(r.status) ?? 'active',
    clue,
    giftsRemaining: r.giftsRemaining === null ? null : (num(r.giftsRemaining) ?? 0),
    endsAt,
    rewardType: str(r.rewardType) ?? 'badge',
    coverUrl: str(r.coverUrl),
  };
}

function toVaultPreview(raw: unknown): ExploreVaultPreview | null {
  const r = asRecord(raw);
  if (!r) return null;
  const dropId = str(r.dropId);
  if (!dropId) return null;
  const access = normalizeExploreVaultAccess(str(r.accessLevel));
  const publicMediaPath = str(r.publicMediaPath);
  if (!access || !isExploreVaultVisible({ accessLevel: access, publicMediaPath })) return null;
  return {
    dropId,
    vaultId: str(r.vaultId) ?? '',
    creatorId: str(r.creatorId) ?? '',
    title: str(r.title) ?? 'Preview',
    accessLevel: access === 'preview' ? 'preview' : 'free',
    publicMediaPath,
    mediaUrl: publicVaultMediaUrl(publicMediaPath),
    mediaKind: str(r.mediaKind),
    authorHandle: str(r.authorHandle) ?? str(r.creatorHandle) ?? '',
    authorName: str(r.authorName) ?? str(r.creatorName) ?? '',
    authorTint: str(r.authorTint) ?? '#A1A1AA',
    countryCode: str(r.countryCode),
  };
}

export async function fetchExploreWorldSummary(): Promise<ExploreWorldSummary> {
  const { data, error } = await client().rpc('get_explore_world_summary');
  if (error) throw requestError(error);
  const record = asRecord(data);
  if (!record) throw new SupabaseError('explore world unavailable', 'bad_payload');
  const countriesRaw = Array.isArray(record.countries) ? record.countries : [];
  const countries: ExploreCountrySummary[] = [];
  for (const item of countriesRaw) {
    const r = asRecord(item);
    if (!r) continue;
    const code = str(r.countryCode);
    const meta = countryByCode(code);
    if (!code || !meta) continue;
    countries.push({
      countryCode: code,
      name: meta.name,
      activityCount: num(r.activityCount),
      hasChallenge: bool(r.hasChallenge),
      hasTreasure: bool(r.hasTreasure),
      lat: meta.lat,
      lng: meta.lng,
    });
  }
  return {
    countries,
    liveTopicCount: num(record.liveTopicCount) ?? 0,
    challenges: (Array.isArray(record.challenges) ? record.challenges : [])
      .map(toChallenge)
      .filter((x): x is ExploreChallenge => Boolean(x)),
    treasures: (Array.isArray(record.treasures) ? record.treasures : [])
      .map(toTreasure)
      .filter((x): x is ExploreTreasure => Boolean(x)),
    generatedAt: millis(record.generatedAt) ?? Date.now(),
  };
}

export async function fetchExploreCountry(countryCode: string): Promise<ExploreCountryPage> {
  const { data, error } = await client().rpc('get_explore_country', {
    p_country_code: countryCode.toUpperCase(),
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  if (!record) throw new SupabaseError('explore country unavailable', 'bad_payload');
  const code = str(record.countryCode) ?? countryCode.toUpperCase();
  const meta = countryByCode(code);

  const creators = (Array.isArray(record.creators) ? record.creators : [])
    .map((item) => {
      const r = asRecord(item);
      if (!r) return null;
      const id = str(r.id);
      const handle = str(r.handle);
      if (!id || !handle) return null;
      return {
        id,
        handle,
        name: str(r.name) ?? handle,
        avatarTint: str(r.avatarTint) ?? '#A1A1AA',
        homeHood: str(r.homeHood),
        rank: str(r.rank) ?? 'Rookie',
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const takes = (Array.isArray(record.takes) ? record.takes : [])
    .map((item) => {
      const r = asRecord(item);
      if (!r) return null;
      const id = str(r.id);
      if (!id) return null;
      return {
        id,
        text: str(r.text) ?? '',
        heat: num(r.heat) ?? 0,
        authorId: str(r.authorId) ?? '',
        authorHandle: str(r.authorHandle) ?? '',
        authorName: str(r.authorName) ?? '',
        mediaUrl: str(r.mediaUrl),
        mediaKind: str(r.mediaKind),
        createdAt: millis(r.createdAt) ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const vaultPreviews = (Array.isArray(record.vaultPreviews) ? record.vaultPreviews : [])
    .map(toVaultPreview)
    .filter((x): x is ExploreVaultPreview => Boolean(x));

  const liveTopics = (Array.isArray(record.liveTopics) ? record.liveTopics : [])
    .map((item) => {
      const r = asRecord(item);
      if (!r) return null;
      const id = str(r.id);
      const title = str(r.title);
      if (!id || !title) return null;
      return {
        id,
        title,
        hood: str(r.hood),
        status: str(r.status) ?? 'live',
        closesAt: millis(r.closesAt) ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return {
    countryCode: code,
    name: meta?.name ?? code,
    activityCount: num(record.activityCount),
    creators,
    takes,
    vaultPreviews,
    challenges: (Array.isArray(record.challenges) ? record.challenges : [])
      .map(toChallenge)
      .filter((x): x is ExploreChallenge => Boolean(x)),
    treasures: (Array.isArray(record.treasures) ? record.treasures : [])
      .map(toTreasure)
      .filter((x): x is ExploreTreasure => Boolean(x)),
    liveTopics,
  };
}

export async function fetchGlobalViral(limit = 12): Promise<ExploreViralItem[]> {
  const { data, error } = await client().rpc('get_global_viral', { p_limit: limit });
  if (error) throw requestError(error);
  const record = asRecord(data);
  const items = Array.isArray(record?.items) ? record.items : [];
  const out: ExploreViralItem[] = [];
  for (const item of items) {
    const r = asRecord(item);
    if (!r) continue;
    const kind = str(r.kind) as ExploreViralKind | null;
    const id = str(r.id);
    const title = str(r.title);
    if (!kind || !id || !title) continue;
    const access = normalizeExploreVaultAccess(str(r.accessLevel));
    if (kind === 'VAULT_PREVIEW') {
      const path = str(r.publicMediaPath);
      if (!isExploreVaultVisible({ accessLevel: access, publicMediaPath: path })) continue;
    }
    out.push({
      kind,
      id,
      title,
      subtitle: str(r.subtitle),
      score: num(r.score) ?? 0,
      countryCode: str(r.countryCode),
      href: str(r.href),
      mediaUrl: str(r.mediaUrl) ?? publicVaultMediaUrl(str(r.publicMediaPath)),
      accessLevel: access === 'free' || access === 'preview' ? access : null,
    });
  }
  return out;
}

export async function fetchExploreVaultPreviews(limit = 12): Promise<ExploreVaultPreview[]> {
  const { data, error } = await client().rpc('list_explore_vault_previews', { p_limit: limit });
  if (error) throw requestError(error);
  return (Array.isArray(data) ? data : [])
    .map(toVaultPreview)
    .filter((x): x is ExploreVaultPreview => Boolean(x));
}

function toForYouItem(raw: unknown): ExploreForYouItem | null {
  const r = asRecord(raw);
  if (!r) return null;
  const kind = str(r.kind) as ExploreViralKind | null;
  const id = str(r.id);
  const title = str(r.title);
  if (!kind || !id || !title) return null;
  const access = normalizeExploreVaultAccess(str(r.accessLevel));
  if (kind === 'VAULT_PREVIEW') {
    const path = str(r.publicMediaPath);
    if (!isExploreVaultVisible({ accessLevel: access, publicMediaPath: path })) return null;
  }
  return {
    kind,
    id,
    title,
    subtitle: str(r.subtitle),
    creatorId: str(r.creatorId),
    countryCode: str(r.countryCode),
    mediaUrl: str(r.mediaUrl) ?? publicVaultMediaUrl(str(r.publicMediaPath)),
    href: str(r.href),
    score: num(r.score) ?? 0,
    accessLevel: access === 'free' || access === 'preview' ? access : null,
  };
}

export async function fetchExploreForYou(
  limit = 24,
  cursor = 0,
): Promise<ExploreForYouPage> {
  const { data, error } = await client().rpc('get_explore_for_you', {
    p_limit: limit,
    p_cursor: cursor,
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  const items = (Array.isArray(record?.items) ? record.items : [])
    .map(toForYouItem)
    .filter((x): x is ExploreForYouItem => Boolean(x));
  return {
    items,
    nextCursor: num(record?.nextCursor),
  };
}

export async function fetchExploreLive(limit = 24): Promise<ExploreLiveFeed> {
  const { data, error } = await client().rpc('get_explore_live', { p_limit: limit });
  if (error) throw requestError(error);
  const record = asRecord(data);
  return {
    topics: (Array.isArray(record?.topics) ? record.topics : [])
      .map((item) => {
        const r = asRecord(item);
        const id = str(r?.id);
        const title = str(r?.title);
        if (!id || !title) return null;
        return {
          id,
          title,
          hood: str(r?.hood),
          status: str(r?.status) ?? 'live',
          closesAt: millis(r?.closesAt) ?? 0,
          href: str(r?.href) ?? `/arena/topic/${id}`,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
    takes: (Array.isArray(record?.takes) ? record.takes : [])
      .map((item) => {
        const r = asRecord(item);
        const id = str(r?.id);
        const title = str(r?.title);
        if (!id || !title) return null;
        return {
          id,
          title,
          subtitle: str(r?.subtitle),
          heat: num(r?.heat) ?? 0,
          mediaUrl: str(r?.mediaUrl),
          creatorId: str(r?.creatorId),
          countryCode: str(r?.countryCode),
          href: str(r?.href) ?? `/take/${id}`,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
  };
}

export async function fetchTeleportCandidate(
  excludeIds: readonly string[] = [],
): Promise<ExploreTeleportCandidate | null> {
  const { data, error } = await client().rpc('get_teleport_candidate', {
    p_exclude_ids: [...excludeIds],
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  const candidate = asRecord(record?.candidate);
  if (!candidate) return null;
  const kind = str(candidate.kind) as ExploreViralKind | null;
  const id = str(candidate.id);
  const title = str(candidate.title);
  if (!kind || !id || !title) return null;
  const access = normalizeExploreVaultAccess(str(candidate.accessLevel));
  if (kind === 'VAULT_PREVIEW') {
    const path = str(candidate.publicMediaPath);
    if (!isExploreVaultVisible({ accessLevel: access, publicMediaPath: path })) return null;
  }
  return {
    kind,
    id,
    title,
    countryCode: str(candidate.countryCode),
    href: str(candidate.href),
    mediaUrl: str(candidate.mediaUrl) ?? publicVaultMediaUrl(str(candidate.publicMediaPath)),
    accessLevel: access === 'free' || access === 'preview' ? access : null,
  };
}

export async function searchExplore(query: string, limit = 20): Promise<ExploreSearchResults> {
  const { data, error } = await client().rpc('search_explore', {
    p_query: query,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  const empty: ExploreSearchResults = {
    countries: [],
    people: [],
    takes: [],
    topics: [],
    vault: [],
    hoods: [],
  };
  if (!record) return empty;

  return {
    countries: (Array.isArray(record.countries) ? record.countries : [])
      .map((item) => {
        const r = asRecord(item);
        const countryCode = str(r?.countryCode);
        const name = str(r?.name);
        return countryCode && name ? { countryCode, name } : null;
      })
      .filter((x): x is { countryCode: string; name: string } => Boolean(x)),
    people: (Array.isArray(record.people) ? record.people : [])
      .map((item) => {
        const r = asRecord(item);
        const id = str(r?.id);
        const handle = str(r?.handle);
        if (!id || !handle) return null;
        return {
          id,
          handle,
          name: str(r?.name) ?? handle,
          avatarTint: str(r?.avatarTint) ?? '#A1A1AA',
          countryCode: str(r?.countryCode),
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
    takes: (Array.isArray(record.takes) ? record.takes : [])
      .map((item) => {
        const r = asRecord(item);
        const id = str(r?.id);
        if (!id) return null;
        return {
          id,
          text: str(r?.text) ?? '',
          heat: num(r?.heat) ?? 0,
          authorHandle: str(r?.authorHandle) ?? '',
          mediaUrl: str(r?.mediaUrl),
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
    topics: (Array.isArray(record.topics) ? record.topics : [])
      .map((item) => {
        const r = asRecord(item);
        const id = str(r?.id);
        const title = str(r?.title);
        if (!id || !title) return null;
        return { id, title, status: str(r?.status) ?? 'live' };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
    vault: (Array.isArray(record.vault) ? record.vault : [])
      .map((item) => {
        const preview = toVaultPreview(item);
        if (!preview) return null;
        return {
          dropId: preview.dropId,
          title: preview.title,
          creatorHandle: preview.authorHandle,
          accessLevel: preview.accessLevel,
          mediaUrl: preview.mediaUrl,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
    hoods: (Array.isArray(record.hoods) ? record.hoods : [])
      .map((item) => {
        const r = asRecord(item);
        const hood = str(r?.hood);
        if (!hood) return null;
        return { hood, label: str(r?.label) ?? hood };
      })
      .filter((x): x is { hood: string; label: string } => Boolean(x)),
  };
}

export {
  clearTeleportHistory,
  readTeleportHistory,
  rememberTeleportId,
} from '../utils/exploreTeleportHistory';
