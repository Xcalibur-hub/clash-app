import React from 'react';

export type ReadStatus = 'loading' | 'ready' | 'missing' | 'denied' | 'unavailable' | 'error';

function failureStatus(error: unknown): ReadStatus {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === '42501' || code === 'PGRST301' || code === '401' || code === '403' || code === 'auth_required' || code === 'media_access_denied') return 'denied';
  return code === 'not_configured' ? 'unavailable' : 'error';
}

/** UI reads only: retry explicitly, discard late results, hide prior-account data immediately. */
export function useRetryableRead<T>(load: () => Promise<T | null>, scope: string | null) {
  const [attempt, setAttempt] = React.useState(0);
  const [result, setResult] = React.useState<{
    scope: string | null; attempt: number; load: typeof load; status: ReadStatus; data: T | null;
  } | null>(null);
  React.useEffect(() => {
    if (scope === null) return;
    let active = true;
    void (async () => {
      try {
        const data = await load();
        if (active) setResult({ scope, attempt, load, status: data === null ? 'missing' : 'ready', data });
      } catch (error) {
        if (active) setResult({ scope, attempt, load, status: failureStatus(error), data: null });
      }
    })();
    return () => { active = false; };
  }, [load, scope, attempt]);
  const current = result?.scope === scope && result.attempt === attempt && result.load === load;
  return {
    status: scope === null ? 'unavailable' as const : current ? result.status : 'loading' as const,
    data: current && scope !== null ? result.data : null,
    retry: React.useCallback(() => setAttempt(value => value + 1), []),
  };
}
