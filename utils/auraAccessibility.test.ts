/**
 * AURA accessibility contract.
 *
 * Two guarantees, both previously broken:
 *  1. OS text scaling reaches the interface (the app had 1,218
 *     `allowFontScaling={false}` props, which silently disabled Larger Text).
 *  2. A fixed-size escape hatch exists but stays small and auditable.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { FIXED_FONT_BUDGET, resolveFontScaling } from '../components/shared/textScaling.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function countFixedFontProps(): { total: number; files: number } {
  let total = 0;
  const files = new Set<string>();
  for (const file of [...walk(path.join(root, 'app')), ...walk(path.join(root, 'components'))]) {
    const source = fs.readFileSync(file, 'utf8');
    const hits = source.match(/allowFontScaling=\{false\}/g);
    if (hits) {
      total += hits.length;
      files.add(path.relative(root, file));
    }
  }
  return { total, files: files.size };
}

describe('AURA text scaling', () => {
  it('scales by default and never rounds a scaled size', () => {
    assert.deepEqual(resolveFontScaling(undefined, undefined), { allowFontScaling: true });
    assert.deepEqual(resolveFontScaling(false, undefined), { allowFontScaling: true });
    assert.deepEqual(resolveFontScaling(false, 2), {
      allowFontScaling: true,
      maxFontSizeMultiplier: 2,
    });
  });

  it('only opts out when a caller explicitly asks for a fixed size', () => {
    assert.deepEqual(resolveFontScaling(true, undefined), { allowFontScaling: false });
    // fixed wins over a cap: a glyph cannot be both pinned and growable
    assert.deepEqual(resolveFontScaling(true, 3), { allowFontScaling: false });
  });

  it('keeps fixed-size text a small, auditable minority of the app', () => {
    const { total, files } = countFixedFontProps();
    // Regression guard: this was 1,218 props across 261 files before AURA.
    // Any change that pushes it back up should fail loudly here.
    assert.ok(
      total <= FIXED_FONT_BUDGET,
      `allowFontScaling={false} used ${total} times across ${files} files; budget is ${FIXED_FONT_BUDGET}`,
    );
  });

  it('never pins body copy, only numeric or glyph chrome', () => {
    for (const file of walk(path.join(root, 'app')).concat(walk(path.join(root, 'components')))) {
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('allowFontScaling={false}')) continue;
      // A pinned node whose style is a body/title token is body copy, not chrome.
      for (const match of source.matchAll(
        /allowFontScaling=\{false\}[\s\S]{0,220}?typeScale\.(body|bodyStrong|editorial|editorialLg|title|take|takeText|section)\b/g,
      )) {
        assert.fail(`${path.relative(root, file)} pins scaled body copy: ${match[0].slice(0, 80)}`);
      }
    }
  });
});
