'use strict';

// Static guard for World request-order protections. This does not simulate
// React rendering, network delays or Android location permissions.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, '..', 'app', 'world', 'index.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'World request guard section missing: ' + start);
  return source.slice(from, to);
}

const load = section('  const loadDropsFor = React.useCallback(', '  const bootstrap = React.useCallback(');
const bootstrap = section('  const bootstrap = React.useCallback(', '  React.useEffect(() => {\n    void bootstrap();');
const filters = section('  const onFilterChange = async', '  const searchThisArea = async');
const area = section('  const searchThisArea = async', '  const recenter = async');
const recenter = section('  const recenter = async', '  const zoomToCluster =');
const effect = section('  React.useEffect(() => {\n    void bootstrap();', '  const onFilterChange = async');

assert.match(source, /discoveryRequest = React\.useRef\(0\)/, 'one request generation per World screen');
assert.doesNotMatch(load, /setDrops\(/, 'fetch helper cannot mutate the feed directly');
for (const [label, block] of [['bootstrap', bootstrap], ['filter', filters], ['area', area], ['recenter', recenter]]) {
  assert.match(block, /\+\+discoveryRequest\.current/, label + ' invalidates older requests');
  assert.match(block, /request !== discoveryRequest\.current/, label + ' checks request freshness');
  assert.match(block, /setDrops\(/, label + ' commits only its current result');
}
assert.match(effect, /discoveryRequest\.current \+= 1/, 'unmount invalidates pending requests');
assert.match(recenter, /requestForegroundPermission\(\)/, 'recenter remains an explicit location action');
assert.doesNotMatch(bootstrap, /getOneShotLocation|requestForegroundPermission|getForegroundPermission/, 'bootstrap remains permission free');

process.stdout.write('World request-order source contract: 12 checks passed (runtime races not simulated).\n');
