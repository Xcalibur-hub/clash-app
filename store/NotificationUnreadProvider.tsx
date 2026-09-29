import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { currentViewerProfileId } from '../services/apiService';
import { fetchUnreadCount } from '../services/notificationService';
import { useAuth } from './AuthProvider';

/**
 * One shared unread count for the Activity tab. The badge lives in the dock, so
 * the count must be visible to `RealmTabBar` and refreshed by the notifications
 * screen (focus + mark-all). Zero for guests — never a seeded number.
 */

interface UnreadContextValue {
  unread: number;
  refresh: () => Promise<void>;
}

const UnreadContext = createContext<UnreadContextValue>({
  unread: 0,
  refresh: async () => undefined,
});

export function NotificationUnreadProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { signedIn } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async (): Promise<void> => {
    const profileId = await currentViewerProfileId();
    if (!profileId) {
      setUnread(0);
      return;
    }
    try {
      setUnread(await fetchUnreadCount(profileId));
    } catch {
      // Keep the last count; the next focus or mark-all reconciles it.
    }
  }, []);

  useEffect(() => {
    if (signedIn) {
      void refresh();
    } else {
      setUnread(0);
    }
  }, [signedIn, refresh]);

  const value = useMemo<UnreadContextValue>(() => ({ unread, refresh }), [unread, refresh]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useNotificationUnread(): UnreadContextValue {
  return useContext(UnreadContext);
}
