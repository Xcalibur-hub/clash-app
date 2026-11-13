/**
 * Admission regression tests — which call becomes a participant.
 *
 * ## The blocker
 *
 * A signed-in non-member was offered "Join this clash". The join sheet routed the
 * tap to `upgradeToDebater`, and `upgrade_arena_spectator` refuses anyone without
 * a participant row with `join the room first` (42501). The tap could never
 * succeed.
 *
 * The cause is not a typo — it is that Watch and Upgrade were treated as one
 * operation. They are not:
 *
 *   · `watch_arena_room(p_room_id)`        — session only, NO stance, no capacity
 *   · `upgrade_arena_spectator(p_room_id, p_stance)` — session + spectator row, stance required
 *
 * These tests pin the five populations from the report, the distinct targets, and
 * the failure/retry behaviour.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  admissionFailureNotice,
  admissionFor,
  joinSheetMode,
  type AdmissionOperation,
} from '../utils/arenaAdmission.ts';
import {
  memberStanding,
  primaryRoomAction,
  type RoomPhase,
  type ViewerStanding,
} from '../utils/arenaRoomEligibility.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const code = (rel: string): string =>
  read(rel)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

const ROOM = 'app/arena/room/[roomId].tsx';

const signedOut: ViewerStanding = {
  kind: 'signed_out',
  role: null,
  hasSideVote: false,
  hasArgumentVote: false,
};
const nonMember: ViewerStanding = {
  kind: 'non_member',
  role: null,
  hasSideVote: false,
  hasArgumentVote: false,
};
const spectator = memberStanding('spectator');
const debater = memberStanding('debater');
const fullRoom = memberStanding('spectator', { roomFull: true });
const rejected = memberStanding('spectator', { roomFullOnUpgrade: true });

const PHASES: RoomPhase[] = ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING', 'SETTLED', 'CANCELLED'];

describe('1 — a signed-out viewer goes to authentication', () => {
  it('never offers watch or upgrade to someone with no session', () => {
    // `watch_arena_room`: `if v_user is null then raise 'sign in to watch a room'`.
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING'] as const) {
      const d = admissionFor(phase, signedOut);
      assert.equal(d.operation, 'authenticate', `${phase}: wrong operation`);
      assert.equal(d.target, 'auth');
      assert.equal(d.enabled, true);
    }
  });

  it('opens no sheet, because auth is a route not a dialog', () => {
    assert.equal(joinSheetMode(admissionFor('OPEN', signedOut)), 'closed');
  });
});

describe('2 — a signed-in non-member is admitted through watch_arena_room', () => {
  it('chooses watch, never upgrade', () => {
    // The blocker: upgrade requires a participant row that does not exist.
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING'] as const) {
      const d = admissionFor(phase, nonMember);
      assert.equal(d.operation, 'watch', `${phase}: non-member routed to ${d.operation}`);
      assert.notEqual(d.operation, 'upgrade');
    }
  });

  it('targets the watch confirm surface, not the stance sheet', () => {
    const d = admissionFor('OPEN', nonMember);
    assert.equal(d.target, 'watch_confirm');
    assert.notEqual(d.target, 'stance_sheet');
    assert.equal(joinSheetMode(d), 'watch');
  });

  it('agrees with the action region', () => {
    // Two surfaces, one decision. `primaryRoomAction` must point the same way, or
    // the CTA and the admission diverge again.
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING'] as const) {
      const offer = primaryRoomAction(phase, nonMember);
      assert.equal(offer.action, 'watch');
      assert.equal(offer.target, 'watch_confirm', `${phase}: CTA still points at the stance sheet`);
      assert.equal(admissionFor(phase, nonMember).enabled, offer.enabled);
    }
  });

  it('does not ask a non-member for a stance the RPC will never read', () => {
    /*
     * `watch_arena_room(p_room_id)` takes one parameter and there is nowhere to
     * put a stance — spectators store null by design. The service still *reads* a
     * `stance` field back out of the response (it parses whatever the server
     * returns, which is null here), so the assertion is on the **request payload**,
     * not on the word appearing anywhere in the function.
     */
    const service = read('services/liveArenaService.ts');
    const body = service.slice(service.indexOf('export async function watchRoom'));
    const fn = body.slice(0, body.indexOf('\n}\n') + 2);
    assert.match(fn, /p_room_id: roomId/, 'the watch RPC no longer sends a room id');
    // The rpc() argument object must carry the room id and nothing else.
    const payload = fn.slice(fn.indexOf(`rpc('watch_arena_room'`), fn.indexOf('if (error)'));
    assert.doesNotMatch(payload, /stance/i, 'the watch request now carries a stance');
  });
});

