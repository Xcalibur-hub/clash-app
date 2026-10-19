/**
 * Shared vocabulary for the Live Daily Arena surfaces.
 *
 * Calm premium: warm white in light, near-black in dark, soft radii, hairline
 * edges. No neon, no gaming HUD, no full-bleed gradients — the only moving part
 * is a slow live pulse.
 */
import type { SemanticTheme } from '../../theme';
import type { ArenaPhase, ArenaRoomStatus, ArenaWinningSide } from '../../services/liveArenaService';
import type { Stance } from '../../services/mindshiftService';

/** Live dot + LIVE wordmark tint. Restrained red, not an alert. */
export const LIVE_TINT = '#E5484D';

/** Opacity floor/ceiling of the live pulse, tuned to read as breathing. */
export const PULSE_MIN = 0.35;
export const PULSE_MAX = 1;

export const STANCE_LABEL: Record<Stance, string> = {
  AGREE: 'Agree',
  UNSURE: 'Unsure',
  DISAGREE: 'Disagree',
};

const PHASE_LABEL: Record<ArenaPhase, string> = {
  scheduled: 'Opens soon',
  open: 'Open floor',
  final_arguments: 'Final arguments',
  judging: 'Judging',
  closed: 'Closed',
};

/** Human phase name. Derived from the server clock, never a device timestamp. */
export function phaseLabel(phase: ArenaPhase): string {
  return PHASE_LABEL[phase];
}

const ROOM_STATUS_LABEL: Record<ArenaRoomStatus, string> = {
  OPEN: 'Open floor',
  FINAL_ARGUMENTS: 'Final arguments',
  JUDGING: 'Judging',
  SETTLED: 'Settled',
  CANCELLED: 'No verdict',
};

export function roomStatusLabel(status: ArenaRoomStatus): string {
  return ROOM_STATUS_LABEL[status];
}

export function winningSideLabel(side: ArenaWinningSide): string {
  if (side === 'DRAW') return 'Draw';
  return side === 'AGREE' ? 'Agree' : 'Disagree';
}

