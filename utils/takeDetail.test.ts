import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discussionEntry, openTakeDiscussion, takeIsArchived } from './takeDetail.ts';

test('expiry boundary is closed, never a locally granted write permission', () => {
  assert.equal(takeIsArchived(100, 99), false);
  assert.equal(takeIsArchived(100, 100), true);
  assert.equal(takeIsArchived(100, 101), true);
  assert.equal(takeIsArchived(NaN, 100), true);
});

test('Take → Clash → discussion pops to the original Take, retaining route state', () => {
  const take = { name: 'take/[takeId]', params: { takeId: 'a', challenge: '0' }, key: 'original' };
  const stack = { index: 2, routes: [{ name: '(tabs)' }, take, { name: 'clash/[takeId]' }] };
  assert.equal(discussionEntry(stack, 'a'), 'dismissTo');
  assert.equal(stack.routes[1], take); // Decision does not mutate saved route params/state.
  assert.equal(discussionEntry(stack, 'b'), 'push');
});

test('direct/deep-linked Clash pushes discussion so Back can return to Clash', () => {
  assert.equal(discussionEntry({ index: 0, routes: [{ name: 'clash/[takeId]' }] }, 'a'), 'push');
  assert.equal(discussionEntry(undefined, 'a'), 'push');
});

test('only an exact earlier Take route may be reused', () => {
  assert.equal(discussionEntry({ index: 0, routes: [{ name: 'take/[takeId]', params: { takeId: 'a' } }] }, 'a'), 'push');
  assert.equal(discussionEntry({ index: 1, routes: [{ name: 'take/[takeId]' }, { name: 'clash/[takeId]' }] }, 'a'), 'push');
});

test('entry handler reads the local navigator at press time, not a stale root snapshot', () => {
  const calls: string[] = [];
  const router = { push: () => { calls.push('push'); }, dismissTo: () => { calls.push('pop'); } };
  let stack = { index: 0, routes: [{ name: 'clash/[takeId]', params: { takeId: 'a' } }] };
  const navigation = { getState: () => stack };
  openTakeDiscussion(router, navigation, 'a');
  stack = { index: 1, routes: [{ name: 'take/[takeId]', params: { takeId: 'a' } }, { name: 'clash/[takeId]', params: { takeId: 'a' } }] };
  openTakeDiscussion(router, navigation, 'a');
  assert.deepEqual(calls, ['push', 'pop']);
});
