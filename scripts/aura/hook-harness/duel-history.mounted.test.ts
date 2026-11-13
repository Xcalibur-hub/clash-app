/*
 * Mounted-hook regression tests for duel history admission.
 *
 * These mount the *real* `useLiveArenaRoom` with react-test-renderer, so the
 * hook's effects, its call-time guard and its RPC/refresh sequence execute. The
 * defect this covers: a settled canonical duel advertised "Watch Clash", the
 * SQL permitted settled watching, and the frontend refused SETTLED before the
 * RPC — so the advertised action could never succeed.
 *
 * Run with: node scripts/aura/hook-harness/build.cjs
 */
import assert from 'node:assert';
import { mountRoom, fakes } from './harness.cjs';
import { admissionFor } from '../../../utils/arenaAdmission';

const results: string[] = [];
let failures = 0;

async function test(name: string, fn: () => Promise<void>) {
  fakes.reset();
  try {
    await fn();
    results.push(`ok - ${name}`);
  } catch (err) {
    failures += 1;
    results.push(`not ok - ${name}\n    ${String((err as Error).stack || (err as Error).message).split('\n').slice(0, 6).join('\n    ')}`);
  }
}

/** A canonical duel room in a given phase. */
function duelRoom(status: string) {
  return {
    roomId: 'room-duel',
    status,
    phase: status,
    topic: { status: status === 'CANCELLED' ? 'CANCELLED' : 'SETTLED', kind: 'duel' },
    duel: {
      clashId: 'clash-1',
      status: status.toLowerCase(),
      sideAId: 'a',
      sideBId: 'b',
      title: 'Trade vs Aid',
      topic: 'Trade vs Aid',
      sideALabel: 'Trade',
      sideBLabel: 'Aid',
      a: { id: 'a', name: 'A', rank: 'Brawler' },
      b: { id: 'b', name: 'B', rank: 'Brawler' },
      scoreA: 2,
      scoreB: 1,
      winner: 'A',
    },
    viewer: null,
    participants: [],
  };
}

/** A group room in a given phase. */
function groupRoom(status: string) {
  return {
    roomId: 'room-group',
    status,
    phase: status,
    topic: { status: status === 'CANCELLED' ? 'CANCELLED' : 'OPEN', kind: 'group' },
    duel: null,
    viewer: null,
    participants: [],
  };
}

const RPC = 'watchRoom';

