/**
 * Privacy-safe product analytics for CLASH beta.
 *
 * Provider (PostHog) stays encapsulated here. Screens/services call only
 * `analytics.track` / `identify` / `reset` / `setEnabled`.
 *
 * Never send Take/comment text, email, OTP, tokens, GPS, Vault URLs, Mindshift
 * stance, or private content. Prefer coarse categories and IDs.
 *
 * Missing config → no-ops. Failures never throw to callers.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { PostHog } from './posthogClient';
import { redact } from './logRedact';

const apiKey = (process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '').trim();
const host =
  (process.env.EXPO_PUBLIC_POSTHOG_HOST ?? '').trim() || 'https://us.i.posthog.com';
const debugOverride = process.env.EXPO_PUBLIC_ANALYTICS_DEBUG === '1';

type AppVariant = 'development' | 'preview' | 'production';

function resolveVariant(): AppVariant {
  const fromExtra = Constants.expoConfig?.extra?.appVariant;
  if (fromExtra === 'development' || fromExtra === 'preview' || fromExtra === 'production') {
    return fromExtra;
  }
  return 'production';
}

const variant = resolveVariant();

/** Env gate: preview/production release, or explicit debug override in any build. */
function envAllowsReporting(): boolean {
  if (!apiKey) return false;
  if (debugOverride) return true;
  return (variant === 'preview' || variant === 'production') && !__DEV__;
}

/** Whitelisted event names for the beta funnel. */
export type AnalyticsEvent =
  | 'onboarding_completed'
  | 'auth_completed'
  | 'arena_viewed'
  | 'arena_topic_viewed'
  | 'arena_room_joined'
  | 'arena_message_sent'
  | 'room_pulse_opened'
  | 'room_pulse_category_viewed'
  | 'take_opened'
  | 'take_created'
  | 'hood_joined'
  | 'clash_started'
  | 'judgement_submitted'
  | 'clash_opened'
  | 'clash_judgement_started'
  | 'clash_judgement_completed'
  | 'clash_verdict_viewed'
  | 'clash_result_shared'
  | 'arena_result_shared'
  | 'world_opened'
  | 'world_drop_opened'
  | 'world_drop_created'
  | 'vault_opened'
  | 'vault_drop_opened'
  | 'vault_drop_created'
  | 'vault_service_viewed'
  | 'vault_service_requested'
  | 'vault_course_viewed'
  | 'vault_course_started'
  | 'vault_lesson_completed'
  | 'vault_product_viewed'
  | 'vault_product_external_opened'
  | 'profile_viewed'
  | 'sponsor_dashboard_viewed'
  | 'sponsor_campaign_created'
  | 'sponsor_creator_assigned'
  | 'sponsor_referral_created'
  | 'sponsor_coupon_created'
  | 'creator_earnings_viewed'
  | 'creator_campaign_opened'
  | 'creator_referral_shared'
  | 'creator_coupon_shared'
  | 'media_reply_picker_opened'
  | 'media_reply_created'
  | 'gif_picker_opened'
  | 'gif_reply_created'
  | 'explore_opened'
  | 'explore_country_selected'
  | 'explore_country_searched'
  | 'explore_teleport'
  | 'explore_content_opened'
  | 'explore_globe_rotated'
  | 'explore_challenge_opened'
  | 'explore_treasure_opened'
  | 'explore_vault_preview_opened'
  | 'play_opened'
  | 'challenge_opened'
  | 'challenge_joined'
  | 'challenge_submitted'
  | 'challenge_entry_reacted'
  | 'challenge_completed'
  | 'treasure_opened'
  | 'treasure_joined'
  | 'treasure_clue_attempted'
  | 'treasure_clue_completed'
  | 'treasure_completed'
  | 'treasure_reward_claimed'
  | 'meet_opened'
  | 'meet_queue_joined'
  | 'meet_matched'
  | 'meet_chat_started'
  | 'meet_next'
  | 'meet_left'
  | 'meet_reported'
  | 'meet_blocked'
  | 'meet_video_opened'
  | 'meet_video_queue_joined'
  | 'meet_video_matched'
  | 'meet_video_connected'
  | 'meet_video_next'
  | 'meet_video_left'
  | 'meet_video_reported'
  | 'meet_video_blocked'
  | 'meet_video_connection_failed'
  // Phase 14 — Arena game layer. No message text, no stance, ever.
  | 'arena_backup_requested'
  | 'arena_backup_accepted'
  | 'arena_backup_declined'
  | 'arena_backup_expired'
  | 'arena_backup_call_failed'
  | 'arena_backup_preference_changed'
  | 'arena_evidence_submitted'
  | 'arena_room_capacity_reached'
  | 'arena_judging_started'
  | 'arena_room_settled';

