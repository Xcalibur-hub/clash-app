/** Numerical presentation only. Never derive or replace the authoritative winner. */
export function communityVerdictCopy(verdict: { jurySize?: number; sideAScore?: number; sideBScore?: number }): string {
  const { jurySize: n, sideAScore: a, sideBScore: b } = verdict;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) return 'Community verdict · ballot totals unavailable';
  const label = `Community verdict · ${n} ballot${n === 1 ? '' : 's'}`;
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < 0 || a + b !== n) return `${label} · side totals unavailable`;
  return `${label} · A ${a} · B ${b}`;
}
