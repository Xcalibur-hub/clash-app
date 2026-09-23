import type { RankName } from '../store/types';

/** Reputation awarded per interaction (spec §11). */
export const XP = {
  /** "Participating: +15 XP". */
  participate: 15,
  /** Win bonus on top of participation — 15 + 105 = the spec's +120 for a won clash. */
  winBonus: 105,
  /** Prototype tuning: a small credit for filing a dissenting ballot, so judging still pays. */
  dissent: 10,
  /** "Creating popular Take: +30 XP". */
  popularTake: 30,
  /** "Entering Hall of Fame: +500 XP" (Phase 2). */
  hallOfFame: 500,
} as const;

/** "Winning Clash: +120 XP" — participation plus the win bonus. */
export const CLASH_WIN_TOTAL = XP.participate + XP.winBonus;


export interface RankStep {
  name: RankName;
  /** Reputation required to hold this rank. */
  min: number;
  /** Flavour title shown in the result reveal ("YOUR RANK" — spec §10). */
  title: string;
  blurb: string;
}

export const RANKS: readonly RankStep[] = [
  { name: 'Rookie', min: 0, title: 'Loud Newcomer', blurb: 'Fresh in the Arena' },
  { name: 'Instigator', min: 300, title: 'Spark Starter', blurb: 'Starting arguments on purpose' },
  { name: 'Hot Take', min: 900, title: 'Reply Magnet', blurb: 'Replies are getting loud' },
  { name: 'Firestarter', min: 2400, title: 'Rising Fire', blurb: 'Runs the 9pm drop' },
  { name: 'Provocateur', min: 11_000, title: 'Hood Provocateur', blurb: 'Hoods quote you back' },
  { name: 'Clash King', min: 25_000, title: 'Crown Holder', blurb: 'Wins the big ones' },
  { name: 'Legend', min: 50_000, title: 'Permanent Ink', blurb: 'Survives after the 24h' },
] as const;

export function rankFor(reputation: number): RankStep {
  let current = RANKS[0];
  for (const step of RANKS) {
    if (reputation >= step.min) current = step;
  }
  return current;
}

export function nextRank(reputation: number): RankStep | null {
  return RANKS.find((step) => step.min > reputation) ?? null;
}

export interface RankProgress {
  current: RankStep;
  next: RankStep | null;
  /** Reputation earned inside the current tier. */
  into: number;
  /** Size of the current tier. */
  span: number;
  ratio: number;
  /** Reputation still needed to rank up. */
  toNext: number;
}

export function rankProgress(reputation: number): RankProgress {
  const current = rankFor(reputation);
  const next = nextRank(reputation);
  const into = reputation - current.min;
  const span = next ? next.min - current.min : Math.max(into, 1);
  const ratio = next ? Math.min(into / span, 1) : 1;
  return {
    current,
    next,
    into,
    span,
    ratio,
    toNext: next ? next.min - reputation : 0,
  };
}
