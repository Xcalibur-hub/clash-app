import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../store/AuthProvider';

/**
 * The one reusable gate for account-owned actions. Call it at the top of a
 * protected handler; it returns true when signed in, and otherwise routes to the
 * auth flow and returns false — so the caller just bails out.
 *
 *   if (!requireAuth()) return;
 */
export function useRequireAuth(): () => boolean {
  const { signedIn, loading } = useAuth();
  const router = useRouter();

  return useCallback((): boolean => {
    if (loading) return false;
    if (signedIn) return true;
    router.push('/auth');
    return false;
  }, [loading, signedIn, router]);
}
