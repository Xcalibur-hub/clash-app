/**
 * Meet text-chat lifecycle (E3.1).
 *
 * Guarantees:
 *  - one message poll + one session poll, never overlapping themselves;
 *  - responses are token-checked, so a slow payload can never overwrite a
 *    newer one (or revive a conversation that already ended);
 *  - `ended` / `expired` are terminal for the lifetime of the screen;
 *  - polling and presence stop in the background and resume on foreground;
 *  - sending is refused the moment the session is over;
 *  - leaving the screen ends the session server-side exactly once.
 */
import * as React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { errorText, SupabaseError } from '../services/supabaseClient';
import {
  fetchMeetSession,
  leaveMeetSession,
  listMeetMessages,
  sendMeetMessage,
  subscribeMeetTyping,
  type MeetMessage,
  type MeetSession,
} from '../services/meetService';
import {
  createMeetRequestGuard,
  meetCanSend,
  meetChatStatus,
  meetIsTerminalError,
  meetPollDelay,
  meetStatusIsTerminal,
  mergeMeetMessages,
  MEET_MAX_POLL_MS,
  MEET_MESSAGE_POLL_MS,
  MEET_SESSION_POLL_MS,
  type MeetChatStatus,
  type MeetRequestGuard,
} from '../utils/meetLifecycle';

export interface MeetChatApi {
  session: MeetSession | null;
  messages: MeetMessage[];
  status: MeetChatStatus;
  loading: boolean;
  error: string | null;
  sending: boolean;
  peerTyping: boolean;
  failures: number;
  canSend: boolean;
  send: (body: string) => Promise<boolean>;
  notifyTyping: () => void;
  /** Ends the session for both sides (leave). Safe to call twice. */
  leave: () => Promise<void>;
  /** Another action already ended it server-side (block / next / report). */
  markEnded: () => void;
  refresh: () => Promise<void>;
}


