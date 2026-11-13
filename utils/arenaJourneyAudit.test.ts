/**
 * Connected user-journey regressions — the Phase 1 defects and their neighbours.
 *
 * ## Why this file exists
 *
 * Every review so far has been blocked by a defect that unit tests could not see,
 * because the tests exercised *functions* while the bug lived in the *wiring*
 * between them. The clearest example: `watch_arena_room` was called correctly and
 * its result applied correctly, and the screen still showed an empty room, because
 * nothing reloaded the transcript afterwards.
 *
 * So these tests fall into two kinds, and both are needed:
 *
 *   · **decision tests** on the pure modules the hook and screen consult, and
 *   · **connection tests** asserting the call sites actually consult them, in the
 *     right order.
 *
 * A decision test alone would have passed while the product was broken, which is
 * exactly the failure mode being corrected.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admissionFor } from '../utils/arenaAdmission.ts';
import { admissionSyncSteps, owesCursorRecovery } from '../utils/arenaAdmissionRefresh.ts';
import { memberStanding, type ViewerStanding } from '../utils/arenaRoomEligibility.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose describing a defect is not matched. */
function code(rel: string): string {
  return read(rel)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

const HOOK = 'hooks/useLiveArenaRoom.ts';
const ROOM = 'app/arena/room/[roomId].tsx';

const spectator = memberStanding('spectator');
const nonMember: ViewerStanding = {
  kind: 'non_member',
  role: null,
  hasSideVote: false,
  hasArgumentVote: false,
};

describe('defect 1 — a successful Watch loads the conversation', () => {
  it('performs a transcript refresh before the room refresh', () => {
    // Both are required. `refreshThread` owns cursor recovery (including the
    // null-initial-cursor case), and `load('refresh')` re-reads room/rail/rollups
    // but never repairs cursors.
    assert.deepEqual(admissionSyncSteps(), ['refresh_thread', 'load_refresh']);
  });

  it('owes cursor recovery when the pre-admission read was refused', () => {
    /*
     * A non-member's thread request is rejected with 42501, so no page was ever
     * accepted: `messageCursor` is null. If that obligation is not discharged on
     * admission, the gap drain (`if (messageCursor.current)`) is skipped forever
     * and realtime inserts after joining are never filled in.
     */
    assert.equal(
      owesCursorRecovery({ hasMessageCursor: false, hasInitialCoverage: false, wasRefused: true }),
      true,
    );
    // A retained, unacknowledged window is the same obligation without the flag.
    assert.equal(
      owesCursorRecovery({ hasMessageCursor: false, hasInitialCoverage: true, wasRefused: false }),
      true,
    );
    // Nothing owed once a cursor exists.
    assert.equal(
      owesCursorRecovery({ hasMessageCursor: true, hasInitialCoverage: true, wasRefused: true }),
      false,
    );
  });

  it('calls both steps after a successful watch_arena_room, in order', () => {
    /*
     * The regression this pins: the original `watchAsSpectator` set `room` and
     * returned. It never reloaded the transcript, and `load('initial')` only fires
     * on a `roomId` change — which joining a room does not cause.
     */
    const hook = code(HOOK);
    const start = hook.indexOf('const watchAsSpectator');
    assert.ok(start > -1, 'watchAsSpectator is gone');
    const body = hook.slice(start, hook.indexOf('}, [', start));

    const watchAt = body.indexOf('await watchRoom(');
    const threadAt = body.indexOf('await refreshThread(');
    const loadAt = body.indexOf("await load('refresh'");

    assert.ok(watchAt > -1, 'admission no longer calls watch_arena_room');
    assert.ok(threadAt > watchAt, 'no transcript refresh after admission');
    assert.ok(loadAt > threadAt, "room refresh must follow the transcript refresh");
  });

  it('does not rely on the room-id effect to pick the change up', () => {
    // Documenting the mechanism: that effect is keyed on `roomId`, so it cannot
    // fire when a viewer joins a room they are already looking at.
    const hook = code(HOOK);
    assert.match(hook, /\}, \[roomId\]\);/);
    assert.match(hook, /void loadRef\.current\('initial', session\)/);
  });
});

