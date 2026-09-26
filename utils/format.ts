/** Formatting helpers shared by the Arena, Clash and Profile surfaces. */

export function compact(value: number): string {
  if (value < 1000) return String(value);
  const k = value / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}k`;
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${compact(count)} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/** "2h 41m left" / "14m left" / "EXPIRED" — the Arena countdown. */
export function timeLeftLabel(expiresAt: number, now: number = Date.now()): string {
  const remaining = expiresAt - now;
  if (remaining <= 0) return 'EXPIRED';
  const minutes = Math.floor(remaining / 60_000);
  if (minutes < 1) return 'under a minute left';
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `${minutes}m left`;
  return `${hours}h ${minutes % 60}m left`;
}

/** "2h 41m" / "41m" / "under a minute" — the final-judgement countdown. */
export function durationLabel(expiresAt: number, now: number = Date.now()): string {
  const remaining = expiresAt - now;
  const minutes = Math.floor(Math.max(0, remaining) / 60_000);
  if (minutes < 1) return 'under a minute';
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `${minutes}m`;
  return `${hours}h ${minutes % 60}m`;
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function initials(value: string): string {
  const clean = value.replace(/^@/, '').trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function atHandle(handle: string): string {
  return `@${handle}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function formatReputation(value: number): string {
  return value.toLocaleString('en-US');
}
