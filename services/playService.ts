/**
 * Play — Challenges + Treasure Hunts.
 * Server RPCs are authoritative; answers/rewards never trusted from the client.
 */
import { getPublicMediaUrl } from './mediaService';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';

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

function mediaUrlFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  try {
    return getPublicMediaUrl('public-media', path);
  } catch {
    return null;
  }
}

export type PlayScope = 'GLOBAL' | 'COUNTRY' | 'CREATOR';

export interface PlayHost {
  id: string;
  handle: string;
  name: string;
  avatarTint: string;
}

export interface PlayChallengeCard {
  id: string;
  title: string;
  description: string | null;
  challengeType: PlayScope;
  countryCode: string | null;
  status: string;
  coverUrl: string | null;
  entryCount: number;
  endsAt: number;
  joined: boolean;
}

export interface PlayTreasureCard {
  id: string;
  title: string;
  description: string | null;
  huntType: PlayScope;
  countryCode: string | null;
  status: string;
  coverUrl: string | null;
  clue: string;
  clueCount: number;
  giftsRemaining: number | null;
  endsAt: number;
  rewardType: string;
  progress: number;
  completed: boolean;
}

export interface PlayHome {
  challenges: PlayChallengeCard[];
  treasures: PlayTreasureCard[];
  generatedAt: number;
}

export interface ChallengeDetail {
  id: string;
  title: string;
  description: string | null;
  challengeType: PlayScope;
  countryCode: string | null;
  status: string;
  coverUrl: string | null;
  entryCount: number;
  startsAt: number | null;
  endsAt: number;
  rewardType: string | null;
  host: PlayHost | null;
  joined: boolean;
  myEntryId: string | null;
  result: {
    winnerEntryId: string | null;
    winnerProfileId: string | null;
    settledAt: number | null;
    metrics: Record<string, unknown>;
  } | null;
}

export interface ChallengeEntry {
  id: string;
  challengeId: string;
  caption: string | null;
  reactionsCount: number;
  createdAt: number;
  mediaUrl: string | null;
  mediaKind: string | null;
  reacted: boolean;
  author: PlayHost;
}

export interface TreasureClue {
  id: string;
  sortOrder: number;
  clueType: 'TEXT_ANSWER' | 'CONTENT_FIND' | 'MULTIPLE_CHOICE';
  prompt: string;
  choices: string[];
  contentTargetKind: 'take' | 'vault_drop' | 'challenge' | 'creator' | null;
}

export interface TreasureDetail {
  id: string;
  title: string;
  description: string | null;
  huntType: PlayScope;
  countryCode: string | null;
  status: string;
  coverUrl: string | null;
  teaser: string;
  clueCount: number;
  giftsRemaining: number | null;
  endsAt: number;
  rewardType: string;
  rewardLabel: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
  joined: boolean;
  host: PlayHost | null;
  currentClue: TreasureClue | null;
}

export interface MyPlay {
  challenges: {
    id: string;
    title: string;
    status: string;
    coverUrl: string | null;
    endsAt: number;
    hasEntry: boolean;
    entryId: string | null;
    challengeType: PlayScope;
  }[];
  treasures: {
    id: string;
    title: string;
    status: string;
    coverUrl: string | null;
    progress: number;
    clueCount: number;
    completed: boolean;
    endsAt: number;
    huntType: PlayScope;
  }[];
  rewards: {
    huntId: string;
    rewardType: string;
    rewardMetadata: Record<string, unknown>;
    claimedAt: number;
    title: string;
    coverUrl: string | null;
  }[];
}

function toHost(value: unknown): PlayHost | null {
  const r = asRecord(value);
  if (!r) return null;
  const id = str(r.id);
  const handle = str(r.handle);
  if (!id || !handle) return null;
  return {
    id,
    handle,
    name: str(r.name) ?? handle,
    avatarTint: str(r.avatarTint) ?? '#888',
  };
}

function toScope(value: unknown, fallback: PlayScope = 'GLOBAL'): PlayScope {
  return value === 'COUNTRY' || value === 'CREATOR' || value === 'GLOBAL' ? value : fallback;
}

