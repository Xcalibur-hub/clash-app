// ============================================================================
// URL -> filesystem path derivation for the CLASH cloud package.
//
// Round 6 defect: tests and the builder derived directories from
// `new URL('..', import.meta.url).pathname`. On Windows that yields
// '/C:/Users/.../' - a leading slash, a drive letter, and percent-encoded
// spaces - which path.join/resolve then turn into 'C:\\C:\\Users\\...\\manifest.json'
// and ENOENT. The suite therefore failed before its first assertion.
//
// fileURLToPath() is the only correct conversion: it removes the leading slash,
// restores the drive letter on Windows and percent-decodes the path.
//
// Everything is injectable so the rules can be tested for every platform from a
// single machine (see section [17] of verify-package.mjs).
// ============================================================================

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * @param {string} moduleUrl  usually `import.meta.url`
 * @param {object} [options]
 * @param {(u: string) => string} [options.urlToPath]
 * @param {(...p: string[]) => string} [options.resolvePath]
 * @param {(p: string) => string} [options.dirnameOf]
 * @returns {{ file: string, tests: string, cloud: string, root: string }}
 */
export function pathsFromModuleUrl(moduleUrl, options = {}) {
  const {
    urlToPath = fileURLToPath,
    resolvePath = resolve,
    dirnameOf = dirname,
  } = options;

  if (typeof moduleUrl !== 'string' || !/^file:/i.test(moduleUrl)) {
    // Anything that is not a file: URL has no filesystem meaning. Failing here
    // is deliberate: a bootstrap that cannot locate the package must not run.
    throw new Error(`pathsFromModuleUrl expects a file: URL, received ${JSON.stringify(String(moduleUrl)).slice(0, 120)}`);
  }

  const file = urlToPath(moduleUrl);          // .../supabase/cloud/tests/verify-package.mjs
  const tests = dirnameOf(file);              // .../supabase/cloud/tests
  const cloud = resolvePath(tests, '..');     // .../supabase/cloud
  const root = resolvePath(cloud, '..', '..'); // repo root

  return { file, tests, cloud, root };
}

/**
 * Path used by the tests to prove a derived directory is usable on Windows.
 * Kept here so the assertion and the implementation cannot drift.
 */
export function looksLikeDoubledDrive(p) {
  return /^[A-Za-z]:\\(?:[^\\]+\\)?[A-Za-z]:\\/.test(p) || /^\\[A-Za-z]:/.test(p);
}

/**
 * Strict validation of a derived filesystem path, per platform.
 *
 * Round 7: the suite used to assert `!path.includes('\\\\')`, which is wrong on
 * Windows where a backslash is the separator. It also compared a live Windows
 * path against `posix.dirname(...)`, which returns '.' for a backslash path.
 * Both rules now live here and are platform-explicit, so they can be tested for
 * every platform from any machine - and neither is weakened: a Windows path must
 * be absolute (drive or UNC), use backslashes only, and carry no URL artefacts.
 *
 * @param {string} p
 * @param {{windows?: boolean}} [options]
 * @returns {string[]} problems; empty means clean
 */
export function pathArtefacts(p, options = {}) {
  const { windows = process.platform === 'win32' } = options;
  const problems = [];

  if (typeof p !== 'string' || p.trim() === '') return ['empty path'];
  if (p.includes('\0')) problems.push('NUL byte');
  if (p.includes('%')) problems.push('percent-encoded characters (URL artefact)');

  if (windows) {
    if (p.includes('/')) problems.push("foreign separator '/' on a Windows path");
    if (looksLikeDoubledDrive(p)) problems.push('doubled drive letter');
    const drive = /^[A-Za-z]:\\/.test(p);
    const unc = /^\\\\[^\\/]+\\[^\\/]+/.test(p);
    if (!drive && !unc) problems.push('not an absolute Windows path (drive or UNC)');
  } else {
    if (p.includes('\\')) problems.push("foreign separator '\\' on a POSIX path");
    if (/^[A-Za-z]:/.test(p) || /^\/[A-Za-z]:/.test(p)) problems.push('drive letter on a POSIX path (URL artefact)');
    if (!p.startsWith('/')) problems.push('not an absolute POSIX path');
  }

  return problems;
}
