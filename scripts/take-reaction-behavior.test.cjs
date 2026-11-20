const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, deferred } = require('./ui-completion-harness.cjs');
function setup() {
  const state = { reacted: false }, actions = [];
  const store = {
    useClash: () => ({ state, dispatch: action => actions.push(action) }),
    selectHasReacted: s => s.reacted,
    reactToTake: id => ({ kind: 'optimistic', id }),
    syncTakeReaction: (id, reacted, count) => ({ kind: 'sync', id, reacted, count }),
    showNotice: message => ({ kind: 'notice', message }),
  };
  const h = harness('hooks/useTakeReaction.ts', {}, exports => () => exports.useTakeReaction(), {
    dependencies: { store, useRequireAuth: { useRequireAuth: () => () => true },
      supabaseClient: { errorText: e => e.message } },
  });
  return { h, actions, state };
}
test('actual reaction hook suppresses concurrent duplicate taps and adopts authoritative add/remove totals', async () => {
  const { h, actions, state } = setup(), add = deferred(), remove = deferred(); let calls = 0;
  h.services.toggleTakeReaction = () => (++calls === 1 ? add.promise : remove.promise);
  try {
    await h.mount(); const pending = h.tree({ id: 'take', reactions: 2 });
    await h.tree({ id: 'take', reactions: 2 }); assert.equal(calls, 1);
    add.resolve({ takeId: 'take', reacted: true, reactionsCount: 8 }); await pending;
    assert.deepEqual(actions.at(-1), { kind: 'sync', id: 'take', reacted: true, count: 8 });
    state.reacted = true; await h.update(); const next = h.tree({ id: 'take', reactions: 8 });
    remove.resolve({ takeId: 'take', reacted: false, reactionsCount: 7 }); await next;
    assert.equal(calls, 2); assert.deepEqual(actions.at(-1), { kind: 'sync', id: 'take', reacted: false, count: 7 });
  } finally { await h.unmount(); }
});
test('rejected reaction rolls back the captured baseline and is not automatically retried', async () => {
  const { h, actions } = setup(); let calls = 0;
  h.services.toggleTakeReaction = async () => { calls++; throw Error('not permitted'); };
  try {
    await h.mount(); await h.tree({ id: 'take', reactions: 2 });
    assert.equal(calls, 1);
    assert.deepEqual(actions.find(x => x.kind === 'sync'), { kind: 'sync', id: 'take', reacted: false, count: 2 });
    assert.equal(actions.at(-1).kind, 'notice');
  } finally { await h.unmount(); }
});
test('account change rejects the previous account reaction completion', async () => {
  const { h, actions } = setup(), response = deferred(); h.services.toggleTakeReaction = () => response.promise;
  try {
    await h.mount(); const pending = h.tree({ id: 'take', reactions: 2 });
    h.auth = { user: { id: 'other-account' }, signedIn: true, loading: false }; await h.update();
    const count = actions.length; response.resolve({ takeId: 'take', reacted: true, reactionsCount: 3 }); await pending;
    assert.equal(actions.length, count);
  } finally { await h.unmount(); }
});
