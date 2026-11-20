import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReactionQueue } from './reactionOptimism.ts';

const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function harness() {
  const server = new Map<string, { emoji: string; count: number; viewerReacted: boolean }[]>();
  const display = new Map(server);
  const calls: { id: string; emoji: string; response: ReturnType<typeof deferred<{ messageId: string; emoji: string; reacted: boolean; count: number }>> }[] = [];
  const errors: unknown[] = [];
  let offline = false;
  const queue = createReactionQueue({
    read: async id => { if (offline) throw Error('offline'); return server.get(id) ?? []; },
    toggle: (id, emoji) => { const response = deferred<{ messageId: string; emoji: string; reacted: boolean; count: number }>(); calls.push({ id, emoji, response }); return response.promise; },
    write: (id, rows) => { if (rows) display.set(id, rows); else display.delete(id); },
    onError: error => { errors.push(error); },
  });
  const finish = (index: number) => {
    const call = calls[index], rows = server.get(call.id) ?? [];
    const existing = rows.find(row => row.emoji === call.emoji);
    const reacted = !existing?.viewerReacted;
    const count = (existing?.count ?? 0) + (reacted ? 1 : -1);
    server.set(call.id, [...rows.filter(row => row.emoji !== call.emoji), ...(count ? [{ emoji: call.emoji, count, viewerReacted: reacted }] : [])]);
    return { messageId: call.id, emoji: call.emoji, reacted, count };
  };
  return { queue, server, display, calls, errors, finish, offline: (value: boolean) => { offline = value; } };
}

test('different emojis on one message serialize; no valid response is discarded', async () => {
  const h = harness(), a = h.queue.enqueue('m', '🔥', () => true), b = h.queue.enqueue('m', '😂', () => true);
  await flush(); assert.equal(h.calls.length, 1);
  assert.equal(h.display.get('m')?.[0].count, 0, 'optimism does not invent a total');
  h.calls[0].response.resolve(h.finish(0)); await a; await flush();
  assert.equal(h.calls.length, 2);
  h.calls[1].response.resolve(h.finish(1)); await b;
  assert.deepEqual(h.display.get('m'), h.server.get('m'));
});
test('same emoji toggles execute in tap order', async () => {
  const h = harness(), a = h.queue.enqueue('m', '🔥', () => true), b = h.queue.enqueue('m', '🔥', () => true);
  await flush(); h.calls[0].response.resolve(h.finish(0)); await a; await flush();
  h.calls[1].response.resolve(h.finish(1)); await b;
  assert.deepEqual(h.display.get('m'), []);
});
test('different messages may complete out of order without overwriting each other', async () => {
  const h = harness(), a = h.queue.enqueue('a', '🔥', () => true), b = h.queue.enqueue('b', '😂', () => true);
  await flush(); h.calls[1].response.resolve(h.finish(1)); await b;
  h.calls[0].response.resolve(h.finish(0)); await a;
  for (const id of ['a', 'b']) assert.deepEqual(h.display.get(id), h.server.get(id));
});
test('two rejected mutations do not preserve an earlier optimistic selection', async () => {
  const h = harness(), a = h.queue.enqueue('m', '🔥', () => true), b = h.queue.enqueue('m', '😂', () => true);
  await flush(); h.calls[0].response.reject(Error('denied')); await a; await flush();
  h.calls[1].response.reject(Error('denied')); await b;
  assert.deepEqual(h.display.get('m'), []); assert.equal(h.errors.length, 2);
});
test('lost committed response is reread rather than toggled again', async () => {
  const h = harness(), a = h.queue.enqueue('m', '🔥', () => true);
  await flush(); h.finish(0); h.calls[0].response.reject(Error('lost response')); await a;
  assert.equal(h.calls.length, 1); assert.deepEqual(h.display.get('m'), h.server.get('m'));
});
test('failed repair of an older message is retried by targeted reconciliation', async () => {
  const h = harness(), a = h.queue.enqueue('older-than-newest-page', '🔥', () => true);
  await flush(); h.finish(0); h.offline(true); h.calls[0].response.reject(Error('lost response')); await a;
  assert.deepEqual(h.display.get('older-than-newest-page'), []);
  h.offline(false); await h.queue.reconcile();
  assert.deepEqual(h.display.get('older-than-newest-page'), h.server.get('older-than-newest-page'));
});
test('a late server commit after a successful immediate repair is reconciled too', async () => {
  const h = harness(), a = h.queue.enqueue('old-message', '🔥', () => true);
  await flush(); h.calls[0].response.reject(Error('timeout')); await a;
  assert.deepEqual(h.display.get('old-message'), []);
  h.finish(0); // The original request commits after the recovery SELECT returned.
  await h.queue.reconcile();
  assert.deepEqual(h.display.get('old-message'), h.server.get('old-message'));
  assert.equal(h.calls.length, 1, 'ambiguous toggle was never replayed');
});
test('account change discards responses and queued actions from the old scope', async () => {
  const h = harness(); let active = true;
  const a = h.queue.enqueue('m', '🔥', () => active), b = h.queue.enqueue('m', '😂', () => active);
  await flush(); active = false; h.calls[0].response.resolve(h.finish(0)); await Promise.all([a, b]);
  assert.equal(h.calls.length, 1);
});
