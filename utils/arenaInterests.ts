export interface ArenaInterest { id: string; name: string; description: string; icon: string | null; hoods: string[] }
export interface ArenaInterestPreferences { topicIds: string[]; version: number; skipped: boolean; revision: number }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid interest response');
  return value as Record<string, unknown>;
}
export function parseInterestCatalogue(value: unknown): ArenaInterest[] {
  if (!Array.isArray(value) || value.length > 40) throw new Error('Invalid interest catalogue');
  const ids = new Set<string>();
  return value.map(item => {
    const r = record(item);
    if (typeof r.id !== 'string' || ids.has(r.id) || typeof r.name !== 'string' || typeof r.description !== 'string'
      || !Array.isArray(r.hoods) || !r.hoods.every(h => typeof h === 'string')) throw new Error('Invalid interest entry');
    ids.add(r.id);
    return { id: r.id, name: r.name, description: r.description, icon: typeof r.icon === 'string' ? r.icon : null, hoods: r.hoods as string[] };
  });
}
export function parseInterestPreferences(value: unknown): ArenaInterestPreferences {
  const r = record(value);
  if (!Array.isArray(r.topicIds) || !r.topicIds.every(id => typeof id === 'string')
    || new Set(r.topicIds).size !== r.topicIds.length || typeof r.skipped !== 'boolean'
    || !Number.isSafeInteger(r.version) || !Number.isSafeInteger(r.revision)
    || (r.version !== 0 && r.version !== 1) || Number(r.revision) < 0) throw new Error('Invalid interest preferences');
  if (r.version === 1 && (Number(r.revision) < 1 || (r.skipped ? r.topicIds.length !== 0 : !validInterestSelection(r.topicIds))))
    throw new Error('Invalid completed preferences');
  return { topicIds: r.topicIds as string[], version: Number(r.version), skipped: r.skipped, revision: Number(r.revision) };
}
export function validInterestSelection(ids: readonly string[]): boolean {
  return ids.length >= 3 && ids.length <= 5 && new Set(ids).size === ids.length;
}
export function toggleInterest(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(x => x !== id) : ids.length < 5 ? [...ids, id] : [...ids];
}
/** The page cursor is an immutable slice of the server's bounded ranking snapshot. */
export function interestFeedPage(ids: readonly string[], offset: number, size = 20): string[] {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(size) || size < 1 || size > 60 || ids.length > 60)
    throw new Error('Invalid feed page');
  return ids.slice(offset, offset + size);
}
export function prioritizeInterestTopics<T extends { hood: string | null }>(topics: readonly T[], catalogue: readonly ArenaInterest[], preferences: ArenaInterestPreferences): T[] {
  const relevant = new Set(catalogue.filter(i => preferences.topicIds.includes(i.id)).flatMap(i => i.hoods));
  return topics.map((topic, index) => ({ topic, index })).sort((a,b) =>
    Number(relevant.has(b.topic.hood ?? '')) - Number(relevant.has(a.topic.hood ?? '')) || a.index-b.index).map(x => x.topic);
}
