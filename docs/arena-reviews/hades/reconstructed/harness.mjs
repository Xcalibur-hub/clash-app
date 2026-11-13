/**
 * HADES (reconstructed) — shared fixtures and impersonation helpers.
 *
 * RECONSTRUCTED, NOT ORIGINAL. Written fresh for this package. It recreates the
 * fixture shapes needed by the four prioritised tests; it is not a copy of the
 * lost harness.
 *
 * Every fixture is fictional and generated per run. Nothing touches a real system.
 */
import pg from 'pg';

export const CFG = {
  // Point at your disposable instance. PGHOST may be a unix-socket directory or a
  // hostname; PGPORT/PGUSER/PGDATABASE are honoured by the pg driver defaults.
  host: process.env.PGHOST || '/tmp/hades-pg',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'postgres',
};

export async function conn() {
  const c = new pg.Client(CFG);
  await c.connect();
  return c;
}

export const q = async (c, sql, p) => (await c.query(sql, p)).rows;

/** Wipe data (not code). Used only between independent test scenarios. */
export async function reset() {
  const c = await conn();
  const t = (await q(c, `select tablename from pg_tables where schemaname='public'`)).map((r) => r.tablename);
  for (const tn of t) { try { await c.query(`truncate table public."${tn}" cascade`); } catch {} }
  try { await c.query('truncate table auth.users cascade'); } catch {}
  await c.end();
}

export const uid = () => crypto.randomUUID();

/** Create a fictional user. Handle is unique per call. */
export async function mkUser(c, handle) {
  await c.query('reset role');
  await c.query(`select set_config('request.jwt.claims','{}',false)`);
  const authId = (await q(c, `insert into auth.users(id) values ($1) returning id`, [uid()]))[0].id;
  const r = await q(c, `update public.profiles
      set handle=$1, name=$1, reputation=0, coins=0, streak=0, rank=public.rank_for_rep(0)
      where auth_user_id=$2 returning id`, [handle, authId]);
  if (!r.length) throw new Error('no profile row for ' + handle);
  return { uid: authId, pid: r[0].id };
}

export async function mkTake(c, pid, text = 'take') {
  await c.query('reset role');
  await c.query(`select set_config('request.jwt.claims','{}',false)`);
  const id = 'tk_' + uid().slice(0, 12);
  await c.query(`insert into public.takes(id, author_id, hood, text, status, expires_at)
                 values ($1,$2,'techtakes',$3,'active', now() + interval '24 hours')`, [id, pid, text]);
  return id;
}

/** A clash with no duel_key: the shape that matters for the cancelled-settlement bug. */
export async function mkClash(c, takeId, challengerId, { opens = -60, closes = -5 } = {}) {
  await c.query('reset role');
  await c.query(`select set_config('request.jwt.claims','{}',false)`);
  const id = 'cl_' + uid().slice(0, 12);
  await c.query(`insert into public.clashes(id, take_id, challenger_id, status, opens_at, closes_at)
                 values ($1,$2,$3,'open', now() + ($4 || ' minutes')::interval,
                                          now() + ($5 || ' minutes')::interval)`,
    [id, takeId, challengerId, String(opens), String(closes)]);
  return id;
}

export async function mkChallenge(c, takeId, challengerId, authorId) {
  await c.query('reset role');
  await c.query(`select set_config('request.jwt.claims','{}',false)`);
  return (await q(c, `insert into public.arena_challenges
      (id, take_id, challenger_id, challenged_id, counter_position, status, expires_at)
      values (gen_random_uuid(),$1,$2,$3,
              'A substantive counter position used only for local verification',
              'PENDING', now() + interval '20 minutes')
      returning id`, [takeId, challengerId, authorId]))[0].id;
}

/** Run fn as an authenticated client derived from a verified-claims subject. */
export async function asUser(c, authUid, fn) {
  await c.query('reset role');
  await c.query(`select set_config('request.jwt.claims',$1,false)`,
    [JSON.stringify({ sub: authUid, role: 'authenticated' })]);
  await c.query('set role authenticated');
  try { return await fn(); }
  finally {
    await c.query('reset role');
    await c.query(`select set_config('request.jwt.claims','{}',false)`);
  }
}

export async function asAnon(c, fn) {
  await c.query('reset role');
  await c.query(`set role anon`);
  try { return await fn(); }
  finally { await c.query('reset role'); }
}

/** Move a duel (clash + room + topic) into a phase, in ONE statement. */
export async function phaseDuel(c, clashId, phase) {
  const t = phase === 'judging'
    ? { o: -30, fa: -10, j: -5, cl: +10 }
    : { o: -40, fa: -20, j: -15, cl: -1 };
  const iv = (m) => `(now() + (${m} || ' minutes')::interval)`;
  await q(c, `
    with tgt as (select c.id cid, r.id rid, r.topic_id tid from public.clashes c
                   join public.arena_rooms r on r.clash_id = c.id where c.id = $1),
    u1 as (update public.clashes set opens_at=${iv(t.o)}, closes_at=${iv(t.cl)}
             where id in (select cid from tgt) returning 1),
    u2 as (update public.arena_rooms set opens_at=${iv(t.o)}, closes_at=${iv(t.cl)}
             where id in (select rid from tgt) returning 1),
    u3 as (update public.arena_daily_topics set opens_at=${iv(t.o)},
             final_arguments_at=${iv(t.fa)}, judging_at=${iv(t.j)},
             closes_at=${iv(t.cl)} where id in (select tid from tgt) returning 1)
    select 1`, [clashId]);
}

export const ledger = (c, clashId) => q(c, `
  select kind::text, count(*)::int n,
         coalesce(sum(reputation_delta),0)::int rep,
         coalesce(sum(coins_delta),0)::int coins
    from public.reputation_events where clash_id=$1 group by 1 order by 1`, [clashId]);

export const totals = (c, pids) => q(c, `
  select handle, reputation, coins, streak from public.profiles
   where id = any($1) order by handle`, [pids]);
