'use strict';

/**
 * Source-contract regression for World location consent.
 * Run: node scripts/world-consent-check.cjs
 * This guards the screen's entrypoint; it is NOT an Android permission test.
 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, '..', 'app', 'world', 'index.tsx'), 'utf8');
const between = (start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a !== -1 && b > a, 'World screen contract boundaries must remain present');
  return source.slice(a, b);
};

const bootstrap = between('  const bootstrap = React.useCallback(', '  React.useEffect(() => {\n    void bootstrap();');
const recenter = between('  const recenter = async', '  const zoomToCluster =');

assert.match(source, /useState<WorldFilter>\('recent'\)/, 'default to permission-free Recent');
assert.match(bootstrap, /loadDropsFor\('recent', FALLBACK_REGION\)/, 'load Recent on entry');
assert.doesNotMatch(bootstrap, /getOneShotLocation|requestForegroundPermission|getForegroundPermission|fetchNearbyWorldDrops/, 'entry must not read or request location');
assert.match(recenter, /requestForegroundPermission\(\)/, 'recenter may request foreground permission');
assert.match(recenter, /getOneShotLocation\(\)/, 'recenter reads only after explicit user action');
assert.match(source, /accessibilityLabel="Use my location to recenter map"/, 'location action is explicitly labeled');
assert.doesNotMatch(source, /watchPositionAsync|requestBackgroundPermissionsAsync/, 'World screen must not track in background');

process.stdout.write('World consent source contract: 7 checks passed (device behavior not tested).\n');
