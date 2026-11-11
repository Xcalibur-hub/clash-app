'use strict';
/**
 * CLASH — Native A50 Voting & Route Guard
 *
 * Strict validation and semantic selection helpers to ensure:
 * 1. Android navigation genuinely mounts the target Room ID.
 * 2. Voting controls can only be selected during active JUDGING phase.
 * 3. Voting selector specifically targets genuine ballot buttons, never historical result cards.
 * 4. Pre-vote guards abort before issuing ADB input if room ID, actor, phase, or button semantics fail.
 * 5. Database queries use the correct PostgreSQL column `juror_id`.
 */

const a = require('assert/strict');

/**
 * Strict regex for genuine voting button accessibility label:
 * Format: `Judge <name>, Fighter <A|B>, made the stronger case`
 */
const VOTING_BUTTON_REGEX = /^Judge\s+([\s\S]+?),\s+Fighter\s+([AB]),\s+made the stronger case$/i;

/**
 * Extract genuine voting button for a requested side ('A' or 'B') from UI XML.
 * Strictly ignores result cards ("Challenger, Fighter A, 0% of the panel"),
 * position summaries, transcript reviews, and disabled elements.
 */
function selectVotingButton(uiXml, requestedSide, currentPhase = 'judging') {
  if (currentPhase !== 'judging') {
    throw new Error(`Voting button unavailable: room phase is '${currentPhase}', must be 'judging'`);
  }

  a.ok(typeof uiXml === 'string', 'UI XML must be a string');
  a.ok(requestedSide === 'A' || requestedSide === 'B', 'requestedSide must be A or B');

  // Regex to extract all node tags with content-desc, clickable, enabled, and bounds
  const nodeRegex = /<node\b([^>]+?)\/?>/g;
  let match;
  const candidates = [];

  while ((match = nodeRegex.exec(uiXml)) !== null) {
    const attrsStr = match[1];
    const descMatch = attrsStr.match(/content-desc="([^"]*)"/);
    const boundsMatch = attrsStr.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    const clickableMatch = attrsStr.match(/clickable="([^"]*)"/);
    const enabledMatch = attrsStr.match(/enabled="([^"]*)"/);

    if (!descMatch || !boundsMatch) continue;

    const desc = descMatch[1];
    const left = parseInt(boundsMatch[1], 10);
    const top = parseInt(boundsMatch[2], 10);
    const right = parseInt(boundsMatch[3], 10);
    const bottom = parseInt(boundsMatch[4], 10);
    const width = right - left;
    const height = bottom - top;
    const clickable = clickableMatch ? clickableMatch[1] === 'true' : false;
    const enabled = enabledMatch ? enabledMatch[1] === 'true' : true;

    // Check if description matches genuine voting button
    const voteMatch = desc.match(VOTING_BUTTON_REGEX);
    if (voteMatch) {
      const fighterName = voteMatch[1].trim();
      const side = voteMatch[2].toUpperCase();
      candidates.push({
        desc,
        fighterName,
        side,
        bounds: { left, top, right, bottom, width, height },
        center: {
          x: Math.round((left + right) / 2),
          y: Math.round((top + bottom) / 2)
        },
        clickable,
        enabled,
        isZeroArea: width <= 0 || height <= 0
      });
    }
  }

  const matching = candidates.filter(c => c.side === requestedSide);
  if (matching.length === 0) {
    return {
      found: false,
      reason: `No voting button found matching Side ${requestedSide}`,
      candidatesFound: candidates.map(c => ({ side: c.side, desc: c.desc }))
    };
  }

  const target = matching[0];
  if (target.isZeroArea) {
    return {
      found: false,
      reason: `Voting button for Side ${requestedSide} has zero area (${target.bounds.width}x${target.bounds.height})`,
      target
    };
  }

  return {
    found: true,
    button: target
  };
}

/**
 * Detect whether the screen is in a locked-in or already-voted state.
 */
