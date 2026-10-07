import type { ArenaPhase } from '../services/liveArenaService';
import type { ArenaDuel } from './arenaDuelPayload';

/** Moods drive motion energy only — never encode a winner. */
export type ArenaAtmosphereMood =
  | 'discovery'
  | 'upcoming'
  | 'live'
  | 'judging'
  | 'verdict'
  | 'cancelled';

export interface AtmosphereBlobSpec {
  color: string;
  size: number;
  x: number;
  y: number;
  opacity: number;
}

export interface AtmospherePalette {
  blobs: readonly [AtmosphereBlobSpec, AtmosphereBlobSpec, AtmosphereBlobSpec, AtmosphereBlobSpec];
  /** Relative loop duration multiplier — higher = calmer. */
  tempo: number;
  /** Peak blob opacity scale 0–1. */
  intensity: number;
}

const DISCOVERY: AtmospherePalette = {
  tempo: 1,
  intensity: 0.55,
  blobs: [
    { color: '#F5D76E', size: 280, x: -0.15, y: -0.05, opacity: 0.42 },
    { color: '#F2A7B3', size: 260, x: 0.55, y: 0.05, opacity: 0.38 },
    { color: '#B8E0A8', size: 240, x: 0.1, y: 0.45, opacity: 0.34 },
    { color: '#A8C5F0', size: 220, x: 0.6, y: 0.55, opacity: 0.32 },
  ],
};

const UPCOMING: AtmospherePalette = {
  tempo: 1.35,
  intensity: 0.4,
  blobs: [
    { color: '#E8C97A', size: 260, x: -0.1, y: 0.1, opacity: 0.34 },
    { color: '#C9B8E8', size: 240, x: 0.55, y: 0.0, opacity: 0.3 },
    { color: '#F0B4A8', size: 220, x: 0.15, y: 0.5, opacity: 0.28 },
    { color: '#9EC9E8', size: 200, x: 0.65, y: 0.55, opacity: 0.26 },
  ],
};

const LIVE: AtmospherePalette = {
  tempo: 0.82,
  intensity: 0.62,
  blobs: [
    { color: '#F2C14E', size: 300, x: -0.2, y: -0.08, opacity: 0.48 },
    { color: '#F28B9A', size: 280, x: 0.58, y: 0.02, opacity: 0.42 },
    { color: '#A8D98B', size: 260, x: 0.05, y: 0.48, opacity: 0.36 },
    { color: '#8BB8F0', size: 240, x: 0.62, y: 0.52, opacity: 0.34 },
  ],
};

const JUDGING: AtmospherePalette = {
  tempo: 1.55,
  intensity: 0.32,
  blobs: [
    { color: '#D8CBB8', size: 260, x: -0.12, y: 0.08, opacity: 0.28 },
    { color: '#C4B8D4', size: 240, x: 0.55, y: 0.05, opacity: 0.26 },
    { color: '#B8C8D8', size: 220, x: 0.2, y: 0.5, opacity: 0.24 },
    { color: '#D4C4B0', size: 200, x: 0.65, y: 0.55, opacity: 0.22 },
  ],
};

const VERDICT: AtmospherePalette = {
  tempo: 1.2,
  intensity: 0.48,
  blobs: [
    { color: '#F0D78A', size: 280, x: -0.1, y: 0.0, opacity: 0.4 },
    { color: '#E8B0BE', size: 260, x: 0.55, y: 0.08, opacity: 0.36 },
    { color: '#B8D8C0', size: 240, x: 0.15, y: 0.5, opacity: 0.3 },
    { color: '#B0C8E8', size: 220, x: 0.6, y: 0.55, opacity: 0.28 },
  ],
};

const CANCELLED: AtmospherePalette = {
  tempo: 1.8,
  intensity: 0.22,
  blobs: [
    { color: '#9A9A9A', size: 240, x: -0.08, y: 0.12, opacity: 0.2 },
    { color: '#8A8A96', size: 220, x: 0.55, y: 0.1, opacity: 0.18 },
    { color: '#7A848A', size: 200, x: 0.2, y: 0.5, opacity: 0.16 },
    { color: '#8A8078', size: 180, x: 0.62, y: 0.55, opacity: 0.14 },
  ],
};

const PALETTES: Record<ArenaAtmosphereMood, AtmospherePalette> = {
  discovery: DISCOVERY,
  upcoming: UPCOMING,
  live: LIVE,
  judging: JUDGING,
  verdict: VERDICT,
  cancelled: CANCELLED,
};

export function atmospherePalette(mood: ArenaAtmosphereMood): AtmospherePalette {
  return PALETTES[mood];
}

/** Map canonical duel + room phase → atmosphere mood. Never uses tallies. */
export function duelAtmosphereMood(duel: ArenaDuel, phase: ArenaPhase): ArenaAtmosphereMood {
  if (duel.status === 'cancelled') return 'cancelled';
  if (duel.status === 'settled') return 'verdict';
  if (phase === 'scheduled') return 'upcoming';
  if (phase === 'judging') return 'judging';
  if (phase === 'closed') return 'judging';
  return 'live';
}

export function topicAtmosphereMood(status: string, phase: string): ArenaAtmosphereMood {
  if (status === 'scheduled' || phase === 'scheduled') return 'upcoming';
  if (phase === 'judging' || phase === 'closed') return 'judging';
  if (status === 'live' || phase === 'open' || phase === 'final_arguments') return 'live';
  return 'discovery';
}