/** Allowed property keys — anything else is dropped. */
const ALLOWED_PROP_KEYS = new Set([
  'source',
  'realm',
  'hood_id',
  'take_has_media',
  'media_type',
  'clash_mode',
  'is_creator',
  'is_guest',
  'is_self',
  'world_distance_band',
  'vault_access_type',
  'world_filter',
  'accessible',
  'reply_depth',
  'has_query',
]);

export type AnalyticsProperties = {
  source?: string;
  realm?: 'arena' | 'world' | 'vault' | 'profile' | 'explore';
  hood_id?: string;
  take_has_media?: boolean;
  media_type?: 'image' | 'video' | 'gif' | 'none';
  clash_mode?: 'STANDARD' | 'BLIND';
  is_creator?: boolean;
  is_guest?: boolean;
  is_self?: boolean;
  world_distance_band?: string;
  vault_access_type?: 'free' | 'subscriber' | 'preview';
  world_filter?: 'nearby' | 'recent' | 'mission';
  accessible?: boolean;
  /** Nesting depth of a media reply (0 = top-level). */
  reply_depth?: number;
  /** Whether GIF search had a non-empty query (never the query text). */
  has_query?: boolean;
};

let client: PostHog | null = null;
let initialized = false;
/** Runtime kill-switch (defaults on when env allows). */
let enabledFlag = true;
const onceKeys = new Set<string>();

function sanitizeProps(
  props?: AnalyticsProperties,
): Record<string, string | number | boolean> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!ALLOWED_PROP_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  // Defense in depth — never let a future typo leak a sensitive key shape.
  return redact(out) as Record<string, string | number | boolean>;
}

function shouldSend(): boolean {
  return initialized && enabledFlag && envAllowsReporting() && client !== null;
}

function debugLog(event: string, props?: Record<string, string | number | boolean>): void {
  if (!__DEV__ && !debugOverride) return;
  // eslint-disable-next-line no-console
  console.info('[clash:analytics]', event, props ?? {});
}

/**
 * Call once from the root layout. Safe with missing keys — analytics stays off.
 */
export function initAnalytics(): void {
  if (initialized) return;
  initialized = true;

  if (!apiKey) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.info('[clash:analytics] disabled (no EXPO_PUBLIC_POSTHOG_API_KEY)');
    }
    return;
  }

  if (!envAllowsReporting()) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.info(
        '[clash:analytics] quiet in development (set EXPO_PUBLIC_ANALYTICS_DEBUG=1 to force)',
      );
    }
    return;
  }

  try {
    client = new PostHog(apiKey, {
      host,
      // Avoid Expo SDK 54 legacy file-system write crashes; AsyncStorage is already in-app.
      customStorage: AsyncStorage,
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      // No PostHogProvider autocapture — only explicit taxonomy events.
      preloadFeatureFlags: false,
      sendFeatureFlagEvent: false,
      disableGeoip: true,
    });
  } catch {
    client = null;
  }
}

export const analytics = {
  /** Globally pause/resume product analytics (no Settings UI in this pass). */
  setEnabled(next: boolean): void {
    enabledFlag = next;
    try {
      if (!client) return;
      if (next) void client.optIn();
      else void client.optOut();
    } catch {
      /* never block */
    }
  },

  isEnabled(): boolean {
    return shouldSend();
  },

  track(event: AnalyticsEvent, props?: AnalyticsProperties): void {
    try {
      const safe = sanitizeProps(props);
      debugLog(event, safe);
      if (!shouldSend() || !client) return;
      client.capture(event, safe);
    } catch {
      /* never block product flows */
    }
  },

  /**
   * Fire at most once per process for a given key (e.g. `take_opened:${id}`).
   * Use for load-success views that might remount; prefer focus for realm visits.
   */
  trackOnce(key: string, event: AnalyticsEvent, props?: AnalyticsProperties): void {
    if (onceKeys.has(key)) return;
    onceKeys.add(key);
    analytics.track(event, props);
  },

  /** Identify with opaque auth/profile id only. Guests stay anonymous. */
  identify(userId: string): void {
    try {
      if (!userId) return;
      debugLog('identify', { user_id: '[id]' });
      if (!shouldSend() || !client) return;
      client.identify(userId);
    } catch {
      /* never block */
    }
  },

  /** Clear identity on sign-out; next session is anonymous again. */
  reset(): void {
    try {
      debugLog('reset');
      onceKeys.clear();
      if (!client) return;
      client.reset();
    } catch {
      /* never block */
    }
  },
};
