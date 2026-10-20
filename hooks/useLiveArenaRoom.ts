import { currentUserId } from '../services/supabaseClient';
import { acquireOfficialRequest, confirmOfficialRequest } from '../services/officialRequestStore';
import { compareOfficial, drainOfficialGap, type OfficialCursor } from '../utils/officialRecovery';
import { createReactionQueue } from '../utils/reactionOptimism';
import { createRoomReactionBridge } from '../utils/roomReactionBridge';
import { recoverOverflowAfterRefresh } from '../utils/overflowRecovery';
import { createReactionSnapshots } from '../utils/reactionSnapshots';
import { useFocusEffect } from 'expo-router';
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  fetchEvidence,
  fetchOfficialPage,
  fetchEvidenceVisibility,
  fetchMessage,
  fetchVisibleMessageIds,
  fetchMindshiftStats,
  fetchRoom,
  markEvidenceUseful,
  postClashMediaReshare,
  postMessage,
  reactMessage,
  recordFinalStance,
  submitArgumentVote,
  submitEvidence,
  submitSideVote,
  subscribeRoomMessages,
  upgradeSpectator,
  type ArenaAuthor,
  type ArenaEvidence,
  type ArenaMessage,
  type ArenaMindshiftStats,
  type ArenaRoom,
  type PostArenaMessageInput,
  type Stance,
  type SubmitArenaEvidenceInput,
} from '../services/liveArenaService';
import { errorText, SupabaseError } from '../services/supabaseClient';
import { showNotice, useClash } from '../store';
import { createTranscriptUpdater, createVisibilityBarrier, isCurrentScope, resolveSendResolution } from '../utils/transcriptOrdering.ts';
import { mergeMessagesById, removeUnavailableMessages } from '../utils/liveRoomThread';

/** How many arguments one page of the thread carries. */
const PAGE = 40;
/** Coalesce realtime INSERT ids before hydrating. */
const HYDRATE_DEBOUNCE_MS = 280;
/** Periodic rollup refresh for reactions/reply counts (not every INSERT). */
const RECONCILE_MS = 30_000;
/** Rows checked per interval; rotates through long loaded threads. */
const VISIBILITY_BATCH = 100;

export interface LiveArenaRoomController {
  room: ArenaRoom | null;
  /** Newest first â€” render in an inverted list. */
  messages: ArenaMessage[];
  evidence: ArenaEvidence[];
  stats: ArenaMindshiftStats | null;
  loading: boolean;
  /** Set only when the room itself could not be read. */
  error: string | null;
  /** True while the thread is unreadable (not a member) but the room loaded. */
  threadLocked: boolean;
  refreshing: boolean;
  sending: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  /** True after a capacity rejection on upgrade â€” user stays spectator. */
  roomFullOnUpgrade: boolean;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
  /** Optimistic; rolls the placeholder back and surfaces a notice on failure. */
  send: (input: Omit<PostArenaMessageInput, 'roomId'>) => Promise<boolean>;
  react: (messageId: string, emoji?: string) => Promise<void>;
  addEvidence: (input: Omit<SubmitArenaEvidenceInput, 'roomId'>) => Promise<boolean>;
  markUseful: (evidenceId: string) => Promise<void>;
  voteSide: (side: 'AGREE' | 'DISAGREE') => Promise<boolean>;
  voteArgument: (messageId: string) => Promise<boolean>;
  recordFinal: (stance: Stance) => Promise<boolean>;
  /** Spectator â†’ debater in-place. Refreshes room state on success. */
  upgradeToDebater: (stance: Stance) => Promise<boolean>;
}

/** Newest-first merge that keeps one row per id â€” an optimistic echo never doubles. */
function mergeMessages(
  current: readonly ArenaMessage[],
  incoming: readonly ArenaMessage[],
): ArenaMessage[] {
  return mergeMessagesById(current, incoming);
}

/** Row-level-security refusals read as 42501; the thread is members-only. */
function isMembershipRefusal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '42501'
  );
}

