/**
 * DEVELOPMENT-ONLY ranking-race preview fixture.
 *
 * WHY: real trend history only accumulates every ~10 minutes, so inspecting the
 * completed chart on-device would take hours. This fixture lets a developer see
 * the finished component immediately.
 *
 * HARD RULES (all enforced below):
 *   · `__DEV__` only — a release bundle can never enable it.
 *   · Also refused for the `preview`/`production` app variants.
 *   · Never inserts anything into Supabase, never calls a production RPC, never
 *     touches analytics and never changes a real ranking.
 *   · Clearly labelled "DEMO DATA" wherever it is shown.
 *
 * HOW TO ENABLE (two ways, both dev-only):
 *   1. Flip `ARENA_TREND_DEMO_ENABLED` below to `true`, or
 *   2. set `EXPO_PUBLIC_ARENA_TREND_DEMO=1` in `.env.local` and restart Metro.
 * Both are ignored in a production build.
 */

import type { ArenaTrendingBattle } from '../services/arenaTrendService';

/** Flip to `true` for on-device inspection. Ignored outside development. */
export const ARENA_TREND_DEMO_ENABLED = false;

export const ARENA_TREND_DEMO_LABEL = 'DEMO DATA';

type AppVariant = 'development' | 'preview' | 'production';

export function isArenaTrendDemoVariant(value: unknown): value is AppVariant {
  return value === 'development' || value === 'preview' || value === 'production';
}

/**
 * Pure gate, so a test can prove a production/preview variant can never show
 * demo data even with the toggle or the env var set.
 */
export function arenaTrendDemoEnabled(input: {
  dev: boolean;
  variant: AppVariant;
  toggle: boolean;
  envFlag: string | null;
}): boolean {
  if (!input.dev) return false;
  if (input.variant === 'preview' || input.variant === 'production') return false;
  return input.toggle || input.envFlag === '1';
}

/** Runtime gate used by the service (which owns the app-variant read). */
export function arenaTrendDemoActive(input: {
  dev: boolean;
  variant: AppVariant;
  envFlag: string | null;
}): boolean {
  return arenaTrendDemoEnabled({
    dev: input.dev,
    variant: input.variant,
    toggle: ARENA_TREND_DEMO_ENABLED,
    envFlag: input.envFlag,
  });
}

const BUCKET_MS = 30 * 60 * 1000;

interface DemoSeed {
  topicId: string;
  title: string;
  hood: string;
  /** Historical ranks, oldest → newest (1 = top). */
  ranks: number[];
  participantCount: number;
  hotRoomId: string | null;
}

/**
 * Deterministic sample: three battles that genuinely overtake each other, plus
 * enough subdued topics to fill a believable Top 10.
 */
const DEMO_SEEDS: DemoSeed[] = [
  {
    topicId: 'demo-ai-jobs',
    title: 'AI vs Jobs: will it take the work?',
    hood: 'techtakes',
    ranks: [1, 1, 2, 3],
    participantCount: 34,
    hotRoomId: 'demo-room-ai',
  },
  {
    topicId: 'demo-iphone-pixel',
    title: 'iPhone vs Pixel camera',
    hood: 'techtakes',
    ranks: [5, 4, 2, 1],
    participantCount: 41,
    hotRoomId: 'demo-room-pixel',
  },
  {
    topicId: 'demo-college',
    title: 'College worth it?',
    hood: 'campushustle',
    ranks: [3, 2, 1, 2],
    participantCount: 28,
    hotRoomId: 'demo-room-college',
  },
  { topicId: 'demo-var', title: 'VAR ruined football', hood: 'football', ranks: [6, 6, 5, 4], participantCount: 19, hotRoomId: null },
  { topicId: 'demo-marvel', title: 'Marvel is out of ideas', hood: 'movies', ranks: [7, 8, 7, 6], participantCount: 14, hotRoomId: null },
  { topicId: 'demo-gta', title: 'GTA VI will slip again', hood: 'gaming', ranks: [9, 7, 8, 7], participantCount: 11, hotRoomId: null },
  { topicId: 'demo-founders', title: 'Founders do not need MBAs', hood: 'startups', ranks: [8, 9, 9, 8], participantCount: 7, hotRoomId: null },
  { topicId: 'demo-music', title: 'Streaming killed albums', hood: 'goatalk', ranks: [4, 5, 6, 9], participantCount: 5, hotRoomId: null },
  { topicId: 'demo-bundles', title: 'Bundles are worth the money', hood: 'gaming', ranks: [10, 10, 10, 10], participantCount: 3, hotRoomId: null },
  { topicId: 'demo-remakes', title: 'Stop remaking classics', hood: 'movies', ranks: [2, 3, 4, 5], participantCount: 9, hotRoomId: null },
];

/**
 * Build the demo battles. `nowMs` is passed in so the fixture is deterministic
 * in tests; the four buckets end at `now`.
 */
export function arenaTrendDemoBattles(nowMs: number = Date.now()): ArenaTrendingBattle[] {
  const buckets = DEMO_SEEDS[0].ranks.map((_, i) => nowMs - (BUCKET_MS * (3 - i)));

  const battles: ArenaTrendingBattle[] = DEMO_SEEDS.map((seed) => ({
    rank: 0,
    topicId: seed.topicId,
    title: seed.title,
    hood: seed.hood,
    attentionScore: 0,
    weightedScore: 0,
    momentum: 'STEADY' as const,
    rankDelta: null,
    rankDeltaKind: 'INSUFFICIENT' as const,
    changePercent: null,
    topicStatus: 'live',
    participantCount: seed.participantCount,
    activeRoomCount: 1,
    hotRoomId: seed.hotRoomId,
    series: seed.ranks.map((v, i) => ({ t: buckets[i], v })),
    historyReady: true,
  }));

  // Current rank = the newest rank in each series, so the list and the chart agree.
  const byCurrentRank = [...battles].sort(
    (a, b) => currentRank(a.series) - currentRank(b.series) || a.topicId.localeCompare(b.topicId),
  );
  return byCurrentRank.map((battle, i) => ({ ...battle, rank: i + 1 })).slice(0, 10);
}

function currentRank(series: { t: number; v: number }[]): number {
  const last = series[series.length - 1];
  return last ? last.v : 99;
}
