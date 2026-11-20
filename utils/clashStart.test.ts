/**
 * Unit tests for Clash creation press-path helpers (no RN / no network).
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLASH_MODES,
  clashStartErrorMessage,
  isClashStartMode,
  shouldOpenExistingClash,
  validateClashStart,
} from './clashStart.ts';

class FakeSupabaseError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
  }
}

describe('clash start modes', () => {
  it('exposes STANDARD and BLIND matching the RPC enum', () => {
    assert.deepEqual([...CLASH_MODES], ['STANDARD', 'BLIND']);
    assert.equal(isClashStartMode('STANDARD'), true);
    assert.equal(isClashStartMode('BLIND'), true);
    assert.equal(isClashStartMode('standard'), false);
    assert.equal(isClashStartMode(''), false);
  });
});

describe('validateClashStart', () => {
  it('requires auth', () => {
    assert.equal(
      validateClashStart({ takeId: 't1', commentId: 'c1', signedIn: false }),
      'You need to sign in to start a Clash.',
    );
  });

  it('surfaces auth loading instead of silent return', () => {
    assert.equal(
      validateClashStart({ takeId: 't1', commentId: 'c1', signedIn: false, authLoading: true }),
      'Still signing in…',
    );
  });

  it('requires opposing side (comment / Side B)', () => {
    assert.equal(
      validateClashStart({ takeId: 't1', commentId: null, signedIn: true }),
      'Choose an opposing side first.',
    );
    assert.equal(
      validateClashStart({ takeId: 't1', commentId: undefined, signedIn: true }),
      'Choose an opposing side first.',
    );
  });

  it('passes when take + comment + signed in', () => {
    assert.equal(validateClashStart({ takeId: 't1', commentId: 'c1', signedIn: true }), null);
  });
});

describe('clashStartErrorMessage', () => {
  it('maps RPC codes to human copy', () => {
    assert.equal(
      clashStartErrorMessage(new FakeSupabaseError('x', '42501')),
      'You need to sign in to start a Clash.',
    );
    assert.equal(
      clashStartErrorMessage(new FakeSupabaseError('x', 'P0004')),
      'Choose an opposing side first.',
    );
    assert.equal(
      clashStartErrorMessage(new FakeSupabaseError('x', 'P0005')),
      'You already have an open Clash on this Take.',
    );
    assert.equal(
      clashStartErrorMessage(new FakeSupabaseError('raw postgres', 'XX000')),
      "Couldn't start this Clash. Try again.",
    );
  });

  it('never echoes raw Error messages to the user', () => {
    assert.equal(
      clashStartErrorMessage(new Error('permission denied for table clashes')),
      "Couldn't start this Clash. Try again.",
    );
  });
});

describe('shouldOpenExistingClash', () => {
  it('opens existing clash only on P0005', () => {
    assert.equal(shouldOpenExistingClash(new FakeSupabaseError('dup', 'P0005')), true);
    assert.equal(shouldOpenExistingClash(new FakeSupabaseError('x', 'P0004')), false);
    assert.equal(shouldOpenExistingClash(new Error('nope')), false);
  });
});

describe('startClash RPC argument contract', () => {
  it('Standard mode uses STANDARD', () => {
    const mode = 'STANDARD' as const;
    assert.equal(isClashStartMode(mode), true);
    assert.equal(mode, CLASH_MODES[0]);
  });

  it('Blind mode uses BLIND', () => {
    const mode = 'BLIND' as const;
    assert.equal(isClashStartMode(mode), true);
    assert.equal(mode, CLASH_MODES[1]);
  });
});

/**
 * Simulates the sheet controller: duplicate taps blocked while submitting;
 * success navigates with take id; failure keeps sheet open with message.
 */
