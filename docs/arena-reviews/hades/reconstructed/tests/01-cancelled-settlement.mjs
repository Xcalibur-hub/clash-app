/**
 * TEST 1 — Settlement ledger contract.
 *
 * PROPERTY: settlement pays the people it is supposed to pay, exactly once, and
 * a zero-ballot Clash is CANCELLED and pays nobody.
 *
 * The ledger shape depends on which reward schema is installed, so the test
 * detects the capability from the catalog instead of assuming one shape:
 *
 *   canonical schema   — only the three historical juror kinds exist. A settled
 *                        Clash carries juror rows only.
 *   fighter-rewards    — `clash_fighter_win` / `clash_fighter_participation`
 *                        exist. A settled Clash carries the juror rows AND one
 *                        row per fighter.
 *
 * The assertions below pin the exact kinds, the exact actor for each kind, the
 * resulting reputation totals, and the zero-coin fighter rule. They do not
 * merely count rows: a row count cannot tell a double-paid juror from a
 * correctly paid fighter.
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

/**
 * Capability detection: does this database carry the fighter reward vocabulary?
 * Purely structural — no settlement is attempted, so the probe cannot influence
 * any later assertion. Used to decide which ledger contract is in force.
 */
const FIGHTER = (await q(admin, `
  select exists(
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'reputation_kind' and e.enumlabel = 'clash_fighter_win'
  ) as present`))[0].present;
const CONTRACT = FIGHTER ? 'fighter-rewards' : 'canonical';

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

