/**
 * Step 4C regression: a stale Follow action must never dispatch as another
 * account, and a session change during the RPC must still be rejected.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');

const compile = (file) => babel.transformSync(fs.readFileSync(file, 'utf8'), {
  filename: file, babelrc: false, configFile: false,
  presets: ['@babel/preset-typescript'],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;

function harness({ current = 'A', onRpc } = {}) {
  const calls = [];
  const state = { current };
  const module = { exports: {} };
  vm.runInNewContext(compile('services/clashFollowService.ts'), {
    module, exports: module.exports,
    require: (name) => {
      if (name === './supabaseClient') return {
        currentUserId: async () => state.current,
        requireSupabase: () => ({
          rpc: async (fn, args) => {
            calls.push([fn, args]);
            if (onRpc) onRpc((next) => { state.current = next; });
            return { data: true, error: null };
          },
        }),
        requestError: (error) => error,
      };
      throw Error(name);
    },
  });
  return { api: module.exports, calls, state };
}

test('a stale account never dispatches a follow RPC', async () => {
  const h = harness({ current: 'B' });
  await assert.rejects(() => h.api.setClashFollow('A', 'c1', true), /account_changed/);
  assert.equal(h.calls.length, 0, 'no RPC may escape for a stale account');
});

test('a session change during the RPC is rejected after the response', async () => {
  const h = harness({ current: 'A', onRpc: (set) => set('B') });
  await assert.rejects(() => h.api.setClashFollow('A', 'c1', true), /account_changed/);
  assert.equal(h.calls.length, 1, 'the RPC dispatched once before the change');
});

test('the expected account performs exactly one idempotent RPC each way', async () => {
  const h = harness({ current: 'A' });
  await h.api.setClashFollow('A', 'c1', true);
  await h.api.setClashFollow('A', 'c1', false);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0][0], 'follow_clash');
  assert.equal(h.calls[1][0], 'unfollow_clash');
  assert.equal(JSON.stringify(h.calls[0][1]), JSON.stringify({ p_clash_id: 'c1', p_expected_profile: 'A' }));
});
