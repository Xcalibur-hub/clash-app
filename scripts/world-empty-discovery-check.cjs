'use strict';

// Lightweight UI contract; not a substitute for native rendering or runtime races.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const source = readFileSync(join(__dirname, '..', 'app', 'world', 'index.tsx'), 'utf8').replace(/\r\n/g, '\n');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'Missing World section: ' + start);
  return source.slice(from, to);
};
const empty = section('        {!loading && !searching && drops.length === 0', '      </View>\n\n      <View style={[styles.bottomChrome');
const filter = section('  const onFilterChange = async', '  const searchThisArea = async');
const area = section('  const searchThisArea = async', '  const recenter = async');
const locate = section('  const recenter = async', '  const zoomToCluster =');
assert.match(empty, /No Drops in this area/, 'map-area empty state');
assert.match(empty, /No Mission Drops yet/, 'mission empty state');
assert.match(empty, /No active Mission/, 'truthful state when no mission exists');
assert.match(empty, /No recent Drops yet/, 'recent empty state');
assert.match(empty, /Explore map area/, 'map discovery action');
assert.match(empty, /Browse recent Drops/, 'recent discovery action');
assert.match(empty, /Join Mission/, 'mission action');
assert.match(empty, /onPress={participate}/, 'mission CTA retains auth gate');
assert.match(empty, /!searching/, 'no false empty state during pending queries');
for (const [label, block] of [['filter', filter], ['area', area], ['locate', locate]]) {
  assert.match(block, /setDrops\(\[\]\)/, label + ' clears old markers before loading');
}
assert.doesNotMatch(empty, /requestForegroundPermission|getOneShotLocation/, 'empty state never requests location');
console.log('World empty discovery source contract: 13 checks passed (native behavior not tested).');
