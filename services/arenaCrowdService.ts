import { isSupabaseConfigured, requireSupabase, requestError } from './supabaseClient';
import { parseCrowdContext, parseCrowdMessage, parseCrowdPage, type CrowdMessage } from '../utils/arenaCrowd';

// Additive RPC contracts follow the existing expressive-media service boundary;
// validate all JSON at runtime rather than exposing database rows to the UI.
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const client = requireSupabase();
  const call = client.rpc.bind(client) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Parameters<typeof requestError>[0] | null }>;
  const { data, error } = await call(name, args);
  if (error) throw requestError(error);
  return data;
}
export async function fetchCrowdContext(roomId: string) {
  return parseCrowdContext(await rpc('get_arena_crowd', { p_room_id: roomId }), roomId);
}
export async function fetchCrowdPage(roomId: string, cursor?: CrowdMessage, direction: 'older' | 'newer' = 'older') {
  return parseCrowdPage(await rpc('list_arena_crowd_messages', { p_room_id: roomId, p_limit: 40, p_direction: direction,
    ...(cursor ? { p_cursor_at: cursor.createdAt, p_cursor_id: cursor.id } : {}) }), roomId);
}
export async function fetchCrowdIds(roomId: string, ids: readonly string[]) {
  return parseCrowdPage(await rpc('get_arena_crowd_messages', { p_room_id: roomId, p_ids: ids.slice(0,100) }), roomId);
}
export async function postCrowd(roomId: string, body: string, requestKey: string) {
  return parseCrowdMessage(await rpc('post_arena_crowd_message', { p_room_id: roomId, p_body: body, p_request_key: requestKey }), roomId);
}
export function subscribeCrowdIdentity(onIdentity: (id: string | null) => void): () => void {
  if (!isSupabaseConfigured) return () => {};
  const { data } = requireSupabase().auth.onAuthStateChange((_event,session) => onIdentity(session?.user.id ?? null));
  return () => data.subscription.unsubscribe();
}
export function subscribeCrowd(roomId: string, onIds: (ids: string[]) => void, onState: (connected: boolean) => void): () => void {
  if (!isSupabaseConfigured) { onState(false); return () => {}; }
  const client = requireSupabase(); let disposed = false;
  const channel = client.channel(`crowd:${roomId}`).on('postgres_changes', {
    event: '*', schema: 'public', table: 'arena_crowd_messages', filter: `room_id=eq.${roomId}`,
  }, event => {
    // Raw event text is never rendered, including UPDATE and reconnect events.
    const row = event.new as { id?: string };
    if (!disposed && typeof row.id === 'string') onIds([row.id]);
  });
  void client.auth.getSession().then(async ({ data }) => {
    if (disposed) return;
    if (data.session?.access_token) await client.realtime.setAuth(data.session.access_token);
    if (!disposed) channel.subscribe(status => { if (!disposed) onState(status === 'SUBSCRIBED'); });
  }).catch(() => { if (!disposed) onState(false); });
  return () => { disposed = true; void client.removeChannel(channel); };
}
