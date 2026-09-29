/**
 * Notifications. Rows are written server-side (see the `notify_new_follower`
 * trigger); the client only reads its own and marks them read.
 */

import { currentViewerProfileId } from './apiService';
import { requestError, requireSupabase } from './supabaseClient';
import type { NotificationKind, ReportTarget } from '../supabase/types';

export interface AppNotification {
  id: string;
  actorId: string | null;
  kind: NotificationKind;
  entityType: ReportTarget | null;
  entityId: string | null;
  createdAt: number;
  readAt: number | null;
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const me = await currentViewerProfileId();
  if (!me) return [];
  const { data, error } = await requireSupabase()
    .from('notifications')
    .select('*')
    .eq('recipient_id', me)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw requestError(error);
  return data.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    kind: row.kind,
    entityType: row.entity_type,
    entityId: row.entity_id,
    createdAt: Date.parse(row.created_at),
    readAt: row.read_at ? Date.parse(row.read_at) : null,
  }));
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw requestError(error);
}

export async function markAllNotificationsRead(): Promise<void> {
  const me = await currentViewerProfileId();
  if (!me) return;
  const { error } = await requireSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', me)
    .is('read_at', null);
  if (error) throw requestError(error);
}

/** Number of unread notifications for the viewer (drives the Activity badge). */
export async function fetchUnreadCount(profileId: string): Promise<number> {
  const { count, error } = await requireSupabase()
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', profileId)
    .is('read_at', null);
  if (error) throw requestError(error);
  return count ?? 0;
}