describe('3 — an existing spectator upgrades only when the server permits', () => {
  it('offers the stance sheet while the room is in play', () => {
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING'] as const) {
      const d = admissionFor(phase, spectator);
      assert.equal(d.operation, 'upgrade', `${phase}: spectator cannot upgrade`);
      assert.equal(d.target, 'stance_sheet');
      assert.equal(joinSheetMode(d), 'stance');
    }
  });

  it('never offers an upgrade to a non-member', () => {
    // The whole point.
    for (const phase of PHASES) {
      assert.notEqual(admissionFor(phase, nonMember).operation, 'upgrade', `${phase}`);
    }
  });
});

describe('4 — an existing debater is never asked to join again', () => {
  it('reports none with the already-a-member reason', () => {
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS'] as const) {
      const d = admissionFor(phase, debater);
      assert.equal(d.operation, 'none', `${phase}: a debater was offered admission`);
      assert.equal(d.enabled, false);
      assert.equal(d.block, 'already_member');
      assert.match(String(d.reason), /already arguing/i);
    }
  });

  it('opens no sheet for a debater', () => {
    for (const phase of PHASES) {
      assert.equal(joinSheetMode(admissionFor(phase, debater)), 'closed');
    }
  });
});

describe('5 — full, terminal and rejected states carry accurate messaging', () => {
  it('names a full room, and offers nothing', () => {
    const d = admissionFor('OPEN', fullRoom);
    assert.equal(d.enabled, false);
    assert.equal(d.block, 'full');
    assert.match(String(d.reason), /full/i);
    assert.equal(d.target, null);
  });

  it('names the P0009 rejection, which outranks a stale snapshot', () => {
    // The room may still report a free slot; the server has already said no.
    const stale = memberStanding('spectator', { roomFull: false, roomFullOnUpgrade: true });
    const d = admissionFor('OPEN', stale);
    assert.equal(d.block, 'full');
    assert.match(String(d.reason), /filled up/i);
  });

  it('names the terminal states distinctly', () => {
    assert.equal(admissionFor('SETTLED', spectator).block, 'settled');
    assert.equal(admissionFor('CANCELLED', spectator).block, 'cancelled');
    // ...and they are different messages, because the situations differ.
    assert.notEqual(
      admissionFor('SETTLED', spectator).reason,
      admissionFor('CANCELLED', spectator).reason,
    );
  });

  it('never enables an admission in a terminal phase, for anyone', () => {
    for (const standing of [signedOut, nonMember, spectator, debater, fullRoom, rejected]) {
      for (const phase of ['SETTLED', 'CANCELLED'] as const) {
        assert.equal(admissionFor(phase, standing).enabled, false, `${phase}: admission offered`);
      }
    }
  });

  it('agrees with the shared upgrade predicate in every state', () => {
    /*
     * `admissionFor` must not re-derive upgrade eligibility — that was the defect
     * an earlier review blocked on. This asserts it is exactly
     * `canUpgradeToDebater` for every spectator state.
     */
    const states: ViewerStanding[] = [
      spectator,
      fullRoom,
      rejected,
      memberStanding('spectator', { roomFull: false, roomFullOnUpgrade: true }),
    ];
    for (const phase of PHASES) {
      for (const standing of states) {
        const upgrade = admissionFor(phase, standing).operation === 'upgrade';
        const permitted = admissionFor(phase, standing).enabled && upgrade;
        if (permitted) {
          // If admission says upgrade, the model must agree.
          assert.equal(
            primaryRoomAction(phase, standing).action,
            'upgrade_to_debater',
            `${phase}: admission and action region disagree`,
          );
        }
      }
    }
  });
});

