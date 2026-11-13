/**
 * Behavioural regression test for the Phase 2 review — issue 2.
 *
 * ## What went wrong
 *
 * The settled screen rendered `VerdictRegion` *and* `LiveRoomResultReveal`, so one
 * result was announced twice: a large "Side A" headline, then immediately
 * "Side A 62% / Agree took it — 62 of 100 judgements". A new artifact was stacked
 * beside the old one instead of replacing it — the same failure mode Phase 1 was
 * blocked for.
 *
 * ## What this test enforces
 *
 * Consolidation had a trap: deleting `LiveRoomResultReveal` would have quietly
 * dropped behaviour that only it owned — share, Mindshift, best argument, the
 * viewer's own recorded journey, the final-stance prompt, and next-clash. So this
 * test asserts both halves:
 *
 *   1. there is exactly ONE result surface in the room screen, and
 *   2. that surface still owns every behaviour the old card had.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

const ROOM_SCREEN = 'app/arena/room/[roomId].tsx';
const RESULT = 'components/arena/VerdictRegion.tsx';

describe('issue 2 — one authoritative result experience', () => {
  it('renders exactly one result surface in the settled room', () => {
    const room = read(ROOM_SCREEN);
    const verdictMounts = (room.match(/<VerdictRegion/g) ?? []).length;
    const legacyMounts = (room.match(/<LiveRoomResultReveal/g) ?? []).length;

    assert.equal(verdictMounts, 1, `expected 1 VerdictRegion, found ${verdictMounts}`);
    assert.equal(legacyMounts, 0, `the duplicated result component is still mounted (${legacyMounts})`);
  });

  it('does not even import the superseded component', () => {
    // A leftover import is how a "removed" component comes back in the next diff.
    const room = read(ROOM_SCREEN);
    assert.equal(
      /from '.*LiveRoomResultReveal'/.test(room),
      false,
      'stale import of LiveRoomResultReveal remains',
    );
  });

  it('states the outcome once, not twice', () => {
    // The duplicate was two headlines for the same fact. Assert the surface
    // renders a single winner headline rather than layering `displayLg` twice.
    const src = read(RESULT);
    const headlineUses = (src.match(/typeScale\.displayLg/g) ?? []).length;
    assert.ok(headlineUses <= 1, `result surface renders ${headlineUses} display headlines`);
  });

  it('keeps share behaviour', () => {
    const src = read(RESULT);
    assert.match(src, /Share\.share\(/, 'share sheet call is gone');
    assert.match(src, /arena_result_shared/, 'share analytics is gone');
    assert.match(src, /label="Share result"/, 'share action is no longer offered');
  });

  it('keeps Mindshift, and keeps its null rule', () => {
    const src = read(RESULT);
    assert.match(src, /BIGGEST MINDSHIFT/);
    assert.match(src, /mindshiftChangedPercent/);
    // The RPC returns JSON null when nobody completed a pair. Rendering that as
    // 0% would be a false claim, so the card must be gated on null.
    assert.match(
      src,
      /changedPercent !== null/,
      'Mindshift card is not gated on null — "nobody finished" could render as 0%',
    );
  });

  it('keeps the best argument and the award settlement actually pays', () => {
    const src = read(RESULT);
    assert.match(src, /BEST ARGUMENT/);
    assert.match(src, /bestArgumentBody/);
    assert.match(src, /bestArgumentAuthor/);
    // `arena_best_argument` writes +40 reputation. Stating it is a fact, not a
    // decoration; a different number here would be a lie about the ledger.
    assert.match(src, /\+40 REP/);
    assert.match(
      read('supabase/migrations/20261002150100_live_arena_schema.sql'),
      /'arena_best_argument', 40, 0/,
      'the award constant drifted from the settlement function',
    );
  });

  it('keeps the viewer record: final stance prompt and recorded journey', () => {
    const src = read(RESULT);
    assert.match(src, /Where do you stand now\?/, 'final-stance prompt is gone');
    assert.match(src, /YOUR JOURNEY/, 'recorded journey is gone');
    assert.match(src, /onRecordFinal/, 'final-stance callback is gone');
  });

  it('keeps the crowd moment', () => {
    assert.match(read(RESULT), /CROWD MOMENT/);
  });

  it('keeps the next-clash loop', () => {
    const src = read(RESULT);
    assert.match(src, /onNextClash/);
    assert.match(src, /NEXT CLASH/);
    // And the room screen must still wire it, or the CTA would be dead — which is
    // issue 1 all over again.
    assert.match(read(ROOM_SCREEN), /onNextClash=/);
  });

  it('keeps the reveal animation and respect for reduced motion', () => {
    const src = read(RESULT);
    assert.match(src, /useReducedMotion/, 'reduced-motion guard is gone');
  });

  it('does not invent a per-room reward', () => {
    // There is no authenticated way to read this room's reputation rows:
    // `fetchReputationEvents` is profile-scoped, capped at 100, and exposes no
    // arena_room_id. A "+120 reputation" line would be fabricated.
    //
    // Assert on non-comment source lines: the component's own docstring explains
    // why the reward is absent, and that prose must not trip the guard.
    const raw = read(RESULT);
    // Strip block comments of every flavour (`/** */`, `{/* */}`), then line
    // comments. Prose is not a claim; the guard is about rendered strings.
    const code = raw
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n');
    assert.doesNotMatch(code, /rewardLine/, 'a fabricated reward prop is back');
    assert.doesNotMatch(code, /\+\d+ reputation/, 'a fabricated per-room reward is rendered');
  });

  it('renders the best-argument award only when there is a best argument', () => {
    // Gating matters: an award badge with no winner would claim a payout that
    // never happened.
    const src = read(RESULT);
    const gate = src.indexOf('result.bestArgumentBody || result.bestArgumentAuthor');
    const award = src.indexOf('+40 REP');
    assert.ok(gate > -1 && award > gate, 'award is rendered outside the best-argument gate');
  });

  it('keeps the result surface reachable from the room screen with real data', () => {
    const room = read(ROOM_SCREEN);
    for (const prop of ['result={room.result}', 'stats={stats}', 'viewer={room.viewer}', 'crowdMoment={crowdMoment}']) {
      assert.ok(room.includes(prop), `room screen no longer passes ${prop}`);
    }
  });
});
