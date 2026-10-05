/**
 * CLASH 2.0 — Digital Creator provider abstraction (Phase 15.5B).
 *
 * CLASH never trains a likeness model. A creator authorizes a model with an
 * external provider and we store only a safe reference (no credentials), so this
 * adapter is the ONLY place a rendering provider is ever called and the only
 * place its API key exists. Swapping vendors means adding one adapter here —
 * nothing in the Vault experience, the database or the AI pipeline changes.
 *
 * Keeping the two providers separate is deliberate:
 *   · Creator AI (the `creator-ai` function) decides WHAT is said.
 *   · A Digital Creator provider only renders that already-authorized text.
 * A renderer can therefore never widen knowledge or access.
 */

export type DigitalCreatorMode = 'VOICE' | 'AVATAR';

export interface RenderInput {
  mode: DigitalCreatorMode;
  /** Text produced by the Creator AI pipeline. Never client-authored. */
  text: string;
  avatarExternalId: string;
  voiceExternalId: string | null;
  /** Provider-side conversation/session handle, if the provider needs one. */
  providerSessionRef: string | null;
}

export interface RenderOk {
  ok: true;
  provider: string;
  audioUrl: string | null;
  videoUrl: string | null;
}

export interface RenderUnavailable {
  ok: false;
  provider: string;
  reason: 'not_configured' | 'provider_error';
}

export type RenderResult = RenderOk | RenderUnavailable;

export interface SessionResult {
  ok: boolean;
  provider: string;
  providerSessionRef: string | null;
  reason?: 'not_configured' | 'provider_error';
}

export interface DigitalCreatorProvider {
  readonly name: string;
  readonly configured: boolean;
  /** Provider-side session lifetime; a no-op for pinned/clip providers. */
  startSession(input: {
    mode: DigitalCreatorMode;
    avatarExternalId: string;
    voiceExternalId: string | null;
  }): Promise<SessionResult>;
  render(input: RenderInput): Promise<RenderResult>;
  endSession(providerSessionRef: string | null): Promise<void>;
}

const REQUEST_TIMEOUT_MS = 30_000;

/** Honest default: nothing connected, nothing fabricated. */
export const unconfiguredProvider: DigitalCreatorProvider = {
  name: 'none',
  configured: false,
  startSession: async ({ mode }) => ({
    ok: false,
    provider: `none:${mode}`,
    providerSessionRef: null,
    reason: 'not_configured',
  }),
  render: async () => ({ ok: false, provider: 'none', reason: 'not_configured' }),
  endSession: async () => undefined,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function httpsUrl(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('https://') ? value : null;
}

/**
 * Generic authorized-provider adapter.
 *
 * The contract is intentionally small — open a session, render a clip, close it
 * — because every commercial avatar/voice vendor exposes some version of it.
 * Point `DIGITAL_CREATOR_BASE_URL` at a vendor or an internal gateway to swap
 * implementations without touching application code.
 */
function httpProvider(input: { apiKey: string; baseUrl: string }): DigitalCreatorProvider {
  const base = input.baseUrl.replace(/\/+$/, '');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.apiKey}`,
  };

  async function call(path: string, body: unknown): Promise<Record<string, unknown> | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        // The upstream body is never surfaced, logged or stored: it can echo
        // configuration.
        return null;
      }
      return asRecord(await response.json());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: 'authorized-provider',
    configured: true,
    async startSession({ mode, avatarExternalId, voiceExternalId }) {
      const payload = await call('/sessions', {
        model: avatarExternalId,
        voice: voiceExternalId,
        mode,
      });
      if (!payload) {
        return {
          ok: false,
          provider: 'authorized-provider',
          providerSessionRef: null,
          reason: 'provider_error',
        };
      }
      const ref = payload.sessionId ?? payload.session_id ?? payload.id;
      return {
        ok: true,
        provider: 'authorized-provider',
        providerSessionRef: typeof ref === 'string' ? ref : null,
      };
    },
    async render({ mode, text, avatarExternalId, voiceExternalId, providerSessionRef }) {
      const payload = await call('/render', {
        model: avatarExternalId,
        voice: voiceExternalId,
        mode,
        session: providerSessionRef,
        text,
      });
      if (!payload) {
        return { ok: false, provider: 'authorized-provider', reason: 'provider_error' };
      }
      const audioUrl = httpsUrl(payload.audioUrl ?? payload.audio_url);
      const videoUrl = httpsUrl(payload.videoUrl ?? payload.video_url);
      // A provider that returns neither is a failure, not an empty success: a
      // poster is never dressed up as rendered media.
      if (!audioUrl && !videoUrl) {
        return { ok: false, provider: 'authorized-provider', reason: 'provider_error' };
      }
      return { ok: true, provider: 'authorized-provider', audioUrl, videoUrl };
    },
    async endSession(providerSessionRef) {
      if (!providerSessionRef) return;
      await call('/sessions/end', { session: providerSessionRef });
    },
  };
}

export function resolveDigitalProvider(env: {
  apiKey?: string;
  baseUrl?: string;
}): DigitalCreatorProvider {
  const apiKey = (env.apiKey ?? '').trim();
  const baseUrl = (env.baseUrl ?? '').trim();
  if (apiKey.length === 0) return unconfiguredProvider;
  if (!baseUrl.startsWith('https://')) return unconfiguredProvider;
  return httpProvider({ apiKey, baseUrl });
}

