const assert = require('node:assert/strict');
const { createScheduler, TERMINAL } = require('./arena-acceptance-scheduler.cjs');
const { createArtifactGate, verifyArtifact, signingKeyFromEnv } = require('./arena-acceptance-authorization.cjs');
const { openJournal, recover } = require('./arena-acceptance-journal.cjs');

/**
 * Thin composition of the existing scheduler with the real seams.
 *
 * This module does not implement scheduling, authorization or persistence logic of
 * its own — it wires the three together and enforces the one rule that matters:
 * **real operations cannot start without a fresh, verified, scoped artifact.**
 *
 * With no seams supplied, `mode` is dry-run and nothing can execute.
 */
function createRunner(options = {}) {
  const {
    now,
    serverNow = null,
    handlers = null,
    health = null,
    journal = null,
    journalFile = null,
    authorization = null,
    artifact = null,
    artifactLoader = null,
    approvalKey = null,
    keyEnvName,
    stepTimeoutMs,
    maxClockDriftMs,
  } = options;

  assert.equal(typeof now, 'function', 'injected clock required');

  const live = Boolean(handlers);
  const key = approvalKey ?? (keyEnvName ? signingKeyFromEnv(process.env, keyEnvName) : null);

  // Durable journal: an explicit file is required for any live run.
  let store = journal;
  let storeOpen = false;
  if (!store && live) {
    assert.ok(journalFile, 'a live runner requires a durable journal file');
    store = openJournal({ file: journalFile });
    const opened = store.open();
    assert.equal(opened.opened, true, `journal could not open: ${opened.reason}`);
    storeOpen = true;
  }

  const journalSink = store
    ? (entry) => store.write(entry)
    : () => true;

  const gate = live
    ? createArtifactGate({
      loadArtifact: artifactLoader ?? (async () => artifact),
      key: () => key,
      now,
    })
    : null;

  const scheduler = createScheduler({
    now,
    serverNow,
    handlers: live ? handlers : null,
    journal: journalSink,
    // Authorization is validated in BOTH modes; only side effects differ.
    authorization,
    approvalGate: gate ?? null,
    health,
    stepTimeoutMs,
    maxClockDriftMs,
  });

  return {
    scheduler,
    /** Journal statistics for the operator. */
    journalStats: () => (store ? store.stats() : { records: 0, failure: null, open: false }),
    /** Close the durable journal, if one was opened. */
    close() {
      if (storeOpen && store) { store.close(); storeOpen = false; }
      return true;
    },
    /** True when the runner is able to execute real operations. */
    isLive: () => live,
  };
}

/**
 * Preflight for a future live session.
 *
 * Checks every precondition that would otherwise fail mid-run, and returns the
 * missing ones. Performs no I/O beyond reading the journal file it is given.
 */
function preflight(options = {}) {
  const {
    authorization = null,
    artifact = null,
    approvalKey = null,
    journalFile = null,
    manifestHash = null,
    planDigest = null,
    now = Date.now,
  } = options;

  const blockers = [];
  if (!authorization || authorization.approved !== true) blockers.push('authorization_missing');
  if (!approvalKey) blockers.push('approval_key_unavailable');
  if (!journalFile) blockers.push('journal_file_missing');
  if (!manifestHash) blockers.push('manifest_hash_missing');

  if (artifact && approvalKey) {
    const verdict = verifyArtifact(artifact, approvalKey, { now, manifestHash, planDigest });
    if (!verdict.ok) blockers.push(verdict.reason);
  } else if (!artifact) {
    blockers.push('artifact_missing');
  }

  let recoveryState = null;
  if (journalFile) {
    try {
      recoveryState = recover(journalFile);
      if (recoveryState.requiresReconciliation) blockers.push('journal_requires_reconciliation');
    } catch (error) {
      blockers.push(`journal_unreadable:${error.message}`);
    }
  }

  return { ready: blockers.length === 0, blockers, recovery: recoveryState };
}

/**
 * Resume a previous run's scheduler from a journal, refusing when uncertain.
 * Reuses the scheduler's own fail-closed `resume()`.
 */
function resumeFromJournal({ scheduler, journalFile, digest = null }) {
  assert.ok(scheduler && typeof scheduler.resume === 'function', 'scheduler required');
  const state = recover(journalFile);
  if (state.requiresReconciliation) {
    return { resumed: false, blocked: true, reason: 'journal_requires_reconciliation', recovery: state };
  }
  const result = scheduler.resume(state.entries, { digest });
  return { ...result, recovery: state, terminal: result.terminal ?? TERMINAL.BLOCKED };
}

module.exports = { createRunner, preflight, resumeFromJournal };
