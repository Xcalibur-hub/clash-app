import type { Alignment, RankName } from '../store/types';

/**
 * Reputation awarded per interaction.
 *
 * ACTOR SEPARATION (2026-11-12): a Clash pays two different groups, and they are
 * NOT paid the same. These constants mirror the server ledger exactly:
 *
 *   FIGHTERS — the two debaters (settle_clash_legacy, kinds
 *   `clash_fighter_win` / `clash_fighter_participation`):
 *     win  +40 rep, 0 coins
 *     loss +15 rep, 0 coins
 *     draw +15 rep each, 0 coins
 *
 *   JURORS — the people who voted (kinds `clash_win` / `clash_dissent` /
 *   `clash_participation`):
 *     winning side +120 rep, +40 coins, streak +1
 *     dissenting   +25 rep, +18 coins, streak reset
 *     draw         +15 rep, no coins, streak unchanged
 *
 * Fighter awards never carry coins and never change a streak. Do not collapse
 * these two groups into one "clash reward" number — that conflation is exactly
 * what made the previous 120 ambiguous.
 */
export const XP = {
  // ── Fighter awards (debate participation) ──────────────────────────────────
  /** Winning debater: `clash_fighter_win`. */
  fighterWin: 40,
  /** Losing debater, and each debater on a DRAW: `clash_fighter_participation`. */
  fighterParticipate: 15,

  // ── Juror awards (voting) ──────────────────────────────────────────────────
  /** Winning-side juror: `clash_participation` + `clash_win` = 120. */
  participate: 15,
  /** Win bonus on top of participation — 15 + 105 = 120 for a winning-side juror. */
  winBonus: 105,
  /** Dissenting juror credit: `clash_dissent` (+18 coins on the server). */
  dissent: 10,

  // ── Other ──────────────────────────────────────────────────────────────────
  /** "Creating popular Take: +30 XP". */
  popularTake: 30,
  /** "Entering Hall of Fame: +500 XP" (Phase 2). */
  hallOfFame: 500,
} as const;

/** "Winning Clash: +120 XP" for a WINNING-SIDE JUROR — participation + bonus. */
export const JUROR_CLASH_WIN_TOTAL = XP.participate + XP.winBonus;

/** Total for a winning debater. Fighter awards carry no coins. */
export const FIGHTER_CLASH_WIN_TOTAL = XP.fighterWin;

/** Total for a losing debater, identical to a DRAW debater. */
export const FIGHTER_CLASH_LOSS_TOTAL = XP.fighterParticipate;

/**
 * @deprecated Ambiguous name. The value is the JUROR total (120), not a
 * fighter's. Use {@link JUROR_CLASH_WIN_TOTAL} or
 * {@link FIGHTER_CLASH_WIN_TOTAL} so the actor is explicit.
 */
export const CLASH_WIN_TOTAL = JUROR_CLASH_WIN_TOTAL;

/** Human label for how a JUROR's ballot compared to the settled winner. */
export function awardDescription(alignment: Alignment): string {
  if (alignment === 'majority') return 'Your judgement matched the jury';
  if (alignment === 'minority') return 'You backed the losing side — dissent logged';
  return 'You abstained, so the jury decided';
}

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
