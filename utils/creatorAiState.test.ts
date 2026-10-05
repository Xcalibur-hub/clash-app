import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aiChapterCopy,
  aiDisclosureDetail,
  aiDisclosureLabel,
  aiMessageProvenance,
  aiProviderNotice,
  aiSendBlockReason,
  canSendAiMessage,
  clampReply,
  hasOlderHistory,
  mergeAiMessages,
  oldestCursor,
  sanitizeAiDraft,
} from './creatorAiState.ts';
import type { CreatorAiMessage } from '../services/creatorAiMappers.ts';

function message(partial: Partial<CreatorAiMessage> & { id: string }): CreatorAiMessage {
  return {
    role: 'user',
    body: 'hello',
    provider: null,
    model: null,
    createdAt: 1,
    ...partial,
  };
}

describe('creator ai disclosure', () => {
  it('always presents the AI as an AI version of the creator', () => {
    assert.equal(aiDisclosureLabel('Maya'), 'AI VERSION OF MAYA');
    assert.equal(aiDisclosureLabel(null), 'AI VERSION OF THIS CREATOR');
    assert.equal(
      aiDisclosureDetail({ displayName: 'Maya AI', creatorName: 'Maya' }),
      "Maya AI is an AI built from Maya's approved material. It is not Maya.",
    );
  });

  it('writes chapter copy from the creator name, never the AI name', () => {
    assert.deepEqual(aiChapterCopy({ displayName: 'Maya AI', creatorName: 'Maya' }), {
      kicker: 'AI VERSION',
      headline: 'TALK TO MAYA',
    });
  });

  it('labels assistant provenance and leaves the viewer unlabelled', () => {
    assert.equal(aiMessageProvenance(message({ id: 'a', role: 'user' })), null);
    assert.equal(
      aiMessageProvenance(message({ id: 'b', role: 'assistant', provider: 'openai-compatible' })),
      'AI · openai-compatible',
    );
    assert.equal(aiMessageProvenance(message({ id: 'c', role: 'assistant' })), 'AI');
  });
});

describe('creator ai provider states', () => {
  it('says plainly when no provider is configured', () => {
    const notice = aiProviderNotice({ providerReady: false, externalError: false });
    assert.equal(notice?.kind, 'unconfigured');
    assert.equal(notice?.title, 'AI provider not configured');
  });

  it('distinguishes an external failure from a missing provider', () => {
    const notice = aiProviderNotice({ providerReady: true, externalError: true });
    assert.equal(notice?.kind, 'unavailable');
  });

  it('is silent when the provider is ready', () => {
    assert.equal(aiProviderNotice({ providerReady: true, externalError: false }), null);
  });
});

describe('creator ai composer gating', () => {
  const base = {
    canChat: true,
    viewerAccess: true,
    enabled: true,
    isOwner: false,
    providerReady: true,
    draft: 'How do you build suspense?',
    sending: false,
  };

  it('allows a signed-in entitled viewer to send', () => {
    assert.equal(canSendAiMessage(base), true);
    assert.equal(aiSendBlockReason(base), null);
  });

  it('blocks owners, disabled AI, unentitled viewers and guests', () => {
    assert.match(aiSendBlockReason({ ...base, isOwner: true }) ?? '', /own AI/);
    assert.match(aiSendBlockReason({ ...base, enabled: false }) ?? '', /switched .* off/);
    assert.match(aiSendBlockReason({ ...base, viewerAccess: false }) ?? '', /subscribers/);
    assert.match(aiSendBlockReason({ ...base, canChat: false }) ?? '', /Sign in/);
    assert.equal(canSendAiMessage({ ...base, canChat: false }), false);
  });

  it('refuses to send without a provider or with an empty draft', () => {
    assert.equal(canSendAiMessage({ ...base, providerReady: false }), false);
    assert.equal(canSendAiMessage({ ...base, draft: '   ' }), false);
    assert.equal(canSendAiMessage({ ...base, sending: true }), false);
  });
});

describe('creator ai conversation shaping', () => {
  it('sanitises control characters and bounds the draft', () => {
    assert.equal(sanitizeAiDraft('hi\u0000 there'), 'hi there');
    assert.equal(sanitizeAiDraft('x'.repeat(1200)).length, 1000);
  });

  it('merges pages with one row per id, chronologically', () => {
    const merged = mergeAiMessages(
      [message({ id: 'm2', createdAt: 20 })],
      [
        message({ id: 'm1', createdAt: 10 }),
        message({ id: 'm2', createdAt: 20, body: 'updated' }),
      ],
    );
    assert.deepEqual(
      merged.map((entry) => entry.id),
      ['m1', 'm2'],
    );
    assert.equal(merged[1]?.body, 'updated');
  });

  it('reports the oldest cursor and whether more history exists', () => {
    assert.equal(oldestCursor([message({ id: 'a', createdAt: 5 }), message({ id: 'b', createdAt: 9 })]), 5);
    assert.equal(oldestCursor([message({ id: 'c', createdAt: null })]), null);
    assert.equal(hasOlderHistory(30, 30), true);
    assert.equal(hasOlderHistory(12, 30), false);
  });

  it('clamps an over-long reply for display', () => {
    assert.equal(clampReply('short'), 'short');
    assert.equal(clampReply('x'.repeat(4100)).length, 4001);
  });
});