describe('invariants', () => {
  it('never enables an admission with no target or explains nothing when blocked', () => {
    const every: ViewerStanding[] = [signedOut, nonMember, spectator, debater, fullRoom, rejected];
    for (const phase of PHASES) {
      for (const standing of every) {
        const d = admissionFor(phase, standing);
        if (d.enabled) {
          assert.ok(d.target !== null, `${phase}: enabled admission has no target`);
          assert.equal(d.reason, null);
          assert.equal(d.block, null);
        } else {
          assert.equal(d.target, null, `${phase}: blocked admission names a target`);
          assert.ok(d.reason !== null, `${phase}: blocked admission explains nothing`);
          assert.ok(d.block !== null, `${phase}: blocked admission names no block`);
        }
      }
    }
  });

  it('only ever returns a known operation', () => {
    const known: AdmissionOperation[] = ['authenticate', 'watch', 'upgrade', 'none'];
    for (const phase of PHASES) {
      for (const standing of [signedOut, nonMember, spectator, debater]) {
        assert.ok(known.includes(admissionFor(phase, standing).operation));
      }
    }
  });

  it('offers each population a distinct operation', () => {
    // The four populations must not collapse into one another — collapsing them is
    // what let a non-member reach the upgrade call.
    const ops = new Set([
      admissionFor('OPEN', signedOut).operation,
      admissionFor('OPEN', nonMember).operation,
      admissionFor('OPEN', spectator).operation,
      admissionFor('OPEN', debater).operation,
    ]);
    assert.equal(ops.size, 4, `populations collapsed: ${[...ops].join(', ')}`);
  });

  it('gives every failure a retry-safe notice', () => {
    // A failure must not strand the viewer: the copy says what happened, and the
    // offer stays in place because admission is retryable.
    for (const kind of ['full', 'auth', 'generic'] as const) {
      const notice = admissionFailureNotice(kind);
      assert.ok(notice.length > 0);
      assert.doesNotMatch(notice, /permanently|no longer possible/i);
    }
  });
});

describe('the screen routes each operation to its own handler', () => {
  it('has a watch branch that does not open the stance sheet', () => {
    const room = code(ROOM);
    const start = room.indexOf("target === 'watch_confirm'");
    assert.ok(start > -1, 'no watch_confirm branch');
    /*
     * Scope the slice to the branch itself. A fixed-width window runs past the
     * closing brace into the next branch and would report a false positive — the
     * bug this test exists to catch must be the *only* reason it can fail.
     */
    const body = room.slice(start, room.indexOf('return;', start));
    assert.match(body, /setWatchOpen\(true\)/, 'the watch branch does not open its own sheet');
    assert.doesNotMatch(body, /setJoinOpen/, 'the watch branch opens the upgrade sheet');
  });

  it('keeps the stance sheet for upgrades only', () => {
    const room = code(ROOM);
    // The join sheet's handler calls the upgrade RPC; nothing else may reach it.
    const joinStart = room.indexOf('<JoinDebateSheet');
    const joinSheet = room.slice(joinStart, room.indexOf('\n      />', joinStart));
    assert.match(joinSheet, /upgradeToDebater/, 'the stance sheet no longer upgrades');
    assert.doesNotMatch(joinSheet, /watchAsSpectator/, 'the stance sheet was rerouted to watch');
  });

  it('mounts the watch sheet with the watch operation', () => {
    const room = code(ROOM);
    const start = room.indexOf('<WatchRoomSheet');
    assert.ok(start > -1, 'WatchRoomSheet is not mounted');
    // Bounded by the JSX element's own closing tag, not by a character count.
    const block = room.slice(start, room.indexOf('\n      />', start));
    assert.match(block, /watchAsSpectator/, 'the watch sheet does not call watch_arena_room');
    assert.doesNotMatch(block, /upgradeToDebater/, 'the watch sheet calls the upgrade RPC');
  });

  it('keeps the sheet open on failure so the attempt can be retried', () => {
    const room = code(ROOM);
    const start = room.indexOf('<WatchRoomSheet');
    const block = room.slice(start, room.indexOf('\n      />', start));
    // Closing on failure would strand the viewer with no way back to the action.
    assert.match(block, /if \(ok\)/, 'the sheet closes regardless of outcome');
    assert.match(block, /setWatchOpen\(false\)/);
  });

  it('has a retry path exposed by the hook', () => {
    const hook = read('hooks/useLiveArenaRoom.ts');
    assert.match(hook, /watchAsSpectator/, 'no admission operation on the hook');
    assert.match(hook, /watchFailed/, 'a failed admission is not observable');
    // The operation must call the watch RPC, not the upgrade RPC.
    //
    // Bounded by the callback's own dependency array rather than a character
    // count: a fixed window silently starts covering the *next* callback as soon
    // as this one grows, which makes the assertion pass or fail for the wrong
    // reason.
    const start = hook.indexOf('const watchAsSpectator');
    const body = hook.slice(start, hook.indexOf('}, [', start));
    assert.match(body, /watchRoom\(/, 'the admission operation does not call watch_arena_room');
    assert.doesNotMatch(body, /upgradeSpectator/, 'the admission operation calls the upgrade RPC');
  });
});
