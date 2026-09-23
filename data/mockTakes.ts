import { gradient } from '../theme';
import type { Take } from '../store/types';

/** Fixed "now" for the mock arena so countdowns are stable within a session. */
export const SEED_NOW = Date.now();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface TakeSeed {
  id: string;
  authorId: string;
  text: string;
  hood: Take['hood'];
  /** Minutes before SEED_NOW. */
  ageMinutes: number;
  clashes: number;
  reactions: number;
  media?: Take['media'];
}

const SEEDS: readonly TakeSeed[] = [
  {
    id: 't-pixel',
    authorId: 'u-maya',
    text: 'Pixel takes better photos than the iPhone.',
    hood: 'techtakes',
    ageMinutes: 200,
    clashes: 42,
    reactions: 318,
    media: {
      kind: 'image',
      caption: 'Night mode, 48MP, zero edits',
      colors: gradient.violet,
    },
  },
  {
    id: 't-flagship',
    authorId: 'u-aarav',
    text: 'Android flagships have officially caught up with iPhone.',
    hood: 'techtakes',
    // Lands on the spec example: "2h 41m left".
    ageMinutes: 24 * 60 - (2 * 60 + 41),
    clashes: 18,
    reactions: 205,
  },
  {
    id: 't-trailers',
    authorId: 'u-riya',
    text: 'AI-generated videos are already better than most Hollywood trailers.',
    hood: 'movies',
    ageMinutes: 50,
    clashes: 96,
    reactions: 1240,
    media: {
      kind: 'video',
      caption: 'Leaked teaser, 18 seconds',
      colors: gradient.sideA,
      duration: '0:18',
    },
  },
  {
    id: 't-degree',
    authorId: 'u-zoya',
    text: 'The campus degree is becoming obsolete.',
    hood: 'campushustle',
    ageMinutes: 310,
    clashes: 63,
    reactions: 512,
  },
  {
    id: 't-monsoon',
    authorId: 'u-ishaan',
    text: 'Goa in monsoon beats Goa in December.',
    hood: 'goatalk',
    ageMinutes: 380,
    clashes: 37,
    reactions: 289,
    media: {
      kind: 'image',
      caption: 'Saturday, 6:12 PM, empty beach',
      colors: gradient.sideB,
    },
  },
  {
    id: 't-matchmaking',
    authorId: 'u-kabir',
    text: 'Ranked matchmaking ruined casual gaming.',
    hood: 'gaming',
    ageMinutes: 430,
    clashes: 54,
    reactions: 401,
  },
  {
    id: 't-distribution',
    authorId: 'u-tanvi',
    text: 'Most startup ideas die from distribution, not from the product.',
    hood: 'startups',
    ageMinutes: 505,
    clashes: 22,
    reactions: 160,
  },
  {
    id: 't-highlights',
    authorId: 'u-neel',
    text: 'Football highlights are better than watching the full match.',
    hood: 'football',
    ageMinutes: 560,
    clashes: 71,
    reactions: 640,
  },
  {
    id: 't-iphone-price',
    authorId: 'u-ananya',
    text: 'iPhone users pay too much for the same experience.',
    hood: 'techtakes',
    ageMinutes: 70,
    clashes: 88,
    reactions: 730,
  },
  {
    id: 't-viewer-sleep',
    authorId: 'u-viewer',
    text: 'Everyone is faking productivity with three apps and no sleep.',
    hood: 'campushustle',
    ageMinutes: 140,
    clashes: 14,
    reactions: 96,
  },
  {
    id: 't-viewer-placements',
    authorId: 'u-viewer',
    text: 'Placements matter less than your first two years of real work.',
    hood: 'campushustle',
    ageMinutes: 660,
    clashes: 31,
    reactions: 240,
  },
];

/** Every take expires 24h after it was dropped (spec §7). */
export const TAKES: readonly Take[] = SEEDS.map((seed) => {
  const createdAt = SEED_NOW - seed.ageMinutes * MINUTE;
  return {
    id: seed.id,
    authorId: seed.authorId,
    text: seed.text,
    hood: seed.hood,
    createdAt,
    expiresAt: createdAt + DAY,
    clashes: seed.clashes,
    reactions: seed.reactions,
    media: seed.media,
  };
});