/**
 * Everything one live room needs: the room card, the thread, the evidence rail,
 * a realtime subscription and the writes.
 *
 * The thread is deliberately refreshed rather than patched when realtime fires.
 * A `postgres_changes` row carries no author card and no reaction rollup, and
 * synthesising one on the client would mean the app inventing content the server
 * never sent â€” so an INSERT is treated as a hint to re-read the newest page.
 *
 * A non-member can still load a SETTLED room (the result is public), so a
 * refused message read marks the thread locked instead of failing the screen.
 */
export function useLiveArenaRoom(
  roomId: string,
  viewerAuthor: ArenaAuthor | null = null,
): LiveArenaRoomController {
  const { dispatch } = useClash();
  const [room, setRoom] = React.useState<ArenaRoom | null>(null);
  const [messages, setMessages] = React.useState<ArenaMessage[]>([]);
  const [evidence, setEvidence] = React.useState<ArenaEvidence[]>([]);
  const [stats, setStats] = React.useState<ArenaMindshiftStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [threadLocked, setThreadLocked] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [hasOlder, setHasOlder] = React.useState(true);
  const [roomFullOnUpgrade, setRoomFullOnUpgrade] = React.useState(false);

  const mounted = React.useRef(true);
  const accessGeneration = React.useRef(0);
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const authorRef = React.useRef<ArenaAuthor | null>(viewerAuthor);
  const messagesRef = React.useRef<ArenaMessage[]>([]);
  const evidenceRef = React.useRef<ArenaEvidence[]>([]);
  evidenceRef.current=evidence;
  const evidenceVisibilityCursor=React.useRef(0);
  const roomRef = React.useRef<ArenaRoom | null>(room);
  const visibilityCursor = React.useRef(0);
  const messageCursor = React.useRef<OfficialCursor | null>(null);
  const evidenceCursor = React.useRef<OfficialCursor | null>(null);
  const olderEvidence = React.useRef<OfficialCursor | null>(null);
  const evidenceHasOlder = React.useRef(false);
  const messageHasOlder = React.useRef(true);
  const recovering = React.useRef(false);
  const sendBusy = React.useRef<symbol | null>(null);
  const evidenceBusy = React.useRef(false);
  authorRef.current = viewerAuthor;
  messagesRef.current = messages;
  roomRef.current = room;

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      visibilityBarrier.reset();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const notify = React.useCallback(
    (caught: unknown) => {
      dispatch(showNotice(roomRef.current?.roomMode === 'DUEL'
        ? 'That action could not be completed. Please try again.' : errorText(caught)));
    },
    [dispatch],
  );

  const clearPrivateThread = React.useCallback(() => {
    accessGeneration.current++;
    const generation = accessGeneration.current;
    visibilityBarrier.reset();
    sendBusy.current = null;
    setSending(false);
    setMessages(current => isCurrentScope(mounted.current, generation, accessGeneration.current) ? [] : current);
    setEvidence(current => isCurrentScope(mounted.current, generation, accessGeneration.current) ? [] : current);
    setStats(null);
    setThreadLocked(true);
    setHasOlder(false);
  }, []);

  const reactionSnapshots = React.useRef(createReactionSnapshots());
  const visibilityBarrier = React.useRef(createVisibilityBarrier()).current;
  const reactionQueue = React.useRef<ReturnType<typeof createRoomReactionBridge> | null>(null);
  if (!reactionQueue.current) reactionQueue.current = createRoomReactionBridge({
    snapshots: reactionSnapshots.current,
    read: async id => (await fetchMessage(id))?.reactions ?? null,
    toggle: reactMessage,
    write: (id, reactions) => {
      const generation = accessGeneration.current;
      if (!reactions) visibilityBarrier.mark([id]);
      setMessages(current => {
        if (!isCurrentScope(mounted.current, generation, accessGeneration.current)) return current;
        return reactions ? current.map(row => row.id === id ? { ...row, reactions } : row)
          : current.filter(row => row.id !== id);
      });
    },
    onError: notify,
  });

  /**
   * Lightweight INSERT hydrate: fetch only the new message id(s).
   * Full newest-page reconcile runs on a slow timer / reconnect â€” not every post.
   */
  const hydrateInserted = React.useCallback(async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const generation=accessGeneration.current;
    const visibilityEpoch = visibilityBarrier.epoch();
    const snapshot = reactionSnapshots.current.beginSnapshot();
    try {
      const unique = [...new Set(ids)].slice(0, 12);
      const rows = await Promise.all(
        unique.map((id) => fetchMessage(id).catch(() => null)),
      );
      if (!mounted.current || generation!==accessGeneration.current) return;
      const next = rows.filter((row): row is ArenaMessage => row != null);
      if (next.length === 0) return;
      setThreadLocked(false);
      const authorized = visibilityBarrier.admit(next, visibilityEpoch);
      if (authorized.length === 0) return;
      setMessages(createTranscriptUpdater(authorized, snapshot, reactionSnapshots.current, visibilityBarrier,
        () => isCurrentScope(mounted.current, generation, accessGeneration.current)));
    } catch (caught) {
      if (!isCurrentScope(mounted.current, generation, accessGeneration.current)) return;
      if (isMembershipRefusal(caught)) clearPrivateThread();
    }
  }, []);

  /**
   * Gap-aware + newest-page reconcile after reconnect / periodic drift repair.
   */
  const refreshThread = React.useCallback(async (): Promise<void> => {
    if (recovering.current) return;
    recovering.current = true;
    let snapshot = 0;
    const threadEpoch = visibilityBarrier.epoch();
    const generation=accessGeneration.current;
    try {
      await reactionQueue.current?.reconcile();
      if (messageCursor.current) await drainOfficialGap(messageCursor.current,
        async cursor => {
          snapshot = reactionSnapshots.current.beginSnapshot();
          return (await fetchOfficialPage(roomId,'message',cursor,'newer')) as (ArenaMessage & OfficialCursor)[];
        },
        (rows,cursor) => {
          if (!visibilityBarrier.allows(threadEpoch)) return false;
          // Admission and cursor coverage are one synchronous decision. React
          // may run this updater after the visibility watermark has advanced.
          const admittedRows = visibilityBarrier.admit(rows,threadEpoch);
          setThreadLocked(false);
          setMessages(createTranscriptUpdater<ArenaMessage>(admittedRows, snapshot, reactionSnapshots.current, visibilityBarrier,
            () => isCurrentScope(mounted.current, generation, accessGeneration.current)));
          messageCursor.current=cursor;
          return true;
        },
        ()=>mounted.current && generation===accessGeneration.current);
      if (roomRef.current?.roomMode==='DUEL' && evidenceCursor.current) await drainOfficialGap(evidenceCursor.current,
        async cursor => (await fetchOfficialPage(roomId,'evidence',cursor,'newer')) as (ArenaEvidence & OfficialCursor)[],
        (rows,cursor) => {
          setEvidence(old => isCurrentScope(mounted.current, generation, accessGeneration.current)
            ? [...new Map([...old,...rows].map(row=>[row.id,row])).values()].sort((a,b)=>compareOfficial(b,a)) : old);
          evidenceCursor.current=cursor;
        },
        ()=>mounted.current && generation===accessGeneration.current);
      // Rollup refresh never advances the gap cursor past unseen rows.
      if(messageCursor.current) {
        const freshEpoch = visibilityBarrier.epoch();
        const freshSnapshot = reactionSnapshots.current.beginSnapshot();
        const fresh=await fetchOfficialPage(roomId,'message');
        if(!mounted.current || generation!==accessGeneration.current) return;
        const admittedFresh = visibilityBarrier.admit(fresh,freshEpoch);
        setMessages(createTranscriptUpdater(admittedFresh, freshSnapshot, reactionSnapshots.current, visibilityBarrier,
          () => isCurrentScope(mounted.current, generation, accessGeneration.current)));
        await recoverOverflowAfterRefresh({
          queue: reactionQueue.current!,
          isLoaded: (id) => messagesRef.current.some((row) => row.id === id),
          loadedIds: messagesRef.current.map((row) => row.id),
          active: () => mounted.current,
          generation,
          currentGeneration: () => accessGeneration.current,
        });
      }
      if(roomRef.current?.roomMode==='DUEL' && evidenceCursor.current) {
        const fresh=await fetchOfficialPage(roomId,'evidence');
        if(!mounted.current || generation!==accessGeneration.current) return;
        setEvidence(old => isCurrentScope(mounted.current, generation, accessGeneration.current)
          ? [...new Map([...old,...fresh].map(row=>[row.id,row])).values()].sort((a,b)=>compareOfficial(b,a)) : old);
      }
    } catch (caught) {
      if (!isCurrentScope(mounted.current, generation, accessGeneration.current)) return;
      if (isMembershipRefusal(caught) || (caught as {code?:string})?.code==='account_changed') clearPrivateThread();
      else setError('Transcript could not update. Try again.');
    } finally { recovering.current=false; }
  }, [roomId,clearPrivateThread]);

  /** Phase/result refresh is independent of message traffic. */
  const refreshRoomState = React.useCallback(async (): Promise<void> => {
    const generation=accessGeneration.current;
    try {
      const next = await fetchRoom(roomId);
      if (!mounted.current || generation!==accessGeneration.current) return;
      setRoom(next);
      setError(null);
      if (next.status === 'SETTLED' || next.viewer?.finalStance) {
        const nextStats = await fetchMindshiftStats(roomId).catch(() => null);
        if (mounted.current && generation===accessGeneration.current) setStats(nextStats);
      } else if (mounted.current) {
        setStats(null);
      }
    } catch (caught) {
      if (mounted.current && isMembershipRefusal(caught)) {
        clearPrivateThread();
        setRoom(null);
        setError('This room is unavailable.');
      }
      // Periodic drift repair is best-effort; explicit refresh still surfaces errors.
    }
  }, [roomId]);

  /** Eventually evict messages hidden by moderation or a new block/mute. */
  const reconcileVisibility = React.useCallback(async (): Promise<void> => {
    const generation = accessGeneration.current;
    const evidenceIds=evidenceRef.current.map(row=>row.id);
    const startEvidence=evidenceIds.length ? evidenceVisibilityCursor.current % evidenceIds.length : 0;
    const checkedEvidence=[...evidenceIds.slice(startEvidence),...evidenceIds.slice(0,startEvidence)].slice(0,100);
    evidenceVisibilityCursor.current=startEvidence+checkedEvidence.length;
    try {
      if(checkedEvidence.length && roomRef.current?.roomMode==='DUEL') {
        const visible=new Set(await fetchEvidenceVisibility(roomId,checkedEvidence));
        if(!isCurrentScope(mounted.current, generation, accessGeneration.current)) return;
        const checked=new Set(checkedEvidence);
        setEvidence(old => isCurrentScope(mounted.current, generation, accessGeneration.current)
          ? old.filter(row=>!checked.has(row.id)||visible.has(row.id)) : old);
      }
    } catch(caught) { if(isCurrentScope(mounted.current, generation, accessGeneration.current) && isMembershipRefusal(caught)) clearPrivateThread(); return; }
    const ids = messagesRef.current
      .filter((message) => !message.pending)
      .map((message) => message.id);
    if (ids.length === 0) return;
    const start = visibilityCursor.current % ids.length;
    const checked = [...ids.slice(start), ...ids.slice(0, start)].slice(0, VISIBILITY_BATCH);
    visibilityCursor.current = (start + checked.length) % ids.length;
    try {
      const visible = await fetchVisibleMessageIds(roomId, checked);
      if (!isCurrentScope(mounted.current, generation, accessGeneration.current)) return;
      visibilityBarrier.mark(checked.filter((id) => !visible.includes(id)));
      setMessages((current) => isCurrentScope(mounted.current, generation, accessGeneration.current)
        ? removeUnavailableMessages(current, checked, visible) : current);
    } catch (caught) {
      if (isCurrentScope(mounted.current, generation, accessGeneration.current) && isMembershipRefusal(caught)) clearPrivateThread();
    }
  }, [roomId]);

  const load = React.useCallback(
    async (mode: 'initial' | 'refresh'): Promise<void> => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      const generation=accessGeneration.current;
      const snapshot = reactionSnapshots.current.beginSnapshot();
      const visibilityEpoch = visibilityBarrier.epoch();
      try {
        const next = await fetchRoom(roomId);
        if (!mounted.current || generation!==accessGeneration.current) return;
        setRoom(next);
        setError(null);

        // The thread and the rail are members-only; a settled room is still
        // worth rendering for its public result when they are refused.
        const [thread, rail] = await Promise.all([
          fetchOfficialPage(roomId, 'message').catch((caught: unknown) => {
            if (isMembershipRefusal(caught)) return 'locked' as const;
            throw caught;
          }),
          (next.roomMode==='DUEL' ? fetchOfficialPage(roomId,'evidence') : fetchEvidence(roomId)).catch((caught: unknown) => {
            if (isMembershipRefusal(caught)) return 'locked' as const;
            throw caught;
          }),
        ]);
        if (!mounted.current || generation!==accessGeneration.current) return;

        if (thread === 'locked' || rail === 'locked') {
          clearPrivateThread();
          return;
        } else {
          setThreadLocked(false);
          messageHasOlder.current=thread.length>=PAGE;
          setHasOlder(messageHasOlder.current);
          if (!messageCursor.current) messageCursor.current=thread[0]?.preciseCreatedAt ? thread[0] as OfficialCursor : {id:'',preciseCreatedAt:'1970-01-01T00:00:00.000000Z'};
          const admittedThread = visibilityBarrier.admit(thread, visibilityEpoch);
          setMessages(createTranscriptUpdater(admittedThread, snapshot, reactionSnapshots.current, visibilityBarrier,
            () => isCurrentScope(mounted.current, generation, accessGeneration.current)));
        }
        setEvidence(old => !isCurrentScope(mounted.current, generation, accessGeneration.current) ? old
          : mode==='initial' || next.roomMode!=='DUEL' ? rail : [...new Map([...old,...rail].map(row=>[row.id,row])).values()].sort((a,b)=>compareOfficial(b,a)));
        if(next.roomMode==='DUEL') {
          if (!evidenceCursor.current) evidenceCursor.current=rail[0]?.preciseCreatedAt ? rail[0] as OfficialCursor : {id:'',preciseCreatedAt:'1970-01-01T00:00:00.000000Z'};
          if(mode==='initial' || !olderEvidence.current) {
            olderEvidence.current=rail.at(-1)?.preciseCreatedAt ? rail.at(-1) as OfficialCursor : null;
            evidenceHasOlder.current=rail.length>=PAGE;
          }
          setHasOlder(messageHasOlder.current || evidenceHasOlder.current);
        }

        // Mindshift opens after the verdict (or once the viewer has recorded a
        // final stance); before that the RPC refuses and there is nothing to show.
        if (next.status === 'SETTLED' || next.viewer?.finalStance) {
          try {
            const s = await fetchMindshiftStats(roomId);
            if (mounted.current) setStats(s);
          } catch {
            if (mounted.current) setStats(null);
          }
        } else {
          setStats(null);
        }
      } catch (caught) {
        if (!mounted.current || generation!==accessGeneration.current) return;
        if (isMembershipRefusal(caught)) {
          clearPrivateThread();
          setRoom(null);
        }
        setError(errorText(caught));
      } finally {
        if (!mounted.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [roomId],
  );

  const refresh = React.useCallback(async () => { await refreshThread(); await load('refresh'); }, [load,refreshThread]);
  useFocusEffect(React.useCallback(()=>{ void refreshThread(); return undefined; },[refreshThread]));

  React.useEffect(() => {
    accessGeneration.current++;
    const generation = accessGeneration.current;
    visibilityBarrier.reset();
    sendBusy.current = null;
    setSending(false);
    setRoom(null);
    setMessages(current => isCurrentScope(mounted.current, generation, accessGeneration.current) ? [] : current);
    setEvidence(current => isCurrentScope(mounted.current, generation, accessGeneration.current) ? [] : current);
    setStats(null);
    setThreadLocked(false);
    setHasOlder(true);
    visibilityCursor.current = 0;
    messageCursor.current=null; evidenceCursor.current=null; olderEvidence.current=null;
    void load('initial');
  }, [load]);

  // Realtime: hydrate only the inserted ids (coalesced). Full reconcile is slow-path.
  React.useEffect(() => {
    const pending = new Set<string>();
    const flush = (): void => {
      const ids = [...pending];
      pending.clear();
      void hydrateInserted(ids);
    };
    const scheduleHydrate = (id: string): void => {
      pending.add(id);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(flush, HYDRATE_DEBOUNCE_MS);
    };
    const unsubscribe = subscribeRoomMessages(roomId, (event) => {
      scheduleHydrate(event.id);
    }, connected => { if(connected && mounted.current) { void refreshThread(); void refreshRoomState(); } });
    let reconciling = false;
    const reconcileAll = async (): Promise<void> => {
      if (reconciling) return;
      reconciling = true;
      try {
        await Promise.allSettled([
          refreshThread(),
          refreshRoomState(),
          reconcileVisibility(),
        ]);
      } finally {
        reconciling = false;
      }
    };
    const reconcile = setInterval(() => {
      void reconcileAll();
    }, RECONCILE_MS);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      clearInterval(reconcile);
      unsubscribe();
    };
  }, [hydrateInserted, reconcileVisibility, refreshRoomState, refreshThread, roomId]);

  // Coming back from the background: gap-fetch missed messages, then refresh room.
  React.useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      const wasAway = previous !== 'active';
      previous = status;
      if (status === 'active' && wasAway) {
        void refreshThread();
        void load('refresh');
        void reconcileVisibility();
      }
    });
    return () => subscription.remove();
  }, [load, reconcileVisibility, refreshThread]);

  const loadOlder = React.useCallback(async (): Promise<void> => {
    if (loadingOlder || !hasOlder || threadLocked) return;
    setLoadingOlder(true);
    const generation=accessGeneration.current;
    try {
      const oldest = messages.filter(m=>!m.pending).at(-1);
      if(messageHasOlder.current && oldest?.preciseCreatedAt) {
        const snapshot = reactionSnapshots.current.beginSnapshot();
      const pageEpoch = visibilityBarrier.epoch();
      const page = await fetchOfficialPage(roomId,'message',oldest as OfficialCursor);
        if (!mounted.current || generation!==accessGeneration.current) return;
        messageHasOlder.current=page.length>=PAGE;
        const admittedPage = visibilityBarrier.admit(page,pageEpoch);
        setMessages(createTranscriptUpdater(admittedPage, snapshot, reactionSnapshots.current, visibilityBarrier,
          () => isCurrentScope(mounted.current, generation, accessGeneration.current)));
      }
      if(evidenceHasOlder.current && olderEvidence.current) {
        const page=await fetchOfficialPage(roomId,'evidence',olderEvidence.current);
        if(!mounted.current || generation!==accessGeneration.current) return;
        evidenceHasOlder.current=page.length>=PAGE;
        if(page.length) olderEvidence.current=page.at(-1) as OfficialCursor;
        setEvidence(old => isCurrentScope(mounted.current, generation, accessGeneration.current)
          ? [...new Map([...old,...page].map(row=>[row.id,row])).values()].sort((a,b)=>compareOfficial(b,a)) : old);
      }
      setHasOlder(messageHasOlder.current || evidenceHasOlder.current);
    } catch(caught) {
      if (isCurrentScope(mounted.current, generation, accessGeneration.current)) {
        if(isMembershipRefusal(caught)) clearPrivateThread();
        else setError('Earlier transcript could not load. Try again.');
      }
    } finally {
      if (isCurrentScope(mounted.current, generation, accessGeneration.current)) setLoadingOlder(false);
    }
  }, [hasOlder, loadingOlder, messages, roomId, threadLocked]);

  const send = React.useCallback(
    async (input: Omit<PostArenaMessageInput, 'roomId'>): Promise<boolean> => {
      if (sendBusy.current) return false;
      const owner = Symbol('arena-send');
      sendBusy.current = owner;
      const sendGeneration = accessGeneration.current;
      const ownsSend = (): boolean => sendBusy.current === owner;
      const active = (): boolean => ownsSend() && isCurrentScope(mounted.current, sendGeneration, accessGeneration.current);
      let placeholderId: string | undefined;
      try {
        const account=await currentUserId();
        if(!account || !active()) return false;
        const requestKey = roomRef.current?.roomMode==='DUEL'
          ? await acquireOfficialRequest(account,roomId,'message',input) : undefined;
        if(!active()) return false;
        const temporaryId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        placeholderId = temporaryId;
        const isReshare = Boolean(input.reshareSourceMessageId);
        const placeholder: ArenaMessage = {
          id: temporaryId,
          roomId,
          kind: isReshare || input.gif ? 'gif' : input.media ? 'media' : 'text',
          body: input.body,
          parentMessageId: input.parentMessageId ?? null,
          createdAt: Date.now(),
          mediaUrl: input.gif?.url ?? input.media?.url ?? null,
          mediaKind: isReshare || input.gif ? 'gif' : (input.media?.kind ?? null),
          gifProvider: input.gif?.provider ?? null,
          gifExternalId: input.gif?.externalId ?? null,
          isOwn: true,
          author: authorRef.current,
          reactions: [],
          replyCount: 0,
          argumentVotes: null,
          pending: true,
        };
        setSending(true);
        const snapshot = reactionSnapshots.current.beginSnapshot();
        const sendVisibilityEpoch = visibilityBarrier.epoch();
        setMessages((current) => active() ? mergeMessages(current, [placeholder]) : current);
        const posted = input.reshareSourceMessageId
          ? await postClashMediaReshare(
              roomId,
              input.reshareSourceMessageId,
              input.parentMessageId ?? null,
              input.body,
              authorRef.current, requestKey, account,
            )
          : await postMessage({ ...input, roomId, requestKey, expectedAccountId:account }, authorRef.current);
        if (requestKey) await confirmOfficialRequest(account,roomId,'message',requestKey).catch(()=>{});
        const resolution = resolveSendResolution({ mounted: mounted.current, sentGeneration: sendGeneration, currentGeneration: accessGeneration.current });
        if (!ownsSend() || !resolution.applyRow) return false;
        const admittedPost = visibilityBarrier.admit([posted], sendVisibilityEpoch);
        setMessages(createTranscriptUpdater(admittedPost, snapshot, reactionSnapshots.current, visibilityBarrier,
          () => isCurrentScope(mounted.current, sendGeneration, accessGeneration.current), temporaryId));
        return true;
      } catch (caught) {
        if (active()) {
          if (placeholderId) setMessages((current) => isCurrentScope(mounted.current, sendGeneration, accessGeneration.current)
            ? current.filter((message) => message.id !== placeholderId) : current);
          notify(caught);
        }
        return false;
      } finally {
        if (ownsSend()) {
          sendBusy.current = null;
          if (isCurrentScope(mounted.current, sendGeneration, accessGeneration.current)) setSending(false);
        }
      }
    },
    [notify, roomId, sending],
  );

  const react = React.useCallback(
    (messageId: string, emoji = 'ðŸ”¥'): Promise<void> => {
      const generation = accessGeneration.current;
      const viewer = authorRef.current?.id;
      // Protect this message the moment the tap happens, and release the guard
      // only when the mutation actually settles (success or repaired failure).
      reactionSnapshots.current.beginMutation(messageId);
      const active = () => mounted.current && generation === accessGeneration.current && authorRef.current?.id === viewer;
      return reactionQueue.current!.enqueue(messageId, emoji, active).finally(() => {
        reactionSnapshots.current.finishMutation(messageId);
      });
    },
    [],
  );

  const addEvidence = React.useCallback(
    async (input: Omit<SubmitArenaEvidenceInput, 'roomId'>): Promise<boolean> => {
      if(evidenceBusy.current) return false;
      evidenceBusy.current=true;
      const generation = accessGeneration.current;
      try {
        const account=await currentUserId();
        if(!account || !isCurrentScope(mounted.current, generation, accessGeneration.current)) return false;
        const requestKey=roomRef.current?.roomMode==='DUEL' ? await acquireOfficialRequest(account,roomId,'evidence',input) : undefined;
        if(!isCurrentScope(mounted.current, generation, accessGeneration.current)) return false;
        const created=await submitEvidence({...input,roomId,requestKey,expectedAccountId:account});
        if(requestKey) await confirmOfficialRequest(account,roomId,'evidence',requestKey).catch(()=>{});
        if(!isCurrentScope(mounted.current, generation, accessGeneration.current)) return false;
        setEvidence(old => isCurrentScope(mounted.current, generation, accessGeneration.current)
          ? [...new Map([...old,created].map(row=>[row.id,row])).values()].sort((a,b)=>compareOfficial(b,a)) : old);
        return true;
      } catch(caught) { if(isCurrentScope(mounted.current, generation, accessGeneration.current)) notify(caught); return false; }
      finally {evidenceBusy.current=false;}
    },
    [notify, roomId],
  );

  const markUseful = React.useCallback(
    async (evidenceId: string): Promise<void> => {
      const generation = accessGeneration.current;
      try {
        const result = await markEvidenceUseful(evidenceId);
        if (!isCurrentScope(mounted.current, generation, accessGeneration.current)) return;
        setEvidence((current) =>
          !isCurrentScope(mounted.current, generation, accessGeneration.current) ? current : current.map((item) =>
            item.id === result.evidenceId
              ? { ...item, usefulCount: result.usefulCount, viewerMarkedUseful: result.marked }
              : item,
          ),
        );
      } catch (caught) {
        if (isCurrentScope(mounted.current, generation, accessGeneration.current)) notify(caught);
      }
    },
    [notify],
  );

  const voteSide = React.useCallback(
    async (side: 'AGREE' | 'DISAGREE'): Promise<boolean> => {
      try {
        await submitSideVote(roomId, side);
        if (mounted.current) {
          setRoom((current) =>
            current && current.viewer
              ? { ...current, viewer: { ...current.viewer, hasSideVote: true } }
              : current,
          );
        }
        return true;
      } catch (caught) {
        notify(caught);
        return false;
      }
    },
    [notify, roomId],
  );

  const voteArgument = React.useCallback(
    async (messageId: string): Promise<boolean> => {
      try {
        await submitArgumentVote(roomId, messageId);
        if (mounted.current) {
          setRoom((current) =>
            current && current.viewer
              ? { ...current, viewer: { ...current.viewer, hasArgumentVote: true } }
              : current,
          );
        }
        return true;
      } catch (caught) {
        notify(caught);
        return false;
      }
    },
    [notify, roomId],
  );

  const recordFinal = React.useCallback(
    async (stance: Stance): Promise<boolean> => {
      try {
        const result = await recordFinalStance(roomId, stance);
        if (mounted.current) {
          setRoom((current) =>
            current && current.viewer
              ? {
                  ...current,
                  viewer: {
                    ...current.viewer,
                    finalStance: result.finalStance,
                    finalRecordedAt: result.finalRecordedAt,
                  },
                }
              : current,
          );
          try {
            const s = await fetchMindshiftStats(roomId);
            if (mounted.current) setStats(s);
          } catch {
            /* the aggregate is best-effort; the stance is already recorded */
          }
        }
        return true;
      } catch (caught) {
        notify(caught);
        return false;
      }
    },
    [notify, roomId],
  );

  const upgradeToDebater = React.useCallback(
    async (stance: Stance): Promise<boolean> => {
      try {
        setRoomFullOnUpgrade(false);
        await upgradeSpectator(roomId, stance);
        if (!mounted.current) return true;
        const next = await fetchRoom(roomId);
        if (mounted.current) setRoom(next);
        return true;
      } catch (caught) {
        if (
          caught instanceof SupabaseError &&
          (caught.code === 'P0009' || /room is full/i.test(caught.message))
        ) {
          if (mounted.current) setRoomFullOnUpgrade(true);
          dispatch(showNotice('This room filled up while you were watching.'));
          return false;
        }
        notify(caught);
        return false;
      }
    },
    [dispatch, notify, roomId],
  );

  return {
    room,
    messages,
    evidence,
    stats,
    loading,
    error,
    threadLocked,
    refreshing,
    sending,
    loadingOlder,
    hasOlder,
    roomFullOnUpgrade,
    refresh,
    loadOlder,
    send,
    react,
    addEvidence,
    markUseful,
    voteSide,
    voteArgument,
    recordFinal,
    upgradeToDebater,
  };
}





