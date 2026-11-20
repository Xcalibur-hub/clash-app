import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  newArgumentsEvent,
  phaseEventForStatus,
  pulseChangeEvent,
} from './liveRoomEvents.ts';

describe('phaseEventForStatus', () => {
  it('announces real phase advances only', () => {
    assert.equal(phaseEventForStatus('OPEN', null), null);
    assert.equal(phaseEventForStatus('OPEN', 'OPEN'), null);
    assert.deepEqual(phaseEventForStatus('FINAL_ARGUMENTS', 'OPEN'), {
      kind: 'final_arguments',
      label: 'Final arguments — last stand',
    });
    assert.deepEqual(phaseEventForStatus('JUDGING', 'FINAL_ARGUMENTS'), {
      kind: 'judging',
      label: 'Judging is open — the room decides',
    });
    assert.deepEqual(phaseEventForStatus('SETTLED', 'JUDGING'), {
      kind: 'result',
      label: 'Result is in',
    });
  });
});

describe('newArgumentsEvent', () => {
  it('labels real unseen argument counts', () => {
    assert.equal(newArgumentsEvent(0), null);
    assert.deepEqual(newArgumentsEvent(1), {
      kind: 'new_arguments',
      label: '1 new argument',
    });
    assert.deepEqual(newArgumentsEvent(3), {
      kind: 'new_arguments',
      label: '3 new arguments',
    });
  });
});

describe('pulseChangeEvent', () => {
  it('labels Fast Rising and other pulse shifts from real leaders', () => {
    assert.deepEqual(pulseChangeEvent({ category: 'FAST_RISING', authorName: 'Alex' }), {
      kind: 'pulse_rising',
      label: 'Alex is Fast Rising',
    });
    assert.deepEqual(pulseChangeEvent({ category: 'TOP_ARGUMENT', authorName: 'Maya' }), {
      kind: 'pulse_updated',
      label: 'Room Pulse updated',
    });
  });
});
