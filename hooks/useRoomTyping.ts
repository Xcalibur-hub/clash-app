import React from 'react';
import {
  subscribeRoomTyping,
  type ArenaTypingState,
} from '../services/liveArenaService';
import {
  shouldRefreshTypingBroadcast,
  typingExpired,
  TYPING_IDLE_MS,
} from '../utils/roomTyping';

export interface UseRoomTypingOptions {
  roomId: string | undefined;
  enabled: boolean;
  viewer: { userId: string; handle: string; name: string; avatarTint: string } | null;
}

/**
 * Ephemeral typing presence for one room.
 * Server records expire after six seconds. Never broadcasts draft text.
 */
export function useRoomTyping({
  roomId,
  enabled,
  viewer,
}: UseRoomTypingOptions): {
  peers: ArenaTypingState[];
  onComposerActivity: (replyingToMessageId: string | null, hasInput: boolean) => void;
  clearTyping: () => void;
} {
  const [peers, setPeers] = React.useState<ArenaTypingState[]>([]);
  const lastBroadcast = React.useRef<number | null>(null);
  const idleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const api = React.useRef<ReturnType<typeof subscribeRoomTyping> | null>(null);

  React.useEffect(() => {
    if (!enabled || !roomId || !viewer?.userId) {
      setPeers([]);
      return undefined;
    }
    const sub = subscribeRoomTyping(roomId, viewer, (next) => {
      // Soft filter: drop self; room channel already scopes to this room.
      setPeers(next.filter((p) => p.userId !== viewer.userId));
    });
    api.current = sub;
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      sub.clearTyping();
      sub.unsubscribe();
      api.current = null;
      setPeers([]);
      lastBroadcast.current = null;
    };
  }, [enabled, roomId, viewer?.userId, viewer?.handle, viewer?.name, viewer?.avatarTint]);

  const clearTyping = React.useCallback((): void => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    lastBroadcast.current = null;
    api.current?.clearTyping();
  }, []);

  const onComposerActivity = React.useCallback(
    (replyingToMessageId: string | null, hasInput: boolean): void => {
      if (!hasInput) {
        clearTyping();
        return;
      }
      const now = Date.now();
      if (shouldRefreshTypingBroadcast(lastBroadcast.current, now, true)) {
        lastBroadcast.current = now;
        api.current?.setTyping(replyingToMessageId);
      }
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        if (lastBroadcast.current && typingExpired(lastBroadcast.current, Date.now())) {
          clearTyping();
        }
      }, TYPING_IDLE_MS);
    },
    [clearTyping],
  );

  return { peers, onComposerActivity, clearTyping };
}
