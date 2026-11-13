/*
 * Mounted-hook regression tests for duel history admission.
 *
 * These mount the *real* `useLiveArenaRoom` with react-test-renderer, so the
 * hook's effects, its call-time guard and its RPC/refresh sequence execute. The
 * defect covered: a settled canonical duel advertised "Watch Clash", the server
 * permitted settled watching, and the frontend refused SETTLED before the RPC —
 * so the advertised action could never succeed.
 *
 * The fake server in `fakes.cjs` follows the SQL contract, which is what makes
 * these assertions mean anything:
 *
 *   · a non-member's message read raises 42501, so the thread really is locked
 *     and really is empty before admission;
 *   · `watch_arena_room` really inserts a spectator row, so `viewer` really
 *     changes from null to spectator;
 *   · pages are arrays of timestamped rows, so an object-shaped response throws
 *     inside `load` instead of quietly passing.
 *
 * Every test asserts pre-admission state first. That is what distinguishes a
 * *post-admission* read from the read the screen already did on mount: the mount
 * read is refused and publishes nothing, so rows can only appear afterwards.
 *
 * Run with: node scripts/aura/hook-harness/build.cjs
 * Mutation check: node scripts/aura/hook-harness/negative-control.cjs
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
    results.push(
      `not ok - ${name}\n    ${String((err as Error).stack || (err as Error).message)
        .split('\n')
        .slice(0, 8)
        .join('\n    ')}`,
    );
  }
}

/** Newest-first ids, which is the order the controller promises. */
function ids(messages: any[]): string[] {
  return messages.map((message) => message.id);
}

/** The reason the admission model gives for a phase — never a hand-written copy. */
function modelReason(phase: string, intent: any = {}): string {
  const decision = admissionFor(phase as any, { kind: 'non_member' } as any, intent);
  assert.ok(decision.reason, `the model gave no reason for ${phase}`);
  return decision.reason as string;
}

