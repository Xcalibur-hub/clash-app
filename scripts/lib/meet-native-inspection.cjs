const assert = require('node:assert/strict');

// Legacy Android dump XML contains display-clipped rectangles, not raw nodes.
// Never reconstruct an unseen part of a target or count it as a small hit area.
function assessTarget({ bounds, display, dumpDisplay, source, density, minimumDp = 44, imeTop }) {
  assert.ok(['legacy-dump', 'raw-node'].includes(source), 'Unknown bounds provenance');
  assert.ok(Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite));
  assert.ok(display?.length === 2 && display.every(x => Number.isFinite(x) && x > 0));
  assert.ok(Number.isFinite(density) && density > 0);
  assert.ok(Number.isFinite(minimumDp) && minimumDp > 0);
  assert.ok(imeTop === undefined || (Number.isFinite(imeTop) && imeTop >= 0 && imeTop <= display[1]));
  const [left, top, right, bottom] = bounds;
  if (right <= left || bottom <= top) return { status: 'unknown', reason: 'empty_bounds' };
  if (source === 'legacy-dump') {
    assert.ok(dumpDisplay?.length === 2 && dumpDisplay.every(x => Number.isFinite(x) && x > 0));
    if ((dumpDisplay[0] < display[0] && right >= dumpDisplay[0]) ||
        (dumpDisplay[1] < display[1] && bottom >= dumpDisplay[1])) {
      return { status: 'unknown', reason: 'legacy_display_clipping' };
    }
  }
  if (left < 0 || top < 0 || right > display[0] || bottom > display[1]) {
    return { status: 'fail', reason: 'outside_display' };
  }
  if (imeTop !== undefined && bottom > imeTop) return { status: 'fail', reason: 'ime_overlap' };
  const minimumPx = Math.floor(minimumDp * density); // Native pixel rounding.
  if (right - left < minimumPx || bottom - top < minimumPx) {
    return { status: 'fail', reason: 'reported_target_too_small' };
  }
  return { status: 'pass', reason: 'reported_bounds_adequate', hitTestVerified: false };
}

// The caller must independently verify image content and transition completion.
// A populated accessibility tree alone is not a painted or stable screen.
function assessCapturePair(previous, current) {
  const required = current.state === 'active' ? ['back', 'input', 'send'] :
    current.state === 'terminal' ? ['back', 'leave'] : [];
  if (!required.length) return { ready: false, reason: 'unsupported_state' };
  for (const frame of [previous, current]) {
    if (!frame || frame.layoutReady !== true || frame.transitionComplete !== true ||
        frame.imageContentVerified !== true || typeof frame.scope !== 'string' || !frame.scope ||
        !['light', 'dark'].includes(frame.theme) || typeof frame.geometryKey !== 'string' || !frame.geometryKey) {
      return { ready: false, reason: 'presentation_not_verified' };
    }
    if (required.some(key => frame.targets?.[key]?.status !== 'pass')) {
      return { ready: false, reason: 'target_bounds_not_verified' };
    }
  }
  if (!Number.isFinite(previous.atMs) || !Number.isFinite(current.atMs) ||
      current.atMs <= previous.atMs || previous.scope !== current.scope ||
      previous.state !== current.state || previous.theme !== current.theme ||
      previous.geometryKey !== current.geometryKey) {
    return { ready: false, reason: 'fresh_stable_pair_required' };
  }
  return { ready: true, reason: 'verified_capture_pair', hitTestVerified: false };
}

module.exports = { assessTarget, assessCapturePair };