export function useMeetChat(sessionId: string): MeetChatApi {
  const [session, setSession] = React.useState<MeetSession | null>(null);
  const [messages, setMessages] = React.useState<MeetMessage[]>([]);
  const [status, setStatus] = React.useState<MeetChatStatus>('connected');
  const [loading, setLoading] = React.useState(true);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [peerTyping, setPeerTyping] = React.useState(false);
  const [failures, setFailures] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const [sessionGuard] = React.useState<MeetRequestGuard>(createMeetRequestGuard);
  const [messageGuard] = React.useState<MeetRequestGuard>(createMeetRequestGuard);
  const statusRef = React.useRef<MeetChatStatus>('connected');
  const sessionRef = React.useRef<MeetSession | null>(null);
  const leftRef = React.useRef(false);
  const sendingRef = React.useRef(false);
  const typingRef = React.useRef<ReturnType<typeof subscribeMeetTyping> | null>(null);

  const commitStatus = React.useCallback((next: MeetChatStatus): void => {
    // Terminal is absorbing: a stale "active" payload cannot reopen the chat.
    if (meetStatusIsTerminal(statusRef.current) && !meetStatusIsTerminal(next)) return;
    statusRef.current = next;
    setStatus(next);
    if (meetStatusIsTerminal(next)) leftRef.current = true;
  }, []);

  /** Only the newest session response may commit. */
  const applySession = React.useCallback(
    (next: MeetSession, token: number): void => {
      if (!sessionGuard.isCurrent(token)) return;
      sessionRef.current = next;
      setSession(next);
      commitStatus(meetChatStatus(next));
    },
    [commitStatus, sessionGuard],
  );

  // Stop everything while the app is backgrounded - no ghost polling.
  React.useEffect(() => {
    const onChange = (next: AppStateStatus): void => setPaused(next !== 'active');
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);


  // Initial load: session + history in parallel, then allow polling.
  React.useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setReady(false);
      setError('That conversation is unavailable.');
      commitStatus('ended');
      return undefined;
    }
    let alive = true;
    sessionGuard.invalidate();
    messageGuard.invalidate();
    setLoading(true);
    setReady(false);
    setError(null);
    setMessages([]);
    statusRef.current = 'connected';
    leftRef.current = false;

    void (async () => {
      try {
        const [fresh, batch] = await Promise.all([
          fetchMeetSession(sessionId),
          listMeetMessages(sessionId, 60),
        ]);
        if (!alive) return;
        sessionRef.current = fresh;
        setSession(fresh);
        commitStatus(meetChatStatus(fresh));
        setMessages((current) => mergeMeetMessages(current, batch));
        setReady(true);
      } catch (e) {
        if (!alive) return;
        if (e instanceof SupabaseError && meetIsTerminalError(e.code)) {
          commitStatus('ended');
          setError('That conversation is unavailable.');
        } else {
          setError(errorText(e));
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [commitStatus, messageGuard, sessionGuard, sessionId]);

  const terminal = meetStatusIsTerminal(status);


  // Message + session polling. Self-scheduling: a slow response delays the next
  // beat instead of stacking a second request on top of it.
  React.useEffect(() => {
    if (!ready || terminal || paused || !sessionId) return undefined;
    let alive = true;
    let messageTimer: ReturnType<typeof setTimeout> | null = null;
    let sessionTimer: ReturnType<typeof setTimeout> | null = null;
    let messageStrikes = 0;
    let sessionStrikes = 0;

    const scheduleMessages = (delay: number): void => {
      if (!alive) return;
      messageTimer = setTimeout(() => {
        messageTimer = null;
        void pollMessages();
      }, delay);
    };

    const scheduleSession = (delay: number): void => {
      if (!alive) return;
      sessionTimer = setTimeout(() => {
        sessionTimer = null;
        void pollSession();
      }, delay);
    };

    const pollMessages = async (): Promise<void> => {
      if (!alive) return;
      const token = messageGuard.begin();
      try {
        const batch = await listMeetMessages(sessionId, 60);
        // Out-of-order response: a newer tick already wrote the transcript.
        if (!alive || !messageGuard.isCurrent(token)) return;
        messageStrikes = 0;
        setFailures(0);
        setMessages((current) => mergeMeetMessages(current, batch));
        scheduleMessages(MEET_MESSAGE_POLL_MS);
      } catch {
        if (!alive) return;
        messageStrikes += 1;
        setFailures(messageStrikes);
        scheduleMessages(meetPollDelay(MEET_MESSAGE_POLL_MS, messageStrikes, MEET_MAX_POLL_MS));
      }
    };

    const pollSession = async (): Promise<void> => {
      if (!alive) return;
      const token = sessionGuard.begin();
      try {
        const fresh = await fetchMeetSession(sessionId);
        if (!alive || !sessionGuard.isCurrent(token)) return;
        sessionStrikes = 0;
        applySession(fresh, token);
        scheduleSession(MEET_SESSION_POLL_MS);
      } catch (e) {
        if (!alive) return;
        // "Session not found" / "not a participant" means the conversation is
        // gone: showing "reconnecting" forever would be a lie.
        if (e instanceof SupabaseError && meetIsTerminalError(e.code)) {
          sessionGuard.invalidate();
          commitStatus('ended');
          return;
        }
        sessionStrikes += 1;
        setFailures(sessionStrikes);
        scheduleSession(meetPollDelay(MEET_SESSION_POLL_MS, sessionStrikes, MEET_MAX_POLL_MS));
      }
    };

    void pollMessages();
    void pollSession();
    return () => {
      alive = false;
      if (messageTimer) clearTimeout(messageTimer);
      if (sessionTimer) clearTimeout(sessionTimer);
    };
  }, [applySession, messageGuard, paused, ready, sessionGuard, sessionId, terminal]);

  // Presence: one subscription per screen, torn down on unmount.
  React.useEffect(() => {
    if (!ready || terminal || !sessionId) return undefined;
    const sub = subscribeMeetTyping(sessionId, setPeerTyping);
    typingRef.current = sub;
    return () => {
      typingRef.current = null;
      setPeerTyping(false);
      sub.unsubscribe();
    };
  }, [ready, sessionId, terminal]);

  React.useEffect(() => {
    if (!ready || terminal) return;
    if (paused) typingRef.current?.clear();
    else typingRef.current?.broadcast();
  }, [paused, ready, terminal]);

  const notifyTyping = React.useCallback((): void => {
    typingRef.current?.broadcast();
  }, []);

  const send = React.useCallback(
    async (body: string): Promise<boolean> => {
      const trimmed = body.trim();
      if (!trimmed || sendingRef.current) return false;
      if (!meetCanSend(statusRef.current)) {
        setError('This conversation has ended.');
        return false;
      }
      sendingRef.current = true;
      setSending(true);
      setError(null);
      try {
        const message = await sendMeetMessage(sessionId, trimmed);
        setMessages((current) => mergeMeetMessages(current, [message]));
        return true;
      } catch (e) {
        if (e instanceof SupabaseError && meetIsTerminalError(e.code)) {
          // Server says the session is closed/expired: stop pretending otherwise.
          sessionGuard.invalidate();
          commitStatus(e.code === 'P0003' ? 'expired' : 'ended');
          setError('This conversation has ended.');
        } else {
          setError(errorText(e));
        }
        return false;
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [commitStatus, sessionGuard, sessionId],
  );


  const leave = React.useCallback(async (): Promise<void> => {
    if (leftRef.current) return;
    leftRef.current = true;
    sessionGuard.invalidate();
    messageGuard.invalidate();
    commitStatus('ended');
    try {
      await leaveMeetSession(sessionId, 'leave');
    } catch {
      // Already closed (or offline) - the UI must not block on this.
    }
  }, [commitStatus, messageGuard, sessionGuard, sessionId]);

  const markEnded = React.useCallback((): void => {
    leftRef.current = true;
    sessionGuard.invalidate();
    messageGuard.invalidate();
    commitStatus('ended');
  }, [commitStatus, messageGuard, sessionGuard]);

  const refresh = React.useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    const token = sessionGuard.begin();
    try {
      const [fresh, batch] = await Promise.all([
        fetchMeetSession(sessionId),
        listMeetMessages(sessionId, 60),
      ]);
      applySession(fresh, token);
      setMessages((current) => mergeMeetMessages(current, batch));
      setReady(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [applySession, sessionGuard, sessionId]);

  // Unmounting ends the session once - the peer is never left hanging.
  React.useEffect(
    () => () => {
      if (leftRef.current) return;
      leftRef.current = true;
      void leaveMeetSession(sessionId, 'leave').catch(() => undefined);
    },
    [sessionId],
  );

  return {
    session,
    messages,
    status,
    loading,
    error,
    sending,
    peerTyping,
    failures,
    canSend: ready && meetCanSend(status) && !terminal,
    send,
    notifyTyping,
    leave,
    markEnded,
    refresh,
  };
}
