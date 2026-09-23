import { useEffect, useState } from 'react';

/**
 * A slow ticking clock for the 24-hour countdowns. 30s is plenty of resolution
 * for "2h 41m left" and keeps both feeds from re-rendering every second.
 */
export function useClock(intervalMs = 30_000): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
