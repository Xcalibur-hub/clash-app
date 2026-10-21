/** Arena UI Phase 6 — consistency helpers and presentation regressions. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ARENA_HIT,
  ARENA_HIT_COMFORT,
  ARENA_SHEET_BOTTOM_FLOOR,
  arenaLiveChromeKind,
  arenaLiveStatusLabel,
  arenaSheetBottomPadding,
} from './arenaUiConsistency.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string): string =>
  fs.readFileSync(path.join(here, '..', relative), 'utf8');

describe('arena UI consistency', () => {
  it('keeps hit targets at least 44 and comfort cues at 48', () => {
    assert.equal(ARENA_HIT, 44);
    assert.ok(ARENA_HIT_COMFORT >= ARENA_HIT);
  });

  it('pads sheets above the A50 navigation floor', () => {
    assert.equal(arenaSheetBottomPadding(0), ARENA_SHEET_BOTTOM_FLOOR);
    assert.equal(arenaSheetBottomPadding(12), ARENA_SHEET_BOTTOM_FLOOR);
    assert.equal(arenaSheetBottomPadding(34), 34);
  });

  it('distinguishes live, judging, settled and cancelled chrome', () => {
    assert.equal(arenaLiveChromeKind({ live: true }), 'live');
    assert.equal(arenaLiveChromeKind({ live: true, judging: true }), 'judging');
    assert.equal(arenaLiveChromeKind({ live: false, terminal: 'settled' }), 'settled');
    assert.equal(arenaLiveChromeKind({ live: false, terminal: 'cancelled' }), 'cancelled');
    assert.equal(arenaLiveStatusLabel('judging'), 'JUDGING');
    assert.equal(arenaLiveStatusLabel('cancelled'), 'CANCELLED');
  });

  it('raises argument-history hit target and sheet bottom padding in source', () => {
    const stage = read('components/liveArena/CurrentArgumentStage.tsx');
    assert.match(stage, /minHeight: 48/);
    const sheet = read('components/arena/ui/ArenaSheet.tsx');
    assert.match(sheet, /arenaSheetBottomPadding/);
    const assist = read('components/liveArena/PrivateAssistPanel.tsx');
    assert.match(assist, /paddingBottom: space\.lg/);
  });

  it('exposes declined, cancelled, fighter-B and next-clash demo coverage', () => {
    const challenge = read('components/dev/arenaDemo/DemoChallenge.tsx');
    assert.match(challenge, /Declined/);
    assert.match(challenge, /Cancelled/);
    assert.match(challenge, /PASSED/);
    assert.match(challenge, /1600/);
    const model = read('components/dev/arenaDemo/model.ts');
    assert.match(model, /SETTLED_B/);
    assert.match(model, /winnerSide: 'B'/);
    const room = read('components/dev/arenaDemo/DemoArena.tsx');
    assert.match(room, /nextClash/);
    assert.match(room, /SETTLED_B/);
    assert.match(room, /DemoFreshTakesPreview/);
    assert.match(room, /DEMO JUDGING/);
  });
});
