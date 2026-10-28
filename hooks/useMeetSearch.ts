/**
 * Meet matchmaking lifecycle (E3.1).
 *
 * Owns the search clock so screens never re-implement it:
 *  - one self-scheduling poll loop (no overlapping ticks, no double intervals);
 *  - exponential backoff after transport failures;
 *  - polling pauses while the app is backgrounded and resumes on foreground;
 *  - cancelling uses actor-scoped cancel_meet_search for the admitted queue id
 *    (never poll_meet_queue for recovery — that path can match);
 *  - a matched session is always the *current* session (never revived);
 *  - leaving the screen while queued cancels that search id when known.
 */
import * as React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { errorText } from '../services/supabaseClient';
import {
  cancelMeetSearch,
  fetchMeetSession,
  joinMeetQueue,
  leaveMeetQueue,
  leaveMeetSession,
  pollMeetQueue,
  type MeetChannel,
  type MeetHoodId,
  type MeetMatchMode,
  type MeetSession,
} from '../services/meetService';
import {
  createMeetRequestGuard,
  meetCancelVsMatch,
  meetPollDelay,
  meetQueueOutcome,
  MEET_MAX_POLL_MS,
  MEET_QUEUE_POLL_MS,
  MEET_SESSION_POLL_MS,
  type MeetRequestGuard,
} from '../utils/meetLifecycle';

export type MeetSearchPhase = 'idle' | 'searching' | 'matched';

export interface MeetSearchInput {
  mode: MeetMatchMode;
  channel: MeetChannel;
  countryCode?: string | null;
  hood?: MeetHoodId | null;
  interests?: string[];
}

export interface MeetSearchApi {
  phase: MeetSearchPhase;
  session: MeetSession | null;
  busy: boolean;
  error: string | null;
  /** Explains why a search stopped (expired wait, cancelled race, …). */
  notice: string | null;
  failures: number;
  start: (input: MeetSearchInput) => Promise<MeetSession | null>;
  cancel: () => Promise<void>;
  /** Ends the matched session and returns to idle. */
  release: () => Promise<void>;
  /** Drops a match locally without ending it (wrong channel resume). */
  dismiss: () => void;
  dismissNotice: () => void;
}

