/** Server-authorized typing. Broadcast/Presence payloads are never UI data. */
export interface MeetTypingTransport {
  read: () => Promise<{ typing: boolean; validForMs: number }>;
  write: (typing: boolean) => Promise<void>;
}

export function createMeetTyping(transport: MeetTypingTransport, onPeer: (typing: boolean) => void) {
  let closed = false, connected = false, reading = false, writing = false;
  let generation = 0, lastWrite = -Infinity;
  let pending: boolean | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const hide = () => { clearTimeout(expiry); onPeer(false); };
  const deny = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error
    && ['42501', 'P0002', 'P0003', 'PGRST202'].includes(String(error.code));

  async function drain(): Promise<void> {
    if (writing) return;
    writing = true;
    while (pending !== undefined) {
      const value = pending;
      pending = undefined;
      try { await transport.write(value); }
      catch (error) {
        if (!closed) hide();
        if (deny(error)) { pending = undefined; stop(); break; }
      }
    }
    writing = false;
  }
  const enqueue = (value: boolean) => { pending = value; void drain(); };
  async function refresh(): Promise<void> {
    // Authoritative reads must not wait on Realtime SUBSCRIBED. Broadcast is a
    // hint only; get_meet_typing remains the UI source of truth (E3.7.1).
    if (closed || reading) return;
    const scope = generation;
    const started = Date.now();
    reading = true;
    try {
      const result = await transport.read();
      if (closed || scope !== generation) return;
      clearTimeout(expiry);
      // Never display a TTL that elapsed while its response was in transit.
      const elapsed = Date.now() - started;
      const ttl = result.validForMs - Math.max(0, elapsed);
      if (result.typing && elapsed >= 0 && Number.isFinite(ttl) && ttl > 0) {
        onPeer(true);
        expiry = setTimeout(hide, Math.min(ttl, 6000));
      } else onPeer(false);
    } catch (error) {
      if (!closed && scope === generation) {
        hide();
        if (deny(error)) stop();
      }
    } finally { reading = false; }
  }
  const poll = setInterval(() => { void refresh(); }, 4000);
  function stop(): void {
    if (closed) return;
    closed = true; connected = false; generation++;
    clearInterval(poll); clearTimeout(idle); hide();
    // Never dispatch queued work after disposal/account change. The server TTL
    // is the fallback when a clear cannot safely be sent with the old identity.
    pending = undefined;
  }
  onPeer(false);
  // First poll immediately so a late/failed private channel cannot blank the
  // indicator while the peer already has a live typing_until row.
  void refresh();
  return {
    refresh,
    setConnected(value: boolean): void {
      if (closed) return;
      if (connected === value) {
        if (value) void refresh();
        return;
      }
      connected = value; generation++; hide();
      if (value) void refresh();
      else { clearTimeout(idle); enqueue(false); }
    },
    broadcast(): void {
      // Writes are REST RPCs; do not require a live Broadcast subscription.
      if (closed) return;
      clearTimeout(idle);
      idle = setTimeout(() => enqueue(false), 3000);
      if (Date.now() - lastWrite < 2000) return;
      lastWrite = Date.now(); enqueue(true);
    },
    // Clearing OUR composer must not hide the OTHER participant's typing.
    clear(): void { if (!closed) { clearTimeout(idle); enqueue(false); } },
    unsubscribe: stop,
  };
}
