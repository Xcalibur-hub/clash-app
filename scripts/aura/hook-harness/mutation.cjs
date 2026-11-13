const fs = require('node:fs');
const assert = require('node:assert/strict');
module.exports = {
  name: 'remove-post-watch-recovery',
  setup(build) {
    build.onLoad({ filter: /[\\/]hooks[\\/]useLiveArenaRoom\.ts$/ }, ({ path }) => {
      const source = fs.readFileSync(path, 'utf8');
      const start = source.indexOf('const watchAsSpectator =');
      assert.ok(start >= 0, 'Watch callback not found');
      const head = source.slice(0, start), tail = source.slice(start);
      const recovery = /await refreshThread\(session\);\s*if \(!liveSession\(session\)\) return false;\s*await load\('refresh', session\);/g;
      assert.equal([...tail.matchAll(recovery)].length, 1, 'Expected exactly one Watch recovery sequence');
      console.log('MUTATION_APPLIED: removed both post-Watch refresh operations');
      return { contents: head + tail.replace(recovery, ''), loader: 'ts' };
    });
  },
};
