/**
 * Acknowledges overflow recovery only after authoritative loaded-scope coverage.
 * Scope generation and activity are verified before and after every await.
 */
import type { createReactionQueue } from './reactionOptimism.ts';

export async function recoverOverflowAfterRefresh(input: {
  queue: ReturnType<typeof createReactionQueue>;
  isLoaded: (id: string) => boolean;
  loadedIds: readonly string[];
  active: () => boolean;
  generation: number;
  currentGeneration: () => number;
  limit?: number;
}): Promise<boolean> {
  const valid = (): boolean => input.active() && input.generation === input.currentGeneration();
  if (!valid()) return false;
  const result = await input.queue.recoverDropped({
    isLoaded: input.isLoaded,
    loadedIds: input.loadedIds,
    active: input.active,
    generation: input.generation,
    currentGeneration: input.currentGeneration,
    limit: input.limit,
  });
  if (!valid()) return false;
  if (result.remainingLoaded > 0 || result.deficit > 0) return false;
  return input.queue.consumeOverflowRequest();
}
