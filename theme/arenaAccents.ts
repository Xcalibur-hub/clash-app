/**
 * Restrained Arena accent system — soft, desaturated, theme-aware.
 * Presentation only. Never persisted; derived from Hood, rank, moment, or id hash.
 *
 * Target: Apple restraint + live-competition energy.
 * Not neon, crypto, Discord, or rainbow gradients.
 */
import type { ColorScheme } from './palettes';

export type ArenaAccentKey = 'coral' | 'amber' | 'blue' | 'violet' | 'teal' | 'rose';

export interface ArenaAccent {
  key: ArenaAccentKey;
  /** Saturated-enough detail (line, badge text, stroke, LIVE tint). */
  ink: string;
  /** Soft fill for chips / selected rows / blobs (~12–18% visual weight). */
  soft: string;
  /** Deeper plate for dark-mode surfaces / edges. */
  deep: string;
}

const LIGHT: Record<ArenaAccentKey, ArenaAccent> = {
  coral: {
    key: 'coral',
    ink: '#E56A4F',
    soft: 'rgba(229,106,79,0.14)',
    deep: 'rgba(229,106,79,0.22)',
  },
  amber: {
    key: 'amber',
    ink: '#C9922E',
    soft: 'rgba(201,146,46,0.14)',
    deep: 'rgba(201,146,46,0.22)',
  },
  blue: {
    key: 'blue',
    ink: '#3D7EB8',
    soft: 'rgba(61,126,184,0.14)',
    deep: 'rgba(61,126,184,0.22)',
  },
  violet: {
    key: 'violet',
    ink: '#7A63B8',
    soft: 'rgba(122,99,184,0.14)',
    deep: 'rgba(122,99,184,0.22)',
  },
  teal: {
    key: 'teal',
    ink: '#2F8F86',
    soft: 'rgba(47,143,134,0.14)',
    deep: 'rgba(47,143,134,0.22)',
  },
  rose: {
    key: 'rose',
    ink: '#C45B7A',
    soft: 'rgba(196,91,122,0.14)',
    deep: 'rgba(196,91,122,0.22)',
  },
};

const DARK: Record<ArenaAccentKey, ArenaAccent> = {
  coral: {
    key: 'coral',
    ink: '#FF8B72',
    soft: 'rgba(255,139,114,0.16)',
    deep: 'rgba(255,139,114,0.22)',
  },
  amber: {
    key: 'amber',
    ink: '#E8C06A',
    soft: 'rgba(232,192,106,0.16)',
    deep: 'rgba(232,192,106,0.22)',
  },
  blue: {
    key: 'blue',
    ink: '#7BB4E0',
    soft: 'rgba(123,180,224,0.16)',
    deep: 'rgba(123,180,224,0.22)',
  },
  violet: {
    key: 'violet',
    ink: '#B8A4E8',
    soft: 'rgba(184,164,232,0.16)',
    deep: 'rgba(184,164,232,0.22)',
  },
  teal: {
    key: 'teal',
    ink: '#5CBCB2',
    soft: 'rgba(92,188,178,0.16)',
    deep: 'rgba(92,188,178,0.22)',
  },
  rose: {
    key: 'rose',
    ink: '#E08AA5',
    soft: 'rgba(224,138,165,0.16)',
    deep: 'rgba(224,138,165,0.22)',
  },
};

/** Hood → accent. Culture/entertainment share violet/coral; sport → teal. */
const HOOD_ACCENT: Record<string, ArenaAccentKey> = {
  techtakes: 'blue',
  startups: 'amber',
  campushustle: 'amber',
  movies: 'violet',
  gaming: 'coral',
  football: 'teal',
  goatalk: 'rose',
};

const KEYS: readonly ArenaAccentKey[] = ['coral', 'amber', 'blue', 'violet', 'teal', 'rose'];

/** Top-3 race identity — fixed, not hashed, so the chart is readable at a glance. */
const RACE_RANK_KEY: Record<1 | 2 | 3, ArenaAccentKey> = {
  1: 'coral',
  2: 'blue',
  3: 'violet',
};

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

/**
 * Ranking-race line color.
 * #1/#2/#3 always get distinct accents.
 * #4–#10 stay muted (null) until selected — then a tasteful topic accent.
 */
export function trendRaceLineAccent(input: {
  rank: number;
  selected: boolean;
  topicId: string;
  scheme: ColorScheme;
}): ArenaAccent | null {
  const table = arenaAccentPalette(input.scheme);
  if (input.rank === 1 || input.rank === 2 || input.rank === 3) {
    return table[RACE_RANK_KEY[input.rank]];
  }
  if (input.selected) return arenaAccentForId(input.topicId, input.scheme);
  return null;
}

/** Pulse badge accents — rising/hot/clash map to the soft Arena set. */
export function pulseAccent(
  pulse: 'clash' | 'hot' | 'rising' | null,
  scheme: ColorScheme,
): ArenaAccent | null {
  if (!pulse) return null;
  const table = arenaAccentPalette(scheme);
  if (pulse === 'rising') return table.coral;
  if (pulse === 'hot') return table.amber;
  return table.rose;
}

/**
 * Semantic accents for live battle moments.
 * Meaning first — not decoration everywhere.
 */
export type ArenaMomentAccentKind =
  | 'FAST_RISING'
  | 'TOP_ARGUMENT'
  | 'BEST_EVIDENCE'
  | 'BEST_REBUTTAL'
  | 'CROWD_FAVORITE'
  | 'BACKUP'
  | 'JUDGING'
  | 'RESULT'
  | 'EVIDENCE_SURGE'
  | 'CLASH'
  | 'PHASE';

export function battleMomentAccent(
  kind: ArenaMomentAccentKind,
  scheme: ColorScheme,
): ArenaAccent {
  const table = arenaAccentPalette(scheme);
  switch (kind) {
    case 'FAST_RISING':
      return table.coral;
    case 'CLASH':
    case 'TOP_ARGUMENT':
    case 'BEST_REBUTTAL':
      return table.amber;
    case 'BACKUP':
      return table.blue;
    case 'BEST_EVIDENCE':
    case 'EVIDENCE_SURGE':
      return table.teal;
    case 'CROWD_FAVORITE':
      // Pulse label is "Crowd Lost It" — violet/rose energy.
      return table.rose;
    case 'JUDGING':
    case 'PHASE':
      return table.violet;
    case 'RESULT':
      return table.amber;
    default:
      return table.blue;
  }
}
