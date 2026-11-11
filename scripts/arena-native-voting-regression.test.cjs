'use strict';
/**
 * CLASH — Regression Test Suite for Native A50 Voting Fixes
 *
 * Covers:
 * 1. Strict voting button selector semantics (rejects result cards, summaries, disabled controls).
 * 2. Phase-guarded voting availability (rejection outside JUDGING phase).
 * 3. Pre-vote guards (actor mismatch, room mismatch, phase expired, disabled button).
 * 4. Locked-in voting state detection.
 * 5. Database query alignment: `juror_id` vs `user_id` against PostgreSQL.
 */

const test = require('node:test');
const a = require('node:assert/strict');
const cp = require('node:child_process');
const {
  VOTING_BUTTON_REGEX,
  selectVotingButton,
  detectVotingState,
  verifyPreVoteGuards,
  buildJudgementQuery
} = require('./lib/arena-native-voting-guard.cjs');

// Mock XML Fixtures
const HISTORICAL_SETTLED_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" bounds="[0,0][1080,2340]">
    <node index="0" content-desc="Back" bounds="[42,83][158,199]" clickable="true" enabled="true" />
    <node index="1" content-desc="Official verdict" bounds="[42,1400][1038,1500]" clickable="false" enabled="true" />
    <node index="2" content-desc="Official winner: SIDE B · Challenger" bounds="[42,1520][1038,1620]" clickable="false" enabled="true" />
    <node index="3" content-desc="Challenger, Fighter A, 0% of the panel" bounds="[42,1683][1038,1875]" clickable="false" enabled="true" />
    <node index="4" content-desc="Challenger, Fighter B, 100% of the panel" bounds="[42,1890][1038,2080]" clickable="false" enabled="true" />
    <node index="5" content-desc="Review transcript" bounds="[42,2100][520,2200]" clickable="true" enabled="true" />
    <node index="6" content-desc="Return to Arena" bounds="[560,2100][1038,2200]" clickable="true" enabled="true" />
  </node>
</hierarchy>`;

const ACTIVE_JUDGING_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" bounds="[0,0][1080,2340]">
    <node index="0" content-desc="Back" bounds="[42,83][158,199]" clickable="true" enabled="true" />
    <node index="1" text="Cast your ballot" bounds="[42,1300][1038,1380]" clickable="false" enabled="true" />
    <node index="2" content-desc="Judge Challenger, Fighter A, made the stronger case" bounds="[42,1420][1038,1600]" clickable="true" enabled="true" />
    <node index="3" content-desc="Judge Challenger, Fighter B, made the stronger case" bounds="[42,1640][1038,1820]" clickable="true" enabled="true" />
  </node>
</hierarchy>`;

const LOCKED_VOTED_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" bounds="[0,0][1080,2340]">
    <node index="0" content-desc="Back" bounds="[42,83][158,199]" clickable="true" enabled="true" />
    <node index="1" text="Your ballot is recorded" bounds="[42,1300][1038,1380]" clickable="false" enabled="true" />
    <node index="2" text="Your recorded ballot: Side A" bounds="[42,1400][1038,1460]" clickable="false" enabled="true" />
    <node index="3" content-desc="Judge Challenger, Fighter A, made the stronger case" bounds="[42,1500][1038,1680]" clickable="false" enabled="false" />
  </node>