describe('clash start controller simulation', () => {
  async function runStart(opts: {
    mode: 'STANDARD' | 'BLIND';
    commentId: string | null;
    startImpl: (takeId: string, commentId: string, mode: string) => Promise<string>;
  }): Promise<{
    calls: Array<{ takeId: string; commentId: string; mode: string }>;
    navigatedTo: string | null;
    sheetOpen: boolean;
    error: string | null;
  }> {
    const calls: Array<{ takeId: string; commentId: string; mode: string }> = [];
    let submitting = false;
    let sheetOpen = true;
    let error: string | null = null;
    let navigatedTo: string | null = null;
    const takeId = 'take_1';

    const start = async (mode: 'STANDARD' | 'BLIND'): Promise<void> => {
      const validation = validateClashStart({
        takeId,
        commentId: opts.commentId,
        signedIn: true,
      });
      if (validation) {
        error = validation;
        return;
      }
      if (submitting || !opts.commentId) return;
      submitting = true;
      error = null;
      try {
        calls.push({ takeId, commentId: opts.commentId, mode });
        const clashId = await opts.startImpl(takeId, opts.commentId, mode);
        sheetOpen = false;
        submitting = false;
        navigatedTo = `/clash/${takeId}`;
        assert.ok(clashId);
      } catch (e) {
        if (shouldOpenExistingClash(e)) {
          sheetOpen = false;
          submitting = false;
          navigatedTo = `/clash/${takeId}`;
          return;
        }
        error = clashStartErrorMessage(e);
        submitting = false;
      }
    };

    await start(opts.mode);
    // Duplicate tap while still marked submitting must not invoke creation again.
    submitting = true;
    const before = calls.length;
    await start(opts.mode);
    assert.equal(calls.length, before, 'duplicate tap must not invoke creation again');

    return { calls, navigatedTo, sheetOpen, error };
  }

  it('Standard Clash press invokes creation with STANDARD', async () => {
    const result = await runStart({
      mode: 'STANDARD',
      commentId: 'c1',
      startImpl: async (_t, _c, mode) => {
        assert.equal(mode, 'STANDARD');
        return 'cl_abc';
      },
    });
    assert.equal(result.calls[0]?.mode, 'STANDARD');
    assert.equal(result.navigatedTo, '/clash/take_1');
    assert.equal(result.sheetOpen, false);
  });

  it('Blind Clash press invokes creation with BLIND', async () => {
    const result = await runStart({
      mode: 'BLIND',
      commentId: 'c1',
      startImpl: async (_t, _c, mode) => {
        assert.equal(mode, 'BLIND');
        return 'cl_blind';
      },
    });
    assert.equal(result.calls[0]?.mode, 'BLIND');
    assert.equal(result.navigatedTo, '/clash/take_1');
  });

  it('success navigates using take route for returned clash', async () => {
    const result = await runStart({
      mode: 'STANDARD',
      commentId: 'c1',
      startImpl: async () => 'cl_returned_id',
    });
    assert.equal(result.navigatedTo, '/clash/take_1');
    assert.equal(result.sheetOpen, false);
  });

  it('RPC failure produces visible UI feedback and keeps sheet open', async () => {
    let submitting = false;
    let sheetOpen = true;
    let error: string | null = null;
    const start = async (): Promise<void> => {
      if (submitting) return;
      submitting = true;
      try {
        throw new FakeSupabaseError('boom', 'XX000');
      } catch (e) {
        error = clashStartErrorMessage(e);
        submitting = false;
      }
    };
    await start();
    assert.equal(sheetOpen, true);
    assert.equal(error, "Couldn't start this Clash. Try again.");
    assert.equal(submitting, false);
  });

  it('missing selection produces visible validation', async () => {
    const result = await runStart({
      mode: 'STANDARD',
      commentId: null,
      startImpl: async () => {
        throw new Error('should not run');
      },
    });
    assert.equal(result.calls.length, 0);
    assert.equal(result.error, 'Choose an opposing side first.');
    assert.equal(result.sheetOpen, true);
  });
});
