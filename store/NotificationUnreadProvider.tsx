import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { currentViewerProfileId } from '../services/apiService';
import { fetchUnreadCount } from '../services/notificationService';
import { useAuth } from './AuthProvider';
import { currentUserId } from '../services/supabaseClient';

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
  const { user } = useAuth();
  const owner = user?.id ?? null;
  const [snapshot, setSnapshot] = useState<{owner:string;unread:number}|null>(null);
  const generation = React.useRef(0);
  const unread = snapshot?.owner === owner ? snapshot?.unread ?? 0 : 0;

  const refresh = useCallback(async (): Promise<void> => {
    const request = ++generation.current;
    if (!owner) {setSnapshot(null);return;}
    try {
      const profileId = await currentViewerProfileId();
      if (!profileId || request !== generation.current || await currentUserId() !== owner) return;
      const count = await fetchUnreadCount(profileId);
      if (request === generation.current && await currentUserId() === owner) setSnapshot({owner,unread:count});
    } catch {
      // Keep the last count; the next focus or mark-all reconciles it.
    }
  }, [owner]);

  useEffect(() => {
    void refresh();
    return () => {generation.current++;};
  }, [refresh]);

  const value = useMemo<UnreadContextValue>(() => ({ unread, refresh }), [unread, refresh]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useNotificationUnread(): UnreadContextValue {
  return useContext(UnreadContext);
}
