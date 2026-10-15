import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkedRoomAfterAccept } from './arenaAcceptNavigation.ts';

test('linked accept returns the Room id for navigation', () => {
  assert.equal(linkedRoomAfterAccept({ status: 'ACCEPTED', roomId: 'room-1' }), 'room-1');
});

test('accept without a linked Room refuses navigation', () => {
  assert.equal(linkedRoomAfterAccept({ status: 'ACCEPTED', roomId: null }), null);
  assert.equal(linkedRoomAfterAccept({ status: 'ACCEPTED', roomId: '' }), null);
  assert.equal(linkedRoomAfterAccept({ status: 'ACCEPTED' }), null);
});

test('non-accept outcomes refuse Room navigation', () => {
  assert.equal(linkedRoomAfterAccept({ status: 'PASSED', roomId: 'room-1' }), null);
  assert.equal(linkedRoomAfterAccept({ status: 'EXPIRED', roomId: 'room-1' }), null);
});
