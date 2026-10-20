/** Next-Clash navigation guards under deferred responses. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createNavigationGuard, resolveNextClashTarget } from './nextClashNavigation.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('next Clash navigation guard', () => {
  it('navigates only while the token is current', async () => {
    const guard = createNavigationGuard();
    const token = guard.begin();
    const room = deferred<{ ok: boolean } | null>();
    const result = resolveNextClashTarget({
      token,
      isCurrent: (t) => guard.isCurrent(t),
      fetchRoom: () => room.promise,
      accept: (value) => value?.ok === true,
    });
    room.resolve({ ok: true });
    assert.equal(await result, 'accepted');
  });

  it('refuses navigation after blur while the fetch is pending', async () => {
    const guard = createNavigationGuard();
    const token = guard.begin();
    const room = deferred<{ ok: boolean } | null>();
    const result = resolveNextClashTarget({
      token,
      isCurrent: (t) => guard.isCurrent(t),
      fetchRoom: () => room.promise,
      accept: () => true,
    });
    guard.invalidate(); // screen blurred / unmounted
    room.resolve({ ok: true });
    assert.equal(await result, 'stale');
  });

  it('refuses navigation after a room identity or account change', async () => {
    const guard = createNavigationGuard();
    const token = guard.begin();
    const room = deferred<null>();
    const result = resolveNextClashTarget({
      token,
      isCurrent: (t) => guard.isCurrent(t),
      fetchRoom: () => room.promise,
      accept: () => true,
    });
    guard.invalidate();
    room.resolve(null);
    assert.equal(await result, 'stale');
  });

  it('reports an unavailable target without navigating', async () => {
    const guard = createNavigationGuard();
    const token = guard.begin();
    const result = await resolveNextClashTarget({
      token,
      isCurrent: (t) => guard.isCurrent(t),
      fetchRoom: async () => ({ ok: false }),
      accept: (value) => value?.ok === true,
    });
    assert.equal(result, 'unavailable');
  });

  it('reports failure only when still current', async () => {
    const guard = createNavigationGuard();
    const token = guard.begin();
    const failed = await resolveNextClashTarget({
      token,
      isCurrent: (t) => guard.isCurrent(t),
      fetchRoom: async () => { throw new Error('network'); },
      accept: () => true,
    });
    assert.equal(failed, 'failed');

    const second = createNavigationGuard();
    const pending = second.begin();
    const stale = resolveNextClashTarget({
      token: pending,
      isCurrent: (t) => second.isCurrent(t),
      fetchRoom: async () => { throw new Error('network'); },
      accept: () => true,
    });
    second.invalidate();
    assert.equal(await stale, 'stale');
  });

  it('supersedes a duplicate tap so only the newest request may navigate', () => {
    const guard = createNavigationGuard();
    const first = guard.begin();
    const second = guard.begin();
    assert.equal(guard.isCurrent(first), false);
    assert.equal(guard.isCurrent(second), true);
  });
});
