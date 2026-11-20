/**
 * Client-side Pulse scoring mirrors the server RPC rules for unit tests.
 * Production leaders come from `get_arena_room_pulse` — never invent awards.
 *
 * Scoring (deterministic):
 *
 * TOP ARGUMENT — root messages only; score = non-self reaction total;
 *   eligibility: score >= 3. At SETTLED, prefer server best_argument if present.
 *
 * BEST EVIDENCE — evidence rows; score = useful_count; eligibility: useful >= 1.
 *   Self-marks are already refused by the server.
 *
 * BEST REBUTTAL — replies only; score = non-self reaction total; eligibility: score >= 2.
 *
 * FAST RISING — messages aged 30s–30m; score = floor(reactions * 60 / ageSeconds);
 *   eligibility: reactions >= 2 and score >= 2. Protects tiny-sample explosions.
 *
 * CROWD FAVORITE (SETTLED only) — best_argument_author from arena_room_results
 *   when that field exists (same as TOP when best argument is set).
 *
 * Self-reactions: possible in DB today; Pulse scoring excludes author=reactor.
 * Hidden / moderated messages: excluded (hidden_at not null).
 */

export type PulseCategoryKey =
  | 'TOP_ARGUMENT'
  | 'BEST_EVIDENCE'
  | 'BEST_REBUTTAL'
  | 'FAST_RISING'
  | 'CROWD_FAVORITE';

export interface PulseCandidateInput {
  id: string;
  authorId: string;
  authorHandle: string;
  authorName: string;
  authorTint: string;
  parentMessageId: string | null;
  createdAt: number;
  reactionTotal: number;
  /** Reactions excluding author self-reacts. */
  nonSelfReactionTotal: number;
  hidden: boolean;
  bodyPreview: string;
}

export interface PulseEvidenceInput {
  id: string;
  authorId: string;
  authorHandle: string;
  authorName: string;
  authorTint: string;
  usefulCount: number;
  hidden: boolean;
  title: string;
}

export interface PulseLeader {
  category: PulseCategoryKey;
  label: string;
  messageId: string | null;
  evidenceId: string | null;
  authorId: string;
  authorHandle: string;
  authorName: string;
  authorTint: string;
  score: number;
  preview: string;
}

const LABELS: Record<PulseCategoryKey, string> = {
  TOP_ARGUMENT: 'Top Argument',
  BEST_EVIDENCE: 'Best Evidence',
  BEST_REBUTTAL: 'Best Rebuttal',
  FAST_RISING: 'Fast Rising',
  CROWD_FAVORITE: 'Crowd Favorite',
};

export function fastRisingScore(nonSelfReactions: number, ageSeconds: number): number {
  const age = Math.max(30, ageSeconds);
  if (nonSelfReactions < 2) return 0;
  return Math.floor((nonSelfReactions * 60) / age);
}

export function pickTopArgument(
  messages: readonly PulseCandidateInput[],
  settledBestMessageId: string | null = null,
): PulseLeader | null {
  if (settledBestMessageId) {
    const best = messages.find((m) => m.id === settledBestMessageId && !m.hidden);
    if (best) {
      return {
        category: 'TOP_ARGUMENT',
        label: LABELS.TOP_ARGUMENT,
        messageId: best.id,
        evidenceId: null,
        authorId: best.authorId,
        authorHandle: best.authorHandle,
        authorName: best.authorName,
        authorTint: best.authorTint,
        score: best.nonSelfReactionTotal,
        preview: best.bodyPreview,
      };
    }
  }
  const roots = messages.filter(
    (m) => !m.hidden && !m.parentMessageId && m.nonSelfReactionTotal >= 3,
  );
  roots.sort(
    (a, b) =>
      b.nonSelfReactionTotal - a.nonSelfReactionTotal ||
      b.createdAt - a.createdAt ||
      b.id.localeCompare(a.id),
  );
  const top = roots[0];
  if (!top) return null;
  return {
    category: 'TOP_ARGUMENT',
    label: LABELS.TOP_ARGUMENT,
    messageId: top.id,
    evidenceId: null,
    authorId: top.authorId,
    authorHandle: top.authorHandle,
    authorName: top.authorName,
    authorTint: top.authorTint,
    score: top.nonSelfReactionTotal,
    preview: top.bodyPreview,
  };
}

export function pickBestEvidence(
  evidence: readonly PulseEvidenceInput[],
): PulseLeader | null {
  const eligible = evidence.filter((e) => !e.hidden && e.usefulCount >= 1);
  eligible.sort(
    (a, b) => b.usefulCount - a.usefulCount || b.id.localeCompare(a.id),
  );
  const top = eligible[0];
  if (!top) return null;
  return {
    category: 'BEST_EVIDENCE',
    label: LABELS.BEST_EVIDENCE,
    messageId: null,
    evidenceId: top.id,
    authorId: top.authorId,
    authorHandle: top.authorHandle,
    authorName: top.authorName,
    authorTint: top.authorTint,
    score: top.usefulCount,
    preview: top.title,
  };
}

