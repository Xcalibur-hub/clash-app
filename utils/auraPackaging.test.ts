/**
 * Packaging contract (Phase 1 blocker 1).
 *
 * The claim was that EAS release packaging excludes `AppText`, `textScaling`,
 * `Editorial` and `typeRamp`. It did not: there is no `.easignore`, so EAS uploads
 * the git tree, and all four files are tracked. A real `expo export --platform
 * android` confirmed their strings inside the shipped bytecode.
 *
 * This test guards the *cause* of that class of bug, which is a module existing on
 * disk but not in git (or excluded by a config file). It cannot prove the bundle
 * builds — that is done with a real export — but it catches the silent case where
 * a new component is added to the tree and forgotten by git.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Every file Phase 1/2 added that a release build must contain. */
const MUST_SHIP = [
  'components/shared/AppText.tsx',
  'components/shared/textScaling.ts',
  'components/shared/Editorial.tsx',
  'components/shared/emptyStateSemantics.ts',
  'components/shared/avatarGeometry.ts',
  'components/arena/ClashHeader.tsx',
  'components/arena/ActionRegion.tsx',
  'components/arena/VerdictRegion.tsx',
  'components/arena/LiveClashFeature.tsx',
  'components/navigation/dockMetrics.ts',
  'theme/typeRamp.ts',
  'utils/arenaHierarchy.ts',
  // The Phase 2 review fix: eligibility is now one pure, server-authoritative
  // module. If a release build ever omitted it the ActionRegion would not compile,
  // so it belongs on the must-ship list with the rest.
  'utils/arenaRoomEligibility.ts',
  'utils/arenaResultConsolidation.test.ts',
  'utils/arenaRoomEligibility.test.ts',
];

describe('AURA packaging', () => {
  it('tracks every shipped module in git', () => {
    // `git ls-files` prints tracked paths; a file on disk that is absent from this
    // list is exactly what a release build would silently omit.
    const tracked = new Set(
      execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8' }).split('\n'),
    );
    const missing = MUST_SHIP.filter((rel) => !tracked.has(rel));
    assert.deepEqual(missing, [], `untracked (would not ship): ${missing.join(', ')}`);
  });

  it('has no ignore file that could exclude source from the upload', () => {
    assert.equal(existsSync(join(ROOT, '.easignore')), false, '.easignore present — audit it');
  });

  it('does not ignore any source directory in .gitignore', () => {
    const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    const forbidden = ignore.filter((line) =>
      /^(components|app|theme|utils|hooks|services)\/?$/.test(line),
    );
    assert.deepEqual(forbidden, [], `source directories ignored: ${forbidden.join(', ')}`);
  });
});
