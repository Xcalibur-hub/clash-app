'use strict';
// Source guard for request-origin vs current viewport. Runtime tests prove races.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = fs.readFileSync(path.join(__dirname, '..', 'app/world/index.tsx'), 'utf8').replace(/\r\n/g, '\n');
const block = (start, end) => {
  const a = s.indexOf(start), b = s.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Missing World pan contract boundary: ' + start);
  return s.slice(a, b);
};
const origin = block('  const recordQueryOrigin = ', '  const onFilterChange = async');
const filter = block('  const onFilterChange = async', '  const searchThisArea = async');
const area = block('  const searchThisArea = async', '  const recenter = async');
const locate = block('  const recenter = async', '  const zoomToCluster =');
assert.match(origin, /latestDiscovery\.current\.centre/, 'completion compares request origin to latest viewport');
assert.match(origin, /regionMovedSignificantly/, 'significant camera movement controls search action');
assert.match(filter, /const requestRegion = region/, 'filter snapshots requested viewport');
assert.match(area, /const requestRegion = region/, 'area search snapshots requested viewport');
assert.match(filter, /recordQueryOrigin\(requestRegion\)/, 'filter commits requested origin');
assert.match(area, /recordQueryOrigin\(requestRegion\)/, 'area search commits requested origin');
assert.match(locate, /recordQueryOrigin\(next\)/, 'Locate commits one-shot query origin');
assert.match(s, /onRegionChangeComplete=\{\(next\) => \{\s*latestDiscovery\.current\.centre = next/, 'map callback updates latest camera ref immediately');
console.log('World pan-during-fetch source contract: 8 checks passed (runtime races tested separately).');
