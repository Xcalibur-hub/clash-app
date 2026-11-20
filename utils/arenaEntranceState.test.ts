import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeArenaEntrance,
  peekArenaEntrancePending,
  requestArenaEntrance,
  resetArenaEntranceForTests,
} from './arenaEntranceState.ts';

test('Arena entrance plays once then skips until next realm entry', () => {
  resetArenaEntranceForTests();
  assert.equal(peekArenaEntrancePending(), true);
  assert.equal(consumeArenaEntrance(), true);
  assert.equal(consumeArenaEntrance(), false);
  assert.equal(peekArenaEntrancePending(), false);
  requestArenaEntrance();
  assert.equal(consumeArenaEntrance(), true);
  assert.equal(consumeArenaEntrance(), false);
});