function toChallengeCard(value: unknown): PlayChallengeCard | null {
  const r = asRecord(value);
  if (!r) return null;
  const id = str(r.id);
  const title = str(r.title);
  const endsAt = millis(r.endsAt);
  if (!id || !title || endsAt == null) return null;
  return {
    id,
    title,
    description: str(r.description),
    challengeType: toScope(r.challengeType),
    countryCode: str(r.countryCode),
    status: str(r.status) ?? 'active',
    coverUrl: str(r.coverUrl),
    entryCount: num(r.entryCount) ?? 0,
    endsAt,
    joined: bool(r.joined),
  };
}

function toTreasureCard(value: unknown): PlayTreasureCard | null {
  const r = asRecord(value);
  if (!r) return null;
  const id = str(r.id);
  const title = str(r.title);
  const endsAt = millis(r.endsAt);
  if (!id || !title || endsAt == null) return null;
  return {
    id,
    title,
    description: str(r.description),
    huntType: toScope(r.huntType),
    countryCode: str(r.countryCode),
    status: str(r.status) ?? 'active',
    coverUrl: str(r.coverUrl),
    clue: str(r.clue) ?? '',
    clueCount: num(r.clueCount) ?? 0,
    giftsRemaining: r.giftsRemaining === null ? null : (num(r.giftsRemaining) ?? 0),
    endsAt,
    rewardType: str(r.rewardType) ?? 'badge',
    progress: num(r.progress) ?? 0,
    completed: bool(r.completed),
  };
}

function toClue(value: unknown): TreasureClue | null {
  const r = asRecord(value);
  if (!r) return null;
  const id = str(r.id);
  const prompt = str(r.prompt);
  const clueType = str(r.clueType);
  if (!id || !prompt) return null;
  if (
    clueType !== 'TEXT_ANSWER' &&
    clueType !== 'CONTENT_FIND' &&
    clueType !== 'MULTIPLE_CHOICE'
  ) {
    return null;
  }
  const choicesRaw = Array.isArray(r.choices) ? r.choices : [];
  const kind = str(r.contentTargetKind);
  return {
    id,
    sortOrder: num(r.sortOrder) ?? 1,
    clueType,
    prompt,
    choices: choicesRaw.filter((c): c is string => typeof c === 'string'),
    contentTargetKind:
      kind === 'take' || kind === 'vault_drop' || kind === 'challenge' || kind === 'creator'
        ? kind
        : null,
  };
}

export async function fetchPlayHome(): Promise<PlayHome> {
  const { data, error } = await client().rpc('list_play_home');
  if (error) throw requestError(error);
  const r = asRecord(data);
  if (!r) throw new SupabaseError('list_play_home bad payload', 'bad_payload');
  const challenges = Array.isArray(r.challenges)
    ? r.challenges.map(toChallengeCard).filter((x): x is PlayChallengeCard => x != null)
    : [];
  const treasures = Array.isArray(r.treasures)
    ? r.treasures.map(toTreasureCard).filter((x): x is PlayTreasureCard => x != null)
    : [];
  return {
    challenges,
    treasures,
    generatedAt: millis(r.generatedAt) ?? Date.now(),
  };
}

export async function fetchChallengeDetail(challengeId: string): Promise<ChallengeDetail> {
  const { data, error } = await client().rpc('get_challenge_detail', {
    p_challenge_id: challengeId,
  });
  if (error) throw requestError(error);
  const r = asRecord(data);
  if (!r) throw new SupabaseError('get_challenge_detail bad payload', 'bad_payload');
  const id = str(r.id);
  const title = str(r.title);
  const endsAt = millis(r.endsAt);
  if (!id || !title || endsAt == null) {
    throw new SupabaseError('get_challenge_detail incomplete', 'bad_payload');
  }
  const resultRaw = asRecord(r.result);
  return {
    id,
    title,
    description: str(r.description),
    challengeType: toScope(r.challengeType),
    countryCode: str(r.countryCode),
    status: str(r.status) ?? 'active',
    coverUrl: str(r.coverUrl),
    entryCount: num(r.entryCount) ?? 0,
    startsAt: millis(r.startsAt),
    endsAt,
    rewardType: str(r.rewardType),
    host: toHost(r.host),
    joined: bool(r.joined),
    myEntryId: str(r.myEntryId),
    result: resultRaw
      ? {
          winnerEntryId: str(resultRaw.winnerEntryId),
          winnerProfileId: str(resultRaw.winnerProfileId),
          settledAt: millis(resultRaw.settledAt),
          metrics: asRecord(resultRaw.metrics) ?? {},
        }
      : null,
  };
}

