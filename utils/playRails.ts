export type PlayChallengeRailItem = {
  id: string;
  status: string;
  endsAt: number;
  challengeType: 'GLOBAL' | 'COUNTRY' | 'CREATOR';
  joined: boolean;
};

export type PlayTreasureRailItem = {
  id: string;
  status: string;
  endsAt: number;
  huntType: 'GLOBAL' | 'COUNTRY' | 'CREATOR';
  progress: number;
  completed: boolean;
  giftsRemaining: number | null;
};

/** Pure helpers for Play home rails — unit-tested. */
export function partitionPlayChallenges<T extends PlayChallengeRailItem>(
  items: T[],
  now = Date.now(),
) {
  const active = items.filter((c) => c.status === 'active' && c.endsAt > now);
  const featured = active.slice(0, 3);
  const endingSoon = [...active].sort((a, b) => a.endsAt - b.endsAt).slice(0, 6);
  const global = active.filter((c) => c.challengeType === 'GLOBAL');
  const country = active.filter((c) => c.challengeType === 'COUNTRY');
  const creator = active.filter((c) => c.challengeType === 'CREATOR');
  const joined = items.filter((c) => c.joined);
  return { featured, endingSoon, global, country, creator, joined };
}

export function partitionPlayTreasures<T extends PlayTreasureRailItem>(
  items: T[],
  now = Date.now(),
) {
  const active = items.filter((t) => t.status === 'active' && t.endsAt > now);
  const featured = active.slice(0, 3);
  const endingSoon = [...active].sort((a, b) => a.endsAt - b.endsAt).slice(0, 6);
  const global = active.filter((t) => t.huntType === 'GLOBAL');
  const country = active.filter((t) => t.huntType === 'COUNTRY');
  const creator = active.filter((t) => t.huntType === 'CREATOR');
  const inProgress = items.filter((t) => t.progress > 0 || t.completed);
  return { featured, endingSoon, global, country, creator, inProgress };
}
