/**
 * Creator World personality (Phase 15.2B).
 *
 * One token set and one primitive set for every world — only the COMPOSITION
 * adapts, so four creators genuinely feel like four different places. Fully
 * deterministic per creator (no randomness), so a world looks stable forever.
 */

export type WorldPersonality =
  | 'cinematic' // Maya — horror / analog film / dark editorial
  | 'contact' // Leo — street photography / contact sheets
  | 'studio' // Aria — music studio / waveform / track list
  | 'blueprint' // Noah — architecture / blueprint / geometry
  | 'editorial'; // fallback — clean magazine composition

const PERSONALITIES: readonly WorldPersonality[] = [
  'cinematic',
  'contact',
  'studio',
  'blueprint',
  'editorial',
];

/** 32-bit FNV-1a — the same primitive the community pseudonyms use. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface WorldPersonalityInput {
  creatorId: string;
  handle?: string | null;
  name?: string | null;
}

export function worldPersonality(input: WorldPersonalityInput): WorldPersonality {
  const key = `${input.handle ?? ''} ${input.name ?? ''} ${input.creatorId}`.toLowerCase();
  if (/(maya|horror|fear|dread|night|film|cinema)/.test(key)) return 'cinematic';
  if (/(leo|street|photo|frame|print|roam)/.test(key)) return 'contact';
  if (/(aria|music|synth|sound|track|vinyl|beat)/.test(key)) return 'studio';
  if (/(noah|architect|blueprint|structure|grid|system)/.test(key)) return 'blueprint';
  return PERSONALITIES[fnv1a(input.creatorId) % PERSONALITIES.length];
}

export const WORLD_PERSONALITY_LABEL: Record<WorldPersonality, string> = {
  cinematic: 'Cinematic',
  contact: 'Contact sheet',
  studio: 'Studio',
  blueprint: 'Blueprint',
  editorial: 'Editorial',
};

/**
 * Editorial corners: sharp for the rigid worlds, softer for the tactile ones.
 * Never the uniform 24px round used by Explore cards.
 */
export function personalityRadius(personality: WorldPersonality): number {
  switch (personality) {
    case 'cinematic':
      return 4;
    case 'contact':
      return 8;
    case 'blueprint':
      return 2;
    default:
      return 12;
  }
}

export type CollageShape = 'lead' | 'portrait' | 'wide' | 'square';

const COLLAGE_ORDER: readonly CollageShape[] = [
  'lead',
  'portrait',
  'square',
  'wide',
  'portrait',
  'square',
  'wide',
  'lead',
];

const COLLAGE_OFFSET: Record<WorldPersonality, number> = {
  cinematic: 0,
  contact: 2,
  studio: 1,
  blueprint: 3,
  editorial: 0,
};

/** Which shape a world takes at a given index in the discover collage. */
export function personalityCollageOrder(
  personality: WorldPersonality,
  index: number,
): CollageShape {
  const offset = COLLAGE_OFFSET[personality];
  return COLLAGE_ORDER[(index + offset) % COLLAGE_ORDER.length];
}

/** Scatter offset (px) for the tactile worlds — flat worlds stay aligned. */
export function personalityScatter(personality: WorldPersonality, index: number): number {
  if (personality !== 'contact' && personality !== 'cinematic') return 0;
  const pattern = [0, 16, -12, 10, -16, 8, -8, 14];
  return pattern[index % pattern.length];
}

/** Degrees of print tilt — contact sheets only. */
export function personalityTilt(personality: WorldPersonality, index: number): number {
  if (personality !== 'contact') return 0;
  const pattern = [-2.4, 1.8, -1.4, 2.2, -1.8, 1.2];
  return pattern[index % pattern.length];
}

/** True when a world draws a faint film grain / grid overlay. */
export function personalityHasTexture(personality: WorldPersonality): boolean {
  return personality === 'cinematic' || personality === 'blueprint';
}

/** Media crop language per personality. */
export type PersonalityMediaShape = 'rect' | 'circle' | 'film';

export function personalityMediaShape(personality: WorldPersonality): PersonalityMediaShape {
  switch (personality) {
    case 'studio':
      return 'circle';
    case 'cinematic':
      return 'film';
    default:
      return 'rect';
  }
}

/** Whether collage captions sit outside the media plane. */
export function personalityNameOutside(personality: WorldPersonality): boolean {
  return personality === 'contact' || personality === 'blueprint' || personality === 'editorial';
}