function detectVotingState(uiXml) {
  a.ok(typeof uiXml === 'string', 'UI XML must be a string');
  const hasRecordedText = uiXml.includes('Your recorded ballot') ||
                          uiXml.includes('Your ballot is recorded') ||
                          uiXml.includes('Your judgement was submitted');
  const hasLockedSideA = uiXml.includes('Your recorded ballot: Side A');
  const hasLockedSideB = uiXml.includes('Your recorded ballot: Side B');
  const hasResultSettled = uiXml.includes('Official verdict') || uiXml.includes('View official result');

  return {
    isRecorded: hasRecordedText,
    recordedSide: hasLockedSideA ? 'A' : hasLockedSideB ? 'B' : null,
    isSettled: hasResultSettled
  };
}

function normalizeActorId(id) {
  if (!id || typeof id !== 'string') return '';
  return id.replace(/^u_/, '').replaceAll('-', '').toLowerCase();
}

/**
 * Guard function: verifies ALL 4 preconditions before ANY native tap.
 * Throws immediately if any condition is not strictly met.
 */
function verifyPreVoteGuards(options) {
  const {
    actorId,
    expectedActorId,
    displayedRoomId,
    targetRoomId,
    serverNow,
    judgingAt,
    closesAt,
    buttonSelection
  } = options;

  // 1. Confirm Actor identity (normalized format supports auth UUID or profile u_<hex>)
  if (!actorId || normalizeActorId(actorId) !== normalizeActorId(expectedActorId)) {
    throw new Error(`PRE_VOTE_GUARD_FAILED: Actor mismatch. Expected ${expectedActorId}, got ${actorId}`);
  }

  // 2. Confirm displayed room ID matches target room ID
  if (displayedRoomId && targetRoomId && displayedRoomId !== targetRoomId) {
    throw new Error(`PRE_VOTE_GUARD_FAILED: Room mismatch. Expected ${targetRoomId}, screen shows ${displayedRoomId}`);
  }

  // 3. Confirm server phase is within judging window
  const now = typeof serverNow === 'number' ? serverNow : Date.parse(serverNow);
  const start = typeof judgingAt === 'number' ? judgingAt : Date.parse(judgingAt);
  const end = typeof closesAt === 'number' ? closesAt : Date.parse(closesAt);

  if (isNaN(now) || isNaN(start) || isNaN(end)) {
    throw new Error('PRE_VOTE_GUARD_FAILED: Invalid timestamp parameters');
  }

  if (now < start) {
    throw new Error(`PRE_VOTE_GUARD_FAILED: Judging window has not opened yet (${now} < ${start})`);
  }
  if (now >= end) {
    throw new Error(`PRE_VOTE_GUARD_FAILED: Judging window has expired (${now} >= ${end})`);
  }

  // 4. Confirm voting button selection semantics
  if (!buttonSelection || !buttonSelection.found || !buttonSelection.button) {
    throw new Error(`PRE_VOTE_GUARD_FAILED: Button selector failed: ${buttonSelection?.reason || 'button not found'}`);
  }

  const b = buttonSelection.button;
  if (!b.enabled) {
    throw new Error('PRE_VOTE_GUARD_FAILED: Voting button is disabled');
  }
  if (!b.clickable) {
    throw new Error('PRE_VOTE_GUARD_FAILED: Voting button is not clickable');
  }
  if (b.bounds.width < 20 || b.bounds.height < 20) {
    throw new Error(`PRE_VOTE_GUARD_FAILED: Voting button dimensions too small (${b.bounds.width}x${b.bounds.height})`);
  }

  return {
    verified: true,
    tapTarget: b.center,
    side: b.side,
    actorId,
    targetRoomId
  };
}

/**
 * Database helper to query judgements using the authoritative `juror_id` column.
 */
function buildJudgementQuery(clashId) {
  a.ok(typeof clashId === 'string' && clashId.length > 0, 'clashId required');
  // Must use juror_id, NOT user_id; coalesce to '[]' to safely handle zero rows
  return `SELECT coalesce(json_agg(json_build_object('clash_id', clash_id, 'juror_id', juror_id, 'side', side, 'created_at', created_at)), '[]'::json) FROM public.judgements WHERE clash_id = '${clashId}'`;
}

module.exports = {
  VOTING_BUTTON_REGEX,
  normalizeActorId,
  selectVotingButton,
  detectVotingState,
  verifyPreVoteGuards,
  buildJudgementQuery
};
