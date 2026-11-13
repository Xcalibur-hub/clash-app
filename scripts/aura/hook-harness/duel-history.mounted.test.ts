import assert from 'node:assert/strict';
import { mountRoom, fakes } from './harness.cjs';
import { admissionFor } from '../../../utils/arenaAdmission';
import { room, message } from './fixtures';
import type { ArenaRoomStatus } from '../../../services/liveArenaService';

const results: string[] = [];
let failures = 0;
async function scenario(name: string, mode: 'DUEL' | 'GROUP', status: ArenaRoomStatus,
  run: (h: Awaited<ReturnType<typeof mountRoom>>) => Promise<void>) {
  fakes.reset();
  fakes.state.room = room(mode, status);
  fakes.state.messages = [message];
  const h = await mountRoom('room-1');
  try {
    assert.equal(h.current.room.viewer, null);
    assert.equal(h.current.threadLocked, true, 'non-member transcript must start locked');
    assert.deepEqual(h.current.messages, []);
    assert.equal(h.current.error, null);
    await run(h);
    results.push('ok - ' + name);
  } catch (err) {
    failures++;
    results.push('not ok - ' + name + '\n' + String(err));
  } finally { await h.unmount(); }
}
function recovered(h: Awaited<ReturnType<typeof mountRoom>>, before: number) {
  assert.equal(h.current.room.viewer?.isMember, true);
  assert.equal(h.current.room.viewer?.role, 'spectator');
  const reads = fakes.state.calls.slice(before).filter((c: { name: string }) => c.name === 'fetchOfficialPage');
  assert.ok(reads.length > 0, 'POST_WATCH_RECOVERY: no post-admission transcript read');
  assert.ok(reads.every((c: { admitted: boolean }) => c.admitted));
  assert.equal(reads[0].args.cursor, undefined, 'locked initial load must recover without a cursor');
  assert.equal(h.current.threadLocked, false, 'POST_WATCH_RECOVERY: transcript remains locked');
  assert.deepEqual(h.current.messages.map((m: { id: string; body: string }) => [m.id, m.body]), [[message.id, message.body]]);
  assert.equal(h.current.error, null, 'transcript-loading error');
  assert.equal(h.current.watchFailed, false);
}
async function main() {
  for (const [mode, status] of [['DUEL', 'SETTLED'], ['DUEL', 'OPEN'], ['GROUP', 'OPEN']] as const) {
    await scenario(status + ' ' + mode + ': locked null-cursor transcript recovers after Watch', mode, status, async h => {
      const before = fakes.state.calls.length;
      assert.ok(fakes.state.calls.some((c: { name: string; admitted: boolean }) => c.name === 'fetchOfficialPage' && !c.admitted));
      assert.equal(await h.call('watchAsSpectator', { historyView: mode === 'DUEL' }), true);
      assert.equal(fakes.watchCalls().length, 1);
      recovered(h, before);
    });
  }
  for (const [mode, status] of [['DUEL', 'CANCELLED'], ['GROUP', 'SETTLED']] as const) {
    await scenario(status + ' ' + mode + ': rejected without RPC', mode, status, async h => {
      const intent = { historyView: mode === 'DUEL' };
      assert.equal(await h.call('watchAsSpectator', intent), false);
      assert.equal(fakes.watchCalls().length, 0);
      assert.equal(h.current.watchFailed, true);
      assert.equal(h.current.room.viewer, null);
      assert.equal(h.current.threadLocked, true);
      assert.deepEqual(fakes.notices.map((n: { message: string }) => n.message),
        [admissionFor(status, { kind: 'non_member' }, intent).reason]);
    });
  }
  await scenario('FAILED WATCH: accurate failure then recovered retry', 'DUEL', 'SETTLED', async h => {
    fakes.state.watchError = new Error('network unreachable');
    assert.equal(await h.call('watchAsSpectator', { historyView: true }), false);
    assert.equal(h.current.watchFailed, true);
    assert.equal(h.current.room.viewer, null);
    assert.equal(h.current.threadLocked, true);
    assert.deepEqual(fakes.notices.map((n: { message: string }) => n.message), ['That action could not be completed. Please try again.']);
    fakes.state.watchError = null;
    const before = fakes.state.calls.length;
    assert.equal(await h.call('watchAsSpectator', { historyView: true }), true);
    assert.equal(fakes.watchCalls().length, 2);
    recovered(h, before);
  });
  await scenario('existing spectator: second invocation makes no new Watch RPC', 'DUEL', 'SETTLED', async h => {
    const before = fakes.state.calls.length;
    assert.equal(await h.call('watchAsSpectator', { historyView: true }), true);
    recovered(h, before);
    assert.equal(await h.call('watchAsSpectator', { historyView: true }), false);
    assert.equal(fakes.watchCalls().length, 1);
  });
  console.log(results.join('\n'));
  console.log('# pass ' + (results.length - failures) + '\n# fail ' + failures);
  process.exit(failures ? 1 : 0);
}
void main().catch(err => { console.error(err); process.exit(2); });