async function main() {
  /* ----------------------------------------------------------------------- */
  /* 1. The regression, end to end.                                          */
  /* ----------------------------------------------------------------------- */
  await test('SETTLED DUEL: Watch admits, standing becomes spectator, locked transcript unlocks', async () => {
    fakes.server.seedRoom({ roomId: 'room-duel', roomMode: 'DUEL', status: 'SETTLED' });
    const seeded = fakes.server.seedMessages('room-duel', 3, 'settled argument');
    fakes.server.seedEvidence('room-duel', 1);

    const h = await mountRoom('room-duel');
    const before = h.snapshot();

    /* Pre-admission: the room is readable, the thread is not. */
    assert.equal(before.room.status, 'SETTLED', 'the fixture is not a settled room');
    assert.equal(before.room.viewer, null, 'the viewer is a member before admission');
    assert.equal(before.threadLocked, true, 'the locked state was never reached');
    assert.deepEqual(before.messages, [], 'the thread published rows to a non-member');
    assert.deepEqual(before.evidence, [], 'the rail published rows to a non-member');
    assert.equal(before.error, null, 'mounting produced a transcript error');

    /*
     * The mount read must be a refusal, and it must be *before* the RPC. This is
     * the assertion the old suite lacked: it counted the mount read as proof of
     * a post-admission load.
     */
    const mountReads = fakes.pageReads('message');
    assert.ok(mountReads.length >= 1, 'the mount never attempted a message read');
    assert.ok(
      mountReads.every((read: any) => read.admitted === false && read.code === '42501'),
      'the mount read was not refused, so the lock is not being modelled',
    );
    const readsBefore = fakes.reads.length;

    const okResult = await h.call('watchAsSpectator', { historyView: true });

    const after = h.snapshot();
    const watch = fakes.watchCalls();
    assert.equal(okResult, true, 'admission reported failure for a settled duel');
    assert.equal(watch.length, 1, 'watch_arena_room was not called exactly once');
    assert.deepEqual(watch[0].args, { roomId: 'room-duel' }, 'the RPC carried more than the room');

    /* Standing: this is the membership transition, not a local flag. */
    assert.equal(fakes.server.isMember('room-duel'), true, 'the server has no membership row');
    assert.notEqual(after.room.viewer, null, 'the viewer is still a non-member');
    assert.equal(after.room.viewer.isMember, true);
    assert.equal(after.room.viewer.role, 'spectator', 'the viewer was not admitted as a spectator');
    assert.equal(after.room.viewer.stance, null, 'watching recorded a stance');

    /* Unlocked, with the settled transcript and no error. */
    assert.equal(after.threadLocked, false, 'the transcript is still locked after admission');
    assert.equal(after.error, null, 'admission left a transcript error');
    assert.equal(after.watchFailed, false, 'watchFailed was set on success');

    const expected = [...seeded].reverse();
    assert.equal(after.messages.length, 3, 'the settled transcript did not arrive');
    assert.deepEqual(ids(after.messages), expected.map((row) => row.id), 'rows are not newest-first');
    assert.deepEqual(
      after.messages.map((row) => row.body),
      ['settled argument 3', 'settled argument 2', 'settled argument 1'],
      'the published rows are not the seeded arguments',
    );
    assert.ok(
      after.messages.every((row) => typeof row.preciseCreatedAt === 'string' && row.roomId === 'room-duel'),
      'rows are missing the fields the service validates',
    );
    assert.equal(after.evidence.length, 1, 'the evidence rail did not load');

    /* The transcript came from a read that happened after the RPC. */
    const watchSeq = watch[0].seq;
    assert.ok(
      mountReads.every((read: any) => read.seq < watchSeq),
      'a mount read was counted as post-admission',
    );
    const postReads = fakes.reads.slice(readsBefore);
    assert.ok(postReads.length >= 1, 'no read happened after admission');
    assert.ok(
      postReads.every((read: any) => read.seq > watchSeq),
      'a read recorded after the boundary predates the RPC',
    );
    assert.ok(
      postReads.every((read: any) => read.admitted === true),
      'a read was still refused after admission',
    );
    assert.ok(
      postReads.some(
        (read: any) => read.stream === 'message' && read.direction === 'older' && read.rows === 3,
      ),
      'no post-admission read returned the settled transcript',
    );

    await h.unmount();
  });

  /* ----------------------------------------------------------------------- */
  /* 2. CANCELLED stays refused, before the RPC, with nothing read.          */
  /* ----------------------------------------------------------------------- */
  await test('CANCELLED DUEL: refused before the RPC, zero calls, no membership', async () => {
    fakes.server.seedRoom({ roomId: 'room-duel', roomMode: 'DUEL', status: 'CANCELLED' });
    fakes.server.seedMessages('room-duel', 3, 'cancelled argument');

    const h = await mountRoom('room-duel');
    const before = h.snapshot();
    assert.equal(before.threadLocked, true, 'the cancelled room did not start locked');
    const readsBefore = fakes.reads.length;

    const okResult = await h.call('watchAsSpectator', { historyView: true });
    const after = h.snapshot();

    assert.equal(okResult, false, 'a cancelled room was admitted');
    assert.equal(fakes.watchCalls().length, 0, 'the RPC was called for a cancelled room');
    assert.equal(after.watchFailed, true, 'no failure state was reported');
    assert.equal(fakes.server.isMember('room-duel'), false, 'a membership was created anyway');
    assert.equal(after.threadLocked, true, 'the transcript unlocked for a cancelled room');
    assert.deepEqual(after.messages, [], 'rows were published for a cancelled room');
    assert.equal(
      fakes.reads.length,
      readsBefore,
      'a cancelled refusal still touched the transcript',
    );
    assert.deepEqual(
      fakes.notices.map((notice: any) => notice.message),
      [modelReason('CANCELLED', { historyView: true })],
      'the viewer was not told the true reason',
    );

    await h.unmount();
  });

  /* ----------------------------------------------------------------------- */
  /* 3-4. Live rooms keep working for both shapes.                           */
  /* ----------------------------------------------------------------------- */
  await test('LIVE DUEL: Watch succeeds and the transcript loads after admission', async () => {
    fakes.server.seedRoom({ roomId: 'room-duel', roomMode: 'DUEL', status: 'OPEN' });
    const seeded = fakes.server.seedMessages('room-duel', 2, 'live argument');
    fakes.server.seedEvidence('room-duel', 1);

    const h = await mountRoom('room-duel');
    const before = h.snapshot();
    assert.equal(before.threadLocked, true, 'the live thread did not start locked');
    assert.deepEqual(before.messages, [], 'the live thread published to a non-member');

    const okResult = await h.call('watchAsSpectator', { historyView: true });
    const after = h.snapshot();

    assert.equal(okResult, true, 'a live duel refused admission');
    assert.equal(fakes.watchCalls().length, 1);
    assert.equal(after.room.viewer.role, 'spectator');
    assert.equal(after.threadLocked, false);
    assert.equal(after.error, null);
    assert.deepEqual(ids(after.messages), [...seeded].reverse().map((row) => row.id));
    assert.equal(after.evidence.length, 1);

    await h.unmount();
  });

  await test('LIVE GROUP: Watch succeeds and the transcript loads after admission', async () => {
    fakes.server.seedRoom({ roomId: 'room-group', roomMode: 'GROUP', status: 'OPEN' });
    const seeded = fakes.server.seedMessages('room-group', 2, 'group message');
    fakes.server.seedEvidence('room-group', 1);

    const h = await mountRoom('room-group');
    assert.deepEqual(h.snapshot().messages, [], 'the group thread published to a non-member');

    const okResult = await h.call('watchAsSpectator', {});
    const after = h.snapshot();

    assert.equal(okResult, true, 'a live group room refused admission');
    assert.equal(fakes.watchCalls().length, 1);
    assert.equal(after.room.viewer.role, 'spectator');
    assert.equal(after.threadLocked, false);
    assert.equal(after.error, null);
    assert.deepEqual(ids(after.messages), [...seeded].reverse().map((row) => row.id));
    /* A group room reads its rail through `fetchEvidence`, not the evidence page. */
    assert.equal(after.evidence.length, 1, 'the group rail did not load');
    const watchSeq = fakes.watchCalls()[0].seq;
    const rail = fakes.callsNamed('fetchEvidence');
    assert.ok(rail.length >= 1, 'the group rail was never read');
    /*
     * The mount reads the rail too — and is refused. What matters is that a read
     * happened *after* the RPC: the mount's rows never published, so the single
     * row on screen can only have come from the post-admission read.
     */
    assert.ok(
      rail.some((call: any) => call.seq > watchSeq),
      'the group rail was never re-read after admission',
    );

    await h.unmount();
  });

  /* ----------------------------------------------------------------------- */
  /* 5. Settled GROUP behaviour is preserved.                                */
  /* ----------------------------------------------------------------------- */
  await test('SETTLED GROUP: still refused by the client, zero RPC calls', async () => {
    fakes.server.seedRoom({ roomId: 'room-group', roomMode: 'GROUP', status: 'SETTLED' });
    fakes.server.seedMessages('room-group', 2, 'settled group message');

    const h = await mountRoom('room-group');
    const okResult = await h.call('watchAsSpectator', {});
    const after = h.snapshot();

    assert.equal(okResult, false, 'a settled group room was admitted');
    assert.equal(fakes.watchCalls().length, 0, 'the RPC was called for a settled group room');
    assert.equal(fakes.server.isMember('room-group'), false, 'a membership was created');
    assert.equal(after.threadLocked, true, 'a settled group room unlocked its thread');
    assert.deepEqual(after.messages, [], 'a settled group room published rows');
    assert.deepEqual(
      fakes.notices.map((notice: any) => notice.message),
      [modelReason('SETTLED')],
      'the viewer was not told the true reason',
    );

    /*
     * And the refusal is the *client's*: the same boundary called directly
     * admits a settled room, exactly as `watch_arena_room` does. Without this,
     * the test would only prove the fake refuses.
     */
    const admitted = await fakes.watchRoom('room-group');
    assert.equal(admitted.role, 'spectator', 'the fake does not model settled watching');

    await h.unmount();
  });

  /* ----------------------------------------------------------------------- */
  /* 6-7. Failure is accurate, and retryable.                                */
  /* ----------------------------------------------------------------------- */
  await test('FAILED WATCH: the notice carries the real error and a retry admits', async () => {
    fakes.server.seedRoom({ roomId: 'room-group', roomMode: 'GROUP', status: 'OPEN' });
    fakes.server.seedMessages('room-group', 1, 'group message');
    const h = await mountRoom('room-group');

    const failure = new (fakes.SupabaseError as any)('network unreachable', 'NETWORK');
    fakes.server.failWatch(failure);

    assert.equal(await h.call('watchAsSpectator', {}), false, 'a failed RPC reported success');
    const failed = h.snapshot();
    assert.equal(failed.watchFailed, true, 'the failure was not surfaced');
    assert.equal(fakes.server.isMember('room-group'), false, 'a failed watch still admitted');
    assert.deepEqual(failed.messages, [], 'a failed watch published a transcript');
    assert.equal(failed.threadLocked, true, 'a failed watch unlocked the thread');
    assert.deepEqual(
      fakes.notices.map((notice: any) => notice.message),
      ['network unreachable'],
      'the notice did not carry the error the viewer needs',
    );

    fakes.server.failWatch(null);
    assert.equal(await h.call('watchAsSpectator', {}), true, 'the retry did not admit');
    const retried = h.snapshot();
    assert.equal(fakes.watchCalls().length, 2, 'the retry did not reach the RPC');
    assert.equal(retried.watchFailed, false, 'a successful retry left the error set');
    assert.equal(retried.threadLocked, false, 'the retry did not unlock the thread');
    assert.equal(retried.messages.length, 1, 'the retry did not load the transcript');
    assert.equal(retried.error, null);

    await h.unmount();
  });

  await test('FAILED WATCH on a settled duel: retryable, no half-admission', async () => {
    fakes.server.seedRoom({ roomId: 'room-duel', roomMode: 'DUEL', status: 'SETTLED' });
    fakes.server.seedMessages('room-duel', 2, 'settled argument');
    const h = await mountRoom('room-duel');

    fakes.server.failWatch(new (fakes.SupabaseError as any)('network unreachable', 'NETWORK'));
    assert.equal(await h.call('watchAsSpectator', { historyView: true }), false);
    const failed = h.snapshot();
    assert.equal(failed.watchFailed, true);
    assert.equal(fakes.server.isMember('room-duel'), false, 'a failed watch still admitted');
    assert.equal(failed.threadLocked, true);
    assert.equal(fakes.notices.length, 1, 'a failed admission said nothing to the viewer');

    fakes.server.failWatch(null);
    assert.equal(await h.call('watchAsSpectator', { historyView: true }), true);
    const retried = h.snapshot();
    assert.equal(retried.watchFailed, false);
    assert.equal(retried.threadLocked, false);
    assert.equal(retried.messages.length, 2);
    assert.equal(retried.error, null);

    await h.unmount();
  });

  /* ----------------------------------------------------------------------- */
  /* 8. The null initial cursor is recovered from the settled page.          */
  /* ----------------------------------------------------------------------- */
  await test('NULL CURSOR: admission bootstraps the cursor, so later rows arrive', async () => {
    fakes.server.seedRoom({ roomId: 'room-duel', roomMode: 'DUEL', status: 'SETTLED' });
    const seeded = fakes.server.seedMessages('room-duel', 2, 'settled argument');
    const newestAtAdmission = seeded[seeded.length - 1];

    const h = await mountRoom('room-duel');
    assert.equal(h.snapshot().threadLocked, true, 'the thread was readable before admission');
    /* The refused mount read left the hook with no cursor at all. */
    await h.call('watchAsSpectator', { historyView: true });
    assert.equal(h.snapshot().messages.length, 2, 'admission did not publish the settled page');

    const late = fakes.server.appendMessage('room-duel', 'a late argument');
    await h.call('refresh');
    const after = h.snapshot();

    assert.equal(after.messages.length, 3, 'the row written after admission never arrived');
    assert.equal(after.messages[0].id, late.id, 'the late row is not the newest row');
    assert.equal(after.error, null);

    /*
     * The gap drain resumed from the newest row of the settled page. If the
     * cursor had been left null the drain would not have run; if it had been the
     * epoch sentinel the evidence below would show 1970.
     */
    const newer = fakes.pageReads('message').filter((read: any) => read.direction === 'newer');
    assert.ok(newer.length >= 1, 'the gap drain never ran after admission');
    const last = newer[newer.length - 1];
    assert.ok(last.admitted, 'the gap drain was refused');
    assert.equal(last.cursor.preciseCreatedAt, newestAtAdmission.preciseCreatedAt, 'wrong cursor');
    assert.equal(last.cursor.id, newestAtAdmission.id, 'wrong cursor id');
    assert.notEqual(last.cursor.preciseCreatedAt, '1970-01-01T00:00:00.000000Z', 'epoch sentinel');
    assert.equal(last.rows, 1, 'the gap drain did not see exactly the new row');

    await h.unmount();
  });

  /* ----------------------------------------------------------------------- */
  /* 9. Pagination is an array of rows, newest first, paged by cursor.       */
  /* ----------------------------------------------------------------------- */
  await test('PAGINATION: 45 rows page 40 + 5 without duplicates', async () => {
    fakes.server.seedRoom({ roomId: 'room-duel', roomMode: 'DUEL', status: 'SETTLED' });
    const seeded = fakes.server.seedMessages('room-duel', 45, 'argument');

    const h = await mountRoom('room-duel');
    await h.call('watchAsSpectator', { historyView: true });
    const first = h.snapshot();

    assert.equal(first.messages.length, 40, 'the first page is not the service page size');
    assert.equal(first.hasOlder, true, 'the hook did not report an older page');
    assert.equal(first.error, null);

    await h.call('loadOlder');
    const second = h.snapshot();

    assert.equal(second.messages.length, 45, 'the older page did not complete the thread');
    assert.equal(new Set(ids(second.messages)).size, 45, 'paging duplicated a row');
    assert.equal(second.hasOlder, false, 'the hook still claims an older page');
    assert.equal(second.error, null);
    assert.deepEqual(
      ids(second.messages),
      [...seeded].reverse().map((row) => row.id),
      'the merged transcript is not the full thread, newest first',
    );

    const watchSeq = fakes.watchCalls()[0].seq;
    assert.ok(
      fakes.reads.filter((read: any) => read.seq > watchSeq).every((read: any) => read.admitted),
      'a post-admission page read was refused',
    );

    await h.unmount();
  });

  /* ----------------------------------------------------------------------- */
  /* 10. One admission path; a member is refused without a second RPC.       */
  /* ----------------------------------------------------------------------- */
  await test('ADMISSION SURFACE: one watch path, already-member refused without a second RPC', async () => {
    fakes.server.seedRoom({ roomId: 'room-duel', roomMode: 'DUEL', status: 'SETTLED' });
    fakes.server.seedMessages('room-duel', 1, 'settled argument');

    const h = await mountRoom('room-duel');
    assert.equal(await h.call('watchAsSpectator', { historyView: true }), true);
    const admitted = h.snapshot();
    assert.equal(admitted.messages.length, 1);

    const second = await h.call('watchAsSpectator', { historyView: true });
    const after = h.snapshot();

    assert.equal(second, false, 'a member was admitted twice');
    assert.equal(fakes.watchCalls().length, 1, 'a second admission issued a second RPC');
    assert.equal(after.watchFailed, true, 'the redundant admission was not reported');
    assert.equal(after.messages.length, 1, 'the redundant admission cleared the transcript');
    assert.equal(fakes.notices.length, 1, 'the redundant admission said nothing');

    /* No second entry point hides on the controller. */
    for (const name of ['joinRoom', 'watchRoom', 'watch', 'join', 'becomeSpectator']) {
      assert.equal(
        typeof (h.current as any)[name],
        'undefined',
        `the controller exposes a second admission path: ${name}`,
      );
    }

    await h.unmount();
  });

  /* ----------------------------------------------------------------------- */
  for (const line of results) console.log(line);
  console.log(`\n# pass ${results.length - failures}`);
  console.log(`# fail ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
