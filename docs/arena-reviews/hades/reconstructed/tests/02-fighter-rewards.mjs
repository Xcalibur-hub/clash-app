/**
 * TEST 2 — Fighter reward accounting.
 *
 * PROPERTY: once the fighter-reward candidate patch is applied, settlement pays
 *    win  +40 reputation, 0 coins
 *    loss +15 reputation, 0 coins
 *    draw +15 each,      0 coins
 *    cancelled: nobody
 *   and every juror award is UNCHANGED by the patch.
 *
 * The expected values are produced by an INDEPENDENT reference calculator below,
 * written from the policy text, never read back out of the database.
 *
 * Usage:
 *   node tests/02-fighter-rewards.mjs --schema=baseline   (patch NOT applied)
 *   node tests/02-fighter-rewards.mjs --schema=patched    (patch applied)
 */
import { conn, q, reset, mkUser, mkTake, mkClash, ledger, totals, uid } from '../harness.mjs';

const SCHEMA = (process.argv.find((a) => a.startsWith('--schema=')) || '--schema=patched').split('=')[1];
const PATCHED = SCHEMA === 'patched';

const admin = await conn();
const results = [];
const check = (n, p, d) => { results.push({ name: n, pass: p, detail: d }); };

// ── INDEPENDENT REFERENCE CALCULATOR (policy text -> expected multiset) ────
function reference(ballots, authorPid, challengerPid) {
  const a = ballots.filter((b) => b.side === 'A').length;
  const b = ballots.filter((x) => x.side === 'B').length;
  const total = a + b;
  if (total === 0) return { outcome: 'CANCELLED', rows: [] };

  const winner = a > b ? 'A' : b > a ? 'B' : 'DRAW';
  const rows = [];
  for (const v of ballots) {
    rows.push({ pid: v.pid, kind: 'clash_participation', rep: 15, coins: 0 });
    if (winner === 'DRAW') continue;
    if (v.side === winner) rows.push({ pid: v.pid, kind: 'clash_win', rep: 105, coins: 40 });
    else rows.push({ pid: v.pid, kind: 'clash_dissent', rep: 10, coins: 18 });
  }
  if (PATCHED) {
    const f = (pid, won) => ({
      pid, kind: won ? 'clash_fighter_win' : 'clash_fighter_participation',
      rep: won ? 40 : 15, coins: 0,
    });
    if (winner === 'DRAW') {
      rows.push({ pid: authorPid, kind: 'clash_fighter_participation', rep: 15, coins: 0 });
      rows.push({ pid: challengerPid, kind: 'clash_fighter_participation', rep: 15, coins: 0 });
    } else {
      rows.push(f(authorPid, winner === 'A'));
      rows.push(f(challengerPid, winner === 'B'));
    }
  }
  return { outcome: winner, rows };
}

async function settleCase(tag, sides) {
  const A = await mkUser(admin, `fr${tag}_a_${uid().slice(0, 6)}`);
  const B = await mkUser(admin, `fr${tag}_b_${uid().slice(0, 6)}`);
  const jurors = [];
  for (let i = 0; i < sides.length; i++) jurors.push(await mkUser(admin, `fr${tag}_j${i}_${uid().slice(0, 6)}`));

  const take = await mkTake(admin, A.pid, 'fighter ' + tag);
  const cl = await mkClash(admin, take, B.pid);
  const ballots = [];
  for (let i = 0; i < sides.length; i++) {
    ballots.push({ pid: jurors[i].pid, side: sides[i] });
    await q(admin, `insert into public.judgements(clash_id,juror_id,side) values ($1,$2,$3::public.clash_side)`,
      [cl, jurors[i].pid, sides[i]]);
  }

  const before = new Map();
  for (const p of [A, B, ...jurors]) {
    before.set(p.pid, (await q(admin, `select reputation,coins,streak from public.profiles where id=$1`, [p.pid]))[0]);
  }

  await q(admin, `select public.settle_clash($1)`, [cl]);
  await q(admin, `select public.settle_clash($1)`, [cl]);   // replay must not double-pay

  const ref = reference(ballots, A.pid, B.pid);
  const rows = await q(admin, `select profile_id, kind::text kind, reputation_delta rep, coins_delta coins
                                 from public.reputation_events where clash_id=$1`, [cl]);
  const status = (await q(admin, `select status from public.clashes where id=$1`, [cl]))[0].status;

  const key = (r) => `${r.profile_id || r.pid}|${r.kind}|${r.rep}|${r.coins}`;
  const got = rows.map(key).sort();
  const want = ref.rows.map(key).sort();
  const match = JSON.stringify(got) === JSON.stringify(want);
  const missing = want.filter((x) => !got.includes(x));
  const extra = got.filter((x) => !want.includes(x));

  check(`${tag} (${sides.join('')}): ledger matches reference`,
    match, match ? `${rows.length} rows exact` :
      `missing=[${missing.join(', ')}] extra=[${extra.join(', ')}]`);

  // per-actor deltas must equal the reference
  const exp = new Map();
  for (const r of ref.rows) {
    const c = exp.get(r.pid) || { rep: 0, coins: 0 }; c.rep += r.rep; c.coins += r.coins; exp.set(r.pid, c);
  }
  let deltaOk = true, detail = [];
  for (const [pid, e] of exp) {
    const b = before.get(pid);
    const a = (await q(admin, `select reputation,coins from public.profiles where id=$1`, [pid]))[0];
    if (a.reputation - b.reputation !== e.rep || a.coins - b.coins !== e.coins) {
      deltaOk = false;
      detail.push(`${pid}: +${a.reputation - b.reputation}/${e.rep} rep, +${a.coins - b.coins}/${e.coins} coins`);
    }
  }
  check(`${tag}: per-actor profile deltas correct`, deltaOk, deltaOk ? 'all match' : detail.join('; '));
  return { status, rows };
}

