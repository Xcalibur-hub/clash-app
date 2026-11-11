'use strict';
/**
 * Phase execution helpers for live bounded A50 Arena acceptance runs.
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const a = require('node:assert/strict');
const nav = require('./arena-device-navigation.cjs');
const votingGuard = require('./arena-native-voting-guard.cjs');
const settledGuard = require('./arena-settled-verdict-guard.cjs');
const dev = require('./arena-live-devices.cjs');

async function admitSpectatorCAndVerify({ adb, deviceId, ids, manifest, ro, runDir, log }) {
  const feedRes = await nav.navigateToFeed({ adb, deviceId, timeoutMs: 12000 });
  a.equal(feedRes.state, 'main_feed');
  dev.dispatchDeepLink(adb, deviceId, ids.room);
  await dev.sleep(5000);

  let initDump = null;
  let tappedWatch = false;
  for (let attempt = 1; attempt <= 8; attempt++) {
    const dump = nav.dumpHierarchy(adb, deviceId, 12000);
    log(`Room admission poll ${attempt}/8`, { ok: dump.ok, durationMs: dump.durationMs, error: dump.error || null, state: nav.detectScreenState(dump) });
    if (!dump.ok) { await dev.sleep(2000); continue; }
    a.ok(!dump.xml.includes('Room unavailable'), `Room unavailable rendered for ${ids.room}`);
    a.ok(!dump.xml.includes("Couldn't load the Clash"), `Room load error rendered for ${ids.room}`);
    const watchBtn = nav.findControlByDesc(dump, /^Watch this Clash as a spectator$/i);
    if (watchBtn.found && !tappedWatch) {
      log('Tapping "Watch this Clash as a spectator"...', watchBtn.center);
      nav.adbTap(watchBtn.center.x, watchBtn.center.y, adb, deviceId);
      tappedWatch = true;
      await dev.sleep(4500);
      continue;
    }
    if (dump.xml.includes('Skip Clash intro')) { await dev.sleep(2500); continue; }
    const expectedAdmissionTopic = manifest?.fixture?.proposition || manifest?.fixture?.topic || 'Evidence should guide a technical debate';
    if ((dump.xml.includes('Your role: WATCHING') || dump.xml.includes('WATCHING')) &&
        dump.xml.includes(expectedAdmissionTopic) &&
        !dump.xml.includes('Home destinations') &&
        !dump.xml.includes('ar_f8c0aa6960f7b878')) {
      initDump = dump;
      break;
    }
    await dev.sleep(3000);
  }
  a.ok(initDump && initDump.ok, 'Active room did not render with expected topic and WATCHING role after admission');
  fs.writeFileSync(path.join(runDir, 'device-01-open-init.xml'), initDump.xml);

  const participants = ro.sql(`SELECT coalesce(json_agg(json_build_object('profile_id', profile_id, 'role', role)), '[]'::json) FROM public.arena_room_participants WHERE room_id = '${ids.room}'`);
  a.ok(participants.find((p) => p.profile_id === manifest.actors[2].profileId && p.role === 'spectator'), 'Actor C must be spectator in DB');
  a.ok(participants.find((p) => p.profile_id === manifest.actors[3].profileId && p.role === 'spectator'), 'Actor D must be spectator in DB');

  const hermesState = await dev.fetchLiveRoomState(ids.room);
  log('Verified live Hermes room state:', hermesState);
  a.equal(hermesState.roomId, ids.room, 'Hermes fetchRoom roomId mismatch');
  a.equal(hermesState.clashId, ids.clash, 'Hermes fetchRoom clashId mismatch');
  a.equal(hermesState.rel, 'spectator', 'Hermes viewerRelationship must be spectator');
  dev.captureDeviceScreen(adb, deviceId, path.join(runDir, 'device-01-open-init.png'), log);
}

async function executeJudgingAndBallots({ adb, deviceId, root, ids, deadlines, manifest, ro, sendCmd, runDir, log, deps = {} }) {
  const navMod = deps.nav || nav;
  const devMod = deps.dev || dev;
  const fsMod = deps.fs || fs;
  const vGuard = deps.votingGuard || votingGuard;
  const sGuard = deps.settledGuard || settledGuard;
  const readSessionFn = deps.readSessionFn || (() => require(path.join(root, '.expo/android-a50-crowd-resolution/read-session.cjs')).readSession());
  const fetchRoomStateFn = deps.fetchLiveRoomStateFn || ((roomId) => devMod.fetchLiveRoomState(roomId));
  const pollDelayMs = Number.isInteger(deps.pollDelayMs) ? deps.pollDelayMs : 2500;
  const initialTapDelayMs = Number.isInteger(deps.initialTapDelayMs) ? deps.initialTapDelayMs : 4500;

  if (!deps.skipInitialDeepLink) {
    devMod.dispatchDeepLink(adb, deviceId, ids.room);
    await devMod.sleep(Number.isInteger(deps.deepLinkDelayMs) ? deps.deepLinkDelayMs : 4000);
  }

  let sideAButton = null;
  let judgingDump = null;
  const maxPolls = Number.isInteger(deps.maxJudgingPolls) ? deps.maxJudgingPolls : null;
  const deadline = Date.now() + 50000;
  for (let attempt = 1; maxPolls ? attempt <= maxPolls : Date.now() < deadline; attempt++) {
    const dumpRes = navMod.dumpHierarchy(adb, deviceId, 12000);
    log(`Judging UI poll ${attempt}`, { ok: dumpRes.ok, durationMs: dumpRes.durationMs, error: dumpRes.error || null });
    if (dumpRes.ok) {
      const sel = vGuard.selectVotingButton(dumpRes.xml, 'A', 'judging');
      if (sel.found) { sideAButton = sel; judgingDump = dumpRes; break; }
      if (!deps.skipScrollSwipe && attempt === 2) {
        cp.execFileSync(adb, ['-s', deviceId, 'shell', 'input', 'swipe', '540', '1650', '540', '950', '300'], { windowsHide: true });
        await devMod.sleep(2000);
        continue;
      }
    }
    if (!deps.skipRetryDeepLink && attempt === 3) { devMod.dispatchDeepLink(adb, deviceId, ids.room); await devMod.sleep(3500); }
    else { await devMod.sleep(pollDelayMs); }
  }
  a.ok(sideAButton && sideAButton.found && judgingDump, 'Side A voting button missing in JUDGING XML');
  fsMod.writeFileSync(path.join(runDir, 'device-05-judging-init.xml'), judgingDump.xml);
  devMod.captureDeviceScreen(adb, deviceId, path.join(runDir, 'device-05-judging-init.png'), log);

  const sessionC = await readSessionFn();
  const hermesJudgingState = await fetchRoomStateFn(ids.room);
  const serverClock = ro.sql(`SELECT json_build_object('now', clock_timestamp(), 'status', (SELECT status FROM public.clashes WHERE id = '${ids.clash}'))`);
  const guardCheck = vGuard.verifyPreVoteGuards({
    actorId: sessionC.profile,
    expectedActorId: manifest.actors[2].profileId,
    displayedRoomId: hermesJudgingState.roomId,
    targetRoomId: ids.room,
    serverNow: serverClock.now,
    judgingAt: deadlines.judging_at,
    closesAt: deadlines.closes_at,
    buttonSelection: sideAButton,
  });

  await sendCmd('ballot-D');
  navMod.adbTap(guardCheck.tapTarget.x, guardCheck.tapTarget.y, adb, deviceId);
  await devMod.sleep(initialTapDelayMs);

  let postVoteDump = null;
  let voteState = null;
  for (let i = 1; i <= 4; i++) {
    const d = navMod.dumpHierarchy(adb, deviceId, 12000);
    if (d.ok) {
      voteState = vGuard.detectVotingState(d.xml);
      if (voteState.isRecorded) { postVoteDump = d; break; }
    }
    await devMod.sleep(pollDelayMs);
  }
  a.ok(postVoteDump && voteState?.isRecorded, 'Locked-in ballot state did not render after native tap');

  const postVoteSession = await readSessionFn();
  const postVoteHermes = await fetchRoomStateFn(ids.room);
  const judgements = ro.sql(vGuard.buildJudgementQuery(ids.clash));
  const postVoteProof = sGuard.verifyPostVoteState({
    postVoteXml: postVoteDump.xml,
    expectedRoomId: ids.room,
    expectedClashId: ids.clash,
    expectedActorId: manifest.actors[2].profileId,
    actualActorId: postVoteSession.profile,
    expectedSide: 'A',
    displayedRoomId: postVoteHermes?.roomId,
    displayedClashId: postVoteHermes?.clashId,
    dbJudgements: judgements,
    expectedOtherActorId: manifest.actors[3]?.profileId,
    expectedOtherSide: 'B',
    votingGuard: vGuard,
  });

  fsMod.writeFileSync(path.join(runDir, 'device-06-judging-voted.xml'), postVoteDump.xml);
  const votedPngPath = path.join(runDir, 'device-06-judging-voted.png');
  devMod.captureDeviceScreen(adb, deviceId, votedPngPath, log);
  sGuard.verifyValidPngBuffer(fsMod.readFileSync(votedPngPath));

  const duplicateProbe = await sGuard.evaluateDuplicateBallotProbe({
    authorized: Boolean(deps.duplicateProbeAuthorized),
    budgetRemaining: Number(manifest.budgets?.negativeMutationProbes || 0),
    probeFn: deps.duplicateProbeFn || null,
    clashId: ids.clash,
    expectedActorId: manifest.actors[2].profileId,
    queryJudgementsFn: (cid) => ro.sql(vGuard.buildJudgementQuery(cid)),
  });
  log('Post-vote & duplicate ballot probe result:', { postVoteProof, duplicateProbe });
  return { postVoteProof, duplicateProbe };
}

async function refreshAndCaptureSettledVerdict({ adb, deviceId, ids, ro, sendCmd, runDir, log, manifest = null, expectedWinnerSide = 'DRAW', expectedJurySize = 2, deps = {} }) {
  const navMod = deps.nav || nav;
  const devMod = deps.dev || dev;
  const fsMod = deps.fs || fs;
  const sGuard = deps.settledGuard || settledGuard;
  const fetchRoomStateFn = deps.fetchLiveRoomStateFn || ((roomId) => devMod.fetchLiveRoomState(roomId));
  const refreshDelayMs = Number.isInteger(deps.refreshDelayMs) ? deps.refreshDelayMs : 3500;
  const deepLinkDelayMs = Number.isInteger(deps.deepLinkDelayMs) ? deps.deepLinkDelayMs : 4500;
  const viewDelayMs = Number.isInteger(deps.viewDelayMs) ? deps.viewDelayMs : 2500;

  await sendCmd('settle-first');
  await sendCmd('settle-idempotency');
  const verdictRow = ro.sql(`SELECT to_jsonb(v) FROM public.verdicts v WHERE v.clash_id = '${ids.clash}'`);
  a.ok(verdictRow, 'Verdict row must exist after settlement');
  if (expectedJurySize !== null) a.equal(verdictRow.jury_size, expectedJurySize, `Verdict jury_size must equal ${expectedJurySize}`);
  if (expectedWinnerSide !== null) a.equal(verdictRow.winner_side, expectedWinnerSide, `Expected ${expectedWinnerSide} verdict`);

  const meta = ro.sql(`SELECT json_build_object('clash_status', c.status, 'room_status', r.status, 'topic_title', t.title, 'take_text', tk.text, 'fighter_a_name', pa.name, 'fighter_b_name', pb.name) FROM public.clashes c JOIN public.arena_rooms r ON r.clash_id = c.id JOIN public.arena_daily_topics t ON t.id = r.topic_id JOIN public.takes tk ON tk.id = c.take_id LEFT JOIN public.profiles pa ON pa.id = tk.author_id LEFT JOIN public.profiles pb ON pb.id = c.challenger_id WHERE c.id = '${ids.clash}'`);
  if (meta && meta.clash_status) a.equal(meta.clash_status, 'settled', 'Clash DB status must be settled');
  if (meta && meta.room_status) a.equal(meta.room_status, 'SETTLED', 'Room DB status must be SETTLED');

  const preSettle = navMod.dumpHierarchy(adb, deviceId, 12000);
  let postSettle = preSettle;
  const refreshBtn = preSettle.ok ? navMod.findControlByDesc(preSettle, /^Refresh official result$/i) : { found: false };
  const preViewBtn = preSettle.ok ? navMod.findControlByDesc(preSettle, /^View official result$/i) : { found: false };
  if (refreshBtn.found) {
    navMod.adbTap(refreshBtn.center.x, refreshBtn.center.y, adb, deviceId);
    await devMod.sleep(refreshDelayMs);
    postSettle = navMod.dumpHierarchy(adb, deviceId, 12000);
  } else if (!preViewBtn.found && !(preSettle.ok && preSettle.xml.includes('Official verdict'))) {
    devMod.dispatchDeepLink(adb, deviceId, ids.room);
    await devMod.sleep(deepLinkDelayMs);
    postSettle = navMod.dumpHierarchy(adb, deviceId, 12000);
  }

  const viewBtn = postSettle.ok ? navMod.findControlByDesc(postSettle, /^View official result$/i) : { found: false };
  if (viewBtn.found) {
    navMod.adbTap(viewBtn.center.x, viewBtn.center.y, adb, deviceId);
    await devMod.sleep(viewDelayMs);
    postSettle = navMod.dumpHierarchy(adb, deviceId, 12000);
  }

  const maxSettlePolls = Number.isInteger(deps.maxSettlePolls) ? deps.maxSettlePolls : 3;
  for (let p = 1; p < maxSettlePolls && (!postSettle.ok || postSettle.xml.includes('Settlement pending')); p++) {
    await devMod.sleep(viewDelayMs);
    postSettle = navMod.dumpHierarchy(adb, deviceId, 12000);
  }
  a.ok(postSettle && postSettle.ok, 'Settled verdict hierarchy dump failed');

  const hermesSettleState = await fetchRoomStateFn(ids.room);
  const pngPath = path.join(runDir, 'device-07-closed-settled.png');
  devMod.captureDeviceScreen(adb, deviceId, pngPath, log);
  const pngBuffer = fsMod.readFileSync(pngPath);

  const verdictProof = sGuard.verifySettledVerdictUi({
    xml: postSettle.xml,
    expectedRoomId: ids.room,
    expectedClashId: ids.clash,
    expectedTopic: deps.expectedTopic || meta?.topic_title || manifest?.fixture?.topic || '',
    expectedProposition: deps.expectedProposition || meta?.take_text || manifest?.fixture?.proposition || '',
    authoritativeVerdict: verdictRow,
    fighterAName: deps.fighterAName || meta?.fighter_a_name || manifest?.actors?.[0]?.name || '',
    fighterBName: deps.fighterBName || meta?.fighter_b_name || manifest?.actors?.[1]?.name || '',
    pngBuffer,
    hermesState: hermesSettleState,
  });

  fsMod.writeFileSync(path.join(runDir, 'device-07-closed-settled.xml'), postSettle.xml);
  log('Verified settled A50 UI verdict proof:', verdictProof);
  return { passed: true, verdictProof, verdictRow };
}

module.exports = { admitSpectatorCAndVerify, executeJudgingAndBallots, refreshAndCaptureSettledVerdict };
