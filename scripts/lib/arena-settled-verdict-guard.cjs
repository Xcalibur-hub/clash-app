'use strict';
/**
 * Positive verification guards for post-vote locked state, settled A50 UI verdict,
 * optional single-budget duplicate-ballot API probe, and PNG screenshot integrity.
 */
const a = require('node:assert/strict');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ID_RE = /(?:^|[:/])arena-(verdict|outcome|room|verdict-room):([^\s"']+)/;
const NON_SETTLED_RE = /^(?:OPEN|FINAL|JUDGING|CANCELLED|(?:LIVE|RESULT|CLOSED)\s+(?:OPEN|FINAL|JUDGING|CANCELLED))$/i;
const SETTLED_STATUSES = new Set(['SETTLED', 'settled']);
const BLOCKED_MARKERS = ['Room unavailable', "Couldn't load the Clash", 'Official result unavailable', 'Settlement pending', 'JUDGING OPEN', 'Who made the stronger case?', 'Judging opens after final arguments', 'Home destinations', 'Skip Clash intro'];

function normalizeSettledStatus(status) {
  return typeof status === 'string' && SETTLED_STATUSES.has(status) ? 'settled' : null;
}

function decodeXml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&apos;|&#39;|&#x27;/gi, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}
const norm = (s) => decodeXml(s).replace(/\s+/g, ' ').trim();
const normId = (s) => String(s || '').replace(/^u_/, '').replace(/-/g, '').toLowerCase();
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : '';
};
const parseNodes = (xml) => Array.from(String(xml || '').matchAll(/<node\b[^>]*>/g), (m) => ({
  text: attr(m[0], 'text'), contentDesc: attr(m[0], 'content-desc'),
  resourceId: attr(m[0], 'resource-id'), clickable: attr(m[0], 'clickable'), enabled: attr(m[0], 'enabled'),
}));

function assertXmlIdentity(nodes, decodedXml, expectedRoomId, expectedClashId, requireSettled) {
  let matchedPair = false, confirmedSettled = false;
  for (const n of nodes) {
    const m = n.resourceId.match(ID_RE);
    if (!m) continue;
    const [, kind, rest] = m;
    const parts = rest.split(':');
    const [rId, cId, st] = kind === 'arena-room' || kind === 'room' ? parts
      : kind === 'verdict-room' ? [parts[0], null, parts[1]] : [parts[1], parts[0], parts[2]];
    if (rId && rId !== 'unknown') a.equal(rId, expectedRoomId, `Stale room identity '${rId}' in UI XML (expected '${expectedRoomId}')`);
    if (cId && cId !== 'unknown') a.equal(cId, expectedClashId, `Stale clash identity '${cId}' in UI XML (expected '${expectedClashId}')`);
    if (requireSettled && st) a.equal(st, 'settled', `UI status '${st}' is not settled for ${expectedClashId}`);
    if (rId === expectedRoomId && cId === expectedClashId) {
      matchedPair = true;
      if (st === 'settled') confirmedSettled = true;
    }
  }
  for (const token of decodedXml.match(/\b(?:ar|cl)_[a-f0-9]{12,}\b/g) || []) {
    a.ok(token === expectedRoomId || token === expectedClashId, `Foreign ID '${token}' leaked in UI XML`);
  }
  a.ok(matchedPair, `UI XML missing verified room/clash identity (${expectedRoomId}/${expectedClashId})`);
  if (requireSettled) a.ok(confirmedSettled, `UI XML did not confirm settled terminal state for ${expectedClashId}`);
}

function verifyValidPngBuffer(buf) {
  a.ok(Buffer.isBuffer(buf) && buf.length >= 33, 'Screenshot PNG missing or empty');
  a.ok(buf.subarray(0, 8).equals(PNG_SIG), 'Screenshot does not have a valid PNG signature');
  a.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR', 'Screenshot missing PNG IHDR chunk');
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
  a.ok(width > 0 && height > 0, `Invalid PNG dimensions ${width}x${height}`);
  a.ok(buf.includes(Buffer.from('IEND')), 'Screenshot PNG is truncated (missing IEND)');
  return { valid: true, size: buf.length, width, height };
}

function verifyPostVoteState({ postVoteXml, expectedRoomId, expectedClashId, expectedActorId, actualActorId, expectedSide = 'A', displayedRoomId, displayedClashId, dbJudgements, expectedOtherActorId, expectedOtherSide = 'B', votingGuard }) {
  a.equal(typeof postVoteXml, 'string', 'Post-vote UI XML required');
  a.ok(postVoteXml.length > 0, 'Post-vote UI XML empty');
  for (const bad of ['Room unavailable', "Couldn't load the Clash", 'Home destinations']) {
    a.ok(!postVoteXml.includes(bad), `Unexpected error/navigation screen '${bad}' after vote`);
  }
  a.ok(normId(actualActorId) && normId(actualActorId) === normId(expectedActorId), `Actor mismatch after vote: expected ${expectedActorId}, got ${actualActorId}`);
  if (displayedRoomId !== undefined) a.equal(displayedRoomId, expectedRoomId, 'Hermes roomId mismatch after vote');
  if (displayedClashId !== undefined) a.equal(displayedClashId, expectedClashId, 'Hermes clashId mismatch after vote');
  const nodes = parseNodes(postVoteXml);
  assertXmlIdentity(nodes, decodeXml(postVoteXml), expectedRoomId, expectedClashId, false);
  a.ok(votingGuard.detectVotingState(postVoteXml).isRecorded, 'Locked-in ballot confirmation missing in post-vote UI');
  if (postVoteXml.includes('Your recorded ballot: Side')) {
    a.ok(postVoteXml.includes(`Your recorded ballot: Side ${expectedSide}`), `Recorded ballot side mismatch (expected Side ${expectedSide})`);
  }
  for (const side of ['A', 'B']) {
    const sel = votingGuard.selectVotingButton(postVoteXml, side, 'judging');
    if (sel.found) {
      a.equal(Boolean(sel.button.enabled && sel.button.clickable), false, `Side ${side} voting control must be absent or disabled after vote`);
    }
  }
  let matchingNodeCount = 0;
  for (const n of nodes) {
    if (votingGuard.VOTING_BUTTON_REGEX.test(n.contentDesc) || votingGuard.VOTING_BUTTON_REGEX.test(n.text)) {
      matchingNodeCount++;
      a.ok(!(n.clickable === 'true' && n.enabled === 'true'), 'Active enabled voting control still present after ballot');
    }
  }
  a.ok(Array.isArray(dbJudgements), 'Database judgements result required');
  const actorCRows = dbJudgements.filter((j) => j.juror_id === expectedActorId);
  a.equal(actorCRows.length, 1, `Expected exact 1 Actor C ballot via juror_id, found ${actorCRows.length}`);
  a.equal(actorCRows[0].side, expectedSide, `Actor C DB ballot side mismatch: ${actorCRows[0].side}`);
  if (expectedOtherActorId) {
    a.equal(dbJudgements.filter((j) => j.juror_id === expectedOtherActorId && j.side === expectedOtherSide).length, 1, 'Expected other spectator ballot row missing');
    a.equal(dbJudgements.length, 2, 'Expected exact 2 ballot rows in public.judgements');
  }
  return { passed: true, roomId: expectedRoomId, clashId: expectedClashId, actorId: expectedActorId, side: expectedSide, controlState: matchingNodeCount > 0 ? 'disabled' : 'absent', actorCRowCount: 1 };
}

async function evaluateDuplicateBallotProbe({ authorized = false, budgetRemaining = 0, probeFn = null, clashId, expectedActorId, queryJudgementsFn }) {
  if (!authorized || !Number.isInteger(budgetRemaining) || budgetRemaining < 1 || typeof probeFn !== 'function') {
    return { status: 'NOT TESTED', executed: false, reason: 'Optional single-budget duplicate API probe requires fresh authorization and budget' };
  }
  let rejection = null;
  try {
    const res = await probeFn();
    if (res && (res.rejected === true || res.status === 409 || /23505|already_judged|duplicate/i.test(String(res.code || res.message || res.error || '')))) {
      rejection = String(res.code || res.status || res.error || res.message);
    } else {
      a.fail('Authorized duplicate API probe succeeded instead of rejecting duplicate ballot');
    }
  } catch (err) {
    const msg = String(err?.code || '') + ' ' + String(err?.message || err || '');
    a.match(msg, /23505|409|already_judged|duplicate/i, `Unexpected duplicate probe error: ${msg}`);
    rejection = msg.trim();
  }
  const after = await queryJudgementsFn(clashId);
  a.equal(after.filter((j) => j.juror_id === expectedActorId).length, 1, 'Duplicate API probe mutated Actor C ballot count');
  return { status: 'PASS', executed: true, rejection };
}

function verifySettledVerdictUi({ xml, expectedRoomId, expectedClashId, expectedTopic, expectedProposition, authoritativeVerdict, fighterAName, fighterBName, pngBuffer, hermesState }) {
  a.equal(typeof xml, 'string', 'Settled UI XML required');
  a.ok(xml.length > 0, 'Settled UI XML empty');
  const normalizedXml = norm(xml);
  for (const bad of BLOCKED_MARKERS) a.ok(!normalizedXml.includes(bad), `Settled verification rejected non-settled/blocked screen '${bad}'`);
  const nodes = parseNodes(xml);
  for (const n of nodes) {
    a.ok(!NON_SETTLED_RE.test(norm(n.text)) && !NON_SETTLED_RE.test(norm(n.contentDesc)), `Non-settled phase indicator '${n.text || n.contentDesc}' present on settled screen`);
  }
  assertXmlIdentity(nodes, decodeXml(xml), expectedRoomId, expectedClashId, true);
  if (hermesState) {
    a.equal(hermesState.roomId, expectedRoomId, 'Hermes settled roomId mismatch');
    a.equal(hermesState.clashId, expectedClashId, 'Hermes settled clashId mismatch');
    a.equal(normalizeSettledStatus(hermesState.status), 'settled', `Hermes room status '${hermesState.status}' must be settled`);
    if (hermesState.phase !== undefined) {
      a.equal(hermesState.phase, 'closed', `Hermes room phase '${hermesState.phase}' must be closed`);
    }
    if (hermesState.duelStatus !== undefined) {
      a.equal(hermesState.duelStatus, 'settled', `Hermes duel status '${hermesState.duelStatus}' must be lowercase settled`);
    }
  }
  a.ok(normalizedXml.includes('Official verdict'), 'Settled UI missing Official verdict marker');
  const topicNeedles = [expectedTopic, expectedProposition].filter((v) => typeof v === 'string' && v.trim().length > 0).map(norm);
  a.ok(topicNeedles.length > 0 && topicNeedles.some((t) => normalizedXml.includes(t)), 'Settled UI missing matching clash topic/proposition');

  a.ok(authoritativeVerdict && ['A', 'B', 'DRAW'].includes(authoritativeVerdict.winner_side), 'Authoritative verdict winner_side required');
  if (authoritativeVerdict.winner_side === 'A') a.ok(typeof fighterAName === 'string' && fighterAName.trim(), 'fighterAName required for Side A verdict');
  if (authoritativeVerdict.winner_side === 'B') a.ok(typeof fighterBName === 'string' && fighterBName.trim(), 'fighterBName required for Side B verdict');
  const expectedWinner = authoritativeVerdict.winner_side === 'DRAW' ? 'Official winner: DRAW'
    : authoritativeVerdict.winner_side === 'A' ? `Official winner: SIDE A · ${norm(fighterAName)}` : `Official winner: SIDE B · ${norm(fighterBName)}`;
  a.ok(normalizedXml.includes(expectedWinner), `Settled UI missing expected winner '${expectedWinner}'`);
  for (const alt of ['Official winner: DRAW', 'Official winner: SIDE A', 'Official winner: SIDE B']) {
    if (!expectedWinner.startsWith(alt)) a.ok(!normalizedXml.includes(alt), `Conflicting winner label '${alt}' found on settled screen`);
  }
  const { jury_size: n, side_a_score: sa, side_b_score: sb } = authoritativeVerdict;
  a.ok(Number.isSafeInteger(n) && Number.isSafeInteger(sa) && Number.isSafeInteger(sb) && sa + sb === n, 'Invalid authoritative verdict scores');
  const expectedTally = `Community verdict · ${n} ballot${n === 1 ? '' : 's'} · A ${sa} · B ${sb}`;
  a.ok(normalizedXml.includes(expectedTally), `Settled UI missing expected ballot tally '${expectedTally}'`);
  if (n > 0 && fighterAName && fighterBName) {
    a.ok(normalizedXml.includes(`${norm(fighterAName)}, Fighter A, ${Math.round((sa / n) * 100)}% of the panel`), 'Fighter A percentage share mismatch');
    a.ok(normalizedXml.includes(`${norm(fighterBName)}, Fighter B, ${Math.round((sb / n) * 100)}% of the panel`), 'Fighter B percentage share mismatch');
  }
  const screenshot = verifyValidPngBuffer(pngBuffer);
  return { passed: true, roomId: expectedRoomId, clashId: expectedClashId, status: 'settled', winnerLabel: expectedWinner, juryLabel: expectedTally, screenshot };
}

module.exports = {
  parseNodes, decodeXml, normalizeSettledStatus, verifyValidPngBuffer, verifyPostVoteState, evaluateDuplicateBallotProbe, verifySettledVerdictUi,
};