describe('defect 2 — confirmation expires with the room', () => {
  it('treats a terminal phase as unavailable for every standing', () => {
    for (const phase of ['SETTLED', 'CANCELLED'] as const) {
      for (const standing of [nonMember, spectator]) {
        const d = admissionFor(phase, standing);
        assert.equal(d.enabled, false, `${phase}: admission still offered`);
        assert.ok(d.reason !== null, `${phase}: no reason given`);
      }
    }
  });

  it('re-derives the block from live state rather than the open flag', () => {
    /*
     * `watchOpen` records that the sheet was opened. It cannot know the room
     * settled while the viewer was reading it. The screen must consult the model
     * on every render, which is what `watchBlockedReason` does.
     */
    const room = code(ROOM);
    assert.match(room, /const admission = React\.useMemo/, 'no live admission derivation');
    assert.match(room, /admissionFor\(room\.status/, 'the derivation ignores the phase');
    assert.match(room, /watchBlockedReason/, 'the sheet is not given a live block reason');
  });

  it('passes the reason into the sheet and withdraws the control', () => {
    const sheet = code('components/liveArena/WatchRoomSheet.tsx');
    assert.match(sheet, /blockedReason/, 'the sheet cannot be told it is blocked');
    // No control at all when blocked — a disabled button still invites the tap.
    assert.match(sheet, /\{blocked \? \(/, 'the blocked branch does not remove the control');
    // ...and the handler cannot fire even if a tap slips through.
    assert.match(sheet, /if \(disabled\) return;/, 'a blocked tap is not guarded');
  });

  it('closes the sheet once admission stops being an option', () => {
    const room = code(ROOM);
    assert.match(
      room,
      /admission\.operation !== 'watch'\) setWatchOpen\(false\)/,
      'the sheet stays open after the viewer becomes a member',
    );
  });
});

describe('defect 3 — one control per operation', () => {
  it('leaves the upgrade to the action region alone', () => {
    /*
     * Three surfaces offered it: the action region, the docked join bar, and the
     * empty-floor stage. All three are visible at once on an empty room, which is
     * the worst case for a duplicate primary action.
     */
    const room = code(ROOM);
    // Stronger than a `canUpgrade={false}` prop: the capability is gone from the
    // component, so no future caller can re-enable a second upgrade control by
    // flipping a boolean.
    assert.doesNotMatch(room, /onJoinDebate/, 'the empty floor still wires an upgrade handler');
    assert.doesNotMatch(
      read('components/liveArena/LiveRoomEmptyFloor.tsx'),
      /onJoinDebate|canUpgrade/,
      'the empty floor still accepts upgrade props',
    );
    assert.match(room, /<ActionRegion/, 'the canonical owner is not mounted');
  });

  it('removes the join bar CTA without removing its information', () => {
    /*
     * Scope to the `SpectatorJoinBar` function only. The same file also exports
     * `JoinDebateSheet` and `StanceChoice`, which legitimately render buttons —
     * a whole-file assertion would fail on those and prove nothing about the bar.
     */
    const file = code('components/liveArena/SpectatorJoinBar.tsx');
    const from = file.indexOf('export function SpectatorJoinBar');
    const to = file.indexOf('export interface JoinDebateSheetProps');
    const bar = file.slice(from, to);
    assert.ok(from > -1 && to > from, 'could not isolate SpectatorJoinBar');
    assert.doesNotMatch(bar, /accessibilityRole="button"/, 'the bar still renders a control');
    assert.doesNotMatch(bar, /Pressable/, 'the bar still renders a pressable');
    // The standing and the reason must survive — that is the bar's remaining job.
    assert.match(bar, /WATCHER/, 'the bar no longer states the viewer standing');
    assert.match(bar, /canUpgradeToDebater/, 'the bar no longer reports eligibility');
    assert.match(bar, /filled up/, 'the bar no longer explains capacity');
  });

  it('keeps exactly one admission trigger for a non-member', () => {
    // The action region is the only thing that opens the watch sheet.
    const room = code(ROOM);
    const watchOpens = (room.match(/setWatchOpen\(true\)/g) ?? []).length;
    assert.equal(watchOpens, 1, `${watchOpens} places open the watch sheet`);
  });

  it('keeps exactly one upgrade trigger', () => {
    // ...and one place opens the stance sheet, reached only by the upgrade offer.
    const room = code(ROOM);
    const joinOpens = (room.match(/setJoinOpen\(true\)/g) ?? []).length;
    assert.equal(joinOpens, 1, `${joinOpens} places open the stance sheet`);
  });
});

describe('defect 4 — Windows line endings', () => {
  it('normalises before scanning instead of relaxing the assertion', () => {
    const hygiene = read('utils/auraHygiene.test.ts');
    assert.match(hygiene, /function readNormalised/, 'no normalisation helper');
    assert.match(hygiene, /replace\(\/\\r\\n\/g, '\\n'\)/, 'CRLF is not stripped');
    // The assertions themselves must be intact.
    assert.match(hygiene, /line !== line\.trimEnd\(\)/, 'the trailing-whitespace rule was weakened');
    assert.match(hygiene, /line\.trim\(\) === ''/, 'the whitespace-only rule was weakened');
    // And both scans must actually use it.
    const uses = (hygiene.match(/readNormalised\(file\)/g) ?? []).length;
    assert.equal(uses, 2, `only ${uses} of 2 scans normalise line endings`);
  });

  it('forces LF in the working tree for every platform', () => {
    const attrs = read('.gitattributes');
    assert.match(attrs, /\* text=auto eol=lf/, 'no repo-wide LF rule');
    assert.match(attrs, /\*\.png binary/, 'binary assets are not protected');
  });
});

describe('journey regressions found during the audit', () => {
  it('unlocks the thread, not just the room, after admission', () => {
    // `threadLocked` is cleared by `load` and `refreshThread`. Both now run, so a
    // new spectator sees the conversation instead of "Join this room to read…".
    const hook = code(HOOK);
    assert.match(hook, /setThreadLocked\(false\)/);
    const start = hook.indexOf('const watchAsSpectator');
    const body = hook.slice(start, hook.indexOf('}, [', start));
    assert.match(body, /refreshThread/, 'the unlocking path is not called after admission');
  });

  it('routes the duel experience through the same admission operation', () => {
    /*
     * The duel path called `watchRoom` directly and then `refresh()`. Both steps
     * were right — `refresh()` is `refreshThread` then `load('refresh')` — but the
     * call bypassed the error/retry state, so a refused admission in a duel
     * produced an unhandled rejection instead of a notice. One operation, one path.
     */
    const room = code(ROOM);
    const start = room.indexOf('onWatch={');
    assert.ok(start > -1, 'the duel experience lost its admission handler');
    const body = room.slice(start, room.indexOf('onBack=', start));
    /*
     * The duel path passes its intent. `{ historyView }` is what tells the model
     * this tap is a request to read settled history — the SQL permits watching a
     * settled duel, and without the intent the shared operation would refuse the
     * very action the screen advertises.
     */
    assert.match(
      body,
      /watchAsSpectator\(\{ historyView \}\)/,
      'the duel path bypasses the shared operation',
    );
    assert.doesNotMatch(body, /watchRoom\(/, 'the duel path still calls the RPC raw');
  });

  it('re-checks phase at call time, not only at render time', () => {
    /*
     * A tap can land in the same tick as a phase change, before React re-renders
     * the blocked sheet. Without a call-time check the stale tap reaches
     * `watch_arena_room`, and the server's rejection is reported as a generic
     * failure instead of "this room closed".
     */
    const hook = code(HOOK);
    const start = hook.indexOf('const watchAsSpectator');
    const body = hook.slice(start, hook.indexOf('}, [', start));
    assert.match(body, /roomRef\.current/, 'no call-time state read');
    /*
     * The guard used to special-case `SETTLED` (and `CANCELLED`) inline. That was
     * too strict in one direction — a settled canonical duel is history the SQL
     * lets a spectator watch — and too loose in another: anything it did not name
     * fell through to the RPC. It now asks the same model the screen renders from,
     * passing the caller's intent, so eligibility cannot drift from the contract
     * in either direction. Pin the delegation, not a status list.
     */
    assert.match(body, /admissionFor\(/, 'the call-time guard does not consult the model');
    assert.match(body, /intent/, 'the caller intent is not passed to the model');
    assert.doesNotMatch(
      body,
      /current\.status === '(SETTLED|CANCELLED)'/,
      'the guard hardcodes a status the model already owns',
    );
    // The refusal must come *before* the RPC, or it guards nothing.
    const guardAt = body.indexOf('!decision.enabled');
    const rpcAt = body.indexOf('await watchRoom(');
    assert.ok(guardAt > -1 && rpcAt > guardAt, 'the guard runs after the RPC');
  });

  it('never reports success for an admission it did not perform', () => {
    // Returning true for an existing member would make the caller close the sheet
    // and report success for an admission that never happened — and a member
    // spectator would wrongly believe they had become a debater.
    const hook = code(HOOK);
    const start = hook.indexOf('const watchAsSpectator');
    const body = hook.slice(start, hook.indexOf('}, [', start));
    /*
     * Scope to the enclosing `if` block by counting braces. An `indexOf('}')` slice
     * stops at the first inner brace — `if (mounted.current) {` — which truncates
     * the branch before its `return` and makes the assertion meaningless.
     */
    const open = body.indexOf('if (current.viewer != null) {');
    assert.ok(open > -1, 'the already-member guard is gone');
    let depth = 0;
    let close = open;
    for (let i = body.indexOf('{', open); i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    const branch = body.slice(open, close);
    assert.match(branch, /return false/, 'an already-member call reports success');
    assert.doesNotMatch(branch, /return true/, 'an already-member call claims success');
  });

  it('keeps the membership refusal path intact', () => {
    // A 42501 during a later read must still clear the private thread rather than
    // showing rows the caller may no longer read.
    const hook = code(HOOK);
    assert.match(hook, /if \(isMembershipRefusal\(caught\)\) clearPrivateThread\(\)/);
  });

  it('records the final stance optimistically from the server response', () => {
    // Journey F: the result surface must reflect a recorded stance without a
    // refetch, or the prompt reappears after the viewer already answered.
    const hook = code(HOOK);
    const start = hook.indexOf('const recordFinal = ');
    const body = hook.slice(start, hook.indexOf('const upgradeToDebater', start));
    assert.match(body, /finalStance: result\.finalStance/, 'the stance is not applied locally');
    assert.match(body, /finalRecordedAt: result\.finalRecordedAt/);
  });

  it('applies a side ballot result to the viewer immediately', () => {
    // Journey E: the judging panel must flip to "recorded" without a reload.
    const hook = code(HOOK);
    const start = hook.indexOf('const voteSide = ');
    const body = hook.slice(start, start + 1600);
    assert.match(body, /hasSideVote: true/, 'the ballot result is not reflected');
  });
});
