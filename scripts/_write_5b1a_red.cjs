const fs = require('fs');
const path = require('path');
const dest = path.join(__dirname, '..', 'utils', 'authoritativeReactionRead.integration.test.ts');
fs.writeFileSync(dest, `/**
 * Step 6G.5B.1A — production-integrated regressions for readAuthoritative.
 * Uses the real store, SnapshotGuard, visibility barrier and room bridge.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createArenaTranscriptStore } from './arenaTranscriptStore.ts';
import { createRoomReactionBridge } from './roomReactionBridge.ts';
import { isLiveRoomSession, type RoomSession } from './transcriptOrdering.ts';
import type { ArenaReaction } from '../services/liveArenaService.ts';
import type { ArenaMessage } from '../services/liveArenaService.ts';

const fire = (count: number, reacted = false): ArenaReaction[] => [
  { emoji: 'fire', count, viewerReacted: reacted },
];

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function row(id: string, reactions: ArenaReaction[]): ArenaMessage {
  return {
    id, roomId: 'A', createdAt: 1, preciseCreatedAt: '1970-01-01T00:00:00.000Z',
    body: id, reactions, pending: false,
  } as ArenaMessage;
}

function productionHarness() {
  const store = createArenaTranscriptStore();
  store.update([row('m1', fire(0))]);
  const started = new Map<string, ReturnType<typeof deferred>>();
  const gates = new Map<string, ReturnType<typeof deferred<readonly ArenaReaction[] | null>>>();
  let live: RoomSession = { roomId: 'A', generation: 1 };
  const mounted = { current: true };
  const isLiveSession = (session: RoomSession) =>
    isLiveRoomSession(mounted.current, session, live);

  // Mirrors hooks/useLiveArenaRoom.ts write callback.
  const write = (id: string, reactions: ArenaReaction[] | null): void => {
    const currentWrite = store.reactions.beginReactionWrite(id);
    const remove = reactions === null ? store.visibility.mark([id]) : null;
    store.update((current) => {
      if (remove) return remove(current);
      if (!currentWrite()) return current;
      return reactions === null ? current
        : current.map((item) => (item.id === id ? { ...item, reactions } : item));
    });
  };

  const queue = createRoomReactionBridge({
    snapshots: store.reactions,
    read: async (id) => {
      const notify = started.get(id);
      if (notify) notify.resolve();
      const gate = gates.get(id);
      if (gate) return gate.promise;
      return fire(0);
    },
    toggle: async (id, emoji) => {
      const prior = store.getSnapshot().find((item) => item.id === id)
        ?.reactions.find((r) => r.emoji === emoji);
      const reacted = !prior?.viewerReacted;
      const count = reacted ? (prior?.count ?? 0) + 1 : Math.max(0, (prior?.count ?? 1) - 1);
      return { messageId: id, emoji, reacted, count };
    },
    write,
    onError: () => {},
  });

  return {
    store, queue, gates, started, mounted,
    get live() { return live; },
    setLive(next: RoomSession) { live = next; },
    isLiveSession,
    session: (): RoomSession => ({ ...live }),
    isLoaded: (id: string) => store.getSnapshot().some((item) => item.id === id),
    count: () => store.getSnapshot().find((item) => item.id === 'm1')?.reactions[0]?.count ?? null,
    selected: () => store.getSnapshot().find((item) => item.id === 'm1')?.reactions[0]?.viewerReacted ?? null,
    async beginRead(messageId = 'm1') {
      const transportStarted = deferred<void>();
      started.set(messageId, transportStarted);
      const gate = deferred<readonly ArenaReaction[] | null>();
      gates.set(messageId, gate);
      const pending = queue.readAuthoritative({
        messageId,
        session: { ...live },
        isLiveSession,
        isLoaded: (id) => store.getSnapshot().some((item) => item.id === id),
      });
      await transportStarted.promise;
      return { pending, gate };
    },
  };
}

describe('6G.5B.1A before-fix / production-integrated', () => {
  it('R1 older authoritative read cannot overwrite a newer transcript snapshot', async () => {
    const h = productionHarness();
    const { pending, gate } = await h.beginRead();
    const snap = h.store.reactions.beginSnapshot();
    h.store.update((current) => h.store.reactions.merge(
      current,
      [row('m1', fire(9, true))],
      snap,
    ));
    assert.equal(h.count(), 9);
    assert.equal(h.selected(), true);
    gate.resolve(fire(0, false));
    const outcome = await pending;
    assert.equal(outcome.status, 'skipped');
    assert.equal((outcome as { reason: string }).reason, 'superseded');
    assert.equal(h.count(), 9);
    assert.equal(h.selected(), true);
  });

  it('R2 later read-start wins when older read completes first', async () => {
    const h = productionHarness();
    const a = await h.beginRead();
    const bStarted = deferred<void>();
    h.started.set('m1-b', bStarted);
    // Second read on same id — share transport map via aliasing gates by message id only.
    // Use the same message id with sequential beginRead by replacing gate after A started.
    const gateB = deferred<readonly ArenaReaction[] | null>();
    const reads: Array<ReturnType<typeof deferred<readonly ArenaReaction[] | null>>> = [];
    let n = 0;
    const store = h.store;
    const write = (id: string, reactions: ArenaReaction[] | null): void => {
      const currentWrite = store.reactions.beginReactionWrite(id);
      const remove = reactions === null ? store.visibility.mark([id]) : null;
      store.update((current) => {
        if (remove) return remove(current);
        if (!currentWrite()) return current;
        return reactions === null ? current
          : current.map((item) => (item.id === id ? { ...item, reactions } : item));
      });
    };
    const q = createRoomReactionBridge({
      snapshots: store.reactions,
      read: async () => {
        const gate = deferred<readonly ArenaReaction[] | null>();
        reads.push(gate);
        return gate.promise;
      },
      toggle: async () => ({ messageId: 'm1', emoji: 'fire', reacted: true, count: 1 }),
      write,
      onError: () => {},
    });
    const session = h.session();
    const pendingA = q.readAuthoritative({
      messageId: 'm1', session, isLiveSession: () => true,
      isLoaded: () => true,
    });
    await Promise.resolve();
    assert.equal(reads.length, 1);
    const pendingB = q.readAuthoritative({
      messageId: 'm1', session, isLiveSession: () => true,
      isLoaded: () => true,
    });
    await Promise.resolve();
    assert.equal(reads.length, 2);
    // Older A completes first with count 1; newer B then with 9.
    reads[0].resolve(fire(1, true));
    await pendingA;
    reads[1].resolve(fire(9, true));
    await pendingB;
    assert.equal(h.count(), 9, 'newer read-start must remain authoritative');
  });

  it('R2 older read completing last cannot overwrite newer read-start', async () => {
    const store = createArenaTranscriptStore();
    store.update([row('m1', fire(0))]);
    const reads: Array<ReturnType<typeof deferred<readonly ArenaReaction[] | null>>> = [];
    const write = (id: string, reactions: ArenaReaction[] | null): void => {
      const currentWrite = store.reactions.beginReactionWrite(id);
      store.update((current) => {
        if (!currentWrite()) return current;
        return reactions === null ? current
          : current.map((item) => (item.id === id ? { ...item, reactions } : item));
      });
    };
    const q = createRoomReactionBridge({
      snapshots: store.reactions,
      read: async () => {
        const gate = deferred<readonly ArenaReaction[] | null>();
        reads.push(gate);
        return gate.promise;
      },
      toggle: async () => ({ messageId: 'm1', emoji: 'fire', reacted: true, count: 1 }),
      write,
      onError: () => {},
    });
    const session = { roomId: 'A', generation: 1 };
    const pendingA = q.readAuthoritative({
      messageId: 'm1', session, isLiveSession: () => true, isLoaded: () => true,
    });
    await Promise.resolve();
    const pendingB = q.readAuthoritative({
      messageId: 'm1', session, isLiveSession: () => true, isLoaded: () => true,
    });
    await Promise.resolve();
    reads[1].resolve(fire(9, true));
    await pendingB;
    reads[0].resolve(fire(1, true));
    const outcomeA = await pendingA;
    assert.equal(outcomeA.status, 'skipped');
    assert.equal(store.getSnapshot().find((item) => item.id === 'm1')?.reactions[0]?.count, 9);
  });

  it('R3 eviction then recreation rejects older deletion read', async () => {
    const h = productionHarness();
    const { pending, gate } = await h.beginRead();
    const remove = h.store.visibility.mark(['m1']);
    h.store.update((current) => remove(current));
    assert.equal(h.isLoaded('m1'), false);
    const epoch = h.store.visibility.epoch();
    const admitted = h.store.visibility.admit([row('m1', fire(9, true))], epoch);
    const snap = h.store.reactions.beginSnapshot();
    h.store.update((current) => h.store.reactions.merge(current, admitted, snap));
    assert.equal(h.count(), 9);
    gate.resolve(null);
    const outcome = await pending;
    assert.equal(outcome.status, 'skipped');
    assert.equal(h.isLoaded('m1'), true);
    assert.equal(h.count(), 9);
  });

  it('R4 publication/notification throw still settles and releases the tail', async () => {
    const store = createArenaTranscriptStore();
    store.update([row('m1', fire(0))]);
    store.subscribe(() => { throw new Error('listener boom'); });
    const write = (id: string, reactions: ArenaReaction[] | null): void => {
      const currentWrite = store.reactions.beginReactionWrite(id);
      store.update((current) => {
        if (!currentWrite()) return current;
        return current.map((item) => (item.id === id ? { ...item, reactions: reactions ?? [] } : item));
      });
    };
    const q = createRoomReactionBridge({
      snapshots: store.reactions,
      read: async () => fire(3, true),
      toggle: async () => ({ messageId: 'm1', emoji: 'fire', reacted: true, count: 1 }),
      write,
      onError: () => {},
    });
    const outcome = await Promise.race([
      q.readAuthoritative({
        messageId: 'm1',
        session: { roomId: 'A', generation: 1 },
        isLiveSession: () => true,
        isLoaded: () => true,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('hung')), 1000)),
    ]);
    assert.ok(outcome && typeof outcome === 'object' && 'status' in outcome);
    // Tail must be free for a subsequent read.
    const next = await q.readAuthoritative({
      messageId: 'm1',
      session: { roomId: 'A', generation: 1 },
      isLiveSession: () => true,
      isLoaded: () => true,
    });
    assert.ok(next.status === 'applied' || next.status === 'failed' || next.status === 'skipped');
  });

  it('R5 stale session after transport start classifies rejection as skipped not failed', async () => {
    const h = productionHarness();
    const { pending, gate } = await h.beginRead();
    const sessionA = h.session();
    h.setLive({ roomId: 'B', generation: 2 });
    gate.reject(new Error('network'));
    const outcome = await pending;
    assert.equal(outcome.status, 'skipped');
    assert.equal((outcome as { reason: string }).reason, 'stale_session');
    assert.equal(h.count(), 0);
    void sessionA;
  });

  it('R6 toggle completing while read is pending retains toggle authority', async () => {
    const h = productionHarness();
    const { pending, gate } = await h.beginRead();
    h.store.reactions.beginMutation('m1');
    await h.queue.enqueue('m1', 'fire', () => true).finally(() => h.store.reactions.finishMutation('m1'));
    const afterToggle = h.count();
    assert.ok(afterToggle !== null && afterToggle > 0);
    gate.resolve(fire(0, false));
    const outcome = await pending;
    assert.equal(outcome.status, 'skipped');
    assert.equal(h.count(), afterToggle);
  });

  it('R7 rapid A→B→A generation switch invalidates the original read', async () => {
    const h = productionHarness();
    const sessionA1 = h.session();
    const transportStarted = deferred<void>();
    h.started.set('m1', transportStarted);
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const pending = h.queue.readAuthoritative({
      messageId: 'm1',
      session: sessionA1,
      isLiveSession: h.isLiveSession,
      isLoaded: h.isLoaded,
    });
    await transportStarted.promise;
    h.setLive({ roomId: 'B', generation: 2 });
    h.setLive({ roomId: 'A', generation: 3 });
    gate.resolve(fire(9, true));
    const outcome = await pending;
    assert.equal(outcome.status, 'skipped');
    assert.equal((outcome as { reason: string }).reason, 'stale_session');
    assert.equal(h.count(), 0);
  });
});
`);
console.log('wrote', dest);
