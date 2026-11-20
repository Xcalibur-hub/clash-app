const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'utils', 'authoritativeReactionRead.integration.test.ts');
let s = fs.readFileSync(file, 'utf8');

s = s.replace(
  `read: async (id) => {
      const notify = started.get(id);
      if (notify) notify.resolve();
      const gate = gates.get(id);
      if (gate) return gate.promise;
      return fire(0);
    },`,
  `read: async (id) => {
      const notify = started.get(id);
      if (notify) { notify.resolve(); started.delete(id); }
      const gate = gates.get(id);
      if (gate) { gates.delete(id); return gate.promise; }
      return fire(0);
    },`,
);

s = s.replace(
  `await Promise.resolve();
    assert.equal(reads.length, 1);
    const pendingB = q.readAuthoritative({
      messageId: 'm1', session, isLiveSession: () => true,
      isLoaded: () => true,
    });
    await Promise.resolve();
    assert.equal(reads.length, 2);`,
  `for (let i = 0; i < 20 && reads.length < 1; i++) await Promise.resolve();
    assert.equal(reads.length, 1);
    const pendingB = q.readAuthoritative({
      messageId: 'm1', session, isLiveSession: () => true,
      isLoaded: () => true,
    });
    for (let i = 0; i < 20 && reads.length < 2; i++) await Promise.resolve();
    assert.equal(reads.length, 2);`,
);

s = s.replace(
  `await Promise.resolve();
    const pendingB = q.readAuthoritative({
      messageId: 'm1', session, isLiveSession: () => true, isLoaded: () => true,
    });
    await Promise.resolve();
    reads[1].resolve(fire(9, true));`,
  `for (let i = 0; i < 20 && reads.length < 1; i++) await Promise.resolve();
    const pendingB = q.readAuthoritative({
      messageId: 'm1', session, isLiveSession: () => true, isLoaded: () => true,
    });
    for (let i = 0; i < 20 && reads.length < 2; i++) await Promise.resolve();
    assert.equal(reads.length, 2);
    reads[1].resolve(fire(9, true));`,
);

fs.writeFileSync(file, s);
console.log('patched fixtures');