export async function listChallengeEntries(
  challengeId: string,
  sort: 'trending' | 'new' = 'trending',
  limit = 24,
  cursor = 0,
): Promise<{ items: ChallengeEntry[]; nextCursor: number | null }> {
  const { data, error } = await client().rpc('list_challenge_entries', {
    p_challenge_id: challengeId,
    p_sort: sort,
    p_limit: limit,
    p_cursor: cursor,
  });
  if (error) throw requestError(error);
  const r = asRecord(data);
  const itemsRaw = Array.isArray(r?.items) ? r!.items : [];
  const items: ChallengeEntry[] = [];
  for (const row of itemsRaw) {
    const e = asRecord(row);
    if (!e) continue;
    const id = str(e.id);
    const author = toHost(e.author);
    const createdAt = millis(e.createdAt);
    if (!id || !author || createdAt == null) continue;
    items.push({
      id,
      challengeId: str(e.challengeId) ?? challengeId,
      caption: str(e.caption),
      reactionsCount: num(e.reactionsCount) ?? 0,
      createdAt,
      mediaUrl: mediaUrlFromPath(str(e.mediaPath)),
      mediaKind: str(e.mediaKind),
      reacted: bool(e.reacted),
      author,
    });
  }
  return {
    items,
    nextCursor: num(r?.nextCursor) ?? null,
  };
}

export async function joinChallenge(challengeId: string): Promise<void> {
  const { error } = await client().rpc('join_challenge', { p_challenge_id: challengeId });
  if (error) throw requestError(error);
}

export async function submitChallengeEntry(
  challengeId: string,
  mediaObjectId: string,
  caption?: string | null,
): Promise<{ entryId: string }> {
  const { data, error } = await client().rpc('submit_challenge_entry', {
    p_challenge_id: challengeId,
    p_media_object_id: mediaObjectId,
    p_caption: caption ?? undefined,
  });
  if (error) throw requestError(error);
  const r = asRecord(data);
  const entryId = str(r?.entryId);
  if (!entryId) throw new SupabaseError('submit_challenge_entry bad payload', 'bad_payload');
  return { entryId };
}

export async function toggleChallengeEntryReaction(
  entryId: string,
): Promise<{ reacted: boolean; reactionsCount: number }> {
  const { data, error } = await client().rpc('toggle_challenge_entry_reaction', {
    p_entry_id: entryId,
  });
  if (error) throw requestError(error);
  const r = asRecord(data);
  return {
    reacted: bool(r?.reacted),
    reactionsCount: num(r?.reactionsCount) ?? 0,
  };
}

export async function fetchTreasureDetail(huntId: string): Promise<TreasureDetail> {
  const { data, error } = await client().rpc('get_treasure_detail', { p_hunt_id: huntId });
  if (error) throw requestError(error);
  const r = asRecord(data);
  if (!r) throw new SupabaseError('get_treasure_detail bad payload', 'bad_payload');
  const id = str(r.id);
  const title = str(r.title);
  const endsAt = millis(r.endsAt);
  if (!id || !title || endsAt == null) {
    throw new SupabaseError('get_treasure_detail incomplete', 'bad_payload');
  }
  return {
    id,
    title,
    description: str(r.description),
    huntType: toScope(r.huntType),
    countryCode: str(r.countryCode),
    status: str(r.status) ?? 'active',
    coverUrl: str(r.coverUrl),
    teaser: str(r.teaser) ?? '',
    clueCount: num(r.clueCount) ?? 0,
    giftsRemaining: r.giftsRemaining === null ? null : (num(r.giftsRemaining) ?? 0),
    endsAt,
    rewardType: str(r.rewardType) ?? 'badge',
    rewardLabel: str(r.rewardLabel) ?? 'Reward',
    progress: num(r.progress) ?? 0,
    completed: bool(r.completed),
    claimed: bool(r.claimed),
    joined: bool(r.joined),
    host: toHost(r.host),
    currentClue: toClue(r.currentClue),
  };
}

export async function joinTreasureHunt(huntId: string): Promise<void> {
  const { error } = await client().rpc('join_treasure_hunt', { p_hunt_id: huntId });
  if (error) throw requestError(error);
}

