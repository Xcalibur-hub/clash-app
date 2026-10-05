/**
 * Device-local recent expressive picks (GIF / meme / sticker).
 * Never synced — fast reuse without hammering providers.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@clash/arena/expressive-recent/v1';
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

export async function readExpressiveRecent(): Promise<ExpressiveRecentItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentItem).slice(0, MAX);
  } catch {
    return [];
  }
}

export async function pushExpressiveRecent(item: Omit<ExpressiveRecentItem, 'savedAt'>): Promise<void> {
  const next: ExpressiveRecentItem = { ...item, savedAt: Date.now() };
  const key = dedupeKey(next);
  const existing = await readExpressiveRecent();
  const filtered = existing.filter((row) => dedupeKey(row) !== key);
  filtered.unshift(next);
  await AsyncStorage.setItem(KEY, JSON.stringify(filtered.slice(0, MAX)));
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
