/**
 * Step 6G.5B.1 / 6G.5B.1A — session-safe authoritative reaction-state read.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createReactionQueue,
  type AuthoritativeReactionReadOutcome,
} from './reactionOptimism.ts';
import { createReactionSnapshots } from './reactionSnapshots.ts';
import {
  createVisibilityBarrier,
  isLiveRoomSession,
  type RoomSession,
} from './transcriptOrdering.ts';
import { createMergeReactionPublisher } from './roomReactionBridge.ts';
import type { ArenaReaction } from '../services/liveArenaService.ts';

type Row = { id: string; body: string; reactions: ArenaReaction[] };

const fire = (count: number, reacted = false): ArenaReaction[] => [
  { emoji: 'fire', count, viewerReacted: reacted },
];

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(opts?: { fault?: 'no-session' | 'no-membership' | 'no-commit' | 'no-snapshot' | 'no-covers' }) {
  const fault = opts?.fault;
  let rows: Row[] = [{ id: 'm1', body: 'a', reactions: fire(0) }];
  let meta = { hasOlder: true, roomTag: 'A', obligation: 1 };
  const writes: { id: string; reactions: ArenaReaction[] | null }[] = [];
  const snapshots = createReactionSnapshots();
  const visibility = createVisibilityBarrier();
  visibility.admit([{ id: 'm1' }], visibility.epoch());
  let live: RoomSession = { roomId: 'A', generation: 1 };
  const mounted = { current: true };
  const server = new Map<string, ArenaReaction[]>([['m1', fire(3, true)]]);
  const gates = new Map<string, ReturnType<typeof deferred<readonly ArenaReaction[] | null>>>();

  const isLiveSession = (session: RoomSession): boolean => {
    if (fault === 'no-session') return true;
    return isLiveRoomSession(mounted.current, session, live);
  };
  const isLoaded = (id: string): boolean => {
    if (fault === 'no-membership') return true;
    return rows.some((row) => row.id === id);
  };

  const applyWrite = (id: string, reactions: ArenaReaction[] | null): void => {
    writes.push({ id, reactions: reactions ? reactions.map((r) => ({ ...r })) : null });
    if (reactions === null) {
      rows = rows.filter((row) => row.id !== id);
      return;
    }
    if (!rows.some((row) => row.id === id)) {
      if (fault === 'no-membership') rows = [...rows, { id, body: 'resurrected', reactions }];
      return;
    }
    rows = rows.map((row) => (row.id === id ? { ...row, reactions } : row));
  };

  const mergePublish = createMergeReactionPublisher({
    snapshots,
    update: (fn) => { rows = fn(rows); },
  });

  const applyRead = (messageId: string, next: ArenaReaction[] | null, snapshot: number): boolean => {
    if (fault === 'no-snapshot' || fault === 'no-membership') {
      applyWrite(messageId, next);
      return true;
    }
    const accepted = mergePublish(messageId, next, snapshot);
    if (accepted) {
      writes.push({ id: messageId, reactions: next ? next.map((r) => ({ ...r })) : null });
    }
    return accepted;
  };

  const queue = createReactionQueue({
    read: async (id) => {
      const gate = gates.get(id);
      if (gate) return gate.promise;
      if (!server.has(id)) return null;
      return server.get(id)!;
    },
    toggle: async (id, emoji) => {
      const prior = server.get(id)?.find((r) => r.emoji === emoji);
      const reacted = !prior?.viewerReacted;
      const count = reacted ? (prior?.count ?? 0) + 1 : Math.max(0, (prior?.count ?? 1) - 1);
      server.set(id, fire(count, reacted));
      return { messageId: id, emoji, reacted, count };
    },
    write: applyWrite,
    onError: () => {},
    onCommitted: (id) => snapshots.markAuthoritativeReactionWrite(id),
  });

  const rawApply = async (session: RoomSession, messageId: string): Promise<AuthoritativeReactionReadOutcome> => {
    const gate = gates.get(messageId);
    const rowsRead = gate ? await gate.promise : server.get(messageId) ?? null;
    applyWrite(messageId, rowsRead ? [...rowsRead] : null);
    return { status: 'applied', messageId };
  };

  const readInput = (session: RoomSession, messageId = 'm1') => ({
    messageId,
    session,
    isLiveSession,
    isLoaded,
    snapshots: fault === 'no-snapshot'
      ? { beginSnapshot: () => 0, merge: () => rows, beginMutation: () => {}, finishMutation: () => {}, markAuthoritativeReactionWrite: () => {}, beginReactionWrite: () => () => true } as ReturnType<typeof createReactionSnapshots>
      : snapshots,
    visibility: fault === 'no-covers'
      ? { epoch: () => visibility.epoch(), covers: () => true }
      : visibility,
    applyRead: fault === 'no-commit'
      ? (id: string, next: ArenaReaction[] | null) => { applyWrite(id, next); return true; }
      : applyRead,
  });

  return {
    get rows() { return rows; },
    set rows(next: Row[]) { rows = next; },
    meta, writes, snapshots, visibility, queue, server, gates, mounted,
    setLive(next: RoomSession) { live = next; },
    isLoaded,
    session: (): RoomSession => ({ ...live }),
    read: (session: RoomSession, messageId = 'm1') => (
      fault === 'no-commit'
        ? rawApply(session, messageId)
        : queue.readAuthoritative(readInput(session, messageId))
    ),
    readInput,
    count: () => rows.find((row) => row.id === 'm1')?.reactions[0]?.count ?? null,
  };
}

describe('6G.5B.1 authoritative reaction read', () => {
  it('R1 valid loaded message receives authoritative reaction state', async () => {
    const h = harness();
    const outcome = await h.read(h.session());
    assert.equal(outcome.status, 'applied');
    assert.equal(h.count(), 3);
    assert.equal(h.rows.find((row) => row.id === 'm1')?.reactions[0]?.viewerReacted, true);
  });

  it('R2 room switch during the server read discards the stale result', async () => {
    const h = harness();
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const pending = h.read(h.session());
    h.setLive({ roomId: 'B', generation: 2 });
    gate.resolve(fire(9, true));
    const outcome = await pending;
    assert.deepEqual(outcome, { status: 'skipped', messageId: 'm1', reason: 'stale_session' });
    assert.equal(h.count(), 0);
    assert.equal(h.writes.length, 0);
  });

  it('R3 message evicted while the read is pending cannot be resurrected', async () => {
    const h = harness();
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const pending = h.read(h.session());
    h.rows = [];
    gate.resolve(fire(9, true));
    const outcome = await pending;
    assert.deepEqual(outcome, { status: 'skipped', messageId: 'm1', reason: 'not_loaded' });
    assert.equal(h.rows.some((row) => row.id === 'm1'), false);
    assert.equal(h.writes.length, 0);
  });

  it('R4 delayed authoritative read cannot overwrite a newer completed local toggle', async () => {
    const h = harness();
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.server.set('m1', fire(0, false));
    h.gates.set('m1', gate);
    const pending = h.read(h.session());
    await Promise.resolve();
    h.gates.delete('m1');
    await h.queue.enqueue('m1', 'fire', () => true);
    const afterToggle = h.count();
    assert.equal(afterToggle, 1);
    gate.resolve(fire(0, false));
    const outcome = await pending;
    assert.equal(outcome.status, 'skipped');
    assert.equal((outcome as { reason: string }).reason, 'superseded');
    assert.equal(h.count(), afterToggle);
  });

  it('R5 a read racing an in-flight toggle respects the mutation tail', async () => {
    const order: string[] = [];
    let rows: Row[] = [{ id: 'm1', body: 'a', reactions: fire(0) }];
    const toggleGate = deferred<void>();
    const readGate = deferred<readonly ArenaReaction[] | null>();
    const snapshots = createReactionSnapshots();
    const visibility = createVisibilityBarrier();
    visibility.admit([{ id: 'm1' }], visibility.epoch());
    const applyRead = createMergeReactionPublisher({
      snapshots,
      update: (fn) => { rows = fn(rows); },
    });
    const q = createReactionQueue({
      read: async () => {
        if (order.includes('toggle-start') && !order.includes('toggle-end')) {
          order.push('read-await');
          return readGate.promise;
        }
        return fire(0);
      },
      toggle: async () => {
        order.push('toggle-start');
        await toggleGate.promise;
        order.push('toggle-end');
        return { messageId: 'm1', emoji: 'fire', reacted: true, count: 1 };
      },
      write: (_id, reactions) => {
        if (!reactions) return;
        if (order.includes('read-await')) order.push('read-write');
        rows = rows.map((row) => (row.id === _id ? { ...row, reactions } : row));
      },
      onError: () => {},
      onCommitted: (id) => snapshots.markAuthoritativeReactionWrite(id),
    });
    snapshots.beginMutation('m1');
    const tog = q.enqueue('m1', 'fire', () => true).finally(() => snapshots.finishMutation('m1'));
    await Promise.resolve();
    const pending = q.readAuthoritative({
      messageId: 'm1',
      session: { roomId: 'A', generation: 1 },
      isLiveSession: () => true,
      isLoaded: () => true,
      snapshots,
      visibility,
      applyRead,
    });
    await Promise.resolve();
    toggleGate.resolve();
    await tog;
    readGate.resolve(fire(9, false));
    const outcome = await pending;
    assert.ok(outcome.status === 'applied' || outcome.status === 'skipped');
    assert.ok(!order.includes('read-write') || order.indexOf('toggle-end') < order.indexOf('read-write'));
  });

  it('R6 later read-start wins; older completion cannot overwrite', async () => {
    let rows: Row[] = [{ id: 'm1', body: 'a', reactions: fire(0) }];
    const first = deferred<readonly ArenaReaction[] | null>();
    const second = deferred<readonly ArenaReaction[] | null>();
    let calls = 0;
    const snapshots = createReactionSnapshots();
    const visibility = createVisibilityBarrier();
    visibility.admit([{ id: 'm1' }], visibility.epoch());
    const applyRead = createMergeReactionPublisher({
      snapshots,
      update: (fn) => { rows = fn(rows); },
    });
    const q = createReactionQueue({
      read: async () => {
        calls += 1;
        return calls === 1 ? first.promise : second.promise;
      },
      toggle: async () => ({ messageId: 'm1', emoji: 'fire', reacted: true, count: 1 }),
      write: () => {},
      onError: () => {},
      onCommitted: () => {},
    });
    const session = { roomId: 'A', generation: 1 };
    const opts = {
      messageId: 'm1',
      session,
      isLiveSession: () => true,
      isLoaded: () => true,
      snapshots,
      visibility,
      applyRead,
    };
    const a = q.readAuthoritative(opts);
    await Promise.resolve();
    const b = q.readAuthoritative(opts);
    second.resolve(fire(2, true));
    const ob = await b;
    assert.equal(ob.status, 'applied');
    assert.equal(rows[0].reactions[0].count, 2);
    first.resolve(fire(8, true));
    const oa = await a;
    assert.equal(oa.status, 'skipped');
    assert.equal((oa as { reason: string }).reason, 'superseded');
    assert.equal(rows[0].reactions[0].count, 2);
  });

  it('R7 failed server read leaves existing state intact and returns retryable failure', async () => {
    const h = harness();
    const snapshots = createReactionSnapshots();
    const visibility = createVisibilityBarrier();
    visibility.admit([{ id: 'm1' }], visibility.epoch());
    const q = createReactionQueue({
      read: async () => { throw new Error('network'); },
      toggle: async () => ({ messageId: 'm1', emoji: 'fire', reacted: true, count: 1 }),
      write: () => { throw new Error('write must not run'); },
      onError: () => {},
    });
    const outcome = await q.readAuthoritative({
      messageId: 'm1',
      session: h.session(),
      isLiveSession: () => true,
      isLoaded: () => true,
      snapshots,
      visibility,
      applyRead: () => true,
    });
    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.retryable, true);
    assert.equal(h.count(), 0);
  });

  it('R8 stale read cannot modify pagination, visibility, recovery obligations or another room metadata', async () => {
    const h = harness();
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const pending = h.read(h.session());
    h.setLive({ roomId: 'B', generation: 2 });
    h.meta.hasOlder = false;
    h.meta.roomTag = 'B';
    h.meta.obligation = 99;
    gate.resolve(fire(9, true));
    await pending;
    assert.deepEqual(h.meta, { hasOlder: false, roomTag: 'B', obligation: 99 });
    assert.equal(h.writes.length, 0);
    assert.equal(h.queue.overflow().tracked, 0);
  });

  it('R9 message id valid at request start but unloaded at application time is skipped', async () => {
    const h = harness();
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    assert.equal(h.isLoaded('m1'), true);
    const pending = h.read(h.session());
    h.rows = [{ id: 'other', body: 'x', reactions: fire(0) }];
    gate.resolve(fire(4, true));
    const outcome = await pending;
    assert.deepEqual(outcome, { status: 'skipped', messageId: 'm1', reason: 'not_loaded' });
    assert.equal(h.rows.some((row) => row.id === 'm1'), false);
  });

  it('R10 unmount or rapid A to B to A switching invalidates old session results', async () => {
    const h = harness();
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const sessionA1 = h.session();
    const pending = h.read(sessionA1);
    h.setLive({ roomId: 'B', generation: 2 });
    h.setLive({ roomId: 'A', generation: 3 });
    gate.resolve(fire(9, true));
    assert.deepEqual(await pending, { status: 'skipped', messageId: 'm1', reason: 'stale_session' });
    assert.equal(h.count(), 0);

    const gate2 = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate2);
    const sessionA3 = h.session();
    h.setLive({ roomId: 'A', generation: 4 });
    const pending2 = h.read(sessionA3);
    gate2.resolve(fire(5, true));
    assert.deepEqual(await pending2, { status: 'skipped', messageId: 'm1', reason: 'stale_session' });
  });
});

describe('6G.5B.1 fault sensitivity', () => {
  it('fault: removing session validation leaks Room A into Room B', async () => {
    const h = harness({ fault: 'no-session' });
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const pending = h.read(h.session());
    h.setLive({ roomId: 'B', generation: 2 });
    gate.resolve(fire(9, true));
    assert.equal((await pending).status, 'applied');
    assert.equal(h.count(), 9);
  });

  it('fault: removing loaded-membership validation resurrects an evicted row', async () => {
    const h = harness({ fault: 'no-membership' });
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const pending = h.read(h.session());
    h.rows = [];
    gate.resolve(fire(9, true));
    assert.equal((await pending).status, 'applied');
    assert.equal(h.rows.some((row) => row.id === 'm1'), true);
  });

  it('fault: bypassing mutation-tail/commit allows stale read to clobber a newer toggle', async () => {
    const h = harness({ fault: 'no-commit' });
    h.server.set('m1', fire(0, false));
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const pending = h.read(h.session());
    await Promise.resolve();
    h.gates.delete('m1');
    await h.queue.enqueue('m1', 'fire', () => true);
    assert.equal(h.count(), 1);
    gate.resolve(fire(0, false));
    assert.equal((await pending).status, 'applied');
    assert.equal(h.count(), 0, 'stale read overwrote the newer toggle');
  });

  it('fault: bypassing snapshot ticket validation lets an older merge replace a repair', async () => {
    const h = harness();
    const guard = h.snapshots;
    const snapOld = guard.beginSnapshot();
    await h.queue.readAuthoritative(h.readInput(h.session()));
    assert.equal(h.count(), 3);
    const protectedMerge = guard.merge(h.rows, [{ id: 'm1', body: 'a', reactions: fire(0, false) }], snapOld);
    assert.equal(protectedMerge.find((row) => row.id === 'm1')?.reactions[0]?.count, 3);
    const naive = createReactionSnapshots();
    const bad = naive.merge(
      [{ id: 'm1', body: 'a', reactions: fire(3, true) }],
      [{ id: 'm1', body: 'a', reactions: fire(0, false) }],
      1,
    );
    assert.equal(bad.find((row) => row.id === 'm1')?.reactions[0]?.count, 0);
  });
});

describe('6G.5B.1A fault sensitivity', () => {
  it('fault: missing read-start authority lets older read overwrite newer snapshot', async () => {
    const h = harness({ fault: 'no-snapshot' });
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const pending = h.read(h.session());
    await Promise.resolve();
    h.rows = [{ id: 'm1', body: 'a', reactions: fire(9, true) }];
    gate.resolve(fire(0, false));
    assert.equal((await pending).status, 'applied');
    assert.equal(h.count(), 0, 'older read overwrote newer snapshot without read-start');
  });

  it('fault: missing visibility covers lets eviction-era deletion wipe a recreated row', async () => {
    const h = harness({ fault: 'no-covers' });
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const pending = h.read(h.session());
    await Promise.resolve();
    h.visibility.mark(['m1']);
    h.rows = [];
    const epoch = h.visibility.epoch();
    h.visibility.admit([{ id: 'm1' }], epoch);
    h.rows = [{ id: 'm1', body: 'recreated', reactions: fire(9, true) }];
    gate.resolve(null);
    const outcome = await pending;
    assert.equal(outcome.status, 'applied');
    assert.equal(h.rows.some((row) => row.id === 'm1'), false, 'stale deletion removed recreated row');
  });

  it('fault: missing settlement leaves a permanently occupied mutation tail', async () => {
    const snapshots = createReactionSnapshots();
    const visibility = createVisibilityBarrier();
    visibility.admit([{ id: 'm1' }], visibility.epoch());
    let rows: Row[] = [{ id: 'm1', body: 'a', reactions: fire(0) }];
    const q = createReactionQueue({
      read: async () => fire(1, true),
      toggle: async () => ({ messageId: 'm1', emoji: 'fire', reacted: true, count: 1 }),
      write: () => {},
      onError: () => {},
    });
    // Broken publisher that throws after "commit" — production settles; this probe
    // shows an unhandled path would hang a naive await without finish().
    const brokenApply = (): boolean => {
      throw new Error('listener boom');
    };
    const outcome = await q.readAuthoritative({
      messageId: 'm1',
      session: { roomId: 'A', generation: 1 },
      isLiveSession: () => true,
      isLoaded: () => true,
      snapshots,
      visibility,
      applyRead: brokenApply,
    });
    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.retryable, false);
    // Tail released: a subsequent read must still complete.
    const next = await q.readAuthoritative({
      messageId: 'm1',
      session: { roomId: 'A', generation: 1 },
      isLiveSession: () => true,
      isLoaded: () => true,
      snapshots,
      visibility,
      applyRead: (id, nextRows) => {
        rows = rows.map((row) => (row.id === id ? { ...row, reactions: nextRows ?? [] } : row));
        return true;
      },
    });
    assert.equal(next.status, 'applied');
    assert.equal(rows[0].reactions[0].count, 1);
  });

  it('fault: missing stale-error reclassification marks room-switch rejection retryable', async () => {
    // Production rechecks isLiveSession in the catch path. A naive catch that
    // always returns failed/retryable would misclassify stale sessions.
    const snapshots = createReactionSnapshots();
    const visibility = createVisibilityBarrier();
    visibility.admit([{ id: 'm1' }], visibility.epoch());
    let live: RoomSession = { roomId: 'A', generation: 1 };
    const gate = deferred<readonly ArenaReaction[] | null>();
    const q = createReactionQueue({
      read: async () => gate.promise,
      toggle: async () => ({ messageId: 'm1', emoji: 'fire', reacted: true, count: 1 }),
      write: () => {},
      onError: () => {},
    });
    const pending = q.readAuthoritative({
      messageId: 'm1',
      session: { roomId: 'A', generation: 1 },
      isLiveSession: (s) => s.roomId === live.roomId && s.generation === live.generation,
      isLoaded: () => true,
      snapshots,
      visibility,
      applyRead: () => true,
    });
    await Promise.resolve();
    live = { roomId: 'B', generation: 2 };
    gate.reject(new Error('network after switch'));
    const outcome = await pending;
    assert.equal(outcome.status, 'skipped');
    assert.equal((outcome as { reason: string }).reason, 'stale_session');
    // Contrast: same rejection while still live is retryable failed.
    const liveFail = await q.readAuthoritative({
      messageId: 'm1',
      session: live,
      isLiveSession: () => true,
      isLoaded: () => true,
      snapshots,
      visibility,
      applyRead: () => true,
      // force by using a throwing read via a fresh queue below
    }).catch(() => null);
    void liveFail;
    const q2 = createReactionQueue({
      read: async () => { throw new Error('network'); },
      toggle: async () => ({ messageId: 'm1', emoji: 'fire', reacted: true, count: 1 }),
      write: () => {},
      onError: () => {},
    });
    const failed = await q2.readAuthoritative({
      messageId: 'm1',
      session: live,
      isLiveSession: () => true,
      isLoaded: () => true,
      snapshots,
      visibility,
      applyRead: () => true,
    });
    assert.equal(failed.status, 'failed');
    assert.equal((failed as { retryable: boolean }).retryable, true);
  });

  it('fault: missing toggle supersession lets delayed read clobber a local toggle', async () => {
    const h = harness();
    h.server.set('m1', fire(0, false));
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const pending = h.queue.readAuthoritative({
      ...h.readInput(h.session()),
      applyRead: (id, next) => {
        h.rows = next === null
          ? h.rows.filter((row) => row.id !== id)
          : h.rows.map((row) => (row.id === id ? { ...row, reactions: next } : row));
        return true;
      },
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    h.gates.delete('m1');
    await h.queue.enqueue('m1', 'fire', () => true);
    assert.equal(h.count(), 1);
    gate.resolve(fire(0, false));
    assert.equal((await pending).status, 'applied');
    assert.equal(h.count(), 0, 'toggle supersession missing: read clobbered toggle');
  });
});
