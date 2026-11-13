/**
 * Patch hygiene (Phase 1 blocker 9).
 *
 * The mechanical removal of `allowFontScaling={false}` across 242 files left 108
 * whitespace-only lines behind — `Text` nodes whose props were deleted but whose
 * indentation survived. They are invisible in review and turn every later diff of
 * those files into noise.
 *
 * This asserts on the files that exist now rather than on a fixed diff, so it
 * keeps holding as the tree changes.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Directories that are generated, vendored, or not ours to lint. */
const SKIP = new Set([
  'node_modules',
  '.git',
  '.expo',
  'dist',
  '.aura-render-check.cjs',
  'supabase',
  'docs',
  'web-build',
]);

const CODE = /\.(ts|tsx|js|cjs|mjs)$/;

/**
 * Read a file with line endings normalised to LF.
 *
 * ## Why this is required, not defensive noise
 *
 * The checks below split on `'\n'` and compare each line to its `trimEnd()`. On a
 * Windows checkout — `core.autocrlf=true` is the git default there — every line
 * arrives as `"...\r"`, so:
 *
 *   · `line !== line.trimEnd()` is true for *every* line, and
 *   · a blank line is `"\r"`, which `.trim()` treats as whitespace-only.
 *
 * The suite then reports hundreds of offenders that do not exist in the repository.
 * It passed on Linux and failed on Windows, which is the worst shape for a gate:
 * the platform that runs CI is not the platform that files bugs.
 *
 * Normalising here does **not** weaken the assertions. They run unchanged against
 * the same logical lines; only the transport artefact is removed. CRLF itself is
 * prevented at the source by `.gitattributes`, so this is the second line of
 * defence rather than a way of ignoring the problem.
 */
function readNormalised(file: string): string {
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE.test(entry)) out.push(full);
  }
  return out;
}

describe('AURA patch hygiene', () => {
  it('has no whitespace-only lines in application source', () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const lines = readNormalised(file).split('\n');
      lines.forEach((line, i) => {
        if (line.length > 0 && line.trim() === '') {
          offenders.push(`${file.replace(ROOT, '')}:${i + 1}`);
        }
      });
    }
    assert.deepEqual(
      offenders.slice(0, 20),
      [],
      `${offenders.length} whitespace-only line(s); first: ${offenders.slice(0, 5).join(', ')}`,
    );
  });

  it('has no trailing whitespace on code lines', () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const lines = readNormalised(file).split('\n');
      lines.forEach((line, i) => {
        if (line.length > 0 && line.trim() !== '' && line !== line.trimEnd()) {
          offenders.push(`${file.replace(ROOT, '')}:${i + 1}`);
        }
      });
    }
    assert.deepEqual(
      offenders.slice(0, 20),
      [],
      `${offenders.length} trailing-whitespace line(s); first: ${offenders.slice(0, 5).join(', ')}`,
    );
  });

  it('ends every AURA-authored file with exactly one newline', () => {
    // Scoped deliberately. A repo-wide EOF rule would flag files that were already
    // like that at the base commit, and reformatting untouched files is exactly
    // the unrelated mechanical sweep Phase 2 was told to avoid. These are the
    // files Phase 1/2 introduced, so their endings are ours to get right.
    const ours = [
      'theme/typeRamp.ts',
      'theme/typography.ts',
      'components/shared/AppText.tsx',
      'components/shared/textScaling.ts',
      'components/shared/Editorial.tsx',
      'components/shared/EmptyState.tsx',
      'components/shared/emptyStateSemantics.ts',
      'components/shared/Avatar.tsx',
      'components/shared/avatarGeometry.ts',
      'components/navigation/dockMetrics.ts',
      'components/navigation/RealmTabBar.tsx',
      'components/navigation/dockConfig.ts',
    ];
    const offenders = ours.filter((rel) => {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      return !text.endsWith('\n') || text.endsWith('\n\n');
    });
    assert.deepEqual(offenders, [], `bad EOF: ${offenders.join(', ')}`);
  });
});