// ── Settled ledger: exact kinds, actors, reputation totals, fighter coins ────
{
  const A = await mkUser(admin, `cs_idem_a_${uid().slice(0, 6)}`);
  const B = await mkUser(admin, `cs_idem_b_${uid().slice(0, 6)}`);
  const J = await mkUser(admin, `cs_idem_j_${uid().slice(0, 6)}`);
  const take = await mkTake(admin, A.pid, 'idem');
  const cl = await mkClash(admin, take, B.pid);
  // One ballot for side A: the author's side wins, so the juror agrees.
  await q(admin, `insert into public.judgements(clash_id,juror_id,side) values ($1,$2,'A')`, [cl, J.pid]);

  // Replay settlement three times: every assertion below must hold on the exact
  // set of rows produced once, which is also the idempotency proof.
  for (let i = 0; i < 3; i++) await q(admin, `select public.settle_clash($1)`, [cl]);

  const rows = await q(admin, `
    select kind::text kind, profile_id, reputation_delta rep, coins_delta coins
      from public.reputation_events where clash_id=$1
     order by kind::text, profile_id`, [cl]);
  const kinds = rows.map((r) => r.kind);
  const verdicts = (await q(admin, `select count(*)::int c from public.verdicts where clash_id=$1`, [cl]))[0].c;
  const status = (await q(admin, `select status from public.clashes where id=$1`, [cl]))[0].status;
  const prof = Object.fromEntries((await q(admin,
    `select id, reputation, coins, streak from public.profiles where id = any($1)`,
    [[A.pid, B.pid, J.pid]])).map((r) => [r.id, r]));

  // A settled Clash is settled once, with one verdict, labelled above.
  check(`settled: reaches settled with one verdict`,
    status === 'settled' && verdicts === 1, `contract=${CONTRACT} status=${status} verdicts=${verdicts}`);

  if (!FIGHTER) {
    // ── canonical schema: juror-only ledger ──────────────────────────────────
    check('canonical: ledger holds exactly the juror participation + win kinds',
      JSON.stringify(kinds) === JSON.stringify(['clash_participation', 'clash_win']),
      `kinds=${JSON.stringify(kinds)}`);

    const part = rows.find((r) => r.kind === 'clash_participation');
    const win = rows.find((r) => r.kind === 'clash_win');
    check('canonical: both rows belong to the single juror',
      part && win && part.profile_id === J.pid && win.profile_id === J.pid,
      `actors=${JSON.stringify(rows.map((r) => r.profile_id === J.pid ? 'juror' : 'other'))}`);
    check('canonical: juror participation +15 / win +105+40 coins',
      part && part.rep === 15 && part.coins === 0 && win && win.rep === 105 && win.coins === 40,
      `participation=${part && part.rep}/${part && part.coins} win=${win && win.rep}/${win && win.coins}`);

    // No fighter row can exist in this schema, so the fighter rule is vacuous —
    // assert the zero-coin property over the whole settled ledger instead.
    check('canonical: no fighter rows exist on a settled clash',
      !kinds.some((k) => k.startsWith('clash_fighter')),
      `kinds=${JSON.stringify(kinds)}`);

    check('canonical: juror holds +120 rep / +40 coins / streak 1',
      prof[J.pid].reputation === 120 && prof[J.pid].coins === 40 && prof[J.pid].streak === 1,
      `juror=${prof[J.pid].reputation}/${prof[J.pid].coins}/${prof[J.pid].streak}`);
    check('canonical: fighters are untouched by settlement',
      prof[A.pid].reputation === 0 && prof[A.pid].coins === 0 &&
      prof[B.pid].reputation === 0 && prof[B.pid].coins === 0,
      `author=${prof[A.pid].reputation}/${prof[A.pid].coins} challenger=${prof[B.pid].reputation}/${prof[B.pid].coins}`);
  } else {
    // ── fighter-rewards schema: juror rows + one row per fighter ────────────
    check('fighter-rewards: ledger holds the juror kinds and one fighter row per fighter',
      JSON.stringify(kinds) === JSON.stringify([
        'clash_fighter_participation', 'clash_fighter_win', 'clash_participation', 'clash_win']),
      `kinds=${JSON.stringify(kinds)}`);

    const fwin = rows.find((r) => r.kind === 'clash_fighter_win');
    const fpart = rows.find((r) => r.kind === 'clash_fighter_participation');
    const part = rows.find((r) => r.kind === 'clash_participation');
    const win = rows.find((r) => r.kind === 'clash_win');

    // Actor identity is the crux: side A is the take author, side B the challenger.
    check('fighter-rewards: side-A winner is credited clash_fighter_win',
      fwin && fwin.profile_id === A.pid && fwin.rep === 40 && fwin.coins === 0,
      `actor=${fwin && (fwin.profile_id === A.pid ? 'author' : 'WRONG')} rep=${fwin && fwin.rep} coins=${fwin && fwin.coins}`);
    check('fighter-rewards: side-B loser is credited clash_fighter_participation',
      fpart && fpart.profile_id === B.pid && fpart.rep === 15 && fpart.coins === 0,
      `actor=${fpart && (fpart.profile_id === B.pid ? 'challenger' : 'WRONG')} rep=${fpart && fpart.rep} coins=${fpart && fpart.coins}`);

    // Juror economy must be byte-identical to canonical.
    check('fighter-rewards: juror rows are unchanged by fighter rewards',
      part && part.profile_id === J.pid && part.rep === 15 && part.coins === 0 &&
      win && win.profile_id === J.pid && win.rep === 105 && win.coins === 40,
      `participation=${part && part.rep}/${part && part.coins} win=${win && win.rep}/${win && win.coins}`);

    check('fighter-rewards: fighters are paid zero coins',
      rows.filter((r) => r.kind.startsWith('clash_fighter')).every((r) => r.coins === 0),
      `fighterCoins=${JSON.stringify(rows.filter((r) => r.kind.startsWith('clash_fighter')).map((r) => r.coins))}`);

    // Exact reputation totals, read back from profiles, not recomputed from rows.
    check('fighter-rewards: winner holds +40 rep / 0 coins / streak 0',
      prof[A.pid].reputation === 40 && prof[A.pid].coins === 0 && prof[A.pid].streak === 0,
      `author=${prof[A.pid].reputation}/${prof[A.pid].coins}/${prof[A.pid].streak}`);
    check('fighter-rewards: loser holds +15 rep / 0 coins / streak 0',
      prof[B.pid].reputation === 15 && prof[B.pid].coins === 0 && prof[B.pid].streak === 0,
      `challenger=${prof[B.pid].reputation}/${prof[B.pid].coins}/${prof[B.pid].streak}`);
    check('fighter-rewards: juror still holds +120 rep / +40 coins / streak 1',
      prof[J.pid].reputation === 120 && prof[J.pid].coins === 40 && prof[J.pid].streak === 1,
      `juror=${prof[J.pid].reputation}/${prof[J.pid].coins}/${prof[J.pid].streak}`);
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`TEST 1 — Settlement ledger contract  [schema=${SCHEMA}, contract=${CONTRACT}]`);
console.log('');
for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`);
console.log('');
console.log(`  ${results.length - failed.length}/${results.length} assertions passed`);
await admin.end();
process.exit(failed.length ? 1 : 0);
