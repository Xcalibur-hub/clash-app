const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'utils', 'authoritativeReactionRead.test.ts');
let s = fs.readFileSync(file, 'utf8');

const r6From = `second.resolve(fire(2, true));
    await Promise.resolve();
    first.resolve(fire(8, true));
    const [oa, ob] = await Promise.all([a, b]);
    assert.equal(ob.status, 'applied');
    assert.equal(oa.status, 'skipped');
    assert.equal((oa as { reason: string }).reason, 'superseded');
    assert.equal(rows[0].reactions[0].count, 2);`;

const r6To = `second.resolve(fire(2, true));
    const ob = await b;
    assert.equal(ob.status, 'applied');
    assert.equal(rows[0].reactions[0].count, 2);
    first.resolve(fire(8, true));
    const oa = await a;
    assert.equal(oa.status, 'skipped');
    assert.equal((oa as { reason: string }).reason, 'superseded');
    assert.equal(rows[0].reactions[0].count, 2);`;

const applyFrom = `const applyRead = (messageId: string, next: ArenaReaction[] | null, snapshot: number): boolean => {
    if (fault === 'no-snapshot') {
      applyWrite(messageId, next);
      return true;
    }`;

const applyTo = `const applyRead = (messageId: string, next: ArenaReaction[] | null, snapshot: number): boolean => {
    if (fault === 'no-snapshot' || fault === 'no-membership') {
      applyWrite(messageId, next);
      return true;
    }`;

const toggleFrom = `it('fault: missing toggle supersession lets delayed read clobber a local toggle', async () => {
    const h = harness({ fault: 'no-snapshot' });
    h.server.set('m1', fire(0, false));
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const pending = h.read(h.session());
    await Promise.resolve();
    h.gates.delete('m1');
    await h.queue.enqueue('m1', 'fire', () => true);
    assert.equal(h.count(), 1);
    gate.resolve(fire(0, false));
    assert.equal((await pending).status, 'applied');
    assert.equal(h.count(), 0, 'toggle supersession missing: read clobbered toggle');
  });`;

const toggleTo = `it('fault: missing toggle supersession lets delayed read clobber a local toggle', async () => {
    const h = harness();
    h.server.set('m1', fire(0, false));
    const gate = deferred<readonly ArenaReaction[] | null>();
    h.gates.set('m1', gate);
    const pending = h.queue.readAuthoritative({
      ...h.readInput(h.session()),
      applyRead: (id, next) => {
        h.rows = next === null
          ? h.rows.filter((row) => row.id !== id)
          : h.rows.map((row) => (row.id === id ? { ...row, reactions: next } : row));
        return true;
      },
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    h.gates.delete('m1');
    await h.queue.enqueue('m1', 'fire', () => true);
    assert.equal(h.count(), 1);
    gate.resolve(fire(0, false));
    assert.equal((await pending).status, 'applied');
    assert.equal(h.count(), 0, 'toggle supersession missing: read clobbered toggle');
  });`;

for (const [name, from, to] of [
  ['r6', r6From, r6To],
  ['apply', applyFrom, applyTo],
  ['toggle', toggleFrom, toggleTo],
]) {
  if (!s.includes(from)) {
    console.error('missing block', name);
    process.exit(1);
  }
  s = s.replace(from, to);
}
fs.writeFileSync(file, s);
console.log('patched unit fixes');