</hierarchy>`;

// --- 1. Regex & String Semantics Tests ---
test('VOTING_BUTTON_REGEX strictly matches genuine voting button descriptions', () => {
  const matchA = 'Judge Challenger, Fighter A, made the stronger case'.match(VOTING_BUTTON_REGEX);
  a.ok(matchA);
  a.equal(matchA[1], 'Challenger');
  a.equal(matchA[2], 'A');

  const matchB = 'Judge Fighter B Name, Fighter B, made the stronger case'.match(VOTING_BUTTON_REGEX);
  a.ok(matchB);
  a.equal(matchB[1], 'Fighter B Name');
  a.equal(matchB[2], 'B');
});

test('VOTING_BUTTON_REGEX strictly rejects historical result cards and non-voting descriptions', () => {
  const rejected = [
    'Challenger, Fighter A, 0% of the panel',
    'Challenger, Fighter B, 100% of the panel',
    'Challenger, Side A. Position: Evidence should guide debate',
    'Challenger, Side B. Position: Broad participation matters',
    'Official verdict',
    'Official winner: SIDE B · Challenger',
    'Review transcript',
    'Return to Arena',
    'Cast your ballot',
    'Your recorded ballot: Side A'
  ];
  for (const desc of rejected) {
    a.equal(VOTING_BUTTON_REGEX.test(desc), false, `Must reject: ${desc}`);
  }
});

// --- 2. selectVotingButton Tests ---
test('selectVotingButton rejects selection if current phase is not judging', () => {
  a.throws(() => {
    selectVotingButton(ACTIVE_JUDGING_XML, 'A', 'open');
  }, /room phase is 'open', must be 'judging'/);

  a.throws(() => {
    selectVotingButton(ACTIVE_JUDGING_XML, 'A', 'final_arguments');
  }, /room phase is 'final_arguments', must be 'judging'/);

  a.throws(() => {
    selectVotingButton(ACTIVE_JUDGING_XML, 'A', 'closed');
  }, /room phase is 'closed', must be 'judging'/);
});

test('selectVotingButton returns found=false on historical settled XML', () => {
  const resA = selectVotingButton(HISTORICAL_SETTLED_XML, 'A', 'judging');
  a.equal(resA.found, false);
  a.match(resA.reason, /No voting button found matching Side A/);

  const resB = selectVotingButton(HISTORICAL_SETTLED_XML, 'B', 'judging');
  a.equal(resB.found, false);
});

test('selectVotingButton correctly extracts active Side A voting button', () => {
  const res = selectVotingButton(ACTIVE_JUDGING_XML, 'A', 'judging');
  a.equal(res.found, true);
  a.equal(res.button.side, 'A');
  a.equal(res.button.fighterName, 'Challenger');
  a.equal(res.button.clickable, true);
  a.equal(res.button.enabled, true);
  a.deepEqual(res.button.bounds, { left: 42, top: 1420, right: 1038, bottom: 1600, width: 996, height: 180 });
  a.deepEqual(res.button.center, { x: 540, y: 1510 });
});

test('selectVotingButton correctly extracts active Side B voting button', () => {
  const res = selectVotingButton(ACTIVE_JUDGING_XML, 'B', 'judging');
  a.equal(res.found, true);
  a.equal(res.button.side, 'B');
  a.deepEqual(res.button.center, { x: 540, y: 1730 });
});

test('selectVotingButton rejects zero-area buttons', () => {
  const zeroXml = `<hierarchy><node content-desc="Judge Fighter, Fighter A, made the stronger case" bounds="[100,100][100,100]" clickable="true" enabled="true"/></hierarchy>`;
  const res = selectVotingButton(zeroXml, 'A', 'judging');
  a.equal(res.found, false);
  a.match(res.reason, /has zero area/);
});

// --- 3. detectVotingState Tests ---
test('detectVotingState identifies recorded ballot and side', () => {
  const state = detectVotingState(LOCKED_VOTED_XML);
  a.equal(state.isRecorded, true);
  a.equal(state.recordedSide, 'A');
  a.equal(state.isSettled, false);
});

test('detectVotingState identifies settled view', () => {
  const state = detectVotingState(HISTORICAL_SETTLED_XML);
  a.equal(state.isRecorded, false);
  a.equal(state.isSettled, true);
});

// --- 4. Pre-Vote Guard Verification Tests ---
test('verifyPreVoteGuards approves valid voting preconditions', () => {
  const selection = selectVotingButton(ACTIVE_JUDGING_XML, 'A', 'judging');
  const guard = verifyPreVoteGuards({
    actorId: 'u_64ad1836fba14aa299af81d0492178af',
    expectedActorId: 'u_64ad1836fba14aa299af81d0492178af',
    displayedRoomId: 'ar_8e69cc20e018a7be',
    targetRoomId: 'ar_8e69cc20e018a7be',
    serverNow: 1794223800000,
    judgingAt: 1794223700000,
    closesAt: 1794224000000,
    buttonSelection: selection
  });

  a.equal(guard.verified, true);
  a.equal(guard.side, 'A');
  a.deepEqual(guard.tapTarget, { x: 540, y: 1510 });
});

test('verifyPreVoteGuards aborts on Actor identity mismatch', () => {
  const selection = selectVotingButton(ACTIVE_JUDGING_XML, 'A', 'judging');
  a.throws(() => {
    verifyPreVoteGuards({
      actorId: 'u_wrong_actor_id',
      expectedActorId: 'u_64ad1836fba14aa299af81d0492178af',
      displayedRoomId: 'ar_8e69cc20e018a7be',
      targetRoomId: 'ar_8e69cc20e018a7be',
      serverNow: 1794223800000,
      judgingAt: 1794223700000,
      closesAt: 1794224000000,
      buttonSelection: selection
    });
  }, /PRE_VOTE_GUARD_FAILED: Actor mismatch/);
});

test('verifyPreVoteGuards aborts on Room ID mismatch (stale room prevention)', () => {
  const selection = selectVotingButton(ACTIVE_JUDGING_XML, 'A', 'judging');
  a.throws(() => {
    verifyPreVoteGuards({
      actorId: 'u_64ad1836fba14aa299af81d0492178af',
      expectedActorId: 'u_64ad1836fba14aa299af81d0492178af',
      displayedRoomId: 'ar_old_settled_room',
      targetRoomId: 'ar_8e69cc20e018a7be',
      serverNow: 1794223800000,
      judgingAt: 1794223700000,
      closesAt: 1794224000000,
      buttonSelection: selection
    });
  }, /PRE_VOTE_GUARD_FAILED: Room mismatch/);
});

test('verifyPreVoteGuards aborts when judging window has expired', () => {
  const selection = selectVotingButton(ACTIVE_JUDGING_XML, 'A', 'judging');
  a.throws(() => {
    verifyPreVoteGuards({
      actorId: 'u_64ad1836fba14aa299af81d0492178af',
      expectedActorId: 'u_64ad1836fba14aa299af81d0492178af',
      displayedRoomId: 'ar_8e69cc20e018a7be',
      targetRoomId: 'ar_8e69cc20e018a7be',
      serverNow: 1794224100000, // after closesAt
      judgingAt: 1794223700000,
      closesAt: 1794224000000,
      buttonSelection: selection
    });
  }, /PRE_VOTE_GUARD_FAILED: Judging window has expired/);
});

test('verifyPreVoteGuards aborts when judging window has not opened yet', () => {
  const selection = selectVotingButton(ACTIVE_JUDGING_XML, 'A', 'judging');
  a.throws(() => {
    verifyPreVoteGuards({
      actorId: 'u_64ad1836fba14aa299af81d0492178af',
      expectedActorId: 'u_64ad1836fba14aa299af81d0492178af',
      displayedRoomId: 'ar_8e69cc20e018a7be',
      targetRoomId: 'ar_8e69cc20e018a7be',
      serverNow: 1794223600000, // before judgingAt
      judgingAt: 1794223700000,
      closesAt: 1794224000000,
      buttonSelection: selection
    });
  }, /PRE_VOTE_GUARD_FAILED: Judging window has not opened yet/);
});

test('verifyPreVoteGuards aborts when voting button is disabled or not found', () => {
  const failedSelection = selectVotingButton(HISTORICAL_SETTLED_XML, 'A', 'judging');
  a.throws(() => {
    verifyPreVoteGuards({
      actorId: 'u_64ad1836fba14aa299af81d0492178af',
      expectedActorId: 'u_64ad1836fba14aa299af81d0492178af',
      displayedRoomId: 'ar_8e69cc20e018a7be',
      targetRoomId: 'ar_8e69cc20e018a7be',
      serverNow: 1794223800000,
      judgingAt: 1794223700000,
      closesAt: 1794224000000,
      buttonSelection: failedSelection
    });
  }, /PRE_VOTE_GUARD_FAILED: Button selector failed/);
});

// --- 5. Database Schema Alignment Verification ---
test('buildJudgementQuery uses authoritative juror_id column and excludes user_id', () => {
  const sql = buildJudgementQuery('cl_test_123');
  a.match(sql, /'juror_id',\s*juror_id/);
  a.doesNotMatch(sql, /user_id/);
});

test('Live PostgreSQL schema verifies juror_id column exists and user_id is rejected', () => {
  // Query with user_id: must fail with column does not exist
  let failed = false;
  try {
    cp.execFileSync('docker', [
      'exec', '--user', 'postgres', 'clash-live-b4-20261101-db',
      'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
      '-U', 'supabase_admin', '-d', 'postgres',
      '-c', "SELECT user_id FROM public.judgements LIMIT 1;"
    ], { stdio: 'pipe' });
  } catch (err) {
    failed = true;
    a.match(err.stderr.toString(), /column "user_id" does not exist/);
  }
  a.equal(failed, true, 'Querying user_id must fail');

  // Query with juror_id: must succeed with exit code 0
  const out = cp.execFileSync('docker', [
    'exec', '--user', 'postgres', 'clash-live-b4-20261101-db',
    'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
    '-U', 'supabase_admin', '-d', 'postgres',
    '-c', "SELECT juror_id, side FROM public.judgements WHERE clash_id = 'cl_fcd3f6f4a0a8cbbb';"
  ], { encoding: 'utf8' }).trim();

  a.match(out, /u_8b5fd32553bb4823925351be3e71bda4\|B/);
});
