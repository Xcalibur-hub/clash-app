export interface OfficialCursor { id: string; preciseCreatedAt: string }
export function officialKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
/** Compare instants without dropping PostgreSQL's six fractional digits. */
export function preciseTime(value: string): string {
  const fraction = /\.(\d+)/.exec(value)?.[1] ?? '';
  return new Date(value).toISOString().slice(0, 19) + '.' + fraction.padEnd(6, '0').slice(0, 6) + 'Z';
}
export function compareOfficial(a: { id: string; createdAt: number; preciseCreatedAt?: string }, b: typeof a): number {
  const at = a.preciseCreatedAt ? preciseTime(a.preciseCreatedAt) : preciseTime(new Date(a.createdAt).toISOString());
  const bt = b.preciseCreatedAt ? preciseTime(b.preciseCreatedAt) : preciseTime(new Date(b.createdAt).toISOString());
  return at.localeCompare(bt) || a.id.localeCompare(b.id);
}
/** One bounded pass; callers retain the returned cursor for the next pass. */
export async function drainOfficialGap<T extends OfficialCursor>(
  cursor: OfficialCursor, fetchPage: (cursor: OfficialCursor) => Promise<T[]>,
  accept: (rows: T[], cursor: OfficialCursor) => void, alive: () => boolean,
  pageSize = 40, maxPages = 5,
): Promise<void> {
  for (let page = 0; page < maxPages && alive(); page++) {
    const rows = await fetchPage(cursor);
    if (!alive() || !rows.length) return;
    const next = rows.at(-1)!;
    if (preciseTime(next.preciseCreatedAt) < preciseTime(cursor.preciseCreatedAt)
      || (preciseTime(next.preciseCreatedAt) === preciseTime(cursor.preciseCreatedAt) && next.id <= cursor.id)) throw new Error('Recovery cursor did not advance');
    accept(rows, next); cursor = next;
    if (rows.length < pageSize) return;
  }
}
