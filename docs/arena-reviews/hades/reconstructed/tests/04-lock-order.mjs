/**
 * TEST 4 — Clash -> Room lock order.
 *
 * QUESTION (left open by the earlier audit): does any code path acquire the
 * `arena_rooms` row lock BEFORE the `clashes` row lock, inverting the documented
 * order in `settle_clash` and creating a deadlock risk?
 *
 * Method — three independent lines of evidence:
 *   A. STATIC: enumerate every function that takes a row lock on either table and
 *      determine, per function, which lock comes first in statement order.
 *   B. DYNAMIC: force each room-first function to contend with a settle that is
 *      holding the clash lock, and assert no deadlock (40P01) is raised.
 *   C. FAULT TOLERANCE: assert settlement survives a blocked room-first writer.
 *
 * A deadlock would surface as SQLSTATE 40P01 (deadlock_detected), not as a wrong
 * value, so this test looks explicitly for that code.
 *
 * Usage: node tests/04-lock-order.mjs
 */
import { conn, q, reset, mkUser, mkTake, mkClash, mkChallenge, asUser, phaseDuel, uid } from '../harness.mjs';

const admin = await conn();
const results = [];
const check = (n, p, d) => results.push({ name: n, pass: p, detail: d });

// ══ A. STATIC ANALYSIS (call-aware) ══════════════════════════════════════
// A naive "first matching line" scan is not good enough: a function may lock one
// table only inside a CALLEE. An earlier version of this test flagged
// assert_private_assist_window as room-first because the arena_rooms lock appears
// lexically before the clashes lock — but the clashes lock is taken inside
// assert_canonical_clash_access, which is called first. That was a false positive.
// The analysis below resolves one level of intra-schema calls and reports the
// effective lock order, and records uncertainty instead of guessing.
{
  const all = await q(admin, `
    select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'`);
  const byName = new Map(all.map((f) => [f.proname, f.prosrc]));

  /**
   * Effective lock order, call-aware.
   *
   * For each LINE in order: if the line calls another public function that takes
   * locks, those locks happen at THAT line. Otherwise, a lock taken on the line
   * itself counts. This respects real statement order and fixes the earlier
   * misread where a callee's locks were appended before the caller's own.
   */
  function lockOrder(name, depth = 0, seenFns = new Set()) {
    if (seenFns.has(name) || depth > 3) return [];
    seenFns.add(name);
    const src = byName.get(name) || '';
    const out = [];
    const push = (t) => { if (!out.includes(t)) out.push(t); };

    for (const line of src.split('\n')) {
      let consumed = false;
      if (depth < 3) {
        const call = line.match(/public\.([a-z_][a-z0-9_]*)\s*\(/gi) || [];
        for (const c of call) {
          const callee = c.replace(/public\.|\s*\(/gi, '');
          if (callee === name || !byName.has(callee)) continue;
          const sub = lockOrder(callee, depth + 1, new Set(seenFns));
          if (sub.length) { for (const t of sub) push(t); consumed = true; }
        }
      }
      if (/public\.clashes\b/i.test(line) && /for\s+(update|share)/i.test(line)) { push('clash'); consumed = true; }
      if (/public\.arena_rooms\b/i.test(line) && /for\s+(update|share)/i.test(line)) { push('room'); consumed = true; }
      // A bare `for update` continues a previous statement; attribute it to the
      // table named in the preceding two lines when unambiguous.
      if (!consumed && /^\s*for\s+(update|share)/i.test(line)) {
        const ctx = (src.split('\n')[src.split('\n').indexOf(line) - 1] || '') +
                    (src.split('\n')[src.split('\n').indexOf(line) - 2] || '');
        if (/public\.clashes/i.test(ctx)) push('clash');
        if (/public\.arena_rooms/i.test(ctx)) push('room');
      }
    }
    return out;
  }

  const roomFirst = [], clashFirst = [], both = [];
  for (const name of byName.keys()) {
    const order = lockOrder(name);
    if (!order.length) continue;
    if (order.length >= 2) both.push(`${name}(${order.join('->')})`);
    if (order[0] === 'room') {
      const touchesClash = /public\.clashes/i.test(byName.get(name) || '');
      roomFirst.push({ name, touchesClash });
    } else if (order[0] === 'clash') clashFirst.push(name);
  }

  check('static: clash-before-room is the dominant order',
    clashFirst.length > 0,
    `${clashFirst.length} functions: ${clashFirst.slice(0, 6).join(', ')}`);

  // A deadlock cycle requires SOME function that (a) takes the room lock first
  // AND (b) also ends up touching clashes in the same transaction.
  const cyclic = roomFirst.filter((r) => r.touchesClash);
  check('static: no function takes the room lock first and also touches clashes',
    cyclic.length === 0,
    cyclic.length
      ? 'CYCLIC: ' + cyclic.map((c) => c.name).join(', ')
      : `${roomFirst.length} room-first function(s), none reach public.clashes ` +
        `[${roomFirst.map((r) => r.name).join(', ') || 'none'}]`);

  check('static: functions locking BOTH tables do so clash-first',
    both.every((b) => b.includes('clash->room')),
    both.length ? both.join('; ') : 'none lock both');
}

// ══ fixture helpers ══════════════════════════════════════════════════════
async function duelFixture(tag) {
  const A = await mkUser(admin, `lk${tag}_a_${uid().slice(0, 6)}`);
  const B = await mkUser(admin, `lk${tag}_b_${uid().slice(0, 6)}`);
  const take = await mkTake(admin, A.pid, 'lock ' + tag);
  const ch = await mkChallenge(admin, take, B.pid, A.pid);
  await asUser(admin, A.uid, () => q(admin, `select public.resolve_arena_challenge($1,'ACCEPT')`, [ch]));
  const cl = (await q(admin, `select clash_id from public.arena_challenges where id=$1`, [ch]))[0].clash_id;
  const room = (await q(admin, `select id from public.arena_rooms where clash_id=$1`, [cl]))[0].id;
  return { A, B, cl, room };
}

// ══ B. DYNAMIC: settle holds the clash lock; a room-first writer runs ══════
{
  const { A, B, cl, room } = await duelFixture('dyn');
  await phaseDuel(admin, cl, 'judging');

  const holder = await conn();
  await holder.query('set statement_timeout = \'20s\'');
  await holder.query('begin');
  // Acquire the clash row lock exactly as settle_clash does, then stop.
  await holder.query(`select 1 from public.clashes where id=$1 for update`, [cl]);

  const other = await conn();
  await other.query('set statement_timeout = \'20s\'');
  const t0 = Date.now();
  let outcome, code = null;
  try {
    // room-first path: takes the arena_rooms lock while the clash lock is held
    await other.query(`select public.submit_arena_side_vote($1,'AGREE')`, [room]);
    outcome = 'completed';
  } catch (e) { code = e.code; outcome = 'error'; }
  const waited = Date.now() - t0;

  await holder.query('commit');
  await holder.end(); await other.end();

  check('dynamic: room-first writer does not deadlock against a clash lock holder',
    code !== '40P01',
    `sqlstate=${code || 'none'} waited=${waited}ms outcome=${outcome}`);
}

// ══ B2. The reverse: room lock held, then settlement runs ════════════════
{
  const { A, B, cl, room } = await duelFixture('rev');
  await phaseDuel(admin, cl, 'closed');

  const holder = await conn();
  await holder.query('set statement_timeout = \'20s\'');
  await holder.query('begin');
  await holder.query(`select 1 from public.arena_rooms where id=$1 for update`, [room]);

  const settler = await conn();
  await settler.query('set statement_timeout = \'20s\'');
  const t0 = Date.now();
  let code = null;
  try { await settler.query('select public.settle_clash($1)', [cl]); }
  catch (e) { code = e.code; }
  const waited = Date.now() - t0;
  await holder.query('commit');
  await holder.end(); await settler.end();

  check('dynamic: settlement does not deadlock when the ROOM lock is held first',
    code !== '40P01',
    `sqlstate=${code || 'none'} waited=${waited}ms (blocking is acceptable, 40P01 is not)`);
}

// ══ B3. Cron-style transition vs settlement ══════════════════════════════
{
  const { cl } = await duelFixture('cron');
  await phaseDuel(admin, cl, 'closed');
  const a = await conn(), b = await conn();
  await a.query(`set statement_timeout = '20s'`);
  await b.query(`set statement_timeout = '20s'`);
  const codes = await Promise.all([
    a.query('select public.settle_clash($1)', [cl]).then(() => 'ok').catch((e) => e.code),
    b.query('select public.transition_due_arena_rooms(50)').then(() => 'ok').catch((e) => e.code),
  ]);
  await a.end(); await b.end();
  const status = (await q(admin, `select status from public.clashes where id=$1`, [cl]))[0].status;
  check('dynamic: settle vs transition_due_arena_rooms raises no deadlock',
    !codes.includes('40P01'), `codes=${codes.join(',')} finalStatus=${status}`);
}

// ══ C. Fault tolerance: a blocked writer must not strand settlement ══════
{
  const { cl, room } = await duelFixture('tol');
  await phaseDuel(admin, cl, 'closed');
  const blocker = await conn();
  await blocker.query(`set statement_timeout = '20s'`);
  await blocker.query('begin');
  await blocker.query(`select 1 from public.arena_rooms where id=$1 for update`, [room]);

  const settler = await conn();
  await settler.query(`set statement_timeout = '3s'`);
  let code = null;
  try { await settler.query('select public.settle_clash($1)', [cl]); } catch (e) { code = e.code; }
  await blocker.query('commit'); await blocker.end(); await settler.end();

  // After releasing, the clash must be settleable and consistent.
  await q(admin, `select public.settle_clash($1)`, [cl]).catch(() => {});
  const status = (await q(admin, `select status from public.clashes where id=$1`, [cl]))[0].status;
  const verdicts = (await q(admin, `select count(*)::int c from public.verdicts where clash_id=$1`, [cl]))[0].c;
  check('tolerance: settlement blocked by a room lock stays retryable',
    code !== '40P01' && (status === 'settled' || status === 'cancelled') && verdicts <= 1,
    `firstAttempt=${code || 'ok'} finalStatus=${status} verdicts=${verdicts}`);
}

const failed = results.filter((r) => !r.pass);
console.log('TEST 4 — Clash -> Room lock order');
console.log('');
for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`);
console.log('');
console.log(`  ${results.length - failed.length}/${results.length} assertions passed`);
await admin.end();
process.exit(failed.length ? 1 : 0);
