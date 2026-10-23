const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const { SupabaseClient } = require('@supabase/supabase-js');

// Execute production service/parsers without loading native storage, credentials,
// Auth or a network client. Only the SDK's underlying transport is mocked.
function loadTs(file, dependencies = {}) {
  const filename = path.join(__dirname, '..', file);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    presets: ['@babel/preset-typescript'], plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  } }, { filename });
  return exports;
}
const parsers = loadTs('utils/arenaCrowd.ts');
const roomId = 'crowd-room';
const row = {
  id: '00000000-0000-0000-0000-000000000001', roomId, body: 'A considered response',
  createdAt: '2026-10-08T10:00:00.123456+00:00', isOwn: false,
  author: { id: 'fictional-spectator', name: 'Sam', handle: 'sam', avatarTint: '#aaaaaa' },
};
const context = { roomId, canSend: true, spectatorCount: 2,
  serverNow: '2026-10-08T10:00:00Z', closesAt: '2026-10-08T10:30:00Z' };

function harness(data) {
  const calls = [], mappedErrors = [];
  let response = { data, error: null }, transportError, configurationError;
  const rest = { async rpc(name, args, options) {
    assert.equal(this, rest, 'SDK must preserve its transport receiver');
    calls.push({ name, args, options });
    if (transportError) throw transportError;
    return response;
  } };
  const client = { rpc: SupabaseClient.prototype.rpc, rest };
  const service = loadTs('services/arenaCrowdService.ts', {
    './supabaseClient': {
      requireSupabase() { if (configurationError) throw configurationError; return client; },
      requestError(error) {
        mappedErrors.push(error);
        return Object.assign(new Error('Mapped request failure'), { code: error.code });
      },
      isSupabaseConfigured: true,
    },
    '../utils/arenaCrowd': parsers,
  });
  return { service, calls, mappedErrors,
    respond(value) { response = value; },
    reject(error) { transportError = error; },
    unconfigure(error) { configurationError = error; },
  };
}

const operations = [
  { name: 'context', rpc: 'get_arena_crowd', data: context,
    args: { p_room_id: roomId }, run: s => s.fetchCrowdContext(roomId),
    foreign: { ...context, roomId: 'other-room' } },
  { name: 'page', rpc: 'list_arena_crowd_messages', data: [row],
    args: { p_room_id: roomId, p_limit: 40, p_direction: 'older' },
    run: s => s.fetchCrowdPage(roomId), foreign: [{ ...row, roomId: 'other-room' }] },
  { name: 'IDs', rpc: 'get_arena_crowd_messages', data: [row],
    args: { p_room_id: roomId, p_ids: [row.id] },
    run: s => s.fetchCrowdIds(roomId, [row.id]), foreign: [{ ...row, roomId: 'other-room' }] },
  { name: 'post', rpc: 'post_arena_crowd_message', data: row,
    args: { p_room_id: roomId, p_body: row.body, p_request_key: 'stable-request-key' },
    run: s => s.postCrowd(roomId, row.body, 'stable-request-key'),
    foreign: { ...row, roomId: 'other-room' } },
];
const plain = value => JSON.parse(JSON.stringify(value));

for (const op of operations) {
  test(`${op.name}: actual installed SDK dispatch preserves receiver, arguments and parsed data`, async () => {
    const h = harness(op.data);
    assert.deepEqual(plain(await op.run(h.service)), op.data);
    assert.deepEqual(plain(h.calls), [{ name: op.rpc, args: op.args, options: { head: false, get: false } }]);
    assert.equal(h.mappedErrors.length, 0);
  });
  test(`${op.name}: server denial uses existing error mapping exactly once`, async () => {
    const h = harness(op.data);
    const error = { code: '42501', message: 'Denied', details: '', hint: '' };
    h.respond({ data: null, error });
    await assert.rejects(op.run(h.service), { message: 'Mapped request failure', code: '42501' });
    assert.deepEqual(h.mappedErrors, [error]);
    assert.equal(h.calls.length, 1);
  });
  test(`${op.name}: transport rejection propagates without retry`, async () => {
    const h = harness(op.data), error = new Error('Offline transport');
    h.reject(error);
    await assert.rejects(op.run(h.service), caught => caught === error);
    assert.equal(h.calls.length, 1);
    assert.equal(h.mappedErrors.length, 0);
  });
  test(`${op.name}: foreign-room payload remains rejected by production parser`, async () => {
    const h = harness(op.foreign);
    await assert.rejects(op.run(h.service), /Invalid Crowd/);
    assert.equal(h.calls.length, 1);
  });
  test(`${op.name}: missing client fails before dispatch`, async () => {
    const h = harness(op.data), error = new Error('Not configured');
    h.unconfigure(error);
    await assert.rejects(op.run(h.service), caught => caught === error);
    assert.equal(h.calls.length, 0);
  });
}

for (const direction of ['older', 'newer']) {
  test(`page: ${direction} pagination preserves the full timestamp and ID cursor`, async () => {
    const h = harness([]);
    assert.deepEqual(plain(await h.service.fetchCrowdPage(roomId, row, direction)), []);
    assert.deepEqual(plain(h.calls[0].args), { p_room_id: roomId, p_limit: 40,
      p_direction: direction, p_cursor_at: row.createdAt, p_cursor_id: row.id });
    assert.equal(h.calls.length, 1);
  });
}
test('IDs: retrieval remains capped at 100 without mutating input', async () => {
  const h = harness([]), ids = Object.freeze(Array.from({ length: 101 }, (_, i) => `id-${i}`));
  await h.service.fetchCrowdIds(roomId, ids);
  assert.deepEqual(plain(h.calls[0].args.p_ids), ids.slice(0, 100));
  assert.equal(ids.length, 101);
  assert.equal(h.calls.length, 1);
});
