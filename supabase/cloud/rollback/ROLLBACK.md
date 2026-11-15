# ROLLBACK / RECOVERY — cloud deployment, project `kgaqejgubjemdecifzew`

The project started **empty and verifiably so** (0 public relations, 0 public
functions, 0 auth users, 0 buckets, no `supabase_migrations` schema). That fact
is the rollback strategy: recovery is *discard and recreate*, never surgical
repair of a half-applied chain.

Every tier below is manual and explicit. **Nothing is automatic.** A failed run
never triggers a rollback by itself — it stops and waits.

---

## T0 — Stop (default outcome of any failure)

1. Do not run anything else.
2. Write `STOP.txt` into the attempt folder: failed index, file, exit code, the
   first error line verbatim, and the psql log path.
3. Mark the failed file `NOT APPLIED` (its `-1` transaction rolled back) and every
   later file `NOT TESTED`.
4. Escalate for a decision. Do not retry, do not patch, do not edit a migration.

This is the correct outcome more often than not: an honest partial state with a
precise failure point is worth more than a repaired-looking database.

---

## T1 — Journal rollback (only with explicit authorization)

Undo ledger claims so the history reflects reality. The CLI deletes rows:

```powershell
# for each version recorded in the failed attempt's receipts:
supabase migration repair --status reverted <version> --db-url "<connection string>"
```

Consequences to state plainly:

- `--status reverted` **deletes** the row; the next `db push` will **re-run** that
  SQL.
- If you revert `20260927030000`, the next `db push` applies the **original**
  file 13 and installs pg_cron → schedules `clash-maintenance`. That is STOP
  condition S7. Never revert that version while the original file remains in
  `supabase/migrations/`.
- Reverting the four `realtime.messages` policy versions (83, 111) leaves
  policies without ledger rows → a replay fails with "already exists".

Safe use of T1: reduce the ledger to exactly what executed, on a database you
are about to discard anyway.

---

## T2 — Schema discard (recommended after any failure beyond T0/T1)

Because the database holds **no application data**, the clean recovery is to
throw the schema away rather than reverse-engineer a partial chain:

**Option A — delete and recreate the project (preferred).**
Guaranteed clean: no `auth.*` triggers, no extension residue, no orphaned
publication membership, and a ledger that cannot lie. Requires re-running the
pre-flight and provisioning project settings again.

> Destructive and irreversible. Requires explicit authorization. The package
> does not automate it and I have not touched the hosted project.

**Option B — in-place reset (only if recreation is impossible).**
Dropping `public` alone is **not** sufficient — it leaves behind:
`auth.users` triggers (`on_auth_user_created`), `supabase_realtime` publication
membership for dropped tables, the extension installs, and the ledger rows.
Any in-place reset must therefore drop, in order: publication membership →
`public` schema → ledger (`supabase_migrations.schema_migrations`) → the auth
trigger. That is a hand-written, error-prone sequence; prefer Option A.

**Never** attempt to "fix forward" by deleting a single policy, table or ledger
row so a re-run succeeds. That produces a database whose schema no longer
matches the migration history — the exact condition that makes `db push`
dangerous later.

---

## T3 — Evidence preservation

Rollback **never** deletes evidence. Failed attempt folders remain, with their
`STOP.txt`, receipts and logs, for as long as the project exists. A recreated
project starts a new `attempt-<n+1>`; earlier attempts stay on disk untouched.

---

## What rollback must never do

| Forbidden | Why |
|---|---|
| Editing a file under `supabase/migrations/` to make it apply | Destroys the single source of truth this package exists to protect |
| `migration repair --status applied` on a version whose SQL never ran | Falsifies the ledger — the exact failure mode `DIVERGENCES.md` guards against |
| Enabling `pg_cron` "to complete" file 13 | Schedules maintenance during testing; permanent hazard |
| Dropping RLS, disabling triggers, changing table ownership | Manufacturing a pass; also S12 |
| Deleting volumes/containers/evidence on the local stack | Out of scope for this project; protected environments are untouched by this package |
