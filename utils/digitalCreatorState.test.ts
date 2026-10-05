import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  availableDigitalModes,
  digitalCapabilityRows,
  digitalDisclosureNote,
  digitalDisclosurePlate,
  digitalStageCopy,
  digitalUnavailableNote,
  holdToTalkPhase,
  isDigitalSessionCurrent,
  likenessConsentCopy,
  resolveDigitalCapability,
  sanitizeModelReference,
  sanitizeProviderSlug,
  voiceInputNote,
} from './digitalCreatorState.ts';
import type {
  DigitalCreatorBlock,
  DigitalCreatorConfig,
  DigitalCreatorSession,
  DigitalCreatorStatus,
} from '../services/digitalCreatorMappers.ts';

const connected: DigitalCreatorStatus = {
  provider: 'authorized-provider',
  configured: true,
  modes: ['AVATAR', 'VOICE'],
  text: true,
};

const unconnected: DigitalCreatorStatus = {
  provider: 'none',
  configured: false,
  modes: [],
  text: true,
};

function block(partial: Partial<DigitalCreatorBlock> = {}): DigitalCreatorBlock {
  return {
    configured: true,
    available: true,
    displayName: 'Digital Maya',
    avatarEnabled: true,
    voiceEnabled: true,
    textFallback: true,
    preferredMode: 'AVATAR',
    artwork: null,
    ...partial,
  };
}

function config(partial: Partial<DigitalCreatorConfig> = {}): DigitalCreatorConfig {
  return {
    provider: 'demo_avatar',
    avatarExternalId: 'model-1',
    voiceExternalId: 'voice-1',
    displayName: 'Digital Maya',
    avatarEnabled: true,
    voiceEnabled: true,
    textFallbackEnabled: true,
    consentAt: 1,
    consentVersion: 'v1',
    connected: true,
    artwork: null,
    artworkMediaObjectId: null,
    ...partial,
  };
}

function session(partial: Partial<DigitalCreatorSession> = {}): DigitalCreatorSession {
  return {
    sessionId: 'dcs_1',
    mode: 'AVATAR',
    active: true,
    expiresAt: 1_000_000,
    textFallback: true,
    ...partial,
  };
}

describe('digital room modes', () => {
  it('offers only text when nothing is connected', () => {
    assert.deepEqual(availableDigitalModes(null, unconnected), ['TEXT']);
    assert.deepEqual(availableDigitalModes(block({ available: false }), connected), ['TEXT']);
  });

  it('never offers TALK while the provider is unconfigured', () => {
    assert.deepEqual(availableDigitalModes(block(), unconnected), ['TEXT']);
  });

  it('offers TALK and TEXT once a capability is live', () => {
    assert.deepEqual(availableDigitalModes(block(), connected), ['TALK', 'TEXT']);
  });
});

describe('capability fallback', () => {
  it('degrades avatar to voice, then to text', () => {
    assert.deepEqual(resolveDigitalCapability(block(), 'AVATAR', connected), {
      capability: 'AVATAR',
      degraded: false,
    });
    assert.deepEqual(
      resolveDigitalCapability(block({ avatarEnabled: false }), 'AVATAR', connected),
      { capability: 'VOICE', degraded: true },
    );
    assert.deepEqual(
      resolveDigitalCapability(
        block({ avatarEnabled: false, voiceEnabled: false }),
        'AVATAR',
        connected,
      ),
      { capability: 'TEXT', degraded: true },
    );
  });

  it('degrades voice to text and never upgrades', () => {
    assert.deepEqual(resolveDigitalCapability(block({ voiceEnabled: false }), 'VOICE', connected), {
      capability: 'TEXT',
      degraded: true,
    });
    assert.deepEqual(resolveDigitalCapability(block(), 'TEXT', connected), {
      capability: 'TEXT',
      degraded: false,
    });
  });

  it('treats an unconfigured provider as text only', () => {
    assert.deepEqual(resolveDigitalCapability(block(), 'AVATAR', unconnected), {
      capability: 'TEXT',
      degraded: true,
    });
  });
});

