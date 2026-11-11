'use strict';
/**
 * Deterministic regression tests for Duel #9 acceptance gate fixes:
 * - Zero stale-coordinate second tap after voting control vanishes
 * - Post-vote locked-in + disabled/absent control + juror_id DB proof + optional API probe
 * - Positive settled A50 UI verdict proof + binary-valid PNG + fail-closed COMPLETE gating
 */
const test = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const votingGuard = require('./lib/arena-native-voting-guard.cjs');
const settledGuard = require('./lib/arena-settled-verdict-guard.cjs');
const phases = require('./lib/arena-live-phases.cjs');
const { finalizeAcceptanceVerdict } = require('./run-live-arena-acceptance.cjs');

const ROOM_ID = 'ar_target_999900001111';
const CLASH_ID = 'cl_target_999900001111';
const STALE_ROOM_ID = 'ar_f8c0aa6960f7b878';
const STALE_CLASH_ID = 'cl_35eb151dd7c85fa8';
const ACTOR_C = 'u_64ad1836fba14aa299af81d0492178af';
const ACTOR_D = 'u_8b5fd32553bb4823925351be3e71bda4';
const TOPIC = 'Fictional QA debate: Clear evidence matters more than popularity.';
const PROP = 'Evidence should guide a technical debate.';

const VALID_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0x00, 0x00, 0x00, 0x0d]), Buffer.from('IHDR'),
  Buffer.from([0x00, 0x00, 0x04, 0x38, 0x00, 0x00, 0x09, 0x24, 0x08, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Buffer.from([0x00, 0x00, 0x00, 0x04]), Buffer.from('IDAT'), Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]),
  Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from('IEND'), Buffer.from([0xae, 0x42, 0x60, 0x82]),
]);

const JUDGING_XML = `<hierarchy rotation="0">
  <node resource-id="arena-room:${ROOM_ID}:${CLASH_ID}:open:judging" content-desc="" text="" bounds="[0,0][1080,2340]">
    <node text="${PROP}" content-desc="" clickable="false" enabled="true" bounds="[42,300][1038,400]" />
    <node content-desc="Judge Kevin, Fighter A, made the stronger case" clickable="true" enabled="true" bounds="[42,1420][1038,1600]" />
    <node content-desc="Judge Elena, Fighter B, made the stronger case" clickable="true" enabled="true" bounds="[42,1640][1038,1820]" />
  </node>
</hierarchy>`;

function postVoteXml({ roomId = ROOM_ID, clashId = CLASH_ID, disabledButton = false } = {}) {
  const btn = disabledButton
    ? '<node content-desc="Judge Kevin, Fighter A, made the stronger case" clickable="false" enabled="false" bounds="[42,1500][1038,1680]" />'
    : '';
  return `<hierarchy rotation="0">
    <node resource-id="arena-room:${roomId}:${clashId}:open:judging" bounds="[0,0][1080,2340]">
      <node resource-id="arena-outcome:${clashId}:${roomId}:open:judging" bounds="[42,1250][1038,1900]">
        <node text="Your ballot is recorded" bounds="[42,1300][1038,1380]" />
        <node text="Your recorded ballot: Side A" bounds="[42,1400][1038,1460]" />
        ${btn}
      </node>
    </node>
  </hierarchy>`;
}

function settledXml({
  roomId = ROOM_ID, clashId = CLASH_ID, status = 'settled', phaseChip = 'RESULT SETTLED',
  topic = TOPIC, winner = 'Official winner: DRAW', tally = 'Community verdict · 2 ballots · A 1 · B 1',
  aShare = 'Kevin, Fighter A, 50% of the panel', bShare = 'Elena, Fighter B, 50% of the panel', extraText = '',
} = {}) {
  return `<hierarchy rotation="0">
    <node resource-id="arena-verdict:${clashId}:${roomId}:${status}" content-desc="Official verdict" bounds="[0,0][1080,2340]">
      <node content-desc="${phaseChip}" bounds="[180,80][520,140]" />
      <node resource-id="arena-verdict-room:${roomId}:${status}" content-desc="Clash topic: ${topic}" bounds="[42,200][1038,260]" />
      <node content-desc="${winner}" bounds="[42,400][1038,480]" />
      <node text="${tally}" bounds="[42,500][1038,560]" />
      <node content-desc="${aShare}" bounds="[42,600][1038,700]" />
      <node content-desc="${bShare}" bounds="[42,720][1038,820]" />
      ${extraText ? `<node text="${extraText}" bounds="[42,840][1038,900]" />` : ''}
    </node>
  </hierarchy>`;
}

function withTempRunDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-d9-gate-'));
  return Promise.resolve().then(() => fn(dir)).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

test('1 & 2. executeJudgingAndBallots performs exactly one genuine vote tap, verifies absent/disabled control and 1 juror_id row, and marks optional API probe NOT TESTED by default', async () => {
  await withTempRunDir(async (runDir) => {
    const taps = [];
    const logs = [];
    const mockNav = {
      dumpHierarchyCalls: 0,
      dumpHierarchy() {
        this.dumpHierarchyCalls++;
        return { ok: true, durationMs: 250, xml: this.dumpHierarchyCalls === 1 ? JUDGING_XML : postVoteXml() };
      },
      adbTap(x, y) { taps.push({ x, y }); },
    };
    const mockDev = {
      dispatchDeepLink() {},
      sleep: async () => {},
      captureDeviceScreen(_adb, _devId, dest) { fs.writeFileSync(dest, VALID_PNG); return { size: VALID_PNG.length }; },
    };
    const mockRo = {
      sql(q) {
        if (q.includes('clock_timestamp')) return { now: '2026-11-10T10:02:00Z', status: 'open' };
        if (q.includes('public.judgements')) return [{ juror_id: ACTOR_C, side: 'A' }, { juror_id: ACTOR_D, side: 'B' }];
        throw new Error(`Unexpected SQL: ${q}`);
      },
    };
    const res = await phases.executeJudgingAndBallots({
      adb: 'adb', deviceId: 'RZ8', root: process.cwd(),
      ids: { room: ROOM_ID, clash: CLASH_ID },
      deadlines: { judging_at: Date.parse('2026-11-10T10:00:00Z'), closes_at: Date.parse('2026-11-10T10:05:00Z') },
      manifest: { actors: [{ name: 'Kevin' }, { name: 'Elena' }, { profileId: ACTOR_C }, { profileId: ACTOR_D }] },
      ro: mockRo, sendCmd: async () => {}, runDir, log: (m, e) => logs.push({ m, e }),
      deps: {
        nav: mockNav, dev: mockDev, pollDelayMs: 1, initialTapDelayMs: 1, skipInitialDeepLink: true,
        readSessionFn: async () => ({ profile: ACTOR_C, role: 'authenticated' }),
        fetchLiveRoomStateFn: async () => ({ roomId: ROOM_ID, clashId: CLASH_ID, status: 'open', phase: 'judging' }),
      },
    });
    a.equal(taps.length, 1, 'Expected exactly 1 genuine tap and ZERO second coordinate tap');
    a.equal(res.postVoteProof.passed, true);
    a.equal(res.postVoteProof.controlState, 'absent');
    a.equal(res.postVoteProof.actorCRowCount, 1);
    a.equal(res.duplicateProbe.status, 'NOT TESTED');
    a.equal(res.duplicateProbe.executed, false);
  });

  // Disabled voting control variant & authorized single-budget API probe
  const disabledRes = settledGuard.verifyPostVoteState({
    postVoteXml: postVoteXml({ disabledButton: true }),
    expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID,
    expectedActorId: ACTOR_C, actualActorId: ACTOR_C,
    displayedRoomId: ROOM_ID, displayedClashId: CLASH_ID,
    dbJudgements: [{ juror_id: ACTOR_C, side: 'A' }, { juror_id: ACTOR_D, side: 'B' }],
    expectedOtherActorId: ACTOR_D, votingGuard,
  });
  a.equal(disabledRes.controlState, 'disabled');

  const enabledVotingXml = postVoteXml().replace('</node>', '<node content-desc="Judge Kevin, Fighter A, made the stronger case" clickable="true" enabled="true" bounds="[42,1500][1038,1680]" /></node>');
  a.throws(() => settledGuard.verifyPostVoteState({
    postVoteXml: enabledVotingXml,
    expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID,
    expectedActorId: ACTOR_C, actualActorId: ACTOR_C,
    displayedRoomId: ROOM_ID, displayedClashId: CLASH_ID,
    dbJudgements: [{ juror_id: ACTOR_C, side: 'A' }, { juror_id: ACTOR_D, side: 'B' }],
    expectedOtherActorId: ACTOR_D, votingGuard,
  }), /absent or disabled/);

  a.throws(() => settledGuard.verifyPostVoteState({
    postVoteXml: postVoteXml({ roomId: STALE_ROOM_ID, clashId: STALE_CLASH_ID }),
    expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID,
    expectedActorId: ACTOR_C, actualActorId: ACTOR_C,
    dbJudgements: [{ juror_id: ACTOR_C, side: 'A' }], votingGuard,
  }), /Stale (?:room|clash) identity/);

  a.throws(() => settledGuard.verifyPostVoteState({
    postVoteXml: postVoteXml(),
    expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID,
    expectedActorId: ACTOR_C, actualActorId: ACTOR_C,
    displayedRoomId: ROOM_ID, displayedClashId: CLASH_ID,
    dbJudgements: [{ juror_id: ACTOR_C, side: 'A' }, { juror_id: ACTOR_C, side: 'A' }], votingGuard,
  }), /Expected exact 1 Actor C ballot via juror_id/);

  const authProbe = await settledGuard.evaluateDuplicateBallotProbe({
    authorized: true, budgetRemaining: 1, clashId: CLASH_ID, expectedActorId: ACTOR_C,
    probeFn: async () => { const err = new Error('duplicate key value violates unique constraint'); err.code = '23505'; throw err; },
    queryJudgementsFn: async () => [{ juror_id: ACTOR_C, side: 'A' }, { juror_id: ACTOR_D, side: 'B' }],
  });
  a.equal(authProbe.status, 'PASS');
  a.equal(authProbe.executed, true);

  // Source guards verifying removal of unsafe patterns & presence of room/verdict testIDs
  const phasesSrc = fs.readFileSync(path.join(__dirname, 'lib/arena-live-phases.cjs'), 'utf8');
  const execSection = phasesSrc.slice(phasesSrc.indexOf('async function executeJudgingAndBallots'), phasesSrc.indexOf('async function refreshAndCaptureSettledVerdict'));
  a.equal((execSection.match(/\.adbTap\(/g) || []).length, 1);
  a.equal(phasesSrc.includes("!postSettle.xml.includes('Room unavailable')"), false);
  a.match(fs.readFileSync(path.join(__dirname, '../components/liveArena/VerdictReveal.tsx'), 'utf8'), /arena-verdict:\$\{duel\.clashId\}/);
  a.match(fs.readFileSync(path.join(__dirname, '../components/liveArena/DuelRoomExperience.tsx'), 'utf8'), /arena-room:\$\{room\.roomId\}:\$\{duel\.clashId\}/);
});

test('3. stale room settled UI with matching winner/tally is rejected', () => {
  const verdict = { winner_side: 'DRAW', jury_size: 2, side_a_score: 1, side_b_score: 1 };
  a.throws(() => settledGuard.verifySettledVerdictUi({
    xml: settledXml({ roomId: STALE_ROOM_ID, clashId: STALE_CLASH_ID }),
    expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID,
    expectedTopic: TOPIC, authoritativeVerdict: verdict,
    fighterAName: 'Kevin', fighterBName: 'Elena', pngBuffer: VALID_PNG,
  }), /Stale (?:room|clash) identity/);
});

test('4. Room unavailable is rejected even when DB settlement succeeded', async () => {
  await withTempRunDir(async (runDir) => {
    const verdict = { winner_side: 'DRAW', jury_size: 2, side_a_score: 1, side_b_score: 1 };
    const unavailableXml = '<hierarchy><node text="Room unavailable" /><node content-desc="Return to Arena" clickable="true" /></hierarchy>';
    await a.rejects(() => phases.refreshAndCaptureSettledVerdict({
      adb: 'adb', deviceId: 'RZ8', ids: { room: ROOM_ID, clash: CLASH_ID },
      ro: { sql: (q) => q.includes('public.verdicts') ? verdict : { clash_status: 'settled', room_status: 'SETTLED', topic_title: TOPIC, fighter_a_name: 'Kevin', fighter_b_name: 'Elena' } },
      sendCmd: async () => {}, runDir, log: () => {},
      deps: {
        nav: { dumpHierarchy: () => ({ ok: true, xml: unavailableXml }), findControlByDesc: () => ({ found: false }) },
        dev: { dispatchDeepLink() {}, sleep: async () => {}, captureDeviceScreen(_a, _d, p) { fs.writeFileSync(p, VALID_PNG); } },
        fetchLiveRoomStateFn: async () => ({ roomId: ROOM_ID, clashId: CLASH_ID, status: 'settled' }),
        refreshDelayMs: 1, deepLinkDelayMs: 1, viewDelayMs: 1, maxSettlePolls: 1,
      },
    }), /Room unavailable/);
  });
});

test('5. non-settled active UI (OPEN, FINAL, JUDGING, pending) is rejected as settled evidence', () => {
  const verdict = { winner_side: 'DRAW', jury_size: 2, side_a_score: 1, side_b_score: 1 };
  for (const variant of [
    settledXml({ status: 'open', phaseChip: 'LIVE OPEN' }),
    settledXml({ phaseChip: 'LIVE FINAL' }),
    settledXml({ phaseChip: 'LIVE JUDGING' }),
    settledXml({ extraText: 'JUDGING OPEN' }),
    settledXml({ extraText: 'Settlement pending' }),
  ]) {
    a.throws(() => settledGuard.verifySettledVerdictUi({
      xml: variant, expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID,
      expectedTopic: TOPIC, authoritativeVerdict: verdict,
      fighterAName: 'Kevin', fighterBName: 'Elena', pngBuffer: VALID_PNG,
    }), /not settled|Non-settled|rejected non-settled/);
  }
});

test('6. mismatched winner label, ballot tally, or topic between DB and UI is rejected', () => {
  a.throws(() => settledGuard.verifySettledVerdictUi({
    xml: settledXml({ winner: 'Official winner: DRAW' }),
    expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID, expectedTopic: TOPIC,
    authoritativeVerdict: { winner_side: 'A', jury_size: 2, side_a_score: 1, side_b_score: 1 },
    fighterAName: 'Kevin', fighterBName: 'Elena', pngBuffer: VALID_PNG,
  }), /missing expected winner/);

  a.throws(() => settledGuard.verifySettledVerdictUi({
    xml: settledXml({ tally: 'Community verdict · 3 ballots · A 2 · B 1' }),
    expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID, expectedTopic: TOPIC,
    authoritativeVerdict: { winner_side: 'DRAW', jury_size: 2, side_a_score: 1, side_b_score: 1 },
    fighterAName: 'Kevin', fighterBName: 'Elena', pngBuffer: VALID_PNG,
  }), /missing expected ballot tally/);

  a.throws(() => settledGuard.verifySettledVerdictUi({
    xml: settledXml({ aShare: 'Kevin, Fighter A, 100% of the panel' }),
    expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID, expectedTopic: TOPIC,
    authoritativeVerdict: { winner_side: 'DRAW', jury_size: 2, side_a_score: 1, side_b_score: 1 },
    fighterAName: 'Kevin', fighterBName: 'Elena', pngBuffer: VALID_PNG,
  }), /percentage share mismatch/);

  a.throws(() => settledGuard.verifySettledVerdictUi({
    xml: settledXml({ topic: 'Wrong debate topic' }),
    expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID, expectedTopic: TOPIC,
    authoritativeVerdict: { winner_side: 'DRAW', jury_size: 2, side_a_score: 1, side_b_score: 1 },
    fighterAName: 'Kevin', fighterBName: 'Elena', pngBuffer: VALID_PNG,
  }), /missing matching clash topic/);
});

test('7. matching settled UI with valid verdict, tally, identity, topic, and valid PNG passes', async () => {
  await withTempRunDir(async (runDir) => {
    const verdict = { winner_side: 'DRAW', jury_size: 2, side_a_score: 1, side_b_score: 1 };
    const settledResult = await phases.refreshAndCaptureSettledVerdict({
      adb: 'adb', deviceId: 'RZ8', ids: { room: ROOM_ID, clash: CLASH_ID },
      ro: { sql: (q) => q.includes('public.verdicts') ? verdict : { clash_status: 'settled', room_status: 'SETTLED', topic_title: TOPIC, take_text: PROP, fighter_a_name: 'Kevin', fighter_b_name: 'Elena' } },
      sendCmd: async () => {}, runDir, log: () => {},
      deps: {
        nav: { dumpHierarchy: () => ({ ok: true, xml: settledXml() }), findControlByDesc: () => ({ found: false }) },
        dev: { dispatchDeepLink() {}, sleep: async () => {}, captureDeviceScreen(_a, _d, p) { fs.writeFileSync(p, VALID_PNG); } },
        fetchLiveRoomStateFn: async () => ({ roomId: ROOM_ID, clashId: CLASH_ID, status: 'settled' }),
        refreshDelayMs: 1, deepLinkDelayMs: 1, viewDelayMs: 1, maxSettlePolls: 1,
      },
    });
    a.equal(settledResult.passed, true);
    a.equal(settledResult.verdictProof.screenshot.valid, true);
    a.equal(fs.existsSync(path.join(runDir, 'device-07-closed-settled.xml')), true);

    const sideAWinner = settledGuard.verifySettledVerdictUi({
      xml: settledXml({
        winner: 'Official winner: SIDE A · Kevin',
        tally: 'Community verdict · 2 ballots · A 2 · B 0',
        aShare: 'Kevin, Fighter A, 100% of the panel',
        bShare: 'Elena, Fighter B, 0% of the panel',
      }),
      expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID, expectedTopic: TOPIC,
      authoritativeVerdict: { winner_side: 'A', jury_size: 2, side_a_score: 2, side_b_score: 0 },
      fighterAName: 'Kevin', fighterBName: 'Elena', pngBuffer: VALID_PNG,
    });
    a.equal(sideAWinner.passed, true);
  });
});

test('8. missing, zero-byte, or corrupted settled screenshot fails final verification', async () => {
  const verdict = { winner_side: 'DRAW', jury_size: 2, side_a_score: 1, side_b_score: 1 };
  for (const badPng of [null, Buffer.alloc(0), Buffer.from('not-a-png-file'), VALID_PNG.subarray(0, VALID_PNG.length - 12)]) {
    a.throws(() => settledGuard.verifySettledVerdictUi({
      xml: settledXml(), expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID,
      expectedTopic: TOPIC, authoritativeVerdict: verdict,
      fighterAName: 'Kevin', fighterBName: 'Elena', pngBuffer: badPng,
    }), /Screenshot/);
  }
  await withTempRunDir(async (runDir) => {
    await a.rejects(() => phases.refreshAndCaptureSettledVerdict({
      adb: 'adb', deviceId: 'RZ8', ids: { room: ROOM_ID, clash: CLASH_ID },
      ro: { sql: (q) => q.includes('public.verdicts') ? verdict : { clash_status: 'settled', room_status: 'SETTLED', topic_title: TOPIC, fighter_a_name: 'Kevin', fighter_b_name: 'Elena' } },
      sendCmd: async () => {}, runDir, log: () => {},
      deps: {
        nav: { dumpHierarchy: () => ({ ok: true, xml: settledXml() }), findControlByDesc: () => ({ found: false }) },
        dev: { dispatchDeepLink() {}, sleep: async () => {}, captureDeviceScreen(_a, _d, p) { fs.writeFileSync(p, Buffer.alloc(0)); } },
        fetchLiveRoomStateFn: async () => ({ roomId: ROOM_ID, clashId: CLASH_ID, status: 'settled' }),
        refreshDelayMs: 1, deepLinkDelayMs: 1, viewDelayMs: 1, maxSettlePolls: 1,
      },
    }), /Screenshot PNG missing or empty/);
  });
});

test('9. partial evidence never allows finalizeAcceptanceVerdict to emit COMPLETE or PASS', () => {
  const okJudging = { postVoteProof: { passed: true }, duplicateProbe: { status: 'NOT TESTED' } };
  const okSettled = { passed: true, verdictProof: { passed: true, screenshot: { valid: true, size: VALID_PNG.length } } };
  for (const badInput of [
    { judgingResult: null, settledResult: okSettled, historicalEqual: true },
    { judgingResult: { postVoteProof: { passed: false } }, settledResult: okSettled, historicalEqual: true },
    { judgingResult: okJudging, settledResult: null, historicalEqual: true },
    { judgingResult: okJudging, settledResult: { passed: true, verdictProof: { passed: true, screenshot: { valid: false } } }, historicalEqual: true },
    { judgingResult: okJudging, settledResult: okSettled, historicalEqual: false },
  ]) {
    const emitted = [];
    a.throws(() => finalizeAcceptanceVerdict({ ...badInput, log: (m) => emitted.push(m) }));
    a.equal(emitted.some((m) => m.includes('COMPLETE') || m.includes('PASS')), false, 'Partial evidence must never emit COMPLETE or PASS');
  }
  const passLogs = [];
  const res = finalizeAcceptanceVerdict({ judgingResult: okJudging, settledResult: okSettled, historicalEqual: true, log: (m) => passLogs.push(m) });
  a.equal(res.status, 'PASS');
  a.equal(res.duplicateBallotProbe, 'NOT TESTED');
  a.ok(passLogs.includes('COMPLETE A50 ARENA ACCEPTANCE RUN: PASS'));
});
