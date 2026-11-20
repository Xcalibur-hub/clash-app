import type { PostgrestError } from '@supabase/supabase-js';
import { requireSupabase } from './supabaseClient';
import { createMeetTyping } from '../utils/meetTyping';

// Draft additive RPCs: keep generated database types untouched until replay.
type TypingRpc = (name: 'get_meet_typing' | 'set_meet_typing',
  args: { p_session_id: string; p_typing?: boolean }) => PromiseLike<{
    data: unknown; error: PostgrestError | null;
  }>;

export function subscribeMeetTyping(sessionId: string, onPeer: (typing: boolean) => void) {
  const client = requireSupabase();
  let closed = false, actor: string | null | undefined;
  let channel: ReturnType<typeof client.channel> | undefined;
  let typing: ReturnType<typeof createMeetTyping> | undefined;
  let auth: { unsubscribe: () => void } | undefined;
  function close(): void {
    if (closed) return;
    closed = true; actor = null;
    typing?.unsubscribe(); auth?.unsubscribe(); onPeer(false);
    if (channel) void client.removeChannel(channel).catch(() => undefined);
  }
  async function rpc(name: 'get_meet_typing' | 'set_meet_typing', value?: boolean) {
    // An old scope must never send a queued clear using the next account.
    if (!actor) throw Object.assign(new Error('Typing unavailable'), { code: '42501' });
    const call = (client as unknown as { rpc: TypingRpc }).rpc;
    const { data, error } = await call.call(client, name, {
      p_session_id: sessionId, ...(value === undefined ? {} : { p_typing: value }),
    });
    if (error) throw Object.assign(new Error('Typing unavailable'), { code: error.code });
    return data;
  }
  function start(): void {
    if (closed || !actor || !sessionId) return;
    typing = createMeetTyping({
      async read() {
        const row = await rpc('get_meet_typing');
        if (typeof row !== 'object' || row === null || !('typing' in row)
          || !('validForMs' in row) || typeof row.typing !== 'boolean'
          || typeof row.validForMs !== 'number' || !Number.isFinite(row.validForMs)
          || row.validForMs < 0 || row.validForMs > 6000) throw new Error('Invalid typing state');
        return { typing: row.typing, validForMs: row.validForMs };
      },
      async write(value) { await rpc('set_meet_typing', value); },
    }, onPeer);
    channel = client.channel(`meet-typing:${sessionId}`, { config: { private: true } });
    channel.on('broadcast', { event: 'typing' }, () => { void typing?.refresh(); })
      .subscribe(status => { if (!closed) typing?.setConnected(status === 'SUBSCRIBED'); });
  }
  onPeer(false);
  const subscription = client.auth.onAuthStateChange((_event, session) => {
    const next = session?.user.id ?? null;
    if (actor === undefined) {
      actor = next;
      if (!next) close();
      // Never invoke another Auth/DB operation inside the synchronous Auth lock.
      else queueMicrotask(start);
    } else if (next !== actor) { actor = null; close(); }
  });
  auth = subscription.data.subscription;
  if (closed) auth.unsubscribe();
  return {
    broadcast: () => { if (!closed) typing?.broadcast(); },
    clear: () => { if (!closed) typing?.clear(); },
    unsubscribe: close,
  };
}
