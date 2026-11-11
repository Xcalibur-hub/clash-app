import type { ArenaRoom } from '../services/liveArenaService';

export type PhaseClock = { phase: ArenaRoom['phase']; deadline: number; seconds: number; received: number; latency: number };
/** Anchor to the server's remaining seconds, not the phone's wall clock. */
export function phaseClock(room: ArenaRoom, received: number, latency: number): PhaseClock | undefined {
  const phase = room.phase;
  const deadline = phase === 'open' ? room.topic.finalArgumentsAt
    : phase === 'final_arguments' ? room.topic.judgingAt : phase === 'judging' ? room.closesAt : NaN;
  const seconds = phase === 'open' ? room.secondsToFinalArguments
    : phase === 'final_arguments' ? room.secondsToJudging : room.secondsRemaining;
  if (!Number.isFinite(deadline) || !Number.isFinite(seconds) || seconds < 0
    || !Number.isFinite(received) || !Number.isFinite(latency) || latency < 0 || latency > 10_000) return;
  return { phase, deadline, seconds, received, latency };
}

export function phaseTimeLabel(clock: PhaseClock | undefined, now: number, stale = false): string {
  if (!clock || stale || !Number.isFinite(now) || now < clock.received) return 'Phase timing unavailable — refresh to verify.';
  // Server values are floored and transit time is uncertain; display an estimate.
  const seconds = Math.max(0, Math.floor(clock.seconds - (now - clock.received + clock.latency) / 1000));
  if (!seconds) return 'Phase deadline reached — awaiting server confirmation.';
  const label = clock.phase === 'open' ? 'Final arguments' : clock.phase === 'final_arguments' ? 'Judging' : 'Voting closes';
  return `${label} in about ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
