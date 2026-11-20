const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Durable, append-only NDJSON journal storage for the Arena acceptance runner.
 *
 * The scheduler's journal interface is SYNCHRONOUS and it dispatches the side
 * effect immediately afterwards, so every write here must be on disk before the
 * append returns. Uses `fs.appendFileSync` on an open descriptor and fsyncs, so a
 * crash cannot lose an entry that the runner already acted on.
 *
 * No file is opened at import time: construction validates configuration only.
 */

const MAX_LINE_BYTES = 64 * 1024;

/**
 * Open (or create) a journal for one run.
 *
 * @param {object} options
 * @param {string} options.file            absolute path to the .ndjson journal
 * @param {boolean} [options.fsync]        fsync after each append (default true)
 */
function openJournal({ file, fsync = true } = {}) {
  assert.equal(typeof file, 'string', 'journal file path required');
  assert.ok(path.isAbsolute(file), 'journal file path must be absolute');
  assert.equal(path.extname(file), '.ndjson', 'journal must be an .ndjson file');

  let fd = null;
  let failure = null;
  let records = 0;

  function ensureOpen() {
    assert.ok(fd === null, 'not open yet');
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    // 'a' guarantees append semantics; the OS positions every write at the end.
    fd = fs.openSync(file, 'a', 0o600);
  }

  /** Synchronous, durable, ordered append. Throws on any failure. */
  function append(line) {
    assert.equal(typeof line, 'string', 'journal line must be a string');
    assert.ok(Buffer.byteLength(line) <= MAX_LINE_BYTES, 'journal line too large');
    assert.ok(line.endsWith('\n'), 'journal line must end with a newline');
    assert.ok(fd !== null, 'journal is not open');
    fs.writeSync(fd, line);
    if (fsync) fs.fsyncSync(fd);
  }

  return {
    /** The scheduler-facing write. Returns false (never throws) on failure. */
    write(entry) {
      if (failure) return false;
      // A write before `open()` is a programming misuse, not a durability fault:
      // refuse it but do not latch the journal into a failed state.
      if (fd === null) return false;
      try {
        append(JSON.stringify(entry) + '\n');
        records += 1;
        return true;
      } catch (error) {
        failure = error?.code ?? 'journal_write_failed';
        return false;
      }
    },
    open() {
      if (fd !== null) return { opened: false, reason: 'already_open' };
      try {
        ensureOpen();
        return { opened: true, file };
      } catch (error) {
        failure = error?.code ?? 'journal_open_failed';
        return { opened: false, reason: failure };
      }
    },
    close() {
      if (fd === null) return false;
      try { fs.closeSync(fd); } finally { fd = null; }
      return true;
    },
    stats: () => ({ records, failure, open: fd !== null }),
  };
}

/**
 * Read a journal for restart recovery.
 *
 * A truncated or unparsable final line is tolerated (a crash may sever the last
 * write); it is reported as `truncated` so the caller can refuse to trust a
 * partially written record. Interior corruption is a hard failure.
 */
function readJournal(file) {
  assert.equal(typeof file, 'string', 'journal file path required');
  if (!fs.existsSync(file)) return { entries: [], truncated: false, bytes: 0 };
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split('\n');
  // A trailing newline means the last element is an empty string.
  const complete = lines.slice(0, -1);
  const tail = raw.endsWith('\n') ? null : lines[lines.length - 1];
  const entries = [];
  for (let i = 0; i < complete.length; i += 1) {
    const line = complete[i];
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      throw new Error(`journal corrupt at line ${i + 1}`);
    }
  }
  return { entries, truncated: Boolean(tail && tail.trim()), bytes: Buffer.byteLength(raw) };
}

/**
 * Recover a run's journal safely.
 *
 * Reports the resumed entry set plus any uncertainty that must block a restart:
 * a truncated tail means the last side effect's outcome is unknown.
 */
function recover(file) {
  const { entries, truncated, bytes } = readJournal(file);
  const last = entries.length ? entries[entries.length - 1] : null;
  const uncertain = truncated
    || (last && (last.outcome === 'started' || last.outcome === 'timeout'));
  return {
    entries,
    truncated,
    bytes,
    lastOutcome: last?.outcome ?? null,
    requiresReconciliation: Boolean(uncertain),
  };
}

module.exports = { openJournal, readJournal, recover };