await reset();

const win = await settleCase('win', ['A', 'A', 'B']);       // A wins 2-1
const loss = await settleCase('loss', ['B', 'B', 'A']);     // B wins 2-1
const draw = await settleCase('draw', ['A', 'B']);          // 1-1 draw
const cancel = await settleCase('cancel', []);              // no ballots

check('cancelled clash pays nobody', cancel.status === 'cancelled' && cancel.rows.length === 0,
  `status=${cancel.status} rows=${cancel.rows.length}`);

// Fighter awards are for CLASHES generally (the patch keys off the verdict, not duel_key).
if (PATCHED) {
  const fw = win.rows.filter((r) => r.kind.startsWith('clash_fighter'));
  check('winner paid +40 and loser +15', fw.length === 2 && fw.some((r) => r.rep === 40) && fw.some((r) => r.rep === 15),
    fw.map((r) => `${r.kind}:${r.rep}`).join(' '));
  check('fighters receive zero coins', fw.every((r) => r.coins === 0),
    'coins=' + fw.map((r) => r.coins).join(','));
  const dr = draw.rows.filter((r) => r.kind.startsWith('clash_fighter'));
  check('draw pays +15 to each fighter', dr.length === 2 && dr.every((r) => r.rep === 15 && r.coins === 0),
    dr.map((r) => `${r.kind}:${r.rep}/${r.coins}`).join(' '));
  check('cancelled pays no fighter', cancel.rows.filter((r) => r.kind.startsWith('clash_fighter')).length === 0, 'none');
} else {
  const any = [...win.rows, ...draw.rows].filter((r) => r.kind.startsWith('clash_fighter'));
  check('baseline has NO fighter reward kinds', any.length === 0, `fighterRows=${any.length}`);
}

// Juror economy must be identical on both schemas. The expected value is
// DERIVED from the reference calculator, never hardcoded: two winning jurors at
// (15 participation + 105 win) and one dissenter at (15 + 10) = 265 rep, 98 coins.
{
  const refJurorRows = [
    { rep: 15, coins: 0 }, { rep: 105, coins: 40 },   // winning juror 1
    { rep: 15, coins: 0 }, { rep: 105, coins: 40 },   // winning juror 2
    { rep: 15, coins: 0 }, { rep: 10, coins: 18 },    // dissenter
  ];
  const expRep = refJurorRows.reduce((s, r) => s + r.rep, 0);
  const expCoins = refJurorRows.reduce((s, r) => s + r.coins, 0);
  const gotJuror = win.rows.filter((r) => !r.kind.startsWith('clash_fighter'));
  const jurorRep = gotJuror.reduce((s, r) => s + r.rep, 0);
  const jurorCoins = gotJuror.reduce((s, r) => s + r.coins, 0);
  check('juror economy unchanged by the patch', jurorRep === expRep && jurorCoins === expCoins,
    `jurorRep=${jurorRep}/${expRep} jurorCoins=${jurorCoins}/${expCoins}`);
}

// ── report ───────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
console.log(`TEST 2 — Fighter reward accounting  [schema=${SCHEMA}]`);
console.log('');
for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`);
console.log('');
console.log(`  ${results.length - failed.length}/${results.length} assertions passed`);
await admin.end();
process.exit(failed.length ? 1 : 0);
