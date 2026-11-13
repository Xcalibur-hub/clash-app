const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const result = spawnSync(process.execPath, [path.join(__dirname, 'build.cjs'), '--negative-control'],
  { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
assert.ifError(result.error);
assert.equal(result.signal, null);
assert.equal(result.status, 1, 'Mutated implementation must fail behavioral assertions');
assert.match(result.stdout, /MUTATION_APPLIED:/);
assert.match(result.stdout, /POST_WATCH_RECOVERY: no post-admission transcript read/);
assert.match(result.stdout, /# pass 2\r?\n# fail 5/);
console.log('PASS: negative control rejected broken recovery (5 behavioral failures; child exit 1)');
