import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  reduceMeetVideoState,
  shouldApplySignal,
  type MeetVideoConnState,
} from './meetVideoSession.ts';

describe('meet video state machine', () => {
  it('moves idle → preparing → signaling → connecting → connected', () => {
    let s: MeetVideoConnState = 'idle';
    s = reduceMeetVideoState(s, 'start');
    assert.equal(s, 'preparing');
    s = reduceMeetVideoState(s, 'local_ready');
    assert.equal(s, 'signaling');
    s = reduceMeetVideoState(s, 'remote_signal');
    assert.equal(s, 'connecting');
    s = reduceMeetVideoState(s, 'ice_connected');
    assert.equal(s, 'connected');
  });

  it('cleanup is idempotent from any terminal path', () => {
    assert.equal(reduceMeetVideoState('failed', 'cleanup'), 'ended');
    assert.equal(reduceMeetVideoState('ended', 'cleanup'), 'ended');
    assert.equal(reduceMeetVideoState('connected', 'cleanup'), 'ended');
  });

  it('treats peer leave as ended', () => {
    assert.equal(reduceMeetVideoState('connected', 'peer_left'), 'ended');
    assert.equal(reduceMeetVideoState('connecting', 'peer_left'), 'ended');
  });

  it('dedupes signaling ids', () => {
    const seen = new Set<string>(['sig_1']);
    assert.equal(shouldApplySignal(seen, 'sig_1'), false);
    assert.equal(shouldApplySignal(seen, 'sig_2'), true);
  });

  it('reconnects after temporary ice disconnect', () => {
    let s: MeetVideoConnState = 'connected';
    s = reduceMeetVideoState(s, 'ice_disconnected');
    assert.equal(s, 'reconnecting');
    s = reduceMeetVideoState(s, 'ice_connected');
    assert.equal(s, 'connected');
  });
});
