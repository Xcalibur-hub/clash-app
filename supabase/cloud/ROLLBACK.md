# ROLLBACK / RECOVERY

The project starts **verifiably empty** (0 public relations, 0 public functions,
0 auth users, 0 buckets, no `supabase_migrations` schema). There is no application
data to preserve, which is why the only sanctioned outcomes are "stop" and
"recreate": this package never repairs a partially applied database.

Deployment is **fresh-only** and has **no automated resume**. A run that stops
part-way leaves work for a human, and the evidence directory is the input to that
decision.

---

## T0 — Stop (the default outcome of any failure)

`deploy.ps1` already does this: on a failed gate, failed wrapper, mismatched
read-back or exception it writes `STOP.json` / `STOP.txt`, prints the sanitised
reason, seals the evidence directory and exits 1. It never retries, never
repairs, and never overwrites an earlier attempt.

Because every wrapper is **one transaction containing both the migration and its
ledger row**, a *proven* rollback leaves a self-consistent state: that version is
absent from both the schema and the ledger, and every earlier version is present
in both. There is nothing to clean up and nothing to hand-repair.

### T0.1 — Read the outcome before deciding anything

The runner records one of `COMMITTED`, `ROLLED_BACK_PROVEN`, `LEDGER_MISMATCH` or
`UNKNOWN`. Only `COMMITTED` and `ROLLED_BACK_PROVEN` are answers:

* `COMMITTED` — the ledger row **is** present with the expected token. The
  transaction committed, whatever the exit code said afterwards. **Do not re-run
  it.** Confirm with `check-ledger.ps1`.
* `ROLLED_BACK_PROVEN` — psql exited **3** (script error under `ON_ERROR_STOP`, so
  the `COMMIT` that ends the wrapper was never reached) **and** a fresh session
  showed the row absent. The version is genuinely not applied.
* `LEDGER_MISMATCH` — a row exists with an identity the manifest does not
  describe. Human decision required.
* `UNKNOWN` — the commit outcome is **not** established. This covers connection
  loss (psql exit 2), a timeout, a launch failure, incomplete output capture and
  an unreadable probe. A missing ledger row in these states proves nothing: the
  original backend may still commit. Do not assume success and do not assume
  rollback.

Round 8 removed the previous claim that an absent row after *any* failure is a
proven rollback. It is not: absence observed from a new session says nothing
about a backend that is still running or whose connection died mid-commit.

## T1 — There is no resume

`deploy.ps1` is **fresh-only**. It requires an empty ledger, refuses a non-empty
one, and has no start index, no skip-a-proven-prefix path, no backfill and no
retry. The earlier resume design could never run: the fresh-baseline preflight
rejects any project that already has application objects, so a partially applied
database failed that gate before the prefix proof was reached. Rather than keep a
path that cannot work, it was removed.

Consequences for an interrupted run:

1. Everything the runner did is still auditable — `evidence/<stamp>-attempt-1/`
   holds one receipt per phase, sealed by hash chain.
2. The database is in a partially applied state. The runner will refuse to touch
   it, by design.
3. Recovery is a **decision for a human**: either recreate the project (T2) or
   have an authorised operator finish the remaining versions by hand, outside this
   package, and then reconcile the ledger under review. Nothing in this package
   automates that, and no report from this package should be read as authorising
   it.

### T1.1 — A stale exclusive-writer claim

Before the first migration the runner inserts one row into
`supabase_migrations.clash_deploy_claim` (primary key `claim_key`, value
`clash-cloud-deploy`). A second runner started at the same time collides on that
key, receives SQLSTATE `23505`, and stops before executing anything. The claim is
deleted only after postflight passes.

A crashed run therefore leaves a claim behind, and the next run stops with
`03c-writer-claim-stop.json`. That is deliberate: it forces someone to look at the
evidence before reusing the project. Clearing it is a manual, reviewed action:

```sql
-- Only after the evidence for the abandoned run has been read and the database
-- state is understood. This deletes a coordination row, nothing else.
delete from supabase_migrations.clash_deploy_claim where claim_key = 'clash-cloud-deploy';
```

## T2 — Discard and recreate (after any doubt)

If the ledger and schema ever disagree in a way T1 cannot prove, do not
reconcile by hand. Delete the project and recreate it, then re-run
`check-manifest.ps1` → `deploy.ps1`.

> Destructive and irreversible. Requires explicit authorization. Nothing in this
> package automates it.

An in-place reset is **not** equivalent: dropping `public` alone leaves
`auth.users` triggers, `supabase_realtime` publication membership, the extension
installs and the ledger rows behind. Those must all be removed, in a specific
order, which is why recreation is preferred.

## T3 — Journal rollback (last resort, high risk)

```powershell
supabase migration repair --status reverted <version> --db-url "..."
```

`--status reverted` **deletes** the row, so the next `db push` **re-runs** that
SQL. Consequences:

- Reverting `20260927030000` re-arms the original scheduler: the next push
  installs pg_cron and schedules `clash-maintenance` every minute. This is STOP
  condition S10 and must never be done while the original file 13 exists.
- Reverting a version whose policies already exist produces "already exists" on
  replay.

Use T2 instead unless a reviewer explicitly asks for journal surgery.

## T4 — Evidence is never deleted

Failed attempts keep their `STOP.txt`, per-file receipts, stdout/stderr and
read-back logs. A successful retry creates `attempt-<n+1>`; earlier attempts are
left untouched forever.

---

## Forbidden

| Never | Why |
|---|---|
| Editing a file under `supabase/migrations/` to make it apply | Destroys the single source of truth `checksums.sha256` protects |
| Writing a ledger row for SQL that did not execute | The exact failure D-1 and `90_verify.sql` check 6 exist to catch |
| Re-running a wrapper to "see if it passes now" | Non-idempotent DDL; `on conflict do nothing` on the ledger row does not make the schema statements idempotent |
| Enabling pg_cron to "complete" file 13 | Schedules maintenance during testing |
| Dropping RLS, disabling triggers, changing table/extension ownership | S11 — manufacturing a pass |
| Hand-editing `checksums.sha256` | Rebuild with `node tools/build-package.mjs` instead |
