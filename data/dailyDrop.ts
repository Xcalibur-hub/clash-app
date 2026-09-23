import type { HoodId } from '../store/types';

/** One curated clash in the 9:00 PM Daily Drop (spec §12, reference screen 12). */
export interface DropEntry {
  id: string;
  /** Position in the handpicked list — rendered as "#01". */
  rank: number;
  takeId: string;
  clashId: string;
  hood: HoodId;
  /** The jury tally that immortalized the clash. */
  scoreA: number;
  scoreB: number;
  winningSide: 'A' | 'B';
}

/**
 * Tonight's handpicked three. These are deliberately clashes that are NOT already
 * in the Hall of Fame archive, so a clash can never show two different verdicts.
 * Order is by Arena engagement: matchmaking, flagship, then the viewer's own take.
 */
export const DAILY_DROP: readonly DropEntry[] = [
  {
    id: 'drop-01',
    rank: 1,
    takeId: 't-matchmaking',
    clashId: 'clash-t-matchmaking',
    hood: 'gaming',
    scoreA: 6,
    scoreB: 3,
    winningSide: 'A',
  },
  {
    id: 'drop-02',
    rank: 2,
    takeId: 't-flagship',
    clashId: 'clash-t-flagship',
    hood: 'techtakes',
    scoreA: 8,
    scoreB: 2,
    winningSide: 'A',
  },
  {
    id: 'drop-03',
    rank: 3,
    takeId: 't-viewer-sleep',
    clashId: 'clash-t-viewer-sleep',
    hood: 'campushustle',
    scoreA: 4,
    scoreB: 5,
    winningSide: 'B',
  },
];

/** Zero-padded drop number: "#01". */
export function dropNumber(rank: number): string {
  return `#${String(rank).padStart(2, '0')}`;
}
