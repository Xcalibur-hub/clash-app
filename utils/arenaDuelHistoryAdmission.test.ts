/**
 * Settled-duel history admission — the P1 regression, stated as tests.
 *
 * ## The defect
 *
 * A canonical settled duel renders a "Watch Clash" button, because
 * `duelPresentation().canWatch` is `duel.status === 'settled' || …`. Tapping it
 * called `watchAsSpectator()`, which refused SETTLED *before invoking the RPC*.
 *
 * But `watch_arena_room` explicitly permits settled history:
 *
 *     -- Scheduled topics stay private. Closed topics may still be watched if the
 *     -- room settled (public result). Cancelled rooms are not watchable.
 *     if v_room.status = 'CANCELLED' then
 *       raise exception 'this room is not available' using errcode = 'P0003';
 *
 * CANCELLED is the *only* status the function refuses. The frontend was stricter
 * than the database, so it hid a capability the server grants — which is the
 * mirror image of the earlier defect where it advertised one the server denies.
 * Both are the same class: UI eligibility drifting from the SQL contract.
 *
 * ## Why the guard existed
 *
 * It was added for a good reason — a settled room's next step is the result, and
 * offering admission there is usually noise. That reasoning is correct for a
 * *group* room, where a settled room shows the verdict to everyone already. It is
 * wrong for a canonical duel opened as history, where admission is the only way
 * to read the transcript at all.
 *
 * So the fix is not "delete the guard". It is: settle the distinction the SQL
 * makes, and let the *caller's* intent decide whether a settled room is a place to
 * view history or a place where the result is already on screen.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { admissionFor, joinSheetMode } from '../utils/arenaAdmission.ts';
import { canWatchRoom, memberStanding, type ViewerStanding } from '../utils/arenaRoomEligibility.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

const nonMember: ViewerStanding = {
  kind: 'non_member',
  role: null,
  hasSideVote: false,
  hasArgumentVote: false,
};
const spectator = memberStanding('spectator');

describe('SQL contract — only CANCELLED is unwatchable', () => {
  it('permits watching a settled room', () => {
    // The migration's own comment: "Closed topics may still be watched if the
    // room settled (public result)."
    assert.equal(canWatchRoom('SETTLED'), true);
  });

  it('refuses a cancelled room', () => {
    assert.equal(canWatchRoom('CANCELLED'), false);
  });

  it('permits every live phase', () => {
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING'] as const) {
      assert.equal(canWatchRoom(phase), true, `${phase}: live phase refused`);
    }
  });
});

describe('admission — a settled room admits history viewers', () => {
  it('offers a non-member spectator admission in a settled room', () => {
    /*
     * This is the regression. It previously returned `blocked(..., 'settled')`
     * for every standing, before it ever considered membership.
     */
    const d = admissionFor('SETTLED', nonMember, { historyView: true });
    assert.equal(d.operation, 'watch', `got ${d.operation}, expected watch`);
    assert.equal(d.target, 'watch_confirm');
    assert.equal(d.enabled, true);
    assert.equal(joinSheetMode(d), 'watch');
  });

  it('keeps the block for a cancelled room', () => {
    const d = admissionFor('CANCELLED', nonMember);
    assert.equal(d.enabled, false);
    assert.equal(d.block, 'cancelled');
    assert.equal(d.operation, 'none');
  });

  it('does not turn a settled room into an upgrade opportunity', () => {
    /*
     * A member spectator in a settled room must NOT be offered the upgrade:
     * `upgrade_arena_spectator` raises "this room is no longer accepting
     * debaters" outside OPEN/FINAL_ARGUMENTS/JUDGING. Watching is fine; joining
     * the debate is not.
     */
    const d = admissionFor('SETTLED', spectator);
    assert.notEqual(d.operation, 'upgrade');
  });

  it('still requires authentication in a settled room', () => {
    // `watch_arena_room`: `if v_user is null then raise 'sign in to watch a room'`.
    const d = admissionFor(
      'SETTLED',
      { kind: 'signed_out', role: null, hasSideVote: false, hasArgumentVote: false },
      { historyView: true },
    );
    assert.equal(d.operation, 'authenticate');
    assert.equal(d.target, 'auth');
  });
});

describe('group rooms are not changed by this fix', () => {
  it('still treats a settled group room as decided, not as an admission point', () => {
    /*
     * A settled GROUP room already shows its verdict to everyone, so admission
     * there is noise rather than access. The distinction is made by the caller —
     * the room screen passes `historyView` only for a canonical duel — so the
     * default must stay blocked.
     */
    const d = admissionFor('SETTLED', nonMember);
    // Default (no intent flag) preserves the previous group behaviour...
    assert.equal(d.block, 'settled');
    // ...and only an explicit history view unlocks it.
    const history = admissionFor('SETTLED', nonMember, { historyView: true });
    assert.equal(history.operation, 'watch');
    assert.equal(history.enabled, true);
  });

  it('does not accept the history flag for a cancelled room', () => {
    // Intent cannot override the server. CANCELLED stays closed either way.
    const d = admissionFor('CANCELLED', nonMember, { historyView: true });
    assert.equal(d.enabled, false);
    assert.equal(d.block, 'cancelled');
  });

  it('does not accept the history flag for an upgrade either', () => {
    // `upgrade_arena_spectator` refuses a settled room regardless of intent.
    const d = admissionFor('SETTLED', spectator, { historyView: true });
    assert.notEqual(d.operation, 'upgrade');
  });
});

describe('preserved: watch still refreshes the transcript', () => {
  it('keeps the refresh chain on the admission operation', () => {
    /*
     * Requirement 4 of the fix: the null-initial-cursor path must survive. A
     * history viewer's first thread read was refused too, so the same obligation
     * applies — `refreshThread` before `load('refresh')`.
     */
    const hook = read('hooks/useLiveArenaRoom.ts');
    const start = hook.indexOf('const watchAsSpectator');
    const body = hook.slice(start, hook.indexOf('}, [', start));
    assert.match(body, /await refreshThread\(/, 'transcript refresh removed');
    assert.match(body, /await load\('refresh'/, 'room refresh removed');
    assert.ok(
      body.indexOf('await refreshThread(') < body.indexOf("await load('refresh'"),
      'refresh order inverted — cursor recovery must run first',
    );
  });

  it('no longer refuses SETTLED before the RPC', () => {
    /*
     * The call-time guard added in the previous branch refused SETTLED and
     * CANCELLED unconditionally. SETTLED must now fall through to
     * `watch_arena_room`, which permits it.
     */
    const hook = read('hooks/useLiveArenaRoom.ts');
    const start = hook.indexOf('const watchAsSpectator');
    // The callback's dependency array is the only reliable end marker: the
    // signature itself now contains `[`, and a fixed window drifts.
    const body = hook.slice(start, hook.indexOf('}, [', start + 200));
    const guardAt = body.indexOf('const decision = admissionFor(');
    const rpcAt = body.indexOf('await watchRoom(');
    assert.ok(guardAt > -1, 'the call-time guard was removed entirely');
    assert.ok(rpcAt > guardAt, 'the guard must precede the RPC');
    // The guard must consult the model with the caller's intent, rather than
    // testing status literals — which is what refused SETTLED unconditionally.
    const guard = body.slice(guardAt, rpcAt);
    assert.match(guard, /intent/, 'the guard ignores the caller intent');
    assert.doesNotMatch(guard, /status === 'SETTLED'/, 'the guard still hard-codes SETTLED');
  });
});
