import type { User } from '../store/types';

/** Settled Clash aggregates from `profile_clash_stats` (authoritative). */
export interface ProfileClashStats {
  clashes: number;
  wins: number;
  losses: number;
  draws: number;
}

export function parseProfileClashStats(payload: unknown): ProfileClashStats | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as { [key: string]: unknown };
  const clashes = record.clashes;
  const wins = record.wins;
  const losses = record.losses;
  const draws = record.draws;
  if (
    typeof clashes !== 'number' ||
    typeof wins !== 'number' ||
    typeof losses !== 'number' ||
    typeof draws !== 'number' ||
    !Number.isFinite(clashes) ||
    !Number.isFinite(wins) ||
    !Number.isFinite(losses) ||
    !Number.isFinite(draws) ||
    clashes < 0 ||
    wins < 0 ||
    losses < 0 ||
    draws < 0
  ) {
    return null;
  }
  return { clashes, wins, losses, draws };
}

export function withClashStats(user: User, stats: ProfileClashStats): User {
  return { ...user, clashes: stats.clashes, wins: stats.wins };
}