describe('disclosure', () => {
  it('always labels the digital version as digital', () => {
    assert.equal(digitalDisclosurePlate('Digital Maya', 'Maya'), 'DIGITAL VERSION OF DIGITAL MAYA');
    assert.equal(digitalDisclosurePlate(null, 'Maya'), 'DIGITAL VERSION OF MAYA');
    assert.equal(digitalDisclosurePlate(null, null), 'DIGITAL VERSION OF THIS CREATOR');
  });

  it('never implies the human creator is present', () => {
    const plate = digitalDisclosurePlate('Digital Maya', 'Maya').toLowerCase();
    assert.equal(plate.includes('is talking'), false);
    assert.equal(plate.includes('is live'), false);
  });

  it('says who it is not', () => {
    assert.match(digitalDisclosureNote('Maya'), /It is not Maya\./);
  });

  it('states the honest unavailable reason and keeps text', () => {
    assert.match(digitalUnavailableNote(null), /provider not connected/i);
    assert.match(digitalUnavailableNote(null), /Text AI remains available/);
    assert.match(digitalUnavailableNote('provider_error'), /could not be reached/);
  });
});

describe('stage copy', () => {
  it('carries the disclosure as the kicker', () => {
    const copy = digitalStageCopy({
      displayName: 'Digital Maya',
      creatorName: 'Maya',
      block: block(),
      status: connected,
      requested: 'AVATAR',
    });
    assert.equal(copy.kicker, 'DIGITAL VERSION OF DIGITAL MAYA');
    assert.equal(copy.mode, 'AVATAR');
    assert.equal(copy.degraded, false);
  });

  it('explains itself when it had to degrade', () => {
    const copy = digitalStageCopy({
      displayName: 'Digital Maya',
      creatorName: 'Maya',
      block: block(),
      status: unconnected,
      requested: 'AVATAR',
    });
    assert.equal(copy.mode, 'TEXT');
    assert.equal(copy.degraded, true);
    assert.match(copy.note, /Text AI remains available/);
  });
});

describe('hold to talk', () => {
  it('only reaches ready after a real hold', () => {
    assert.equal(holdToTalkPhase(0, false, true), 'listening');
    assert.equal(holdToTalkPhase(120, true, true), 'too_short');
    assert.equal(holdToTalkPhase(900, true, true), 'ready');
  });

  it('stays idle when no recorder exists', () => {
    assert.equal(holdToTalkPhase(900, true, false), 'idle');
  });

  it('explains unavailable voice input without blocking text', () => {
    assert.match(voiceInputNote(false, true), /not available in this build/);
    assert.match(voiceInputNote(false, true), /Text still works/);
    assert.match(voiceInputNote(true, false), /speech service/);
    assert.match(voiceInputNote(true, true), /never stored/);
  });
});


describe('session lifetime', () => {
  it('keeps a fresh session current', () => {
    assert.equal(isDigitalSessionCurrent(session({ expiresAt: 2_000_000 }), 1_000_000), true);
  });

  it('rejects an expired, ended or expiring session', () => {
    assert.equal(isDigitalSessionCurrent(session({ expiresAt: 1_000_000 }), 1_000_000), false);
    assert.equal(isDigitalSessionCurrent(session({ active: false, expiresAt: 9_000_000 }), 0), false);
    assert.equal(isDigitalSessionCurrent(session({ expiresAt: null }), 0), false);
  });

  it('treats a text session as always available', () => {
    assert.equal(
      isDigitalSessionCurrent(session({ mode: 'TEXT', sessionId: null, expiresAt: null }), 9),
      true,
    );
    assert.equal(isDigitalSessionCurrent(null, 0), false);
  });
});

describe('studio connection rules', () => {
  it('reports each capability independently', () => {
    const rows = digitalCapabilityRows(config({ avatarEnabled: false }));
    assert.deepEqual(rows, [
      { key: 'avatar', label: 'Avatar', on: false },
      { key: 'voice', label: 'Voice', on: true },
      { key: 'text', label: 'Text fallback', on: true },
    ]);
  });

  it('asks for explicit rights, not an assumption', () => {
    const copy = likenessConsentCopy();
    assert.match(copy, /I own this likeness/);
    assert.match(copy, /permission/);
    assert.match(copy, /does not train/);
  });

  it('normalises provider slugs and model references', () => {
    assert.equal(sanitizeProviderSlug('  Demo Avatar!  '), 'demo_avatar');
    assert.equal(sanitizeProviderSlug('__weird__'), 'weird');
    assert.equal(sanitizeProviderSlug('x'.repeat(60)).length, 40);
    assert.equal(sanitizeModelReference(' model-1 / 2 '), 'model-12');
    assert.equal(sanitizeModelReference('a'.repeat(400)).length, 120);
  });
});

