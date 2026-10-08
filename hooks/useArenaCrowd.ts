import React from 'react';
import { AppState } from 'react-native';
import { fetchCrowdContext, fetchCrowdIds, fetchCrowdPage, postCrowd, subscribeCrowd, subscribeCrowdIdentity } from '../services/arenaCrowdService';
import { mergeCrowd, reconcileCrowd, type CrowdContext, type CrowdMessage } from '../utils/arenaCrowd';

export function useArenaCrowd(roomId: string | null) {
  const [messages,setMessages] = React.useState<CrowdMessage[]>([]);
  const [context,setContext] = React.useState<CrowdContext | null>(null);
  const [loading,setLoading] = React.useState(Boolean(roomId));
  const [error,setError] = React.useState<string | null>(null);
  const [connected,setConnected] = React.useState(false);
  const [sending,setSending] = React.useState(false);
  const [hasOlder,setHasOlder] = React.useState(false);
  const [olderBusy,setOlderBusy] = React.useState(false);
  const [identityVersion,setIdentityVersion] = React.useState(0);
  React.useEffect(() => {
    let previous: string | null | undefined;
    return subscribeCrowdIdentity(id => {
      if (previous !== undefined && previous !== id) setIdentityVersion(v => v+1);
      previous = id;
    });
  },[]);
  const rows = React.useRef(messages); rows.current = messages;
  const generation = React.useRef(0); const sendingRef = React.useRef(false);
  const syncCursor = React.useRef<CrowdMessage | undefined>(undefined);
  const visibilityCursor = React.useRef(0);
  const olderRef = React.useRef(false); const busy = React.useRef(false);
  const failure = React.useCallback((caught: unknown) => {
    if ((caught as { code?: string })?.code === '42501') { setMessages([]); setContext(null); setHasOlder(false); }
    setError('Crowd could not update. Try again.');
  },[]);
  const refresh = React.useCallback(async () => {
    if (!roomId || busy.current) return;
    const gen = generation.current; busy.current = true;
    try {
      const ctx = await fetchCrowdContext(roomId);
      if (gen !== generation.current) return;
      setContext(ctx);
      let cursor = syncCursor.current;
      // Drain gaps in oldest-first batches. Never jump the cursor past a gap.
      for (let page = 0; page < 5; page++) {
        const next = await fetchCrowdPage(roomId,cursor,cursor ? 'newer' : 'older');
        if (gen !== generation.current) return;
        setMessages(old => mergeCrowd(old,next));
        if (next.length) syncCursor.current = next.at(-1);
        if (!cursor) { setHasOlder(next.length === 40); break; }
        if (next.length < 40) break;
        cursor = next.at(-1);
      }
      const ids = rows.current.map(row => row.id);
      const start = ids.length ? visibilityCursor.current % ids.length : 0;
      const checked = [...ids.slice(start),...ids.slice(0,start)].slice(0,100);
      visibilityCursor.current = start + checked.length;
      if (checked.length) {
        const visible = await fetchCrowdIds(roomId,checked);
        if (gen !== generation.current) return;
        setMessages(old => reconcileCrowd(old,checked,visible));
      }
      setError(null);
    } catch (caught) { if (gen === generation.current) failure(caught); }
    finally { if (gen === generation.current) { busy.current = false; setLoading(false); } }
  },[failure,roomId]);
  React.useEffect(() => {
    generation.current++; busy.current = false; sendingRef.current = false; olderRef.current = false;
    rows.current = []; setMessages([]); setContext(null); setError(null); setConnected(false);
    syncCursor.current = undefined; visibilityCursor.current = 0;
    setLoading(Boolean(roomId)); setHasOlder(false); setSending(false); setOlderBusy(false);
    if (!roomId) return;
    let timer: ReturnType<typeof setTimeout> | undefined; const pending = new Set<string>();
    const gen = generation.current;
    void refresh();
    const unsubscribe = subscribeCrowd(roomId,ids => {
      ids.forEach(id => pending.add(id));
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        const ids = [...pending].slice(0,100); pending.clear();
        void fetchCrowdIds(roomId,ids).then(visible => {
          if (generation.current === gen) setMessages(old => reconcileCrowd(old,ids,visible));
        }).catch(caught => { if (generation.current === gen) failure(caught); });
      },120);
    },online => { if (generation.current === gen) { setConnected(online); if (online) void refresh(); } });
    const interval = setInterval(() => { if (AppState.currentState === 'active') void refresh(); },15000);
    const foreground = AppState.addEventListener('change',state => { if (state === 'active') void refresh(); });
    return () => { generation.current++; unsubscribe(); clearInterval(interval); if (timer) clearTimeout(timer); foreground.remove(); };
  },[failure,refresh,roomId,identityVersion]);
  const loadOlder = React.useCallback(async () => {
    if (!roomId || olderRef.current || !rows.current[0]) return;
    olderRef.current = true; setOlderBusy(true); const gen = generation.current;
    try {
      const next = await fetchCrowdPage(roomId,rows.current[0]);
      if (gen !== generation.current) return;
      // Loading history preserves the older rows; live arrivals maintain a 200-row window.
      setMessages(old => mergeCrowd(old,next,200)); setHasOlder(next.length === 40 && rows.current.length+next.length<200);
    } catch (caught) { if (gen === generation.current) failure(caught); }
    finally { if (gen === generation.current) { olderRef.current = false; setOlderBusy(false); } }
  },[failure,roomId]);
  const send = React.useCallback(async (body: string, key: string) => {
    if (!roomId || sendingRef.current) return false;
    sendingRef.current = true; setSending(true); const gen = generation.current;
    try {
      const sent = await postCrowd(roomId,body,key);
      if (gen !== generation.current) return false;
      setMessages(old => mergeCrowd(old,[sent])); setError(null); return true;
    } catch (caught) {
      if (gen === generation.current) {
        failure(caught);
        const code = (caught as { code?: string })?.code;
        setError(code === 'P0001' ? 'You are sending quickly. Wait a moment and retry.' : code === 'P0003' ? 'Crowd chat has closed.' : 'Message not confirmed. Retry to check or send it.');
        if (code === 'P0003') setContext(old => old ? { ...old,canSend:false } : null);
      }
      return false;
    } finally { if (gen === generation.current) { sendingRef.current = false; setSending(false); } }
  },[failure,roomId]);
  return { messages,context,loading,error,connected,sending,hasOlder,olderBusy,identityVersion,refresh,loadOlder,send };
}
