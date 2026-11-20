import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearTeleportHistory,
  rememberTeleportId,
  readTeleportHistory,
} from './exploreTeleportHistory.ts';

describe('Teleport recent-history dedupe', () => {
  it('remembers ids newest-first and bounds length', () => {
    clearTeleportHistory();
    rememberTeleportId('a');
    rememberTeleportId('b');
    rememberTeleportId('a');
    const history = readTeleportHistory();
    assert.equal(history[0], 'a');
    assert.equal(history[1], 'b');
    assert.equal(history.filter((id) => id === 'a').length, 1);
  });
});
