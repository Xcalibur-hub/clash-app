import type { HoodId } from '../store/types';

/** Legendary, immortalized takes featured in the Hall of Fame (spec §13). */
export interface HofEntry {
  id: string;
  /** The take this entry immortalizes. */
  takeId: string;
  /** The clash where this take was defended. */
  clashId: string;
  /** How the 9-person jury voted — classic 6–3 split. */
  scoreA: number;
  scoreB: number;
  winningSide: 'A' | 'B';
  /** When this take joined the museum. */
  date: string;
  /** Hood where the take was originally dropped. */
  hood: HoodId;
  /** Views accumulated on the immortal record. */
  views: number;
  /** Shares the immortal record has earned. */
  shares: number;
}

/** 6–3 verdicts immortalized for the digital museum (spec §13). */
export const HOF_ENTRIES: readonly HofEntry[] = [
  {
    id: 'hof-01',
    takeId: 't-trailers',
    clashId: 'clash-t-trailers',
    scoreA: 6,
    scoreB: 3,
    winningSide: 'A',
    date: '14 Mar 2026',
    hood: 'movies',
    views: 1_420_000,
    shares: 88_400,
  },
  {
    id: 'hof-02',
    takeId: 't-pixel',
    clashId: 'clash-t-pixel',
    scoreA: 3,
    scoreB: 6,
    winningSide: 'B',
    date: '21 Feb 2026',
    hood: 'techtakes',
    views: 980_000,
    shares: 61_200,
  },
  {
    id: 'hof-03',
    takeId: 't-degree',
    clashId: 'clash-t-degree',
    scoreA: 6,
    scoreB: 3,
    winningSide: 'A',
    date: '03 Feb 2026',
    hood: 'campushustle',
    views: 762_000,
    shares: 52_800,
  },
  {
    id: 'hof-04',
    takeId: 't-highlights',
    clashId: 'clash-t-highlights',
    scoreA: 6,
    scoreB: 3,
    winningSide: 'A',
    date: '18 Jan 2026',
    hood: 'football',
    views: 1_105_000,
    shares: 73_900,
  },
  {
    id: 'hof-05',
    takeId: 't-iphone-price',
    clashId: 'clash-t-iphone-price',
    scoreA: 3,
    scoreB: 6,
    winningSide: 'B',
    date: '09 Jan 2026',
    hood: 'techtakes',
    views: 884_000,
    shares: 58_100,
  },
  {
    id: 'hof-06',
    takeId: 't-monsoon',
    clashId: 'clash-t-monsoon',
    scoreA: 6,
    scoreB: 3,
    winningSide: 'A',
    date: '26 Dec 2025',
    hood: 'goatalk',
    views: 543_000,
    shares: 32_700,
  },
  {
    id: 'hof-07',
    // The viewer's own immortal record — the take their HALL OF FAME badge refers to.
    takeId: 't-viewer-placements',
    clashId: 'clash-t-viewer-placements',
    scoreA: 6,
    scoreB: 3,
    winningSide: 'A',
    date: '12 Mar 2026',
    hood: 'campushustle',
    views: 418_000,
    shares: 26_500,
  },
];
