export interface CrowdMessage {
  id: string; roomId: string; body: string; createdAt: string; isOwn: boolean;
  author: { id: string; name: string; handle: string; avatarTint: string };
}
export interface CrowdContext { roomId: string; canSend: boolean; spectatorCount: number; serverNow: string; closesAt: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Crowd response');
  return value as Record<string, unknown>;
}
function date(value: unknown): boolean { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
export function parseCrowdMessage(value: unknown, roomId: string): CrowdMessage {
  const p = object(value); const a = object(p.author);
  if (typeof p.id !== 'string' || !uuid.test(p.id) || p.roomId !== roomId || typeof p.body !== 'string'
    || !validCrowdText(p.body) || !date(p.createdAt) || typeof p.isOwn !== 'boolean'
    || typeof a.id !== 'string' || !a.id || typeof a.name !== 'string' || typeof a.handle !== 'string'
    || typeof a.avatarTint !== 'string') throw new Error('Invalid Crowd message');
  return p as unknown as CrowdMessage;
}
export function parseCrowdPage(value: unknown, roomId: string): CrowdMessage[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid Crowd page');
  return value.map(row => parseCrowdMessage(row, roomId));
}
export function parseCrowdContext(value: unknown, roomId: string): CrowdContext {
  const p = object(value);
  if (p.roomId !== roomId || typeof p.canSend !== 'boolean' || !Number.isSafeInteger(p.spectatorCount)
    || (p.spectatorCount as number) < 0 || !date(p.serverNow) || !date(p.closesAt)) throw new Error('Invalid Crowd access');
  return p as unknown as CrowdContext;
}
export function validCrowdText(text: string): boolean {
  return Array.from(text.trim()).length >= 1 && Array.from(text).length <= 500 && /[^\s\u200b\u200c\u200d\ufeff]/u.test(text);
}
/** Keep PostgreSQL timestamp precision for cursor ordering; do not round to ms. */
export function mergeCrowd(current: readonly CrowdMessage[], next: readonly CrowdMessage[], limit = 200): CrowdMessage[] {
  const rows = new Map(current.map(row => [row.id, row]));
  for (const row of next) rows.set(row.id, row);
  return [...rows.values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(-limit);
}
export function reconcileCrowd(current: readonly CrowdMessage[], checked: readonly string[], visible: readonly CrowdMessage[]): CrowdMessage[] {
  const ids = new Set(checked); return mergeCrowd(current.filter(row => !ids.has(row.id)), visible);
}