export async function submitTreasureAnswer(
  huntId: string,
  clueId: string,
  answer: string,
): Promise<{
  correct: boolean;
  progress: number;
  completed: boolean;
  nextClue: TreasureClue | null;
}> {
  const { data, error } = await client().rpc('submit_treasure_answer', {
    p_hunt_id: huntId,
    p_clue_id: clueId,
    p_answer: answer,
  });
  if (error) throw requestError(error);
  const r = asRecord(data);
  return {
    correct: bool(r?.correct),
    progress: num(r?.progress) ?? 0,
    completed: bool(r?.completed),
    nextClue: toClue(r?.nextClue),
  };
}

export async function completeContentClue(
  huntId: string,
  clueId: string,
  contentId: string,
): Promise<{
  correct: boolean;
  progress: number;
  completed: boolean;
  nextClue: TreasureClue | null;
}> {
  const { data, error } = await client().rpc('complete_content_clue', {
    p_hunt_id: huntId,
    p_clue_id: clueId,
    p_content_id: contentId,
  });
  if (error) throw requestError(error);
  const r = asRecord(data);
  return {
    correct: bool(r?.correct),
    progress: num(r?.progress) ?? 0,
    completed: bool(r?.completed),
    nextClue: toClue(r?.nextClue),
  };
}

export async function claimTreasureReward(huntId: string): Promise<{
  claimed: boolean;
  alreadyClaimed: boolean;
  rewardType: string | null;
  rewardMetadata: Record<string, unknown>;
  giftsRemaining: number | null;
}> {
  const { data, error } = await client().rpc('claim_treasure_reward', { p_hunt_id: huntId });
  if (error) throw requestError(error);
  const r = asRecord(data);
  return {
    claimed: bool(r?.claimed),
    alreadyClaimed: bool(r?.alreadyClaimed),
    rewardType: str(r?.rewardType),
    rewardMetadata: asRecord(r?.rewardMetadata) ?? {},
    giftsRemaining: r?.giftsRemaining === null ? null : (num(r?.giftsRemaining) ?? null),
  };
}

export async function fetchMyPlay(): Promise<MyPlay> {
  const { data, error } = await client().rpc('get_my_play');
  if (error) throw requestError(error);
  const r = asRecord(data) ?? {};
  const challenges = Array.isArray(r.challenges)
    ? r.challenges
        .map((row) => {
          const c = asRecord(row);
          if (!c) return null;
          const id = str(c.id);
          const title = str(c.title);
          const endsAt = millis(c.endsAt);
          if (!id || !title || endsAt == null) return null;
          return {
            id,
            title,
            status: str(c.status) ?? 'active',
            coverUrl: str(c.coverUrl),
            endsAt,
            hasEntry: bool(c.hasEntry),
            entryId: str(c.entryId),
            challengeType: toScope(c.challengeType),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null)
    : [];
  const treasures = Array.isArray(r.treasures)
    ? r.treasures
        .map((row) => {
          const t = asRecord(row);
          if (!t) return null;
          const id = str(t.id);
          const title = str(t.title);
          const endsAt = millis(t.endsAt);
          if (!id || !title || endsAt == null) return null;
          return {
            id,
            title,
            status: str(t.status) ?? 'active',
            coverUrl: str(t.coverUrl),
            progress: num(t.progress) ?? 0,
            clueCount: num(t.clueCount) ?? 0,
            completed: bool(t.completed),
            endsAt,
            huntType: toScope(t.huntType),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null)
    : [];
  const rewards = Array.isArray(r.rewards)
    ? r.rewards
        .map((row) => {
          const w = asRecord(row);
          if (!w) return null;
          const huntId = str(w.huntId);
          const title = str(w.title);
          const claimedAt = millis(w.claimedAt);
          if (!huntId || !title || claimedAt == null) return null;
          return {
            huntId,
            rewardType: str(w.rewardType) ?? 'badge',
            rewardMetadata: asRecord(w.rewardMetadata) ?? {},
            claimedAt,
            title,
            coverUrl: str(w.coverUrl),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null)
    : [];
  return { challenges, treasures, rewards };
}

export { partitionPlayChallenges, partitionPlayTreasures } from '../utils/playRails';