async function main() {
/* ------------------------------------------------------------------------- */
/* 1. The regression: a settled duel must actually reach the RPC. */
/* ------------------------------------------------------------------------- */
  await test('SETTLED DUEL: calling watch as history reaches watch_arena_room', async () => {
  fakes.state.room = duelRoom('SETTLED');
  const h = await mountRoom('room-duel');

  assert.equal(h.current.watchFailed, false);
  const okResult = await h.call('watchAsSpectator', { historyView: true });

  assert.equal(okResult, true, 'admission reported failure for a settled duel');
  assert.equal(fakes.watchCalls().length, 1, 'watch_arena_room was not called');
  assert.equal(h.current.watchFailed, false, 'watchFailed was set on success');

  await h.unmount();
});

/* ------------------------------------------------------------------------- */
/* 2. CANCELLED must stay refused, with zero RPC calls. */
/* ------------------------------------------------------------------------- */
  await test('CANCELLED DUEL: refused before the RPC, zero watch calls', async () => {
  fakes.state.room = duelRoom('CANCELLED');
  const h = await mountRoom('room-duel');

  const okResult = await h.call('watchAsSpectator', { historyView: true });

  assert.equal(okResult, false, 'a cancelled room was admitted');
  assert.equal(fakes.watchCalls().length, 0, 'the RPC was called for a cancelled room');
  assert.equal(h.current.watchFailed, true, 'no failure state was reported');
  /*
   * Assert the notice is the model's reason verbatim. A hand-written regex over
   * the copy drifts the moment the wording changes, and it cannot tell an
   * accurate notice from a stale one for a different blocked state.
   */
  const expected = admissionFor('CANCELLED', { kind: 'non_member' } as any, {
    historyView: true,
  }).reason;
  assert.ok(expected, 'the model gave no reason to show for a cancelled room');
  assert.deepEqual(
    fakes.notices.map((n: any) => n.message),
    [expected],
    'the viewer was not told the true reason',
  );

  await h.unmount();
});

/* ------------------------------------------------------------------------- */
/* 3. Live rooms keep working for both shapes. */
/* ------------------------------------------------------------------------- */
  await test('LIVE DUEL: watch succeeds and the transcript loads', async () => {
  fakes.state.room = duelRoom('OPEN');
  const h = await mountRoom('room-duel');

  const okResult = await h.call('watchAsSpectator', { historyView: true });

  assert.equal(okResult, true);
  assert.equal(fakes.watchCalls().length, 1);
  // Transcript load is part of admission: the RPC alone is not a watch.
  assert.ok(
    fakes.callNames().includes('fetchOfficialPage'),
    'the transcript was never loaded after admission',
  );

  await h.unmount();
});

  await test('LIVE GROUP: watch succeeds and the transcript loads', async () => {
  fakes.state.room = groupRoom('OPEN');
  const h = await mountRoom('room-group');

  const okResult = await h.call('watchAsSpectator', {});

  assert.equal(okResult, true);
  assert.equal(fakes.watchCalls().length, 1);
  assert.ok(fakes.callNames().includes('fetchOfficialPage'));

  await h.unmount();
});

/* ------------------------------------------------------------------------- */
/* 4. Settled GROUP behaviour is preserved — this fix must not touch it. */
/* ------------------------------------------------------------------------- */
  await test('SETTLED GROUP: still refused, still makes no watch call', async () => {
  fakes.state.room = groupRoom('SETTLED');
  const h = await mountRoom('room-group');

  const okResult = await h.call('watchAsSpectator', {});

  assert.equal(okResult, false, 'a settled group room was admitted');
  assert.equal(fakes.watchCalls().length, 0, 'the RPC was called for a settled group room');
  assert.equal(h.current.watchFailed, true);

  await h.unmount();
});

/* ------------------------------------------------------------------------- */
/* 5. Failure is accurate and retryable. */
/* ------------------------------------------------------------------------- */
  await test('FAILED WATCH: reports the error and a retry succeeds', async () => {
  fakes.state.room = duelRoom('SETTLED');
  const h = await mountRoom('room-duel');

  const err: any = new Error('network unreachable');
  err.code = 'NETWORK';
  fakes.state.watchError = err;

  assert.equal(await h.call('watchAsSpectator', { historyView: true }), false);
  assert.equal(h.current.watchFailed, true, 'the failure was not surfaced');
  assert.equal(fakes.watchCalls().length, 1);

  // Retry: same handle, cleared error. Admission must be repeatable.
  fakes.state.watchError = null;
  assert.equal(await h.call('watchAsSpectator', { historyView: true }), true);
  assert.equal(fakes.watchCalls().length, 2, 'the retry did not reach the RPC');
  assert.equal(h.current.watchFailed, false, 'a successful retry left the error set');

  await h.unmount();
});

/* ------------------------------------------------------------------------- */
/* 6. No duplicate admission controls. */
/* ------------------------------------------------------------------------- */
  await test('admission surface: one watch path, no duplicate controls', async () => {
  fakes.state.room = duelRoom('SETTLED');
  const h = await mountRoom('room-duel');

  await h.call('watchAsSpectator', { historyView: true });

  // A second admission must not be a second code path: the same controller
  // method is the only way in, so one call means one RPC.
  assert.equal(fakes.watchCalls().length, 1);
  assert.equal(
    fakes.callNames().filter((n: string) => n === RPC).length,
    1,
    'a single admission issued more than one watch RPC',
  );

  await h.unmount();
});

/* ------------------------------------------------------------------------- */
  for (const line of results) console.log(line);
  console.log(`\n# pass ${results.length - failures}`);
  console.log(`# fail ${failures}`);
  process.exit(failures === 0 ? 0 : 1);

}

void main();
