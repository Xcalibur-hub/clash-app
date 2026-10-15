import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NAV_DIAGNOSTICS,
  NAV_DIAGNOSTICS_ENV,
  cardDestination,
  guardDecision,
  navDiagnosticsEnabled,
  redactPayload,
} from './navDiagnostics.ts';

describe('arena navigation diagnostics', () => {
  it('is off by default and never on in production', () => {
    assert.equal(navDiagnosticsEnabled({ isDev: true, flag: undefined }), false);
    assert.equal(navDiagnosticsEnabled({ isDev: true, flag: '0' }), false);
    assert.equal(navDiagnosticsEnabled({ isDev: false, flag: '1' }), false);
    assert.equal(navDiagnosticsEnabled({ isDev: true, flag: '1' }), true);
    assert.equal(NAV_DIAGNOSTICS_ENV, 'EXPO_PUBLIC_ARENA_NAV_DIAGNOSTICS');
    assert.equal(NAV_DIAGNOSTICS, false, 'this process is not a development build');
  });

  it('mirrors the auth guard decision', () => {
    assert.equal(guardDecision({ signedIn: true, loading: false }), 'allow');
    assert.equal(guardDecision({ signedIn: false, loading: false }), 'redirect:auth');
    assert.equal(guardDecision({ signedIn: false, loading: true }), 'bail:loading');
    assert.equal(guardDecision({ signedIn: true, loading: true }), 'bail:loading');
  });

  it('routes a card to the room only when the viewer holds one', () => {
    assert.equal(cardDestination('ar_1', 'tp_1'), '/arena/room/ar_1');
    assert.equal(cardDestination(null, 'tp_1'), '/arena/topic/tp_1');
    assert.equal(cardDestination(undefined, 'tp_1'), '/arena/topic/tp_1');
    assert.equal(cardDestination('', 'tp_1'), '/arena/topic/tp_1');
  });

  it('keeps only diagnostic keys, so nothing sensitive can be emitted', () => {
    const payload = redactPayload({
      roomId: 'ar_1', signedIn: true,
      // @ts-expect-error unknown keys are not part of the payload contract
      accessToken: 'secret', body: 'private assist text',
    });
    assert.deepEqual(payload, { roomId: 'ar_1', signedIn: true });
    assert.equal(Object.keys(payload).length, 2);
  });
});
