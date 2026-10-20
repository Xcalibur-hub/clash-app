/**
 * Acknowledges overflow recovery only after authoritative loaded-scope coverage.
 * Cancelled or failed refreshes leave the request pending for a later attempt.
 */
import type { createReactionQueue } from './reactionOptimism.ts';

export async function recoverOverflowAfterRefresh(input: {
  queue: ReturnType<typeof createReactionQueue>;
  isLoaded: (id: string) => boolean;
  active: () => boolean;
  limit?: number;
}): Promise<boolean> {
  if (!input.active()) return false;
  const result = await input.queue.recoverDropped(input.isLoaded, input.limit ?? 20);
  if (!input.active()) return false;
  if (result.remainingLoaded > 0) return false;
  return input.queue.consumeOverflowRequest();
}
