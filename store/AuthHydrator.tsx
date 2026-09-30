import React from 'react';
import { GUEST_VIEWER } from '../data/mockUsers';
import { analytics } from '../services/analytics';
import { fetchViewerProfile } from '../services/apiService';
import { logger } from '../services/logger';
import { setSentryUser } from '../services/sentry';
import { setViewer } from './actions';
import { useAuth } from './AuthProvider';
import { useClash } from './ClashStore';

/**
 * Bridges auth into the Clash store: whenever the signed-in user changes, the
 * store's viewer becomes that user's real profile; when they sign out, it returns
 * to the guest identity. Mock `u-viewer` is fixture-only and never the signed-in identity.
 */
export function AuthHydrator(): null {
  const { user, loading } = useAuth();
  const { dispatch, reloadArena } = useClash();
  const uid = user?.id ?? null;
  const prevUid = React.useRef<string | null>(uid);

  React.useEffect(() => {
    if (loading) return;
    // Opaque auth id only — never email or profile PII.
    setSentryUser(uid);
    if (uid) analytics.identify(uid);
    else analytics.reset();
  }, [loading, uid]);

  React.useEffect(() => {
    if (loading) return undefined;
    if (uid === prevUid.current) return undefined;
    prevUid.current = uid;

    let cancelled = false;
    void (async () => {
      let viewer = GUEST_VIEWER;
      if (uid) {
        try {
          const resolved = await fetchViewerProfile();
          if (resolved) viewer = resolved;
        } catch (error) {
          logger.captureException(error, { source: 'auth-hydrator' });
          viewer = GUEST_VIEWER;
        }
      }
      if (cancelled) return;
      dispatch(setViewer(viewer));
      // Re-hydrate so the feed reflects the new identity's safety (block/mute),
      // reaction, upvote and viewer state — signing in mid-session filters the
      // feed, signing out returns to the public guest snapshot.
      void reloadArena();
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, uid, dispatch, reloadArena]);

  return null;
}
