/**
 * Arena hierarchy contract.
 *
 * These are not style tests. They pin the *information architecture* that makes
 * the redesign coherent: which region comes first, how loud each one is, and that
 * fighter / spectator / judge experiences actually differ rather than sharing one
 * generic room layout.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  needsActionRegion,
  REGION_ORDER,
  roomPhaseForTopicPhase,
  arenaRegionPlan,
  floorIsCrowd,
  permittedAction,
  phaseHeadline,
  primaryActionRegion,
  type ArenaHierarchyInput,
  type RoomPhase,
} from '../utils/arenaHierarchy.ts';

const PHASES: RoomPhase[] = ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING', 'SETTLED', 'CANCELLED'];

describe('Arena hierarchy', () => {
  it('always leads with the phase', () => {
    for (const phase of PHASES) {
      for (const role of ['debater', 'spectator'] as const) {
        const plan = arenaRegionPlan({ phase, role });
        if (plan.length === 0) continue;
        assert.equal(plan[0].region, 'phase', `${phase}/${role} does not open with the phase`);
      }
    }
  });

  it('never presents a settled room without its result', () => {
    for (const role of ['debater', 'spectator'] as const) {
      const plan = arenaRegionPlan({ phase: 'SETTLED', role });
      const result = plan.find((p) => p.region === 'result');
      assert.ok(result, `${role}: settled room has no result region`);
      assert.equal(result.emphasis, 3, 'the verdict must outrank everything else');
    }
  });

  it('offers a spectator the upgrade they can actually take, and nothing when full', () => {
    /*
     * The Phase 2 version of this test asserted that a spectator in
     * FINAL_ARGUMENTS could never act, and that the action region therefore had to
     * be absent. That premise was itself the bug: `upgrade_arena_spectator` permits
     * a spectator to join the debate while `status in ('OPEN','FINAL_ARGUMENTS',
     * 'JUDGING')` and the room is not full. The UI hid a control the server would
     * have accepted.
     *
     * Coverage is widened, not narrowed: the offer must now exist when it is legal
     * and must disappear when the room is full.
     */
    const open = { phase: 'FINAL_ARGUMENTS', role: 'spectator' } as const;
    assert.equal(permittedAction(open), 'join_side');
    assert.equal(arenaRegionPlan(open).some((p) => p.region === 'action'), true);

    const full = { phase: 'FINAL_ARGUMENTS', role: 'spectator', roomFull: true } as const;
    assert.equal(permittedAction(full), 'watch');
    assert.equal(arenaRegionPlan(full).some((p) => p.region === 'action'), false);
    // A full room also removes the OPEN-phase invitation, for the same reason.
    assert.equal(permittedAction({ phase: 'OPEN', role: 'spectator', roomFull: true }), 'watch');
  });

  it('states the exclusion during JUDGING instead of leaving a silent gap', () => {
    /*
     * Phase 2 treated JUDGING like FINAL_ARGUMENTS and dropped the region for
     * spectators. The review showed why that is wrong: "you may not vote" and "the
     * app failed to render your ballot" look identical when nothing is drawn.
     *
     * The region is therefore present, and `permittedAction` stays `watch` — the
     * region renders a sentence, not a control. Both halves are asserted so neither
     * can regress into the other defect.
     */
    const spectator = { phase: 'JUDGING', role: 'spectator' } as const;
    assert.equal(needsActionRegion(spectator), true, 'JUDGING must explain itself to a spectator');
    assert.equal(
      permittedAction(spectator),
      'watch',
      'explaining the exclusion must not become advertising a ballot',
    );
    assert.equal(arenaRegionPlan(spectator).some((p) => p.region === 'action'), true);

    // ...while a debater who still holds a ballot gets the real offer.
    assert.equal(permittedAction({ ...spectator, role: 'debater', isMember: true }), 'vote');
  });

  it('gives a fighter the floor action during open and final arguments', () => {
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS'] as const) {
      const input: ArenaHierarchyInput = { phase, role: 'debater' };
      assert.equal(primaryActionRegion(input), 'action', `${phase}: fighter has no primary action`);
    }
  });

  it('distinguishes the fighter and spectator experiences before settlement', () => {
    // Same phase, different role. Before a verdict the two must not be the same
    // screen with different strings: either the region plan or the permitted
    // action has to differ, or "distinct experiences" is cosmetic.
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING', 'CANCELLED'] as const) {
      const fighter = arenaRegionPlan({ phase, role: 'debater', mayJudge: true });
      const spectator = arenaRegionPlan({ phase, role: 'spectator', mayJudge: true });
      const samePlan = JSON.stringify(fighter) === JSON.stringify(spectator);
      const sameAction =
        permittedAction({ phase, role: 'debater', mayJudge: true }) ===
        permittedAction({ phase, role: 'spectator', mayJudge: true });
      assert.ok(!samePlan || !sameAction, `${phase}: fighter and spectator see the identical screen`);
    }
    assert.equal(floorIsCrowd('spectator'), true);
    assert.equal(floorIsCrowd('debater'), false);
  });

  it('shows fighters the official transcript and spectators the crowd', () => {
    const fighter = arenaRegionPlan({ phase: 'OPEN', role: 'debater' }).find((p) => p.region === 'floor');
    const spectator = arenaRegionPlan({ phase: 'OPEN', role: 'spectator' }).find((p) => p.region === 'floor');
    assert.equal(fighter?.floor, 'transcript');
    assert.equal(spectator?.floor, 'crowd');
    assert.notEqual(fighter?.lens, spectator?.lens);
  });

  it('treats the verdict as one fact for everyone', () => {
    // Deliberate: a result is not personalised. If these ever diverge, someone
    // has started rendering a different outcome to different roles.
    const fighter = arenaRegionPlan({ phase: 'SETTLED', role: 'debater' });
    const spectator = arenaRegionPlan({ phase: 'SETTLED', role: 'spectator' });
    assert.deepEqual(fighter, spectator);
    assert.equal(fighter.find((p) => p.region === 'result')?.lens, 'verdict');
  });

  it('never allows more than one primary action', () => {
    for (const phase of PHASES) {
      for (const role of ['debater', 'spectator'] as const) {
        for (const mayJudge of [true, false]) {
          const region = primaryActionRegion({ phase, role, mayJudge });
          const plan = arenaRegionPlan({ phase, role, mayJudge });
          const weight3 = plan.filter((p) => p.emphasis === 3 && p.region === 'action');
          assert.ok(weight3.length <= 1, `${phase}/${role}: ${weight3.length} action regions at max emphasis`);
          if (phase !== 'OPEN' && phase !== 'JUDGING' && phase !== 'FINAL_ARGUMENTS') {
            assert.notEqual(region, 'action', `${phase}: no action expected`);
          }
        }
      }
    }
  });

  it('respects the documented region order', () => {
    for (const phase of PHASES) {
      for (const role of ['debater', 'spectator'] as const) {
        const idx = arenaRegionPlan({ phase, role }).map((p) => REGION_ORDER.indexOf(p.region));
        const sorted = [...idx].sort((a, b) => a - b);
        assert.deepEqual(idx, sorted, `${phase}/${role} violates ${REGION_ORDER.join(' → ')}`);
      }
    }
  });

  it('gives a signed-out viewer no action at all', () => {
    assert.equal(permittedAction({ phase: 'OPEN', role: 'spectator', signedIn: false }), 'watch');
    const plan = arenaRegionPlan({ phase: 'OPEN', role: 'spectator', signedIn: false });
    assert.equal(plan.some((p) => p.region === 'action'), false);
  });

  it('names the phase differently for fighters and spectators where it matters', () => {
    assert.equal(phaseHeadline('OPEN', 'debater'), 'THE FLOOR IS YOURS');
    assert.equal(phaseHeadline('OPEN', 'spectator'), 'THE FLOOR IS OPEN');
    // ...but the result is the result for everyone.
    assert.equal(phaseHeadline('SETTLED', 'debater'), phaseHeadline('SETTLED', 'spectator'));
  });

  it('only offers "next clash" when one exists', () => {
    assert.equal(permittedAction({ phase: 'SETTLED', role: 'spectator', hasNextClash: true }), 'start_next');
    assert.equal(permittedAction({ phase: 'SETTLED', role: 'spectator', hasNextClash: false }), 'watch');
  });

  it('keeps a cancelled room terminal', () => {
    assert.equal(permittedAction({ phase: 'CANCELLED', role: 'debater' }), 'none');
    assert.equal(primaryActionRegion({ phase: 'CANCELLED', role: 'debater' }), null);
  });
});

describe('topic phase mapping', () => {
  it('never labels a topic in judging as an open floor', () => {
    assert.equal(roomPhaseForTopicPhase('judging'), 'JUDGING');
    assert.notEqual(roomPhaseForTopicPhase('judging'), 'OPEN');
  });

  it('maps every topic phase onto the room vocabulary', () => {
    for (const p of ['scheduled', 'open', 'final_arguments', 'judging', 'closed'] as const) {
      assert.ok(typeof roomPhaseForTopicPhase(p) === 'string');
    }
    assert.equal(roomPhaseForTopicPhase('final_arguments'), 'FINAL_ARGUMENTS');
    assert.equal(roomPhaseForTopicPhase('closed'), 'SETTLED');
  });
});
