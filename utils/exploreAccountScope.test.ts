/**
 * Explore E2.6 D2 — World discovery context (mode, Map/Globe, selected country)
 * must survive a country-page push and back, and still reset on identity change.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { exploreAccountIdentity, exploreAccountKey } from './exploreAccountScope.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string): string =>
  fs.readFileSync(path.join(here, '..', relative), 'utf8');

const world = (userId: string | null, route = '/explore'): string =>
  exploreAccountKey({ userId, path: route, retainAcrossPaths: true });

describe('E2.6 D2 — Explore World context survives navigation', () => {
  it('keeps one screen instance from World to a country page and back', () => {
    assert.equal(world('user-1'), world('user-1', '/explore/country/JP'));
    assert.equal(world('user-1'), world('user-1', '/explore'));
  });

  it('keeps the same instance across a tab switch', () => {
    assert.equal(world('user-1', '/'), world('user-1', '/explore'));
  });

  it('still resets local state on an identity change', () => {
    assert.notEqual(world('user-1'), world('user-2'));
    assert.notEqual(world('user-1'), world(null));
    assert.equal(world(null), 'guest');
  });

  it('keeps per-path scoping for screens that do not opt in', () => {
    const a = exploreAccountKey({ userId: 'user-1', path: '/explore/challenge/1' });
    const b = exploreAccountKey({ userId: 'user-1', path: '/explore/challenge/2' });
    assert.equal(a, 'user-1:/explore/challenge/1');
    assert.notEqual(a, b);
  });

  it('treats blank identities and paths as guest / root', () => {
    assert.equal(exploreAccountIdentity('  '), 'guest');
    assert.equal(exploreAccountIdentity(undefined), 'guest');
    assert.equal(exploreAccountIdentity(' user-9 '), 'user-9');
    assert.equal(exploreAccountKey({ userId: '', path: '' }), 'guest:/');
  });

  it('has the Explore tab opt in and keep World state locally', () => {
    const screen = read('app/(tabs)/explore.tsx');
    assert.match(
      screen,
      /withExploreAccount\(ExploreScreen,\s*\{\s*retainAcrossPaths:\s*true,?\s*\}\)/,
    );
    // No global store: the context that must survive is plain screen state.
    assert.match(screen, /const \[mode, setMode\] = React\.useState<ExploreMode>/);
    assert.match(screen, /const \[worldVisual, setWorldVisual\] = React\.useState<WorldVisualMode>/);
    assert.match(
      screen,
      /const \[selectedCountry, setSelectedCountry\] = React\.useState<string \| null>\(null\)/,
    );

    const boundary = read('components/explore/ExploreAccountBoundary.tsx');
    assert.match(boundary, /exploreAccountKey\(/);
    // Detail screens keep the default path-scoped key.
    const country = read('app/explore/country/[code].tsx');
    assert.match(country, /export default withExploreAccount\(ExploreCountryScreen\);/);
  });

  it('routes country pages above the tab instead of replacing it', () => {
    assert.match(read('utils/exploreNav.ts'), /return `\/explore\/country\/\$\{/);
  });
});
