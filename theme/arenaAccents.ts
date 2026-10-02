/**
 * Restrained Arena accent system — soft, desaturated, theme-aware.
 * Presentation only. Never persisted; derived from Hood or a stable id hash.
 */
import type { ColorScheme } from './palettes';

export type ArenaAccentKey = 'coral' | 'sky' | 'lime' | 'lavender' | 'yellow';

export interface ArenaAccent {
  key: ArenaAccentKey;
  /** Saturated-enough detail (LIVE tint, badge text, stroke). */
  ink: string;
  /** Soft fill for blobs / chip plates (~12–18% visual weight). */
  soft: string;
  /** Deeper plate for dark-mode surfaces. */
  deep: string;
}

const LIGHT: Record<ArenaAccentKey, ArenaAccent> = {
  coral: { key: 'coral', ink: '#E56A4F', soft: 'rgba(255,118,87,0.16)', deep: 'rgba(229,106,79,0.22)' },
  sky: { key: 'sky', ink: '#5AA0D0', soft: 'rgba(121,189,232,0.18)', deep: 'rgba(90,160,208,0.22)' },
  lime: { key: 'lime', ink: '#7FA84A', soft: 'rgba(185,215,122,0.22)', deep: 'rgba(127,168,74,0.22)' },
  lavender: { key: 'lavender', ink: '#8B7BC4', soft: 'rgba(183,166,232,0.20)', deep: 'rgba(139,123,196,0.24)' },
  yellow: { key: 'yellow', ink: '#C9A24A', soft: 'rgba(242,201,109,0.22)', deep: 'rgba(201,162,74,0.22)' },
};

const DARK: Record<ArenaAccentKey, ArenaAccent> = {
  coral: { key: 'coral', ink: '#FF8B72', soft: 'rgba(255,118,87,0.14)', deep: 'rgba(255,118,87,0.18)' },
  sky: { key: 'sky', ink: '#8AC8EE', soft: 'rgba(121,189,232,0.14)', deep: 'rgba(121,189,232,0.18)' },
  lime: { key: 'lime', ink: '#C2DC8E', soft: 'rgba(185,215,122,0.14)', deep: 'rgba(185,215,122,0.18)' },
  lavender: { key: 'lavender', ink: '#C4B6F0', soft: 'rgba(183,166,232,0.14)', deep: 'rgba(183,166,232,0.18)' },
  yellow: { key: 'yellow', ink: '#F0D28A', soft: 'rgba(242,201,109,0.14)', deep: 'rgba(242,201,109,0.18)' },
};

/** Hood → accent. Culture/entertainment share lavender/coral; sport → lime. */
const HOOD_ACCENT: Record<string, ArenaAccentKey> = {
  techtakes: 'sky',
  startups: 'yellow',
  campushustle: 'yellow',
  movies: 'lavender',
  gaming: 'coral',
  football: 'lime',
  goatalk: 'coral',
};

const KEYS: readonly ArenaAccentKey[] = ['coral', 'sky', 'lime', 'lavender', 'yellow'];

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function arenaAccentPalette(scheme: ColorScheme): Record<ArenaAccentKey, ArenaAccent> {
  return scheme === 'dark' ? DARK : LIGHT;
}

/** Stable accent for a Hood id, or a deterministic hash fallback. */
export function arenaAccentForHood(
  hood: string | null | undefined,
  scheme: ColorScheme,
  seed = '',
): ArenaAccent {
  const table = arenaAccentPalette(scheme);
  if (hood && hood in HOOD_ACCENT) {
    return table[HOOD_ACCENT[hood]!];
  }
  const key = KEYS[hashString(`${hood ?? ''}:${seed}`) % KEYS.length]!;
  return table[key];
}

/** Stable accent for any topic / take id when Hood is missing. */
export function arenaAccentForId(id: string, scheme: ColorScheme): ArenaAccent {
  const table = arenaAccentPalette(scheme);
  return table[KEYS[hashString(id) % KEYS.length]!];
}

/** Pulse badge accents — rising/hot/clash map to the soft Arena set. */
export function pulseAccent(
  pulse: 'clash' | 'hot' | 'rising' | null,
  scheme: ColorScheme,
): ArenaAccent | null {
  if (!pulse) return null;
  const table = arenaAccentPalette(scheme);
  if (pulse === 'rising') return table.coral;
  if (pulse === 'hot') return table.yellow;
  return table.lavender;
}