export function useMeetSearch(): MeetSearchApi {
  const [phase, setPhase] = React.useState<MeetSearchPhase>('idle');
  const [session, setSession] = React.useState<MeetSession | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [failures, setFailures] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const [guard] = React.useState<MeetRequestGuard>(createMeetRequestGuard);
  const phaseRef = React.useRef<MeetSearchPhase>('idle');
  const sessionRef = React.useRef<MeetSession | null>(null);
  const cancelledRef = React.useRef(false);
  const startingRef = React.useRef(false);
  /** Generation of the current start intent; cancel bumps it so late join is dropped. */
  const searchGenerationRef = React.useRef(0);
  /** Queue id returned by the admitted join for this generation. */
  const searchQueueIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Polling must stop in the background: no ghost loops draining the battery.
  React.useEffect(() => {
    const onChange = (status: AppStateStatus): void => setPaused(status !== 'active');
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  const cancel = React.useCallback(async (): Promise<void> => {
    cancelledRef.current = true;
    searchGenerationRef.current += 1;
    guard.invalidate();
    sessionRef.current = null;
    setSession(null);
    setPhase('idle');
    setError(null);

    const queueId = searchQueueIdRef.current;
    searchQueueIdRef.current = null;

    try {
      if (queueId) {
        // Actor-scoped cancel for THIS search only — never poll_meet_queue (can match).
        const result = await cancelMeetSearch(queueId);
        if (!result.resolved) {
          setNotice('Could not confirm that Meet search was cleared. Try again if it reappears.');
        }
        return;
      }
      // No admitted queue id yet (cancel during in-flight join): best-effort waiting sweep.
      await leaveMeetQueue();
    } catch {
      setNotice('Could not confirm that Meet search was cleared. Try again if it reappears.');
    }
  }, [guard]);

  const release = React.useCallback(async (): Promise<void> => {
    const current = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    setPhase('idle');
    if (!current) return;
    try {
      await leaveMeetSession(current.sessionId, 'leave');
    } catch {
      // Already ended server-side — local state is the source of truth now.
    }
  }, []);

  const dismiss = React.useCallback((): void => {
    sessionRef.current = null;
    setSession(null);
    setPhase('idle');
  }, []);

  const start = React.useCallback(
    async (input: MeetSearchInput): Promise<MeetSession | null> => {
      // Double-tap guard: one start per intent, never two queue rows.
      if (startingRef.current) return null;
      startingRef.current = true;
      cancelledRef.current = false;
      const generation = ++searchGenerationRef.current;
      searchQueueIdRef.current = null;
      guard.invalidate();
      setBusy(true);
      setError(null);
      setNotice(null);
      setSession(null);
      try {
        const state = await joinMeetQueue({
          mode: input.mode,
          channel: input.channel,
          countryCode: input.mode === 'COUNTRY' ? (input.countryCode ?? null) : null,
          hood: input.mode === 'HOOD' ? (input.hood ?? null) : null,
          interests: input.mode === 'INTERESTS' ? (input.interests ?? []) : [],
        });

        // Cancel / newer start invalidated this join — do not restore searching.
        if (cancelledRef.current || generation !== searchGenerationRef.current) {
          const lateQueueId = state.queueId ?? null;
          if (lateQueueId) {
            await cancelMeetSearch(lateQueueId).catch(() => undefined);
          } else if (state.session?.sessionId) {
            await leaveMeetSession(state.session.sessionId, 'cancel').catch(() => undefined);
          } else {
            await leaveMeetQueue().catch(() => undefined);
          }
          setPhase('idle');
          return null;
        }

        if (state.queueId) searchQueueIdRef.current = state.queueId;

        const outcome = meetQueueOutcome(state, Date.now());
        if (outcome === 'matched' && state.session) {
          sessionRef.current = state.session;
          setSession(state.session);
          setPhase('matched');
          return state.session;
        }
        if (outcome === 'searching') {
          setPhase('searching');
          return null;
        }
        setPhase('idle');
        setNotice('Your last search expired. Start again.');
        return null;
      } catch (e) {
        if (cancelledRef.current || generation !== searchGenerationRef.current) {
          setPhase('idle');
          return null;
        }
        setPhase('idle');
        setError(errorText(e));
        return null;
      } finally {
        startingRef.current = false;
        setBusy(false);
      }
    },
    [guard],
  );

  // One poll loop for the whole search; `paused` tears it down cleanly.
  React.useEffect(() => {
    if (phase !== 'searching' || paused) return undefined;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let strikes = 0;

    const schedule = (delay: number): void => {
      if (!alive) return;
      timer = setTimeout(() => {
        timer = null;
        void tick();
      }, delay);
    };

    const tick = async (): Promise<void> => {
      if (!alive) return;
      const token = guard.begin();
      try {
        const state = await pollMeetQueue();
        // A newer tick (or a cancel) already owns the state: drop this payload.
        if (!alive || !guard.isCurrent(token) || cancelledRef.current) return;
        strikes = 0;
        setFailures(0);
        if (state.queueId) searchQueueIdRef.current = state.queueId;
        const outcome = meetQueueOutcome(state, Date.now());
        if (outcome === 'matched' && state.session) {
          if (meetCancelVsMatch(cancelledRef.current, true) === 'discard') {
            const qid = searchQueueIdRef.current ?? state.queueId;
            if (qid) await cancelMeetSearch(qid).catch(() => undefined);
            else await leaveMeetSession(state.session.sessionId, 'cancel').catch(() => undefined);
            setPhase('idle');
            return;
          }
          sessionRef.current = state.session;
          setSession(state.session);
          setPhase('matched');
          return;
        }
        if (outcome === 'lost') {
          setPhase('idle');
          setNotice('That search ended. Start again.');
          return;
        }
        schedule(MEET_QUEUE_POLL_MS);
      } catch {
        if (!alive || cancelledRef.current) return;
        strikes += 1;
        setFailures(strikes);
        schedule(meetPollDelay(MEET_QUEUE_POLL_MS, strikes, MEET_MAX_POLL_MS));
      }
    };

    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [guard, paused, phase]);

  const matchedId = session?.sessionId ?? null;

  // A match card must never outlive its session: verify while it is on screen.
  React.useEffect(() => {
    if (phase !== 'matched' || paused || !matchedId) return undefined;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let strikes = 0;

    const verify = async (): Promise<void> => {
      if (!alive) return;
      const token = guard.begin();
      try {
        const fresh = await fetchMeetSession(matchedId);
        if (!alive || !guard.isCurrent(token)) return;
        strikes = 0;
        const outcome = meetQueueOutcome(
          { queued: false, matched: true, session: fresh },
          Date.now(),
        );
        if (outcome !== 'matched') {
          sessionRef.current = null;
          setSession(null);
          setPhase('idle');
          setNotice('That connection ended before you joined.');
          return;
        }
        timer = setTimeout(() => {
          timer = null;
          void verify();
        }, MEET_SESSION_POLL_MS);
      } catch {
        if (!alive) return;
        strikes += 1;
        timer = setTimeout(() => {
          timer = null;
          void verify();
        }, meetPollDelay(MEET_SESSION_POLL_MS, strikes, MEET_MAX_POLL_MS));
      }
    };

    void verify();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [guard, matchedId, paused, phase]);

  // Unmounting mid-search must not leave a phantom waiting/matched row behind.
  React.useEffect(
    () => () => {
      if (phaseRef.current !== 'searching' && phaseRef.current !== 'matched') return;
      const queueId = searchQueueIdRef.current;
      searchQueueIdRef.current = null;
      cancelledRef.current = true;
      searchGenerationRef.current += 1;
      if (queueId) {
        void cancelMeetSearch(queueId).catch(() => undefined);
        return;
      }
      void leaveMeetQueue().catch(() => undefined);
    },
    [],
  );

  const dismissNotice = React.useCallback((): void => setNotice(null), []);

  return {
    phase,
    session,
    busy,
    error,
    notice,
    failures,
    start,
    cancel,
    release,
    dismiss,
    dismissNotice,
  };
}
