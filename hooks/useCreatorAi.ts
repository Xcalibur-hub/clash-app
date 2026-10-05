import React from 'react';
import {
  fetchCreatorAi,
  fetchCreatorAiMessages,
  fetchCreatorAiProviderStatus,
  reportCreatorAiMessage,
  sendCreatorAiTurn,
  startCreatorAiConversation,
} from '../services/creatorAiService';
import type { CreatorAiMessage, CreatorAiProfile } from '../services/creatorAiMappers';
import { errorText } from '../services/supabaseClient';
import { showNotice, useClash } from '../store';
import {
  AI_HISTORY_PAGE,
  mergeAiMessages,
  oldestCursor,
  sanitizeAiDraft,
} from '../utils/creatorAiState';

export interface CreatorAiController {
  profile: CreatorAiProfile | null;
  conversationId: string | null;
  messages: CreatorAiMessage[];
  loading: boolean;
  sending: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  error: string | null;
  providerReady: boolean;
  externalError: boolean;
  send: (text: string) => Promise<boolean>;
  loadOlder: () => Promise<void>;
  report: (messageId: string, reason: Parameters<typeof reportCreatorAiMessage>[1]) => Promise<void>;
  refresh: () => Promise<void>;
}

/** Optimistic echo ids never collide with server ids. */
function localId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function refusalText(error: string): string {
  if (error === 'rate_limited') return 'You have reached the message limit for now.';
  if (error === 'ai_disabled') return 'This creator switched their AI off.';
  if (error === 'not_permitted') return 'This AI is not available to you.';
  if (error === 'bad_message') return 'That message cannot be sent.';
  return 'That message could not be sent.';
}

/**
 * One AI room for the current viewer: profile disclosure, bounded history, and
 * turns that always go through the server.
 */
export function useCreatorAi(creatorId: string | undefined): CreatorAiController {
  const { dispatch } = useClash();
  const [profile, setProfile] = React.useState<CreatorAiProfile | null>(null);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<CreatorAiMessage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [hasOlder, setHasOlder] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [providerReady, setProviderReady] = React.useState(true);
  const [externalError, setExternalError] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    if (!creatorId) return;
    try {
      const next = await fetchCreatorAi(creatorId);
      setProfile(next);
      if (!next || !next.canChat) {
        setConversationId(null);
        setMessages([]);
        setError(next ? null : 'This creator has not opened an AI room.');
        return;
      }
      setError(null);
      const ref = await startCreatorAiConversation(creatorId);
      setConversationId(ref.conversationId);
      if (ref.profile) setProfile(ref.profile);
      const page = await fetchCreatorAiMessages(ref.conversationId, null, AI_HISTORY_PAGE);
      setMessages(mergeAiMessages([], page));
      setHasOlder(page.length >= AI_HISTORY_PAGE);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  React.useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Ask the server once whether a provider exists, so the room is honest before
  // the viewer writes anything.
  React.useEffect(() => {
    if (!creatorId) return undefined;
    let alive = true;
    void fetchCreatorAiProviderStatus().then((status) => {
      if (alive) setProviderReady(status.configured);
    });
    return () => {
      alive = false;
    };
  }, [creatorId]);

  const send = React.useCallback(
    async (text: string): Promise<boolean> => {
      const body = sanitizeAiDraft(text).trim();
      if (conversationId === null || body.length === 0) return false;

      const echoId = localId('local');
      setSending(true);
      setMessages((current) =>
        mergeAiMessages(current, [
          { id: echoId, role: 'user', body, provider: null, model: null, createdAt: Date.now() },
        ]),
      );

      try {
        const turn = await sendCreatorAiTurn(conversationId, body);
        if (turn.status === 'ok') {
          setExternalError(false);
          setMessages((current) => mergeAiMessages(current, turn.message ? [turn.message] : []));
          return true;
        }
        if (turn.status === 'unconfigured') {
          // Nothing was invented; the honest state is now visible in the room.
          setProviderReady(false);
          return false;
        }
        if (turn.status === 'unavailable') {
          setExternalError(true);
          return false;
        }
        setMessages((current) => current.filter((entry) => entry.id !== echoId));
        dispatch(showNotice(refusalText(turn.error)));
        return false;
      } catch (caught) {
        setMessages((current) => current.filter((entry) => entry.id !== echoId));
        dispatch(showNotice(errorText(caught)));
        return false;
      } finally {
        setSending(false);
      }
    },
    [conversationId, dispatch],
  );

  const loadOlder = React.useCallback(async (): Promise<void> => {
    if (conversationId === null) return;
    const cursor = oldestCursor(messages);
    if (cursor === null) {
      setHasOlder(false);
      return;
    }
    setLoadingOlder(true);
    try {
      const page = await fetchCreatorAiMessages(conversationId, cursor, AI_HISTORY_PAGE);
      setMessages((current) => mergeAiMessages(current, page));
      setHasOlder(page.length >= AI_HISTORY_PAGE);
    } catch (caught) {
      dispatch(showNotice(errorText(caught)));
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, dispatch, messages]);

  const report = React.useCallback(
    async (
      messageId: string,
      reason: Parameters<typeof reportCreatorAiMessage>[1],
    ): Promise<void> => {
      try {
        await reportCreatorAiMessage(messageId, reason);
        dispatch(showNotice('Report sent.'));
      } catch (caught) {
        dispatch(showNotice(errorText(caught)));
      }
    },
    [dispatch],
  );

  return {
    profile,
    conversationId,
    messages,
    loading,
    sending,
    loadingOlder,
    hasOlder,
    error,
    providerReady,
    externalError,
    send,
    loadOlder,
    report,
    refresh: load,
  };
}

