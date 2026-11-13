/**
 * TEST 1 — Cancelled-settlement invariant.
 *
 * PROPERTY: when a clash settles with zero ballots it becomes CANCELLED, pays
 * nobody, and remains terminal — no verdict, no ledger row, no repeat payout.
 *
 * This is a POSITIVE test of the intended behaviour. It passes on the unpatched
 * baseline and must keep passing. It deliberately does not construct privileged
 * or out-of-order writes; it verifies the observable contract of the settlement
 * entry point for the states a normal caller can produce.
 *
 * (A stricter adversarial variant exists in the private review record. It is not
 * part of this package because it encodes a reproduction recipe for an unfixed
 * issue.)
 *
 * Usage: node tests/01-cancelled-settlement.mjs [--schema=baseline|patched]
 */
import { conn, q, reset, mkUser, mkTake, mkClash, mkChallenge, asUser, phaseDuel, ledger, uid } from '../harness.mjs';

const SCHEMA = (process.argv.find((a) => a.startsWith('--schema=')) || '--schema=baseline').split('=')[1];
const admin = await conn();
const results = [];
const check = (n, p, d) => results.push({ name: n, pass: p, detail: d });

/** Zero-ballot clash on a plain clash row. */
async function plainCase(tag) {
  const A = await mkUser(admin, `cs${tag}_a_${uid().slice(0, 6)}`);
  const B = await mkUser(admin, `cs${tag}_b_${uid().slice(0, 6)}`);
  const take = await mkTake(admin, A.pid, 'cancelled-settlement ' + tag);
  const cl = await mkClash(admin, take, B.pid);
  return { cl, A, B };
}

/** Zero-ballot clash created through the real duel path. */
async function duelCase(tag) {
  const A = await mkUser(admin, `cd${tag}_a_${uid().slice(0, 6)}`);
  const B = await mkUser(admin, `cd${tag}_b_${uid().slice(0, 6)}`);
  const take = await mkTake(admin, A.pid, 'cancelled-duel ' + tag);
  const ch = await mkChallenge(admin, take, B.pid, A.pid);
  await asUser(admin, A.uid, () => q(admin, `select public.resolve_arena_challenge($1,'ACCEPT')`, [ch]));
  const cl = (await q(admin, `select clash_id from public.arena_challenges where id=$1`, [ch]))[0].clash_id;
  const isDuel = (await q(admin, `select duel_key is not null d from public.clashes where id=$1`, [cl]))[0].d;
  if (!isDuel) throw new Error('fixture error: expected a duel');
  await phaseDuel(admin, cl, 'closed');
  return { cl, A, B };
}

async function assertCancelled(tag, cl) {
  const before = await ledger(admin, cl);
  check(`${tag}: nothing is paid before settlement`, before.length === 0, `ledgerRows=${before.length}`);

  await q(admin, `select public.settle_clash($1)`, [cl]);

  const status = (await q(admin, `select status from public.clashes where id=$1`, [cl]))[0].status;
  const verdicts = (await q(admin, `select count(*)::int c from public.verdicts where clash_id=$1`, [cl]))[0].c;
  const after = await ledger(admin, cl);
  const rep = after.reduce((s, x) => s + x.rep, 0);
  const coins = after.reduce((s, x) => s + x.coins, 0);

  check(`${tag}: zero-ballot settlement cancels`, status === 'cancelled', `status=${status}`);
  check(`${tag}: no verdict is written`, verdicts === 0, `verdicts=${verdicts}`);
  check(`${tag}: nobody is paid`, rep === 0 && coins === 0 && after.length === 0,
    `rows=${after.length} rep=${rep} coins=${coins}`);

  // Repeat settlement must not create any award.
  await q(admin, `select public.settle_clash($1)`, [cl]).catch(() => {});
  const again = await ledger(admin, cl);
  const rep2 = again.reduce((s, x) => s + x.rep, 0);
  const st2 = (await q(admin, `select status from public.clashes where id=$1`, [cl]))[0].status;
  check(`${tag}: repeat settlement awards nothing`, rep2 === 0 && st2 === 'cancelled',
    `status=${st2} rep=${rep2}`);
}

await reset();

await assertCancelled('plain', (await plainCase('p')).cl);
await assertCancelled('duel', (await duelCase('d')).cl);

// A normal settled clash is still idempotent — the cancellation path must not
// have changed the ordinary reward behaviour.
{
  const A = await mkUser(admin, `cs_idem_a_${uid().slice(0, 6)}`);
  const B = await mkUser(admin, `cs_idem_b_${uid().slice(0, 6)}`);
  const J = await mkUser(admin, `cs_idem_j_${uid().slice(0, 6)}`);
  const take = await mkTake(admin, A.pid, 'idem');
  const cl = await mkClash(admin, take, B.pid);
  await q(admin, `insert into public.judgements(clash_id,juror_id,side) values ($1,$2,'A')`, [cl, J.pid]);
  for (let i = 0; i < 3; i++) await q(admin, `select public.settle_clash($1)`, [cl]);
  const l = await ledger(admin, cl);
  const rows = l.reduce((s, x) => s + x.n, 0);
  check('settled clash is idempotent on replay', rows === 2,
    `rows=${rows} (participation + win expected exactly once each)`);
}

const failed = results.filter((r) => !r.pass);
console.log(`TEST 1 — Cancelled-settlement invariant  [schema=${SCHEMA}]`);
console.log('');
for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`);
console.log('');
console.log(`  ${results.length - failed.length}/${results.length} assertions passed`);
await admin.end();
process.exit(failed.length ? 1 : 0);
