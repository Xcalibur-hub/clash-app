import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { newArgumentsEvent, phaseEventForStatus } from './liveRoomEvents.ts';

describe('phaseEventForStatus', () => {
  it('announces real phase advances only', () => {
    assert.equal(phaseEventForStatus('OPEN', null), null);
    assert.equal(phaseEventForStatus('OPEN', 'OPEN'), null);
    assert.deepEqual(phaseEventForStatus('FINAL_ARGUMENTS', 'OPEN'), {
      kind: 'final_arguments',
      label: 'Final arguments started',
    });
    assert.deepEqual(phaseEventForStatus('JUDGING', 'FINAL_ARGUMENTS'), {
      kind: 'judging',
      label: 'Judging is open',
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
