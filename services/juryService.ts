import { JUROR_POOL } from '../data/mockJury';
import type { Alignment, Judgement, Juror, JuryScore, Side } from '../store/types';

/**
 * THE MOCK JURY ENGINE (spec §9).
 *
 * `selectJurors` / `calculateResult` / `submitJudgement` are the only entry
 * points the UI touches. In production this whole module is replaced by a
 * Supabase edge function that:
 *
 *   1. selects eligible jurors server-side (never the two debaters, never the
 *      viewer) and stores the roster,
 *   2. enforces one ballot per account / device before a verdict is written,
 *   3. applies anti-abuse weighting through `Juror.weight`,
 *   4. returns a signed verdict the client cannot forge.
 *
 * No device fingerprinting exists in this prototype (spec §9).
 */

export const JURY_SIZE = 9;

export interface SelectJurorsOptions {
  /** Seats to fill. The Arena always convenes 9. */
  size?: number;
  /** Ids that must never be seated — the two debaters, and the viewer. */
  excludeUserIds?: readonly string[];
}

/** FNV-1a — stable 32-bit hash so a Clash always convenes the same jury. */
function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 — deterministic PRNG standing in for the server's random source. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Convene a jury for a Clash. Ballots land inside a believable band (5–7 for
 * the winning side of nine) so verdicts read like real disagreements instead of
 * coin flips, and the same Clash always convenes the same nine people.
 */
export function selectJurors(clashId: string, options: SelectJurorsOptions = {}): Juror[] {
  const size = options.size ?? JURY_SIZE;
  const excluded = new Set(options.excludeUserIds ?? []);
  const random = createRandom(hashKey(clashId));

  const eligible = JUROR_POOL.filter((identity) => !excluded.has(identity.id));
  const seated = shuffle(eligible, random).slice(0, Math.min(size, eligible.length));

  const majoritySide: Side = random() < 0.5 ? 'A' : 'B';
  const minoritySide: Side = majoritySide === 'A' ? 'B' : 'A';
  const minorityCount = Math.max(
    1,
    Math.min(2 + Math.floor(random() * 3), Math.floor((seated.length - 1) / 2)),
  );
  const ballots = shuffle<Side>(
    [
      ...Array.from({ length: seated.length - minorityCount }, () => majoritySide),
      ...Array.from({ length: minorityCount }, () => minoritySide),
    ],
    random,
  );

  return seated.map((identity, index) => ({
    id: identity.id,
    handle: identity.handle,
    tint: identity.tint,
    vote: ballots[index] ?? majoritySide,
    // Neutral in the prototype. The future anti-abuse service raises this for
    // trusted jurors; the tally already sums weights instead of ballots.
    weight: 1,
  }));
}

export interface JurySummary {
  /** Number of jurors who actually cast a ballot. */
  size: number;
  score: JuryScore;
  winningSide: Side;
  /** Gap between the two sides. */
  margin: number;
  verdict: string;
  /** Share of ballots behind the winning side (0..1). */
  agreement: number;
  unanimous: boolean;
}

function verdictLabel(margin: number, majority: number): string {
  if (majority === 0) return 'NO JURY CONVENED';
  if (margin <= 1) return 'SPLIT DECISION';
  if (margin <= 3) return 'CLEAR DECISION';
  return 'LANDSLIDE';
}

/** Tally the jury and derive the winning side (spec §9). */
export function calculateResult(jurors: readonly Juror[]): JurySummary {
  const score = jurors.reduce<JuryScore>(
    (tally, juror) =>
      juror.vote === 'A'
        ? { ...tally, a: tally.a + juror.weight }
        : { ...tally, b: tally.b + juror.weight },
    { a: 0, b: 0 },
  );
  const total = score.a + score.b;
  const winningSide: Side = score.b > score.a ? 'B' : 'A';
  const top = Math.max(score.a, score.b);
  const margin = Math.abs(score.a - score.b);
  return {
    size: jurors.length,
    score,
    winningSide,
    margin,
    verdict: verdictLabel(margin, top),
    agreement: total > 0 ? top / total : 0,
    unanimous: total > 0 && margin === total,
  };
}

export interface JuryVerdict extends JurySummary {
  /** How the viewer's ballot compared to the jury. */
  alignment: Alignment;
}

/**
 * File the viewer's ballot and return the settled verdict. A judgement never
 * rewrites anyone else's ballot — it only decides the "you called it / you were
 * outvoted" moment on the result screen. Re-voting is blocked by the store.
 */
export function submitJudgement(jurors: readonly Juror[], judgement: Judgement): JuryVerdict {
  const summary = calculateResult(jurors);
  const alignment: Alignment =
    judgement === 'UNDECIDED'
      ? 'abstained'
      : judgement === summary.winningSide
        ? 'majority'
        : 'minority';
  return { ...summary, alignment };
}
