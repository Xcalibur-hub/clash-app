const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), babel = require('@babel/core');
const { renderDemo } = require('./arena-demo-render.cjs');
const { createDemoState, demoReducer, visibleDemoAssists, demoDuel } = require('../components/dev/arenaDemo/model.ts');
const { arenaDemoAllowed } = require('../utils/arenaDemoGate.ts');
const { withArenaDemoGuard } = require('./arena-demo-resolver.cjs');
const now = Date.now(), action = (s, a) => demoReducer(s, a);

test('only development JS inside the development native identity can enter demo', () => {
  for (const dev of [true, false]) for (const variant of ['development', 'preview', 'production', undefined]) assert.equal(arenaDemoAllowed(dev, variant), dev && variant === 'development');
});
test('Metro excludes fixture entry from release and missing-dev contexts, retaining upstream resolution', () => {
  let called = 0; const resolve = withArenaDemoGuard(() => { called++; return { type: 'sourceFile', filePath: 'normal' }; }, 'C:/demo');
  for (const dev of [false, undefined]) assert.ok(resolve({ dev }, '../components/dev/arenaDemo/entry', 'android').filePath.endsWith(path.join('arenaDemo', 'Disabled.tsx')));
  assert.equal(called, 0); resolve({ dev: true }, '../components/dev/arenaDemo/entry', 'android'); resolve({ dev: false }, './normal', 'android'); assert.equal(called, 2);
});
test('24 varied typed Takes include zero replies, heavy threads, archived, media, long names and short eligibility window', () => {
  const s = createDemoState(now); assert.equal(s.data.takes.length, 24); assert.ok(s.data.authors.some(a => a.handle.length > 35));
  assert.ok(s.data.takes.some(t => t.replies === 0)); assert.ok(s.data.takes.some(t => t.replies >= 40)); assert.ok(s.data.takes.some(t => t.take.status === 'expired'));
  assert.deepEqual(new Set(s.data.takes.flatMap(t => t.media ? [t.media] : [])), new Set(['image', 'video', 'gif']));
  assert.ok(s.data.takes.every(t => t.take.id.startsWith('demo-'))); assert.ok(s.data.groups.every(g => !g.avatarUrl && !g.bannerUrl));
});
test('immutable local actions cannot mutate another session or app-store-like owner objects', () => {
  const s = createDemoState(now), other = createDemoState(now), original = JSON.stringify(s);
  const next = action(s, { type: 'save', id: 'demo-take-0' }); assert.equal(JSON.stringify(s), original); assert.equal(other.saved.length, 0); assert.deepEqual(next.saved, ['demo-take-0']);
  assert.equal(action(next, { type: 'reset', now }).saved.length, 0);
});
test('archived / near-deadline demo challenges retain PR75’s veto; valid challenge stays local and pending', () => {
  let s = createDemoState(now); const text = 'A thoughtful counter-position for this visual demonstration.';
  for (const id of ['demo-take-4', 'demo-take-14']) { s = action(s, { type: 'challenge', id, text, at: now }); assert.equal(s.challenges[id], undefined); }
  s = action(s, { type: 'challenge', id: 'demo-take-0', text, at: now }); assert.equal(s.challenges['demo-take-0'], text);
});
test('local replies, nested replies, stance and archived refusal do not reach any transport', () => {
  let s = createDemoState(now), size = s.replies['demo-take-0'].length;
  s = action(s, { type: 'reply', id: 'demo-take-0', text: 'Local nested reply', parentId: 'demo-reply-0', at: now }); assert.equal(s.replies['demo-take-0'].length, size + 1);
  s = action(s, { type: 'stance', id: 'demo-take-0', stance: 'Agree', at: now }); assert.equal(s.stances['demo-take-0'], 'Agree');
  size = s.replies['demo-take-4'].length; s = action(s, { type: 'reply', id: 'demo-take-4', text: 'No', at: now }); assert.equal(s.replies['demo-take-4'].length, size);
});
test('Crowd retry keys deduplicate; terminal events deny local chat', () => {
  let s = createDemoState(now); const size = s.crowd.length, a = { type: 'crowd', text: 'A local demo message', key: 'stable' };
  s = action(action(s, a), a); assert.equal(s.crowd.length, size + 1);
  s = action(s, { type: 'phase', phase: 'CANCELLED' }); assert.equal(action(s, { ...a, key: 'new' }).crowd.length, size + 1);
});
test('spectators cannot publish official arguments; fighter transcript stays separate from Crowd', () => {
  let s = createDemoState(now); const size = s.official.length; s = action(s, { type: 'official', text: 'Spectator cannot publish' }); assert.equal(s.official.length, size);
  s = action(s, { type: 'role', role: 'fighter_a' }); s = action(s, { type: 'official', text: 'A local fighter contribution' }); assert.equal(s.official.length, size + 1); assert.equal(s.crowd.length, 18);
});
test('recipient-only assists: acceptance is unpublished; explicit publication is exactly once', () => {
  let s = createDemoState(now); s = action(s, { type: 'assist', target: 'A', text: 'Private local evidence', media: 'image' }); const id = s.assists.at(-1).id;
  s = action(s, { type: 'role', role: 'fighter_b' }); assert.ok(!visibleDemoAssists(s).some(a => a.id === id));
  s = action(s, { type: 'assist-decision', id, decision: 'accepted' }); assert.equal(s.assists.at(-1).status, 'pending');
  s = action(s, { type: 'role', role: 'fighter_a' }); s = action(s, { type: 'assist-decision', id, decision: 'accepted' }); const size = s.official.length; assert.equal(s.assists.at(-1).published, false);
  s = action(action(s, { type: 'assist-publish', id }), { type: 'assist-publish', id }); assert.equal(s.official.length, size + 1); assert.equal(s.crowd.length, 18);
});
test('rejection, terminal read-only, single group membership and scripted DRAW stay in local state', () => {
  let s = createDemoState(now); s = action(s, { type: 'role', role: 'fighter_a' }); s = action(s, { type: 'assist-decision', id: 'demo-assist-a', decision: 'rejected' });
  assert.equal(action(s, { type: 'assist-publish', id: 'demo-assist-a' }).official.length, 2);
  s = action(s, { type: 'join', id: 'demo-group-1' }); assert.equal(s.joined, 'demo-group-1');
  s = action(s, { type: 'phase', phase: 'DRAW' }); assert.equal(demoDuel(s).verdict.winnerSide, 'DRAW');
  assert.equal(action(s, { type: 'official', text: 'Closed' }).official.length, 2);
});
test('nested navigation, Back and reset affect only the demo', () => {
  let s = createDemoState(now); s = action(s, { type: 'navigate', page: { kind: 'take', id: 'demo-take-0' } }); s = action(s, { type: 'open-room', id: 'demo-take-0', phase: 'OPEN' });
  s = action(s, { type: 'back' }); assert.equal(s.page.kind, 'take'); s = action(s, { type: 'back' }); assert.equal(s.page.kind, 'home'); assert.equal(s.history.length, 0);
});
test('compiled demo modules have no runtime services, app-store, auth, persistence or networking calls', () => {
  const folder = path.resolve(__dirname, '../components/dev/arenaDemo');
  for (const name of fs.readdirSync(folder).filter(f => /\.tsx?$/.test(f))) {
    const compiled = babel.transformSync(fs.readFileSync(path.join(folder, name), 'utf8'), { filename: name, babelrc: false, configFile: false, presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]], plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
    assert.doesNotMatch(compiled, /require\([^)]*(?:\/services\/|\/store(?:["'/])|AuthProvider|async-storage)/, name);
    assert.doesNotMatch(compiled, /\bfetch\s*\(|\bnew WebSocket|\.rpc\s*\(|(?<!Array)\.from\s*\(|AsyncStorage|\.setItem\(/, name);
  }
});
for (const kind of ['home', 'take', 'groups', 'discover', 'live', 'room']) test(`actual ${kind} demo renders labeled content offline with service imports blocked`, () => {
  const result = renderDemo(kind); assert.ok(result.html.includes('DEMO')); assert.equal(result.blockedCalls, 0);
  assert.ok(!result.html.includes('https://'), 'no hosted media or profile URLs');
  let buttons = 0;
  for (const tag of result.html.match(/<button\b[^>]*>|<\/button>/g) ?? []) {
    buttons += tag.startsWith('</') ? -1 : 1;
    assert.ok(buttons <= 1 && buttons >= 0, 'No nested press targets that break browser/native preview navigation');
  }
  assert.equal(buttons, 0);
});

test('each varied discovery pair matches the actual Room opened by its local adapter',()=>{
  const state=createDemoState(now),html=renderDemo('live').html,indices=[0,1,2,3,5,6];
  const cards=[...html.matchAll(/aria-label="Watch Clash[^"]*"/g)];assert.equal(cards.length,indices.length);
  const escape=text=>text.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#x27;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const pairs=new Set();indices.forEach(index=>{const i=cards.findIndex(match=>match[0].includes(escape(state.data.takes[index].take.text)));assert.ok(i>=0,'Ranked discovery must retain its source Take');const duel=demoDuel({...state,page:{kind:'room',id:state.data.takes[index].take.id}}),card=html.slice(cards[i].index,cards[i+1]?.index??html.length);for(const fighter of [duel.fighterA,duel.fighterB])assert.ok(card.includes(fighter.name),'Card and Room identity mismatch: '+fighter.name);pairs.add(duel.fighterA.id+duel.fighterB.id);});assert.ok(pairs.size>=3,'Demo must show varied pairs');
});