/** "4h 12m" / "18m" / "under a minute" from a whole-second server remainder. */
export function secondsLabel(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) return 'under a minute';
  const minutes = Math.floor(safe / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** The soft tinted plate used for chips and inline stats. */
export function softFill(t: SemanticTheme): string {
  return t.scheme === 'light' ? 'rgba(17,17,19,0.04)' : 'rgba(255,255,255,0.05)';
}

/** `#RRGGBB` → `rgba(...)`; anything else degrades to a neutral hairline. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
  if (!match) return `rgba(128,128,128,${a})`;
  const value = parseInt(match[1] as string, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/** Hairline that tints a fighter's plate without competing with its type. */
export function sidePlateBorder(tint: string, scheme: 'light' | 'dark'): string {
  return hexWithAlpha(tint, scheme === 'light' ? 0.28 : 0.34);
}

export interface MatchupMetrics {
  /** Narrow screen or enlarged system font: tighten the two columns. */
  compact: boolean;
  avatarSize: number;
  /** Fighter name size, in points (scaled by the system, never capped). */
  nameSize: number;
  /** Lines the fighter's stated position may occupy. */
  positionLines: number;
  /** Offset that keeps VS optically centred against the avatar. */
  vsMarginTop: number;
}

/**
 * Responsive rule for the approved fighter-versus-fighter split: one fighter on
 * each side of a centred VS. Narrow widths and enlarged fonts tighten the
 * columns so the split, the proposition and the phase rail never collide.
 */
export function matchupMetrics({
  width,
  fontScale,
}: {
  width: number;
  fontScale: number;
}): MatchupMetrics {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 360;
  const safeScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const compact = safeWidth < 380 || safeScale >= 1.25;
  return {
    compact,
    avatarSize: compact ? 44 : 56,
    nameSize: compact ? 15 : 17,
    positionLines: compact ? 3 : 2,
    vsMarginTop: compact ? 30 : 44,
  };
}


/** Soft chip fill for role/state labels inside the stage. */
export function chipFill(t: Pick<SemanticTheme, 'scheme'>): string {
  return t.scheme === 'light' ? 'rgba(17,17,19,0.06)' : 'rgba(255,255,255,0.07)';
}

/**
 * Screen-reader label for a chat row: whitespace collapsed and length bounded so
 * one long message cannot become an unbounded announcement.
 */
export function crowdRowLabel(handle: string, body: string, max = 240): string {
  const who = handle.trim().replace(/^@+/, '');
  const said = body.replace(/\s+/g, ' ').trim();
  const line = `@${who}: ${said}`;
  const limit = Number.isFinite(max) && max > 8 ? Math.floor(max) : 240;
  return line.length <= limit ? line : `${line.slice(0, limit - 1).trimEnd()}…`;
}

/** Announcement for a server-reported phase change (never a device clock). */
export function phaseAnnouncement(status: ArenaRoomStatus): string {
  return `Clash phase: ${ROOM_STATUS_LABEL[status]}`;
}
/**
 * Plate fill behind a fighter side of the Stage. Derived from that fighter real
 * tint, so red and blue stay distinguishable without inventing a colour.
 */
export function sidePlateFill(tint: string, scheme: 'light' | 'dark'): string {
  return hexWithAlpha(tint, scheme === 'light' ? 0.06 : 0.1);
}

export interface ReactionBurstSignal {
  emoji: string;
  /** Replay token: changes only when the real count behind it changed. */
  key: string;
}

export interface ReactionCount {
  emoji: string;
  count: number;
}

/**
 * A burst is allowed only when a real reaction count on the current message
 * rises. The first observation of a message is a baseline (no burst on paint),
 * decreases and unchanged counts are ignored, and the count itself is never
 * returned - only the emoji - so no tally is exposed before settlement.
 */
export function reactionBurstFor(
  previous: readonly ReactionCount[] | null,
  next: readonly ReactionCount[] | null,
  messageId: string | null,
): ReactionBurstSignal | null {
  if (!messageId || !next || next.length === 0 || !previous) return null;
  const before = new Map(previous.map((row) => [row.emoji, row.count]));
  let best: { emoji: string; delta: number } | null = null;
  for (const row of next) {
    if (!row.emoji || !Number.isFinite(row.count)) continue;
    const delta = row.count - (before.get(row.emoji) ?? 0);
    if (delta > 0 && (best === null || delta > best.delta)) best = { emoji: row.emoji, delta };
  }
  if (best === null) return null;
  const total = next.find((row) => row.emoji === best.emoji)?.count ?? 0;
  return { emoji: best.emoji, key: `${messageId}:${best.emoji}:${total}` };
}
export interface VerdictMetrics {
  /** Narrow screen or enlarged system font: tighten the result sheet. */
  compact: boolean;
  titleSize: number;
  titleLineHeight: number;
  pctSize: number;
  pctMinWidth: number;
  /** Lines a fighter name may use before truncating. */
  nameLines: number;
}

/**
 * Responsive rule for the verdict sheet. On a 320dp screen, or with an enlarged
 * system font, the headline and percentages shrink slightly and a fighter name
 * may wrap to two lines instead of truncating. 430dp and above keep the larger
 * type. Nothing here is decorative: the sheet has no overlay to reserve space for.
 */
export function verdictMetrics({ width, fontScale }: { width: number; fontScale: number }): VerdictMetrics {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 360;
  const safeScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const compact = safeWidth < 380 || safeScale >= 1.25;
  return {
    compact,
    titleSize: compact ? 21 : 24,
    titleLineHeight: compact ? 26 : 30,
    pctSize: compact ? 20 : 24,
    pctMinWidth: compact ? 48 : 56,
    nameLines: compact ? 2 : 1,
  };
}