import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClashDiscovery, clashDiscoveryDestination } from './arenaClashDiscovery.ts';
test('pending navigates to its Take and cannot masquerade as a linked duel', () => {
  const p = { id:'pending',takeId:'take',roomId:null,title:'Source',status:'PENDING',state:'PENDING',kind:'CHALLENGE' };
  assert.equal(clashDiscoveryDestination(parseClashDiscovery([p])[0]), '/take/take');
  assert.throws(() => parseClashDiscovery([{...p,roomId:'room'}]));
  assert.throws(() => parseClashDiscovery([{...p,state:'LIVE'}]));
});
test('canonical live, upcoming and completed records all open their linked Room', () => {
  for(const state of ['LIVE','UPCOMING','COMPLETED']) {
    const p = { id:'clash',takeId:'take',roomId:'room',title:'Source',status:'open',state,kind:'CLASH' };
    assert.equal(clashDiscoveryDestination(parseClashDiscovery([p])[0]), '/arena/room/room');
  }
});
test('cancelled and settled cannot appear Live; legacy retains its judging route', () => {
  for(const status of ['cancelled','settled']) {
    const p = { id:'clash',takeId:'take',roomId:null,title:'Source',status,state:'COMPLETED',kind:'CLASH' };
    assert.equal(clashDiscoveryDestination(parseClashDiscovery([p])[0]), '/clash/take');
    assert.throws(() => parseClashDiscovery([{...p,state:'LIVE'}]));
  }
});
