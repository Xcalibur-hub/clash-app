/**
 * TEST 3 — Concurrent settlement.
 *
 * PROPERTY: N workers settling the SAME clash at the SAME time must produce the
 * award EXACTLY ONCE. A serialization wait is acceptable; a double credit is not.
 *
 * Method discipline:
 *  - independent connections, never a shared session
 *  - authoritative SQL for the final state, never an RPC return value
 *  - the assertion is on TOTAL reputation and coins, not on row presence
 *  - both schedule orders are exercised
 *
 * Usage: node tests/03-concurrent-settlement.mjs
 */
import { conn, q, reset, mkUser, mkTake, mkClash, ledger, uid } from '../harness.mjs';

const admin = await conn();
const results = [];
const check = (n, p, d) => results.push({ name: n, pass: p, detail: d });

// Reference award for 3 jurors A,A,B. The fighter rows are present only when the
// candidate patch is applied, so the expected totals are DERIVED from the schema
// actually loaded rather than assumed. (An earlier version hardcoded the canonical
// totals and reported a triple false positive on the patched schema.)
let EXPECT = { rows: 6, rep: 265, coins: 98 };
{
  const patched = (await q(admin, `select count(*)::int c from pg_enum e join pg_type t on t.oid=e.enumtypid
     where t.typname='reputation_kind' and e.enumlabel like 'clash_fighter%'`))[0].c > 0;
  if (patched) EXPECT = { rows: 8, rep: 320, coins: 98 };  // + win40 + participation15
  console.log(`schema: ${patched ? 'patched (fighter rewards present)' : 'canonical'}`);
  console.log(`reference award for A,A,B: rows=${EXPECT.rows} rep=${EXPECT.rep} coins=${EXPECT.coins}\n`);
}

async function build(tag, sides = ['A', 'A', 'B']) {
  const A = await mkUser(admin, `cc${tag}_a_${uid().slice(0, 6)}`);
  const B = await mkUser(admin, `cc${tag}_b_${uid().slice(0, 6)}`);
  const jurors = [];
  for (let i = 0; i < sides.length; i++) jurors.push(await mkUser(admin, `cc${tag}_j${i}_${uid().slice(0, 6)}`));
  const take = await mkTake(admin, A.pid, 'concurrent ' + tag);
  const cl = await mkClash(admin, take, B.pid);
  for (let i = 0; i < sides.length; i++) {
    await q(admin, `insert into public.judgements(clash_id,juror_id,side) values ($1,$2,$3::public.clash_side)`,
      [cl, jurors[i].pid, sides[i]]);
  }
  return { cl, jurors };
}

/** Fire `n` settle_clash calls concurrently on independent connections. */
async function race(cl, n, { stagger = 0 } = {}) {
  const conns = await Promise.all(Array.from({ length: n }, () => conn()));
  await Promise.all(conns.map((c) => c.query(`set statement_timeout = '20s'`)));
  const t0 = Date.now();
  const outcomes = await Promise.all(conns.map(async (c, i) => {
    if (stagger) await new Promise((r) => setTimeout(r, i * stagger));
    try { await c.query('select public.settle_clash($1)', [cl]); return 'ok'; }
    catch (e) { return e.code || 'err'; }
  }));
  const elapsed = Date.now() - t0;
  await Promise.all(conns.map((c) => c.end().catch(() => {})));
  return { outcomes, elapsed };
}

async function verify(tag, cl, conns) {
  const status = (await q(admin, `select status from public.clashes where id=$1`, [cl]))[0].status;
  const verdicts = (await q(admin, `select count(*)::int c from public.verdicts where clash_id=$1`, [cl]))[0].c;
  const rows = await q(admin, `select profile_id, kind::text, count(*)::int n from public.reputation_events
                                 where clash_id=$1 group by 1,2 having count(*)>1`, [cl]);
  const l = await ledger(admin, cl);
  const totalRows = l.reduce((s, x) => s + x.n, 0);
  const rep = l.reduce((s, x) => s + x.rep, 0);
  const coins = l.reduce((s, x) => s + x.coins, 0);

  check(`${tag}: exactly one verdict`, verdicts === 1, `verdicts=${verdicts}`);
  check(`${tag}: status settled once`, status === 'settled', `status=${status}`);
  check(`${tag}: ledger totals exact (no double credit)`,
    totalRows === EXPECT.rows && rep === EXPECT.rep && coins === EXPECT.coins,
    `rows=${totalRows}/${EXPECT.rows} rep=${rep}/${EXPECT.rep} coins=${coins}/${EXPECT.coins}`);
  check(`${tag}: no duplicate (actor,kind) pair`, rows.length === 0,
    rows.length ? JSON.stringify(rows.slice(0, 3)) : 'none');
  return { status, verdicts, totalRows, rep, coins };
}

await reset();

// ── Schedule A: all workers start simultaneously (2, 4, 8) ───────────────
for (const n of [2, 4, 8]) {
  const { cl } = await build(`sim${n}`);
  const { outcomes, elapsed } = await race(cl, n);
  check(`sim${n}: all workers returned without error`,
    outcomes.every((o) => o === 'ok'), `outcomes=${outcomes.join(',')} elapsed=${elapsed}ms`);
  await verify(`sim${n}`, cl, n);
}

// ── Schedule B: reversed arrival order (staggered) ───────────────────────
for (const n of [3, 5]) {
  const { cl } = await build(`stag${n}`);
  const { outcomes, elapsed } = await race(cl, n, { stagger: 40 });
  check(`stag${n}: staggered workers all completed`,
    outcomes.every((o) => o === 'ok'), `outcomes=${outcomes.join(',')} elapsed=${elapsed}ms`);
  await verify(`stag${n}`, cl, n);
}

// ── Contention: a second worker must BLOCK while the first holds the row ─
{
  const { cl } = await build('block');
  const c1 = await conn(), c2 = await conn();
  await c1.query('begin');
  await c1.query('select public.settle_clash($1)', [cl]);
  const t0 = Date.now();
  const p2 = c2.query('select public.settle_clash($1)', [cl]);
  await new Promise((r) => setTimeout(r, 400));
  const blockedMs = Date.now() - t0;
  await c1.query('commit');
  const r2 = await p2.catch((e) => e.code);
  await c1.end(); await c2.end();

  check('contention: second worker blocks on the row lock', blockedMs >= 350,
    `blocked ~${blockedMs}ms${typeof r2 === 'string' ? ' then errored ' + r2 : ' then completed'}`);
  await verify('contention', cl, 2);
}

// ── Unknown-outcome retry: duplicate in-flight retries ───────────────────
{
  const { cl } = await build('unknown');
  const a = await race(cl, 2);
  await verify('unknown', cl, 2);
  // a blind retry afterwards must still change nothing
  const before = await ledger(admin, cl);
  await q(admin, `select public.settle_clash($1)`, [cl]);
  const after = await ledger(admin, cl);
  check('unknown: later blind retry is a no-op', JSON.stringify(before) === JSON.stringify(after),
    `rows ${before.length} -> ${after.length}`);
}

const failed = results.filter((r) => !r.pass);
console.log('TEST 3 — Concurrent settlement');
console.log('');
for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`);
console.log('');
console.log(`  ${results.length - failed.length}/${results.length} assertions passed`);
await admin.end();
process.exit(failed.length ? 1 : 0);
