/**
 * Bounded live preview for the active Today's Arena card.
 * Polls a SECURITY DEFINER RPC — never subscribes to every room message.
 */
import React from 'react';
import { AppState } from 'react-native';
import {
  fetchTopicLivePreview,
  type LiveArgumentExcerpt,
  type LiveReactionSignal,
  type LiveTopicPresence,
  type LiveTopicPreview,
} from '../services/liveArenaService';

const POLL_MS = 12_000;
const BURST_COOLDOWN_MS = 10_000;
const BURST_VISIBLE_MS = 2600;

export interface UseLiveTopicPreviewResult {
  excerpts: readonly LiveArgumentExcerpt[];
  presence: readonly LiveTopicPresence[];
  signals: readonly LiveReactionSignal[];
  burstText: string | null;
  loading: boolean;
}

export function useLiveTopicPreview(
  topicId: string | null,
  enabled: boolean,
): UseLiveTopicPreviewResult {
  const [preview, setPreview] = React.useState<LiveTopicPreview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [burstText, setBurstText] = React.useState<string | null>(null);
  const knownIds = React.useRef<Set<string>>(new Set());
  const lastBurstAt = React.useRef(0);
  const burstTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyPreview = React.useCallback((next: LiveTopicPreview, allowBurst: boolean): void => {
    const prevIds = knownIds.current;
    const incoming = next.excerpts;
    let burst: string | null = null;

    if (allowBurst && prevIds.size > 0) {
      for (const excerpt of incoming) {
        if (!prevIds.has(excerpt.id) && excerpt.text.trim().length >= 8) {
          const now = Date.now();
          if (now - lastBurstAt.current >= BURST_COOLDOWN_MS) {
            burst = excerpt.text.trim().slice(0, 72);
            lastBurstAt.current = now;
          }
          break;
        }
      }
    }

    knownIds.current = new Set(incoming.map((e) => e.id));
    setPreview(next);

    if (burst) {
      setBurstText(burst);
      if (burstTimer.current) clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(() => setBurstText(null), BURST_VISIBLE_MS);
    }
  }, []);

  React.useEffect(() => {
    if (!enabled || !topicId) {
      setPreview(null);
      setBurstText(null);
      knownIds.current = new Set();
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async (allowBurst: boolean): Promise<void> => {
      try {
        const data = await fetchTopicLivePreview(topicId);
        if (cancelled) return;
        applyPreview(data, allowBurst);
      } catch {
        // Home stays usable without previews.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    void load(false);

    const tick = (): void => {
      if (AppState.currentState !== 'active') return;
      void load(true);
    };
    timer = setInterval(tick, POLL_MS);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load(true);
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (burstTimer.current) clearTimeout(burstTimer.current);
      sub.remove();
    };
  }, [applyPreview, enabled, topicId]);

  return {
    excerpts: preview?.excerpts ?? [],
    presence: preview?.presence ?? [],
    signals: preview?.reactionSignals ?? [],
    burstText,
    loading,
  };
}