export function pickBestRebuttal(
  messages: readonly PulseCandidateInput[],
): PulseLeader | null {
  const replies = messages.filter(
    (m) => !m.hidden && m.parentMessageId && m.nonSelfReactionTotal >= 2,
  );
  replies.sort(
    (a, b) =>
      b.nonSelfReactionTotal - a.nonSelfReactionTotal ||
      b.createdAt - a.createdAt ||
      b.id.localeCompare(a.id),
  );
  const top = replies[0];
  if (!top) return null;
  return {
    category: 'BEST_REBUTTAL',
    label: LABELS.BEST_REBUTTAL,
    messageId: top.id,
    evidenceId: null,
    authorId: top.authorId,
    authorHandle: top.authorHandle,
    authorName: top.authorName,
    authorTint: top.authorTint,
    score: top.nonSelfReactionTotal,
    preview: top.bodyPreview,
  };
}

export function pickFastRising(
  messages: readonly PulseCandidateInput[],
  now: number,
): PulseLeader | null {
  const minAge = 30_000;
  const maxAge = 30 * 60_000;
  const eligible = messages
    .filter((m) => {
      if (m.hidden) return false;
      const age = now - m.createdAt;
      if (age < minAge || age > maxAge) return false;
      return fastRisingScore(m.nonSelfReactionTotal, age / 1000) >= 2;
    })
    .map((m) => ({
      m,
      score: fastRisingScore(m.nonSelfReactionTotal, (now - m.createdAt) / 1000),
    }));
  eligible.sort(
    (a, b) => b.score - a.score || b.m.createdAt - a.m.createdAt || b.m.id.localeCompare(a.m.id),
  );
  const top = eligible[0];
  if (!top) return null;
  return {
    category: 'FAST_RISING',
    label: LABELS.FAST_RISING,
    messageId: top.m.id,
    evidenceId: null,
    authorId: top.m.authorId,
    authorHandle: top.m.authorHandle,
    authorName: top.m.authorName,
    authorTint: top.m.authorTint,
    score: top.score,
    preview: top.m.bodyPreview,
  };
}

export function buildPulseLeaders(input: {
  messages: readonly PulseCandidateInput[];
  evidence: readonly PulseEvidenceInput[];
  now: number;
  settled: boolean;
  settledBestMessageId: string | null;
  settledBestAuthor: {
    id: string;
    handle: string;
    name: string;
    tint: string;
  } | null;
}): PulseLeader[] {
  const out: PulseLeader[] = [];
  const top = pickTopArgument(input.messages, input.settledBestMessageId);
  if (top) out.push(top);
  const evidence = pickBestEvidence(input.evidence);
  if (evidence) out.push(evidence);
  const rebuttal = pickBestRebuttal(input.messages);
  if (rebuttal) out.push(rebuttal);
  const rising = pickFastRising(input.messages, input.now);
  if (rising) out.push(rising);
  if (input.settled && input.settledBestAuthor) {
    out.push({
      category: 'CROWD_FAVORITE',
      label: LABELS.CROWD_FAVORITE,
      messageId: input.settledBestMessageId,
      evidenceId: null,
      authorId: input.settledBestAuthor.id,
      authorHandle: input.settledBestAuthor.handle,
      authorName: input.settledBestAuthor.name,
      authorTint: input.settledBestAuthor.tint,
      score: top?.score ?? 0,
      preview: top?.preview ?? '',
    });
  }
  return out;
}

export function pulseAccessibilitySummary(leaders: readonly PulseLeader[]): string {
  if (leaders.length === 0) return 'Room Pulse. No qualifying candidates yet.';
  const parts = leaders.map((l) => `${l.label}: ${l.authorName}`);
  return `Room Pulse. ${parts.join('. ')}.`;
}

/** Detect category leader changes for restrained event pills. */
export function pulseLeaderChanges(
  previous: readonly PulseLeader[],
  next: readonly PulseLeader[],
): { category: PulseCategoryKey; authorName: string }[] {
  const prevMap = new Map(previous.map((l) => [l.category, l.authorId]));
  const changes: { category: PulseCategoryKey; authorName: string }[] = [];
  for (const leader of next) {
    const was = prevMap.get(leader.category);
    if (was && was !== leader.authorId) {
      changes.push({ category: leader.category, authorName: leader.authorName });
    }
  }
  return changes;
}
