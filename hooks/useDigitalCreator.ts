import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  fetchDigitalCreatorStatus,
  renderDigitalCreatorReply,
  startDigitalCreatorSession,
  endDigitalCreatorSession,
} from '../services/digitalCreatorService';
import type {
  DigitalCreatorRender,
  DigitalCreatorSession,
  DigitalCreatorStatus,
} from '../services/digitalCreatorMappers';
import { voiceInputAvailability, type VoiceInputAvailability } from '../services/speechInput';
import { showNotice, useClash } from '../store';
import { isDigitalSessionCurrent } from '../utils/digitalCreatorState';

export interface DigitalCreatorController {
  status: DigitalCreatorStatus | null;
  session: DigitalCreatorSession | null;
  rendering: boolean;
  rendered: DigitalCreatorRender | null;
  voice: VoiceInputAvailability;
  /** Explicit entry into a digital mode. Never called on mount. */
  enter: (mode: 'VOICE' | 'AVATAR') => Promise<boolean>;
  /** Render one assistant reply. The server resolves the text itself. */
  render: (messageId: string) => Promise<DigitalCreatorRender | null>;
  leave: () => Promise<void>;
}

/**
 * Owns the lifetime of one digital rendering session.
 *
 * §22: nothing is initialized while browsing Vault. A provider session opens on
 * an explicit entry into TALK, is terminated on leaving, on backgrounding and on
 * timeout, and no media is rendered unless a reply was actually rendered.
 */
export function useDigitalCreator(creatorId: string | undefined): DigitalCreatorController {
  const { dispatch } = useClash();
  const [status, setStatus] = React.useState<DigitalCreatorStatus | null>(null);
  const [session, setSession] = React.useState<DigitalCreatorSession | null>(null);
  const [rendering, setRendering] = React.useState(false);
  const [rendered, setRendered] = React.useState<DigitalCreatorRender | null>(null);
  const [voice, setVoice] = React.useState<VoiceInputAvailability>('recorder_unavailable');
  const sessionRef = React.useRef<DigitalCreatorSession | null>(null);

  // One cheap capability probe per room. No provider session, no media.
  React.useEffect(() => {
    if (!creatorId) return undefined;
    let alive = true;
    void fetchDigitalCreatorStatus().then((next) => {
      if (!alive) return;
      setStatus(next);
      setVoice(voiceInputAvailability(next.configured));
    });
    return () => {
      alive = false;
    };
  }, [creatorId]);

  const leave = React.useCallback(async (): Promise<void> => {
    const current = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    setRendered(null);
    if (current?.sessionId) await endDigitalCreatorSession(current.sessionId);
  }, []);

  /** Leaving the app is leaving the room: terminate rather than keep a video. */
  React.useEffect(() => {
    const onChange = (next: AppStateStatus): void => {
      if (next !== 'active') void leave();
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => {
      subscription.remove();
      void leave();
    };
  }, [leave]);

  const enter = React.useCallback(
    async (mode: 'VOICE' | 'AVATAR'): Promise<boolean> => {
      if (!creatorId) return false;
      setRendering(true);
      try {
        const next = await startDigitalCreatorSession(creatorId, mode);
        if (!next || !isDigitalSessionCurrent(next, Date.now())) {
          // Honest refusal: text mode is still there, nothing is faked.
          setSession(null);
          sessionRef.current = null;
          dispatch(showNotice('The digital version is not available right now.'));
          return false;
        }
        sessionRef.current = next;
        setSession(next);
        setRendered(null);
        return true;
      } catch {
        dispatch(showNotice('The digital version is not available right now.'));
        return false;
      } finally {
        setRendering(false);
      }
    },
    [creatorId, dispatch],
  );

  const render = React.useCallback(
    async (messageId: string): Promise<DigitalCreatorRender | null> => {
      const current = sessionRef.current;
      if (!current?.sessionId || !isDigitalSessionCurrent(current, Date.now())) {
        await leave();
        dispatch(showNotice('The digital session ended.'));
        return null;
      }
      setRendering(true);
      try {
        const result = await renderDigitalCreatorReply(current.sessionId, messageId);
        setRendered(result.status === 'ok' ? result : null);
        if (result.status === 'unconfigured' || result.status === 'unavailable') {
          dispatch(showNotice('The digital version is not available right now.'));
        }
        return result;
      } catch {
        return null;
      } finally {
        setRendering(false);
      }
    },
    [dispatch, leave],
  );

  return { status, session, rendering, rendered, voice, enter, render, leave };
}
