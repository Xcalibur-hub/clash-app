/**
 * CLASH 2.0 — Creator AI provider abstraction (Phase 15.5).
 *
 * The feature is deliberately NOT built around one vendor: everything above this
 * file talks to `AiProvider`, and a production provider is swapped in by setting
 * environment variables on the Edge Function runtime. API keys exist only here,
 * never in the Expo bundle, and are never returned to a client.
 *
 * When no provider is configured the honest answer is "not configured" — this
 * module never fabricates a model reply.
 */

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletion {
  ok: true;
  text: string;
  provider: string;
  model: string | null;
}

export interface AiUnavailable {
  ok: false;
  provider: string;
  /** Machine-readable, surfaced verbatim by the client banner. */
  reason: 'not_configured' | 'provider_error' | 'empty_response';
}

export type AiResult = AiCompletion | AiUnavailable;

export interface AiProvider {
  readonly name: string;
  readonly configured: boolean;
  complete(messages: readonly AiMessage[], maxTokens: number): Promise<AiResult>;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 25_000;

/**
 * OpenAI-compatible chat completions. Point `CREATOR_AI_BASE_URL` at any
 * compatible gateway to move vendors without touching application code.
 */
function openAiCompatible(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
}): AiProvider {
  return {
    name: 'openai-compatible',
    configured: true,
    async complete(messages, maxTokens) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${input.apiKey}`,
          },
          body: JSON.stringify({
            model: input.model,
            messages,
            max_tokens: maxTokens,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          // The upstream body is never surfaced: it can echo configuration.
          return { ok: false, provider: 'openai-compatible', reason: 'provider_error' };
        }
        const payload = (await response.json()) as {
          choices?: { message?: { content?: unknown } }[];
          model?: unknown;
        };
        const text = payload.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || text.trim().length === 0) {
          return { ok: false, provider: 'openai-compatible', reason: 'empty_response' };
        }
        return {
          ok: true,
          text: text.trim(),
          provider: 'openai-compatible',
          model: typeof payload.model === 'string' ? payload.model : input.model,
        };
      } catch {
        return { ok: false, provider: 'openai-compatible', reason: 'provider_error' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Honest no-provider state: the UI must say so rather than invent an answer. */
const unconfiguredProvider: AiProvider = {
  name: 'development',
  configured: false,
  complete: async () => ({ ok: false, provider: 'development', reason: 'not_configured' }),
};

export function resolveProvider(env: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): AiProvider {
  const apiKey = (env.apiKey ?? '').trim();
  if (apiKey.length === 0) return unconfiguredProvider;
  return openAiCompatible({
    apiKey,
    baseUrl: (env.baseUrl ?? '').trim() || DEFAULT_BASE_URL,
    model: (env.model ?? '').trim() || DEFAULT_MODEL,
  });
}
