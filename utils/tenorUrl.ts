export function isAllowedTenorUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'tenor.com' || host.endsWith('.tenor.com');
  } catch {
    return false;
  }
}
