/**
 * Device-local recent expressive picks (GIF / meme / sticker).
 * Never synced — fast reuse without hammering providers.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { backendCacheKey } from './supabaseEnv';

const storageKey = (account: string | null) => backendCacheKey('expressive-recent:v2', account);
const MAX = 36;

export type ExpressiveRecentKind = 'gif' | 'meme' | 'sticker';

export interface ExpressiveRecentItem {
  kind: ExpressiveRecentKind;
  provider: string;
  externalId: string;
  previewUrl: string;
  url: string;
  /** Owned meme upload — resend without re-upload when still valid. */
  mediaObjectId?: string | null;
  savedAt: number;
}

function dedupeKey(item: Pick<ExpressiveRecentItem, 'kind' | 'provider' | 'externalId'>): string {
  return `${item.kind}:${item.provider}:${item.externalId}`;
}

export async function readExpressiveRecent(account: string | null): Promise<ExpressiveRecentItem[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(account));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentItem).slice(0, MAX);
  } catch {
    return [];
  }
}

export async function pushExpressiveRecent(item: Omit<ExpressiveRecentItem, 'savedAt'>, account: string | null): Promise<void> {
  const storageName = storageKey(account);
  const next: ExpressiveRecentItem = { ...item, savedAt: Date.now() };
  const key = dedupeKey(next);
  const existing = await readExpressiveRecent(account);
  const filtered = existing.filter((row) => dedupeKey(row) !== key);
  filtered.unshift(next);
  await AsyncStorage.setItem(storageName, JSON.stringify(filtered.slice(0, MAX)));
}

function isRecentItem(value: unknown): value is ExpressiveRecentItem {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    (row.kind === 'gif' || row.kind === 'meme' || row.kind === 'sticker') &&
    typeof row.provider === 'string' &&
    typeof row.externalId === 'string' &&
    typeof row.previewUrl === 'string' &&
    typeof row.url === 'string' &&
    typeof row.savedAt === 'number'
  );
}
